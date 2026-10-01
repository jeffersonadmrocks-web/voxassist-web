-- ============================================================
-- Venda de Peças (achado do usuário, 2026-10-01): o card "VENDA DE
-- PEÇAS" (Atendimento e Loja) apontava pro mesmo destino do catálogo/
-- cadastro de peças (estoque-operacional) -- não existia NENHUMA
-- transação de venda de verdade: o cadastro só define a IDENTIDADE da
-- peça (código/descrição/fabricante), nunca uma quantidade vendida nem
-- um valor cobrado do cliente. "Venda rápida e vínculo opcional à OS"
-- (texto do próprio card) nunca tinha sido implementada.
--
-- Decisão do usuário: venda balcão (cliente avulso, sem OS obrigatória,
-- mas com vínculo opcional a uma OS existente) que baixa o estoque E
-- registra o recebimento no mesmo movimento atômico -- nunca uma venda
-- "fantasma" sem dinheiro, nem dinheiro sem baixa de estoque.
--
-- Reaproveita TUDO que já existe, zero duplicação:
--   - stock_balances/stock_positions (EST-2A) pra decrementar o saldo
--     físico, EXATAMENTE a mesma mecânica de stock_withdraw (migration
--     20260914030000) -- só um movement_type novo (SALE), nunca reusa
--     WITHDRAWAL (que exige EXATAMENTE um entre OS/técnico por decisão
--     explícita do usuário em 2026-09-14 -- "não tratar essas duas
--     opções como a mesma coisa"; venda balcão não é nem OS nem técnico,
--     então precisa do seu PRÓPRIO tipo, nunca forçado num dos dois).
--   - register_payment (migration 20260913120000) pra gravar o
--     recebimento de verdade -- chamado de DENTRO desta função (nunca
--     duplica a validação de empresa/OS/forma/permissão que já existe
--     lá). p_service_order_id pode ser null (recebimento avulso, mesmo
--     suporte que RECEBIMENTO AVULSO do Financeiro já usa desde
--     20260913080000).
-- ============================================================

-- unit_sale_price só é preenchido em movimentos SALE -- nulo em todos
-- os outros tipos (ENTRY/WITHDRAWAL/TECH_RETURN/APPLICATION/
-- QUARANTINE_RELEASE), que nunca tiveram preço de venda nenhum.
alter table public.stock_movements add column if not exists unit_sale_price numeric;

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
  'ENTRADA','SAIDA','TRANSFERENCIA_TECNICO','RETORNO_TECNICO','USO_GARANTIA','BAIXA_FISCAL_GARANTIA','AJUSTE', -- legado, nunca usado
  'ENTRY','WITHDRAWAL','TECH_RETURN','APPLICATION','QUARANTINE_RELEASE', -- pacotes anteriores
  'SALE' -- este pacote
));

-- Catálogo único de permissões (mesmo catálogo de sempre -- só
-- acrescenta a chave nova, nunca duplica o catálogo em outro lugar).
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
    'estoque.venda',
    'relatorios.view','relatorios.export',
    'config.view','config.users','config.companies'
  );
$$;
comment on function public.is_valid_permission_key is
  'Catálogo único de chaves de permissão válidas. estoque.venda adicionado em 2026-10-01 (Venda de Peças balcão) -- mesmo catálogo único, nenhum novo.';

