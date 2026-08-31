// MessagingService — lógica pura do Chat VoxAssist, independente de
// qual MessagingProvider está configurado (ver messagingProvider.ts).
// Sem tocar rede/DB: os futuros edge functions de envio/recebimento
// chamam isto pra decidir o quê fazer, e só então tocam banco/provider.
// Mesmo padrão de todo o backend do VoxAssist (npsClassification.ts,
// appGateway.ts, operationalAlerts.ts, technicianMatch.ts).

// Validação de celular BR — mesmo critério já usado e comprovado em
// npsClassification.ts (isValidBrazilianPhone), adaptado pra devolver o
// número normalizado (com código do país) em vez de só true/false, já
// que o provider vai precisar do formato E.164-ish pra enviar.
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const withoutCountryCode = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (!/^[1-9]{2}9?\d{8}$/.test(withoutCountryCode)) return null;
  return `55${withoutCountryCode}`;
}

// Achado real (2026-08-31, primeiro teste com WhatsApp de verdade): o
// webhook de recebimento usava normalizePhone (validação estrita de
// celular BR) pra identificar quem mandou a mensagem, e rejeitava com
// 400 remetentes que não batiam esse formato exato — mesmo o gateway já
// tendo validado o JID como um contato individual válido. Validar
// "dá pra ENVIAR pra esse número" (normalizePhone) é uma pergunta
// diferente de "quem é esse remetente" (aqui) — a segunda precisa ser
// mais permissiva, só o suficiente pra funcionar como identificador
// estável da conversa. Mesmo critério de dígitos (8-15) já usado no
// extractPhoneNumber do gateway (repo voxassist-whatsapp-gateway).
export function sanitizeInboundContactId(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export type OutboundValidationInput = { body: string | null | undefined; connectionStatus: string };
export type OutboundValidationResult = { ok: true } | { ok: false; error: string };

// Nunca deixa enviar mensagem vazia nem por uma conexão que não está
// CONECTADO — o próprio schema já força status default DESCONECTADO em
// toda conexão nova, então esta checagem é a segunda linha de defesa
// (a primeira é o provider real recusar, quando existir).
export function validateOutboundMessage(input: OutboundValidationInput): OutboundValidationResult {
  if (!input.body || !input.body.trim()) return { ok: false, error: "Mensagem vazia." };
  if (input.connectionStatus !== "CONECTADO") return { ok: false, error: "A conexão selecionada não está CONECTADO." };
  return { ok: true };
}

export type ExistingConversation = { id: string; status: string };
export type ConversationTarget = { action: "REUSE"; conversationId: string } | { action: "CREATE" };

// Uma mensagem inbound pro mesmo telefone+conexão reaproveita a
// conversa mais recente que ainda não foi FINALIZADA, em vez de criar
// uma conversa nova a cada mensagem (isso fragmentaria o histórico e
// quebraria "vínculo conversa ↔ cliente/OS" com o contexto espalhado).
export function decideConversationTarget(existingForPhone: ExistingConversation[]): ConversationTarget {
  const open = existingForPhone.find((c) => c.status !== "FINALIZADA");
  if (open) return { action: "REUSE", conversationId: open.id };
  return { action: "CREATE" };
}

// Uma resposta do cliente enquanto a conversa está AGUARDANDO_CLIENTE
// devolve a bola pro atendimento — outros status (ABERTA/EM_ATENDIMENTO)
// não mudam só por uma mensagem chegando. FINALIZADA nunca chega aqui
// (decideConversationTarget já filtra e cria uma conversa nova nesse caso).
export function nextStatusOnInboundMessage(current: string): string {
  return current === "AGUARDANDO_CLIENTE" ? "EM_ATENDIMENTO" : current;
}

// Prévia pra listagem da Central de Conversas — trunca texto longo,
// rotula mídia sem corpo de texto (áudio/imagem/etc.) de forma legível
// em vez de mostrar uma prévia vazia.
export function buildMessagePreview(body: string | null | undefined, maxLen = 80): string {
  const text = String(body ?? "").trim();
  if (!text) return "[mídia]";
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}
