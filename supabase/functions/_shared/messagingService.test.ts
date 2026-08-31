import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMessagePreview,
  decideConversationTarget,
  nextStatusOnInboundMessage,
  normalizePhone,
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

Deno.test("decideConversationTarget - nenhuma conversa existente -> CREATE", () => {
  assertEquals(decideConversationTarget([]), { action: "CREATE" });
});

Deno.test("decideConversationTarget - conversa aberta existente -> REUSE", () => {
  const r = decideConversationTarget([{ id: "c1", status: "ABERTA" }]);
  assertEquals(r, { action: "REUSE", conversationId: "c1" });
});

Deno.test("decideConversationTarget - só existe conversa FINALIZADA -> CREATE (reabrir gera conversa nova, não reaproveita a fechada)", () => {
  const r = decideConversationTarget([{ id: "c1", status: "FINALIZADA" }]);
  assertEquals(r, { action: "CREATE" });
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
