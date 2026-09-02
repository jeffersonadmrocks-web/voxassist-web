import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  collectRoutingDimensions,
  decideBotTrigger,
  decideTriageStep,
  FlowStep,
  isBypassTrigger,
  isStepEligible,
  matchRoutingRules,
  normalizeAnswerValue,
  resolveNextEligibleStep,
  RoutingRule,
  StepCondition,
  validateAnswer,
} from "./chatBotFlow.ts";

function step(overrides: Partial<FlowStep>): FlowStep {
  return {
    id: "s1",
    stepKey: "loja",
    stepOrder: 1,
    questionText: "Qual loja?",
    answerType: "CHOICE",
    options: [{ value: "store-serra", label: "Vox Serra" }, { value: "store-vitoria", label: "Vox Vitória" }],
    routingDimension: "STORE",
    active: true,
    ...overrides,
  };
}

Deno.test("normalizeAnswerValue - maiúsculo e trim", () => {
  assertEquals(normalizeAnswerValue("  em garantia  "), "EM GARANTIA");
});
Deno.test("normalizeAnswerValue - vazio depois do trim vira null", () => {
  assertEquals(normalizeAnswerValue("   "), null);
});
Deno.test("normalizeAnswerValue - null/undefined vira null", () => {
  assertEquals(normalizeAnswerValue(null), null);
  assertEquals(normalizeAnswerValue(undefined), null);
});

Deno.test("isStepEligible - sem condição é sempre elegível se ativo e não respondido", () => {
  const s = step({ id: "s1", stepKey: "loja" });
  assertEquals(isStepEligible(s, {}, [], { s1: s }), true);
});
Deno.test("isStepEligible - já respondido nunca é elegível de novo", () => {
  const s = step({ id: "s1", stepKey: "loja" });
  assertEquals(isStepEligible(s, { loja: "store-serra" }, [], { s1: s }), false);
});
Deno.test("isStepEligible - inativo nunca é elegível", () => {
  const s = step({ id: "s1", stepKey: "loja", active: false });
  assertEquals(isStepEligible(s, {}, [], { s1: s }), false);
});
Deno.test("isStepEligible - condição satisfeita libera o step (ex.: pede nota fiscal se garantia=Em garantia)", () => {
  const garantia = step({ id: "s2", stepKey: "garantia", routingDimension: "WARRANTY" });
  const notaFiscal = step({ id: "s3", stepKey: "nota_fiscal", answerType: "FREE_TEXT", routingDimension: null, options: [] });
  const conditions: StepCondition[] = [{ stepId: "s3", dependsOnStepId: "s2", dependsOnValue: "EM GARANTIA" }];
  const stepsById = { s2: garantia, s3: notaFiscal };
  assertEquals(isStepEligible(notaFiscal, { garantia: "Em garantia" }, conditions, stepsById), true);
});
Deno.test("isStepEligible - condição NÃO satisfeita mantém o step invisível", () => {
  const garantia = step({ id: "s2", stepKey: "garantia", routingDimension: "WARRANTY" });
  const notaFiscal = step({ id: "s3", stepKey: "nota_fiscal", answerType: "FREE_TEXT", routingDimension: null, options: [] });
  const conditions: StepCondition[] = [{ stepId: "s3", dependsOnStepId: "s2", dependsOnValue: "EM GARANTIA" }];
  const stepsById = { s2: garantia, s3: notaFiscal };
  assertEquals(isStepEligible(notaFiscal, { garantia: "Fora de garantia" }, conditions, stepsById), false);
});
Deno.test("isStepEligible - condição referenciando pergunta ainda não respondida também é invisível", () => {
  const garantia = step({ id: "s2", stepKey: "garantia", routingDimension: "WARRANTY" });
  const notaFiscal = step({ id: "s3", stepKey: "nota_fiscal", answerType: "FREE_TEXT", routingDimension: null, options: [] });
  const conditions: StepCondition[] = [{ stepId: "s3", dependsOnStepId: "s2", dependsOnValue: "EM GARANTIA" }];
  const stepsById = { s2: garantia, s3: notaFiscal };
  assertEquals(isStepEligible(notaFiscal, {}, conditions, stepsById), false);
});

