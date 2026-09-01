// Puxa GET /api/dashboard/service-orders da Electrolux (Basic Auth via
// secrets desta function, nunca no frontend) e faz upsert em
// external_appointments por (origin, external_id) — chave idempotente.
// Nunca escreve em appointments/service_orders nativas. Agendada via
// Supabase Cron a cada 10min (mesma cadência do cron interno da Electrolux).
import { createClient } from "npm:@supabase/supabase-js@2";
import { mapOrderToRow, resolveConcludedAt, type ElectroluxOrder } from "../_shared/electrolux.ts";
import { matchOrCreateTechnician } from "../_shared/technicianMatch.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELECTROLUX_API_URL = Deno.env.get("ELECTROLUX_API_URL")!;
const ELECTROLUX_API_USER = Deno.env.get("ELECTROLUX_API_USER")!;
const ELECTROLUX_API_PASSWORD = Deno.env.get("ELECTROLUX_API_PASSWORD")!;
// profiles é escopado por RLS via user_companies — sem isso, um técnico
// provisório criado pelo sync existe no banco mas fica invisível em
// qualquer tela carregada pela sessão de um usuário normal.
const ELECTROLUX_DEFAULT_COMPANY_ID = Deno.env.get("ELECTROLUX_DEFAULT_COMPANY_ID") || null;
// Deploy com --no-verify-jwt (o chamador é o pg_cron, não um usuário
// VoxAssist com sessão) -- a autenticação real é este token, guardado
// só no Supabase Vault e nunca em texto aberto em cron.job (ver
// electrolux_connections_20260901_security_hardening). Sem isso a
// function ficava disparável publicamente por qualquer um com a URL.
const SYNC_SERVICE_TOKEN = Deno.env.get("ELECTROLUX_SYNC_SERVICE_TOKEN");

type ExistingRow = {
  id: string;
  external_id: string;
  status: string;
  technician_id: string | null;
  appointment_date: string | null;
  period: string | null;
  concluded_at: string | null;
  nps_missing_count: number;
  nps_missing_since: string | null;
  nps_closed_inferred_at: string | null;
  company_id: string | null;
  connection_id: string | null;
};

