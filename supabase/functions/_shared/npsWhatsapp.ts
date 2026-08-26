// Monta o link wa.me e a mensagem aprovada exatamente como a spec pede —
// texto fixo, só nome e filial são variáveis. Nunca envia nada sozinho:
// isso só monta a URL, quem confirma o clique é sempre uma pessoa.
export const ELECTROLUX_SURVEY_PHONE_DISPLAY = "+55 41 4042-1506";
export const ELECTROLUX_SURVEY_WA_LINK = "https://wa.me/554140421506";

export type FilialLabel = "Vitória" | "Serra";

export function buildApprovedMessage(clientFirstName: string, filial: FilialLabel): string {
  return [
    `Olá, ${clientFirstName}!`,
    "",
    `Seu atendimento foi finalizado. A Electrolux enviará uma pesquisa pelo número ${ELECTROLUX_SURVEY_PHONE_DISPLAY}, referente ao atendimento da nossa equipe - técnico e atendente.`,
    "",
    "Poderia reservar um momento para respondê-la? Sua avaliação é muito importante para continuarmos aprimorando nosso atendimento!",
    "",
    `Vox Eletrônica - ${filial}`,
  ].join("\n");
}

// wa.me exige dígitos só, com código do país. Cliente pode já vir com/sem 55.
export function toWhatsappDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function buildClientWhatsappLink(phone: string, message: string): string {
  return `https://wa.me/${toWhatsappDigits(phone)}?text=${encodeURIComponent(message)}`;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}
