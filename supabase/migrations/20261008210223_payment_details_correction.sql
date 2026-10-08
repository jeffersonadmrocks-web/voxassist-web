create or replace function public.correct_payment_details(
  p_payment_id uuid,
  p_new_method text,
  p_reason text,
  p_idempotency_key text default null,
  p_new_paid_at timestamptz default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := current_company_role();
  v_company_id uuid := current_company_id();
  v_original public.payments;
  v_new public.payments;
  v_reversal public.payments;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing_new_id uuid;
  v_existing_original_id uuid;
  v_new_method text := btrim(coalesce(p_new_method, ''));
begin
  if auth.uid() is null or v_company_id is null or v_role is distinct from 'GESTOR' then
    raise exception 'Somente o GESTOR pode corrigir a forma de um recebimento.';
  end if;
  if p_new_paid_at is not null and not isfinite(p_new_paid_at) then
    raise exception 'Informe uma data válida.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Motivo da correção é obrigatório.';
  end if;
  if v_new_method = '' then
    raise exception 'Informe a nova forma de pagamento.';
  end if;

  -- idempotência: resolve/reserva ANTES de tocar em payments, com
  -- lock de linha -- segunda chamada com a mesma chave (clique
  -- duplo/retry de rede) devolve o mesmo resultado em vez de
  -- duplicar ou estourar em "já foi corrigido".
  if v_key is not null then
    insert into public.payment_corrections (company_id, idempotency_key, original_payment_id)
    values (v_company_id, v_key, p_payment_id)
    on conflict (company_id, idempotency_key) do nothing;

    select new_payment_id, original_payment_id into v_existing_new_id, v_existing_original_id
      from public.payment_corrections
      where company_id = v_company_id and idempotency_key = v_key
      for update;

    if v_existing_original_id is distinct from p_payment_id then
      raise exception 'Chave de correção pertence a outro pagamento.';
    end if;
    if v_existing_new_id is not null then
      select * into v_new from public.payments where id = v_existing_new_id;
      return v_new;
    end if;
  end if;

  select * into v_original from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_original.company_id is distinct from v_company_id then
    raise exception 'Pagamento não pertence à empresa ativa.';
  end if;
  if v_original.is_correction_internal then
    raise exception 'Este lançamento é interno de uma correção -- não pode ser corrigido diretamente.';
  end if;
  if v_original.superseded_by_payment_id is not null then
    raise exception 'Este recebimento já foi corrigido anteriormente.';
  end if;
  if v_original.reversal_of_payment_id is not null then
    raise exception 'Não é possível corrigir a forma de um estorno.';
  end if;
  if v_original.reversal_state is not null then
    raise exception 'Este recebimento já foi estornado (total ou parcialmente) -- corrija pelo fluxo de estorno.';
  end if;
  if upper(coalesce(v_original.status, '')) <> 'RECEBIDO' then
    raise exception 'Somente um recebimento confirmado pode ter a forma corrigida.';
  end if;
  if upper(coalesce(v_original.method, '')) = upper(v_new_method)
    and coalesce(p_new_paid_at, v_original.paid_at) is not distinct from v_original.paid_at then
    raise exception 'Altere a forma ou a data do pagamento.';
  end if;
  if not exists (
    select 1 from public.payment_methods
    where company_id = v_company_id and active and upper(name) = upper(v_new_method)
  ) then
    raise exception 'Forma de pagamento inválida ou inativa: %', v_new_method;
  end if;

  -- 1) estorno interno -- zera a linha original (nova linha
  -- negativa vinculada via reversal_of_payment_id, nunca UPDATE do
  -- valor/forma original). is_correction_internal=true -- nunca
  -- aparece em payments_operational.
  insert into public.payments (
    service_order_id, company_id, amount, method, status, paid_at,
    installments, notes, created_by, operation_id,
    reversal_of_payment_id, reversal_reason, is_correction_internal
  ) values (
    v_original.service_order_id, v_company_id, -v_original.amount, v_original.method, 'ESTORNO', now(),
    1, p_reason, auth.uid(), v_original.operation_id,
    v_original.id, p_reason, true
  ) returning * into v_reversal;

  -- 2) novo recebimento vigente com forma/data corrigidas. Preserva
  -- created_by (quem de fato recebeu o
  -- dinheiro -- a correção de forma não muda isso; quem AUTORIZOU a
  -- correção fica em correction_by). Vínculo de correção gravado
  -- direto no INSERT -- nunca por UPDATE posterior.
  insert into public.payments (
    service_order_id, company_id, amount, method, status, paid_at,
    installments, notes, created_by, operation_id,
    correction_of_payment_id, correction_reason, correction_by, correction_at
  ) values (
    v_original.service_order_id, v_company_id, v_original.amount, v_new_method, 'RECEBIDO', coalesce(p_new_paid_at, v_original.paid_at),
    v_original.installments, v_original.notes, v_original.created_by, v_original.operation_id,
    v_original.id, p_reason, auth.uid(), now()
  ) returning * into v_new;

  -- único UPDATE na linha confirmada original -- superseded_by_payment_id
  -- fica fora da lista travada por payments_lock_confirmed_fields,
  -- mesmo padrão já usado por reversal_state (reverse_payment).
  update public.payments
    set reversal_state = 'TOTAL', superseded_by_payment_id = v_new.id
    where id = v_original.id;

  if v_key is not null then
    update public.payment_corrections set new_payment_id = v_new.id
      where company_id = v_company_id and idempotency_key = v_key;
  end if;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), v_company_id, 'FINANCEIRO', 'CORRIGIR_DADOS_PAGAMENTO', 'PAYMENT', v_original.id,
    jsonb_build_object('method', v_original.method, 'amount', v_original.amount, 'paid_at', v_original.paid_at),
    jsonb_build_object('new_payment_id', v_new.id, 'method', v_new.method, 'reason', p_reason, 'paid_at', v_new.paid_at));

  return v_new;
end;
$$;


revoke all on function public.correct_payment_details(uuid,text,text,text,timestamptz) from public, anon;
grant execute on function public.correct_payment_details(uuid,text,text,text,timestamptz) to authenticated;
