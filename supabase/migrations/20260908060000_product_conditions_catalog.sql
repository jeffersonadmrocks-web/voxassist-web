-- VoxAssist -- Configurações > Cadastros & Catálogos > Estado do Produto
-- Matriz Mestra, Área 03 -- CRIAR confirmado: "estado do aparelho" hoje
-- é uma lista fixa (NOVO/USADO/ARRANHADO/AVARIADO) dentro de
-- new-os-v0812.js e os-detail-v0812.js (equipPanel), sem tela de
-- gestão. service_orders.device_condition é texto livre (sem CHECK).
-- Mesmo padrão de order_types/payment_methods: catálogo por empresa,
-- GESTOR-only, semeadura das empresas existentes com os 4 valores já
-- em uso hoje (nada perdido) + trigger pra empresa nova. Gestor pode
-- renomear/adicionar livremente pela tela nova (ex.: "riscado",
-- "amassado", "incompleto", se preferir esse vocabulário).
create table if not exists public.product_conditions (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.product_conditions add constraint product_conditions_pkey primary key (id);
alter table public.product_conditions add constraint product_conditions_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.product_conditions add constraint product_conditions_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.product_conditions add constraint product_conditions_unique_name
  unique (company_id, name);
create index idx_product_conditions_company on public.product_conditions using btree (company_id, active, sort_order);

alter table public.product_conditions enable row level security;
create policy "product_conditions_select_company" on public.product_conditions for select to authenticated
  using (company_id = current_company_id());
create policy "product_conditions_write_gestor" on public.product_conditions for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_upsert_product_condition(
  p_company_id uuid,
  p_name text,
  p_id uuid default null,
  p_active boolean default true,
  p_sort_order integer default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_next_order integer;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Acesso permitido somente ao gestor da empresa';
  end if;
  if coalesce(trim(p_name),'')='' then
    raise exception 'Informe o nome do estado do produto';
  end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next_order from public.product_conditions where company_id=p_company_id;
    insert into public.product_conditions(company_id,name,active,sort_order,created_by)
    values (p_company_id, upper(trim(p_name)), coalesce(p_active,true), coalesce(p_sort_order,v_next_order), auth.uid())
    returning id into v_id;
  else
    update public.product_conditions
      set name=upper(trim(p_name)), active=coalesce(p_active,active), sort_order=coalesce(p_sort_order,sort_order)
      where id=p_id and company_id=p_company_id
      returning id into v_id;
    if v_id is null then raise exception 'Estado do produto não encontrado'; end if;
  end if;
  return v_id;
end;
$$;
comment on function public.admin_upsert_product_condition is
  'Cria/atualiza um estado de produto da empresa (Configurações > Cadastros & Catálogos). Gestor-only.';
grant execute on function public.admin_upsert_product_condition(uuid, text, uuid, boolean, integer) to authenticated;

insert into public.product_conditions (company_id, name, sort_order)
select c.id, m.name, m.sort_order
from public.companies c
cross join (values ('NOVO',1),('USADO',2),('ARRANHADO',3),('AVARIADO',4)) as m(name, sort_order)
on conflict (company_id, name) do nothing;

create or replace function public.seed_default_product_conditions() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.product_conditions (company_id, name, sort_order) values
    (new.id,'NOVO',1),(new.id,'USADO',2),(new.id,'ARRANHADO',3),(new.id,'AVARIADO',4)
  on conflict (company_id, name) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_seed_product_conditions on public.companies;
create trigger trg_seed_product_conditions after insert on public.companies
  for each row execute function public.seed_default_product_conditions();
