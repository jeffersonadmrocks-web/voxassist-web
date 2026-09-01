// Cria casos de Gestão de NPS a partir de external_appointments já
// concluídas (sincronizadas pela sync-electrolux-agenda). Não bate na API
// da Electrolux de novo — reaproveita a mesma fonte já testada, evitando
// carga extra e um segundo poller. Roda a cada 15-30min (menos urgente que
// a agenda). Nunca escreve em appointments/service_orders/external_appointments.
//
// Achado real #1 (2026-08-31, verificação direta no banco): a function usava
// AGUARDANDO_ELEGIBILIDADE/ELEGIVEL_PARA_NPS, valores que NUNCA existiram
// na constraint de nps_cases.situacao -- todo insert cuja classificação não
// fosse NAO_ELEGIVEL violava a constraint e falhava. O bug ficava invisível
// porque a falha do insert só dava `continue`, sem contar nem logar nada, e
// o sync run seguinte era gravado como success=true do mesmo jeito. Restultado
// em produção: 17 atendimentos Electrolux concluídos, 1 caso criado (o único
// cuja classificação era NAO_ELEGIVEL -> situacao=FINALIZADO, que é um valor
// válido), 16 perdidos silenciosamente a cada execução (238 execuções "com
// sucesso", todas com orders_processed=0 nos ciclos mais recentes).
//
// Achado real #2 (mesmo dia): filial vinha de uma tentativa de resolver
// por technician_id -> profiles.store_id -> stores.name, que nunca
// resolvia porque nenhuma dessas tabelas está populada hoje. A REGRA
// CORRETA é outra: a conexão Electrolux atual só enxerga dados da Vox
// Serra -- a filial vem da CONEXÃO que sincronizou o atendimento
// (electrolux_connections), nunca de inferência por técnico/endereço.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  classifyCase,
  isValidBrazilianPhone,
  estimateVisitCount,
  daysBetween,
  isEligibleForContact,
  ELIGIBILITY_GATE_HOURS,
  FOLLOW_UP_WINDOW_DAYS,
} from "../_shared/npsClassification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ConcludedAppointment = {
  id: string;
  external_created_at: string | null;
  concluded_at: string | null;
  client_phone: string | null;
  nps_closed_inferred_at: string | null;
  connection_id: string | null;
};

type ElectroluxConnection = { id: string; filial: "VITORIA" | "SERRA" };

type HistoryRow = {
  previous_data: { appointment_date?: string | null };
  new_data: { appointment_date?: string | null };
};

