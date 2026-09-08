-- VoxAssist -- Configurações > Ordens de Serviço > Tipos de OS
-- Matriz Mestra, Área 02 -- CRIAR confirmado: "tipo de OS" hoje é uma
-- lista fixa (TYPES) dentro de order-type-v0812.js, sem tela de
-- gestão. service_orders.order_type é texto livre (sem CHECK) --
-- ativar/desativar aqui não precisa de migração no service_orders,
-- histórico nunca é afetado.
-- Mesmo padrão de payment_methods (migration 20260908040000):
-- catálogo POR EMPRESA, GESTOR-only pra escrever, semeadura das
-- empresas existentes com os 5 tipos já em uso hoje + trigger pra
-- empresa nova. "GARANTIA" e "REINGRESSO" têm tratamento especial
-- hardcoded no frontend (campos de garantia extras; vínculo de OS
-- anterior) -- comparação por string exata, não por flag na tabela;
-- renomear esses dois registros quebra esse comportamento (aviso
-- deixado na tela de gestão).
create table if not exists public.order_types (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.order_types add constraint order_types_pkey primary key (id);
alter table public.order_types add constraint order_types_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.order_types add constraint order_types_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.order_types add constraint order_types_unique_name
  unique (company_id, name);
create index idx_order_types_company on public.order_types using btree (company_id, active, sort_order);

alter table public.order_types enable row level security;
create policy "order_types_select_company" on public.order_types for select to authenticated
  using (company_id = current_company_id());
create policy "order_types_write_gestor" on public.order_types for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_upsert_order_type(
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
    raise exception 'Informe o nome do tipo de OS';
  end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next_order from public.order_types where company_id=p_company_id;
    insert into public.order_types(company_id,name,active,sort_order,created_by)
    values (p_company_id, upper(trim(p_name)), coalesce(p_active,true), coalesce(p_sort_order,v_next_order), auth.uid())
    returning id into v_id;
  else
    update public.order_types
      set name=upper(trim(p_name)), active=coalesce(p_active,active), sort_order=coalesce(p_sort_order,sort_order)
      where id=p_id and company_id=p_company_id
      returning id into v_id;
    if v_id is null then raise exception 'Tipo de OS não encontrado'; end if;
  end if;
  return v_id;
end;
$$;
comment on function public.admin_upsert_order_type is
  'Cria/atualiza um tipo de OS da empresa (Configurações > Ordens de Serviço). Gestor-only. "GARANTIA" e "REINGRESSO" têm comportamento especial hardcoded no frontend (order-type-v0812.js) -- renomear/excluir esses registros específicos quebra esse comportamento.';
grant execute on function public.admin_upsert_order_type(uuid, text, uuid, boolean, integer) to authenticated;

insert into public.order_types (company_id, name, sort_order)
select c.id, m.name, m.sort_order
from public.companies c
cross join (values
  ('FORA DE GARANTIA',1),('GARANTIA',2),('SEGURADORA',3),('REINGRESSO',4),('OUTROS',5)
) as m(name, sort_order)
on conflict (company_id, name) do nothing;

create or replace function public.seed_default_order_types() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.order_types (company_id, name, sort_order) values
    (new.id,'FORA DE GARANTIA',1),(new.id,'GARANTIA',2),(new.id,'SEGURADORA',3),(new.id,'REINGRESSO',4),(new.id,'OUTROS',5)
  on conflict (company_id, name) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_seed_order_types on public.companies;
create trigger trg_seed_order_types after insert on public.companies
  for each row execute function public.seed_default_order_types();
