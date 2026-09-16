import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkConnectionSafetyGate, resolveGatewayRequest } from "./chatGatewayProxy.ts";

Deno.test("resolveGatewayRequest - create sem nome é inválido", () => {
  const r = resolveGatewayRequest("create", { name: "  " }, "company-1");
  assertEquals(r, { ok: false, error: "missing_name" });
});

Deno.test("resolveGatewayRequest - create com nome monta POST /connections com companyId da sessão (nunca do body)", () => {
  const r = resolveGatewayRequest("create", { name: "Vox Serra Principal", storeId: "store-1" }, "company-1");
  assertEquals(r, { ok: true, path: "/connections", method: "POST", body: { name: "Vox Serra Principal", companyId: "company-1", storeId: "store-1" } });
});

Deno.test("resolveGatewayRequest - create sem storeId manda null, não undefined/omitido", () => {
  const r = resolveGatewayRequest("create", { name: "Teste" }, "company-1");
  assertEquals(r, { ok: true, path: "/connections", method: "POST", body: { name: "Teste", companyId: "company-1", storeId: null } });
});

Deno.test("resolveGatewayRequest - connect sem connectionId é inválido", () => {
  const r = resolveGatewayRequest("connect", {}, "company-1");
  assertEquals(r, { ok: false, error: "missing_connection_id" });
});

Deno.test("resolveGatewayRequest - connect monta POST /connections/:id/connect", () => {
  const r = resolveGatewayRequest("connect", { connectionId: "conn-1" }, "company-1");
  assertEquals(r, { ok: true, path: "/connections/conn-1/connect", method: "POST" });
});

Deno.test("resolveGatewayRequest - reconnect monta POST /connections/:id/reconnect", () => {
  const r = resolveGatewayRequest("reconnect", { connectionId: "conn-1" }, "company-1");
  assertEquals(r, { ok: true, path: "/connections/conn-1/reconnect", method: "POST" });
});

Deno.test("resolveGatewayRequest - disconnect monta POST /connections/:id/disconnect", () => {
  const r = resolveGatewayRequest("disconnect", { connectionId: "conn-1" }, "company-1");
  assertEquals(r, { ok: true, path: "/connections/conn-1/disconnect", method: "POST" });
});

Deno.test("resolveGatewayRequest - qr monta GET /connections/:id/qr", () => {
  const r = resolveGatewayRequest("qr", { connectionId: "conn-1" }, "company-1");
  assertEquals(r, { ok: true, path: "/connections/conn-1/qr", method: "GET" });
});

Deno.test("resolveGatewayRequest - ação desconhecida é inválida", () => {
  const r = resolveGatewayRequest("apagar-tudo", { connectionId: "conn-1" }, "company-1");
  assertEquals(r, { ok: false, error: "invalid_action" });
});

// checkConnectionSafetyGate — P0 de segurança (incidente 2026-09-16): a
// mesma linha ficou conectada simultaneamente na Digisac e no gateway
// Baileys, motivando uma restrição de 10h do WhatsApp. connect/reconnect
// nunca podem alcançar o gateway enquanto pausada ou em conflito.
Deno.test("checkConnectionSafetyGate - connect bloqueado quando pausada", () => {
  const r = checkConnectionSafetyGate("connect", { pausedAt: "2026-09-16T20:00:00Z", externalProviderActive: false });
  assertEquals(r, { ok: false, error: "connection_paused" });
});

Deno.test("checkConnectionSafetyGate - reconnect bloqueado quando pausada", () => {
  const r = checkConnectionSafetyGate("reconnect", { pausedAt: "2026-09-16T20:00:00Z", externalProviderActive: false });
  assertEquals(r, { ok: false, error: "connection_paused" });
});

Deno.test("checkConnectionSafetyGate - connect bloqueado quando ha provedor externo ativo (Digisac)", () => {
  const r = checkConnectionSafetyGate("connect", { pausedAt: null, externalProviderActive: true });
  assertEquals(r, { ok: false, error: "external_provider_conflict" });
});

Deno.test("checkConnectionSafetyGate - pausa tem prioridade quando os dois estao ativos", () => {
  const r = checkConnectionSafetyGate("connect", { pausedAt: "2026-09-16T20:00:00Z", externalProviderActive: true });
  assertEquals(r, { ok: false, error: "connection_paused" });
});

Deno.test("checkConnectionSafetyGate - connect permitido quando nada esta ativo", () => {
  const r = checkConnectionSafetyGate("connect", { pausedAt: null, externalProviderActive: false });
  assertEquals(r, { ok: true });
});

Deno.test("checkConnectionSafetyGate - disconnect NUNCA e bloqueado, mesmo pausada/em conflito", () => {
  const r = checkConnectionSafetyGate("disconnect", { pausedAt: "2026-09-16T20:00:00Z", externalProviderActive: true });
  assertEquals(r, { ok: true });
});

Deno.test("checkConnectionSafetyGate - qr NUNCA e bloqueado, mesmo pausada/em conflito", () => {
  const r = checkConnectionSafetyGate("qr", { pausedAt: "2026-09-16T20:00:00Z", externalProviderActive: true });
  assertEquals(r, { ok: true });
});

Deno.test("checkConnectionSafetyGate - create NUNCA e bloqueado (nao ha conexao existente pra checar)", () => {
  const r = checkConnectionSafetyGate("create", { pausedAt: "2026-09-16T20:00:00Z", externalProviderActive: true });
  assertEquals(r, { ok: true });
});
