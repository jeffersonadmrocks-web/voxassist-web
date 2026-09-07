-- ============================================================
-- Achado do usuário em 2026-09-07: a OS podia ir de "Pronto para
-- Entrega" pra "Finalizada" só com a data de entrega/saída registrada,
-- mesmo com valor lançado (peças+mão de obra+frete+material+laudo,
-- menos desconto do orçamento) sem NENHUMA forma de pagamento
-- correspondente lançada. Exemplo dado pelo usuário: OS com R$1.000,00
-- só pode finalizar depois de detalhar a forma de pagamento do total
-- (ex.: R$600 cartão + R$300 Pix + R$100 desconto) -- o desconto
-- concedido no fechamento fecha o saldo, mas NÃO deve somar como
-- receita nos relatórios (dashboard-canonical-v1.js/financePanel).
--
-- Mesma regra única de sempre (compute_next_service_order_status/
-- compute_missing_for_status, migrations 20260903010000/50000) --
-- só ganha 2 parâmetros novos (valor total completo e total já
-- alocado em pagamentos), sem duplicar a lógica em outro lugar.
-- ============================================================

drop function if exists public.compute_next_service_order_status(text,uuid,text,text,numeric,boolean,text,date,text,timestamptz,timestamptz,timestamptz);
drop function if exists public.compute_missing_for_status(text,uuid,text,text,numeric,boolean,text,date,text,timestamptz,timestamptz,timestamptz);

create or replace function public.compute_next_service_order_status(
  p_status text,
  p_technician_id uuid,
  p_diagnosed_defect text,
  p_technical_service text,
  p_budget_total numeric,
  p_has_parts boolean,
  p_approval_decision text,
  p_approval_date date,
  p_rejection_reason text,
  p_repair_started_at timestamptz,
  p_ready_at timestamptz,
  p_delivery_at timestamptz,
  p_full_budget_total numeric,
  p_paid_total numeric
) returns text
language sql
immutable
as $$
  select case p_status
    when 'AGUARDANDO ANALISE' then
      case when p_technician_id is not null
        and coalesce(trim(p_diagnosed_defect), '') <> ''
        and coalesce(trim(p_technical_service), '') <> ''
        and (coalesce(p_budget_total, 0) > 0 or coalesce(p_has_parts, false))
      then 'AGUARDANDO APROVACAO' end
    when 'AGUARDANDO APROVACAO' then
      case
        when p_approval_decision = 'APROVADO' and p_approval_date is not null then 'AGUARDANDO CONSERTO'
        when p_approval_decision = 'RECUSADO' and coalesce(trim(p_rejection_reason), '') <> '' and p_ready_at is not null
          then 'ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA'
        when p_approval_decision = 'RECUSADO' and coalesce(trim(p_rejection_reason), '') <> ''
          then 'ORCAMENTO RECUSADO'
        else null
      end
    when 'AGUARDANDO CONSERTO' then case when p_repair_started_at is not null then 'EM CONSERTO' end
    when 'EM CONSERTO' then case when p_ready_at is not null then 'PRONTO PARA ENTREGA' end
    -- Achado do usuário em 2026-09-07: só finaliza quando, além da
    -- entrega registrada, o valor total (peças+mão de obra+frete+
    -- material+laudo-desconto do orçamento) já está TODO alocado em
    -- pagamentos (qualquer forma, incluindo o método "DESCONTO"
    -- concedido no fechamento -- fecha o saldo, mas não é receita).
    when 'PRONTO PARA ENTREGA' then
      case when p_delivery_at is not null and coalesce(p_paid_total, 0) >= coalesce(p_full_budget_total, 0)
      then 'FINALIZADA' end
    -- Regra fundamental do usuário: nunca presumir a remontagem/preparo
    -- física concluída -- só avança quando ready_at (o mesmo evento
    -- "equipamento fisicamente pronto" do fluxo normal, reaproveitado
    -- aqui) é de fato registrado.
    when 'ORCAMENTO RECUSADO' then case when p_ready_at is not null then 'ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA' end
    when 'ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA' then case when p_delivery_at is not null then 'ORCAMENTO RECUSADO ENCERRADO' end
    else null
  end;
$$;
comment on function public.compute_next_service_order_status is
  'Regra única do ciclo automático de status da OS (achado 2026-09-03, gate de pagamento completo pra FINALIZADA achado 2026-09-07) -- pura, sem efeito colateral. Usada por advance_service_order_status() (grava) e por qualquer consulta de diagnóstico (não grava). Nunca duplicar esta lógica em outro lugar.';

