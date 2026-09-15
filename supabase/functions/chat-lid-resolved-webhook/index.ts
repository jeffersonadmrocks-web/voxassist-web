// chat-lid-resolved-webhook — recebe do gateway WhatsApp
// (voxassist-whatsapp-gateway, Railway) o par lid/telefone que o
// Baileys resolveu fora do fluxo normal de mensagem (chats.
// phoneNumberShare ou contacts.upsert/update, com lid E jid
// preenchidos). Deploy com --no-verify-jwt (o chamador é o gateway,
// não um usuário VoxAssist com sessão) — mesmo CHAT_GATEWAY_SERVICE_TOKEN
// já usado em chat-inbound-webhook/chat-status-webhook, nenhum segredo
// novo.
//
// Achado do usuário (2026-09-15): chat-inbound-webhook já tenta
// resolver customer_phone a cada mensagem NOVA (resolveInboundIdentity),
// mas se o cliente não escrever de novo depois que o Baileys resolve o
// par lid/telefone, a conversa fica "Identificação pendente" pra
// sempre. Este webhook fecha essa lacuna: atualiza qualquer conversa já
// aberta com esse lid que ainda não tem customer_phone -- nunca
// sobrescreve um valor já preenchido (mesma disciplina de nunca
// regredir um dado já resolvido).
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveInboundIdentity } from "../_shared/messagingService.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_SERVICE_TOKEN = Deno.env.get("CHAT_GATEWAY_SERVICE_TOKEN");

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
    const lid = typeof body?.lid === "string" ? body.lid.trim() : "";
    const phoneJid = typeof body?.phoneJid === "string" ? body.phoneJid.trim() : "";
    if (!connectionId || !lid || !phoneJid) {
      return json({ ok: false, error: "invalid_payload" }, 400);
    }

    // Mesma extração/validação já usada pro inbound normal -- nunca
    // promove dígitos de um @lid a telefone, só aceita o que vier
    // mesmo no domínio @s.whatsapp.net.
    const identity = resolveInboundIdentity({ remoteJid: lid, senderPn: phoneJid });
    if (!identity?.senderLid || !identity.customerPhone) {
      return json({ ok: true, skipped: "not_resolvable" }, 200);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: updated, error } = await admin
      .from("chat_conversations")
      .update({ customer_phone: identity.customerPhone })
      .eq("connection_id", connectionId)
      .eq("sender_lid", identity.senderLid)
      .is("customer_phone", null)
      .select("id");
    if (error) {
      console.error("[chat-lid-resolved-webhook] falha ao atualizar conversas:", error.message);
      return json({ ok: false, error: "update_failed" }, 500);
    }

    return json({ ok: true, updated: updated?.length ?? 0 }, 200);
  } catch (e) {
    console.error("[chat-lid-resolved-webhook] erro interno:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