Deno.test("resolveNextEligibleStep - do zero, devolve o primeiro step ativo em ordem", () => {
  const s1 = step({ id: "s1", stepKey: "loja", stepOrder: 1 });
  const s2 = step({ id: "s2", stepKey: "garantia", stepOrder: 2, routingDimension: "WARRANTY" });
  assertEquals(resolveNextEligibleStep([s2, s1], {}, [])?.stepKey, "loja");
});
Deno.test("resolveNextEligibleStep - retoma pulando os já respondidos", () => {
  const s1 = step({ id: "s1", stepKey: "loja", stepOrder: 1 });
  const s2 = step({ id: "s2", stepKey: "garantia", stepOrder: 2, routingDimension: "WARRANTY" });
  assertEquals(resolveNextEligibleStep([s1, s2], { loja: "store-serra" }, [])?.stepKey, "garantia");
});
Deno.test("resolveNextEligibleStep - pergunta condicional aparece na posição natural, não no fim", () => {
  const s1 = step({ id: "s1", stepKey: "loja", stepOrder: 1 });
  const garantia = step({ id: "s2", stepKey: "garantia", stepOrder: 2, routingDimension: "WARRANTY" });
  const notaFiscal = step({ id: "s3", stepKey: "nota_fiscal", stepOrder: 3, answerType: "FREE_TEXT", routingDimension: null, options: [] });
  const marca = step({ id: "s4", stepKey: "marca", stepOrder: 4, answerType: "FREE_TEXT", routingDimension: "BRAND", options: [] });
  const conditions: StepCondition[] = [{ stepId: "s3", dependsOnStepId: "s2", dependsOnValue: "EM GARANTIA" }];
  // Depois de responder loja+garantia=Em garantia, o próximo elegível é nota_fiscal (s3), não marca (s4)
  assertEquals(
    resolveNextEligibleStep([s1, garantia, notaFiscal, marca], { loja: "store-serra", garantia: "Em garantia" }, conditions)?.stepKey,
    "nota_fiscal",
  );
});
Deno.test("resolveNextEligibleStep - condição não satisfeita pula a pergunta condicional e vai pra próxima", () => {
  const s1 = step({ id: "s1", stepKey: "loja", stepOrder: 1 });
  const garantia = step({ id: "s2", stepKey: "garantia", stepOrder: 2, routingDimension: "WARRANTY" });
  const notaFiscal = step({ id: "s3", stepKey: "nota_fiscal", stepOrder: 3, answerType: "FREE_TEXT", routingDimension: null, options: [] });
  const marca = step({ id: "s4", stepKey: "marca", stepOrder: 4, answerType: "FREE_TEXT", routingDimension: "BRAND", options: [] });
  const conditions: StepCondition[] = [{ stepId: "s3", dependsOnStepId: "s2", dependsOnValue: "EM GARANTIA" }];
  assertEquals(
    resolveNextEligibleStep([s1, garantia, notaFiscal, marca], { loja: "store-serra", garantia: "Fora de garantia" }, conditions)?.stepKey,
    "marca",
  );
});
Deno.test("resolveNextEligibleStep - tudo respondido devolve null (fim da triagem)", () => {
  const s1 = step({ id: "s1", stepKey: "loja", stepOrder: 1 });
  assertEquals(resolveNextEligibleStep([s1], { loja: "store-serra" }, []), null);
});

