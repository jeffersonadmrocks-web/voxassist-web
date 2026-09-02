// chatBotFlow — lógica pura do Robô de Atendimento (Central de
// Conversas), no mesmo espírito de messagingService.ts: sem tocar
// rede/DB, só decide dado o estado já carregado. chat-inbound-webhook
// (Fase 5) é quem lê/grava no banco e chama estas funções pra decidir
// o quê fazer.

export type StepAnswerType = "CHOICE" | "FREE_TEXT";
export type StepOption = { value: string; label: string };

export type FlowStep = {
  id: string;
  stepKey: string;
  stepOrder: number;
  questionText: string;
  answerType: StepAnswerType;
  options: StepOption[];
  routingDimension: "STORE" | "WARRANTY" | "BRAND" | null;
  active: boolean;
};

export type StepCondition = {
  stepId: string;
  dependsOnStepId: string;
  dependsOnValue: string;
};

// Achado do usuário em 2026-09-02 (pacote fila/robô/presença):
// destino de uma regra de roteamento deixou de ser um atendente
// individual e passou a ser uma FILA DE ATENDIMENTO (chat_queues) --
// permite trocar quem está na fila sem republicar o robô, e todo
// integrante autorizado enxerga a conversa enquanto não atribuída
// (ver RLS em chat_conversations, migration chat_queues).
export type RoutingRule = {
  id: string;
  storeId: string | null;
  warrantyValue: string | null;
  brandValue: string | null;
  targetQueueId: string;
  specificity: number;
};

// Normaliza pra casar de forma confiável (mesma normalização do
// trigger chat_bot_routing_rules_normalize no banco -- os dois lados
// precisam concordar, senão uma resposta nunca bate com a regra).
export function normalizeAnswerValue(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed === "" ? null : trimmed;
}

// Um step só é elegível se: está ativo, ainda não foi respondido, e
// (se tiver condição) a condição bate com a resposta já dada. Não
// mexe em rede/DB -- recebe tudo já carregado.
export function isStepEligible(
  step: FlowStep,
  answers: Record<string, string>,
  conditions: StepCondition[],
  stepsById: Record<string, FlowStep>,
): boolean {
  if (!step.active) return false;
  if (Object.prototype.hasOwnProperty.call(answers, step.stepKey)) return false;
  const condition = conditions.find((c) => c.stepId === step.id);
  if (!condition) return true;
  const dependsOnStep = stepsById[condition.dependsOnStepId];
  if (!dependsOnStep) return false; // condição órfã -- nunca elegível, nunca quebra
  const givenAnswer = answers[dependsOnStep.stepKey];
  if (givenAnswer == null) return false; // a pergunta da qual depende ainda não foi respondida
  return normalizeAnswerValue(givenAnswer) === normalizeAnswerValue(condition.dependsOnValue);
}

// Primeiro step, em ordem, que está elegível agora -- cobre tanto "só
// começando" (answers vazio) quanto "retomando de onde parou" (pula
// os já respondidos) quanto "acabou de responder algo que libera uma
// pergunta condicional" (a condicional aparece na posição natural
// dela, não no fim).
export function resolveNextEligibleStep(
  steps: FlowStep[],
  answers: Record<string, string>,
  conditions: StepCondition[],
): FlowStep | null {
  const stepsById = Object.fromEntries(steps.map((s) => [s.id, s]));
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  for (const step of sorted) {
    if (isStepEligible(step, answers, conditions, stepsById)) return step;
  }
  return null;
}

export type AnswerValidation = { valid: boolean; normalizedValue: string | null; error: string | null };

// CHOICE: precisa bater (sem diferenciar maiúsculo/minúsculo/espaço)
// com o VALUE ou o LABEL de uma das opções configuradas -- cliente
// real digita "garantia", não necessariamente o value exato. Devolve
// sempre o value canônico da opção, nunca o texto livre do cliente,
// pra casar de forma confiável com as regras de roteamento depois.
// FREE_TEXT: qualquer texto não-vazio é válido, guardado como veio
// (só trim) -- é conteúdo informativo, não passa por matching exato
// de regra a não ser que routingDimension esteja setado (aí normaliza
// só no momento de casar a regra, nunca destrói o valor mostrado).
export function validateAnswer(step: FlowStep, rawText: string): AnswerValidation {
  const trimmed = (rawText || "").trim();
  if (!trimmed) return { valid: false, normalizedValue: null, error: "Resposta vazia." };
  if (step.answerType === "FREE_TEXT") {
    return { valid: true, normalizedValue: trimmed, error: null };
  }
  const norm = normalizeAnswerValue(trimmed);
  const match = step.options.find((o) => normalizeAnswerValue(o.value) === norm || normalizeAnswerValue(o.label) === norm);
  if (!match) return { valid: false, normalizedValue: null, error: "Resposta não reconhecida entre as opções." };
  return { valid: true, normalizedValue: match.value, error: null };
}

const BYPASS_TRIGGER_PATTERNS = [/atendente/i, /humano/i, /pessoa\s*real/i, /operador/i, /falar\s*com\s*algu[ée]m/i];

