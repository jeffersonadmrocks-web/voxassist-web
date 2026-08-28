// Decisão de autorização do App Gateway — pura, sem tocar rede/DB. A edge
// function busca o profile e o app via service_role e só então chama isto.
// roles_allowed vazio = fail-closed (ninguém abre até ser explicitamente
// configurado), nunca "libera geral" por omissão.
export type IntegratedApp = {
  id: string;
  name: string;
  launch_url: string;
  status: string;
  launch_mode: string;
  roles_allowed: string[];
};

export type LaunchResult =
  | { ok: true; url: string; launchMode: string; name: string }
  | { ok: false; status: number; error: string; reason: string };

export function decideLaunch(input: { app: IntegratedApp | null; callerRole: string | null }): LaunchResult {
  const { app, callerRole } = input;

  if (!app) {
    return { ok: false, status: 404, error: "app_not_found", reason: "APP_NOT_FOUND" };
  }
  if (app.status !== "active") {
    return { ok: false, status: 403, error: "app_inactive", reason: "APP_INACTIVE" };
  }
  if (!app.roles_allowed.length || !callerRole || !app.roles_allowed.includes(callerRole)) {
    return { ok: false, status: 403, error: "role_not_allowed", reason: "ROLE_NOT_ALLOWED" };
  }

  return { ok: true, url: app.launch_url, launchMode: app.launch_mode, name: app.name };
}
