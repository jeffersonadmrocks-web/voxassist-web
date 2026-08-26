// Busca ao vivo endereço/telefone/observação de uma SVO Electrolux — esses
// campos não ficam salvos no banco deles (só o endpoint de detalhe tem),
// então em vez de tentar guardar tudo no sync periódico, isso é buscado sob
// demanda quando o usuário abre o resumo do compromisso na agenda.
// Exige sessão VoxAssist válida (verify_jwt padrão desta function).
// Credencial Basic Auth da Electrolux fica só aqui, nunca no frontend.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ELECTROLUX_API_URL = Deno.env.get("ELECTROLUX_API_URL")!;
const ELECTROLUX_API_USER = Deno.env.get("ELECTROLUX_API_USER")!;
const ELECTROLUX_API_PASSWORD = Deno.env.get("ELECTROLUX_API_PASSWORD")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const body = await req.json().catch(() => ({ externalId: null }));
  const externalId = body?.externalId;
  if (!externalId) {
    return new Response(JSON.stringify({ error: "missing_external_id" }), { status: 400 });
  }

  try {
    const basicAuth = "Basic " + btoa(`${ELECTROLUX_API_USER}:${ELECTROLUX_API_PASSWORD}`);
    const res = await fetch(`${ELECTROLUX_API_URL}/api/dashboard/service-orders/${externalId}`, {
      headers: { Authorization: basicAuth },
    });
    if (!res.ok) throw new Error(`Electrolux respondeu HTTP ${res.status}`);
    const detail = await res.json();

    // Repassa só o que a agenda precisa — nunca o objeto bruto inteiro,
    // pra não vazar campos internos da Electrolux fora do escopo combinado.
    return new Response(
      JSON.stringify({
        address: detail.address || null,
        phone: detail.phone || detail.cellPhone || null,
        problemDescription: detail.problemDescription || null,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(JSON.stringify({ error: "electrolux_unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