create or replace function public.stock_sell_part(
  p_stock_item_id uuid,
  p_location_id uuid,
  p_position_code text,
  p_quantity numeric,
  p_unit_sale_price numeric,
  p_payment_components jsonb, -- mesmo formato de register_payment: [{method, amount}]
  p_service_order_id uuid default null, -- vínculo OPCIONAL (venda balcão não exige OS)
  p_notes text default null,
  p_idempotency_key text default null
)
returns table(out_movement_id uuid, out_new_quantity numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_role text := current_company_role();
  v_position_id uuid;
  v_balance_id uuid;
  v_new_qty numeric;
  v_movement_id uuid;
  v_operation_id uuid;
  v_existing record;
  v_total numeric;
  v_components_sum numeric;
  v_item_label text;
begin
  if not (v_role in ('GESTOR','ESTOQUE') or public.current_user_has_permission('estoque.venda')) then
    raise exception 'Sem permissão para vender peças do estoque.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_unit_sale_price is null or p_unit_sale_price < 0 then
    raise exception 'Informe um valor de venda válido.';
  end if;

  select (coalesce(code,'') || ' — ' || coalesce(description,'')) into v_item_label
    from public.stock_items where id = p_stock_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;
  if p_service_order_id is not null and not exists (select 1 from public.service_orders where id = p_service_order_id and company_id = v_company_id) then
    raise exception 'OS não encontrada nesta empresa.';
  end if;
  if p_position_code is null or btrim(p_position_code) = '' then
    raise exception 'Informe a posição.';
  end if;
  if jsonb_typeof(p_payment_components) is distinct from 'array' or jsonb_array_length(p_payment_components) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento.';
  end if;

  v_total := round(p_quantity * p_unit_sale_price, 2);
  select coalesce(sum((c->>'amount')::numeric), 0) into v_components_sum from jsonb_array_elements(p_payment_components) c;
  if abs(v_components_sum - v_total) > 0.01 then
    raise exception 'A soma das formas de pagamento (%) não bate com o total da venda (%).', v_components_sum, v_total;
  end if;

  select id into v_position_id from public.stock_positions
    where location_id = p_location_id and upper(code) = upper(btrim(p_position_code)) and active;
  if v_position_id is null then
    raise exception 'Posição não encontrada neste local -- venda só ocorre de uma posição que já tem saldo.';
  end if;

  if p_idempotency_key is not null then
    insert into public.stock_operations(company_id, idempotency_key, operation_id)
      values (v_company_id, p_idempotency_key, gen_random_uuid())
      on conflict (company_id, idempotency_key) do nothing;
    select operation_id into v_operation_id from public.stock_operations
      where company_id = v_company_id and idempotency_key = p_idempotency_key
      for update;
    select m.id, m.quantity into v_existing from public.stock_movements m
      where m.operation_id = v_operation_id and m.movement_type = 'SALE' limit 1;
    if found then
      select sb.quantity into v_new_qty from public.stock_balances sb
        where sb.stock_item_id = p_stock_item_id and sb.location_id = p_location_id
          and sb.position_id = v_position_id and sb.state = 'DISPONIVEL';
      return query select v_existing.id, v_new_qty;
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
    raise exception 'Saldo insuficiente nesta posição para vender %.', p_quantity;
  end if;

  update public.stock_balances set quantity = quantity - p_quantity, updated_at = now()
    where id = v_balance_id
    returning quantity into v_new_qty;

  insert into public.stock_movements(
    item_id, movement_type, quantity, location_id, position_id,
    service_order_id, unit_sale_price,
    operation_id, idempotency_key, notes, created_by
  ) values (
    p_stock_item_id, 'SALE', p_quantity, p_location_id, v_position_id,
    p_service_order_id, p_unit_sale_price,
    v_operation_id, p_idempotency_key, coalesce(p_notes, 'Venda de peça avulsa'), auth.uid()
  ) returning id into v_movement_id;

  -- register_payment já valida empresa/OS/forma/permissão sozinha --
  -- nunca duplicado aqui. Mesma idempotency_key cobre as duas tabelas
  -- (payment_operations e stock_operations têm escopo próprio, nunca
  -- colidem) -- um retry de rede reaproveita os dois lados juntos.
  -- Se esta chamada falhar (forma inválida, etc.), a transação INTEIRA
  -- desta função desfaz -- balanço e movimento SALE acima incluídos --
  -- nunca uma baixa de estoque sem o dinheiro correspondente.
  perform public.register_payment(
    p_service_order_id, p_payment_components,
    coalesce(p_notes, 'Venda de peça avulsa — ' || v_item_label),
    null, now(), 1, p_idempotency_key
  );

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'ESTOQUE', 'VENDER', 'STOCK_MOVEMENT', v_movement_id,
    jsonb_build_object('stock_item_id', p_stock_item_id, 'quantity', p_quantity, 'unit_sale_price', p_unit_sale_price,
      'total', v_total, 'service_order_id', p_service_order_id, 'new_balance', v_new_qty));

  return query select v_movement_id, v_new_qty;
end;
$$;
comment on function public.stock_sell_part is
  'Venda balcão de peça avulsa (vínculo opcional a uma OS) -- decrementa stock_balances (mesma mecânica de stock_withdraw, movement_type próprio SALE) E registra o recebimento via register_payment, tudo numa única transação atômica: se o pagamento falhar, a baixa de estoque desfaz junto. Idempotente, auditável.';
revoke execute on function public.stock_sell_part(uuid, uuid, text, numeric, numeric, jsonb, uuid, text, text) from public, anon;
grant execute on function public.stock_sell_part(uuid, uuid, text, numeric, numeric, jsonb, uuid, text, text) to authenticated;
