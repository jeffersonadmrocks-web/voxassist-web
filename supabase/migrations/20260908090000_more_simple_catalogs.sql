-- VoxAssist -- Configurações: mais 6 catálogos simples (nome+ativo),
-- mesmo padrão validado 6x nesta sessão (order_types/payment_methods/
-- product_conditions/product_defects/product_accessories). Todos
-- CRIAR confirmados no levantamento -- nenhum tinha tabela nem tela
-- antes, nenhuma semeadura necessária.
--   Área 06 Financeiro: cash_accounts (contas/caixas), financial_categories
--   Área 04 Agenda: service_regions (regiões de atendimento)
--   Área 05 Estoque: stock_locations, part_categories, stock_units
-- Escopo desta etapa é só o CADASTRO -- ligar em fluxos operacionais
-- (pagamento vinculado a uma conta, região do técnico, local na
-- movimentação de peça) fica pra depois, sem mudar nenhum
-- comportamento atual.

do $$
declare t text;
begin
  foreach t in array array['cash_accounts','financial_categories','service_regions','stock_locations','part_categories','stock_units']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id uuid not null default gen_random_uuid(),
        company_id uuid not null,
        name text not null,
        active boolean not null default true,
        sort_order integer not null default 0,
        created_at timestamptz not null default now(),
        created_by uuid
      );
      alter table public.%1$I add constraint %1$I_pkey primary key (id);
      alter table public.%1$I add constraint %1$I_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
      alter table public.%1$I add constraint %1$I_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
      alter table public.%1$I add constraint %1$I_unique_name unique (company_id, name);
      create index idx_%1$I_company on public.%1$I using btree (company_id, active, sort_order);
      alter table public.%1$I enable row level security;
      create policy "%1$I_select_company" on public.%1$I for select to authenticated
        using (company_id = current_company_id());
      create policy "%1$I_write_gestor" on public.%1$I for all to authenticated
        using (company_id = current_company_id() and public.is_company_gestor(company_id))
        with check (company_id = current_company_id() and public.is_company_gestor(company_id));
    $f$, t);
  end loop;
end $$;

create or replace function public.admin_upsert_cash_account(p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_sort_order integer default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da conta/caixa'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next from public.cash_accounts where company_id=p_company_id;
    insert into public.cash_accounts(company_id,name,active,sort_order,created_by) values (p_company_id,upper(trim(p_name)),coalesce(p_active,true),coalesce(p_sort_order,v_next),auth.uid()) returning id into v_id;
  else
    update public.cash_accounts set name=upper(trim(p_name)),active=coalesce(p_active,active),sort_order=coalesce(p_sort_order,sort_order) where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Conta/caixa não encontrada'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_cash_account(uuid, text, uuid, boolean, integer) to authenticated;

create or replace function public.admin_upsert_financial_category(p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_sort_order integer default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da categoria financeira'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next from public.financial_categories where company_id=p_company_id;
    insert into public.financial_categories(company_id,name,active,sort_order,created_by) values (p_company_id,upper(trim(p_name)),coalesce(p_active,true),coalesce(p_sort_order,v_next),auth.uid()) returning id into v_id;
  else
    update public.financial_categories set name=upper(trim(p_name)),active=coalesce(p_active,active),sort_order=coalesce(p_sort_order,sort_order) where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Categoria financeira não encontrada'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_financial_category(uuid, text, uuid, boolean, integer) to authenticated;

create or replace function public.admin_upsert_service_region(p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_sort_order integer default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da região'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next from public.service_regions where company_id=p_company_id;
    insert into public.service_regions(company_id,name,active,sort_order,created_by) values (p_company_id,upper(trim(p_name)),coalesce(p_active,true),coalesce(p_sort_order,v_next),auth.uid()) returning id into v_id;
  else
    update public.service_regions set name=upper(trim(p_name)),active=coalesce(p_active,active),sort_order=coalesce(p_sort_order,sort_order) where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Região não encontrada'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_service_region(uuid, text, uuid, boolean, integer) to authenticated;

create or replace function public.admin_upsert_stock_location(p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_sort_order integer default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome do local de estoque'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next from public.stock_locations where company_id=p_company_id;
    insert into public.stock_locations(company_id,name,active,sort_order,created_by) values (p_company_id,upper(trim(p_name)),coalesce(p_active,true),coalesce(p_sort_order,v_next),auth.uid()) returning id into v_id;
  else
    update public.stock_locations set name=upper(trim(p_name)),active=coalesce(p_active,active),sort_order=coalesce(p_sort_order,sort_order) where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Local de estoque não encontrado'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_stock_location(uuid, text, uuid, boolean, integer) to authenticated;

create or replace function public.admin_upsert_part_category(p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_sort_order integer default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da categoria de peça'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next from public.part_categories where company_id=p_company_id;
    insert into public.part_categories(company_id,name,active,sort_order,created_by) values (p_company_id,upper(trim(p_name)),coalesce(p_active,true),coalesce(p_sort_order,v_next),auth.uid()) returning id into v_id;
  else
    update public.part_categories set name=upper(trim(p_name)),active=coalesce(p_active,active),sort_order=coalesce(p_sort_order,sort_order) where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Categoria de peça não encontrada'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_part_category(uuid, text, uuid, boolean, integer) to authenticated;

create or replace function public.admin_upsert_stock_unit(p_company_id uuid, p_name text, p_id uuid default null, p_active boolean default true, p_sort_order integer default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_next integer;
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe a unidade'; end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next from public.stock_units where company_id=p_company_id;
    insert into public.stock_units(company_id,name,active,sort_order,created_by) values (p_company_id,upper(trim(p_name)),coalesce(p_active,true),coalesce(p_sort_order,v_next),auth.uid()) returning id into v_id;
  else
    update public.stock_units set name=upper(trim(p_name)),active=coalesce(p_active,active),sort_order=coalesce(p_sort_order,sort_order) where id=p_id and company_id=p_company_id returning id into v_id;
    if v_id is null then raise exception 'Unidade não encontrada'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_stock_unit(uuid, text, uuid, boolean, integer) to authenticated;
