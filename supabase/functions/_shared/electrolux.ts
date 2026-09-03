// Mapeamento cru dos dados da Electrolux (GET /api/dashboard/service-orders)
// pro formato de external_appointments. Não inventa campo nenhum: só usa o
// que a API real expõe hoje. `technicianName`/`technicianExternalId` são
// opcionais de propósito — a Electrolux não manda isso ainda, mas o
// mapeamento já está pronto pro dia em que mandar.
export type ElectroluxOrder = {
  id: string;
  svoNumber: string;
  clientName: string;
  clientPhone: string | null;
  claimedDefect: string;
  status: string;
  internalStatus: string;
  createdDate: string;
  appointmentDate: string | null;
  // Modelo do produto -- confirmado ao vivo (achado 2026-09-03) que já
  // vem na própria listagem, sem precisar do detalhe por id.
  productName?: string | null;
  // Campo real de agendamento no retorno atual da API (confirmado
  // inspecionando a resposta crua em 2026-08-28: appointmentDate está
  // sempre null hoje; firstQueuedDateTime é quem carrega a data/hora do
  // atendimento — 166/217 SVOs tinham esse campo preenchido contra 0 com
  // appointmentDate). Mantemos os dois: se a Electrolux voltar a mandar
  // appointmentDate no futuro, ele continua tendo prioridade.
  firstQueuedDateTime: string | null;
  updatedAt: string;
  technicianName?: string | null;
  technicianExternalId?: string | null;
};

const CLOSED_STATUSES: Record<string, "CANCELADO" | "CONCLUIDO"> = {
  Cancelada: "CANCELADO",
  Encerrada: "CONCLUIDO",
};

// Data/hora efetiva de agendamento — ver comentário em firstQueuedDateTime.
export function effectiveScheduledAt(
  order: Pick<ElectroluxOrder, "appointmentDate" | "firstQueuedDateTime">
): string | null {
  return order.appointmentDate || order.firstQueuedDateTime || null;
}

export function deriveStatus(
  order: Pick<ElectroluxOrder, "status" | "internalStatus" | "appointmentDate" | "firstQueuedDateTime">
): "ABERTO" | "AGENDADO" | "CONCLUIDO" | "CANCELADO" {
  if (CLOSED_STATUSES[order.status]) return CLOSED_STATUSES[order.status];
  if (order.internalStatus === "FECHADA") return "CONCLUIDO";
  if (effectiveScheduledAt(order)) return "AGENDADO";
  return "ABERTO";
}

// A Electrolux não tem campo de período separado — no fluxo de auto-agendamento
// via WhatsApp, o turno vem embutido na hora do appointmentDate (9h ou 14h).
export function derivePeriod(appointmentDate: string | null): "MANHA" | "TARDE" | null {
  if (!appointmentDate) return null;
  const hour = new Date(appointmentDate).getUTCHours();
  return hour < 12 ? "MANHA" : "TARDE";
}

export function mapOrderToRow(order: ElectroluxOrder) {
  const scheduledAt = effectiveScheduledAt(order);
  return {
    origin: "ELECTROLUX" as const,
    external_id: order.id,
    external_order_number: order.svoNumber,
    appointment_date: scheduledAt ? scheduledAt.slice(0, 10) : null,
    period: derivePeriod(scheduledAt),
    status: deriveStatus(order),
    external_status_raw: order.status,
    external_internal_status: order.internalStatus,
    client_name: order.clientName,
    client_phone: order.clientPhone,
    product_name: order.productName || null,
    notes: order.claimedDefect,
    external_created_at: order.createdDate,
    external_updated_at: order.updatedAt,
    last_synced_at: new Date().toISOString(),
    sync_error: null,
  };
}

// concluded_at só pode ser setado uma vez (nunca sobrescrito depois que o
// pedido já foi observado como concluído) — por isso fica de fora do
// mapeamento puro acima e é decidido pelo chamador, que tem acesso à linha
// já existente. Usada tanto no upsert normal quanto na resolução de pedido
// "sumido" da listagem.
export function resolveConcludedAt(
  newStatus: "ABERTO" | "AGENDADO" | "CONCLUIDO" | "CANCELADO",
  existingConcludedAt: string | null | undefined
): string | null {
  if (existingConcludedAt) return existingConcludedAt;
  if (newStatus === "CONCLUIDO") return new Date().toISOString();
  return null;
}

// Campos de NPS do endpoint de detalhe (GET /api/dashboard/service-orders/{id})
// -- existem pra qualquer SVO, aberta ou encerrada (confirmado ao vivo,
// auditoria 2026-09-03). npsValue é a nota 0-10 do cliente;
// npsTechnicianValue é a nota do técnico na mesma pesquisa, quando a
// Electrolux separa os dois. npsScore (0/100 por resposta) não é usado --
// é uma derivação da própria Electrolux, não a nota que nps_cases guarda.
export type ElectroluxNpsDetail = {
  npsStatus?: string | null;
  npsValue?: number | null;
  npsComments?: string | null;
  npsDateAnswer?: string | null;
  npsTechnicianValue?: number | null;
};

export type NpsResponseParsed = {
  responded: boolean;
  score: number | null;
  technicianScore: number | null;
  comment: string | null;
  respondedAt: string | null;
};

export function parseNpsResponse(detail: ElectroluxNpsDetail): NpsResponseParsed {
  const responded =
    detail.npsStatus === "Respondido" &&
    typeof detail.npsValue === "number" &&
    detail.npsValue >= 0 &&
    detail.npsValue <= 10;
  if (!responded) {
    return { responded: false, score: null, technicianScore: null, comment: null, respondedAt: null };
  }
  const technicianScore =
    typeof detail.npsTechnicianValue === "number" && detail.npsTechnicianValue >= 0 && detail.npsTechnicianValue <= 10
      ? detail.npsTechnicianValue
      : null;
  return {
    responded: true,
    score: detail.npsValue as number,
    technicianScore,
    comment: detail.npsComments || null,
    respondedAt: detail.npsDateAnswer || null,
  };
}

const DIACRITICS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
