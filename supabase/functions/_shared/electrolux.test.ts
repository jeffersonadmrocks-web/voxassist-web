import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveStatus, derivePeriod, normalizeName, mapOrderToRow } from "./electrolux.ts";

Deno.test("deriveStatus - Cancelada vira CANCELADO mesmo com data futura", () => {
  assertEquals(
    deriveStatus({ status: "Cancelada", internalStatus: "AGENDADA", appointmentDate: "2026-09-01T09:00:00Z" }),
    "CANCELADO"
  );
});

Deno.test("deriveStatus - Encerrada vira CONCLUIDO", () => {
  assertEquals(deriveStatus({ status: "Encerrada", internalStatus: "FECHADA", appointmentDate: null }), "CONCLUIDO");
});

Deno.test("deriveStatus - internalStatus FECHADA vira CONCLUIDO mesmo com status aberto", () => {
  assertEquals(deriveStatus({ status: "Em andamento", internalStatus: "FECHADA", appointmentDate: null }), "CONCLUIDO");
});

Deno.test("deriveStatus - com appointmentDate e nada fechado vira AGENDADO", () => {
  assertEquals(
    deriveStatus({ status: "Em andamento", internalStatus: "AGENDADA", appointmentDate: "2026-09-01T09:00:00Z" }),
    "AGENDADO"
  );
});

Deno.test("deriveStatus - sem data e sem fechamento vira ABERTO", () => {
  assertEquals(deriveStatus({ status: "Nova", internalStatus: "NOVA", appointmentDate: null }), "ABERTO");
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
    appointmentDate: "2026-09-01T14:00:00Z",
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
});
