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
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildMessagePreview, decideConversationTarget, nextStatusOnInboundMessage, sanitizeInboundContactId } from "../_shared/messagingService.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_SERVICE_TOKEN = Deno.env.get("CHAT_GATEWAY_SERVICE_TOKEN");

type ConnectionRow = { id: string; company_id: string };
type ConversationRow = { id: string; status: string };

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
    const rawFrom = typeof body?.from === "string" ? body.from : "";
    const text = typeof body?.body === "string" ? body.body : "";
    const externalMessageId = typeof body?.externalMessageId === "string" && body.externalMessageId ? body.externalMessageId : null;
    if (!connectionId) return json({ ok: false, error: "missing_connection_id" }, 400);

    const phone = sanitizeInboundContactId(rawFrom);
    if (!phone) return json({ ok: false, error: "invalid_phone" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: connection } = await admin.from("chat_connections").select("id, company_id").eq("id", connectionId).maybeSingle<ConnectionRow>();
    if (!connection) return json({ ok: false, error: "connection_not_found" }, 404);

    const { data: existingRows } = await admin
      .from("chat_conversations")
      .select("id, status")
      .eq("connection_id", connectionId)
      .eq("customer_phone", phone)
      .order("created_at", { ascending: false });
    const target = decideConversationTarget((existingRows ?? []) as ConversationRow[]);

    let conversationId: string;
    if (target.action === "REUSE") {
      conversationId = target.conversationId;
      const current = (existingRows ?? []).find((c) => c.id === conversationId);
      const nextStatus = current ? nextStatusOnInboundMessage(current.status) : "ABERTA";
      await admin
        .from("chat_conversations")
        .update({ status: nextStatus, last_message_at: new Date().toISOString(), last_message_preview: buildMessagePreview(text) })
        .eq("id", conversationId);
    } else {
      const { data: created, error } = await admin
        .from("chat_conversations")
        .insert({
          company_id: connection.company_id,
          connection_id: connectionId,
          customer_phone: phone,
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

    return json({ ok: true, conversationId }, 200);
  } catch (e) {
    console.error("[chat-inbound-webhook] erro interno:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
