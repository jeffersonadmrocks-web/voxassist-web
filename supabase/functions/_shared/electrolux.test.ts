import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveStatus, derivePeriod, normalizeName, mapOrderToRow, resolveConcludedAt, effectiveScheduledAt } from "./electrolux.ts";

Deno.test("deriveStatus - Cancelada vira CANCELADO mesmo com data futura", () => {
  assertEquals(
    deriveStatus({ status: "Cancelada", internalStatus: "AGENDADA", appointmentDate: "2026-09-01T09:00:00Z", firstQueuedDateTime: null }),
    "CANCELADO"
  );
});

Deno.test("deriveStatus - Encerrada vira CONCLUIDO", () => {
  assertEquals(deriveStatus({ status: "Encerrada", internalStatus: "FECHADA", appointmentDate: null, firstQueuedDateTime: null }), "CONCLUIDO");
});

Deno.test("deriveStatus - internalStatus FECHADA vira CONCLUIDO mesmo com status aberto", () => {
  assertEquals(deriveStatus({ status: "Em andamento", internalStatus: "FECHADA", appointmentDate: null, firstQueuedDateTime: null }), "CONCLUIDO");
});

Deno.test("deriveStatus - com appointmentDate e nada fechado vira AGENDADO", () => {
  assertEquals(
    deriveStatus({ status: "Em andamento", internalStatus: "AGENDADA", appointmentDate: "2026-09-01T09:00:00Z", firstQueuedDateTime: null }),
    "AGENDADO"
  );
});

Deno.test("deriveStatus - sem appointmentDate mas com firstQueuedDateTime também vira AGENDADO (caso real hoje)", () => {
  assertEquals(
    deriveStatus({ status: "Aguardando atendimento", internalStatus: "NOVA", appointmentDate: null, firstQueuedDateTime: "2026-08-31T11:00:00Z" }),
    "AGENDADO"
  );
});

Deno.test("deriveStatus - sem data e sem fechamento vira ABERTO", () => {
  assertEquals(deriveStatus({ status: "Nova", internalStatus: "NOVA", appointmentDate: null, firstQueuedDateTime: null }), "ABERTO");
});

Deno.test("effectiveScheduledAt - appointmentDate tem prioridade sobre firstQueuedDateTime", () => {
  assertEquals(
    effectiveScheduledAt({ appointmentDate: "2026-09-01T09:00:00Z", firstQueuedDateTime: "2026-09-05T14:00:00Z" }),
    "2026-09-01T09:00:00Z"
  );
});

Deno.test("effectiveScheduledAt - cai pro firstQueuedDateTime quando appointmentDate é null", () => {
  assertEquals(
    effectiveScheduledAt({ appointmentDate: null, firstQueuedDateTime: "2026-09-05T14:00:00Z" }),
    "2026-09-05T14:00:00Z"
  );
});

Deno.test("derivePeriod - hora 9 vira MANHA", () => {
  assertEquals(derivePeriod("2026-09-01T09:00:00Z"), "MANHA");
});

Deno.test("derivePeriod - hora 14 vira TARDE", () => {
  assertEquals(derivePeriod("2026-09-01T14:00:00Z"), "TARDE");
});

Deno.test("derivePeriod - sem data vira null", () => {
  assertEquals(derivePeriod(null), null);
});

Deno.test("normalizeName - remove acento, caixa e pontuação", () => {
  assertEquals(normalizeName("Carlos Silva"), "carlos silva");
  assertEquals(normalizeName("  José   D'Ávila  "), "jose davila");
});

Deno.test("normalizeName - nomes parecidos mas diferentes continuam diferentes", () => {
  // "Carlos Silva" (Electrolux) vs "Carlos da Silva" (VoxAssist) do exemplo
  // da spec: não podem normalizar pro mesmo valor, senão fundiriam sozinhos.
  const a = normalizeName("Carlos Silva");
  const b = normalizeName("Carlos da Silva");
  assertEquals(a === b, false);
});

Deno.test("mapOrderToRow - mapeia só os campos mínimos, sem inventar dado", () => {
  const row = mapOrderToRow({
    id: "abc-123",
    svoNumber: "SVO-20444483",
    clientName: "Maria Souza",
    clientPhone: "27999998888",
    claimedDefect: "Geladeira não gela",
    status: "Em andamento",
    internalStatus: "AGENDADA",
    createdDate: "2026-08-10T09:00:00Z",
    appointmentDate: "2026-09-01T14:00:00Z",
    firstQueuedDateTime: null,
    updatedAt: "2026-08-20T10:00:00Z",
  });
  assertEquals(row.origin, "ELECTROLUX");
  assertEquals(row.external_id, "abc-123");
  assertEquals(row.external_order_number, "SVO-20444483");
  assertEquals(row.status, "AGENDADO");
  assertEquals(row.period, "TARDE");
  assertEquals(row.appointment_date, "2026-09-01");
  assertEquals(row.client_name, "Maria Souza");
  assertEquals(row.notes, "Geladeira não gela");
  assertEquals(row.external_created_at, "2026-08-10T09:00:00Z");
});

Deno.test("mapOrderToRow - usa firstQueuedDateTime quando appointmentDate é null (caso real da Electrolux hoje)", () => {
  const row = mapOrderToRow({
    id: "cmtc2te3f000q1hqpch747moy",
    svoNumber: "SVO-20473568",
    clientName: "Nubia Maia Dos Santos Ferreira",
    clientPhone: "5527988789651",
    claimedDefect: "Conversão de gás",
    status: "Aguardando atendimento",
    internalStatus: "NOVA",
    createdDate: "2026-08-27T22:02:43Z",
    appointmentDate: null,
    firstQueuedDateTime: "2026-08-31T11:00:00Z",
    updatedAt: "2026-08-27T22:10:22Z",
  });
  assertEquals(row.status, "AGENDADO");
  assertEquals(row.appointment_date, "2026-08-31");
  assertEquals(row.period, "MANHA");
});

Deno.test("resolveConcludedAt - não sobrescreve um concluded_at já existente", () => {
  assertEquals(resolveConcludedAt("CONCLUIDO", "2026-08-01T00:00:00Z"), "2026-08-01T00:00:00Z");
});

Deno.test("resolveConcludedAt - seta na primeira vez que o status vira CONCLUIDO", () => {
  const result = resolveConcludedAt("CONCLUIDO", null);
  assertEquals(typeof result, "string");
  assertEquals(new Date(result as string).toString() !== "Invalid Date", true);
});

Deno.test("resolveConcludedAt - não seta pra status que não é CONCLUIDO", () => {
  assertEquals(resolveConcludedAt("ABERTO", null), null);
  assertEquals(resolveConcludedAt("AGENDADO", null), null);
  assertEquals(resolveConcludedAt("CANCELADO", null), null);
});
