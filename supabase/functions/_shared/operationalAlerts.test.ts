import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideEscalation, isDeadlineApproaching, severityForMinutes, type Thresholds } from "./operationalAlerts.ts";

const THRESHOLDS: Thresholds = { lembreteMinutes: 20, atencaoMinutes: 30, ocorrenciaMinutes: 45, criticoMinutes: 60 };

Deno.test("decideEscalation - sem tarefa pendente nunca gera alerta", () => {
  const r = decideEscalation({
    minutesSinceLastEvent: 120,
    pendingTaskCount: 0,
    hasActiveJustification: false,
    thresholds: THRESHOLDS,
    existingActiveAlert: null,
  });
  assertEquals(r, { action: "none" });
});

Deno.test("decideEscalation - justificativa ativa suspende a régua", () => {
  const r = decideEscalation({
    minutesSinceLastEvent: 120,
    pendingTaskCount: 3,
    hasActiveJustification: true,
    thresholds: THRESHOLDS,
    existingActiveAlert: null,
  });
  assertEquals(r, { action: "none" });
});

Deno.test("decideEscalation - sem referência de último evento não decide nada", () => {
  const r = decideEscalation({
    minutesSinceLastEvent: null,
    pendingTaskCount: 2,
    hasActiveJustification: false,
    thresholds: THRESHOLDS,
    existingActiveAlert: null,
  });
  assertEquals(r, { action: "none" });
});

Deno.test("decideEscalation - abaixo de 20min é só monitoramento, sem alerta", () => {
  const r = decideEscalation({
    minutesSinceLastEvent: 15,
    pendingTaskCount: 1,
    hasActiveJustification: false,
    thresholds: THRESHOLDS,
    existingActiveAlert: null,
  });
  assertEquals(r, { action: "none" });
});

Deno.test("decideEscalation - 20min sem alerta existente cria LEMBRETE", () => {
  const r = decideEscalation({
    minutesSinceLastEvent: 20,
    pendingTaskCount: 1,
    hasActiveJustification: false,
    thresholds: THRESHOLDS,
    existingActiveAlert: null,
  });
  assertEquals(r.action, "create");
  if (r.action === "create") assertEquals(r.severity, "LEMBRETE");
});

Deno.test("decideEscalation - escalonamento atualiza o alerta existente em vez de duplicar", () => {
  const r = decideEscalation({
    minutesSinceLastEvent: 35,
    pendingTaskCount: 1,
    hasActiveJustification: false,
    thresholds: THRESHOLDS,
    existingActiveAlert: { id: "alert-1", severity: "LEMBRETE" },
  });
  assertEquals(r, { action: "update", alertId: "alert-1", severity: "ATENCAO", message: r.action === "update" ? r.message : "" });
});

Deno.test("decideEscalation - não rebaixa nem duplica quando já está na faixa certa ou mais alta", () => {
  const r = decideEscalation({
    minutesSinceLastEvent: 25,
    pendingTaskCount: 1,
    hasActiveJustification: false,
    thresholds: THRESHOLDS,
    existingActiveAlert: { id: "alert-1", severity: "ATENCAO" },
  });
  assertEquals(r, { action: "none" });
});

Deno.test("decideEscalation - 65min sem alerta cria CRITICO direto", () => {
  const r = decideEscalation({
    minutesSinceLastEvent: 65,
    pendingTaskCount: 4,
    hasActiveJustification: false,
    thresholds: THRESHOLDS,
    existingActiveAlert: null,
  });
  assertEquals(r.action, "create");
  if (r.action === "create") assertEquals(r.severity, "CRITICO");
});

Deno.test("severityForMinutes - fronteiras exatas de cada faixa", () => {
  assertEquals(severityForMinutes(19, THRESHOLDS), null);
  assertEquals(severityForMinutes(20, THRESHOLDS), "LEMBRETE");
  assertEquals(severityForMinutes(30, THRESHOLDS), "ATENCAO");
  assertEquals(severityForMinutes(45, THRESHOLDS), "OCORRENCIA");
  assertEquals(severityForMinutes(60, THRESHOLDS), "CRITICO");
});

Deno.test("isDeadlineApproaching - dentro da janela de 30min é true", () => {
  const now = new Date("2026-08-27T10:00:00Z");
  assertEquals(isDeadlineApproaching("2026-08-27T10:10:00Z", now), true);
});

Deno.test("isDeadlineApproaching - fora da janela (45min) é false", () => {
  const now = new Date("2026-08-27T10:00:00Z");
  assertEquals(isDeadlineApproaching("2026-08-27T10:45:00Z", now), false);
});

Deno.test("isDeadlineApproaching - prazo já passado é false (não é 'approaching')", () => {
  const now = new Date("2026-08-27T10:00:00Z");
  assertEquals(isDeadlineApproaching("2026-08-27T09:59:00Z", now), false);
});

Deno.test("isDeadlineApproaching - sem due_at é false", () => {
  const now = new Date("2026-08-27T10:00:00Z");
  assertEquals(isDeadlineApproaching(null, now), false);
});
