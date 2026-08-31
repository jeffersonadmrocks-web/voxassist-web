// Digisac — etapa 1 (somente validação de conexão). Confirma se
// DIGISAC_API_URL/DIGISAC_API_TOKEN estão corretos SEM enviar mensagem,
// criar contato, abrir atendimento ou alterar qualquer dado no Digisac.
// Só faz um GET de baixo risco (caminho definido em DIGISAC_TEST_PATH —
// nunca hardcoded aqui, porque a documentação oficial da Digisac não expõe
// um endpoint de identificação de conta/usuário ("Me") documentado; ver
// digisacTest.ts). Nunca loga nem devolve o token — só um resultado
// sanitizado. Restrito a GESTOR autenticado. Próximas etapas (leitura de
// conversas/mensagens, envio de template, contatos, webhooks) ficam fora
// deste escopo de propósito.
//
// CORS: a function é chamada direto do navegador em produção
// (voxassist-web.vercel.app -> *.supabase.co é cross-origin), então TODA
// resposta — incluindo o preflight OPTIONS e todo caso de erro (401/403/
// 405/500) — precisa carregar os headers de CORS, senão o navegador
// bloqueia o fetch antes mesmo dele sair. Achado real: era exatamente essa
// a causa do "Falha ao chamar a função de teste" em produção.
//
// Log sanitizado (digisac_test_runs, ver supabase/digisac_test_audit_
// 20260828.sql): grava só estágio alcançado, status HTTP upstream e
// duração — nunca URL completa, headers, JWT ou token. Best-effort: uma
// falha ao gravar o log nunca pode impedir a resposta do teste ao usuário.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildTestUrl,
  classifyNetworkError,
  classifyResponse,
  findMissingConfigVar,
  isAuthorizedRole,
  messageForMissingVar,
  stagesForMissingConfig,
  type DigisacConfig,
  type DigisacTestStages,
} from "../_shared/digisacTest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TIMEOUT_MS = 8000;

type Profile = { role: string | null };

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = buildCorsHeaders(origin);

  // Preflight: o navegador nunca manda Authorization/apikey aqui — só
  // confirma se o método/headers reais serão aceitos. Tem que responder
  // antes de qualquer checagem de auth.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  function respond(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    if (req.method !== "POST") {
      return respond({ ok: false, error: "method_not_allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ ok: false, error: "unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return respond({ ok: false, error: "unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle<Profile>();

    // Só GESTOR (papel de gestão/administração do VoxAssist) pode disparar
    // o teste — requisito explícito do pedido, evita qualquer usuário
    // comum sondar a integração.
    if (!isAuthorizedRole(profile?.role ?? null)) {
      return respond({ ok: false, error: "forbidden" }, 403);
    }

    async function logRun(resultStatus: string, stages: DigisacTestStages, upstreamHttpStatus: number | null, durationMs: number) {
      try {
        await admin.from("digisac_test_runs").insert({
          tested_by: user!.id,
          result_status: resultStatus,
          digisac_reached: stages.digisacReached,
          token_validated: stages.tokenValidated,
          endpoint_functional: stages.endpointFunctional,
          upstream_http_status: upstreamHttpStatus,
          duration_ms: durationMs,
        });
      } catch {
        // Best-effort — log sanitizado nunca pode derrubar a resposta do teste.
      }
    }

    const startedAt = Date.now();

    const cfg: DigisacConfig = {
      apiUrl: Deno.env.get("DIGISAC_API_URL") || null,
      apiToken: Deno.env.get("DIGISAC_API_TOKEN") || null,
      testPath: Deno.env.get("DIGISAC_TEST_PATH") || null,
    };

    const missing = findMissingConfigVar(cfg);
    if (missing) {
      const stages = stagesForMissingConfig();
      await logRun("CONFIGURACAO_AUSENTE", stages, null, Date.now() - startedAt);
      return respond(
        { ok: false, status: "CONFIGURACAO_AUSENTE", httpStatus: null, message: messageForMissingVar(missing), accountName: null, authenticatedUser: null, stages },
        200
      );
    }

    const url = buildTestUrl(cfg.apiUrl!, cfg.testPath!);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      // Bearer token só existe aqui, no servidor — nunca chega ao cliente,
      // nunca é escrito em log (nem em caso de erro: só a mensagem
      // sanitizada de classifyNetworkError/classifyResponse sai da
      // function, e o log em banco só grava estágio/status HTTP/duração).
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${cfg.apiToken}`, Accept: "application/json" },
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type") || "";
      let looksLikeJson = contentType.includes("application/json");
      let parsedBody: unknown = null;
      if (looksLikeJson) {
        try {
          parsedBody = await res.json();
        } catch {
          looksLikeJson = false;
        }
      }

      const outcome = classifyResponse({ httpStatus: res.status, looksLikeJson });

      // Best-effort: só preenche se o corpo (já sanitizado — sem token/
      // headers) trouxer algo parecido com nome de conta/usuário. A rota
      // testada é de baixo risco (agenda), então normalmente estes campos
      // ficam null — é esperado nesta etapa e documentado no relatório.
      let accountName: string | null = null;
      let authenticatedUser: string | null = null;
      if (parsedBody && typeof parsedBody === "object") {
        const b = parsedBody as Record<string, unknown>;
        const candAccount = b.accountName ?? b.companyName ?? b.company ?? null;
        const candUser = b.userName ?? b.user ?? null;
        if (typeof candAccount === "string") accountName = candAccount;
        if (typeof candUser === "string") authenticatedUser = candUser;
      }

      await logRun(outcome.status, outcome.stages, outcome.httpStatus, Date.now() - startedAt);
      return respond(
        {
          ok: outcome.status === "CONEXAO_VALIDA",
          status: outcome.status,
          httpStatus: outcome.httpStatus,
          message: outcome.message,
          accountName,
          authenticatedUser,
          stages: outcome.stages,
        },
        200
      );
    } catch (e) {
      const outcome = classifyNetworkError(e);
      await logRun(outcome.status, outcome.stages, outcome.httpStatus, Date.now() - startedAt);
      return respond(
        { ok: false, status: outcome.status, httpStatus: outcome.httpStatus, message: outcome.message, accountName: null, authenticatedUser: null, stages: outcome.stages },
        200
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Qualquer falha não prevista (ex.: profiles indisponível) ainda
    // precisa sair com os headers de CORS, senão o navegador mostra o
    // mesmo "falha de rede" genérico e esconde o erro real.
    return respond({ ok: false, error: "internal_error" }, 500);
  }
});
