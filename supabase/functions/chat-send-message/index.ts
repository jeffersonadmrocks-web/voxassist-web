// chat-send-message — gateway isolado de envio do Chat VoxAssist (ETAPA
// B, item 9). Único ponto autorizado pelo qual o frontend pode disparar
// uma mensagem — nunca Frontend → provider diretamente (arquitetura
// definida em 2026-08-28). ETAPA D (2026-08-31): passa a chamar o
// gateway real (voxassist-whatsapp-gateway, Railway) via
// POST /connections/:id/send, autenticado com CHAT_GATEWAY_SERVICE_TOKEN
// (mesmo segredo já usado em chat-gateway-proxy). "to" nunca vem do
// corpo do frontend — sempre customer_phone da própria conversa, já
// filtrada por RLS acima.
//
// CORS: mesmo achado real do digisac-test — toda resposta (incluindo
// OPTIONS e erros) precisa dos headers de CORS, senão o navegador
// bloqueia o fetch antes dele sair.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { buildMessagePreview, validateOutboundMessage } from "../_shared/messagingService.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_URL = Deno.env.get("CHAT_GATEWAY_URL");
const GATEWAY_SERVICE_TOKEN = Deno.env.get("CHAT_GATEWAY_SERVICE_TOKEN");
const TIMEOUT_MS = 15000;
// Documento de saída (achado do usuário 2026-09-03: enviar O.S./
// orçamento em PDF pro cliente). Mesmo teto usado pra mídia de ENTRADA
// (MAX_INLINE_MEDIA_BYTES, gateway) -- um PDF de orçamento é sempre
// pequeno (poucas páginas de texto), nunca precisa de mais que isso.
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

