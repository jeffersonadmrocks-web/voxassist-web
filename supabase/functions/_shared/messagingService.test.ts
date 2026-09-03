import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMessagePreview,
  currentClosedPeriodStart,
  decideAwayMessage,
  decideConversationTarget,
  isWithinBusinessHours,
  nextStatusOnInboundMessage,
  normalizePhone,
  resolveInboundIdentity,
  validateOutboundMessage,
} from "./messagingService.ts";

Deno.test("normalizePhone - celular BR com 9 dígitos e DDD vira 55DDNNNNNNNNN", () => {
  assertEquals(normalizePhone("(27) 99999-8888"), "5527999998888");
});

Deno.test("normalizePhone - já com código do país 55 não duplica", () => {
  assertEquals(normalizePhone("5527999998888"), "5527999998888");
});

Deno.test("normalizePhone - número inválido (poucos dígitos) retorna null", () => {
  assertEquals(normalizePhone("12345"), null);
});

Deno.test("normalizePhone - vazio/nulo retorna null", () => {
  assertEquals(normalizePhone(""), null);
  assertEquals(normalizePhone(null), null);
  assertEquals(normalizePhone(undefined), null);
});

Deno.test("resolveInboundIdentity - JID de telefone direto (@s.whatsapp.net) vira customerPhone, sem LID", () => {
  const r = resolveInboundIdentity({ remoteJid: "5527999998888@s.whatsapp.net" });
  assertEquals(r, { remoteJid: "5527999998888@s.whatsapp.net", customerPhone: "5527999998888", senderLid: null });
});

Deno.test("resolveInboundIdentity - JID de telefone com sufixo de device (multi-device)", () => {
  const r = resolveInboundIdentity({ remoteJid: "5527999998888:32@s.whatsapp.net" });
  assertEquals(r?.customerPhone, "5527999998888");
});

Deno.test("resolveInboundIdentity - achado real: remoteJid é LID sem resolução -- NUNCA vira customerPhone", () => {
  const r = resolveInboundIdentity({ remoteJid: "77369691910178@lid" });
  assertEquals(r, { remoteJid: "77369691910178@lid", customerPhone: null, senderLid: "77369691910178" });
});

Deno.test("resolveInboundIdentity - remoteJid é LID mas o Baileys já resolveu o telefone (senderPn) -- customerPhone preenchido, sem promover o LID", () => {
  const r = resolveInboundIdentity({
    remoteJid: "77369691910178@lid",
    senderPn: "5527999998888@s.whatsapp.net",
  });
  assertEquals(r, { remoteJid: "77369691910178@lid", customerPhone: "5527999998888", senderLid: "77369691910178" });
});

Deno.test("resolveInboundIdentity - JID que não é telefone nem LID (ex.: grupo) retorna null", () => {
  assertEquals(resolveInboundIdentity({ remoteJid: "120363012345678901@g.us" }), null);
});

Deno.test("resolveInboundIdentity - vazio retorna null", () => {
  assertEquals(resolveInboundIdentity({ remoteJid: "" }), null);
});

Deno.test("validateOutboundMessage - corpo vazio é inválido", () => {
  const r = validateOutboundMessage({ body: "   ", connectionStatus: "CONECTADO" });
  assertEquals(r.ok, false);
});

Deno.test("validateOutboundMessage - conexão não CONECTADO é inválida mesmo com corpo válido", () => {
  const r = validateOutboundMessage({ body: "Olá!", connectionStatus: "DESCONECTADO" });
  assertEquals(r.ok, false);
});

Deno.test("validateOutboundMessage - corpo preenchido + CONECTADO é válido", () => {
  const r = validateOutboundMessage({ body: "Olá!", connectionStatus: "CONECTADO" });
  assertEquals(r.ok, true);
});

Deno.test("validateOutboundMessage - corpo vazio COM documento é válido (PDF sem legenda)", () => {
  const r = validateOutboundMessage({ body: "", connectionStatus: "CONECTADO", hasDocument: true });
  assertEquals(r.ok, true);
});

Deno.test("validateOutboundMessage - corpo vazio SEM documento continua inválido", () => {
  const r = validateOutboundMessage({ body: "", connectionStatus: "CONECTADO", hasDocument: false });
  assertEquals(r.ok, false);
});

Deno.test("decideConversationTarget - nenhuma conversa existente -> CREATE", () => {
  assertEquals(decideConversationTarget([]), { action: "CREATE" });
});

