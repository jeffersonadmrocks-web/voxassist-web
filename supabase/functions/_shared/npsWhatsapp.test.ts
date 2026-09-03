import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildApprovedMessage, buildClientWhatsappLink, toWhatsappDigits, firstName, ELECTROLUX_SURVEY_WA_LINK } from "./npsWhatsapp.ts";

Deno.test("buildApprovedMessage - preenche nome e filial corretamente, texto igual ao aprovado", () => {
  const msg = buildApprovedMessage("Maria", "Vitória");
  assertStringIncludes(msg, "Olá, Maria! 😊");
  assertStringIncludes(msg, "Vox Eletrônica – Vitória");
  assertStringIncludes(msg, "+55 41 4042-1506");
});

Deno.test("buildApprovedMessage - funciona com filial Serra", () => {
  const msg = buildApprovedMessage("João", "Serra");
  assertStringIncludes(msg, "Vox Eletrônica – Serra");
});

Deno.test("buildApprovedMessage - inclui a orientação aprovada sobre notas 9 e 10", () => {
  const msg = buildApprovedMessage("Maria", "Vitória");
  assertStringIncludes(msg, "No NPS, as notas 9 e 10 representam uma avaliação positiva para nossa empresa.");
});

Deno.test("buildApprovedMessage - espaçamento igual ao modelo aprovado 2026-09-03 (6 parágrafos)", () => {
  const msg = buildApprovedMessage("Idenísia", "Serra");
  const paragraphs = msg.split("\n\n");
  assertEquals(paragraphs.length, 6);
  assertEquals(paragraphs[0], "Olá, Idenísia! 😊 Seu atendimento foi finalizado.");
  assertEquals(paragraphs[2], "No NPS, as notas 9 e 10 representam uma avaliação positiva para nossa empresa.");
  assertEquals(paragraphs[3], "Poderia reservar um momento para responder conforme sua experiência?");
});

Deno.test("toWhatsappDigits - adiciona código do país quando ausente", () => {
  assertEquals(toWhatsappDigits("27999998888"), "5527999998888");
});

Deno.test("toWhatsappDigits - não duplica código do país quando já presente", () => {
  assertEquals(toWhatsappDigits("5527999998888"), "5527999998888");
});

Deno.test("toWhatsappDigits - remove formatação (parênteses, traço, espaço)", () => {
  assertEquals(toWhatsappDigits("(27) 99999-8888"), "5527999998888");
});

Deno.test("buildClientWhatsappLink - monta URL wa.me com texto codificado", () => {
  const link = buildClientWhatsappLink("27999998888", "Olá, Maria!");
  assertStringIncludes(link, "https://wa.me/5527999998888?text=");
  assertStringIncludes(link, encodeURIComponent("Olá, Maria!"));
});

Deno.test("firstName - extrai o primeiro nome", () => {
  assertEquals(firstName("Maria da Silva Souza"), "Maria");
  assertEquals(firstName("  João  "), "João");
});

Deno.test("ELECTROLUX_SURVEY_WA_LINK - link fixo exatamente como a spec pede, sem texto", () => {
  assertEquals(ELECTROLUX_SURVEY_WA_LINK, "https://wa.me/554140421506");
});
