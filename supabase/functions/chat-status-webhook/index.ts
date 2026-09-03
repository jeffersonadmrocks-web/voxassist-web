// chat-status-webhook — recebe confirmação de entrega/leitura do gateway
// WhatsApp (voxassist-whatsapp-gateway, Railway) sempre que o Baileys
// reporta um messages.update pra mensagem NOSSA (fromMe). Deploy com
// --no-verify-jwt (o chamador é o gateway, não um usuário VoxAssist com
// sessão) — mesmo CHAT_GATEWAY_SERVICE_TOKEN já usado em
// chat-inbound-webhook, nenhum segredo novo.
//
// Achado do usuário em 2026-09-03: o front (mensagemTick() em
// chat-beta-v0828.js) já sabia desenhar ✓/✓✓/✓✓ azul pra ENTREGUE/LIDA —
// só nada nunca escrevia esses status depois do envio inicial (ENVIADA).
// Este webhook só atualiza a linha já existente; nunca cria mensagem.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_SERVICE_TOKEN = Deno.env.get("CHAT_GATEWAY_SERVICE_TOKEN");

const ALLOWED_STATUS = ["ENTREGUE", "LIDA", "FALHOU"];
// Ordem de progresso real do WhatsApp — nunca deixa uma confirmação de
// entrega atrasada (chegou fora de ordem) regredir uma mensagem que já
// foi marcada como lida. FALHOU é tratado à parte (sempre aplicado —
// sinal de erro, não de progresso).
const STATUS_RANK: Record<string, number> = { AGUARDANDO_ENVIO: 0, ENVIADA: 1, ENTREGUE: 2, LIDA: 3 };

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
    const externalMessageId = typeof body?.externalMessageId === "string" ? body.externalMessageId.trim() : "";
    const status = typeof body?.status === "string" ? body.status : "";
    if (!connectionId || !externalMessageId || !ALLOWED_STATUS.includes(status)) {
      return json({ ok: false, error: "invalid_payload" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: existing, error: findError } = await admin
      .from("chat_messages")
      .select("id, status")
      .eq("connection_id", connectionId)
      .eq("external_message_id", externalMessageId)
      .eq("direction", "OUTBOUND")
      .maybeSingle();
    if (findError) {
      console.error("[chat-status-webhook] falha ao buscar mensagem:", findError.message);
      return json({ ok: false, error: "lookup_failed" }, 500);
    }
    if (!existing) {
      // Mensagem ainda não gravada (corrida rara com o insert do envio)
      // ou já não existe mais (apagada) — não é erro do gateway, só não
      // há o que atualizar agora.
      return json({ ok: true, skipped: "message_not_found" }, 200);
    }
    if (status !== "FALHOU" && (STATUS_RANK[status] ?? 0) <= (STATUS_RANK[existing.status] ?? 0)) {
      return json({ ok: true, skipped: "status_not_advanced" }, 200);
    }

    const { error: updateError } = await admin.from("chat_messages").update({ status }).eq("id", existing.id);
    if (updateError) {
      console.error("[chat-status-webhook] falha ao atualizar status:", updateError.message);
      return json({ ok: false, error: "update_failed" }, 500);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("[chat-status-webhook] erro interno:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
