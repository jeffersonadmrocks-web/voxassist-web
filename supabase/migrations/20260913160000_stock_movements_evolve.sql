-- ============================================================
-- EST-2A (4/6) -- evolui stock_movements pra virar de fato o razão
-- físico do Motor de Estoque (Bloco 3 do EST-1). Achado do EST-0B:
-- essa tabela já existia com o schema certo (item_id, movement_type
-- CHECK, quantity, technician_id, service_order_id, fiscal_pending,
-- notes, created_by, created_at) mas ZERO gravação em toda a base de
-- código -- e a RLS era "for ALL" permissiva (qualquer membro da
-- empresa podia INSERT/UPDATE/DELETE direto via REST, o mesmo buraco
-- que existia em payments antes da fase 2 do Financeiro).
--
-- Ajuste 3 do aceite: só 'ENTRY' entra no CHECK agora -- os demais
-- tipos conceituais do Bloco 3/4 (retirada, transferência, técnico,
-- consumo, quarentena, perda) só entram quando a operação real e os
-- testes de cada um existirem, não "pra deixar pronto". Valores
-- legados mantidos no CHECK por segurança (nunca foram usados -- EST-0B
-- confirmou zero linha na tabela -- mas não custa preservar).
-- ============================================================

alter table public.stock_movements
  add column if not exists operation_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists compensates_movement_id uuid references public.stock_movements(id),
  add column if not exists os_part_id uuid references public.os_parts(id),
  add column if not exists location_id uuid references public.stock_locations(id),
  add column if not exists position_id uuid references public.stock_positions(id);

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
  -- legado (nunca usado em produção, confirmado por EST-0B -- preservado por segurança)
  'ENTRADA','SAIDA','TRANSFERENCIA_TECNICO','RETORNO_TECNICO','USO_GARANTIA','BAIXA_FISCAL_GARANTIA','AJUSTE',
  -- EST-2A: só o necessário pra fundação + entrada
  'ENTRY'
));

-- Endurecimento de RLS (achado EST-0B: policy "for ALL" permitia
-- INSERT/UPDATE/DELETE direto) -- mesmo tratamento já aplicado a
-- payments na fase 2 do Financeiro: SELECT sempre liberado por
-- empresa, nenhuma policy permissiva de escrita. Só a RPC SECURITY
-- DEFINER (stock_register_entry, migration 20260913180000) grava
-- aqui.
drop policy if exists "stock_movements_company" on public.stock_movements;

create policy "stock_movements_select_company" on public.stock_movements
  for select to authenticated
  using (exists (select 1 from public.stock_items i where i.id = stock_movements.item_id and i.company_id = public.current_company_id()));

comment on table public.stock_movements is
  'Razão físico do Motor de Estoque (EST-1 Bloco 3). RLS endurecida em 2026-09-13 (EST-2A) -- só SELECT direto, escrita exclusivamente via RPC SECURITY DEFINER.';
