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
  // profiles é escopado por RLS via user_companies — sem vincular o
  // técnico provisório a uma empresa, ele existe no banco mas fica
  // invisível em qualquer tela que a sessão do usuário logado carregue
  // (só a service_role, que ignora RLS, o enxerga). Passado pelo chamador
  // (variável de ambiente ELECTROLUX_DEFAULT_COMPANY_ID) porque este
  // módulo não lê env var diretamente.
  defaultCompanyId?: string | null;
};

export async function matchOrCreateTechnician(
  supabase: SupabaseLike,
  input: TechnicianMatchInput
): Promise<string | null> {
  const externalTechnicianId = input.externalTechnicianId || null;
  const candidateName = input.candidateName || null;
  const defaultCompanyId = input.defaultCompanyId || null;
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
      .select("id, full_name, origin")
      .eq("active", true)
      .or("role.eq.TECNICO,external_schedule_enabled.eq.true");

    const allMatches = (techs || []).filter(
      (t: { full_name: string | null }) => normalizeName(t.full_name || "") === normalizedCandidate
    );

    // Um perfil com origin='ELECTROLUX' e o mesmo nome exato só pode ter
    // sido criado por este próprio módulo (createProvisionalTechnician) —
    // sem isso, toda segunda ocorrência do mesmo técnico (mesmo dentro do
    // mesmo ciclo de sync) reabriria uma "pendência" contra o registro que
    // acabamos de criar, em vez de reaproveitá-lo. Reaproveita direto,
    // sem passar pela dança de confirmação manual.
    const selfCreatedMatch = allMatches.find((t: { origin?: string }) => t.origin === "ELECTROLUX");
    if (selfCreatedMatch) return selfCreatedMatch.id;

    // Candidatos que não fomos nós que criamos (perfil VoxAssist real, ou
    // sem origin) continuam exigindo confirmação manual — nome parecido
    // não é garantia de ser a mesma pessoa.
    const matches = allMatches;

    if (matches.length >= 1) {
      // Uma ou mais linhas com o mesmo nome normalizado: nunca funde
      // automaticamente. Se o gestor já decidiu (Vincular/Manter separado)
      // pra este par, respeita a decisão em vez de ficar reabrindo a
      // pendência a cada ciclo de sync.
      let anyStillPending = false;
      for (const match of matches) {
        // externalTechnicianId é sempre null na prática (a Electrolux não
        // manda esse campo hoje) — .eq(col, null) no PostgREST NÃO
        // equivale a "IS NULL" (compara literalmente, nunca bate), então
        // usa .is() nesse caso. Sem isso, uma confirmação VINCULADO nunca
        // seria encontrada de novo no próximo ciclo de sync.
        let suggestionQuery = supabase
          .from("external_technician_link_suggestions")
          .select("status")
          .eq("origin", "ELECTROLUX")
          .eq("suggested_profile_id", match.id);
        suggestionQuery = externalTechnicianId
          ? suggestionQuery.eq("external_technician_id", externalTechnicianId)
          : suggestionQuery.is("external_technician_id", null);
        const { data: existingSuggestion } = await suggestionQuery.maybeSingle();

        if (existingSuggestion?.status === "VINCULADO") return match.id;
        if (existingSuggestion?.status === "SEPARADO") continue;

        anyStillPending = true;
        if (!existingSuggestion) {
          // Mesma razão pra não usar upsert(onConflict) aqui: com
          // external_technician_id null, o Postgres nunca considera duas
          // linhas em conflito (NULL <> NULL pra fins de unicidade) — toda
          // chamada criaria uma pendência duplicada nova em vez de
          // atualizar a existente. Já verificamos acima que não existe
          // (existingSuggestion é null), então um insert simples basta.
          await supabase.from("external_technician_link_suggestions").insert({
            origin: "ELECTROLUX",
            external_technician_id: externalTechnicianId,
            candidate_name: candidateName,
            suggested_profile_id: match.id,
            status: "PENDENTE",
          });
        }
      }
      if (anyStillPending) return null;
      // Todos os candidatos já foram explicitamente separados -> segue pra
      // criar um técnico provisório em vez de ficar sem opção.
    }

    return await createProvisionalTechnician(supabase, { externalTechnicianId, candidateName, defaultCompanyId });
  }

  return null;
}

async function createProvisionalTechnician(
  supabase: SupabaseLike,
  input: { externalTechnicianId: string | null; candidateName: string; defaultCompanyId: string | null }
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

  // profiles.id não tem default (confirmado no schema real: sem
  // gen_random_uuid()) e tem FK obrigatória pra auth.users — sempre cria
  // um usuário dormente primeiro (sem senha, sem e-mail confirmado, sem
  // convite enviado — por construção ninguém consegue logar nele) só pra
  // satisfazer a constraint.
  //
  // O projeto tem uma trigger em auth.users (on_auth_user_created_voxassist
  // -> handle_new_auth_user(), não versionada neste repo) que já cria a
  // linha em profiles sozinha assim que o usuário é criado — com
  // role='ATENDENTE', origin='VOXASSIST' e full_name a partir do e-mail,
  // nada disso serve pro técnico provisório. Por isso aqui é sempre
  // UPDATE, nunca INSERT (INSERT bate na PK que a trigger já ocupou).
  if (!("auth" in supabase)) return null;
  const authClient = (supabase as unknown as { auth: { admin: { createUser: Function } } }).auth;
  const { data: authUser, error: authError } = await authClient.admin.createUser({
    email: `electrolux.provisorio.${crypto.randomUUID()}@voxassist.invalid`,
    email_confirm: false,
  });
  if (authError || !authUser?.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .update(baseRow)
    .eq("id", authUser.user.id)
    .select("id")
    .single();
  if (error || !data) return null;

  // Best-effort: sem isso o técnico existe mas fica invisível pra
  // qualquer sessão de usuário normal (ver comentário em
  // TechnicianMatchInput.defaultCompanyId). Não falha a criação do
  // técnico se o vínculo em si não puder ser gravado.
  if (input.defaultCompanyId) {
    try {
      await supabase
        .from("user_companies")
        .insert({ user_id: data.id, company_id: input.defaultCompanyId, role: "TECNICO", active: true, is_default: true });
    } catch {
      // best-effort — não bloqueia a criação do técnico se o vínculo falhar.
    }
  }

  return data.id;
}
