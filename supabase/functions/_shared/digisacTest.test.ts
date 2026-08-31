import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCorsHeaders,
  buildTestUrl,
  classifyNetworkError,
  classifyResponse,
  findMissingConfigVar,
  isAuthorizedRole,
  stagesForMissingConfig,
} from "./digisacTest.ts";

Deno.test("findMissingConfigVar - detecta DIGISAC_API_URL ausente primeiro", () => {
  const r = findMissingConfigVar({ apiUrl: null, apiToken: "t", testPath: "/api/v1/schedule/0" });
  assertEquals(r, "DIGISAC_API_URL");
});

Deno.test("findMissingConfigVar - detecta DIGISAC_API_TOKEN ausente", () => {
  const r = findMissingConfigVar({ apiUrl: "https://x-api.digisac.com.br", apiToken: null, testPath: "/api/v1/schedule/0" });
  assertEquals(r, "DIGISAC_API_TOKEN");
});

Deno.test("findMissingConfigVar - detecta DIGISAC_TEST_PATH ausente (nunca presume rota)", () => {
  const r = findMissingConfigVar({ apiUrl: "https://x-api.digisac.com.br", apiToken: "t", testPath: null });
  assertEquals(r, "DIGISAC_TEST_PATH");
});

Deno.test("findMissingConfigVar - tudo presente retorna null", () => {
  const r = findMissingConfigVar({ apiUrl: "https://x-api.digisac.com.br", apiToken: "t", testPath: "/api/v1/schedule/0" });
  assertEquals(r, null);
});

Deno.test("buildTestUrl - junta base e path sem duplicar barra", () => {
  assertEquals(buildTestUrl("https://x-api.digisac.com.br/", "/api/v1/schedule/0"), "https://x-api.digisac.com.br/api/v1/schedule/0");
  assertEquals(buildTestUrl("https://x-api.digisac.com.br", "api/v1/schedule/0"), "https://x-api.digisac.com.br/api/v1/schedule/0");
  assertEquals(buildTestUrl("https://x-api.digisac.com.br", "/api/v1/schedule/0"), "https://x-api.digisac.com.br/api/v1/schedule/0");
});

Deno.test("classifyResponse - 401 é token recusado, digisac alcançada mas token NÃO validado", () => {
  const r = classifyResponse({ httpStatus: 401, looksLikeJson: true });
  assertEquals(r.status, "TOKEN_RECUSADO");
  assertEquals(r.stages, { edgeFunctionReached: true, digisacReached: true, tokenValidated: false, endpointFunctional: false });
});

Deno.test("classifyResponse - 403 é token recusado, mesmos estágios do 401", () => {
  const r = classifyResponse({ httpStatus: 403, looksLikeJson: true });
  assertEquals(r.status, "TOKEN_RECUSADO");
  assertEquals(r.stages.digisacReached, true);
  assertEquals(r.stages.tokenValidated, false);
});

Deno.test("classifyResponse - 429 é indisponível, mas token JÁ foi validado (passou da checagem 401/403)", () => {
  const r = classifyResponse({ httpStatus: 429, looksLikeJson: true });
  assertEquals(r.status, "ENDPOINT_INDISPONIVEL");
  assertEquals(r.stages, { edgeFunctionReached: true, digisacReached: true, tokenValidated: true, endpointFunctional: false });
});

Deno.test("classifyResponse - 500+ é indisponível, mas digisac alcançada e token validado (achado real: SVO 500)", () => {
  const r = classifyResponse({ httpStatus: 500, looksLikeJson: true });
  assertEquals(r.status, "ENDPOINT_INDISPONIVEL");
  assertEquals(r.stages, { edgeFunctionReached: true, digisacReached: true, tokenValidated: true, endpointFunctional: false });
});

Deno.test("classifyResponse - 200 com corpo JSON é conexão válida, todos os 4 estágios true", () => {
  const r = classifyResponse({ httpStatus: 200, looksLikeJson: true });
  assertEquals(r.status, "CONEXAO_VALIDA");
  assertEquals(r.stages, { edgeFunctionReached: true, digisacReached: true, tokenValidated: true, endpointFunctional: true });
});

