CREATE OR REPLACE FUNCTION public.compute_missing_for_status(p_status text, p_technician_id uuid, p_diagnosed_defect text, p_technical_service text, p_budget_total numeric, p_has_parts boolean, p_approval_decision text, p_approval_date date, p_rejection_reason text, p_repair_started_at timestamp with time zone, p_ready_at timestamp with time zone, p_delivery_at timestamp with time zone, p_full_budget_total numeric, p_paid_total numeric)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$;
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
      '{}'::text[]
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_next_service_order_status(p_status text, p_technician_id uuid, p_diagnosed_defect text, p_technical_service text, p_budget_total numeric, p_has_parts boolean, p_approval_decision text, p_approval_date date, p_rejection_reason text, p_repair_started_at timestamp with time zone, p_ready_at timestamp with time zone, p_delivery_at timestamp with time zone, p_full_budget_total numeric, p_paid_total numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$;
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
    when 'AGUARDANDO CONSERTO' then case when p_ready_at is not null then 'PRONTO PARA ENTREGA' end
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
$function$;
