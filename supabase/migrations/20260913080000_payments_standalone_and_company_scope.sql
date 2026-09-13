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
-- inclusive avulsa). As restritivas de "OS finalizada só GESTOR"
-- (migration 20260907060000) continuam intocadas para pagamentos COM
-- OS -- e passam a liberar (never bloquear) pagamentos SEM OS, já que
-- não existe OS nenhuma pra travar.
--
-- CORREÇÃO (revisão independente antes do deploy): a policy
-- "payments_company" original era FOR ALL -- select/insert/update/
-- delete liberados pra qualquer usuário autenticado da mesma empresa,
-- contornando por completo register_payment/reverse_payment
-- (migration 20260913100000, que passam a ser SECURITY DEFINER
-- exatamente por causa disso -- a porta oficial só funciona se a porta
-- lateral for fechada). Substituída por 3 policies estreitas: SELECT
-- continua liberado (nunca foi o problema -- consultar/imprimir
-- sempre foi permitido); UPDATE e DELETE diretos passam a valer SÓ
-- pra status='PENDENTE' (o único caso legado real que ainda precisa de
-- edição/exclusão direta -- vxEditPendingPayment/vxDeletePendingPayment
-- em os-detail-v0812.js -- auditado antes de mexer: nenhum fluxo do
-- app cria PENDENTE hoje, então não há criação legada pra preservar,
-- só edição/exclusão de linhas PENDENTE que já existirem). Não sobra
-- nenhuma policy permissiva de INSERT -- toda criação de payments
-- (RECEBIDO/ESTORNO/DESCONTO) passa a exigir as RPCs.
-- ============================================================

alter table public.payments add column if not exists company_id uuid references public.companies(id);

update public.payments p
set company_id = o.company_id
from public.service_orders o
where p.service_order_id = o.id
  and p.company_id is null;

-- Falha controlada em vez de deixar o ALTER abaixo estourar um erro
-- genérico de NOT NULL: se sobrar algum pagamento sem company_id
-- resolvível (sem OS correspondente -- não deveria ser possível dado
-- que service_order_id era NOT NULL com FK ON DELETE CASCADE até este
-- ponto, mas confirmado explicitamente em vez de assumido), a migration
-- para aqui, sem apagar nem adivinhar nada.
do $$
declare v_orphans int;
begin
  select count(*) into v_orphans from public.payments where company_id is null;
  if v_orphans > 0 then
    raise exception 'Migration abortada: % pagamento(s) existente(s) sem company_id resolvível (sem OS correspondente) -- resolva manualmente antes de continuar. Nenhum dado foi apagado ou alterado por esta checagem.', v_orphans;
  end if;
end $$;

alter table public.payments alter column company_id set not null;
alter table public.payments alter column service_order_id drop not null;

drop policy if exists "payments_company" on public.payments;
create policy "payments_select_company" on public.payments
  as permissive for select to authenticated
  using (company_id = current_company_id());
create policy "payments_update_pending_company" on public.payments
  as permissive for update to authenticated
  using (company_id = current_company_id() and status = 'PENDENTE')
  with check (company_id = current_company_id() and status = 'PENDENTE');
create policy "payments_delete_pending_company" on public.payments
  as permissive for delete to authenticated
  using (company_id = current_company_id() and status = 'PENDENTE');

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