// Gatilho fixo "falar com atendente" -- só funciona quando o fluxo
// tem alwaysHumanToggle ligado (config real, não hardcoded no bot).
export function isBypassTrigger(rawText: string, alwaysHumanEnabled: boolean): boolean {
  if (!alwaysHumanEnabled) return false;
  const text = (rawText || "").trim();
  if (!text) return false;
  return BYPASS_TRIGGER_PATTERNS.some((re) => re.test(text));
}

export type TriageStepOutcome =
  | { outcome: "BYPASS" }
  | { outcome: "INVALID_RETRY"; attemptCount: number }
  | { outcome: "RETRY_LIMIT_REACHED" }
  | { outcome: "ANSWERED"; normalizedValue: string };

// Decisão central de UMA mensagem inbound durante a triagem -- o
// webhook só aplica o resultado (grava resposta, incrementa
// tentativa, encaminha etc.), toda a regra fica aqui, testável sem
// banco.
export function decideTriageStep(input: {
  step: FlowStep;
  rawText: string;
  attemptCount: number;
  retryLimit: number;
  alwaysHumanEnabled: boolean;
}): TriageStepOutcome {
  if (isBypassTrigger(input.rawText, input.alwaysHumanEnabled)) return { outcome: "BYPASS" };
  const validation = validateAnswer(input.step, input.rawText);
  if (validation.valid && validation.normalizedValue != null) {
    return { outcome: "ANSWERED", normalizedValue: validation.normalizedValue };
  }
  const nextAttempt = input.attemptCount + 1;
  if (nextAttempt >= input.retryLimit) return { outcome: "RETRY_LIMIT_REACHED" };
  return { outcome: "INVALID_RETRY", attemptCount: nextAttempt };
}

// Junta as respostas já dadas com o mapeamento step->dimensão de
// roteamento -- steps sem routingDimension são só informativos,
// ignorados aqui de propósito (não é toda pergunta que alimenta
// regra). Convenção obrigatória pro step com routingDimension='STORE':
// as opções precisam ter value=stores.id (uuid) e label=stores.name --
// é o value (não o label) que fica em answers e é comparado direto
// contra chat_bot_routing_rules.store_id em matchRoutingRules. A tela
// de configuração (Fase 6) preenche essas opções a partir da tabela
// stores de verdade, nunca texto livre do GESTOR.
export function collectRoutingDimensions(
  steps: FlowStep[],
  answers: Record<string, string>,
): { store: string | null; warranty: string | null; brand: string | null } {
  const byDimension: Record<string, string | null> = { STORE: null, WARRANTY: null, BRAND: null };
  for (const step of steps) {
    if (!step.routingDimension) continue;
    const answer = answers[step.stepKey];
    if (answer != null) byDimension[step.routingDimension] = answer;
  }
  return { store: byDimension.STORE, warranty: byDimension.WARRANTY, brand: byDimension.BRAND };
}

// Achado do usuário em 2026-09-02: o GESTOR configurou a mensagem de
// boas-vindas com "{{nome_contato}}" esperando substituição
// automática -- não existia NENHUM mecanismo de template em lugar
// nenhum, o placeholder ia pro cliente literalmente ("Olá!
// {{nome_contato}} ..."). Substitui só as chaves conhecidas (primeiro
// nome, mesmo critério já usado em npsWhatsapp.ts); uma chave
// desconhecida (erro de digitação do GESTOR) fica como está -- nunca
// finge um dado que não tem; sem o nome (contato ainda não
// identificado, ninguém atribuído ainda), vira string vazia, nunca um
// nome genérico inventado.
export type BotTemplateVars = { contactName?: string | null; attendantName?: string | null };

function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export function renderBotTemplate(template: string, vars: BotTemplateVars): string {
  const known: Record<string, string> = {
    nome_contato: firstNameOf(vars.contactName),
    nome_atendente: firstNameOf(vars.attendantName),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in known ? known[key] : match));
}

// Casa a combinação coletada contra as regras -- maior especificidade
// que bater em TODAS as dimensões que a regra exige (dimensão nula na
// regra = curinga, aceita qualquer valor coletado, inclusive nenhum).
// Nunca inventa: sem regra batendo, devolve null (chamador usa o
// atendente padrão da versão).
export function matchRoutingRules(
  rules: RoutingRule[],
  collected: { store: string | null; warranty: string | null; brand: string | null },
): RoutingRule | null {
  const storeNorm = normalizeAnswerValue(collected.store);
  const warrantyNorm = normalizeAnswerValue(collected.warranty);
  const brandNorm = normalizeAnswerValue(collected.brand);
  const matching = rules.filter((r) => {
    if (r.storeId != null && r.storeId !== collected.store) return false;
    if (r.warrantyValue != null && normalizeAnswerValue(r.warrantyValue) !== warrantyNorm) return false;
    if (r.brandValue != null && normalizeAnswerValue(r.brandValue) !== brandNorm) return false;
    return true;
  });
  if (!matching.length) return null;
  return [...matching].sort((a, b) => b.specificity - a.specificity)[0];
}
