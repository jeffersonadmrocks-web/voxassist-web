// chat-gateway-proxy — lógica pura de roteamento (sem tocar rede/DB): a
// edge function faz a checagem de auth/JWT/role/posse da conexão e só
// então chama isto pra decidir qual rota do gateway chamar e com qual
// corpo. Mantém o VoxAssist desacoplado do gateway (o frontend nunca
// conhece a URL do Railway nem o token de serviço — só fala com esta
// function).
export type GatewayAction = "create" | "connect" | "qr" | "disconnect" | "reconnect";

export type ResolvedGatewayRequest =
  | { ok: true; path: string; method: "GET" | "POST"; body?: Record<string, unknown> }
  | { ok: false; error: string };

export function resolveGatewayRequest(
  action: string,
  input: { name?: unknown; storeId?: unknown; connectionId?: unknown },
  activeCompanyId: string
): ResolvedGatewayRequest {
  if (action === "create") {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return { ok: false, error: "missing_name" };
    const storeId = typeof input.storeId === "string" && input.storeId.trim() ? input.storeId.trim() : null;
    return { ok: true, path: "/connections", method: "POST", body: { name, companyId: activeCompanyId, storeId } };
  }

  const connectionId = typeof input.connectionId === "string" ? input.connectionId.trim() : "";
  if (!connectionId) return { ok: false, error: "missing_connection_id" };

  if (action === "connect") return { ok: true, path: `/connections/${connectionId}/connect`, method: "POST" };
  if (action === "reconnect") return { ok: true, path: `/connections/${connectionId}/reconnect`, method: "POST" };
  if (action === "disconnect") return { ok: true, path: `/connections/${connectionId}/disconnect`, method: "POST" };
  if (action === "qr") return { ok: true, path: `/connections/${connectionId}/qr`, method: "GET" };

  return { ok: false, error: "invalid_action" };
}
