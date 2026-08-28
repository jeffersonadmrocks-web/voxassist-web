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

Deno.test("técnico provisório criado com defaultCompanyId ganha vínculo em user_companies (senão fica invisível por RLS)", async () => {
  const supabase = createMockSupabase({ profiles: [] });
  const id = await matchOrCreateTechnician(supabase, {
    candidateName: "Nova Tecnica",
    defaultCompanyId: "company-1",
  });
  assertNotEquals(id, null);
  const links = supabase.tables.get("user_companies") || [];
  assertEquals(links.length, 1);
  assertEquals(links[0].user_id, id);
  assertEquals(links[0].company_id, "company-1");
  assertEquals(links[0].role, "TECNICO");
});

Deno.test("sem defaultCompanyId (não informado) -> cria o técnico normalmente, sem tentar vincular empresa nenhuma", async () => {
  const supabase = createMockSupabase({ profiles: [] });
  const id = await matchOrCreateTechnician(supabase, { candidateName: "Sem Empresa" });
  assertNotEquals(id, null);
  const links = supabase.tables.get("user_companies") || [];
  assertEquals(links.length, 0);
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

Deno.test("todo técnico provisório passa por um usuário auth dormente (profiles.id não tem default e exige FK real)", async () => {
  const supabase = createMockSupabase({ profiles: [] });
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

Deno.test("candidateName sem externalTechnicianId (caso real da Electrolux hoje) também cria técnico provisório", async () => {
  // A Electrolux manda technicianName mas nunca um id externo — este é o
  // caso que estava quebrado em produção: nenhum candidato correspondia
  // (perfis novos) e a criação do provisório falhava calada.
  const supabase = createMockSupabase({ profiles: [] });
  const id = await matchOrCreateTechnician(supabase, { candidateName: "Farley Gaigher Rabelo" });
  assertNotEquals(id, null);
  const profiles = supabase.tables.get("profiles") || [];
  const created = profiles.find((p) => p.id === id)!;
  assertEquals(created.full_name, "Farley Gaigher Rabelo");
  assertEquals(created.electrolux_external_id, null);
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

Deno.test("sugestão já VINCULADA sem id externo (caso real: Electrolux nunca manda id) -> usa o perfil direto, não reabre pendência", async () => {
  // Cenário real de uma reconciliação manual (ex.: um GESTOR confirmando
  // que "Andre Rodrigues Muniz" da Electrolux é o mesmo "ANDRE MUNIZ" já
  // cadastrado): a sugestão fica com external_technician_id null, porque
  // é isso que a Electrolux sempre manda. Sem o .is() correto (em vez de
  // .eq() com null), essa confirmação nunca seria reencontrada.
  const supabase = createMockSupabase({
    profiles: [{ id: "tech-9", full_name: "Andre Rodrigues Muniz", active: true, role: "TECNICO" }],
    external_technician_link_suggestions: [
      {
        origin: "ELECTROLUX",
        external_technician_id: null,
        suggested_profile_id: "tech-9",
        status: "VINCULADO",
      },
    ],
  });
  const id = await matchOrCreateTechnician(supabase, { candidateName: "Andre Rodrigues Muniz" });
  assertEquals(id, "tech-9");
  const suggestions = supabase.tables.get("external_technician_link_suggestions") || [];
  assertEquals(suggestions.length, 1); // não criou pendência nova por cima
});

Deno.test("nome bate com um perfil que o próprio sync já criou (origin=ELECTROLUX) -> reaproveita direto, sem pendência", async () => {
  const supabase = createMockSupabase({
    profiles: [{ id: "tech-8", full_name: "Farley Gaigher Rabelo", active: true, role: "TECNICO", origin: "ELECTROLUX" }],
  });
  const id = await matchOrCreateTechnician(supabase, { candidateName: "Farley Gaigher Rabelo" });
  assertEquals(id, "tech-8");
  const suggestions = supabase.tables.get("external_technician_link_suggestions") || [];
  assertEquals(suggestions.length, 0); // não cria pendência pro próprio registro que já criamos
});

Deno.test("sem id externo e sem nome -> não faz nada, volta null", async () => {
  const supabase = createMockSupabase({ profiles: [] });
  const id = await matchOrCreateTechnician(supabase, {});
  assertEquals(id, null);
  assertEquals((supabase.tables.get("profiles") || []).length, 0);
});
