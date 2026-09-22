// Resolve a credencial Electrolux (endereço + usuário + senha) de uma
// empresa específica -- prioriza o que o GESTOR configurou via
// electrolux_save_credentials (Vault, por conexão/empresa, lido só
// dentro do Postgres via electrolux_resolve_credential); cai pros
// secrets globais da Edge Function (ELECTROLUX_API_URL/USER/PASSWORD)
// só quando a empresa ainda não tem credencial própria salva -- garante
// que a conexão Serra já em produção continua funcionando sem
// interrupção até o GESTOR salvar a credencial pela tela nova.
// Chamador precisa passar um client Supabase com service_role --
// electrolux_resolve_credential só concede execute pra service_role.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ElectroluxCredential = { apiUrl: string; username: string; password: string };

const FALLBACK_API_URL = Deno.env.get("ELECTROLUX_API_URL") || "";
const FALLBACK_API_USER = Deno.env.get("ELECTROLUX_API_USER") || "";
const FALLBACK_API_PASSWORD = Deno.env.get("ELECTROLUX_API_PASSWORD") || "";

export async function resolveElectroluxCredential(
  admin: SupabaseClient,
  companyId: string | null | undefined
): Promise<ElectroluxCredential> {
  if (companyId) {
    const { data, error } = await admin
      .rpc("electrolux_resolve_credential", { p_company_id: companyId })
      .maybeSingle();
    if (!error && data?.api_url && data?.username && data?.password) {
      return { apiUrl: data.api_url as string, username: data.username as string, password: data.password as string };
    }
  }

  if (!FALLBACK_API_URL || !FALLBACK_API_USER || !FALLBACK_API_PASSWORD) {
    throw new Error("electrolux_not_configured");
  }
  return { apiUrl: FALLBACK_API_URL, username: FALLBACK_API_USER, password: FALLBACK_API_PASSWORD };
}