create or replace function public.compute_missing_for_status(
  p_status text,
  p_technician_id uuid,
  p_diagnosed_defect text,
  p_technical_service text,
  p_budget_total numeric,
  p_has_parts boolean,
  p_approval_decision text,
  p_approval_date date,
  p_rejection_reason text,
  p_repair_started_at timestamptz,
  p_ready_at timestamptz,
  p_delivery_at timestamptz,
  p_full_budget_total numeric,
  p_paid_total numeric
) returns text[]
language sql
immutable
as $$
  select case p_status
    when 'AGUARDANDO ANALISE' then
      array_remove(array[
        case when p_technician_id is null then 'Técnico responsável' end,
        case when coalesce(trim(p_diagnosed_defect), '') = '' then 'Defeito constatado' end,
        case when coalesce(trim(p_technical_service), '') = '' then 'Serviço' end,
        case when coalesce(p_budget_total, 0) <= 0 and not coalesce(p_has_parts, false) then 'Valor do orçamento / peças' end
      ], null)
    when 'AGUARDANDO APROVACAO' then
      array_remove(array[
        case when coalesce(p_approval_decision, '') = '' then 'Decisão do orçamento (Aprovado ou Recusado)' end,
        case when p_approval_decision = 'APROVADO' and p_approval_date is null then 'Data da aprovação' end,
        case when p_approval_decision = 'RECUSADO' and coalesce(trim(p_rejection_reason), '') = '' then 'Motivo da recusa' end
      ], null)
    when 'AGUARDANDO CONSERTO' then
      array_remove(array[case when p_repair_started_at is null then 'Data/hora de início do conserto' end], null)
    when 'EM CONSERTO' then
      array_remove(array[case when p_ready_at is null then 'Data/hora de pronto' end], null)
    when 'PRONTO PARA ENTREGA' then
      array_remove(array[
        case when p_delivery_at is null then 'Data/hora de entrega/saída' end,
        case when p_delivery_at is not null and coalesce(p_paid_total, 0) < coalesce(p_full_budget_total, 0)
          then 'Forma de pagamento do valor total (faltam R$ ' || to_char(coalesce(p_full_budget_total,0) - coalesce(p_paid_total,0), 'FM999999990.00') || ')' end
      ], null)
    when 'ORCAMENTO RECUSADO' then
      array_remove(array[case when p_ready_at is null then 'Equipamento preparado/remontado (pronto para retirada)' end], null)
    when 'ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA' then
      array_remove(array[case when p_delivery_at is null then 'Data/hora de retirada pelo cliente' end], null)
    else '{}'::text[]
  end;
$$;
comment on function public.compute_missing_for_status is
  'Espelha 1:1 as condições de compute_next_service_order_status, só que devolvendo o que falta em vez de decidir o próximo status -- mesma regra, nunca duplicada, usada por advance_service_order_status para dar feedback de verdade quando não avança.';

