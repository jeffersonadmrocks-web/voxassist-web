-- ============================================================
-- EST-2A (6/6) -- stock_register_entry: a única operação do Motor de
-- Estoque autorizada nesta fase (Bloco 3 do EST-1, fundação + entrada).
-- RPC específica, não genérica (aceite do usuário: "não criar
-- stock_move(type,...) capaz de executar qualquer movimento
-- arbitrário").
--
-- Fluxo (item "TRANSAÇÃO DA ENTRADA" do aceite, 19 passos): autentica
-- -> resolve empresa -> autoriza -> valida quantity/item/local ->
-- resolve/cria posição -> confirma posição pertence ao local/empresa
-- (trigger de stock_positions/stock_balances, migrations 140000/150000)
-- -> resolve idempotência (stock_operations) -> localiza/cria o saldo
-- da dimensão física exata (stock_balances) -> trava com FOR UPDATE ->
-- incrementa -> registra o stock_movement ENTRY -> sincroniza a
-- projeção legada (trigger stock_balances_sync_legacy_aggregate,
-- criado aqui) -> audit_log -> retorna.
--
-- Posição: recebida como CÓDIGO (não id) e resolvida find-or-create
-- dentro da própria transação -- não foi aprovada uma RPC separada de
-- cadastro de posição neste pacote (ajuste "manter mínima"), e a
-- alternativa de exigir um id pré-existente obrigaria uma tela de
-- cadastro de posição à parte, fora do escopo aprovado.
-- ============================================================

-- ---- projeção legada: stock_items.available_quantity ----
-- REGRA DO AGREGADO LEGADO (aceite do usuário): available_quantity =
-- SUM(stock_balances.quantity WHERE state='DISPONIVEL') pras dimensões
-- daquele stock_item. stock_items já é escopado por company_id (NOT
-- NULL, UNIQUE(company_id,code), RLS company-scoped -- confirmado no
-- schema atual, sem ambiguidade multiempresa) e todo stock_balances é
-- travado por trigger pra pertencer à MESMA empresa do stock_item (ver
-- stock_balances_enforce_dimension_integrity, migration 150000) -- a
-- soma abaixo nunca precisa filtrar por empresa manualmente porque
-- stock_item_id já implica uma empresa única. Nenhuma inferência
-- insegura foi necessária; não houve motivo para PARAR aqui.
create or replace function public.stock_balances_sync_legacy_aggregate()
returns trigger
language plpgsql
as $$
declare
  v_item_id uuid;
begin
  v_item_id := coalesce(new.stock_item_id, old.stock_item_id);
  update public.stock_items
     set available_quantity = (
       select coalesce(sum(quantity), 0) from public.stock_balances
       where stock_item_id = v_item_id and state = 'DISPONIVEL'
     ),
     updated_at = now()
   where id = v_item_id;
  return coalesce(new, old);
end;
$$;
comment on function public.stock_balances_sync_legacy_aggregate is
  'Mantém stock_items.available_quantity como projeção agregada de compatibilidade = SUM(stock_balances.quantity WHERE state=DISPONIVEL) -- nunca mais editado direto pelo frontend (EST-2A, ajuste 2 do aceite, 2026-09-13).';

create trigger stock_balances_sync_legacy_aggregate
  after insert or update or delete on public.stock_balances
  for each row execute function public.stock_balances_sync_legacy_aggregate();

-- ---- RPC ----
create or replace function public.stock_register_entry(
  p_stock_item_id uuid,
  p_location_id uuid,
  p_position_code text,
  p_quantity numeric,
  p_notes text default null,
  p_idempotency_key text default null
)
returns table(out_movement_id uuid, out_balance_id uuid, out_position_id uuid, out_new_quantity numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_role text := current_company_role();
  v_operation_id uuid;
  v_position_id uuid;
  v_movement_id uuid;
  v_balance_id uuid;
  v_new_qty numeric;
  v_existing record;
begin
  -- 3) autorizar
  if not (v_role in ('GESTOR','ESTOQUE') or public.current_user_has_permission('estoque.entrada')) then
    raise exception 'Sem permissão para registrar entrada de estoque.';
  end if;

  -- 4) validar quantidade
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  -- 5) validar peça
  if not exists (select 1 from public.stock_items where id = p_stock_item_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;

  -- 6) validar local
  if not exists (select 1 from public.stock_locations where id = p_location_id and company_id = v_company_id and active) then
    raise exception 'Local de estoque inválido ou inativo.';
  end if;

  -- 7-8) resolver posição (find-or-create) e confirmar pertence ao local/empresa
  if p_position_code is null or btrim(p_position_code) = '' then
    raise exception 'Informe a posição.';
  end if;
  -- achado em teste de concorrência real (EST-2A): duas entradas
  -- simultâneas pra uma posição ainda inexistente colidiam na UNIQUE de
  -- stock_positions e a que perdia a corrida quebrava a transação
  -- inteira em vez de reaproveitar a posição já criada pela outra.
  -- Corrigido com o mesmo padrão INSERT...ON CONFLICT DO NOTHING +
  -- re-select já usado pra idempotência (stock_operations).
  insert into public.stock_positions(location_id, code, created_by)
    values (p_location_id, upper(btrim(p_position_code)), auth.uid())
    on conflict (location_id, code) do nothing;
  select id into v_position_id from public.stock_positions
    where location_id = p_location_id and upper(code) = upper(btrim(p_position_code));
  -- confirmação explícita (além da trigger, que já garante integridade
  -- no INSERT/UPDATE de stock_balances mais abaixo): rejeita cedo, com
  -- mensagem clara, em vez de deixar a trigger estourar mais tarde.
  if not exists (select 1 from public.stock_positions where id = v_position_id and location_id = p_location_id and active) then
    raise exception 'Posição inválida para este local.';
  end if;

  -- 9-11) idempotência: resolve/trava a operação ANTES de qualquer
  -- INSERT em stock_movements (mesma técnica de payment_operations,
  -- com corrida forçada real testada nesta sessão pro Financeiro).
  if p_idempotency_key is not null then
    insert into public.stock_operations(company_id, idempotency_key, operation_id)
      values (v_company_id, p_idempotency_key, gen_random_uuid())
      on conflict (company_id, idempotency_key) do nothing;
    select operation_id into v_operation_id from public.stock_operations
      where company_id = v_company_id and idempotency_key = p_idempotency_key
      for update;

    select m.id, m.item_id, m.location_id, m.position_id, m.quantity
      into v_existing
      from public.stock_movements m
      where m.operation_id = v_operation_id
      limit 1;

    if found then
      -- 10) mesma chave reutilizada com payload incompatível -> rejeita
      if v_existing.item_id <> p_stock_item_id or v_existing.location_id <> p_location_id
         or v_existing.position_id <> v_position_id or v_existing.quantity <> p_quantity then
        raise exception 'idempotency_key já usada para uma entrada diferente.';
      end if;
      -- retry legítimo: devolve o resultado já produzido, sem gravar de novo
      select sb.id, sb.quantity into v_balance_id, v_new_qty
        from public.stock_balances sb
        where sb.stock_item_id = p_stock_item_id and sb.location_id = p_location_id
          and sb.position_id = v_position_id and sb.state = 'DISPONIVEL';
      return query select v_existing.id as out_movement_id, v_balance_id as out_balance_id,
        v_position_id as out_position_id, v_new_qty as out_new_quantity;
      return;
    end if;
  else
    v_operation_id := gen_random_uuid();
  end if;

  -- 12-13) localizar/criar e travar o saldo da dimensão física exata
  insert into public.stock_balances(company_id, stock_item_id, location_id, position_id, state, quantity)
    values (v_company_id, p_stock_item_id, p_location_id, v_position_id, 'DISPONIVEL', 0)
    on conflict (company_id, stock_item_id, location_id, position_id, state) do nothing;

  select id into v_balance_id from public.stock_balances
    where company_id = v_company_id and stock_item_id = p_stock_item_id and location_id = p_location_id
      and position_id = v_position_id and state = 'DISPONIVEL'
    for update;

  -- 14) incrementar
  update public.stock_balances set quantity = quantity + p_quantity, updated_at = now()
    where id = v_balance_id
    returning quantity into v_new_qty;

  -- 15) registrar o movimento (operation_id compartilhado -- Bloco 3,
  -- uma operação pode gerar mais de um movimento no futuro; aqui é só um)
  insert into public.stock_movements(
    item_id, movement_type, quantity, location_id, position_id,
    operation_id, idempotency_key, notes, created_by
  ) values (
    p_stock_item_id, 'ENTRY', p_quantity, p_location_id, v_position_id,
    v_operation_id, p_idempotency_key, p_notes, auth.uid()
  ) returning id into v_movement_id;

  -- 16) sincronização do agregado legado acontece via trigger no UPDATE acima

  -- 17) audit_log
  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'ESTOQUE', 'REGISTRAR_ENTRADA', 'STOCK_MOVEMENT', v_movement_id,
    jsonb_build_object(
      'stock_item_id', p_stock_item_id, 'location_id', p_location_id, 'position_id', v_position_id,
      'quantity', p_quantity, 'operation_id', v_operation_id, 'new_quantity', v_new_qty
    ));

  -- 18-19) commit implícito no fim da função; retorna
  return query select v_movement_id as out_movement_id, v_balance_id as out_balance_id,
    v_position_id as out_position_id, v_new_qty as out_new_quantity;
end;
$$;

comment on function public.stock_register_entry is
  'Única operação do Motor de Estoque autorizada no EST-2A: entrada física, criando/incrementando o saldo canônico em stock_balances, registrando o movimento ENTRY e sincronizando a projeção legada stock_items.available_quantity. SECURITY DEFINER, autorização server-side (GESTOR/ESTOQUE ou estoque.entrada), idempotente via stock_operations, trava a dimensão física correta com FOR UPDATE (EST-2A, 2026-09-13).';

grant execute on function public.stock_register_entry(uuid, uuid, text, numeric, text, text) to authenticated;
