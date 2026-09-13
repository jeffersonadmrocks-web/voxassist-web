-- ============================================================
-- Reestruturação do Financeiro (tela de Recebimentos): a nova tela
-- trata a TRANSAÇÃO como unidade principal (um extrato de tudo que foi
-- efetivamente recebido, com ou sem OS vinculada -- ex.: venda de peça
-- avulsa no balcão), não a OS. Hoje `payments.service_order_id` é
-- NOT NULL e a policy company_id=current_company_id() só existe via
-- EXISTS em service_orders -- um pagamento sem OS ficaria impossível
-- de criar (a FK falha) e, mesmo se a FK não existisse, invisível pra
-- qualquer RLS (o EXISTS nunca casa com service_order_id nulo).
--
-- Corrigido tornando service_order_id opcional e adicionando
-- company_id diretamente em payments (preenchido a partir da OS pra
-- linhas existentes; obrigatório a partir de agora em toda gravação,
-- inclusive avulsa). A policy permissiva passa a checar direto por
-- payments.company_id (mais simples e também mais barato que o JOIN
-- que tinha antes, e continua funcionando idêntico pra pagamentos
-- ligados a uma OS). As restritivas de "OS finalizada só GESTOR"
-- (migration 20260907060000) continuam intocadas para pagamentos COM
-- OS -- e passam a liberar (never bloquear) pagamentos SEM OS, já que
-- não existe OS nenhuma pra travar.
-- ============================================================

alter table public.payments add column if not exists company_id uuid references public.companies(id);

update public.payments p
set company_id = o.company_id
from public.service_orders o
where p.service_order_id = o.id
  and p.company_id is null;

alter table public.payments alter column company_id set not null;
alter table public.payments alter column service_order_id drop not null;

drop policy if exists "payments_company" on public.payments;
create policy "payments_company" on public.payments
  as permissive for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

drop policy if exists "payments_lock_finalized_insert" on public.payments;
create policy "payments_lock_finalized_insert" on public.payments
  as restrictive for insert to authenticated
  with check (service_order_id is null or exists (
    select 1 from public.service_orders o
    where o.id = payments.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
drop policy if exists "payments_lock_finalized_update" on public.payments;
create policy "payments_lock_finalized_update" on public.payments
  as restrictive for update to authenticated
  using (service_order_id is null or exists (
    select 1 from public.service_orders o
    where o.id = payments.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ))
  with check (service_order_id is null or exists (
    select 1 from public.service_orders o
    where o.id = payments.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
drop policy if exists "payments_lock_finalized_delete" on public.payments;
create policy "payments_lock_finalized_delete" on public.payments
  as restrictive for delete to authenticated
  using (service_order_id is null or exists (
    select 1 from public.service_orders o
    where o.id = payments.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