Deno.test("decideConversationTarget - conversa aberta existente -> REUSE", () => {
  const r = decideConversationTarget([{ id: "c1", status: "ABERTA" }]);
  assertEquals(r, { action: "REUSE", conversationId: "c1" });
});

Deno.test("decideConversationTarget - só existe conversa FINALIZADA -> REOPEN da mesma conversa (preserva histórico, achado do usuário 2026-09-02)", () => {
  const r = decideConversationTarget([{ id: "c1", status: "FINALIZADA" }]);
  assertEquals(r, { action: "REOPEN", conversationId: "c1" });
});

Deno.test("decideConversationTarget - várias FINALIZADA -> REOPEN da mais recente (primeira da lista, ordenada desc)", () => {
  const r = decideConversationTarget([
    { id: "mais-recente", status: "FINALIZADA" },
    { id: "mais-antiga", status: "FINALIZADA" },
  ]);
  assertEquals(r, { action: "REOPEN", conversationId: "mais-recente" });
});

Deno.test("decideConversationTarget - mistura de finalizadas e uma aberta -> reaproveita a aberta", () => {
  const r = decideConversationTarget([
    { id: "old", status: "FINALIZADA" },
    { id: "current", status: "EM_ATENDIMENTO" },
  ]);
  assertEquals(r, { action: "REUSE", conversationId: "current" });
});

Deno.test("nextStatusOnInboundMessage - AGUARDANDO_CLIENTE volta pra EM_ATENDIMENTO", () => {
  assertEquals(nextStatusOnInboundMessage("AGUARDANDO_CLIENTE"), "EM_ATENDIMENTO");
});

Deno.test("nextStatusOnInboundMessage - ABERTA continua ABERTA", () => {
  assertEquals(nextStatusOnInboundMessage("ABERTA"), "ABERTA");
});

Deno.test("nextStatusOnInboundMessage - EM_ATENDIMENTO continua EM_ATENDIMENTO", () => {
  assertEquals(nextStatusOnInboundMessage("EM_ATENDIMENTO"), "EM_ATENDIMENTO");
});

Deno.test("buildMessagePreview - texto curto não trunca", () => {
  assertEquals(buildMessagePreview("Oi, tudo bem?"), "Oi, tudo bem?");
});

Deno.test("buildMessagePreview - texto longo trunca com reticências", () => {
  const long = "a".repeat(100);
  const r = buildMessagePreview(long, 80);
  assertEquals(r.length, 80);
  assertEquals(r.endsWith("…"), true);
});

Deno.test("buildMessagePreview - corpo vazio (mídia sem legenda) vira [mídia]", () => {
  assertEquals(buildMessagePreview(null), "[mídia]");
  assertEquals(buildMessagePreview("   "), "[mídia]");
});

// Datas de referência verificadas: 2026-08-31 é segunda-feira,
// 2026-09-01 é terça-feira (mesma semana usada no resto da sessão).
// Todos os horários abaixo são convertidos manualmente pra UTC
// (Brasília = UTC-3) nos comentários, pra nunca depender do fuso do
// runner do teste.

Deno.test("isWithinBusinessHours - terça 13h Brasília (16h UTC) está dentro do expediente", () => {
  assertEquals(isWithinBusinessHours(new Date(Date.UTC(2026, 8, 1, 16, 0, 0))), true);
});

Deno.test("isWithinBusinessHours - terça 19h Brasília (22h UTC) está fechado", () => {
  assertEquals(isWithinBusinessHours(new Date(Date.UTC(2026, 8, 1, 22, 0, 0))), false);
});

Deno.test("isWithinBusinessHours - terça 7h Brasília (10h UTC) está fechado (antes de abrir)", () => {
  assertEquals(isWithinBusinessHours(new Date(Date.UTC(2026, 8, 1, 10, 0, 0))), false);
});

Deno.test("isWithinBusinessHours - fronteira exata das 8h Brasília (11h UTC) já está aberto", () => {
  assertEquals(isWithinBusinessHours(new Date(Date.UTC(2026, 8, 1, 11, 0, 0))), true);
});

Deno.test("isWithinBusinessHours - fronteira exata das 18h Brasília (21h UTC) já está fechado", () => {
  assertEquals(isWithinBusinessHours(new Date(Date.UTC(2026, 8, 1, 21, 0, 0))), false);
});