Deno.test("validateAnswer - CHOICE aceita o value exato", () => {
  const s = step({});
  assertEquals(validateAnswer(s, "store-serra"), { valid: true, normalizedValue: "store-serra", error: null });
});
Deno.test("validateAnswer - CHOICE aceita o label, sem diferenciar caixa/espaço", () => {
  const s = step({});
  assertEquals(validateAnswer(s, "  vox serra  "), { valid: true, normalizedValue: "store-serra", error: null });
});
Deno.test("validateAnswer - CHOICE rejeita algo fora das opções", () => {
  const s = step({});
  const r = validateAnswer(s, "Vox Cariacica");
  assertEquals(r.valid, false);
});
Deno.test("validateAnswer - FREE_TEXT aceita qualquer texto não-vazio", () => {
  const s = step({ answerType: "FREE_TEXT", options: [] });
  assertEquals(validateAnswer(s, "  Electrolux  "), { valid: true, normalizedValue: "Electrolux", error: null });
});
Deno.test("validateAnswer - vazio é sempre inválido, mesmo FREE_TEXT", () => {
  const s = step({ answerType: "FREE_TEXT", options: [] });
  assertEquals(validateAnswer(s, "   ").valid, false);
});

Deno.test("isBypassTrigger - reconhece 'falar com atendente' quando o toggle está ligado", () => {
  assertEquals(isBypassTrigger("quero falar com atendente", true), true);
  assertEquals(isBypassTrigger("humano por favor", true), true);
});
Deno.test("isBypassTrigger - nunca dispara com o toggle desligado", () => {
  assertEquals(isBypassTrigger("quero falar com atendente", false), false);
});
Deno.test("isBypassTrigger - texto normal não dispara", () => {
  assertEquals(isBypassTrigger("Vox Serra", true), false);
});

Deno.test("decideTriageStep - resposta válida avança", () => {
  const s = step({});
  const r = decideTriageStep({ step: s, rawText: "Vox Serra", attemptCount: 0, retryLimit: 3, alwaysHumanEnabled: true });
  assertEquals(r, { outcome: "ANSWERED", normalizedValue: "store-serra" });
});
Deno.test("decideTriageStep - gatilho de bypass vence mesmo com resposta parecida válida", () => {
  const s = step({});
  const r = decideTriageStep({ step: s, rawText: "quero falar com atendente", attemptCount: 0, retryLimit: 3, alwaysHumanEnabled: true });
  assertEquals(r, { outcome: "BYPASS" });
});
Deno.test("decideTriageStep - inválida antes do limite pede de novo", () => {
  const s = step({});
  const r = decideTriageStep({ step: s, rawText: "não sei", attemptCount: 0, retryLimit: 3, alwaysHumanEnabled: true });
  assertEquals(r, { outcome: "INVALID_RETRY", attemptCount: 1 });
});
Deno.test("decideTriageStep - inválida no limite encaminha pro atendente padrão", () => {
  const s = step({});
  const r = decideTriageStep({ step: s, rawText: "não sei", attemptCount: 2, retryLimit: 3, alwaysHumanEnabled: true });
  assertEquals(r, { outcome: "RETRY_LIMIT_REACHED" });
});

Deno.test("collectRoutingDimensions - só pega steps com routingDimension, ignora informativos", () => {
  const steps: FlowStep[] = [
    step({ id: "s1", stepKey: "loja", routingDimension: "STORE" }),
    step({ id: "s2", stepKey: "garantia", routingDimension: "WARRANTY", answerType: "CHOICE" }),
    step({ id: "s3", stepKey: "nota_fiscal", routingDimension: null, answerType: "FREE_TEXT", options: [] }),
    step({ id: "s4", stepKey: "marca", routingDimension: "BRAND", answerType: "FREE_TEXT", options: [] }),
  ];
  const collected = collectRoutingDimensions(steps, { loja: "store-serra", garantia: "Em garantia", nota_fiscal: "NF-123", marca: "Electrolux" });
  assertEquals(collected, { store: "store-serra", warranty: "Em garantia", brand: "Electrolux" });
});
Deno.test("collectRoutingDimensions - dimensão sem resposta ainda fica null", () => {
  const steps: FlowStep[] = [step({ id: "s1", stepKey: "loja", routingDimension: "STORE" })];
  assertEquals(collectRoutingDimensions(steps, {}), { store: null, warranty: null, brand: null });
});

