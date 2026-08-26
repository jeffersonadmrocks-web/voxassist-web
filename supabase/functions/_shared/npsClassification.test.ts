import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyCase, isValidBrazilianPhone, estimateVisitCount, daysBetween } from "./npsClassification.ts";

const base = {
  daysToConclude: 5,
  visitCount: 1,
  hasComplaint: false,
  hasReturnVisit: false,
  hasReopening: false,
  whatsappValid: true,
  daysSinceConclusion: 1,
};

Deno.test("classifyCase - Alta prioridade: <=10 dias, 1 visita, sem indício, WhatsApp válido", () => {
  assertEquals(classifyCase({ ...base, daysToConclude: 10, visitCount: 1 }), "ALTA");
});

Deno.test("classifyCase - Prioridade média: acima de 10 dias", () => {
  assertEquals(classifyCase({ ...base, daysToConclude: 11 }), "MEDIA");
});

Deno.test("classifyCase - Prioridade média: mais de uma visita mesmo dentro do prazo", () => {
  assertEquals(classifyCase({ ...base, daysToConclude: 3, visitCount: 2 }), "MEDIA");
});

Deno.test("classifyCase - Caso de atenção: reclamação registrada", () => {
  assertEquals(classifyCase({ ...base, hasComplaint: true }), "ATENCAO");
});

Deno.test("classifyCase - Caso de atenção: retorno técnico", () => {
  assertEquals(classifyCase({ ...base, hasReturnVisit: true }), "ATENCAO");
});

Deno.test("classifyCase - Caso de atenção: reabertura", () => {
  assertEquals(classifyCase({ ...base, hasReopening: true }), "ATENCAO");
});

Deno.test("classifyCase - Caso de atenção: atraso relevante (>30 dias)", () => {
  assertEquals(classifyCase({ ...base, daysToConclude: 31 }), "ATENCAO");
});

Deno.test("classifyCase - Não elegível: telefone inválido, mesmo com tudo mais perfeito", () => {
  assertEquals(classifyCase({ ...base, whatsappValid: false }), "NAO_ELEGIVEL");
});

Deno.test("classifyCase - Não elegível: fora do prazo de acompanhamento (concluído há muito tempo)", () => {
  assertEquals(classifyCase({ ...base, daysSinceConclusion: 60 }), "NAO_ELEGIVEL");
});

Deno.test("classifyCase - Não elegível tem prioridade sobre indício de atenção", () => {
  assertEquals(classifyCase({ ...base, whatsappValid: false, hasComplaint: true }), "NAO_ELEGIVEL");
});

Deno.test("classifyCase - daysToConclude desconhecido (null) não vira Alta prioridade sozinho", () => {
  assertEquals(classifyCase({ ...base, daysToConclude: null }), "MEDIA");
});

Deno.test("isValidBrazilianPhone - número com DDD e 9 dígitos, com código do país", () => {
  assertEquals(isValidBrazilianPhone("5527999998888"), true);
});

Deno.test("isValidBrazilianPhone - número com DDD e 9 dígitos, sem código do país", () => {
  assertEquals(isValidBrazilianPhone("27999998888"), true);
});

Deno.test("isValidBrazilianPhone - número fixo (8 dígitos) também válido", () => {
  assertEquals(isValidBrazilianPhone("2732211234"), true);
});

Deno.test("isValidBrazilianPhone - vazio, nulo ou curto demais é inválido", () => {
  assertEquals(isValidBrazilianPhone(null), false);
  assertEquals(isValidBrazilianPhone(""), false);
  assertEquals(isValidBrazilianPhone("123"), false);
});

Deno.test("estimateVisitCount - sem reagendamento real no histórico conta 1 visita", () => {
  assertEquals(estimateVisitCount([]), 1);
});

Deno.test("estimateVisitCount - conta trocas reais de appointment_date", () => {
  const history = [
    { previous_data: { appointment_date: null }, new_data: { appointment_date: "2026-08-01" } },
    { previous_data: { appointment_date: "2026-08-01" }, new_data: { appointment_date: "2026-08-05" } },
    { previous_data: { appointment_date: "2026-08-05" }, new_data: { appointment_date: "2026-08-05" } }, // sem troca real
  ];
  assertEquals(estimateVisitCount(history), 2);
});

Deno.test("daysBetween - calcula diferença em dias inteiros", () => {
  assertEquals(daysBetween("2026-08-01T00:00:00Z", "2026-08-11T00:00:00Z"), 10);
});
