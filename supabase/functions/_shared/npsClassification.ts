// Classificação automática de um caso de NPS, seguindo exatamente a tabela
// da seção 3 da spec. Só usa o que dá pra calcular com dado real (dias até
// concluir, nº de visitas aproximado, telefone válido) — reclamação,
// retorno técnico e reabertura não existem na Electrolux hoje, então
// entram como `false` na criação automática e só passam a valer via ação
// manual do "Caso de atenção" (seção 8), fora deste módulo.
export type NpsClassification = "ALTA" | "MEDIA" | "ATENCAO" | "NAO_ELEGIVEL";

export type ClassificationInput = {
  daysToConclude: number | null; // null quando external_created_at é desconhecido
  visitCount: number;
  hasComplaint: boolean;
  hasReturnVisit: boolean;
  hasReopening: boolean;
  whatsappValid: boolean;
  daysSinceConclusion: number; // usado só pra "fora do prazo de acompanhamento"
};

// Atraso relevante = indício de insatisfação por demora (seção 3, "Caso de
// atenção"). Limiar deliberadamente maior que o de MEDIA (10 dias).
const ATTENTION_DELAY_THRESHOLD_DAYS = 30;
// Prazo de acompanhamento: casos concluídos há mais tempo que isso quando
// primeiro vistos não entram elegíveis (represados, sem valor de contato).
export const FOLLOW_UP_WINDOW_DAYS = 45;

export function classifyCase(input: ClassificationInput): NpsClassification {
  if (!input.whatsappValid) return "NAO_ELEGIVEL";
  if (input.daysSinceConclusion > FOLLOW_UP_WINDOW_DAYS) return "NAO_ELEGIVEL";

  const hasAttentionSignal =
    input.hasComplaint ||
    input.hasReturnVisit ||
    input.hasReopening ||
    (input.daysToConclude !== null && input.daysToConclude > ATTENTION_DELAY_THRESHOLD_DAYS);
  if (hasAttentionSignal) return "ATENCAO";

  const withinTenDays = input.daysToConclude !== null && input.daysToConclude <= 10;
  const singleVisit = input.visitCount <= 1;
  if (withinTenDays && singleVisit) return "ALTA";

  return "MEDIA";
}

// Validação simples de celular BR: DDD (2 dígitos) + 8 ou 9 dígitos, com ou
// sem código do país (55) e sem exigir formatação específica.
export function isValidBrazilianPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  const withoutCountryCode = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return /^[1-9]{2}9?\d{8}$/.test(withoutCountryCode);
}

// Conta visitas aproximando por trocas reais de appointment_date registradas
// no histórico de sincronização — não é uma contagem oficial da Electrolux
// (ela não expõe isso), documentado como limitação conhecida.
export function estimateVisitCount(
  historyEntries: Array<{ previous_data: { appointment_date?: string | null }; new_data: { appointment_date?: string | null } }>
): number {
  const reschedules = historyEntries.filter(
    (h) => h.new_data.appointment_date && h.new_data.appointment_date !== h.previous_data.appointment_date
  ).length;
  return Math.max(1, reschedules);
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}
