import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideLaunch, type IntegratedApp } from "./appGateway.ts";

const baseApp: IntegratedApp = {
  id: "app-1",
  name: "Pulse IA",
  launch_url: "https://pulse-ia-eight.vercel.app",
  status: "active",
  launch_mode: "external",
  roles_allowed: ["GESTOR", "ATENDENTE"],
};

Deno.test("decideLaunch - app inexistente é bloqueado com app_not_found", () => {
  const r = decideLaunch({ app: null, callerRole: "GESTOR" });
  assertEquals(r, { ok: false, status: 404, error: "app_not_found", reason: "APP_NOT_FOUND" });
});

Deno.test("decideLaunch - app inativo é bloqueado com app_inactive", () => {
  const r = decideLaunch({ app: { ...baseApp, status: "inactive" }, callerRole: "GESTOR" });
  assertEquals(r, { ok: false, status: 403, error: "app_inactive", reason: "APP_INACTIVE" });
});

Deno.test("decideLaunch - roles_allowed vazio bloqueia mesmo com role definido (fail-closed)", () => {
  const r = decideLaunch({ app: { ...baseApp, roles_allowed: [] }, callerRole: "GESTOR" });
  assertEquals(r, { ok: false, status: 403, error: "role_not_allowed", reason: "ROLE_NOT_ALLOWED" });
});

Deno.test("decideLaunch - role fora da lista é bloqueado", () => {
  const r = decideLaunch({ app: baseApp, callerRole: "TECNICO" });
  assertEquals(r, { ok: false, status: 403, error: "role_not_allowed", reason: "ROLE_NOT_ALLOWED" });
});

Deno.test("decideLaunch - callerRole nulo é bloqueado mesmo com roles_allowed preenchido", () => {
  const r = decideLaunch({ app: baseApp, callerRole: null });
  assertEquals(r, { ok: false, status: 403, error: "role_not_allowed", reason: "ROLE_NOT_ALLOWED" });
});

Deno.test("decideLaunch - role permitido retorna url/launch_mode/name repassados", () => {
  const r = decideLaunch({ app: baseApp, callerRole: "ATENDENTE" });
  assertEquals(r, {
    ok: true,
    url: "https://pulse-ia-eight.vercel.app",
    launchMode: "external",
    name: "Pulse IA",
  });
});
