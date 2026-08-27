-- VoxAssist Web V0.8.13 — RASCUNHO de RLS para `profiles` e `service_orders`.
--
-- ATENÇÃO: NÃO aplicar em produção sem revisar.
-- Este rascunho cobre apenas as duas tabelas cujas colunas foram
-- confirmadas por uso real no código-fonte (grep em *.js), porque
-- `supabase/schema.sql` está desatualizado e não reflete o schema real
-- (ver HANDOFF_CLAUDE_CODE.md, item pendente 1). As ~30 tabelas do app
-- (companies, stores, user_companies, user_store_access, clients,
-- equipments, os_status_history, os_parts, os_financial, attachments,
-- appointments, tasks, stock_items etc.) ainda precisam de dump real do
-- Supabase antes de terem política própria.
--
-- Colunas assumidas (confirmadas via grep em *.js):
--   profiles: id (=auth.users.id), full_name, role
--     (GESTOR|ATENDENTE|TECNICO|ESTOQUE), active, store_id,
--     active_company_id, email, external_schedule_enabled, updated_at.
--   service_orders: id, os_number, client_id, equipment_id,
--     technician_id (-> profiles.id), store_id, created_by, attendant_id,
--     status, order_type, opened_at, ready_at, delivery_at,
--     cancelled_at, cancelled_by, updated_at.
--
-- Este rascunho assume isolamento simples por `store_id` (um usuário só
-- vê/edita o que pertence à própria loja, exceto GESTOR). O modelo real
-- é multi-empresa/multi-loja via `user_companies`/`user_store_access`
-- (ver company-*.js), que ainda precisa ser incorporado aqui após o
-- dump do schema real.

-- ============================================================
-- profiles
-- ============================================================
alter table public.profiles enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
  on public.profiles for select
  using (id = auth.uid());

-- Necessário para dropdowns de técnico/atendente (ex.: dashboard-master,
-- field-agenda-complete). Restringe à mesma loja do usuário logado.
drop policy if exists profiles_select_same_store on public.profiles;
create policy profiles_select_same_store
  on public.profiles for select
  using (
    store_id is not distinct from (
      select p.store_id from public.profiles p where p.id = auth.uid()
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
-- ATENÇÃO: RLS por linha não impede o próprio usuário de alterar sua
-- coluna `role`/`active` (escalada de privilégio). Precisa de trigger
-- BEFORE UPDATE bloqueando mudança dessas colunas fora do fluxo de
-- GESTOR antes de ativar esta política em produção.

drop policy if exists profiles_manager_all on public.profiles;
create policy profiles_manager_all
  on public.profiles for all
  using (
    exists (
      select 1 from public.profiles g
      where g.id = auth.uid() and g.role = 'GESTOR'
        and g.store_id is not distinct from public.profiles.store_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles g
      where g.id = auth.uid() and g.role = 'GESTOR'
        and g.store_id is not distinct from public.profiles.store_id
    )
  );

-- ============================================================
-- service_orders
-- ============================================================
alter table public.service_orders enable row level security;

drop policy if exists service_orders_select_store on public.service_orders;
create policy service_orders_select_store
  on public.service_orders for select
  using (
    store_id is not distinct from (
      select p.store_id from public.profiles p where p.id = auth.uid()
    )
  );

drop policy if exists service_orders_insert_store on public.service_orders;
create policy service_orders_insert_store
  on public.service_orders for insert
  with check (
    created_by = auth.uid()
    and store_id is not distinct from (
      select p.store_id from public.profiles p where p.id = auth.uid()
    )
  );

-- Técnico só atualiza OS atribuída a ele; atendente/gestor atualizam
-- qualquer OS da própria loja. Ajustar quando o modelo multi-loja real
-- (user_store_access) substituir a comparação simples por store_id.
drop policy if exists service_orders_update_store on public.service_orders;
create policy service_orders_update_store
  on public.service_orders for update
  using (
    store_id is not distinct from (
      select p.store_id from public.profiles p where p.id = auth.uid()
    )
    and (
      technician_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('GESTOR','ATENDENTE')
      )
    )
  )
  with check (
    store_id is not distinct from (
      select p.store_id from public.profiles p where p.id = auth.uid()
    )
  );

-- ============================================================
-- Pendente (item 2 do HANDOFF_CLAUDE_CODE.md): master-reset-v0813.js
-- chama a RPC `master_reset_test_environment`, que não existe em
-- nenhum arquivo versionado. Confirmar no painel do Supabase se ela já
-- existe (fora de versionamento) e trazer a definição real para cá, ou
-- implementar do zero. Stub de referência (NÃO executar sem revisar
-- o que a função realmente deve apagar/resetar):
--
-- create or replace function public.master_reset_test_environment()
-- returns void
-- language plpgsql
-- security definer
-- as $$
-- begin
--   raise exception 'master_reset_test_environment: implementação pendente (ver HANDOFF_CLAUDE_CODE.md item 2)';
-- end;
-- $$;
