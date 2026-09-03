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
  isWithinBusinessHours,
  nextStatusOnInboundMessage,
  resolveInboundIdentity,
} from "../_shared/messagingService.ts";
import {
  collectRoutingDimensions,
  decideTriageStep,
  FlowStep,
  matchRoutingRules,
  renderBotTemplate,
  resolveNextEligibleStep,
  RoutingRule,
  StepCondition,
} from "../_shared/chatBotFlow.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_SERVICE_TOKEN = Deno.env.get("CHAT_GATEWAY_SERVICE_TOKEN");
// Mesma URL/token já usados em chat-send-message pra falar com o
// gateway -- reaproveitado aqui pra mandar a mensagem automática de
// ausência e as mensagens do Robô de Atendimento, nenhum segredo novo.
const GATEWAY_URL = Deno.env.get("CHAT_GATEWAY_URL");

type ConnectionRow = { id: string; company_id: string; status: string };
type ConversationRow = { id: string; status: string; last_away_sent_at: string | null; unread_count: number | null };
// deno-lint-ignore no-explicit-any
type SupaAdmin = any;

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Mídia recebida (achado do usuário 2026-09-03: foto/áudio recebidos
// ficavam "[sem texto]" -- nem o gateway nem este webhook nunca
// trataram mídia de entrada). Reaproveita EXATAMENTE a mesma
// infraestrutura já construída pra mídia de SAÍDA (bucket privado
// chat-media, path company_id/conversation_id/arquivo, campos
// message_type/media_status/media_storage_path/media_mime_type/
// media_size_bytes -- migration 20260901320000_chat_media_bucket.sql,
// mesmo trigger de limite real por tipo). Nunca inventa um bucket/
// contrato novo. O gateway manda a mídia em base64 já com um teto de
// tamanho (ver inboundForwarder.ts) -- payloads maiores que isso
// chegam aqui SEM mediaBase64, e viram só um aviso em texto (nunca um
// erro que derruba a mensagem inteira).
const MEDIA_TYPE_LABEL: Record<string, string> = { IMAGE: "Imagem", AUDIO: "Áudio", VIDEO: "Vídeo", DOCUMENT: "Documento" };

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function uploadInboundMedia(
  admin: SupaAdmin,
  args: { companyId: string; conversationId: string; mediaType: string; mediaBase64: string; mediaMimeType: string | null; mediaFileName: string | null },
): Promise<{ path: string; sizeBytes: number } | null> {
  try {
    const bytes = base64ToBytes(args.mediaBase64);
    const safeName = (args.mediaFileName || `${args.mediaType.toLowerCase()}-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${args.companyId}/${args.conversationId}/inbound-${Date.now()}-${safeName}`;
    const { error } = await admin.storage.from("chat-media").upload(path, bytes, {
      contentType: args.mediaMimeType || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      console.error("[chat-inbound-webhook] falha ao subir mídia recebida pro Storage:", error.message ?? error);
      return null;
    }
    return { path, sizeBytes: bytes.length };
  } catch (e) {
    console.error("[chat-inbound-webhook] erro ao processar mídia recebida:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Despacha uma mensagem do robô (boas-vindas/pergunta/fora do
// horário) pelo MESMO gateway já usado em chat-send-message e na
// mensagem de ausência -- nenhum contrato novo. Grava a linha
// OUTBOUND com origin='BOT' (Fase 2) só se o envio real foi
// confirmado -- nunca finge que mandou. Devolve se deu certo, pro
// chamador decidir o que fazer em seguida (nunca lança -- quem chama
// já está dentro do try/catch best-effort do robô).
async function sendBotMessage(
  admin: SupaAdmin,
  args: { companyId: string; conversationId: string; connectionId: string; remoteJid: string; text: string; origin?: "BOT" | "REALTIME" },
): Promise<boolean> {
  try {
    const gatewayRes = await fetch(`${GATEWAY_URL}/connections/${args.connectionId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GATEWAY_SERVICE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: args.remoteJid, body: args.text }),
    });
    const gatewayData = await gatewayRes.json().catch(() => null);
    if (!gatewayRes.ok || !gatewayData?.ok) {
      console.error("[chat-inbound-webhook] robô: falha ao enviar mensagem:", gatewayData?.error ?? gatewayRes.status);
      return false;
    }
    await admin.from("chat_messages").insert({
      company_id: args.companyId,
      conversation_id: args.conversationId,
      connection_id: args.connectionId,
      remote_jid: args.remoteJid,
      from_me: true,
      direction: "OUTBOUND",
      body: args.text,
      external_message_id: gatewayData.externalMessageId ?? null,
      provider_message_id: gatewayData.externalMessageId ?? null,
      origin: args.origin ?? "BOT",
      status: "ENVIADA",
    });
    return true;
  } catch (e) {
    console.error("[chat-inbound-webhook] robô: erro ao enviar mensagem:", e instanceof Error ? e.message : e);
    return false;
  }
}

// Converte as linhas cruas do banco (snake_case) pro formato que
// chatBotFlow.ts espera (camelCase) -- só um adaptador de I/O, a
// lógica de verdade mora no módulo puro.
// deno-lint-ignore no-explicit-any
function mapSteps(rows: any[]): FlowStep[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    stepKey: r.step_key,
    stepOrder: r.step_order,
    questionText: r.question_text,
    answerType: r.answer_type,
    options: Array.isArray(r.options) ? r.options : [],
    routingDimension: r.routing_dimension,
    active: r.active,
  }));
}
// deno-lint-ignore no-explicit-any
function mapConditions(rows: any[]): StepCondition[] {
  return (rows ?? []).map((r) => ({ stepId: r.step_id, dependsOnStepId: r.depends_on_step_id, dependsOnValue: r.depends_on_value }));
}
// deno-lint-ignore no-explicit-any
function mapRules(rows: any[]): RoutingRule[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    storeId: r.store_id,
    warrantyValue: r.warranty_value,
    brandValue: r.brand_value,
    targetQueueId: r.target_queue_id,
    specificity: r.specificity,
  }));
}

// Achado do usuário em 2026-09-02 (pacote fila/robô/presença): uma
// regra batida roteia pra uma FILA (current_queue_id, sem dono --
// qualquer integrante autorizado assume), nunca mais direto pra um
// atendente. Sem regra batendo, cai no atendente padrão da versão
// (default_attendant_id) -- esse continua sendo um atendente
// individual mesmo, não fila (não fazia parte do pedido). Exatamente
// um dos dois é setado, nunca os dois -- BOT_ROTEOU registra qual.
async function routeConversationViaBot(
  admin: SupaAdmin,
  args: { companyId: string; conversationId: string; attendantId: string | null; queueId: string | null; storeId: string | null; matchedRuleId: string | null },
) {
  if (!args.attendantId && !args.queueId) return;
  await admin.from("chat_conversations").update({
    assigned_user_id: args.attendantId,
    current_queue_id: args.queueId,
    ...(args.storeId ? { current_store_id: args.storeId } : {}),
  }).eq("id", args.conversationId);
  await admin.from("chat_conversation_events").insert({
    company_id: args.companyId,
    conversation_id: args.conversationId,
    action: "BOT_ROTEOU",
    previous_data: {},
    new_data: { assigned_user_id: args.attendantId, queue_id: args.queueId, store_id: args.storeId, matched_rule_id: args.matchedRuleId },
    changed_by: null,
  });
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
    const mediaType = typeof body?.mediaType === "string" && ["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"].includes(body.mediaType) ? body.mediaType : null;
    const mediaBase64 = typeof body?.mediaBase64 === "string" && body.mediaBase64 ? body.mediaBase64 : null;
    const mediaMimeType = typeof body?.mediaMimeType === "string" && body.mediaMimeType ? body.mediaMimeType : null;
    const mediaFileName = typeof body?.mediaFileName === "string" && body.mediaFileName ? body.mediaFileName : null;
    if (!connectionId) {
      // Achado do usuário em 2026-09-02 (pacote P0): nenhum dos dois
      // 400 abaixo logava nada, então uma rejeição real nunca deixava
      // rastro pra diagnosticar. Loga só as CHAVES recebidas (nunca
      // valores -- podem conter telefone/nome) pra revelar se o gateway
      // está mandando um contrato diferente do esperado.
      console.error("[chat-inbound-webhook] 400 missing_connection_id -- chaves recebidas:", Object.keys(body ?? {}).join(","));
      return json({ ok: false, error: "missing_connection_id" }, 400);
    }

    const identity = resolveInboundIdentity({ remoteJid, senderPn, senderLid });
    if (!identity) {
      // Loga a FORMA do remoteJid (presença, tamanho, domínio depois do
      // @) sem expor os dígitos -- suficiente pra distinguir "campo
      // ausente/nome errado" de "domínio inesperado (grupo, formato
      // novo)" de "dígitos fora do padrão esperado", sem vazar
      // identificador completo em log.
      const domain = remoteJid.includes("@") ? remoteJid.split("@")[1] : (remoteJid ? "(sem @)" : "(vazio)");
      console.error(
        "[chat-inbound-webhook] 400 invalid_sender -- remoteJid presente:", !!remoteJid,
        "domínio:", domain, "tamanho:", remoteJid.length,
        "senderPn presente:", !!senderPn, "senderLid presente:", !!senderLid,
        "chaves recebidas:", Object.keys(body ?? {}).join(","),
      );
      return json({ ok: false, error: "invalid_sender" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: connection } = await admin.from("chat_connections").select("id, company_id, status").eq("id", connectionId).maybeSingle<ConnectionRow>();
    if (!connection) return json({ ok: false, error: "connection_not_found" }, 404);

    // Achado do usuário em 2026-09-03: casar conversa só por remote_jid
    // exato fragmentava o MESMO cliente em várias conversas -- o
    // WhatsApp pode entregar a resposta de uma pessoa ora pelo JID de
    // telefone, ora por um LID (identidade de privacidade), mesmo já
    // tendo conversado antes pelo outro "sabor". resolveInboundIdentity
    // já resolve o telefone real por trás de um LID quando o Baileys
    // souber (senderPn) -- usa esse telefone JÁ CONHECIDO também como
    // critério de busca (nunca só o remote_jid da MENSAGEM atual), pra
    // reaproveitar a conversa certa em vez de criar uma nova vazia e
    // disparar o Robô de Atendimento de novo em cima de um atendimento
    // que já estava em andamento.
    let existingQuery = admin
      .from("chat_conversations")
      .select("id, status, last_away_sent_at, unread_count")
      .eq("connection_id", connectionId);
    existingQuery = identity.customerPhone
      ? existingQuery.or(`remote_jid.eq.${identity.remoteJid},customer_phone.eq.${identity.customerPhone}`)
      : existingQuery.eq("remote_jid", identity.remoteJid);
    const { data: existingRows } = await existingQuery.order("created_at", { ascending: false });
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
          // errado (LID) em mensagens anteriores a esta correção. Vale
          // também pro remote_jid em si (achado 2026-09-03): a conversa
          // pode ter sido casada agora por customer_phone com um
          // remote_jid diferente do que estava salvo -- atualiza pro
          // JID mais recente, é o que decide pra onde manda a próxima
          // resposta (chat-send-message).
          remote_jid: identity.remoteJid,
          customer_phone: identity.customerPhone,
          sender_lid: identity.senderLid,
          // Achado real (correção visual, 2026-09-01): unread_count
          // existia na tabela desde a fundação do Chat, mas nenhuma
          // function nunca incrementava -- o filtro "Não lidas" do
          // frontend nunca mostrava nada de verdade. Incrementa aqui
          // (lido em existingRows, não via SQL bruto); reseta em
          // chat-send-message (resposta) e ao abrir a conversa no
          // frontend (leitura).
          unread_count: Number(current?.unread_count ?? 0) + 1,
        })
        .eq("id", conversationId);
    } else if (target.action === "REOPEN") {
      // Achado do usuário em 2026-09-02 (pacote fila/robô/presença):
      // cliente escreveu de novo numa conversa que já tinha sido
      // ENCERRADA -- reabre a MESMA conversa (preserva histórico
      // completo, nunca fragmenta em uma linha nova) e devolve pro
      // fluxo ativo: status ABERTA, sem responsável (reentra elegível
      // pro roteamento normal -- robô/fila compartilhada -- em vez de
      // ficar presa a quem atendeu da última vez).
      conversationId = target.conversationId;
      const current = (existingRows ?? []).find((c) => c.id === conversationId);
      lastAwaySentAt = null; // período fechado anterior não é mais relevante -- conversa está reabrindo agora
      await admin
        .from("chat_conversations")
        .update({
          status: "ABERTA",
          assigned_user_id: null,
          last_message_at: new Date().toISOString(),
          last_message_preview: buildMessagePreview(text),
          remote_jid: identity.remoteJid,
          customer_phone: identity.customerPhone,
          sender_lid: identity.senderLid,
          unread_count: 1,
        })
        .eq("id", conversationId);
      await admin.from("chat_conversation_events").insert({
        company_id: connection.company_id,
        conversation_id: conversationId,
        action: "REABERTA_POR_MENSAGEM_CLIENTE",
        previous_data: { status: current?.status ?? "FINALIZADA" },
        new_data: { status: "ABERTA" },
        changed_by: null,
      });
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
          unread_count: 1,
        })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[chat-inbound-webhook] falha ao criar conversa:", error?.message);
        return json({ ok: false, error: "conversation_create_failed" }, 500);
      }
      conversationId = created.id;
    }

    let messageInsert: Record<string, unknown> = {
      company_id: connection.company_id,
      conversation_id: conversationId,
      direction: "INBOUND",
      body: text || null,
      external_message_id: externalMessageId,
      status: "ENVIADA",
    };
    if (mediaType && mediaBase64) {
      const uploaded = await uploadInboundMedia(admin, {
        companyId: connection.company_id,
        conversationId,
        mediaType,
        mediaBase64,
        mediaMimeType,
        mediaFileName,
      });
      if (uploaded) {
        messageInsert = {
          ...messageInsert,
          message_type: mediaType,
          media_status: "DISPONIVEL",
          media_storage_path: uploaded.path,
          media_mime_type: mediaMimeType,
          media_size_bytes: uploaded.sizeBytes,
        };
      } else {
        // Upload falhou (Storage fora do ar, etc.) -- nunca perde a
        // mensagem inteira por causa disso, só perde o anexo, com aviso
        // honesto no lugar de "[sem texto]".
        messageInsert.body = text || `[${MEDIA_TYPE_LABEL[mediaType]} recebido — não foi possível processar o anexo]`;
      }
    } else if (mediaType && !mediaBase64) {
      // Mídia grande demais pro teto do gateway, ou falha ao baixar do
      // WhatsApp (ver inboundForwarder.ts) -- nunca inventa um anexo
      // vazio, só avisa com texto o que realmente aconteceu.
      messageInsert.body = text || `[${MEDIA_TYPE_LABEL[mediaType]} recebido — arquivo não suportado nesta versão (abra no celular)]`;
    }

    const { error: msgError } = await admin.from("chat_messages").insert(messageInsert);
    if (msgError) {
      // 23505 = unique_violation no índice de dedup -- reentrega do
      // Baileys da mesma mensagem, não é erro real.
      if (msgError.code === "23505") {
        return json({ ok: true, duplicate: true }, 200);
      }
      console.error("[chat-inbound-webhook] falha ao gravar mensagem:", msgError.message);
      return json({ ok: false, error: "message_insert_failed" }, 500);
    }

    // Mensagem automática de ausência fora do horário de atendimento
    // (comportamento original, intocado) + Robô de Atendimento (Fase
    // 5 -- só ativa QUALQUER coisa se a empresa tiver uma versão
    // PUBLICADA; sem isso, este bloco inteiro se comporta exatamente
    // como antes desta fase). Nunca bloqueia nem falha a resposta
    // principal (a mensagem do cliente já foi gravada com sucesso
    // acima) -- best effort, mesmo espírito de sempre.
    try {
      const canSend = connection.status === "CONECTADO" && !!GATEWAY_URL && !!GATEWAY_SERVICE_TOKEN;
      const { data: publishedFlow } = await admin
        .from("chat_bot_flow_versions")
        .select("id, welcome_message, invalid_message, retry_limit, always_human_toggle, after_hours_toggle, after_hours_message, default_attendant_id")
        .eq("company_id", connection.company_id)
        .eq("status", "PUBLICADA")
        .maybeSingle();

      // Achado do usuário em 2026-09-02: o GESTOR configurou a mensagem
      // de boas-vindas com "{{nome_contato}}" esperando substituição --
      // não existia nenhum mecanismo de template, o placeholder ia pro
      // cliente literalmente. Resolve o nome real (se já souber) e o
      // nome de quem está atendendo (se já tiver alguém) uma vez só,
      // aqui -- vale pra toda mensagem do robô desta execução.
      const { data: convForTemplate } = await admin
        .from("chat_conversations")
        .select("customer_name, clients(name), profiles!chat_conversations_assigned_user_id_fkey(full_name)")
        .eq("id", conversationId)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const templateVars = {
        contactName: convForTemplate?.customer_name ?? (convForTemplate as any)?.clients?.name ?? null,
        // deno-lint-ignore no-explicit-any
        attendantName: (convForTemplate as any)?.profiles?.full_name ?? null,
      };

      const withinHours = isWithinBusinessHours(new Date());
      const awayDecision = decideAwayMessage(new Date(), lastAwaySentAt);

      if (awayDecision.shouldSend && canSend) {
        // Fora do horário: usa a mensagem PRÓPRIA do fluxo publicado
        // (se houver e estiver habilitada), senão o texto fixo de
        // sempre -- comportamento de hoje intocado quando não há robô.
        // Nunca inicia/continua a triagem fora do horário (mesma
        // decisão pra CREATE e REUSE) -- só a mensagem de aviso.
        const useFlowMessage = !!publishedFlow && publishedFlow.after_hours_toggle && !!publishedFlow.after_hours_message;
        const text2 = renderBotTemplate(useFlowMessage ? publishedFlow!.after_hours_message : AWAY_MESSAGE_TEXT, templateVars);
        // Sem fluxo publicado, grava origin='REALTIME' -- exatamente a
        // mesma linha de sempre, comportamento visual intocado pra
        // quem nunca configurou o robô.
        const sent = await sendBotMessage(admin, {
          companyId: connection.company_id,
          conversationId,
          connectionId,
          remoteJid: identity.remoteJid,
          text: text2,
          origin: useFlowMessage ? "BOT" : "REALTIME",
        });
        if (sent) {
          await admin.from("chat_conversations").update({ last_away_sent_at: new Date().toISOString() }).eq("id", conversationId);
        }
      } else if (publishedFlow && withinHours && canSend) {
        // Dentro do horário com fluxo publicado: ou INICIA a triagem
        // (conversa nova, ou uma que ficou parada porque a primeira
        // mensagem chegou fora do horário -- nunca inicia sozinho fora
        // do horário, só quando reabre) ou CONTINUA a que já estava
        // em andamento. As duas situações são unificadas aqui (não só
        // no branch CREATE) -- senão uma conversa criada fora do
        // horário nunca ganharia triagem nem depois que o expediente
        // reabrisse.
        const { data: botState } = await admin
          .from("chat_conversation_bot_state")
          .select("id, flow_version_id, current_step_id, status, answers, attempt_count")
          .eq("conversation_id", conversationId)
          .maybeSingle();
        const { data: convRow } = await admin.from("chat_conversations").select("assigned_user_id").eq("id", conversationId).maybeSingle();
        // O robô nunca fala por cima de um atendente real -- só age se
        // ninguém ainda assumiu a conversa.
        if (!convRow?.assigned_user_id && !botState) {
          const { data: stepsRaw } = await admin.from("chat_bot_flow_steps").select("*").eq("flow_version_id", publishedFlow!.id);
          const { data: conditionsRaw } = await admin.from("chat_bot_flow_step_conditions").select("*").in(
            "step_id",
            (stepsRaw ?? []).map((s: { id: string }) => s.id),
          );
          const steps = mapSteps(stepsRaw ?? []);
          const conditions = mapConditions(conditionsRaw ?? []);
          const firstStep = resolveNextEligibleStep(steps, {}, conditions);
          if (publishedFlow!.welcome_message) {
            await sendBotMessage(admin, { companyId: connection.company_id, conversationId, connectionId, remoteJid: identity.remoteJid, text: renderBotTemplate(publishedFlow!.welcome_message, templateVars) });
          }
          if (firstStep) {
            const questionSent = await sendBotMessage(admin, {
              companyId: connection.company_id,
              conversationId,
              connectionId,
              remoteJid: identity.remoteJid,
              text: renderBotTemplate(firstStep.questionText, templateVars),
            });
            if (questionSent) {
              await admin.from("chat_conversation_bot_state").insert({
                company_id: connection.company_id,
                conversation_id: conversationId,
                flow_version_id: publishedFlow!.id,
                current_step_id: firstStep.id,
                status: "EM_ANDAMENTO",
                answers: {},
                attempt_count: 0,
              });
            }
          }
        } else if (!convRow?.assigned_user_id && botState && botState.status === "EM_ANDAMENTO") {
          const { data: stepsRaw } = await admin.from("chat_bot_flow_steps").select("*").eq("flow_version_id", botState.flow_version_id);
          const { data: conditionsRaw } = await admin.from("chat_bot_flow_step_conditions").select("*").in(
            "step_id",
            (stepsRaw ?? []).map((s: { id: string }) => s.id),
          );
          const { data: rulesRaw } = await admin.from("chat_bot_routing_rules").select("*").eq("flow_version_id", botState.flow_version_id);
          const steps = mapSteps(stepsRaw ?? []);
          const conditions = mapConditions(conditionsRaw ?? []);
          const rules = mapRules(rulesRaw ?? []);
          const currentStep = steps.find((s) => s.id === botState.current_step_id);
          if (currentStep) {
            const outcome = decideTriageStep({
              step: currentStep,
              rawText: text,
              attemptCount: botState.attempt_count,
              retryLimit: publishedFlow.retry_limit,
              alwaysHumanEnabled: publishedFlow.always_human_toggle,
            });
            if (outcome.outcome === "BYPASS") {
              await admin.from("chat_conversation_bot_state").update({ status: "BYPASS_HUMANO", completed_at: new Date().toISOString() }).eq(
                "id",
                botState.id,
              );
            } else if (outcome.outcome === "INVALID_RETRY") {
              await admin.from("chat_conversation_bot_state").update({ attempt_count: outcome.attemptCount }).eq("id", botState.id);
              if (canSend) {
                await sendBotMessage(admin, {
                  companyId: connection.company_id,
                  conversationId,
                  connectionId,
                  remoteJid: identity.remoteJid,
                  text: renderBotTemplate(publishedFlow.invalid_message, templateVars),
                });
              }
            } else if (outcome.outcome === "RETRY_LIMIT_REACHED") {
              // Limite de tentativas -- sem regra a considerar (cliente
              // não terminou de responder), sempre cai no atendente
              // padrão (nunca numa fila -- ninguém coletou loja/garantia/
              // marca suficiente pra bater uma regra).
              await routeConversationViaBot(admin, {
                companyId: connection.company_id,
                conversationId,
                attendantId: publishedFlow.default_attendant_id,
                queueId: null,
                storeId: null,
                matchedRuleId: null,
              });
              await admin.from("chat_conversation_bot_state").update({ status: "LIMITE_TENTATIVAS", completed_at: new Date().toISOString() }).eq(
                "id",
                botState.id,
              );
            } else {
              const newAnswers = { ...(botState.answers ?? {}), [currentStep.stepKey]: outcome.normalizedValue };
              const next = resolveNextEligibleStep(steps, newAnswers, conditions);
              if (next) {
                await admin.from("chat_conversation_bot_state").update({ answers: newAnswers, current_step_id: next.id, attempt_count: 0 }).eq(
                  "id",
                  botState.id,
                );
                if (canSend) {
                  await sendBotMessage(admin, { companyId: connection.company_id, conversationId, connectionId, remoteJid: identity.remoteJid, text: renderBotTemplate(next.questionText, templateVars) });
                }
              } else {
                const collected = collectRoutingDimensions(steps, newAnswers);
                const matchedRule = matchRoutingRules(rules, collected);
                // Regra batida -> vai pra fila (sem dono, qualquer
                // integrante autorizado assume). Nenhuma regra bate ->
                // atendente padrão da versão (continua individual,
                // fora do escopo desta correção). Nunca os dois juntos.
                await routeConversationViaBot(admin, {
                  companyId: connection.company_id,
                  conversationId,
                  attendantId: matchedRule ? null : publishedFlow.default_attendant_id,
                  queueId: matchedRule?.targetQueueId ?? null,
                  storeId: collected.store,
                  matchedRuleId: matchedRule?.id ?? null,
                });
                await admin.from("chat_conversation_bot_state").update({
                  answers: newAnswers,
                  current_step_id: null,
                  status: "CONCLUIDO",
                  completed_at: new Date().toISOString(),
                }).eq("id", botState.id);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("[chat-inbound-webhook] erro ao processar ausência/robô de atendimento:", e instanceof Error ? e.message : e);
    }

    return json({ ok: true, conversationId }, 200);
  } catch (e) {
    console.error("[chat-inbound-webhook] erro interno:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
