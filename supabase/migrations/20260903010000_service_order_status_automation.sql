-- ============================================================
-- Automação do ciclo de status da OS (achado do usuário 2026-09-03):
-- a situação da OS não pode depender de alteração manual do operador --
-- tem que evoluir sozinha a partir de eventos operacionais REAIS já
-- salvos (análise/orçamento concluído, decisão do cliente, conserto
-- concluído, entrega registrada).
--
-- Implementado SOBRE o fluxo canônico existente (mesma tabela
-- service_orders.status, mesmo os_status_history, mesmos 8 valores de
-- status já usados em manual-status-v0812.js/os-global-save-v0812.js +
-- 2 novos sub-estados de recusa pedidos pelo usuário) -- não é um
-- segundo motor: é a MESMA lógica que hoje vive espalhada e duplicada
-- em missingFor()/nextStatus()/advanceStatus() (os-global-save-v0812.js),
-- só que consolidada em UM único lugar (aqui, no banco), chamável via
-- RPC pelos vários pontos que hoje salvam um campo que participa do
-- fluxo (diagnóstico, orçamento, decisão do cliente, conserto, entrega,
-- peça incluída).
--
-- Preserva 100% do que já existe: os_status_history continua sendo o
-- único lugar de auditoria (situação anterior -> nova -> change_type ->
-- reason -> changed_by -> changed_at), "Alterar Situação"
-- (manual-status-v0812.js) continua funcionando exatamente igual, sem
-- nenhuma restrição nova, para exceção/correção/regressão autorizada.
--
-- NÃO corrige nenhum dado existente em massa. As duas funções abaixo
-- não tocam em nenhuma OS sozinhas -- só passam a ser CHAMADAS a partir
-- de agora, a partir de eventos reais no frontend (ver
-- os-status-engine-v0903.js). Uma consulta somente-leitura, separada
-- desta migration, mede quantas OS já existentes ficariam diferentes
-- se a regra fosse aplicada hoje -- reportado ao usuário antes de
-- decidir se/quando reconciliar.
-- ============================================================

-- ---------- 1. Extensão aditiva do vocabulário de status ----------
-- service_orders.status sempre foi texto livre, sem CHECK constraint
-- (confirmado: nenhuma constraint de status existe na tabela hoje) --
-- os 2 sub-estados novos de recusa são só mais 2 valores de texto,
-- iguais aos outros 8 já em uso, sem precisar de migração de coluna.
-- Documentado aqui porque não há um CHECK formal onde declarar isso:
--   AGUARDANDO ANALISE, AGUARDANDO APROVACAO, AGUARDANDO CONSERTO,
--   EM CONSERTO, PRONTO PARA ENTREGA, FINALIZADA, CANCELADA (já existiam)
--   ORCAMENTO RECUSADO (já existia, primeiro sub-estado da recusa)
--   ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA (novo)
--   ORCAMENTO RECUSADO ENCERRADO (novo)

-- ---------- 2. Corrige gap real encontrado no mapeamento ----------
-- os-cancel-v0812.js grava change_type='CANCELAMENTO', valor que a
-- CHECK constraint atual nunca permitiu (só AUTOMATICO/MANUAL) -- toda
-- vez que uma OS fosse cancelada, o PATCH de status funcionava mas o
-- INSERT de auditoria falhava (erro visível pro usuário, cancelamento
-- ficava sem registro no histórico). Extensão aditiva, nunca remove
-- nenhum valor já aceito.
alter table public.os_status_history drop constraint os_status_history_change_type_check;
alter table public.os_status_history add constraint os_status_history_change_type_check
  check (change_type = any (array['AUTOMATICO'::text, 'MANUAL'::text, 'CANCELAMENTO'::text]));

-- ---------- 3. Função pura: decide o PRÓXIMO status, sem gravar nada ----------
-- Único lugar de decisão do fluxo -- usada tanto pela função que grava
-- (abaixo) quanto pela consulta de diagnóstico/reconciliação, pra nunca
-- existir duas versões da mesma regra.
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
  p_delivery_at timestamptz
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
    when 'PRONTO PARA ENTREGA' then case when p_delivery_at is not null then 'FINALIZADA' end
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
  'Regra única do ciclo automático de status da OS (achado 2026-09-03) -- pura, sem efeito colateral. Usada por advance_service_order_status() (grava) e por qualquer consulta de diagnóstico (não grava). Nunca duplicar esta lógica em outro lugar.';

-- ---------- 4. Função que efetivamente avança (transacional, looping até estabilizar) ----------
-- SECURITY INVOKER de propósito -- roda com o RLS de quem chama, exatamente
-- as mesmas permissões que o PATCH direto já tinha. Não concede nenhum
-- acesso novo. changed_by vem de auth.uid(), nunca de parâmetro (não dá
-- pra forjar autoria). Loop cobre o caso de uma OS que já tinha várias
-- etapas preenchidas de uma vez (ex.: import antigo) -- cada etapa vira
-- uma linha própria em os_status_history, nunca um pulo silencioso.
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
  v_current text;
  v_next text;
  v_initial text;
  v_iterations int := 0;
  v_transitions jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_reason text;
begin
  select * into v_order from public.service_orders where id = p_service_order_id for update;
  if not found then
    return jsonb_build_object('error', 'service_order_not_found');
  end if;

  v_initial := v_order.status;
  v_current := v_order.status;

  if v_current in ('FINALIZADA', 'CANCELADA', 'ORCAMENTO RECUSADO ENCERRADO') then
    return jsonb_build_object('initial_status', v_initial, 'final_status', v_current, 'changed', false, 'transitions', '[]'::jsonb);
  end if;

  loop
    v_iterations := v_iterations + 1;
    exit when v_iterations > 10;

    select * into v_fin from public.os_financial where service_order_id = p_service_order_id limit 1;
    select exists(select 1 from public.os_parts where service_order_id = p_service_order_id) into v_has_parts;
    v_budget := coalesce(v_fin.labor_value, 0) + coalesce(v_fin.freight_value, 0)
      + coalesce(v_fin.auxiliary_material_value, 0) + coalesce(v_fin.technical_report_value, 0);

    v_next := public.compute_next_service_order_status(
      v_current, v_order.technician_id, v_order.diagnosed_defect, v_order.technical_service,
      v_budget, v_has_parts, v_order.approval_decision, v_order.approval_date, v_order.rejection_reason,
      v_order.repair_started_at, v_order.ready_at, v_order.delivery_at
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
      when v_next = 'FINALIZADA' then 'Entrega/retirada registrada'
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

  return jsonb_build_object('initial_status', v_initial, 'final_status', v_current, 'changed', v_current <> v_initial, 'transitions', v_transitions);
end;
$$;
comment on function public.advance_service_order_status is
  'Único ponto que efetivamente grava avanço automático de status de OS (achado 2026-09-03). Chamado pelo frontend logo após um evento operacional real ser salvo (os-status-engine-v0903.js) -- nunca em background/em massa. Idempotente: reavaliar uma OS já estável não gera história nova.';

grant execute on function public.compute_next_service_order_status(text, uuid, text, text, numeric, boolean, text, date, text, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.advance_service_order_status(uuid) to authenticated;
