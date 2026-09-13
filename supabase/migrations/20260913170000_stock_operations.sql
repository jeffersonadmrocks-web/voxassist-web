-- ============================================================
-- EST-2A (5/6) -- stock_operations: idempotência real, mesmo desenho
-- de payment_operations (migration 20260913100000) -- resolve o mesmo
-- problema: uma única "operação" pode legitimamente gerar mais de um
-- movimento no futuro (Bloco 3, EST-MOV-04), então uma UNIQUE direta
-- em stock_movements(company_id, idempotency_key) bloquearia
-- incorretamente o segundo movimento de uma mesma operação
-- multi-movimento. Uma tabela dedicada resolve o operation_id ANTES de
-- qualquer INSERT em stock_movements, com INSERT ... ON CONFLICT DO
-- NOTHING + SELECT ... FOR UPDATE (mesma técnica testada com corrida
-- forçada real no Financeiro).
-- ============================================================

create table if not exists public.stock_operations (
  company_id uuid not null references public.companies(id),
  idempotency_key text not null,
  operation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  primary key (company_id, idempotency_key)
);
alter table public.stock_operations enable row level security;
create policy "stock_operations_select_company" on public.stock_operations
  for select to authenticated
  using (company_id = public.current_company_id());

comment on table public.stock_operations is
  'Resolução de idempotência do Motor de Estoque -- mesmo desenho de payment_operations (EST-2A, 2026-09-13).';
