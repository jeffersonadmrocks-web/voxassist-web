-- Achado do usuário em 2026-09-03: existe desde antes desta sessão uma
-- permissão "agenda.view_all" ("Visualizar todas as agendas") no
-- catálogo de permissões (permissions-catalog-v0901.js) e um GESTOR já
-- tinha marcado essa permissão como concedida (allowed=true) pra um
-- técnico específico (BRENDO PEREIRA FERREIRA, via
-- access_type:GESTOR COMPLETO) esperando que isso desse a ele acesso à
-- agenda de todos os colegas -- mas nada nunca lia essa permissão: nem
-- o Dashboard (dashboard-canonical-v1.js, restrito por
-- role()==='TECNICO' puro), nem a RLS de appointments/
-- external_appointments (restrita por current_company_role()<>'TECNICO'
-- puro, ignorando qualquer permissão individual). Esta migration só
-- ativa o que já existia como intenção configurada -- nenhuma tabela
-- nova, nenhuma permissão nova concedida por mim.
--
-- Escopo deliberadamente restrito a VISUALIZAÇÃO: agenda.view_all é
-- "Visualizar todas as agendas", distinto de agenda.edit ("Agendar /
-- reagendar") -- um técnico com view_all passa a ENXERGAR a agenda dos
-- colegas, mas continua sem poder escrever em compromisso alheio (isso
-- seria agenda.edit, fora do pedido desta correção). Por isso
-- appointments (hoje uma única policy "for ALL") é dividida em
-- SELECT (ampliada) e escrita (mantida idêntica à regra original).

create or replace function public.current_user_has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_permissions up
    where up.user_id = auth.uid()
      and up.company_id = current_company_id()
      and up.permission_key = p_key
      and up.allowed = true
  );
$$;

drop policy if exists "appointments_company" on public.appointments;

create policy "appointments_select" on public.appointments for SELECT to authenticated
  using (
    (exists (select 1 from service_orders o where o.id = appointments.service_order_id and o.company_id = current_company_id()))
    and (
      coalesce(current_company_role(), 'ATENDENTE') <> 'TECNICO'
      or technician_id = auth.uid()
      or current_user_has_permission('agenda.view_all')
    )
  );

create policy "appointments_write" on public.appointments for INSERT to authenticated
  with check (
    (exists (select 1 from service_orders o where o.id = appointments.service_order_id and o.company_id = current_company_id()))
    and (coalesce(current_company_role(), 'ATENDENTE') <> 'TECNICO' or technician_id = auth.uid())
  );

create policy "appointments_update" on public.appointments for UPDATE to authenticated
  using (
    (exists (select 1 from service_orders o where o.id = appointments.service_order_id and o.company_id = current_company_id()))
    and (coalesce(current_company_role(), 'ATENDENTE') <> 'TECNICO' or technician_id = auth.uid())
  )
  with check (
    (exists (select 1 from service_orders o where o.id = appointments.service_order_id and o.company_id = current_company_id()))
    and (coalesce(current_company_role(), 'ATENDENTE') <> 'TECNICO' or technician_id = auth.uid())
  );

create policy "appointments_delete" on public.appointments for DELETE to authenticated
  using (
    (exists (select 1 from service_orders o where o.id = appointments.service_order_id and o.company_id = current_company_id()))
    and (coalesce(current_company_role(), 'ATENDENTE') <> 'TECNICO' or technician_id = auth.uid())
  );

drop policy if exists "Usuários autenticados veem compromissos externos" on public.external_appointments;

create policy "Usuários autenticados veem compromissos externos" on public.external_appointments for SELECT to authenticated
  using (
    company_id = current_company_id()
    and (
      coalesce(current_company_role(), 'TECNICO') <> 'TECNICO'
      or technician_id = auth.uid()
      or current_user_has_permission('agenda.view_all')
    )
  );
