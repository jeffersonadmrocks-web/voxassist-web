-- ============================================================
-- Matriz Mestra, Área 01 -- "Técnicos: região, especialidade,
-- disponibilidade". Decisão do usuário (2026-09-09):
--
-- REGIÃO: técnico pode estar associado a 1+ `service_regions`
-- (catálogo já existente, migration 20260908090000) -- junction
-- simples, sem inventar tabela de região nova.
--
-- ESPECIALIDADE: não texto livre, catálogo administrável,
-- múltiplas por técnico, "por tipo/grupo de produto, aproveitando
-- catálogos reais existentes, evitando criar outro dicionário
-- concorrente" -- reaproveita `product_types` (catálogo mestre
-- GLOBAL já existente, nunca duplicado por empresa, decisão da
-- Área 03) como o próprio dicionário de especialidade. Nenhuma
-- tabela de "especialidade" nova -- só a associação técnico×tipo.
--
-- DISPONIBILIDADE: por técnico, dias da semana/períodos/
-- indisponibilidade. Mesmo formato de dia usado em
-- `companies.business_hours` (chaves seg/ter/qua/qui/sex/sab/dom)
-- pra manter consistência visual/estrutural com o horário da
-- empresa -- só que 1 linha por dia por técnico (mais fácil de
-- consultar/filtrar na agenda do que jsonb aninhado).
--
-- Escopo desta etapa: CADASTRAR e ligar na Agenda (ver Área 04) as
-- 3 informações. Roteamento automático inteligente por
-- região/especialidade/disponibilidade fica pra evolução futura --
-- esta migration não altera nenhuma regra de atribuição de OS
-- existente.
-- ============================================================

create table if not exists public.technician_regions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  technician_id uuid not null references auth.users(id) on delete cascade,
  region_id uuid not null references public.service_regions(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists technician_regions_uk on public.technician_regions(company_id, technician_id, region_id);
create index if not exists technician_regions_tech_idx on public.technician_regions(company_id, technician_id);

create table if not exists public.technician_specialties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  technician_id uuid not null references auth.users(id) on delete cascade,
  product_type_id uuid not null references public.product_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists technician_specialties_uk on public.technician_specialties(company_id, technician_id, product_type_id);
create index if not exists technician_specialties_tech_idx on public.technician_specialties(company_id, technician_id);

create table if not exists public.technician_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  technician_id uuid not null references auth.users(id) on delete cascade,
  weekday text not null check (weekday in ('seg','ter','qua','qui','sex','sab','dom')),
  available boolean not null default true,
  start_time time,
  end_time time,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create unique index if not exists technician_availability_uk on public.technician_availability(company_id, technician_id, weekday);

alter table public.technician_regions enable row level security;
alter table public.technician_specialties enable row level security;
alter table public.technician_availability enable row level security;

drop policy if exists "technician_regions_select_company" on public.technician_regions;
create policy "technician_regions_select_company" on public.technician_regions
  for select to authenticated using (company_id = public.current_company_id());
drop policy if exists "technician_regions_write_gestor" on public.technician_regions;
create policy "technician_regions_write_gestor" on public.technician_regions
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = public.current_company_id() and public.is_company_gestor(company_id));

drop policy if exists "technician_specialties_select_company" on public.technician_specialties;
create policy "technician_specialties_select_company" on public.technician_specialties
  for select to authenticated using (company_id = public.current_company_id());
drop policy if exists "technician_specialties_write_gestor" on public.technician_specialties;
create policy "technician_specialties_write_gestor" on public.technician_specialties
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = public.current_company_id() and public.is_company_gestor(company_id));

drop policy if exists "technician_availability_select_company" on public.technician_availability;
create policy "technician_availability_select_company" on public.technician_availability
  for select to authenticated using (company_id = public.current_company_id());
drop policy if exists "technician_availability_write_gestor" on public.technician_availability;
create policy "technician_availability_write_gestor" on public.technician_availability
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = public.current_company_id() and public.is_company_gestor(company_id));

-- Substitui a lista inteira de regiões do técnico (replace-all, mais
-- simples que diff pra um multi-select de checkboxes).
create or replace function public.admin_set_technician_regions(
  p_company_id uuid,
  p_technician_id uuid,
  p_region_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar regiões de técnico.';
  end if;
  if not exists (select 1 from public.user_companies where user_id = p_technician_id and company_id = p_company_id) then
    raise exception 'Usuário não vinculado à empresa.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_region_ids, array[]::uuid[])) x
    where not exists (select 1 from public.service_regions r where r.id = x and r.company_id = p_company_id)
  ) then
    raise exception 'Uma ou mais regiões não pertencem à empresa.';
  end if;

  delete from public.technician_regions where company_id = p_company_id and technician_id = p_technician_id;
  insert into public.technician_regions (company_id, technician_id, region_id, created_by)
    select p_company_id, p_technician_id, x, auth.uid() from unnest(coalesce(p_region_ids, array[]::uuid[])) x;
end;
$$;
grant execute on function public.admin_set_technician_regions(uuid, uuid, uuid[]) to authenticated;

create or replace function public.admin_set_technician_specialties(
  p_company_id uuid,
  p_technician_id uuid,
  p_product_type_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar especialidades de técnico.';
  end if;
  if not exists (select 1 from public.user_companies where user_id = p_technician_id and company_id = p_company_id) then
    raise exception 'Usuário não vinculado à empresa.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_product_type_ids, array[]::uuid[])) x
    where not exists (select 1 from public.product_types t where t.id = x)
  ) then
    raise exception 'Um ou mais tipos de produto não existem no catálogo.';
  end if;

  delete from public.technician_specialties where company_id = p_company_id and technician_id = p_technician_id;
  insert into public.technician_specialties (company_id, technician_id, product_type_id, created_by)
    select p_company_id, p_technician_id, x, auth.uid() from unnest(coalesce(p_product_type_ids, array[]::uuid[])) x;
end;
$$;
grant execute on function public.admin_set_technician_specialties(uuid, uuid, uuid[]) to authenticated;

create or replace function public.admin_set_technician_availability(
  p_company_id uuid,
  p_technician_id uuid,
  p_weekday text,
  p_available boolean,
  p_start_time time,
  p_end_time time
) returns public.technician_availability
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.technician_availability%rowtype;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar disponibilidade de técnico.';
  end if;
  if not exists (select 1 from public.user_companies where user_id = p_technician_id and company_id = p_company_id) then
    raise exception 'Usuário não vinculado à empresa.';
  end if;
  if p_weekday not in ('seg','ter','qua','qui','sex','sab','dom') then
    raise exception 'Dia da semana inválido.';
  end if;

  insert into public.technician_availability (company_id, technician_id, weekday, available, start_time, end_time, updated_by)
    values (p_company_id, p_technician_id, p_weekday, coalesce(p_available, true), p_start_time, p_end_time, auth.uid())
  on conflict (company_id, technician_id, weekday) do update
    set available = excluded.available, start_time = excluded.start_time, end_time = excluded.end_time,
        updated_at = now(), updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.admin_set_technician_availability(uuid, uuid, text, boolean, time, time) to authenticated;
