-- ============================================================
-- Cadastro de Peças (achado do usuário, 2026-10-01): "Fiscal" era um
-- número solto, digitado manualmente no cadastro da peça, sem NENHUMA
-- ligação com as entradas reais de estoque -- podia divergir do saldo
-- de verdade (ex.: 9 no fiscal, 6 disponível), o que não faz sentido:
-- "fiscal" deveria ser um REGISTRO de que uma entrada veio com nota
-- fiscal, nunca um segundo contador manual competindo com
-- available_quantity (que desde EST-2A já é projeção automática de
-- stock_balances, nunca editado à mão -- ver stock_register_entry,
-- migration 20260913180000).
--
-- Decisão do usuário: Nota Fiscal vira um campo OPCIONAL de CADA
-- entrada (stock_movements.invoice_number) -- em branco quando a peça
-- vem de aparelho sucateado (achado real do usuário: "temos muitas
-- peças novas que vêm através de aparelho sucateado", sem NF nenhuma).
-- A coluna "Fiscal" da lista de peças passa a somar as entradas que
-- tiveram NF preenchida -- nunca mais editável à mão, nunca mais pode
-- divergir de uma entrada real registrada.
--
-- stock_items.fiscal_quantity (coluna antiga) é preservada sem
-- alteração -- só deixa de ser gravada/lida pelo cadastro de peças
-- (frontend). Nenhuma migração de dados: números já digitados ali
-- historicamente não tinham garantia de corresponder a uma entrada
-- real, então não haveria base confiável pra migrar.
-- ============================================================

alter table public.stock_movements add column if not exists invoice_number text;
comment on column public.stock_movements.invoice_number is
  'Número da nota fiscal da ENTRADA, quando houver -- opcional (fica nulo quando a peça vem de aparelho sucateado, sem NF). Nunca editável depois de criado o movimento, igual aos demais campos de stock_movements.';

-- Assinatura muda (parâmetro novo no fim) -- DROP explícito da versão
-- antiga antes do CREATE OR REPLACE, senão Postgres cria um SEGUNDO
-- overload em vez de substituir (duas funções com nomes iguais e
-- assinaturas diferentes coexistindo, ambíguo pro PostgREST).
drop function if exists public.stock_register_entry(uuid, uuid, text, numeric, text, text);

create or replace function public.stock_register_entry(
  p_stock_item_id uuid,
  p_location_id uuid,
  p_position_code text,
  p_quantity numeric,
  p_notes text default null,
  p_idempotency_key text default null,
  p_invoice_number text default null
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
  if not (v_role in ('GESTOR','ESTOQUE') or public.current_user_has_permission('estoque.entrada')) then
    raise exception 'Sem permissão para registrar entrada de estoque.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  if not exists (select 1 from public.stock_items where id = p_stock_item_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;

  if not exists (select 1 from public.stock_locations where id = p_location_id and company_id = v_company_id and active) then
    raise exception 'Local de estoque inválido ou inativo.';
  end if;

  if p_position_code is null or btrim(p_position_code) = '' then
    raise exception 'Informe a posição.';
  end if;
  insert into public.stock_positions(location_id, code, created_by)
    values (p_location_id, upper(btrim(p_position_code)), auth.uid())
    on conflict (location_id, code) do nothing;
  select id into v_position_id from public.stock_positions
    where location_id = p_location_id and upper(code) = upper(btrim(p_position_code));
  if not exists (select 1 from public.stock_positions where id = v_position_id and location_id = p_location_id and active) then
    raise exception 'Posição inválida para este local.';
  end if;

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
      if v_existing.item_id <> p_stock_item_id or v_existing.location_id <> p_location_id
         or v_existing.position_id <> v_position_id or v_existing.quantity <> p_quantity then
        raise exception 'idempotency_key já usada para uma entrada diferente.';
      end if;
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

  insert into public.stock_balances(company_id, stock_item_id, location_id, position_id, state, quantity)
    values (v_company_id, p_stock_item_id, p_location_id, v_position_id, 'DISPONIVEL', 0)
    on conflict (company_id, stock_item_id, location_id, position_id, state) do nothing;

  select id into v_balance_id from public.stock_balances
    where company_id = v_company_id and stock_item_id = p_stock_item_id and location_id = p_location_id
      and position_id = v_position_id and state = 'DISPONIVEL'
    for update;

  update public.stock_balances set quantity = quantity + p_quantity, updated_at = now()
    where id = v_balance_id
    returning quantity into v_new_qty;

  insert into public.stock_movements(
    item_id, movement_type, quantity, location_id, position_id,
    operation_id, idempotency_key, notes, invoice_number, created_by
  ) values (
    p_stock_item_id, 'ENTRY', p_quantity, p_location_id, v_position_id,
    v_operation_id, p_idempotency_key, p_notes, nullif(btrim(p_invoice_number), ''), auth.uid()
  ) returning id into v_movement_id;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'ESTOQUE', 'REGISTRAR_ENTRADA', 'STOCK_MOVEMENT', v_movement_id,
    jsonb_build_object(
      'stock_item_id', p_stock_item_id, 'location_id', p_location_id, 'position_id', v_position_id,
      'quantity', p_quantity, 'operation_id', v_operation_id, 'new_quantity', v_new_qty,
      'invoice_number', p_invoice_number
    ));

  return query select v_movement_id as out_movement_id, v_balance_id as out_balance_id,
    v_position_id as out_position_id, v_new_qty as out_new_quantity;
end;
$$;
comment on function public.stock_register_entry is
  'Única operação do Motor de Estoque autorizada que cria saldo (EST-2A): entrada física, criando/incrementando o saldo canônico em stock_balances, registrando o movimento ENTRY (com número de nota fiscal opcional, 2026-10-01) e sincronizando a projeção legada stock_items.available_quantity. SECURITY DEFINER, autorização server-side (GESTOR/ESTOQUE ou estoque.entrada), idempotente via stock_operations, trava a dimensão física correta com FOR UPDATE.';

revoke execute on function public.stock_register_entry(uuid, uuid, text, numeric, text, text, text) from public, anon;
grant execute on function public.stock_register_entry(uuid, uuid, text, numeric, text, text, text) to authenticated;
