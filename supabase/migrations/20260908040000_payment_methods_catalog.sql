-- VoxAssist -- Configurações > Financeiro > Formas de pagamento
-- Matriz Mestra (CONFIGURACOES_MATRIZ.md), Área 06 -- CRIAR confirmado
-- pelo levantamento: "forma de pagamento" hoje é uma lista fixa dentro
-- de um <select> em os-detail-v0812.js (financePanel(), guia Finalizar
-- OS), sem tabela nem tela de gestão. Este catálogo é POR EMPRESA
-- (diferente do catálogo de produtos, que é global-compartilhado --
-- forma de pagamento varia de verdade por empresa/região, não faz
-- sentido como catálogo mestre único). Mesmo padrão de
-- service_groups/stores: GESTOR-only pra escrever, empresa inteira lê.
--
-- Semeia CADA EMPRESA JÁ EXISTENTE com as 7 formas hoje hardcoded
-- (mesma ordem/nome), pra não perder nenhuma função já em uso --
-- "DESCONTO" precisa continuar existindo com ESSE nome exato: é
-- tratado como caso especial (fecha o saldo da OS sem contar como
-- receita) tanto em os-detail-v0812.js (financePanel) quanto em
-- runtime/dashboard-canonical-v1.js (revenuePayments) -- os dois
-- comparam a string do método em maiúsculas, não uma flag na tabela.
create table if not exists public.payment_methods (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.payment_methods add constraint payment_methods_pkey primary key (id);
alter table public.payment_methods add constraint payment_methods_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.payment_methods add constraint payment_methods_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.payment_methods add constraint payment_methods_unique_name
  unique (company_id, name);
create index idx_payment_methods_company on public.payment_methods using btree (company_id, active, sort_order);

alter table public.payment_methods enable row level security;
create policy "payment_methods_select_company" on public.payment_methods for select to authenticated
  using (company_id = current_company_id());
create policy "payment_methods_write_gestor" on public.payment_methods for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_upsert_payment_method(
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
    raise exception 'Informe o nome da forma de pagamento';
  end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next_order from public.payment_methods where company_id=p_company_id;
    insert into public.payment_methods(company_id,name,active,sort_order,created_by)
    values (p_company_id, upper(trim(p_name)), coalesce(p_active,true), coalesce(p_sort_order,v_next_order), auth.uid())
    returning id into v_id;
  else
    update public.payment_methods
      set name=upper(trim(p_name)), active=coalesce(p_active,active), sort_order=coalesce(p_sort_order,sort_order)
      where id=p_id and company_id=p_company_id
      returning id into v_id;
    if v_id is null then raise exception 'Forma de pagamento não encontrada'; end if;
  end if;
  return v_id;
end;
$$;
comment on function public.admin_upsert_payment_method is
  'Cria/atualiza uma forma de pagamento da empresa (Configurações > Financeiro). Gestor-only, mesmo padrão de admin_upsert_service_group/admin_upsert_store. "DESCONTO" tem tratamento especial hardcoded no frontend (fecha saldo sem contar como receita) -- renomear/excluir esse registro específico quebra esse comportamento.';
grant execute on function public.admin_upsert_payment_method(uuid, text, uuid, boolean, integer) to authenticated;

-- Semeadura das empresas já existentes -- ordem e nomes idênticos ao
-- <select> hardcoded atual (os-detail-v0812.js), nada perdido.
insert into public.payment_methods (company_id, name, sort_order)
select c.id, m.name, m.sort_order
from public.companies c
cross join (values
  ('DINHEIRO',1),('PIX',2),('CARTÃO DE DÉBITO',3),('CARTÃO DE CRÉDITO',4),
  ('CHEQUE',5),('TRANSFERÊNCIA',6),('DESCONTO',7)
) as m(name, sort_order)
on conflict (company_id, name) do nothing;

-- Empresa criada a partir de agora já nasce com as mesmas 7 formas --
-- create_company_full (RPC existente) não precisa ser tocada.
create or replace function public.seed_default_payment_methods() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.payment_methods (company_id, name, sort_order) values
    (new.id,'DINHEIRO',1),(new.id,'PIX',2),(new.id,'CARTÃO DE DÉBITO',3),(new.id,'CARTÃO DE CRÉDITO',4),
    (new.id,'CHEQUE',5),(new.id,'TRANSFERÊNCIA',6),(new.id,'DESCONTO',7)
  on conflict (company_id, name) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_seed_payment_methods on public.companies;
create trigger trg_seed_payment_methods after insert on public.companies
  for each row execute function public.seed_default_payment_methods();
