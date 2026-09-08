-- VoxAssist -- Configurações > Agenda & Atendimento > Técnicos disponíveis
-- Matriz Mestra, Área 04 -- CONSOLIDAR confirmado: profiles.external_
-- schedule_enabled já existe e já é LIDO em vários lugares
-- (field-agenda-complete-v0813.js, dashboard-canonical-v1.js,
-- electrolux-agenda-bridge-v0825.js) pra decidir quem aparece na
-- agenda externa -- mas nunca teve nenhum jeito de ESCREVER esse
-- campo pelo app (grep confirmado: zero writers). Só dava pra ligar
-- direto no banco. profiles só tem RLS de update pra si mesmo
-- (profiles_update_self) -- gestor precisa de RPC, mesmo padrão de
-- admin_update_user_access.
create or replace function public.admin_set_technician_external_schedule(
  p_user_id uuid,
  p_company_id uuid,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Acesso permitido somente ao gestor da empresa';
  end if;
  if not exists(select 1 from public.user_companies where user_id=p_user_id and company_id=p_company_id and active) then
    raise exception 'Usuário não vinculado à empresa';
  end if;
  update public.profiles set external_schedule_enabled=coalesce(p_enabled,false), updated_at=now() where id=p_user_id;
end;
$$;
comment on function public.admin_set_technician_external_schedule is
  'Liga/desliga a participação de um usuário na agenda externa (profiles.external_schedule_enabled). Gestor-only.';
grant execute on function public.admin_set_technician_external_schedule(uuid, uuid, boolean) to authenticated;