function rule(overrides: Partial<RoutingRule>): RoutingRule {
  return { id: "r1", storeId: null, warrantyValue: null, brandValue: null, targetAttendantId: "u1", specificity: 1, ...overrides };
}

Deno.test("matchRoutingRules - regra mais específica vence (loja+garantia+marca > loja+garantia > loja)", () => {
  const rules: RoutingRule[] = [
    rule({ id: "geral-serra", storeId: "store-serra", specificity: 1, targetAttendantId: "fila-serra" }),
    rule({ id: "serra-garantia", storeId: "store-serra", warrantyValue: "EM GARANTIA", specificity: 2, targetAttendantId: "bruno" }),
    rule({ id: "serra-garantia-electrolux", storeId: "store-serra", warrantyValue: "EM GARANTIA", brandValue: "ELECTROLUX", specificity: 3, targetAttendantId: "ana" }),
  ];
  const matched = matchRoutingRules(rules, { store: "store-serra", warranty: "Em garantia", brand: "Electrolux" });
  assertEquals(matched?.targetAttendantId, "ana");
});
Deno.test("matchRoutingRules - marca diferente cai pra regra menos específica que ainda bate", () => {
  const rules: RoutingRule[] = [
    rule({ id: "geral-serra", storeId: "store-serra", specificity: 1, targetAttendantId: "fila-serra" }),
    rule({ id: "serra-garantia", storeId: "store-serra", warrantyValue: "EM GARANTIA", specificity: 2, targetAttendantId: "bruno" }),
    rule({ id: "serra-garantia-electrolux", storeId: "store-serra", warrantyValue: "EM GARANTIA", brandValue: "ELECTROLUX", specificity: 3, targetAttendantId: "ana" }),
  ];
  const matched = matchRoutingRules(rules, { store: "store-serra", warranty: "Em garantia", brand: "LG" });
  assertEquals(matched?.targetAttendantId, "bruno");
});
Deno.test("matchRoutingRules - normaliza maiúsculo/minúsculo/espaço antes de comparar", () => {
  const rules: RoutingRule[] = [rule({ storeId: "store-serra", brandValue: "  electrolux  ", specificity: 2, targetAttendantId: "ana" })];
  const matched = matchRoutingRules(rules, { store: "store-serra", warranty: null, brand: "ELECTROLUX" });
  assertEquals(matched?.targetAttendantId, "ana");
});
Deno.test("matchRoutingRules - nenhuma regra bate devolve null (chamador usa o atendente padrão)", () => {
  const rules: RoutingRule[] = [rule({ storeId: "store-vitoria", specificity: 1 })];
  assertEquals(matchRoutingRules(rules, { store: "store-serra", warranty: null, brand: null }), null);
});
Deno.test("matchRoutingRules - sem regra nenhuma configurada devolve null", () => {
  assertEquals(matchRoutingRules([], { store: "store-serra", warranty: null, brand: null }), null);
});

Deno.test("decideBotTrigger - sem fluxo publicado nunca faz nada", () => {
  assertEquals(decideBotTrigger({ hasPublishedFlow: false, withinBusinessHours: true }), "NONE");
  assertEquals(decideBotTrigger({ hasPublishedFlow: false, withinBusinessHours: false }), "NONE");
});
Deno.test("decideBotTrigger - fluxo publicado dentro do horário manda boas-vindas + 1ª pergunta", () => {
  assertEquals(decideBotTrigger({ hasPublishedFlow: true, withinBusinessHours: true }), "SEND_WELCOME_AND_FIRST_STEP");
});
Deno.test("decideBotTrigger - fluxo publicado fora do horário manda só a mensagem de fora do horário", () => {
  assertEquals(decideBotTrigger({ hasPublishedFlow: true, withinBusinessHours: false }), "SEND_AFTER_HOURS");
});
