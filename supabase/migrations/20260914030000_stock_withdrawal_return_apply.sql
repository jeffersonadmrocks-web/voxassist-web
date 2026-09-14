-- ============================================================
-- Estoque -- pacote de conclusão (2026-09-14): RETIRAR (uso em OS /
-- entrega ao técnico), APLICAR (consumo pelo técnico), DEVOLVER
-- (com movimento compensatório, nunca apaga a saída), LIBERAR
-- QUARENTENA. NÃO refaz EST-2A -- reaproveita stock_balances/
-- stock_positions/stock_operations/stock_movements exatamente como
-- estão, só acrescenta os movimentos que faltavam.
--
-- Auditoria confirmada antes de implementar:
--   stock_items/stock_locations/stock_positions/stock_balances/
--   stock_movements/stock_operations: EXISTEM E FUNCIONAM (EST-2A);
--   technician_stock: EXISTE MAS INCOMPLETO -- schema certo
--     (technician_id, stock_item_id, quantity, company_id, UNIQUE
--     técnico+peça, CHECK quantity>=0) mas RLS "for ALL" permissiva
--     pra authenticated (zero gate de papel) e nenhuma RPC grava nela
--     -- corrigido abaixo: vira projeção real (analogia exata com
--     stock_items.available_quantity sobre stock_balances), RLS
--     endurecida pro mesmo padrão de stock_balances/stock_movements;
--   os_parts.move_stock: DECORATIVO (confirmado, nenhum código lê/usa)
--     -- preservado como está, os_part_id fica como vínculo OPCIONAL
--     nos novos movimentos (retirada/devolução informativos, nunca
--     dispara nada em os_parts, nunca debita automaticamente por criar
--     uma linha de peça na OS -- regra "os_parts != stock_movements"
--     preservada integralmente).
--
-- Estados de stock_balances usados: DISPONIVEL (já existia) e
-- QUARENTENA (já estava no CHECK desde EST-2A, nunca usado por nenhum
-- código até agora -- primeiro fluxo real que grava nesse estado).
-- EM_TRANSITO permanece só no CHECK, sem uso (transferência entre
-- locais fica fora deste pacote -- ver relatório final).
-- ============================================================

-- ---------- 1) Catálogo de permissões (mesmo catálogo único) ----------
create or replace function public.is_valid_permission_key(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key in (
    'os.view','os.create','os.edit','os.cancel','os.status','os.print','os.financial',
    'whirlpool.view','whirlpool.edit',
    'agenda.view_all','agenda.view_own','agenda.edit','agenda.drag','agenda.block',
    'financeiro.view','financeiro.edit','financeiro.export','financeiro.reverse',
    'estoque.view','estoque.edit','estoque.entrada','estoque.auditoria',
    'estoque.retirada','estoque.entrega_tecnico','estoque.devolucao','estoque.quarentena',
    'relatorios.view','relatorios.export',
    'config.view','config.users','config.companies'
  );
$$;
comment on function public.is_valid_permission_key is
  'Catálogo único de chaves de permissão válidas. estoque.retirada/estoque.entrega_tecnico/estoque.devolucao/estoque.quarentena adicionados em 2026-09-14 (pacote de conclusão do Estoque) -- mesmo catálogo único, nenhum novo.';

-- ---------- 2) movement_type: só os 4 tipos das operações reais deste pacote ----------
alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
  'ENTRADA','SAIDA','TRANSFERENCIA_TECNICO','RETORNO_TECNICO','USO_GARANTIA','BAIXA_FISCAL_GARANTIA','AJUSTE', -- legado, nunca usado
  'ENTRY', -- EST-2A
  'WITHDRAWAL','TECH_RETURN','APPLICATION','QUARANTINE_RELEASE' -- este pacote
));

-- Exatamente um destino por retirada (OS ou técnico -- "não tratar
-- essas duas opções como a mesma coisa", pedido explícito do usuário).
alter table public.stock_movements drop constraint if exists stock_movements_withdrawal_destination_check;
alter table public.stock_movements add constraint stock_movements_withdrawal_destination_check check (
  movement_type <> 'WITHDRAWAL' or (
    (service_order_id is not null and technician_id is null) or
    (service_order_id is null and technician_id is not null)
  )
);

-- ---------- 3) technician_stock: RLS endurecida (era "for ALL") ----------
drop policy if exists "technician_stock_company" on public.technician_stock;
create policy "technician_stock_select" on public.technician_stock for select to authenticated
  using (company_id = current_company_id());
