// chat-inbound-webhook — recebe mensagens do gateway WhatsApp
// (voxassist-whatsapp-gateway, Railway) sempre que o Baileys entrega uma
// mensagem nova. Deploy com --no-verify-jwt (o chamador é o gateway, não
// um usuário VoxAssist com sessão) — a autenticação real é o
// CHAT_GATEWAY_SERVICE_TOKEN (mesmo segredo já usado em
// chat-gateway-proxy/o gateway, reaproveitado aqui, nenhum token novo).
//
// Decide se a mensagem pertence a uma conversa já aberta (reaproveita)
// ou abre uma nova (decideConversationTarget, messagingService.ts —
// mesma lógica pura já usada/testada do lado do MessagingService).
// Dedup por (company_id, external_message_id) é garantido pelo índice
// único parcial (chat_messages_dedup_20260831.sql) — uma reentrega do
// Baileys vira só um 23505 tratado como sucesso silencioso, nunca duas
// linhas.
//
// Achado real (2026-08-31): remoteJid é o único identificador SEMPRE
// presente e estável de uma conversa (telefone ou LID) -- reaproveitar/
// criar conversa é decidido por ele, nunca mais por customer_phone
// (que agora pode ser nulo, quando o remetente é um LID ainda não
// resolvido). Ver chat_conversations_lid_model_20260831.sql.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AWAY_MESSAGE_TEXT,
  buildMessagePreview,
  decideAwayMessage,
  decideConversationTarget,
  nextStatusOnInboundMessage,
  resolveInboundIdentity,
} from "../_shared/messagingService.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_SERVICE_TOKEN = Deno.env.get("CHAT_GATEWAY_SERVICE_TOKEN");
// Mesma URL/token já usados em chat-send-message pra falar com o
// gateway -- reaproveitado aqui pra mandar a mensagem automática de
// ausência, nenhum segredo novo.
const GATEWAY_URL = Deno.env.get("CHAT_GATEWAY_URL");

type ConnectionRow = { id: string; company_id: string; status: string };
type ConversationRow = { id: string; status: string; last_away_sent_at: string | null };

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!GATEWAY_SERVICE_TOKEN || token !== GATEWAY_SERVICE_TOKEN) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
    const remoteJid = typeof body?.remoteJid === "string" ? body.remoteJid : "";
    const senderPn = typeof body?.senderPn === "string" && body.senderPn ? body.senderPn : null;
    const senderLid = typeof body?.senderLid === "string" && body.senderLid ? body.senderLid : null;
    const text = typeof body?.body === "string" ? body.body : "";
    const externalMessageId = typeof body?.externalMessageId === "string" && body.externalMessageId ? body.externalMessageId : null;
    if (!connectionId) return json({ ok: false, error: "missing_connection_id" }, 400);

    const identity = resolveInboundIdentity({ remoteJid, senderPn, senderLid });
    if (!identity) return json({ ok: false, error: "invalid_sender" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: connection } = await admin.from("chat_connections").select("id, company_id, status").eq("id", connectionId).maybeSingle<ConnectionRow>();
    if (!connection) return json({ ok: false, error: "connection_not_found" }, 404);

    const { data: existingRows } = await admin
      .from("chat_conversations")
      .select("id, status, last_away_sent_at")
      .eq("connection_id", connectionId)
      .eq("remote_jid", identity.remoteJid)
      .order("created_at", { ascending: false });
    const target = decideConversationTarget((existingRows ?? []) as ConversationRow[]);

    let conversationId: string;
    let lastAwaySentAt: string | null = null;
    if (target.action === "REUSE") {
      conversationId = target.conversationId;
      const current = (existingRows ?? []).find((c) => c.id === conversationId);
      lastAwaySentAt = current?.last_away_sent_at ?? null;
      const nextStatus = current ? nextStatusOnInboundMessage(current.status) : "ABERTA";
      await admin
        .from("chat_conversations")
        .update({
          status: nextStatus,
          last_message_at: new Date().toISOString(),
          last_message_preview: buildMessagePreview(text),
          // Sempre grava a resolução mais recente (não só quando nula
          // antes) -- é assim que corrige um customer_phone gravado
          // errado (LID) em mensagens anteriores a esta correção.
          customer_phone: identity.customerPhone,
          sender_lid: identity.senderLid,
        })
        .eq("id", conversationId);
    } else {
      const { data: created, error } = await admin
        .from("chat_conversations")
        .insert({
          company_id: connection.company_id,
          connection_id: connectionId,
          remote_jid: identity.remoteJid,
          customer_phone: identity.customerPhone,
          sender_lid: identity.senderLid,
          status: "ABERTA",
          last_message_at: new Date().toISOString(),
          last_message_preview: buildMessagePreview(text),
        })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[chat-inbound-webhook] falha ao criar conversa:", error?.message);
        return json({ ok: false, error: "conversation_create_failed" }, 500);
      }
      conversationId = created.id;
    }

    const { error: msgError } = await admin.from("chat_messages").insert({
      company_id: connection.company_id,
      conversation_id: conversationId,
      direction: "INBOUND",
      body: text || null,
      external_message_id: externalMessageId,
      status: "ENVIADA",
    });
    if (msgError) {
      // 23505 = unique_violation no índice de dedup -- reentrega do
      // Baileys da mesma mensagem, não é erro real.
      if (msgError.code === "23505") {
        return json({ ok: true, duplicate: true }, 200);
      }
      console.error("[chat-inbound-webhook] falha ao gravar mensagem:", msgError.message);
      return json({ ok: false, error: "message_insert_failed" }, 500);
    }

    // Mensagem automática de ausência fora do horário de atendimento --
    // nunca bloqueia nem falha a resposta principal (a mensagem do
    // cliente já foi gravada com sucesso acima); melhor esforço, best
    // effort. Não atualiza last_message_preview/last_message_at da
    // conversa -- o que precisa aparecer pro atendente é a pergunta
    // real do cliente, não o aviso automático.
    try {
      const decision = decideAwayMessage(new Date(), lastAwaySentAt);
      if (decision.shouldSend && connection.status === "CONECTADO" && GATEWAY_URL && GATEWAY_SERVICE_TOKEN) {
        const gatewayRes = await fetch(`${GATEWAY_URL}/connections/${connectionId}/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${GATEWAY_SERVICE_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ to: identity.remoteJid, body: AWAY_MESSAGE_TEXT }),
        });
        const gatewayData = await gatewayRes.json().catch(() => null);
        if (gatewayRes.ok && gatewayData?.ok) {
          await admin.from("chat_messages").insert({
            company_id: connection.company_id,
            conversation_id: conversationId,
            connection_id: connectionId,
            remote_jid: identity.remoteJid,
            from_me: true,
            direction: "OUTBOUND",
            body: AWAY_MESSAGE_TEXT,
            external_message_id: gatewayData.externalMessageId ?? null,
            provider_message_id: gatewayData.externalMessageId ?? null,
            origin: "REALTIME",
            status: "ENVIADA",
          });
          await admin.from("chat_conversations").update({ last_away_sent_at: new Date().toISOString() }).eq("id", conversationId);
        } else {
          console.error("[chat-inbound-webhook] falha ao enviar mensagem de ausência:", gatewayData?.error ?? gatewayRes.status);
        }
      }
    } catch (e) {
      console.error("[chat-inbound-webhook] erro ao processar mensagem de ausência:", e instanceof Error ? e.message : e);
    }

    return json({ ok: true, conversationId }, 200);
  } catch (e) {
    console.error("[chat-inbound-webhook] erro interno:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
