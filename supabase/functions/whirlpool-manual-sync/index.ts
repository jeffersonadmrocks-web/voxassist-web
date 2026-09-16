// "Sincronizar agora" (WP/Seguradora, GESTOR): antes desta function, o
// Supabase não tinha como acionar o GitHub Actions -- whirlpool_request_
// manual_sync (2026-09-15) só liberava a próxima janela do cron zerando
// next_retry_at. Esta function preserva TODA a validação/auditoria dessa
// RPC (chamada aqui como o próprio usuário, RLS/security-definer intactos
// -- nunca ignora CREDENCIAIS_INVALIDAS/PAUSADO/lock ativo) e, só se ela
// aceitar, dispara de fato um workflow_dispatch no GitHub Actions -- a
// MESMA execução do cron, na hora, sem esperar os ~15 minutos. O token do
// GitHub (escopo mínimo: Actions:read/write só neste repositório) fica só
// em segredo de function (WHIRLPOOL_GITHUB_DISPATCH_TOKEN), nunca no
// frontend/RLS/logs. Se o token ainda não estiver configurado, a RPC já
// rodou (backoff liberado) e a resposta avisa que o disparo real falhou,
// em vez de fingir sucesso.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_DISPATCH_TOKEN = Deno.env.get("WHIRLPOOL_GITHUB_DISPATCH_TOKEN");
const REPOSITORY = "jeffersonadmrocks-web/voxassist-web";
const WORKFLOW_FILE = "whirlpool-online-worker.yml";

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...buildCorsHeaders(origin) },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401, origin);

  try {
    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body?.connection_id === "string" ? body.connection_id : "";
    if (!connectionId) return json({ ok: false, error: "connection_id_ausente" }, 400, origin);

    // Roda como o próprio usuário: whirlpool_request_manual_sync já exige
    // GESTOR ativo e nunca ignora CREDENCIAIS_INVALIDAS/PAUSADO/lock --
    // nenhuma verificação extra é reimplementada aqui.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: syncResult, error: syncError } = await userClient.rpc("whirlpool_request_manual_sync", {
      p_connection_id: connectionId,
    });
    if (syncError) return json({ ok: false, error: syncError.message.slice(0, 200) }, 400, origin);

    if (syncResult?.already_running) {
      return json({ ok: true, already_running: true, dispatched: false }, 200, origin);
    }

    if (!GITHUB_DISPATCH_TOKEN) {
      return json(
        { ok: true, already_running: false, dispatched: false, dispatch_error: "TOKEN_GITHUB_NAO_CONFIGURADO" },
        200,
        origin,
      );
    }

    const dispatchResponse = await fetch(
      `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${GITHUB_DISPATCH_TOKEN}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    if (!dispatchResponse.ok) {
      return json(
        { ok: true, already_running: false, dispatched: false, dispatch_error: "GITHUB_DISPATCH_HTTP_" + dispatchResponse.status },
        200,
        origin,
      );
    }

    return json({ ok: true, already_running: false, dispatched: true }, 200, origin);
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 200) : "erro_desconhecido";
    return json({ ok: false, error: message }, 500, origin);
  }
});
