// MessagingProvider — abstração que desacopla o Chat VoxAssist do
// mecanismo real de envio/recebimento de WhatsApp (arquitetura definida
// em 2026-08-28: VOXASSIST → CHAT VOXASSIST → MessagingService →
// MessagingProvider → WhatsAppQrProvider, e futuramente
// MetaCloudApiProvider). Nenhuma implementação concreta existe ainda —
// a biblioteca do WhatsAppQrProvider e a hospedagem do processo
// persistente são decisões separadas, ainda não tomadas. Este arquivo
// só define o contrato que qualquer provider futuro precisa cumprir,
// pra a interface do Chat nunca depender de qual provider está por
// trás.
export type OutboundMessage = {
  conversationId: string;
  connectionId: string;
  to: string; // telefone em E.164 (normalizePhone em messagingService.ts)
  body: string;
};

export type SendResult = {
  externalMessageId: string;
};

export interface MessagingProvider {
  readonly name: string;
  sendMessage(msg: OutboundMessage): Promise<SendResult>;
}

// Stub fail-closed: usado enquanto nenhum MessagingProvider real está
// configurado. Nunca finge sucesso — deixa claro pra quem chamar que o
// envio real ainda não existe, em vez de simular um retorno falso que
// esconderia o estado real do sistema.
export class NotImplementedMessagingProvider implements MessagingProvider {
  readonly name = "NOT_IMPLEMENTED";
  sendMessage(_msg: OutboundMessage): Promise<SendResult> {
    return Promise.reject(new Error("nenhum MessagingProvider configurado ainda"));
  }
}
