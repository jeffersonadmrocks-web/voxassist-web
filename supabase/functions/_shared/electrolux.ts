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
  updatedAt: string;
  technicianName?: string | null;
  technicianExternalId?: string | null;
};

const CLOSED_STATUSES: Record<string, "CANCELADO" | "CONCLUIDO"> = {
  Cancelada: "CANCELADO",
  Encerrada: "CONCLUIDO",
};

export function deriveStatus(
  order: Pick<ElectroluxOrder, "status" | "internalStatus" | "appointmentDate">
): "ABERTO" | "AGENDADO" | "CONCLUIDO" | "CANCELADO" {
  if (CLOSED_STATUSES[order.status]) return CLOSED_STATUSES[order.status];
  if (order.internalStatus === "FECHADA") return "CONCLUIDO";
  if (order.appointmentDate) return "AGENDADO";
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
  return {
    origin: "ELECTROLUX" as const,
    external_id: order.id,
    external_order_number: order.svoNumber,
    appointment_date: order.appointmentDate ? order.appointmentDate.slice(0, 10) : null,
    period: derivePeriod(order.appointmentDate),
    status: deriveStatus(order),
    external_status_raw: order.status,
    external_internal_status: order.internalStatus,
    client_name: order.clientName,
    client_phone: order.clientPhone,
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
