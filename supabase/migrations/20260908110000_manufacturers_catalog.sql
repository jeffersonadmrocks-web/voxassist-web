-- ============================================================
-- Matriz Mestra, Área 05 (Estoque & Peças) -- "Fabricantes
-- (garantia/reembolso)" -- CRIAR confirmado: `equipments.brand` é
-- texto livre, sem nenhum catálogo nem prazo de garantia padrão
-- associado. Mesmo padrão de catálogo simples, com 2 campos a mais
-- (prazo de garantia padrão em dias + observação de reembolso).
--
-- Escopo desta etapa é só o CADASTRO -- ligar isso ao campo MARCA
-- da Nova OS (autocomplete/sugestão) ou ao cálculo automático de
-- prazo de garantia da OS (já existe pra GARANTIA como tipo de OS,
-- migration 20260907030000, mas por equipamento/OS, não por
-- fabricante) fica pra uma etapa futura.
-- ============================================================

create table if not exists public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  warranty_days int,
  refund_notes text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists manufacturers_company_name_uk on public.manufacturers(company_id, upper(name));
create index if not exists manufacturers_company_idx on public.manufacturers(company_id, sort_order);

alter table public.manufacturers enable row level security;

drop policy if exists "manufacturers_select_company" on public.manufacturers;
create policy "manufacturers_select_company" on public.manufacturers
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "manufacturers_write_gestor" on public.manufacturers;
create policy "manufacturers_write_gestor" on public.manufacturers
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = public.current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_upsert_manufacturer(
  p_company_id uuid,
  p_id uuid,
  p_name text,
  p_warranty_days int,
  p_refund_notes text,
  p_active boolean
) returns public.manufacturers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.manufacturers%rowtype;
  v_next_sort int;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar fabricantes.';
  end if;

  if p_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_next_sort from public.manufacturers where company_id = p_company_id;
    insert into public.manufacturers (company_id, name, warranty_days, refund_notes, active, sort_order, created_by)
      values (p_company_id, trim(p_name), p_warranty_days, p_refund_notes, coalesce(p_active, true), v_next_sort, auth.uid())
      returning * into v_row;
  else
    update public.manufacturers
      set name = trim(p_name), warranty_days = p_warranty_days, refund_notes = p_refund_notes, active = coalesce(p_active, true)
      where id = p_id and company_id = p_company_id
      returning * into v_row;
  end if;

  return v_row;
end;
$$;
comment on function public.admin_upsert_manufacturer is
  'Cria ou atualiza um fabricante (nome + prazo de garantia padrão em dias + observação de reembolso) da empresa. GESTOR-only via is_company_gestor. Só cadastro -- não altera cálculo de garantia de nenhuma OS existente.';

grant execute on function public.admin_upsert_manufacturer(uuid, uuid, text, int, text, boolean) to authenticated;