type FailedDetail = { external_appointment_id: string; error: string };

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startedAt = new Date().toISOString();
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let promoted = 0;
  let promoteFailed = 0;
  const failedDetails: FailedDetail[] = [];

  try {
    // Conexões ativas -- hoje só existe Serra, mas o código já resolve
    // filial pela conexão de cada atendimento (connection_id), não por
    // um valor fixo em código. defaultConnection só entra como fallback
    // pra atendimentos antigos sem connection_id ainda carimbado, e só
    // quando existe exatamente uma conexão ativa (sem ambiguidade).
    const { data: connectionsRaw } = await supabase.from("electrolux_connections").select("id, filial").eq("active", true);
    const connections = (connectionsRaw || []) as ElectroluxConnection[];
    const filialByConnectionId = new Map(connections.map((c) => [c.id, c.filial]));
    const defaultConnection = connections.length === 1 ? connections[0] : null;

    const { data: existingCaseLinks } = await supabase.from("nps_cases").select("external_appointment_id");
    const alreadyTracked = new Set((existingCaseLinks || []).map((c: { external_appointment_id: string }) => c.external_appointment_id));

    const { data: concludedRaw, error: fetchError } = await supabase
      .from("external_appointments")
      .select("id, external_created_at, concluded_at, client_phone, nps_closed_inferred_at, connection_id")
      .eq("origin", "ELECTROLUX")
      .eq("status", "CONCLUIDO");
    if (fetchError) throw new Error(fetchError.message);

    const concluded = (concludedRaw || []) as ConcludedAppointment[];
    const pending = concluded.filter((c) => !alreadyTracked.has(c.id) && c.concluded_at);
    skipped = concluded.length - pending.length;

    for (const appt of pending) {
      const { data: historyRaw } = await supabase
        .from("external_appointment_history")
        .select("previous_data, new_data")
        .eq("external_appointment_id", appt.id);
      const visitCount = estimateVisitCount((historyRaw || []) as HistoryRow[]);

      const whatsappValid = isValidBrazilianPhone(appt.client_phone);
      const daysToConclude = appt.external_created_at ? daysBetween(appt.external_created_at, appt.concluded_at!) : null;
      const daysSinceConclusion = daysBetween(appt.concluded_at!, new Date().toISOString());

      const classification = classifyCase({
        daysToConclude,
        visitCount,
        hasComplaint: false,
        hasReturnVisit: false,
        hasReopening: false,
        whatsappValid,
        daysSinceConclusion,
      });

      // Mapeamento corrigido -- os únicos 3 valores de situacao usados na
      // criação automática, todos aceitos pela constraint real:
      //   NAO_ELEGIVEL                          -> FINALIZADO
      //   elegível, ainda dentro da carência 6h -> AGUARDANDO_PRAZO_NPS
      //   elegível, carência já cumprida         -> AGUARDANDO_CONTATO
      const now = new Date();
      const situacao =
        classification === "NAO_ELEGIVEL"
          ? "FINALIZADO"
          : isEligibleForContact(appt.concluded_at!, now)
          ? "AGUARDANDO_CONTATO"
          : "AGUARDANDO_PRAZO_NPS";

      const eligibleAt = new Date(new Date(appt.concluded_at!).getTime() + ELIGIBILITY_GATE_HOURS * 60 * 60 * 1000).toISOString();
      const surveyDeadline = new Date(new Date(appt.concluded_at!).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      // Filial vem SEMPRE da conexão que sincronizou o atendimento --
      // nunca de técnico, endereço ou qualquer outra inferência.
      const connectionId = appt.connection_id ?? defaultConnection?.id ?? null;
      const filial = connectionId ? filialByConnectionId.get(connectionId) ?? null : null;

      const { data: saved, error } = await supabase
        .from("nps_cases")
        .insert({
          external_appointment_id: appt.id,
          filial,
          connection_id: connectionId,
          classification,
          situacao,
          opened_at: appt.external_created_at,
          concluded_at: appt.concluded_at,
          eligible_at: eligibleAt,
          visit_count: visitCount,
          whatsapp_valid: whatsappValid,
          survey_deadline_at: surveyDeadline,
          closed_reason: classification === "NAO_ELEGIVEL" ? "Não elegível na inclusão automática" : null,
          // closure_inferred_at só é preenchido quando o próprio
          // encerramento em external_appointments foi inferido por
          // ausência na origem (nps_closed_inferred_at, já mantido pela
          // sync-electrolux-agenda) -- nunca setado por suposição aqui.
          closure_inferred_at: appt.nps_closed_inferred_at,
          closure_detection_method: appt.nps_closed_inferred_at ? "ENCERRAMENTO_POR_AUSENCIA" : null,
        })
        .select("id")
        .single();

      if (error || !saved) {
        failed++;
        failedDetails.push({
          external_appointment_id: appt.id,
          error: error?.code ? `${error.code}: ${error.message}` : "insert_failed_sem_detalhe",
        });
        continue;
      }
      processed++;

      await supabase.from("nps_case_history").insert({
        nps_case_id: saved.id,
        action: "CRIADO_AUTOMATICAMENTE",
        previous_data: {},
        new_data: { classification, situacao, visit_count: visitCount, whatsapp_valid: whatsappValid, filial },
        changed_by: null,
      });
    }

    // Promove de AGUARDANDO_PRAZO_NPS pra AGUARDANDO_CONTATO quem já
    // cumpriu a carência das 6h desde concluded_at. Roda a cada ciclo
    // (15-30min), granularidade de sobra pra uma carência medida em horas.
    const { data: waitingRaw } = await supabase
      .from("nps_cases")
      .select("id, concluded_at, situacao")
      .eq("situacao", "AGUARDANDO_PRAZO_NPS");
    const waiting = (waitingRaw || []) as Array<{ id: string; concluded_at: string | null; situacao: string }>;
    const promoteNow = new Date();

    for (const c of waiting) {
      if (!c.concluded_at || !isEligibleForContact(c.concluded_at, promoteNow)) continue;
      const { error: promoteError } = await supabase
        .from("nps_cases")
        .update({ situacao: "AGUARDANDO_CONTATO", updated_at: promoteNow.toISOString() })
        .eq("id", c.id);
      if (promoteError) { promoteFailed++; continue; }
      promoted++;
      await supabase.from("nps_case_history").insert({
        nps_case_id: c.id,
        action: "AGUARDANDO_CONTATO",
        previous_data: { situacao: c.situacao },
        new_data: { situacao: "AGUARDANDO_CONTATO" },
        changed_by: null,
      });
    }

    const hadUnexpectedFailure = failed > 0 || promoteFailed > 0;
    await supabase.from("integration_sync_runs").insert({
      origin: "ELECTROLUX_NPS",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: !hadUnexpectedFailure,
      orders_processed: processed,
      promoted_count: promoted,
      skipped_count: skipped,
      failed_count: failed + promoteFailed,
      // Nunca inclui telefone/nome/endereço -- só o id do agendamento
      // (uuid) e o código/mensagem técnica do erro de persistência.
      failed_details: failedDetails.length ? failedDetails : null,
    });

    return new Response(
      JSON.stringify({ ok: true, processed, promoted, skipped, failed, promoteFailed, followUpWindowDays: FOLLOW_UP_WINDOW_DAYS }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    await supabase.from("integration_sync_runs").insert({
      origin: "ELECTROLUX_NPS",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: false,
      orders_processed: processed,
      promoted_count: promoted,
      skipped_count: skipped,
      failed_count: failed + promoteFailed,
      failed_details: failedDetails.length ? failedDetails : null,
      error_message: e instanceof Error ? e.message : String(e),
    });
    return new Response(JSON.stringify({ ok: false, error: "nps_sync_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