Deno.test("isWithinBusinessHours - sábado a qualquer hora está fechado", () => {
  assertEquals(isWithinBusinessHours(new Date(Date.UTC(2026, 8, 5, 15, 0, 0))), false);
});

Deno.test("isWithinBusinessHours - domingo a qualquer hora está fechado", () => {
  assertEquals(isWithinBusinessHours(new Date(Date.UTC(2026, 8, 6, 15, 0, 0))), false);
});

Deno.test("currentClosedPeriodStart - dentro do expediente retorna null", () => {
  assertEquals(currentClosedPeriodStart(new Date(Date.UTC(2026, 8, 1, 16, 0, 0))), null);
});

Deno.test("currentClosedPeriodStart - terça 19h Brasília -- fechou hoje às 18h Brasília (21h UTC)", () => {
  const r = currentClosedPeriodStart(new Date(Date.UTC(2026, 8, 1, 22, 0, 0)));
  assertEquals(r?.toISOString(), new Date(Date.UTC(2026, 8, 1, 21, 0, 0)).toISOString());
});

Deno.test("currentClosedPeriodStart - terça 7h Brasília -- fechou ontem (segunda) às 18h Brasília", () => {
  const r = currentClosedPeriodStart(new Date(Date.UTC(2026, 8, 1, 10, 0, 0)));
  assertEquals(r?.toISOString(), new Date(Date.UTC(2026, 7, 31, 21, 0, 0)).toISOString());
});

Deno.test("currentClosedPeriodStart - segunda de madrugada -- fechou na sexta anterior às 18h Brasília, não sábado", () => {
  // segunda 2026-08-31, 5h Brasília = 8h UTC -- sexta anterior é 2026-08-28.
  const r = currentClosedPeriodStart(new Date(Date.UTC(2026, 7, 31, 8, 0, 0)));
  assertEquals(r?.toISOString(), new Date(Date.UTC(2026, 7, 28, 21, 0, 0)).toISOString());
});

Deno.test("currentClosedPeriodStart - sábado -- fechou na sexta às 18h Brasília", () => {
  // sábado 2026-09-05, meio-dia Brasília -- sexta é 2026-09-04.
  const r = currentClosedPeriodStart(new Date(Date.UTC(2026, 8, 5, 15, 0, 0)));
  assertEquals(r?.toISOString(), new Date(Date.UTC(2026, 8, 4, 21, 0, 0)).toISOString());
});

Deno.test("currentClosedPeriodStart - domingo -- fechou na sexta às 18h Brasília (mesmo período do sábado)", () => {
  const sat = currentClosedPeriodStart(new Date(Date.UTC(2026, 8, 5, 15, 0, 0)));
  const sun = currentClosedPeriodStart(new Date(Date.UTC(2026, 8, 6, 15, 0, 0)));
  assertEquals(sun?.toISOString(), sat?.toISOString());
});

Deno.test("decideAwayMessage - dentro do expediente nunca manda, mesmo sem envio anterior", () => {
  const r = decideAwayMessage(new Date(Date.UTC(2026, 8, 1, 16, 0, 0)), null);
  assertEquals(r.shouldSend, false);
});

Deno.test("decideAwayMessage - fechado e nunca mandou antes -- manda", () => {
  const r = decideAwayMessage(new Date(Date.UTC(2026, 8, 1, 22, 0, 0)), null);
  assertEquals(r.shouldSend, true);
});

Deno.test("decideAwayMessage - fechado mas já mandou depois que o período começou -- não repete", () => {
  // período fechado começou às 21h UTC; já mandamos às 21h30 UTC.
  const r = decideAwayMessage(
    new Date(Date.UTC(2026, 8, 1, 23, 0, 0)),
    new Date(Date.UTC(2026, 8, 1, 21, 30, 0)).toISOString()
  );
  assertEquals(r.shouldSend, false);
});

Deno.test("decideAwayMessage - fechado, último envio foi do período fechado ANTERIOR -- manda de novo neste novo período", () => {
  // Cliente escreveu segunda à noite (já respondido), e escreve de novo terça à noite --
  // são dois períodos fechados diferentes, cada um merece sua própria mensagem.
  const lastAway = new Date(Date.UTC(2026, 7, 31, 22, 0, 0)).toISOString(); // segunda à noite
  const r = decideAwayMessage(new Date(Date.UTC(2026, 8, 1, 22, 0, 0)), lastAway); // terça à noite
  assertEquals(r.shouldSend, true);
});
