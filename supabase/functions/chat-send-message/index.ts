// chat-send-message — gateway isolado de envio do Chat VoxAssist (ETAPA
// B, item 9). Único ponto autorizado pelo qual o frontend pode disparar
// uma mensagem — nunca Frontend → provider diretamente (arquitetura
// definida em 2026-08-28). Hoje NÃO envia nada de verdade: nenhum
// MessagingProvider está configurado (a biblioteca do WhatsAppQrProvider
// e a hospedagem do processo persistente são decisões separadas, ainda
// não tomadas). Esta function existe pra já fixar o formato do contrato
// (auth, validação, RLS da conversa) sem fingir que o envio funciona —
// responde 501 "provider_not_configured" de propósito.
//
// CORS: mesmo achado real do digisac-test — toda resposta (incluindo
// OPTIONS e erros) precisa dos headers de CORS, senão o navegador
// bloqueia o fetch antes dele sair.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { validateOutboundMessage } from "../_shared/messagingService.ts";
import { NotImplementedMessagingProvider } from "../_shared/messagingProvider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type ConversationRow = {
  id: string;
  connection_id: string | null;
  chat_connections: { status: string } | null;
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
    // userClient (não service_role): a visibilidade da conversa é
    // decidida pela RLS de chat_conversations, do jeito que o usuário
    // que chamou realmente enxerga — GESTOR/ATENDENTE veem as da
    // empresa ativa, TECNICO só a conversa atribuída a ele ou vinculada
    // à OS da qual é responsável.
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
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
    const text = typeof body?.body === "string" ? body.body : "";
    if (!conversationId) {
      return respond({ ok: false, error: "missing_conversation_id" }, 400);
    }

    const { data: conversation } = await userClient
      .from("chat_conversations")
      .select("id, connection_id, chat_connections(status)")
      .eq("id", conversationId)
      .maybeSingle<ConversationRow>();
    if (!conversation) {
      // Mesma resposta pra "não existe" e "existe mas RLS não deixa ver"
      // — não vaza se a conversa existe em outra empresa.
      return respond({ ok: false, error: "conversation_not_found" }, 404);
    }

    const connectionStatus = conversation.chat_connections?.status ?? "DESCONECTADO";
    const validation = validateOutboundMessage({ body: text, connectionStatus });
    if (!validation.ok) {
      return respond({ ok: false, error: "invalid_message", message: validation.error }, 400);
    }

    const provider = new NotImplementedMessagingProvider();
    try {
      await provider.sendMessage({
        conversationId: conversation.id,
        connectionId: conversation.connection_id ?? "",
        to: "",
        body: text,
      });
      // Inalcançável hoje — nenhum provider real está plugado.
      return respond({ ok: true }, 200);
    } catch {
      return respond(
        {
          ok: false,
          error: "provider_not_configured",
          message: "Nenhum MessagingProvider está configurado ainda — o envio real de WhatsApp é uma etapa futura, ainda não implementada.",
        },
        501
      );
    }
  } catch {
    return respond({ ok: false, error: "internal_error" }, 500);
  }
});