comment on table public.technician_stock is
  'Projeção operacional de quanto cada técnico tem sob responsabilidade (analogia a stock_items.available_quantity) -- mantida só pelas RPCs stock_withdraw/stock_return/stock_apply (SECURITY DEFINER). RLS endurecida em 2026-09-14 (era "for ALL" permissiva pra authenticated, sem gate de papel nenhum) -- só SELECT direto.';

-- ---------- 4) stock_withdraw: retirada (uso em OS ou entrega ao técnico) ----------
create or replace function public.stock_withdraw(
  p_stock_item_id uuid,
  p_location_id uuid,
  p_position_code text,
  p_quantity numeric,
  p_destination text, -- 'OS' | 'TECNICO'
  p_service_order_id uuid default null,
  p_os_part_id uuid default null,
  p_technician_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns table(out_movement_id uuid, out_balance_id uuid, out_position_id uuid, out_new_quantity numeric, out_technician_new_quantity numeric)
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
  v_tech_new_qty numeric;
  v_existing record;
begin
  if p_destination not in ('OS','TECNICO') then
    raise exception 'Destino inválido -- use OS ou TECNICO.';
  end if;
  if p_destination = 'OS' and p_service_order_id is null then
    raise exception 'Informe a OS de destino.';
  end if;
  if p_destination = 'TECNICO' and p_technician_id is null then
    raise exception 'Informe o técnico de destino.';
  end if;

  if p_destination = 'OS' then
    if not (v_role in ('GESTOR','ESTOQUE') or public.current_user_has_permission('estoque.retirada')) then
      raise exception 'Sem permissão para retirar estoque para OS.';
    end if;
  else
    if not (v_role in ('GESTOR','ESTOQUE') or public.current_user_has_permission('estoque.entrega_tecnico')) then
      raise exception 'Sem permissão para entregar peça a técnico.';
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.stock_items where id = p_stock_item_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;
  if p_service_order_id is not null and not exists (select 1 from public.service_orders where id = p_service_order_id and company_id = v_company_id) then
    raise exception 'OS não encontrada nesta empresa.';
  end if;
  if p_technician_id is not null and not exists (select 1 from public.profiles where id = p_technician_id) then
    raise exception 'Técnico não encontrado.';
  end if;
  if p_position_code is null or btrim(p_position_code) = '' then
    raise exception 'Informe a posição.';
  end if;

  select id into v_position_id from public.stock_positions
    where location_id = p_location_id and upper(code) = upper(btrim(p_position_code)) and active;
  if v_position_id is null then
    raise exception 'Posição não encontrada neste local -- retirada só ocorre de uma posição que já tem saldo.';
  end if;

  if p_idempotency_key is not null then
    insert into public.stock_operations(company_id, idempotency_key, operation_id)
      values (v_company_id, p_idempotency_key, gen_random_uuid())
      on conflict (company_id, idempotency_key) do nothing;
    select operation_id into v_operation_id from public.stock_operations
      where company_id = v_company_id and idempotency_key = p_idempotency_key
      for update;

    select m.id, m.item_id, m.location_id, m.position_id, m.quantity, m.service_order_id, m.technician_id
      into v_existing
      from public.stock_movements m
      where m.operation_id = v_operation_id and m.movement_type = 'WITHDRAWAL'
      limit 1;

    if found then
      if v_existing.item_id <> p_stock_item_id or v_existing.location_id <> p_location_id
         or v_existing.position_id <> v_position_id or v_existing.quantity <> p_quantity
         or coalesce(v_existing.service_order_id::text,'') <> coalesce(p_service_order_id::text,'')
         or coalesce(v_existing.technician_id::text,'') <> coalesce(p_technician_id::text,'') then
        raise exception 'idempotency_key já usada para uma retirada diferente.';
      end if;
      select sb.id, sb.quantity into v_balance_id, v_new_qty from public.stock_balances sb
        where sb.stock_item_id = p_stock_item_id and sb.location_id = p_location_id
          and sb.position_id = v_position_id and sb.state = 'DISPONIVEL';
      if p_technician_id is not null then
        select quantity into v_tech_new_qty from public.technician_stock
          where technician_id = p_technician_id and stock_item_id = p_stock_item_id;
      end if;
      return query select v_existing.id, v_balance_id, v_position_id, v_new_qty, v_tech_new_qty;
      return;
    end if;
  else
    v_operation_id := gen_random_uuid();
  end if;

  select id into v_balance_id from public.stock_balances
    where company_id = v_company_id and stock_item_id = p_stock_item_id and location_id = p_location_id
      and position_id = v_position_id and state = 'DISPONIVEL'
    for update;
  if v_balance_id is null or (select quantity from public.stock_balances where id = v_balance_id) < p_quantity then
    raise exception 'Saldo insuficiente nesta posição para retirar %.', p_quantity;
  end if;

  update public.stock_balances set quantity = quantity - p_quantity, updated_at = now()
    where id = v_balance_id
    returning quantity into v_new_qty;

  insert into public.stock_movements(
    item_id, movement_type, quantity, location_id, position_id,
    service_order_id, os_part_id, technician_id,
    operation_id, idempotency_key, notes, created_by
  ) values (
    p_stock_item_id, 'WITHDRAWAL', p_quantity, p_location_id, v_position_id,
    p_service_order_id, p_os_part_id, p_technician_id,
    v_operation_id, p_idempotency_key, p_notes, auth.uid()
  ) returning id into v_movement_id;

  if p_technician_id is not null then
    insert into public.technician_stock(technician_id, stock_item_id, quantity, company_id)
      values (p_technician_id, p_stock_item_id, 0, v_company_id)
      on conflict (technician_id, stock_item_id) do nothing;
    update public.technician_stock set quantity = quantity + p_quantity, updated_at = now()
      where technician_id = p_technician_id and stock_item_id = p_stock_item_id
      returning quantity into v_tech_new_qty;
  end if;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'ESTOQUE', 'RETIRAR', 'STOCK_MOVEMENT', v_movement_id,
    jsonb_build_object('stock_item_id', p_stock_item_id, 'quantity', p_quantity, 'destination', p_destination,
      'service_order_id', p_service_order_id, 'technician_id', p_technician_id, 'new_balance', v_new_qty));

  return query select v_movement_id, v_balance_id, v_position_id, v_new_qty, v_tech_new_qty;
