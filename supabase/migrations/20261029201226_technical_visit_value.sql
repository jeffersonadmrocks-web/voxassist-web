-- Visita técnica compõe o orçamento e o saldo exigido para finalizar a OS.
-- Aplicar antes de publicar o frontend.
alter table public.os_financial add column if not exists technical_visit_value numeric default 0;

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
      + coalesce(v_fin.auxiliary_material_value, 0) + coalesce(v_fin.technical_report_value, 0)
      + coalesce(v_fin.technical_visit_value, 0);
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

notify pgrst, 'reload schema';
