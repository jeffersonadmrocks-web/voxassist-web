// Fase 2 — monitor de inatividade operacional. Roda periodicamente
// (agendado no painel do Supabase, mesmo mecanismo de sync-electrolux-nps,
// mas em ciclo mais curto: a primeira faixa de alerta já é aos 20min).
// Só escalona quem tem tarefa pendente atribuída — sem demanda, sem alerta
// (regra de negócio essencial do documento). Usa decideEscalation, pura e
// testada em _shared/operationalAlerts.test.ts; esta function só busca os
// dados e aplica a decisão.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decideEscalation, isDeadlineApproaching, type ExistingActiveAlert, type Thresholds } from "../_shared/operationalAlerts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type PendingTask = { id: string; responsible_user_id: string; due_at: string | null };

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startedAt = new Date().toISOString();
  const now = new Date();
  let escalated = 0;
  let deadlineAlerts = 0;

  try {
    const { data: expectations } = await supabase
      .from("operational_expectations")
      .select("lembrete_minutes, atencao_minutes, ocorrencia_minutes, critico_minutes")
      .is("company_id", null)
      .maybeSingle<{ lembrete_minutes: number; atencao_minutes: number; ocorrencia_minutes: number; critico_minutes: number }>();

    const thresholds: Thresholds = {
      lembreteMinutes: expectations?.lembrete_minutes ?? 20,
      atencaoMinutes: expectations?.atencao_minutes ?? 30,
      ocorrenciaMinutes: expectations?.ocorrencia_minutes ?? 45,
      criticoMinutes: expectations?.critico_minutes ?? 60,
    };

    const { data: pendingRaw, error: pendingError } = await supabase
      .from("operational_tasks")
      .select("id, responsible_user_id, due_at")
      .in("status", ["PENDENTE", "EM_ANDAMENTO"])
      .not("responsible_user_id", "is", null);
    if (pendingError) throw new Error(pendingError.message);
    const pending = (pendingRaw || []) as PendingTask[];

    const byUser = new Map<string, PendingTask[]>();
    for (const t of pending) {
      const list = byUser.get(t.responsible_user_id) || [];
      list.push(t);
      byUser.set(t.responsible_user_id, list);
    }

    for (const [userId, tasks] of byUser) {
      const { data: lastEventRaw } = await supabase
        .from("operational_events")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ created_at: string }>();

      const oldestTaskCreatedAt = tasks.length
        ? (
            await supabase
              .from("operational_tasks")
              .select("created_at")
              .eq("responsible_user_id", userId)
              .in("status", ["PENDENTE", "EM_ANDAMENTO"])
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle<{ created_at: string }>()
          ).data?.created_at ?? null
        : null;

      const referenceAt = lastEventRaw?.created_at ?? oldestTaskCreatedAt;
      const minutesSinceLastEvent = referenceAt ? (now.getTime() - new Date(referenceAt).getTime()) / 60000 : null;

      const { data: activeJustification } = await supabase
        .from("operational_justifications")
        .select("id")
        .eq("user_id", userId)
        .lte("period_start", now.toISOString())
        .or(`period_end.is.null,period_end.gte.${now.toISOString()}`)
        .limit(1)
        .maybeSingle<{ id: string }>();

      const { data: existingAlertRaw } = await supabase
        .from("operational_alerts")
        .select("id, severity")
        .eq("user_id", userId)
        .eq("alert_type", "LOW_ACTIVITY")
        .in("status", ["ATIVO", "RECONHECIDO"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<ExistingActiveAlert>();

      const decision = decideEscalation({
        minutesSinceLastEvent,
        pendingTaskCount: tasks.length,
        hasActiveJustification: !!activeJustification,
        thresholds,
        existingActiveAlert: existingAlertRaw ?? null,
      });

      if (decision.action === "create") {
        const topTask = tasks[0]?.id ?? null;
        const { error } = await supabase.from("operational_alerts").insert({
          user_id: userId,
          operational_task_id: topTask,
          alert_type: "LOW_ACTIVITY",
          severity: decision.severity,
          status: "ATIVO",
          message: decision.message,
        });
        if (!error) escalated++;
      } else if (decision.action === "update") {
        const { error } = await supabase
          .from("operational_alerts")
          .update({ severity: decision.severity, message: decision.message })
          .eq("id", decision.alertId);
        if (!error) escalated++;
      }
    }

    // Alertas de prazo — um por tarefa, sem escalonamento, resolvido
    // quando a tarefa conclui ou o prazo passa (não tratado aqui).
    const { data: deadlineCandidatesRaw } = await supabase
      .from("operational_tasks")
      .select("id, responsible_user_id, due_at")
      .in("status", ["PENDENTE", "EM_ANDAMENTO"])
      .not("responsible_user_id", "is", null)
      .not("due_at", "is", null);
    const deadlineCandidates = (deadlineCandidatesRaw || []) as PendingTask[];

    for (const task of deadlineCandidates) {
      if (!isDeadlineApproaching(task.due_at, now)) continue;
      const { data: existing } = await supabase
        .from("operational_alerts")
        .select("id")
        .eq("operational_task_id", task.id)
        .eq("alert_type", "DEADLINE_APPROACHING")
        .in("status", ["ATIVO", "RECONHECIDO"])
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (existing) continue;
      const { error } = await supabase.from("operational_alerts").insert({
        user_id: task.responsible_user_id,
        operational_task_id: task.id,
        alert_type: "DEADLINE_APPROACHING",
        severity: "ATENCAO",
        status: "ATIVO",
        message: "Prazo em menos de 30 minutos para esta tarefa.",
      });
      if (!error) deadlineAlerts++;
    }

    await supabase.from("integration_sync_runs").insert({
      origin: "OPERATIONAL_ALERTS",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: true,
      orders_processed: escalated + deadlineAlerts,
    });

    return new Response(JSON.stringify({ ok: true, usersScanned: byUser.size, escalated, deadlineAlerts }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    await supabase.from("integration_sync_runs").insert({
      origin: "OPERATIONAL_ALERTS",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: false,
      orders_processed: escalated + deadlineAlerts,
      error_message: e instanceof Error ? e.message : String(e),
    });
    return new Response(JSON.stringify({ ok: false, error: "operational_alerts_scan_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
