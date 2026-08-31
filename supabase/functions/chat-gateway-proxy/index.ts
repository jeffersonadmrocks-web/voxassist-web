// chat-gateway-proxy — única ponte autorizada entre o VoxAssist e o
// gateway WhatsApp (voxassist-whatsapp-gateway, repositório separado no
// Railway). O frontend NUNCA fala com o gateway diretamente — só com
// esta function, que segura o token de serviço do gateway (nunca vai
// pro navegador) e decide, com JWT + role reais, se o usuário pode
// mexer na conexão pedida.
//
// Restrito a GESTOR (mesmo critério de "administra conexões" das RLS
// de chat_connections). company_id nunca vem do body — sempre da
// active_company_id do perfil autenticado, então um usuário não
// consegue criar/mexer numa conexão de outra empresa nem forjando o
// payload.
//
// CORS: mesmo achado real do digisac-test — toda resposta (incluindo
// OPTIONS e erros) precisa dos headers de CORS.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { resolveGatewayRequest } from "../_shared/chatGatewayProxy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_URL = Deno.env.get("CHAT_GATEWAY_URL");
const GATEWAY_SERVICE_TOKEN = Deno.env.get("CHAT_GATEWAY_SERVICE_TOKEN");
const TIMEOUT_MS = 15000;

type Profile = { role: string | null; active_company_id: string | null };
type ConnectionRow = { id: string; company_id: string };

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  function respond(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    if (req.method !== "POST") {
      return respond({ ok: false, error: "method_not_allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ ok: false, error: "unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return respond({ ok: false, error: "unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin.from("profiles").select("role, active_company_id").eq("id", user.id).maybeSingle<Profile>();

    if (profile?.role !== "GESTOR") {
      return respond({ ok: false, error: "forbidden" }, 403);
    }
    if (!profile.active_company_id) {
      return respond({ ok: false, error: "no_active_company" }, 400);
    }

    if (!GATEWAY_URL || !GATEWAY_SERVICE_TOKEN) {
      return respond({ ok: false, error: "gateway_not_configured" }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";

    const resolved = resolveGatewayRequest(action, body, profile.active_company_id);
    if (!resolved.ok) {
      return respond({ ok: false, error: resolved.error }, 400);
    }

    // Confere posse da conexão ANTES de repassar pro gateway — nunca
    // confia que o connectionId pertence à empresa ativa do usuário só
    // porque ele mandou esse valor.
    if (action !== "create") {
      const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
      const { data: connection } = await admin.from("chat_connections").select("id, company_id").eq("id", connectionId).maybeSingle<ConnectionRow>();
      if (!connection || connection.company_id !== profile.active_company_id) {
        return respond({ ok: false, error: "connection_not_found" }, 404);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const gatewayRes = await fetch(`${GATEWAY_URL}${resolved.path}`, {
        method: resolved.method,
        headers: {
          Authorization: `Bearer ${GATEWAY_SERVICE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: resolved.body ? JSON.stringify(resolved.body) : undefined,
        signal: controller.signal,
      });
      const data = await gatewayRes.json().catch(() => null);
      return respond({ ok: gatewayRes.ok, ...(data ?? {}) }, gatewayRes.status);
    } catch {
      return respond({ ok: false, error: "gateway_unreachable" }, 502);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return respond({ ok: false, error: "internal_error" }, 500);
  }
});
