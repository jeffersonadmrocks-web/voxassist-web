// Vínculo/criação de técnico a partir de um atendimento externo.
// Ordem de prioridade: id externo já vinculado -> sugestão já confirmada
// manualmente -> nome batendo com exatamente um técnico (nunca funde
// sozinho, só sugere) -> cria técnico provisório.
//
// A Electrolux não manda nome/id de técnico hoje (ver Prisma schema do
// backend deles) — este módulo fica pronto pro dia em que mandar, e é
// testado com fixtures fictícias (ver testes) até lá.
import { normalizeName } from "./electrolux.ts";

type SupabaseLike = {
  from: (table: string) => any;
};

export type TechnicianMatchInput = {
  externalTechnicianId?: string | null;
  candidateName?: string | null;
};

export async function matchOrCreateTechnician(
  supabase: SupabaseLike,
  input: TechnicianMatchInput
): Promise<string | null> {
  const externalTechnicianId = input.externalTechnicianId || null;
  const candidateName = input.candidateName || null;
  if (!externalTechnicianId && !candidateName) return null;

  if (externalTechnicianId) {
    const { data: linked } = await supabase
      .from("profiles")
      .select("id")
      .eq("electrolux_external_id", externalTechnicianId)
      .maybeSingle();
    if (linked?.id) return linked.id;

    const { data: confirmed } = await supabase
      .from("external_technician_link_suggestions")
      .select("suggested_profile_id")
      .eq("origin", "ELECTROLUX")
      .eq("external_technician_id", externalTechnicianId)
      .eq("status", "VINCULADO")
      .maybeSingle();
    if (confirmed?.suggested_profile_id) return confirmed.suggested_profile_id;
  }

  if (candidateName) {
    const normalizedCandidate = normalizeName(candidateName);
    const { data: techs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("active", true)
      .or("role.eq.TECNICO,external_schedule_enabled.eq.true");

    const matches = (techs || []).filter(
      (t: { full_name: string | null }) => normalizeName(t.full_name || "") === normalizedCandidate
    );

    if (matches.length >= 1) {
      // Uma ou mais linhas com o mesmo nome normalizado: nunca funde
      // automaticamente. Se o gestor já decidiu (Vincular/Manter separado)
      // pra este par, respeita a decisão em vez de ficar reabrindo a
      // pendência a cada ciclo de sync.
      let anyStillPending = false;
      for (const match of matches) {
        const { data: existingSuggestion } = await supabase
          .from("external_technician_link_suggestions")
          .select("status")
          .eq("origin", "ELECTROLUX")
          .eq("external_technician_id", externalTechnicianId)
          .eq("suggested_profile_id", match.id)
          .maybeSingle();

        if (existingSuggestion?.status === "VINCULADO") return match.id;
        if (existingSuggestion?.status === "SEPARADO") continue;

        anyStillPending = true;
        await supabase.from("external_technician_link_suggestions").upsert(
          {
            origin: "ELECTROLUX",
            external_technician_id: externalTechnicianId,
            candidate_name: candidateName,
            suggested_profile_id: match.id,
            status: "PENDENTE",
          },
          { onConflict: "origin,external_technician_id,suggested_profile_id" }
        );
      }
      if (anyStillPending) return null;
      // Todos os candidatos já foram explicitamente separados -> segue pra
      // criar um técnico provisório em vez de ficar sem opção.
    }

    return await createProvisionalTechnician(supabase, { externalTechnicianId, candidateName });
  }

  return null;
}

async function createProvisionalTechnician(
  supabase: SupabaseLike,
  input: { externalTechnicianId: string | null; candidateName: string }
): Promise<string | null> {
  const baseRow = {
    full_name: input.candidateName,
    role: "TECNICO",
    external_schedule_enabled: true,
    active: true,
    origin: "ELECTROLUX",
    electrolux_external_id: input.externalTechnicianId,
    registration_status: "PENDENTE_COMPLEMENTACAO",
  };

  // Tenta inserir direto — funciona se profiles.id não tiver FK obrigatória
  // pra auth.users.
  const direct = await supabase.from("profiles").insert(baseRow).select("id").single();
  if (!direct.error) return direct.data.id;

  // Fallback: a FK exige um auth.users real. Cria um usuário dormente —
  // sem senha, sem e-mail confirmado, sem convite enviado — só pra
  // satisfazer a constraint. Por construção, ninguém consegue logar nele.
  if (direct.error.code === "23503" && "auth" in supabase) {
    const authClient = (supabase as unknown as { auth: { admin: { createUser: Function } } }).auth;
    const { data: authUser, error: authError } = await authClient.admin.createUser({
      email: `electrolux.provisorio.${crypto.randomUUID()}@voxassist.invalid`,
      email_confirm: false,
    });
    if (authError || !authUser?.user) return null;

    const withId = await supabase
      .from("profiles")
      .insert({ id: authUser.user.id, ...baseRow })
      .select("id")
      .single();
    if (!withId.error) return withId.data.id;
  }

  return null;
}
