// chat-delete-message — "apagar para todos" (achado do usuário
// 2026-09-03): revoga de verdade uma mensagem enviada pelo VoxAssist
// no WhatsApp, via voxassist-whatsapp-gateway (POST
// /connections/:id/delete-message, protocolo nativo de revogação do
// Baileys). Mesmo padrão de chat-send-message (userClient pra RLS,
// admin só depois da confirmação real do gateway).
//
// REGRA FUNDAMENTAL do usuário (2026-09-03): mensagem de texto nunca
// desaparece do VoxAssist -- revogar no WhatsApp só marca deleted_at
// aqui (mesmo campo/mesma exibição já usados pra mensagem apagada
// PELO CLIENTE no WhatsApp, "🗑 Apagada — mantida aqui como
// registro"). NUNCA um DELETE FROM chat_messages.
//
// Só revoga mensagem OUTBOUND com external_message_id (foi realmente
// enviada) -- não existe no WhatsApp a possibilidade de apagar uma
// mensagem que o CLIENTE mandou, nem uma que nunca chegou a sair
// (nota interna, importada do histórico).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_URL = Deno.env.get("CHAT_GATEWAY_URL");
const GATEWAY_SERVICE_TOKEN = Deno.env.get("CHAT_GATEWAY_SERVICE_TOKEN");
const TIMEOUT_MS = 15000;

type MessageRow = {
  id: string;
  conversation_id: string;
  direction: string;
  origin: string;
  external_message_id: string | null;
  deleted_at: string | null;
  chat_conversations: { connection_id: string | null; remote_jid: string | null; customer_phone: string | null; chat_connections: { status: string } | null } | null;
};

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
    // userClient (não service_role): só quem já enxerga a mensagem pela
    // RLS de chat_messages/chat_conversations pode pedir a revogação --
    // mesmo princípio de chat-send-message.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return respond({ ok: false, error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : "";
    if (!messageId) {
      return respond({ ok: false, error: "missing_message_id" }, 400);
    }

    const { data: message } = await userClient
      .from("chat_messages")
      .select("id, conversation_id, direction, origin, external_message_id, deleted_at, chat_conversations(connection_id, remote_jid, customer_phone, chat_connections(status))")
      .eq("id", messageId)
      .maybeSingle<MessageRow>();
    if (!message) {
      return respond({ ok: false, error: "message_not_found" }, 404);
    }
    if (message.deleted_at) {
      return respond({ ok: false, error: "already_deleted" }, 400);
    }
    if (message.direction !== "OUTBOUND") {
      return respond({ ok: false, error: "not_deletable", message: "Só é possível apagar mensagens enviadas pelo VoxAssist -- não é possível apagar uma mensagem do cliente." }, 400);
    }
    if (message.origin === "INTERNAL" || message.origin === "IMPORT") {
      return respond({ ok: false, error: "not_deletable", message: "Nota interna e histórico importado não passam pelo WhatsApp -- não há o que revogar lá." }, 400);
    }
    if (!message.external_message_id) {
      return respond({ ok: false, error: "not_deletable", message: "Esta mensagem não chegou a ser enviada de verdade ao WhatsApp." }, 400);
    }

    const conversation = message.chat_conversations;
    if (!conversation?.connection_id) {
      return respond({ ok: false, error: "conversation_without_connection" }, 400);
    }
    if (!GATEWAY_URL || !GATEWAY_SERVICE_TOKEN) {
      return respond({ ok: false, error: "gateway_not_configured" }, 503);
    }
    const to = conversation.remote_jid || (conversation.customer_phone ? `${conversation.customer_phone}@s.whatsapp.net` : null);
    if (!to) {
      return respond({ ok: false, error: "conversation_without_target" }, 400);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const gatewayRes = await fetch(`${GATEWAY_URL}/connections/${conversation.connection_id}/delete-message`, {
        method: "POST",
        headers: { Authorization: `Bearer ${GATEWAY_SERVICE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to, externalMessageId: message.external_message_id }),
        signal: controller.signal,
      });
      const data = await gatewayRes.json().catch(() => null);
      if (!gatewayRes.ok || !data?.ok) {
        return respond({ ok: false, error: "delete_failed", message: data?.error ?? "Falha ao apagar pelo gateway." }, 502);
      }
    } catch {
      return respond({ ok: false, error: "gateway_unreachable" }, 502);
    } finally {
      clearTimeout(timer);
    }

    // Revogação confirmada pelo gateway -- marca aqui, nunca apaga a
    // linha (regra explícita do usuário: mensagem de texto sempre
    // registrada no VoxAssist).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const now = new Date().toISOString();
    await admin.from("chat_messages").update({ deleted_at: now }).eq("id", messageId);

    return respond({ ok: true }, 200);
  } catch {
    return respond({ ok: false, error: "internal_error" }, 500);
  }
});
