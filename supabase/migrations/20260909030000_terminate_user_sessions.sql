-- ============================================================
-- Matriz Mestra, Área 01 -- "Segurança: encerrar sessão remota".
-- Decisão do usuário (2026-09-09): implementar, "sem criar endpoint
-- genérico excessivamente privilegiado" -- compartilha a mesma
-- superfície de risco (auth) do item de redefinir senha, mas SEM
-- Edge Function/service_role nenhuma: RPC comum, security definer,
-- estritamente escopada (gestor da empresa + usuário vinculado a
-- ela), auditada.
--
-- Confirmado ANTES de escrever (não por suposição): a API pronta do
-- Supabase (auth.admin.signOut) exige o JWT da sessão-alvo como
-- parâmetro (não um user_id) -- inviável pra um gestor que nunca tem
-- o token de outra pessoa. O mecanismo real por trás dessa API (e o
-- único caminho correto pra "encerrar por user_id"): apagar as
-- linhas de `auth.sessions` do usuário -- `auth.refresh_tokens` tem
-- FK `ON DELETE CASCADE` pra `auth.sessions` (confirmado via
-- pg_constraint), então a exclusão já limpa os 2 juntos, sem deixar
-- órfão. O access token corrente de cada sessão continua válido até
-- expirar sozinho (limite conhecido do próprio Supabase, não desta
-- implementação) -- login novo (refresh) fica impossível a partir
-- daí.
-- ============================================================

create or replace function public.admin_terminate_user_sessions(
  p_user_id uuid,
  p_company_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem encerrar sessões de usuário.';
  end if;
  if not exists (select 1 from public.user_companies where user_id = p_user_id and company_id = p_company_id) then
    raise exception 'Usuário não vinculado à empresa.';
  end if;

  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values(auth.uid(), p_company_id, 'CONFIGURACOES', 'ENCERRAR_SESSAO', 'PROFILE', p_user_id, jsonb_build_object('sessions_terminated', v_count));

  return v_count;
end;
$$;
comment on function public.admin_terminate_user_sessions is
  'Encerra todas as sessões ativas de um usuário (delete em auth.sessions, cascade pra auth.refresh_tokens) -- gestor-only, usuário precisa pertencer à empresa do gestor. Access token corrente de cada sessão continua válido até expirar sozinho (limite do próprio Supabase); refresh/login novo fica impossível a partir daqui. Nenhuma Edge Function/service_role -- RPC comum, mesmo padrão de todas as outras desta sessão.';

grant execute on function public.admin_terminate_user_sessions(uuid, uuid) to authenticated;
