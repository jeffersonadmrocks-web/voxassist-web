import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchOrCreateTechnician } from "./technicianMatch.ts";
import { createMockSupabase } from "./mockSupabase.test-util.ts";

Deno.test("id externo já vinculado -> usa o técnico existente, não cria nada", async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: "tech-1", full_name: "João Pereira", active: true, electrolux_external_id: "ELX-T1" }],
  });
  const id = await matchOrCreateTechnician(supabase, { externalTechnicianId: "ELX-T1", candidateName: "João Pereira" });
  assertEquals(id, "tech-1");
  assertEquals((supabase.tables.get("profiles") || []).length, 1); // não criou provisório extra
});

Deno.test("sugestão já VINCULADA -> usa o perfil sugerido direto", async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: "tech-2", full_name: "Ana Costa", active: true }],
    external_technician_link_suggestions: [
      {
        origin: "ELECTROLUX",
        external_technician_id: "ELX-T2",
        suggested_profile_id: "tech-2",
        status: "VINCULADO",
      },
    ],
  });
  const id = await matchOrCreateTechnician(supabase, { externalTechnicianId: "ELX-T2", candidateName: "Ana Costa" });
  assertEquals(id, "tech-2");
});

Deno.test("nome bate exato com um técnico -> NÃO funde automaticamente, cria pendência e volta null", async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: "tech-3", full_name: "Carlos Silva", active: true, role: "TECNICO" }],
  });
  const id = await matchOrCreateTechnician(supabase, { externalTechnicianId: "ELX-T3", candidateName: "Carlos Silva" });
  assertEquals(id, null);
  const suggestions = supabase.tables.get("external_technician_link_suggestions") || [];
  assertEquals(suggestions.length, 1);
  assertEquals(suggestions[0].status, "PENDENTE");
  assertEquals(suggestions[0].suggested_profile_id, "tech-3");
});

Deno.test("nome parecido mas diferente (Carlos Silva vs Carlos da Silva) NÃO gera pendência nem funde — são tratados como pessoas distintas", async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: "tech-4", full_name: "Carlos da Silva", active: true, role: "TECNICO" }],
  });
  const id = await matchOrCreateTechnician(supabase, { externalTechnicianId: "ELX-T4", candidateName: "Carlos Silva" });
  // Não bateu exato -> nenhum candidato -> cria técnico provisório distinto.
  assertNotEquals(id, "tech-4");
  assertNotEquals(id, null);
  const suggestions = supabase.tables.get("external_technician_link_suggestions") || [];
  assertEquals(suggestions.length, 0);
});

Deno.test("nenhum candidato -> cria técnico provisório com registration_status PENDENTE_COMPLEMENTACAO e sem login", async () => {
  const supabase = createMockSupabase({ profiles: [] });
  const id = await matchOrCreateTechnician(supabase, {
    externalTechnicianId: "ELX-T5",
    candidateName: "Pedro Novo",
  });
  assertNotEquals(id, null);
  const profiles = supabase.tables.get("profiles") || [];
  const created = profiles.find((p) => p.id === id)!;
  assertEquals(created.full_name, "Pedro Novo");
  assertEquals(created.role, "TECNICO");
  assertEquals(created.origin, "ELECTROLUX");
  assertEquals(created.registration_status, "PENDENTE_COMPLEMENTACAO");
  assertEquals(created.electrolux_external_id, "ELX-T5");
  // Não existe nenhum campo de senha/convite/login no registro criado.
  assertEquals("password" in created, false);
  assertEquals("invited_at" in created, false);
});

Deno.test("fallback: profiles.id exige auth.users (FK) -> cria usuário dormente sem senha antes do provisório", async () => {
  const supabase = createMockSupabase({ profiles: [], forceProfilesInsertFkViolationOnce: true });
  const id = await matchOrCreateTechnician(supabase, {
    externalTechnicianId: "ELX-T6",
    candidateName: "Rita Fallback",
  });
  assertEquals(id, "dormant-auth-user-1");
  const profiles = supabase.tables.get("profiles") || [];
  assertEquals(profiles.length, 1);
  assertEquals(profiles[0].id, "dormant-auth-user-1");
  assertEquals(profiles[0].registration_status, "PENDENTE_COMPLEMENTACAO");
});

Deno.test("sugestão já SEPARADA -> não fica reabrindo pendência, resolve criando provisório", async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: "tech-7", full_name: "Bruno Alves", active: true, role: "TECNICO" }],
    external_technician_link_suggestions: [
      {
        origin: "ELECTROLUX",
        external_technician_id: "ELX-T7",
        suggested_profile_id: "tech-7",
        status: "SEPARADO",
      },
    ],
  });
  const id = await matchOrCreateTechnician(supabase, { externalTechnicianId: "ELX-T7", candidateName: "Bruno Alves" });
  assertNotEquals(id, "tech-7");
  assertNotEquals(id, null);
  const suggestions = supabase.tables.get("external_technician_link_suggestions") || [];
  // continua só a original SEPARADO, não recriou PENDENTE
  assertEquals(suggestions.length, 1);
  assertEquals(suggestions[0].status, "SEPARADO");
});

Deno.test("sem id externo e sem nome -> não faz nada, volta null", async () => {
  const supabase = createMockSupabase({ profiles: [] });
  const id = await matchOrCreateTechnician(supabase, {});
  assertEquals(id, null);
  assertEquals((supabase.tables.get("profiles") || []).length, 0);
});
