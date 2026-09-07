-- ============================================================
-- Achado do usuário em 2026-09-07: "OS finalizada, por motivo de
-- segurança, só pode ser alterada pelo GESTOR". Hoje, uma vez
-- FINALIZADA, service_orders/os_parts/os_financial/payments
-- continuavam livremente editáveis por qualquer papel com acesso à
-- empresa (mesma policy "ALL" de sempre, sem distinção de status).
--
-- Implementado como POLICIES RESTRICTIVE (nunca substituem as
-- policies PERMISSIVE já existentes -- toda policy restritiva
-- soma-se em AND, então isso só ESTREITA o que já era permitido,
-- nunca concede nada novo). Escopo deliberadamente limitado ao que é
-- "a OS em si" (o pedido, as peças, o financeiro, os pagamentos) --
-- NÃO trava clients/equipments, que são cadastros compartilhados
-- entre várias OS/atendimentos e continuam editáveis normalmente
-- (travar um cliente inteiro por causa de UMA OS finalizada dele
-- travaria atualizações legítimas sem relação nenhuma com essa OS).
--
-- SELECT nunca é restringido aqui -- qualquer papel continua podendo
-- CONSULTAR/imprimir uma OS finalizada normalmente, só não ALTERAR.
-- A própria transição PRONTO PARA ENTREGA -> FINALIZADA (migration
-- 20260907050000) não é afetada: no momento em que essa transição
-- acontece, o status ANTIGO da linha ainda não é FINALIZADA, então a
-- condição já libera passagem pra qualquer papel autorizado de
-- sempre -- só uma OS JÁ finalizada fica travada pra não-gestor.
-- ============================================================

create policy "service_orders_lock_finalized_update" on public.service_orders
  as restrictive for update to authenticated
  using (status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  with check (status <> 'FINALIZADA' or current_company_role() = 'GESTOR');

create policy "service_orders_lock_finalized_delete" on public.service_orders
  as restrictive for delete to authenticated
  using (status <> 'FINALIZADA' or current_company_role() = 'GESTOR');

create policy "os_parts_lock_finalized_insert" on public.os_parts
  as restrictive for insert to authenticated
  with check (exists (
    select 1 from public.service_orders o
    where o.id = os_parts.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
create policy "os_parts_lock_finalized_update" on public.os_parts
  as restrictive for update to authenticated
  using (exists (
    select 1 from public.service_orders o
    where o.id = os_parts.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ))
  with check (exists (
    select 1 from public.service_orders o
    where o.id = os_parts.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
create policy "os_parts_lock_finalized_delete" on public.os_parts
  as restrictive for delete to authenticated
  using (exists (
    select 1 from public.service_orders o
    where o.id = os_parts.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));

create policy "os_financial_lock_finalized_insert" on public.os_financial
  as restrictive for insert to authenticated
  with check (exists (
    select 1 from public.service_orders o
    where o.id = os_financial.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
create policy "os_financial_lock_finalized_update" on public.os_financial
  as restrictive for update to authenticated
  using (exists (
    select 1 from public.service_orders o
    where o.id = os_financial.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ))
  with check (exists (
    select 1 from public.service_orders o
    where o.id = os_financial.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
create policy "os_financial_lock_finalized_delete" on public.os_financial
  as restrictive for delete to authenticated
  using (exists (
    select 1 from public.service_orders o
    where o.id = os_financial.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));

create policy "payments_lock_finalized_insert" on public.payments
  as restrictive for insert to authenticated
  with check (exists (
    select 1 from public.service_orders o
    where o.id = payments.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
create policy "payments_lock_finalized_update" on public.payments
  as restrictive for update to authenticated
  using (exists (
    select 1 from public.service_orders o
    where o.id = payments.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ))
  with check (exists (
    select 1 from public.service_orders o
    where o.id = payments.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
create policy "payments_lock_finalized_delete" on public.payments
  as restrictive for delete to authenticated
  using (exists (
    select 1 from public.service_orders o
    where o.id = payments.service_order_id
      and (o.status <> 'FINALIZADA' or current_company_role() = 'GESTOR')
  ));