end;
$$;
comment on function public.stock_withdraw is
  'Retirada física -- destino OS (uso em uma ordem de serviço) ou TECNICO (entrega/custódia). Decrementa stock_balances da posição informada; se destino=TECNICO, também incrementa a projeção technician_stock. Nunca aplica/consome sozinha -- consumo real é stock_apply(). Idempotente, trava a dimensão física, impede saldo negativo, auditável.';
revoke execute on function public.stock_withdraw(uuid, uuid, text, numeric, text, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.stock_withdraw(uuid, uuid, text, numeric, text, uuid, uuid, uuid, text, text) to authenticated;

-- ---------- 5) stock_return: devolução (nunca apaga a saída) ----------
create or replace function public.stock_return(
  p_movement_id uuid, -- a retirada (WITHDRAWAL) sendo compensada
  p_quantity numeric,
  p_condition text default 'DISPONIVEL', -- 'DISPONIVEL' | 'QUARENTENA'
  p_notes text default null,
  p_idempotency_key text default null
)
returns table(out_movement_id uuid, out_balance_id uuid, out_new_quantity numeric, out_technician_new_quantity numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_role text := current_company_role();
  v_original record;
  v_already_returned numeric;
  v_operation_id uuid;
  v_balance_id uuid;
  v_new_qty numeric;
  v_tech_new_qty numeric;
  v_movement_id uuid;
  v_existing record;
begin
  if not (v_role in ('GESTOR','ESTOQUE') or public.current_user_has_permission('estoque.devolucao')) then
    raise exception 'Sem permissão para devolver estoque.';
  end if;
  if p_condition not in ('DISPONIVEL','QUARENTENA') then
    raise exception 'Condição inválida -- use DISPONIVEL ou QUARENTENA.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select m.*, si.company_id as item_company_id into v_original
    from public.stock_movements m
    join public.stock_items si on si.id = m.item_id
    where m.id = p_movement_id and m.movement_type = 'WITHDRAWAL' and si.company_id = v_company_id;
  if v_original.id is null then
    raise exception 'Retirada original não encontrada nesta empresa.';
  end if;

  select coalesce(sum(quantity), 0) into v_already_returned
    from public.stock_movements
    where compensates_movement_id = p_movement_id and movement_type = 'TECH_RETURN';
  if p_quantity > (v_original.quantity - v_already_returned) then
    raise exception 'Quantidade a devolver (%) maior que o disponível pra devolução (%).', p_quantity, (v_original.quantity - v_already_returned);
  end if;

  if p_idempotency_key is not null then
    insert into public.stock_operations(company_id, idempotency_key, operation_id)
      values (v_company_id, p_idempotency_key, gen_random_uuid())
      on conflict (company_id, idempotency_key) do nothing;
    select operation_id into v_operation_id from public.stock_operations
      where company_id = v_company_id and idempotency_key = p_idempotency_key for update;
    select m.id, m.quantity, m.compensates_movement_id into v_existing
      from public.stock_movements m
      where m.operation_id = v_operation_id and m.movement_type = 'TECH_RETURN' limit 1;
    if found then
      if v_existing.compensates_movement_id <> p_movement_id or v_existing.quantity <> p_quantity then
        raise exception 'idempotency_key já usada para uma devolução diferente.';
      end if;
      select id, quantity into v_balance_id, v_new_qty from public.stock_balances
        where stock_item_id = v_original.item_id and location_id = v_original.location_id
          and position_id = v_original.position_id and state = p_condition;
      if v_original.technician_id is not null then
        select quantity into v_tech_new_qty from public.technician_stock
          where technician_id = v_original.technician_id and stock_item_id = v_original.item_id;
      end if;
      return query select v_existing.id, v_balance_id, v_new_qty, v_tech_new_qty;
      return;
    end if;
  else
    v_operation_id := gen_random_uuid();
  end if;

  -- Devolução de retirada ENTREGUE A TÉCNICO precisa debitar a
  -- responsabilidade do técnico (impede saldo negativo dele também) --
  -- retirada USADA EM OS (sem técnico) não tem responsabilidade de
  -- técnico pra debitar, só devolve pro saldo físico do local.
  if v_original.technician_id is not null then
    update public.technician_stock set quantity = quantity - p_quantity, updated_at = now()
      where technician_id = v_original.technician_id and stock_item_id = v_original.item_id
        and quantity >= p_quantity
      returning quantity into v_tech_new_qty;
    if not found then
      raise exception 'Saldo insuficiente com o técnico para devolver essa quantidade.';
    end if;
  end if;

  insert into public.stock_balances(company_id, stock_item_id, location_id, position_id, state, quantity)
    values (v_company_id, v_original.item_id, v_original.location_id, v_original.position_id, p_condition, 0)
    on conflict (company_id, stock_item_id, location_id, position_id, state) do nothing;
  select id into v_balance_id from public.stock_balances
    where company_id = v_company_id and stock_item_id = v_original.item_id and location_id = v_original.location_id
      and position_id = v_original.position_id and state = p_condition
    for update;
  update public.stock_balances set quantity = quantity + p_quantity, updated_at = now()
    where id = v_balance_id returning quantity into v_new_qty;

  insert into public.stock_movements(
    item_id, movement_type, quantity, location_id, position_id, technician_id,
    compensates_movement_id, operation_id, idempotency_key, notes, created_by
  ) values (
    v_original.item_id, 'TECH_RETURN', p_quantity, v_original.location_id, v_original.position_id, v_original.technician_id,
    p_movement_id, v_operation_id, p_idempotency_key, coalesce(p_notes, 'NÃO UTILIZADA'), auth.uid()
  ) returning id into v_movement_id;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'ESTOQUE', 'DEVOLVER', 'STOCK_MOVEMENT', v_movement_id,
    jsonb_build_object('compensates_movement_id', p_movement_id, 'quantity', p_quantity, 'condition', p_condition, 'new_balance', v_new_qty));

  return query select v_movement_id, v_balance_id, v_new_qty, v_tech_new_qty;
