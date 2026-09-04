// Achado do usuário em 2026-09-04: a tela Electrolux (electrolux-reports-v0813.js)
// buscava dados direto do navegador pra ELECTROLUX_API_URL com
// credentials:"include" -- dependia do NAVEGADOR/DISPOSITIVO já ter uma
// sessão de cookie logada no painel Vox Analytics. Pra cada dispositivo/
// navegador novo, o operador tinha que logar de novo no painel Electrolux
// separadamente, mesmo com a credencial real já guardada nos secrets
// desta function (as MESMAS já usadas por sync-electrolux-agenda,
// ELECTROLUX_API_URL/USER/PASSWORD) -- "isso é uma operação do VoxAssist,
// não do usuário/dispositivo". Esta function proxeia as 3 chamadas
// GET que a tela precisa, autenticada só pela sessão VoxAssist normal
// (qualquer usuário logado), nunca expõe a credencial Electrolux ao
// navegador.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ELECTROLUX_API_URL = Deno.env.get("ELECTROLUX_API_URL")!;
const ELECTROLUX_API_USER = Deno.env.get("ELECTROLUX_API_USER")!;
const ELECTROLUX_API_PASSWORD = Deno.env.get("ELECTROLUX_API_PASSWORD")!;

// Allowlist explícita de caminhos -- nunca um proxy aberto pra
// qualquer URL que o navegador mandar. Mesmos 4 usados hoje por
// electrolux-reports-v0813.js (getJson + postJson/triggerSyncNow).
const ALLOWED_GET_PATTERNS: RegExp[] = [
  /^\/api\/dashboard\/service-orders$/,
  /^\/api\/dashboard\/service-orders\/[A-Za-z0-9_-]+$/,
  /^\/api\/dashboard\/sync-status$/,
];
const ALLOWED_POST_PATTERNS: RegExp[] = [
  /^\/api\/admin\/sync-now$/,
];

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  function respond(body: unknown, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return respond({ ok: false, error: "method_not_allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ ok: false, error: "unauthorized" }, 401);
    }
    // userClient só pra confirmar que é uma sessão VoxAssist válida --
    // esta function não escreve/lê nada do banco VoxAssist, só decide
    // se deixa passar a chamada pro painel Electrolux.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return respond({ ok: false, error: "unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const path = url.searchParams.get("path") || "";
    const allowedPatterns = req.method === "GET" ? ALLOWED_GET_PATTERNS : ALLOWED_POST_PATTERNS;
    if (!allowedPatterns.some((re) => re.test(path))) {
      return respond({ ok: false, error: "path_not_allowed" }, 400);
    }
    if (!ELECTROLUX_API_URL || !ELECTROLUX_API_USER || !ELECTROLUX_API_PASSWORD) {
      return respond({ ok: false, error: "electrolux_not_configured" }, 500);
    }

    const basicAuth = "Basic " + btoa(`${ELECTROLUX_API_USER}:${ELECTROLUX_API_PASSWORD}`);
    const upstream = await fetch(`${ELECTROLUX_API_URL}${path}`, {
      method: req.method,
      headers: { Authorization: basicAuth },
    }).catch((e) => {
      throw new Error("upstream_fetch_failed: " + (e as Error).message);
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  } catch (e) {
    return respond({ ok: false, error: (e as Error).message || "internal_error" }, 500);
  }
});
