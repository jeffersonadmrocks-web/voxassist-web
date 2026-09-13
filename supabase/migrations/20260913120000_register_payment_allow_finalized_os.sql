-- ============================================================
-- Financeiro (fase 3) -- correção de regra de negócio em register_payment.
--
-- EVIDÊNCIA DA NECESSIDADE (decisão do usuário, 2026-09-13): a versão
-- aplicada de register_payment (migration 20260913100000, já
-- homologada no banco real) reutilizava a mesma regra de
-- "OS finalizada só pode ser alterada pelo GESTOR" (migration
-- 20260907060000) tanto pra CRIAR um recebimento novo quanto pra
-- QUALQUER outra escrita na OS. Isso bloqueava um ATENDENTE (ou
-- qualquer papel com financeiro.edit) de registrar um recebimento
-- legítimo numa OS já finalizada -- cenário real: cliente paga o
-- saldo alguns dias depois da entrega, ou um recebimento é lançado em
-- atraso.
--
-- Regra de negócio corrigida (explícita do usuário): "uma OS pode
-- receber pagamento antes, durante ou depois de sua conclusão, desde
-- que o usuário tenha permissão para registrar recebimentos". Registrar
-- um pagamento NOVO é criação de dado, não alteração de histórico --
-- diferente de reverse_payment (estornar) ou de editar/excluir peças/
-- valores já lançados, que continuam exigindo GESTOR numa OS
-- finalizada (migrations 20260907060000/20260913100000, INTOCADAS
-- aqui). Corrigido removendo especificamente essa checagem de
-- register_payment -- toda a validação de empresa/OS/forma/permissão
-- (financeiro.edit) continua exatamente igual.
-- ============================================================

create or replace function public.register_payment(
  p_service_order_id uuid,
  p_components jsonb,
  p_notes text default null,
  p_due_date date default null,
  p_paid_at timestamptz default null,
  p_installments integer default 1,
  p_idempotency_key text default null
)
returns setof public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_role text := current_company_role();
  v_operation_id uuid;
  v_component jsonb;
  v_method text;
  v_amount numeric;
begin
  if not (v_role <> 'TECNICO' or public.current_user_has_permission('financeiro.edit')) then
    raise exception 'Sem permissão para registrar recebimentos.';
  end if;

  if p_service_order_id is not null then
    if not exists (select 1 from public.service_orders where id = p_service_order_id and company_id = v_company_id) then
      raise exception 'OS não encontrada nesta empresa.';
    end if;
    -- Removido: bloqueio de "OS finalizada só GESTOR" pra CRIAÇÃO de
    -- recebimento -- ver evidência no cabeçalho desta migration.
    -- Continua valendo pra reverse_payment (estornar É alterar
    -- histórico) e pra qualquer edição de peças/orçamento (RLS
    -- restritiva original, migration 20260907060000, intocada).
  end if;

  if jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento.';
  end if;

  if p_idempotency_key is not null then
    insert into public.payment_operations (company_id, idempotency_key, operation_id)
    values (v_company_id, p_idempotency_key, gen_random_uuid())
    on conflict (company_id, idempotency_key) do nothing;

    select operation_id into v_operation_id
      from public.payment_operations
      where company_id = v_company_id and idempotency_key = p_idempotency_key
      for update;

    if exists (select 1 from public.payments where operation_id = v_operation_id) then
      return query select * from public.payments where operation_id = v_operation_id order by created_at;
      return;
    end if;
  else
    v_operation_id := gen_random_uuid();
  end if;

  for v_component in select * from jsonb_array_elements(p_components) loop
    v_method := v_component->>'method';
    v_amount := nullif(v_component->>'amount','')::numeric;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Valor inválido para a forma %', coalesce(v_method,'(?)');
    end if;
    if v_method is null or not exists (
      select 1 from public.payment_methods
      where company_id = v_company_id and active and upper(name) = upper(v_method)
    ) then
      raise exception 'Forma de pagamento inválida ou inativa: %', coalesce(v_method,'(?)');
    end if;
  end loop;

  return query
    insert into public.payments (
      service_order_id, company_id, amount, method, status, due_date, paid_at,
      installments, notes, created_by, operation_id, idempotency_key
    )
    select
      p_service_order_id, v_company_id,
      (c->>'amount')::numeric, c->>'method',
      case when pm.is_discount then 'DESCONTO' else 'RECEBIDO' end,
      p_due_date, coalesce(p_paid_at, now()),
      greatest(1, coalesce(p_installments,1)), p_notes, auth.uid(), v_operation_id, p_idempotency_key
    from jsonb_array_elements(p_components) c
    join public.payment_methods pm
      on pm.company_id = v_company_id and pm.active and upper(pm.name) = upper(c->>'method')
    returning *;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  select auth.uid(), v_company_id, 'FINANCEIRO', 'REGISTRAR_RECEBIMENTO', 'PAYMENT', p.id,
    jsonb_build_object('amount', p.amount, 'method', p.method, 'status', p.status, 'service_order_id', p.service_order_id, 'operation_id', p.operation_id)
  from public.payments p where p.operation_id = v_operation_id;
end;
$$;
