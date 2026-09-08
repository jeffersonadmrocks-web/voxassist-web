-- VoxAssist -- Configurações > Cadastros & Catálogos > Defeitos / Acessórios / Serviços
-- Matriz Mestra, Área 03. Os três CRIAR confirmados: hoje são campos
-- livres (reported_defect/diagnosed_defect texto, equipments.accessories
-- texto único, os_financial.labor_value número sem catálogo por trás)
-- -- nenhum catálogo estruturado existe, nada a perder/preservar (ao
-- contrário de Tipos de OS/Estado do Produto, que substituíam lista
-- hardcoded -- aqui não há semeadura porque não havia nada fixo antes).
-- Mesmo padrão por empresa, GESTOR-only, já validado 3x nesta sessão
-- (order_types/payment_methods/product_conditions).
-- Esta etapa cria só o CATÁLOGO (cadastro/ativo-inativo) -- ligar nos
-- campos de texto livre da OS (autocomplete/multi-seleção) fica pra
-- uma etapa separada, sem mudar o comportamento atual desses campos.

create table if not exists public.product_defects (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.product_defects add constraint product_defects_pkey primary key (id);
alter table public.product_defects add constraint product_defects_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.product_defects add constraint product_defects_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.product_defects add constraint product_defects_unique_name unique (company_id, name);
create index idx_product_defects_company on public.product_defects using btree (company_id, active, sort_order);
alter table public.product_defects enable row level security;
create policy "product_defects_select_company" on public.product_defects for select to authenticated
  using (company_id = current_company_id());
create policy "product_defects_write_gestor" on public.product_defects for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

create table if not exists public.product_accessories (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.product_accessories add constraint product_accessories_pkey primary key (id);
alter table public.product_accessories add constraint product_accessories_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.product_accessories add constraint product_accessories_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.product_accessories add constraint product_accessories_unique_name unique (company_id, name);
create index idx_product_accessories_company on public.product_accessories using btree (company_id, active, sort_order);
alter table public.product_accessories enable row level security;
create policy "product_accessories_select_company" on public.product_accessories for select to authenticated
  using (company_id = current_company_id());
create policy "product_accessories_write_gestor" on public.product_accessories for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

create table if not exists public.services_catalog (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  default_value numeric not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.services_catalog add constraint services_catalog_pkey primary key (id);
alter table public.services_catalog add constraint services_catalog_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.services_catalog add constraint services_catalog_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.services_catalog add constraint services_catalog_unique_name unique (company_id, name);
create index idx_services_catalog_company on public.services_catalog using btree (company_id, active, sort_order);
alter table public.services_catalog enable row level security;
create policy "services_catalog_select_company" on public.services_catalog for select to authenticated
  using (company_id = current_company_id());
create policy "services_catalog_write_gestor" on public.services_catalog for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_upsert_product_defect(
  p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_sort_order integer default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next_order integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome do defeito'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next_order from public.product_defects where company_id=p_company_id;
    insert into public.product_defects(company_id,name,active,sort_order,created_by)
    values (p_company_id, upper(trim(p_name)), coalesce(p_active,true), coalesce(p_sort_order,v_next_order), auth.uid())
    returning id into v_id;
  else
    update public.product_defects set name=upper(trim(p_name)), active=coalesce(p_active,active), sort_order=coalesce(p_sort_order,sort_order)
      where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Defeito não encontrado'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_product_defect(uuid, text, uuid, boolean, integer) to authenticated;

create or replace function public.admin_upsert_product_accessory(
  p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_sort_order integer default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next_order integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome do acessório'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next_order from public.product_accessories where company_id=p_company_id;
    insert into public.product_accessories(company_id,name,active,sort_order,created_by)
    values (p_company_id, upper(trim(p_name)), coalesce(p_active,true), coalesce(p_sort_order,v_next_order), auth.uid())
    returning id into v_id;
  else
    update public.product_accessories set name=upper(trim(p_name)), active=coalesce(p_active,active), sort_order=coalesce(p_sort_order,sort_order)
      where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Acessório não encontrado'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_product_accessory(uuid, text, uuid, boolean, integer) to authenticated;

create or replace function public.admin_upsert_service_catalog_item(
  p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_default_value numeric default 0, p_sort_order integer default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next_order integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome do serviço'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next_order from public.services_catalog where company_id=p_company_id;
    insert into public.services_catalog(company_id,name,default_value,active,sort_order,created_by)
    values (p_company_id, upper(trim(p_name)), coalesce(p_default_value,0), coalesce(p_active,true), coalesce(p_sort_order,v_next_order), auth.uid())
    returning id into v_id;
  else
    update public.services_catalog set name=upper(trim(p_name)), default_value=coalesce(p_default_value,default_value), active=coalesce(p_active,active), sort_order=coalesce(p_sort_order,sort_order)
      where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Serviço não encontrado'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_service_catalog_item(uuid, text, uuid, boolean, numeric, integer) to authenticated;
