-- ============================================================
-- Ajustes estruturais pedidos na revisão da migration anterior
-- (20260913080000, que tornou payments.service_order_id opcional e
-- introduziu payments.company_id):
--
-- 1) INTEGRIDADE EMPRESA x OS -- a migration anterior confiava no
--    aplicativo (e na RLS, que só valida "sua própria empresa", nunca
--    "a mesma empresa da OS referenciada") pra manter
--    payments.company_id coerente com service_orders.company_id
--    quando há OS vinculada. Isso permitiria, em tese, um pagamento
--    com company_id de uma empresa mas service_order_id de uma OS de
--    outra. Corrigido com um TRIGGER (não apenas CHECK -- um CHECK não
--    alcança outra tabela) que DERIVA company_id a partir da própria
--    OS sempre que service_order_id não é nulo, na própria gravação --
--    o banco garante a coerência, nunca depende do que o cliente
--    mandou. Quando service_order_id é nulo (avulso), company_id
--    continua vindo de quem grava (obrigatório, sem OS pra derivar).
--
-- 2) STORE_ID EM PAYMENTS -- necessário pra responder "quanto recebeu
--    a loja X" agora que existem pagamentos sem OS (que também não tem
--    loja hoje). Mesmo padrão do item 1: pagamentos COM OS têm
--    store_id derivado automaticamente da própria OS por trigger (uma
--    OS pode não ter store_id preenchido -- nesse caso o pagamento
--    também fica sem, não é travado). Pagamentos AVULSOS (sem OS)
--    ficam com store_id null por enquanto -- a regra de como uma venda
--    de balcão define sua loja de origem ainda não foi especificada;
--    nenhuma suposição de UI foi feita aqui -- store_id fica
--    disponível pra ser preenchido manualmente assim que essa parte da
--    especificação chegar, sem precisar de nova migration.
-- ============================================================

-- ---- 1) Integridade empresa x OS ----

-- Corrige qualquer linha existente que já devesse ter vindo da OS (a
-- migration anterior só preencheu company_id onde estava NULL; isso
-- garante consistência total antes do trigger passar a valer).
update public.payments p
set company_id = o.company_id
from public.service_orders o
where p.service_order_id = o.id
  and p.company_id is distinct from o.company_id;

create or replace function public.payments_enforce_company_from_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if new.service_order_id is not null then
    select company_id into v_company_id from public.service_orders where id = new.service_order_id;
    if v_company_id is null then
      raise exception 'payments.service_order_id % não corresponde a nenhuma OS existente', new.service_order_id;
    end if;
    new.company_id := v_company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_enforce_company_from_os on public.payments;
create trigger trg_payments_enforce_company_from_os
  before insert or update of service_order_id, company_id on public.payments
  for each row
  execute function public.payments_enforce_company_from_os();

-- ---- 2) store_id em payments ----

alter table public.payments add column if not exists store_id uuid references public.stores(id);

update public.payments p
set store_id = o.store_id
from public.service_orders o
where p.service_order_id = o.id
  and p.store_id is distinct from o.store_id;

create or replace function public.payments_derive_store_from_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.service_order_id is not null then
    select store_id into new.store_id from public.service_orders where id = new.service_order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_derive_store_from_os on public.payments;
create trigger trg_payments_derive_store_from_os
  before insert or update of service_order_id on public.payments
  for each row
  execute function public.payments_derive_store_from_os();