end;
$$;
comment on function public.stock_return is
  'Devolução ao estoque de uma retirada (WITHDRAWAL) anterior -- NUNCA apaga a saída original, cria um movimento TECH_RETURN vinculado por compensates_movement_id. condition=QUARENTENA credita o saldo em estado QUARENTENA em vez de DISPONIVEL (peça com avaria/dúvida). Se a retirada original era de técnico, debita technician_stock. Idempotente, auditável.';
revoke execute on function public.stock_return(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.stock_return(uuid, numeric, text, text, text) to authenticated;

-- ---------- 6) stock_apply: consumo pelo técnico (nunca debita a loja de novo) ----------
create or replace function public.stock_apply(
  p_technician_id uuid,
  p_stock_item_id uuid,
  p_quantity numeric,
  p_service_order_id uuid,
  p_os_part_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns table(out_movement_id uuid, out_technician_new_quantity numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_role text := current_company_role();
  v_operation_id uuid;
  v_movement_id uuid;
  v_new_qty numeric;
  v_existing record;
begin
  -- O próprio técnico pode aplicar peça sob a própria responsabilidade;
  -- gestor/estoque podem aplicar em nome de qualquer técnico (ex.:
  -- lançamento retroativo). Nunca um técnico aplicando peça de OUTRO.
  if not (auth.uid() = p_technician_id or v_role in ('GESTOR','ESTOQUE') or public.current_user_has_permission('estoque.entrega_tecnico')) then
    raise exception 'Sem permissão para aplicar peça em nome deste técnico.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.service_orders where id = p_service_order_id and company_id = v_company_id) then
    raise exception 'OS não encontrada nesta empresa.';
  end if;

  if p_idempotency_key is not null then
    insert into public.stock_operations(company_id, idempotency_key, operation_id)
      values (v_company_id, p_idempotency_key, gen_random_uuid())
      on conflict (company_id, idempotency_key) do nothing;
    select operation_id into v_operation_id from public.stock_operations
      where company_id = v_company_id and idempotency_key = p_idempotency_key for update;
    select m.id, m.quantity into v_existing from public.stock_movements m
      where m.operation_id = v_operation_id and m.movement_type = 'APPLICATION' limit 1;
    if found then
      if v_existing.quantity <> p_quantity then
        raise exception 'idempotency_key já usada para uma aplicação diferente.';
      end if;
      select quantity into v_new_qty from public.technician_stock
        where technician_id = p_technician_id and stock_item_id = p_stock_item_id;
      return query select v_existing.id, v_new_qty;
      return;
    end if;
  else
    v_operation_id := gen_random_uuid();
  end if;

  update public.technician_stock set quantity = quantity - p_quantity, updated_at = now()
    where technician_id = p_technician_id and stock_item_id = p_stock_item_id and quantity >= p_quantity
    returning quantity into v_new_qty;
  if not found then
    raise exception 'Saldo insuficiente sob a responsabilidade do técnico pra aplicar essa quantidade.';
  end if;

  insert into public.stock_movements(
    item_id, movement_type, quantity, technician_id, service_order_id, os_part_id,
    operation_id, idempotency_key, notes, created_by
  ) values (
    p_stock_item_id, 'APPLICATION', p_quantity, p_technician_id, p_service_order_id, p_os_part_id,
    v_operation_id, p_idempotency_key, p_notes, auth.uid()
  ) returning id into v_movement_id;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'ESTOQUE', 'APLICAR', 'STOCK_MOVEMENT', v_movement_id,
    jsonb_build_object('technician_id', p_technician_id, 'stock_item_id', p_stock_item_id, 'quantity', p_quantity, 'service_order_id', p_service_order_id));

  return query select v_movement_id, v_new_qty;
end;
$$;
comment on function public.stock_apply is
  'Consumo/aplicação de uma peça sob responsabilidade do técnico numa OS -- debita SÓ technician_stock (a peça já saiu fisicamente da loja quando foi entregue via stock_withdraw destino=TECNICO), nunca stock_balances de novo (impede dupla saída). Idempotente, auditável.';
revoke execute on function public.stock_apply(uuid, uuid, numeric, uuid, uuid, text, text) from public, anon;
grant execute on function public.stock_apply(uuid, uuid, numeric, uuid, uuid, text, text) to authenticated;

-- ---------- 7) stock_release_quarantine: libera pra disponível ----------
create or replace function public.stock_release_quarantine(
  p_balance_id uuid,
  p_quantity numeric,
  p_notes text default null,
  p_idempotency_key text default null
)
returns table(out_movement_id uuid, out_quarantine_new_quantity numeric, out_available_new_quantity numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_role text := current_company_role();
  v_bal record;
  v_operation_id uuid;
  v_available_id uuid;
  v_qtn_new numeric;
  v_avail_new numeric;
  v_movement_id uuid;
  v_existing record;
begin
  if not (v_role in ('GESTOR','ESTOQUE') or public.current_user_has_permission('estoque.quarentena')) then
    raise exception 'Sem permissão para liberar quarentena.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_bal from public.stock_balances
    where id = p_balance_id and company_id = v_company_id and state = 'QUARENTENA';
  if v_bal.id is null then
    raise exception 'Saldo em quarentena não encontrado nesta empresa.';
  end if;

  if p_idempotency_key is not null then
    insert into public.stock_operations(company_id, idempotency_key, operation_id)
      values (v_company_id, p_idempotency_key, gen_random_uuid())
      on conflict (company_id, idempotency_key) do nothing;
    select operation_id into v_operation_id from public.stock_operations
      where company_id = v_company_id and idempotency_key = p_idempotency_key for update;
    select m.id, m.quantity into v_existing from public.stock_movements m
      where m.operation_id = v_operation_id and m.movement_type = 'QUARANTINE_RELEASE' limit 1;
    if found then
      if v_existing.quantity <> p_quantity then
        raise exception 'idempotency_key já usada para uma liberação diferente.';
      end if;
      select quantity into v_qtn_new from public.stock_balances where id = p_balance_id;
      select quantity into v_avail_new from public.stock_balances
        where stock_item_id = v_bal.stock_item_id and location_id = v_bal.location_id
          and position_id = v_bal.position_id and state = 'DISPONIVEL';
      return query select v_existing.id, v_qtn_new, v_avail_new;
      return;
    end if;
  else
    v_operation_id := gen_random_uuid();
  end if;

  update public.stock_balances set quantity = quantity - p_quantity, updated_at = now()
    where id = p_balance_id and quantity >= p_quantity
    returning quantity into v_qtn_new;
  if not found then
    raise exception 'Saldo em quarentena insuficiente pra liberar essa quantidade.';
  end if;

  insert into public.stock_balances(company_id, stock_item_id, location_id, position_id, state, quantity)
    values (v_company_id, v_bal.stock_item_id, v_bal.location_id, v_bal.position_id, 'DISPONIVEL', 0)
    on conflict (company_id, stock_item_id, location_id, position_id, state) do nothing;
  select id into v_available_id from public.stock_balances
    where company_id = v_company_id and stock_item_id = v_bal.stock_item_id and location_id = v_bal.location_id
      and position_id = v_bal.position_id and state = 'DISPONIVEL'
    for update;
  update public.stock_balances set quantity = quantity + p_quantity, updated_at = now()
    where id = v_available_id returning quantity into v_avail_new;

  insert into public.stock_movements(
    item_id, movement_type, quantity, location_id, position_id,
    operation_id, idempotency_key, notes, created_by
  ) values (
    v_bal.stock_item_id, 'QUARANTINE_RELEASE', p_quantity, v_bal.location_id, v_bal.position_id,
    v_operation_id, p_idempotency_key, p_notes, auth.uid()
  ) returning id into v_movement_id;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'ESTOQUE', 'LIBERAR_QUARENTENA', 'STOCK_MOVEMENT', v_movement_id,
    jsonb_build_object('balance_id', p_balance_id, 'quantity', p_quantity, 'new_available', v_avail_new));

  return query select v_movement_id, v_qtn_new, v_avail_new;
end;
$$;
comment on function public.stock_release_quarantine is
  'Libera quantidade de um saldo em QUARENTENA de volta pra DISPONIVEL na mesma posição -- movimento QUARANTINE_RELEASE auditável, idempotente. Baixa como perda fica fora deste pacote (ver relatório final).';
revoke execute on function public.stock_release_quarantine(uuid, numeric, text, text) from public, anon;
grant execute on function public.stock_release_quarantine(uuid, numeric, text, text) to authenticated;