create or replace function public.advance_service_order_status(p_service_order_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_order public.service_orders%rowtype;
  v_fin public.os_financial%rowtype;
  v_has_parts boolean;
  v_budget numeric;
  v_parts_total numeric;
  v_full_budget numeric;
  v_paid_total numeric;
  v_current text;
  v_next text;
  v_initial text;
  v_iterations int := 0;
  v_transitions jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_reason text;
  v_missing text[];
begin
  select * into v_order from public.service_orders where id = p_service_order_id for update;
  if not found then
    return jsonb_build_object('error', 'service_order_not_found');
  end if;

  v_initial := v_order.status;
  v_current := v_order.status;

  if v_current in ('FINALIZADA', 'CANCELADA', 'ORCAMENTO RECUSADO ENCERRADO') then
    return jsonb_build_object('initial_status', v_initial, 'final_status', v_current, 'changed', false, 'transitions', '[]'::jsonb, 'missing', '[]'::jsonb);
  end if;

  loop
    v_iterations := v_iterations + 1;
    exit when v_iterations > 10;

    select * into v_fin from public.os_financial where service_order_id = p_service_order_id limit 1;
    select exists(select 1 from public.os_parts where service_order_id = p_service_order_id) into v_has_parts;
    select coalesce(sum(quantity * unit_value), 0) into v_parts_total from public.os_parts where service_order_id = p_service_order_id;
    v_budget := coalesce(v_fin.labor_value, 0) + coalesce(v_fin.freight_value, 0)
      + coalesce(v_fin.auxiliary_material_value, 0) + coalesce(v_fin.technical_report_value, 0);
    v_full_budget := v_budget + v_parts_total - coalesce(v_fin.discount_value, 0);
    select coalesce(sum(amount), 0) into v_paid_total from public.payments
      where service_order_id = p_service_order_id and paid_at is not null
        and upper(coalesce(status, '')) not in ('CANCELADO', 'CANCELADA', 'ESTORNADO', 'ESTORNADA');

    v_next := public.compute_next_service_order_status(
      v_current, v_order.technician_id, v_order.diagnosed_defect, v_order.technical_service,
      v_budget, v_has_parts, v_order.approval_decision, v_order.approval_date, v_order.rejection_reason,
      v_order.repair_started_at, v_order.ready_at, v_order.delivery_at,
      v_full_budget, v_paid_total
    );
    exit when v_next is null;

    v_reason := case
      when v_next = 'AGUARDANDO APROVACAO' then 'Análise/orçamento concluído e salvo'
      when v_next = 'AGUARDANDO CONSERTO' then 'Cliente aprovou o orçamento'
      when v_next = 'ORCAMENTO RECUSADO' then 'Cliente recusou o orçamento'
      when v_next = 'ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA' and v_current = 'AGUARDANDO APROVACAO'
        then 'Cliente recusou o orçamento e o equipamento já estava pronto'
      when v_next = 'ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA' and v_current = 'ORCAMENTO RECUSADO'
        then 'Equipamento preparado/remontado, disponível para retirada'
      when v_next = 'EM CONSERTO' then 'Início do conserto registrado'
      when v_next = 'PRONTO PARA ENTREGA' then 'Conserto/serviço concluído'
      when v_next = 'FINALIZADA' then 'Entrega/retirada registrada, valor total alocado em pagamentos'
      when v_next = 'ORCAMENTO RECUSADO ENCERRADO' then 'Retirada efetiva registrada'
      else 'Avanço automático conforme preenchimento da etapa'
    end;

    update public.service_orders
      set status = v_next, updated_at = v_now,
          closed_at = case when v_next in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO') then v_now else closed_at end
      where id = p_service_order_id;

    insert into public.os_status_history (service_order_id, previous_status, new_status, change_type, reason, changed_by, changed_at)
      values (p_service_order_id, v_current, v_next, 'AUTOMATICO', v_reason, v_actor, v_now);

    v_transitions := v_transitions || jsonb_build_object('previous_status', v_current, 'new_status', v_next, 'reason', v_reason);
    v_current := v_next;
    v_order.status := v_next;
  end loop;

  -- v_fin/v_has_parts/v_budget/v_full_budget/v_paid_total já refletem
  -- v_current (recalculados no topo da última iteração, antes do exit).
  v_missing := public.compute_missing_for_status(
    v_current, v_order.technician_id, v_order.diagnosed_defect, v_order.technical_service,
    v_budget, v_has_parts, v_order.approval_decision, v_order.approval_date, v_order.rejection_reason,
    v_order.repair_started_at, v_order.ready_at, v_order.delivery_at,
    v_full_budget, v_paid_total
  );

  return jsonb_build_object('initial_status', v_initial, 'final_status', v_current, 'changed', v_current <> v_initial, 'transitions', v_transitions, 'missing', to_jsonb(v_missing));
end;
$$;
comment on function public.advance_service_order_status is
  'Único ponto que efetivamente grava avanço automático de status de OS (achado 2026-09-03). Desde 2026-09-07, PRONTO PARA ENTREGA só avança pra FINALIZADA com o valor total (peças+serviço-desconto) já todo alocado em pagamentos (qualquer forma, incluindo DESCONTO concedido no fechamento). Chamado pelo frontend logo após um evento operacional real ser salvo (os-status-engine-v0903.js) -- nunca em background/em massa. Idempotente.';

grant execute on function public.compute_next_service_order_status(text, uuid, text, text, numeric, boolean, text, date, text, timestamptz, timestamptz, timestamptz, numeric, numeric) to authenticated;
grant execute on function public.compute_missing_for_status(text, uuid, text, text, numeric, boolean, text, date, text, timestamptz, timestamptz, timestamptz, numeric, numeric) to authenticated;
grant execute on function public.advance_service_order_status(uuid) to authenticated;
