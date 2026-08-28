// Decisão de escalonamento de alerta de inatividade operacional — pura, sem
// tocar rede/DB. A edge function operational-alerts-scan busca os dados
// (último evento do usuário, tarefas pendentes, justificativa ativa,
// alerta já aberto, thresholds de operational_expectations) e só então
// chama isto. Resolução de alerta (quando um evento novo chega) é feita
// por trigger no banco, não aqui — esta função só decide se escalona.
export type Severity = "LEMBRETE" | "ATENCAO" | "OCORRENCIA" | "CRITICO";

const SEVERITY_ORDER: Severity[] = ["LEMBRETE", "ATENCAO", "OCORRENCIA", "CRITICO"];

function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

export type Thresholds = {
  lembreteMinutes: number;
  atencaoMinutes: number;
  ocorrenciaMinutes: number;
  criticoMinutes: number;
};

// Faixa 0-20min é "somente monitoramento" (seção 5 do documento) — não
// gera nenhuma linha de alerta.
export function severityForMinutes(minutes: number, t: Thresholds): Severity | null {
  if (minutes >= t.criticoMinutes) return "CRITICO";
  if (minutes >= t.ocorrenciaMinutes) return "OCORRENCIA";
  if (minutes >= t.atencaoMinutes) return "ATENCAO";
  if (minutes >= t.lembreteMinutes) return "LEMBRETE";
  return null;
}

export const ESCALATION_MESSAGES: Record<Severity, string> = {
  LEMBRETE: "Você tem tarefas pendentes e nenhuma atividade registrada recentemente. Que tal retomar?",
  ATENCAO: "Atenção: sem atividade operacional há um tempo, com tarefas pendentes.",
  OCORRENCIA: "Ocorrência registrada: período prolongado sem atividade com demanda ativa.",
  CRITICO: "Alerta crítico: inatividade prolongada com tarefas pendentes. Intervenção pode ser necessária.",
};

export type ExistingActiveAlert = { id: string; severity: Severity } | null;

export type EscalationDecision =
  | { action: "none" }
  | { action: "update"; alertId: string; severity: Severity; message: string }
  | { action: "create"; severity: Severity; message: string };

export function decideEscalation(input: {
  minutesSinceLastEvent: number | null;
  pendingTaskCount: number;
  hasActiveJustification: boolean;
  thresholds: Thresholds;
  existingActiveAlert: ExistingActiveAlert;
}): EscalationDecision {
  const { minutesSinceLastEvent, pendingTaskCount, hasActiveJustification, thresholds, existingActiveAlert } = input;

  // "Nenhuma ocorrência de baixa atividade deve ser registrada como
  // crítica se não houver demanda pendente" — regra de negócio essencial.
  if (pendingTaskCount <= 0) return { action: "none" };
  if (hasActiveJustification) return { action: "none" };
  if (minutesSinceLastEvent === null) return { action: "none" };

  const severity = severityForMinutes(minutesSinceLastEvent, thresholds);
  if (!severity) return { action: "none" };

  if (existingActiveAlert) {
    // "Alertas sucessivos formam uma única ocorrência escalonada" — só
    // escala (update) quando a faixa sobe; nunca duplica nem rebaixa.
    if (severityRank(severity) > severityRank(existingActiveAlert.severity)) {
      return { action: "update", alertId: existingActiveAlert.id, severity, message: ESCALATION_MESSAGES[severity] };
    }
    return { action: "none" };
  }

  return { action: "create", severity, message: ESCALATION_MESSAGES[severity] };
}

// Alerta de prazo (componente "Alertas" da Minha Jornada: "avisos
// progressivos de tarefa parada, baixa atividade e prazo") — sem
// escalonamento, é binário: está ou não dentro da janela.
export function isDeadlineApproaching(dueAt: string | null, now: Date, windowMinutes = 30): boolean {
  if (!dueAt) return false;
  const diffMs = new Date(dueAt).getTime() - now.getTime();
  return diffMs > 0 && diffMs <= windowMinutes * 60 * 1000;
}
