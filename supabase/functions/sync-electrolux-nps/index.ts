// Cria casos de Gestão de NPS a partir de external_appointments já
// concluídas (sincronizadas pela sync-electrolux-agenda). Não bate na API
// da Electrolux de novo — reaproveita a mesma fonte já testada, evitando
// carga extra e um segundo poller. Roda a cada 15-30min (menos urgente que
// a agenda). Nunca escreve em appointments/service_orders/external_appointments.
import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyCase, isValidBrazilianPhone, estimateVisitCount, daysBetween, FOLLOW_UP_WINDOW_DAYS } from "../_shared/npsClassification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ConcludedAppointment = {
  id: string;
  external_created_at: string | null;
  concluded_at: string | null;
  client_phone: string | null;
};

type HistoryRow = {
  previous_data: { appointment_date?: string | null };
  new_data: { appointment_date?: string | null };
};

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startedAt = new Date().toISOString();
  let processed = 0;

  try {
    const { data: existingCaseLinks } = await supabase.from("nps_cases").select("external_appointment_id");
    const alreadyTracked = new Set((existingCaseLinks || []).map((c: { external_appointment_id: string }) => c.external_appointment_id));

    const { data: concludedRaw, error: fetchError } = await supabase
      .from("external_appointments")
      .select("id, external_created_at, concluded_at, client_phone")
      .eq("origin", "ELECTROLUX")
      .eq("status", "CONCLUIDO");
    if (fetchError) throw new Error(fetchError.message);

    const concluded = (concludedRaw || []) as ConcludedAppointment[];
    const pending = concluded.filter((c) => !alreadyTracked.has(c.id) && c.concluded_at);

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

      const situacao = classification === "NAO_ELEGIVEL" ? "FINALIZADO" : "AGUARDANDO_CONTATO";
      const surveyDeadline = new Date(new Date(appt.concluded_at!).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: saved, error } = await supabase
        .from("nps_cases")
        .insert({
          external_appointment_id: appt.id,
          classification,
          situacao,
          opened_at: appt.external_created_at,
          concluded_at: appt.concluded_at,
          visit_count: visitCount,
          whatsapp_valid: whatsappValid,
          survey_deadline_at: surveyDeadline,
          closed_reason: classification === "NAO_ELEGIVEL" ? "Não elegível na inclusão automática" : null,
        })
        .select("id")
        .single();

      if (error || !saved) continue;
      processed++;

      await supabase.from("nps_case_history").insert({
        nps_case_id: saved.id,
        action: "CRIADO_AUTOMATICAMENTE",
        previous_data: {},
        new_data: { classification, situacao, visit_count: visitCount, whatsapp_valid: whatsappValid },
        changed_by: null,
      });
    }

    await supabase.from("integration_sync_runs").insert({
      origin: "ELECTROLUX_NPS",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: true,
      orders_processed: processed,
    });

    return new Response(JSON.stringify({ ok: true, processed, followUpWindowDays: FOLLOW_UP_WINDOW_DAYS }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    await supabase.from("integration_sync_runs").insert({
      origin: "ELECTROLUX_NPS",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: false,
      orders_processed: processed,
      error_message: e instanceof Error ? e.message : String(e),
    });
    return new Response(JSON.stringify({ ok: false, error: "nps_sync_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