Deno.test("classifyResponse - 404 com corpo JSON ainda é conexão válida (token passou, recurso é que não existe)", () => {
  const r = classifyResponse({ httpStatus: 404, looksLikeJson: true });
  assertEquals(r.status, "CONEXAO_VALIDA");
  assertEquals(r.stages.endpointFunctional, true);
});

Deno.test("classifyResponse - 200 sem corpo JSON (ex.: página HTML por URL base errada) não é conexão válida nem endpoint funcional", () => {
  const r = classifyResponse({ httpStatus: 200, looksLikeJson: false });
  assertEquals(r.status, "ENDPOINT_INDISPONIVEL");
  assertEquals(r.stages.endpointFunctional, false);
  // Ainda assim chegou uma resposta HTTP 200 de algum lugar -- token/rede
  // não são o problema, só não é a API da Digisac de verdade.
  assertEquals(r.stages.digisacReached, true);
  assertEquals(r.stages.tokenValidated, true);
});

Deno.test("classifyNetworkError - timeout (AbortError) é indisponível com mensagem própria, nunca saiu da Edge Function", () => {
  const err = new Error("aborted");
  err.name = "AbortError";
  const r = classifyNetworkError(err);
  assertEquals(r.status, "ENDPOINT_INDISPONIVEL");
  assertEquals(r.httpStatus, null);
  assertEquals(r.message.includes("Tempo limite"), true);
  assertEquals(r.stages, { edgeFunctionReached: true, digisacReached: false, tokenValidated: false, endpointFunctional: false });
});

Deno.test("classifyNetworkError - erro de rede genérico é indisponível, digisac não foi alcançada", () => {
  const r = classifyNetworkError(new TypeError("fetch failed"));
  assertEquals(r.status, "ENDPOINT_INDISPONIVEL");
  assertEquals(r.stages.digisacReached, false);
});

Deno.test("stagesForMissingConfig - config ausente nunca sai da Edge Function", () => {
  const s = stagesForMissingConfig();
  assertEquals(s, { edgeFunctionReached: true, digisacReached: false, tokenValidated: false, endpointFunctional: false });
});

Deno.test("isAuthorizedRole - somente GESTOR passa", () => {
  assertEquals(isAuthorizedRole("GESTOR"), true);
  assertEquals(isAuthorizedRole("ATENDENTE"), false);
  assertEquals(isAuthorizedRole("TECNICO"), false);
  assertEquals(isAuthorizedRole(null), false);
});

Deno.test("buildCorsHeaders - origem na allowlist recebe Access-Control-Allow-Origin", () => {
  const h = buildCorsHeaders("https://voxassist-web.vercel.app", ["https://voxassist-web.vercel.app"]);
  assertEquals(h["Access-Control-Allow-Origin"], "https://voxassist-web.vercel.app");
});

Deno.test("buildCorsHeaders - origem fora da allowlist não recebe Access-Control-Allow-Origin", () => {
  const h = buildCorsHeaders("https://site-nao-autorizado.example", ["https://voxassist-web.vercel.app"]);
  assertEquals("Access-Control-Allow-Origin" in h, false);
});

Deno.test("buildCorsHeaders - origem nula (chamada sem Origin, ex.: curl) não recebe o header, mas não quebra", () => {
  const h = buildCorsHeaders(null, ["https://voxassist-web.vercel.app"]);
  assertEquals("Access-Control-Allow-Origin" in h, false);
});

Deno.test("buildCorsHeaders - sempre inclui métodos e headers permitidos (authorization/apikey/content-type/x-client-info)", () => {
  const h = buildCorsHeaders("https://voxassist-web.vercel.app");
  assertEquals(h["Access-Control-Allow-Methods"], "POST, OPTIONS");
  assertEquals(h["Access-Control-Allow-Headers"], "authorization, apikey, content-type, x-client-info");
});

Deno.test("buildCorsHeaders - nunca usa wildcard '*' (allowlist explícita)", () => {
  const h = buildCorsHeaders("https://voxassist-web.vercel.app");
  assertEquals(h["Access-Control-Allow-Origin"] === "*", false);
});
