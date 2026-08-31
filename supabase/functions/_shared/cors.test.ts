import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCorsHeaders } from "./cors.ts";

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

Deno.test("buildCorsHeaders - sempre inclui métodos e headers permitidos", () => {
  const h = buildCorsHeaders("https://voxassist-web.vercel.app");
  assertEquals(h["Access-Control-Allow-Methods"], "POST, OPTIONS");
  assertEquals(h["Access-Control-Allow-Headers"], "authorization, apikey, content-type, x-client-info");
});

Deno.test("buildCorsHeaders - nunca usa wildcard '*' (allowlist explícita)", () => {
  const h = buildCorsHeaders("https://voxassist-web.vercel.app");
  assertEquals(h["Access-Control-Allow-Origin"] === "*", false);
});
