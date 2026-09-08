-- ============================================================
-- Matriz Mestra, Área 06 (Financeiro) -- "Descontos (limite/
-- autorização por perfil)" -- CRIAR confirmado: a forma "DESCONTO"
-- (payment_methods, ver migration 20260908040000) fecha o saldo da
-- OS sem nenhum limite -- qualquer perfil pode lançar qualquer
-- valor. Guardado como 1 linha por (empresa, perfil) -- só os 3
-- perfis fixos do sistema (GESTOR/ATENDENTE/TECNICO), não uma lista
-- livre -- por isso RPC de SET por perfil, não upsert com nome
-- livre como os catálogos simples.
--
-- Escopo desta etapa é só o CADASTRO do limite -- validar o valor
-- de DESCONTO lançado na guia Finalizar OS contra o limite do
-- perfil de quem está logado fica pra uma etapa futura; o
-- lançamento continua livre por ora, sem mudar o comportamento
-- atual (regra da sessão: nunca aplicar correção silenciosa em
-- dado/fluxo existente).
-- ============================================================

create table if not exists public.discount_limits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('GESTOR', 'ATENDENTE', 'TECNICO')),
  max_percent numeric,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create unique index if not exists discount_limits_company_role_uk on public.discount_limits(company_id, role);

alter table public.discount_limits enable row level security;

drop policy if exists "discount_limits_select_company" on public.discount_limits;
create policy "discount_limits_select_company" on public.discount_limits
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "discount_limits_write_gestor" on public.discount_limits;
create policy "discount_limits_write_gestor" on public.discount_limits
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = public.current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_set_discount_limit(
  p_company_id uuid,
  p_role text,
  p_max_percent numeric
) returns public.discount_limits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.discount_limits%rowtype;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar limites de desconto.';
  end if;
  if p_role not in ('GESTOR', 'ATENDENTE', 'TECNICO') then
    raise exception 'Perfil inválido.';
  end if;

  insert into public.discount_limits (company_id, role, max_percent, updated_by)
    values (p_company_id, p_role, p_max_percent, auth.uid())
  on conflict (company_id, role) do update
    set max_percent = excluded.max_percent, updated_at = now(), updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end;
$$;
comment on function public.admin_set_discount_limit is
  'Define o limite percentual de desconto pra um perfil fixo (GESTOR/ATENDENTE/TECNICO) da empresa. GESTOR-only via is_company_gestor. Só cadastro -- não valida nenhum lançamento de DESCONTO existente ainda.';

grant execute on function public.admin_set_discount_limit(uuid, text, numeric) to authenticated;