type ConversationRow = {
  id: string;
  connection_id: string | null;
  customer_phone: string | null;
  remote_jid: string | null;
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
    const replyToMessageId = typeof body?.replyToMessageId === "string" && body.replyToMessageId.trim() ? body.replyToMessageId.trim() : null;
    if (!conversationId) {
      return respond({ ok: false, error: "missing_conversation_id" }, 400);
    }

    // Documento de saída (achado do usuário 2026-09-03): mesmo padrão de
    // validação de tipo/tamanho já usado pra mídia de entrada
    // (chat-inbound-webhook) -- nunca confia no mimeType/tamanho
    // declarado pelo frontend sem checar de novo aqui.
    const docRaw = body?.document;
    let documentPayload: { base64: string; mimeType: string; fileName: string } | null = null;
    if (docRaw && typeof docRaw === "object") {
      const base64 = typeof docRaw.base64 === "string" ? docRaw.base64 : "";
      const mimeType = typeof docRaw.mimeType === "string" ? docRaw.mimeType : "";
      const fileName = typeof docRaw.fileName === "string" && docRaw.fileName.trim() ? docRaw.fileName.trim() : "documento.pdf";
      if (!base64 || mimeType !== "application/pdf") {
        return respond({ ok: false, error: "invalid_document" }, 400);
      }
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > MAX_DOCUMENT_BYTES) {
        return respond({ ok: false, error: "document_too_large" }, 400);
      }
      documentPayload = { base64, mimeType, fileName };
    }

    const { data: conversation } = await userClient
      .from("chat_conversations")
      .select("id, connection_id, customer_phone, remote_jid, chat_connections(status)")
      .eq("id", conversationId)
      .maybeSingle<ConversationRow>();
    if (!conversation) {
      // Mesma resposta pra "não existe" e "existe mas RLS não deixa ver"
      // — não vaza se a conversa existe em outra empresa.
      return respond({ ok: false, error: "conversation_not_found" }, 404);
    }

    // Se veio replyToMessageId, confirma que pertence a ESTA conversa
    // antes de gastar uma chamada real ao gateway -- mesma checagem
    // que o trigger do banco (chat_messages_reply_to_same_conversation,
    // Fase 5) reforça na gravação, mas falhar aqui evita mandar a
    // mensagem pro cliente pra só depois descobrir que a citação era
    // inválida. userClient (RLS) garante que a mensagem citada também
    // é de uma conversa que este usuário já pode ver.
    if (replyToMessageId) {
      const { data: quoted } = await userClient
        .from("chat_messages")
        .select("id, conversation_id")
        .eq("id", replyToMessageId)
        .maybeSingle<{ id: string; conversation_id: string }>();
      if (!quoted || quoted.conversation_id !== conversationId) {
        return respond({ ok: false, error: "invalid_reply_to_message" }, 400);
      }
    }

    const connectionStatus = conversation.chat_connections?.status ?? "DESCONECTADO";
    const validation = validateOutboundMessage({ body: text, connectionStatus, hasDocument: !!documentPayload });
    if (!validation.ok) {
      return respond({ ok: false, error: "invalid_message", message: validation.error }, 400);
    }
    if (!conversation.connection_id) {
      return respond({ ok: false, error: "conversation_without_connection" }, 400);
    }
    if (!GATEWAY_URL || !GATEWAY_SERVICE_TOKEN) {
      return respond({ ok: false, error: "gateway_not_configured" }, 503);
    }

    // Achado real (2026-08-31): customer_phone pode ser um LID (não um
    // telefone) ou pode estar vazio (LID ainda não resolvido) --
    // reconstruir "customer_phone@s.whatsapp.net" às cegas manda pro
    // domínio errado ou pra um destino inexistente. remote_jid guarda o
    // JID original exato (com o domínio real, telefone ou LID) e é
    // sempre o destino usado; customer_phone só entra como fallback pra
    // conversas de antes desta correção que ainda não têm remote_jid.
    const to = conversation.remote_jid || (conversation.customer_phone ? `${conversation.customer_phone}@s.whatsapp.net` : null);
    if (!to) {
      return respond({ ok: false, error: "conversation_without_target" }, 400);
    }

    // replyToMessageId NÃO é encaminhado ao gateway (Fase 5, escopo
    // documentado na migration chat_messages_reply_to): não há
    // confirmação de que voxassist-whatsapp-gateway suporte citação
    // nativa do WhatsApp (nenhuma referência a "quoted"/"context" em
    // nenhuma function deste repo). A citação fica só como metadado do
    // VoxAssist (gravada abaixo) -- nunca inventa um campo de payload
    // pro gateway sem confirmação real de que ele o entende.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let gatewayResult: { externalMessageId?: string };
    try {
      const gatewayRes = await fetch(`${GATEWAY_URL}/connections/${conversation.connection_id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${GATEWAY_SERVICE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to, body: text, document: documentPayload }),
        signal: controller.signal,
      });
      const data = await gatewayRes.json().catch(() => null);
      if (!gatewayRes.ok || !data?.ok) {
        return respond({ ok: false, error: "send_failed", message: data?.error ?? "Falha ao enviar pelo gateway." }, 502);
      }
      gatewayResult = data;
    } catch {
      return respond({ ok: false, error: "gateway_unreachable" }, 502);
    } finally {
      clearTimeout(timer);
    }

    // Grava a mensagem OUTBOUND só depois de confirmado o envio real —
    // nunca finge que mandou algo que o gateway rejeitou.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: companyRow } = await admin.from("chat_conversations").select("company_id").eq("id", conversation.id).maybeSingle<{ company_id: string }>();
    let messageInsert: Record<string, unknown> = {
      company_id: companyRow?.company_id,
      conversation_id: conversation.id,
      direction: "OUTBOUND",
      sender_user_id: user.id,
      body: text || null,
      external_message_id: gatewayResult.externalMessageId ?? null,
      status: "ENVIADA",
      reply_to_message_id: replyToMessageId,
    };
    if (documentPayload && companyRow?.company_id) {
      // Salva o mesmo PDF já confirmado como enviado, no MESMO bucket
      // privado já usado pra mídia recebida (chat-media, migration
      // 20260901320000) -- só pro histórico mostrar o documento de
      // verdade, nunca decide o envio real (isso já aconteceu acima).
      try {
        const bin = atob(documentPayload.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const safeName = documentPayload.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${companyRow.company_id}/${conversation.id}/outbound-${Date.now()}-${safeName}`;
        const { error: uploadError } = await admin.storage.from("chat-media").upload(path, bytes, {
          contentType: documentPayload.mimeType,
          upsert: false,
        });
        if (!uploadError) {
          messageInsert = {
            ...messageInsert,
            message_type: "DOCUMENT",
            media_status: "DISPONIVEL",
            media_storage_path: path,
            media_mime_type: documentPayload.mimeType,
            media_size_bytes: bytes.length,
          };
        } else {
          console.error("[chat-send-message] falha ao salvar cópia do documento enviado:", uploadError.message ?? uploadError);
        }
      } catch (e) {
        console.error("[chat-send-message] erro ao processar documento enviado:", e instanceof Error ? e.message : e);
      }
    }
    await admin.from("chat_messages").insert(messageInsert);
    // unread_count volta a 0 quando o atendente responde -- mesma
    // correção do achado real em chat-inbound-webhook (a coluna nunca
    // era incrementada nem resetada; o filtro "Não lidas" era cosmético).
    await admin
      .from("chat_conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_preview: buildMessagePreview(text), unread_count: 0 })
      .eq("id", conversation.id);

    return respond({ ok: true }, 200);
  } catch {
    return respond({ ok: false, error: "internal_error" }, 500);
  }
});