type ElectroluxConnection = { id: string; filial: "VITORIA" | "SERRA" };

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!SYNC_SERVICE_TOKEN || token !== SYNC_SERVICE_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startedAt = new Date().toISOString();
  let processed = 0;
  let defaultConnectionId: string | null = null;
  const basicAuth = "Basic " + btoa(`${ELECTROLUX_API_USER}:${ELECTROLUX_API_PASSWORD}`);

  try {
    // Carimba qual conexão Electrolux sincronizou cada atendimento --
    // rastreabilidade pra quando existir mais de uma (ver
    // electrolux_connections_20260831.sql). Hoje só existe Serra, então
    // defaultConnection cobre todos os registros; sem ambiguidade
    // enquanto for a única conexão ativa.
    const { data: connectionsRaw } = await supabase.from("electrolux_connections").select("id, filial").eq("active", true);
    const connections = (connectionsRaw || []) as ElectroluxConnection[];
    const defaultConnection = connections.length === 1 ? connections[0] : null;
    defaultConnectionId = defaultConnection?.id ?? null;

    const res = await fetch(`${ELECTROLUX_API_URL}/api/dashboard/service-orders`, {
      headers: { Authorization: basicAuth },
    });
    if (!res.ok) throw new Error(`Electrolux respondeu HTTP ${res.status}`);
    const orders = (await res.json()) as ElectroluxOrder[];

    const { data: existingRowsRaw } = await supabase
      .from("external_appointments")
      .select("id, external_id, status, technician_id, appointment_date, period, concluded_at, nps_missing_count, nps_missing_since, nps_closed_inferred_at, company_id, connection_id")
      .eq("origin", "ELECTROLUX");
    const existingRows = (existingRowsRaw || []) as ExistingRow[];
    const existingById = new Map(existingRows.map((r) => [r.external_id, r]));
    const seenIds = new Set<string>();

    for (const order of orders) {
      seenIds.add(order.id);
      const row = mapOrderToRow(order);
      const existing = existingById.get(order.id);

      const technicianId = await matchOrCreateTechnician(supabase, {
        externalTechnicianId: order.technicianExternalId,
        candidateName: order.technicianName,
        defaultCompanyId: ELECTROLUX_DEFAULT_COMPANY_ID,
      });

      const upsertRow = {
        ...row,
        technician_id: technicianId ?? existing?.technician_id ?? null,
        // external_appointments é escopado por RLS via company_id (ver
        // electrolux_company_isolation_fix_20260828.sql) — sem isso, o
        // registro ficava com company_id null e invisível em qualquer
        // sessão de usuário normal, ou pior, ficava visível pra todas as
        // empresas ao mesmo tempo antes desse fix existir.
        company_id: existing?.company_id ?? ELECTROLUX_DEFAULT_COMPANY_ID,
        connection_id: existing?.connection_id ?? defaultConnection?.id ?? null,
        concluded_at: resolveConcludedAt(row.status, existing?.concluded_at),
        // Se voltou a aparecer, qualquer inferência de encerramento por
        // ausência é cancelada. O histórico do atendimento é preservado.
        nps_missing_count: 0,
        nps_missing_since: null,
        nps_closed_inferred_at: null,
      };

      const { data: saved, error } = await supabase
        .from("external_appointments")
        .upsert(upsertRow, { onConflict: "origin,external_id" })
        .select("id")
        .single();

      if (error || !saved) continue;
      processed++;

      if (existing) {
        const changed =
          existing.status !== upsertRow.status ||
          String(existing.technician_id) !== String(upsertRow.technician_id) ||
          existing.appointment_date !== upsertRow.appointment_date ||
          existing.period !== upsertRow.period;
        if (changed) {
          await supabase.from("external_appointment_history").insert({
            external_appointment_id: saved.id,
            action: "SYNC_ATUALIZOU",
            previous_data: {
              status: existing.status,
              technician_id: existing.technician_id,
              appointment_date: existing.appointment_date,
              period: existing.period,
            },
            new_data: {
              status: upsertRow.status,
              technician_id: upsertRow.technician_id,
              appointment_date: upsertRow.appointment_date,
              period: upsertRow.period,
            },
          });
        }
      } else {
        await supabase.from("external_appointment_history").insert({
          external_appointment_id: saved.id,
          action: "SYNC_CRIOU",
          previous_data: {},
          new_data: upsertRow,
        });
      }
    }

    // A Electrolux exclui Encerrada/Cancelada da listagem, então "sumir da
    // lista" é ambíguo. Busca o detalhe real antes de decidir em vez de
    // adivinhar (e nunca apaga o registro — só atualiza o status).
    for (const existing of existingRows) {
      if (seenIds.has(existing.external_id)) continue;
      if (existing.status === "CANCELADO") continue;

      // Regra provisória de homologação do NPS: um atendimento que já foi
      // visto como CONCLUIDO é considerado encerrado somente depois de
      // desaparecer em duas sincronizações completas e bem-sucedidas.
      if (existing.status === "CONCLUIDO") {
        const now = new Date().toISOString();
        const missingCount = Number(existing.nps_missing_count || 0) + 1;
        const closedInferredAt = missingCount >= 2
          ? (existing.nps_closed_inferred_at || now)
          : null;

        await supabase.from("external_appointments").update({
          nps_missing_count: missingCount,
          nps_missing_since: existing.nps_missing_since || now,
          nps_closed_inferred_at: closedInferredAt,
          last_synced_at: now,
        }).eq("id", existing.id);

        await supabase.from("external_appointment_history").insert({
          external_appointment_id: existing.id,
          action: missingCount >= 2 ? "NPS_ENCERRAMENTO_CONFIRMADO_POR_AUSENCIA" : "NPS_PRIMEIRA_AUSENCIA",
          previous_data: { nps_missing_count: existing.nps_missing_count || 0 },
          new_data: { nps_missing_count: missingCount, nps_closed_inferred_at: closedInferredAt },
        });
        continue;
      }

      let resolvedStatus: "CANCELADO" | "CONCLUIDO" = "CONCLUIDO";
      try {
        const detailRes = await fetch(
          `${ELECTROLUX_API_URL}/api/dashboard/service-orders/${existing.external_id}`,
          { headers: { Authorization: basicAuth } }
        );
        if (detailRes.ok) {
          const detail = await detailRes.json();
          if (detail.status === "Cancelada") resolvedStatus = "CANCELADO";
        }
      } catch {
        // Sem detalhe agora: assume concluído (libera a ocupação da agenda
        // sem apagar histórico) — se estiver errado, o próximo ciclo não
        // revisita porque o status deixou de ser ABERTO/AGENDADO. Aceitável
        // porque o pedido já saiu da lista ativa da Electrolux de qualquer forma.
      }

      await supabase
        .from("external_appointments")
        .update({
          status: resolvedStatus,
          concluded_at: resolveConcludedAt(resolvedStatus, existing.concluded_at),
          nps_missing_count: 0,
          nps_missing_since: null,
          nps_closed_inferred_at: null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      await supabase.from("external_appointment_history").insert({
        external_appointment_id: existing.id,
        action: resolvedStatus === "CANCELADO" ? "SYNC_CANCELOU" : "SYNC_CONCLUIU",
        previous_data: { status: existing.status },
        new_data: { status: resolvedStatus },
      });
    }

    await supabase.from("integration_sync_runs").insert({
      origin: "ELECTROLUX",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: true,
      orders_processed: processed,
    });

    // Status da conexão -- nunca grava credencial/token aqui, só o
    // resultado da sincronização (hora e se a autenticação funcionou).
    if (defaultConnectionId) {
      await supabase.from("electrolux_connections").update({
        last_sync_at: new Date().toISOString(),
        auth_status: "OK",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", defaultConnectionId);
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const safeMessage = e instanceof Error ? e.message : String(e);
    await supabase.from("integration_sync_runs").insert({
      origin: "ELECTROLUX",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: false,
      orders_processed: processed,
      error_message: safeMessage,
    });

    if (defaultConnectionId) {
      await supabase.from("electrolux_connections").update({
        auth_status: "FALHA",
        last_sync_error: safeMessage,
        updated_at: new Date().toISOString(),
      }).eq("id", defaultConnectionId);
    }

    return new Response(JSON.stringify({ ok: false, error: "sync_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
