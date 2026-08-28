// App Gateway v1 — única camada autorizada a resolver e abrir aplicativos
// externos integrados (Pulse IA primeiro). O cliente manda só um `slug`;
// a launch_url final vem sempre de integrated_apps (service_role), nunca
// do cliente. Toda tentativa (sucesso, bloqueio ou erro) é auditada em
// app_launch_audit. Segue o mesmo padrão de auth de
// get-electrolux-appointment-detail: exige Authorization, resolve o
// usuário via userClient.auth.getUser(), e só então usa service_role pra
// consultar profiles/integrated_apps e gravar a auditoria.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decideLaunch, type IntegratedApp } from "../_shared/appGateway.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Profile = { role: string | null; active_company_id: string | null; active: boolean | null };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const origin = typeof body?.origin === "string" && body.origin ? body.origin : "sidebar";
  if (!slug) {
    return new Response(JSON.stringify({ ok: false, error: "missing_slug" }), { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  async function audit(result: "SUCCESS" | "BLOCKED" | "ERROR", reason: string | null, appId: string | null, companyId: string | null) {
    try {
      await admin
        .from("app_launch_audit")
        .insert({ requested_slug: slug, app_id: appId, user_id: user!.id, company_id: companyId, result, reason, origin });
    } catch {
      // Auditoria é best-effort — uma falha aqui não pode impedir a resposta ao cliente.
    }
  }

  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("role, active_company_id, active")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    const companyId = profile?.active_company_id ?? null;

    // Conta desativada bloqueia qualquer launch, independente do app —
    // checagem própria da function, fora da decisão pura (que só conhece o app).
    if (profile && profile.active === false) {
      await audit("BLOCKED", "USER_INACTIVE", null, companyId);
      return new Response(JSON.stringify({ ok: false, error: "user_inactive" }), { status: 403 });
    }

    // Validação de tenant best-effort: só bloqueia se a empresa vinculada
    // estiver claramente inativa. Ausência/ambiguidade de active_company_id
    // não bloqueia (modelo de tenant do VoxAssist ainda não é consistente
    // o bastante pra isso ser uma exigência dura sem quebrar usuários).
    if (companyId) {
      const { data: company } = await admin.from("companies").select("active").eq("id", companyId).maybeSingle<{ active: boolean | null }>();
      if (company && company.active === false) {
        await audit("BLOCKED", "COMPANY_INACTIVE", null, companyId);
        return new Response(JSON.stringify({ ok: false, error: "company_inactive" }), { status: 403 });
      }
    }

    const { data: app } = await admin
      .from("integrated_apps")
      .select("id, name, launch_url, status, launch_mode, roles_allowed")
      .eq("slug", slug)
      .maybeSingle<IntegratedApp>();

    const decision = decideLaunch({ app: app ?? null, callerRole: profile?.role ?? null });

    if (!decision.ok) {
      await audit("BLOCKED", decision.reason, app?.id ?? null, companyId);
      return new Response(JSON.stringify({ ok: false, error: decision.error }), { status: decision.status });
    }

    await audit("SUCCESS", null, app!.id, companyId);
    return new Response(JSON.stringify({ ok: true, url: decision.url, launch_mode: decision.launchMode, name: decision.name }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    await audit("ERROR", e instanceof Error ? e.message.slice(0, 200) : "unknown_error", null, null);
    return new Response(JSON.stringify({ ok: false, error: "internal_error" }), { status: 500 });
  }
});
