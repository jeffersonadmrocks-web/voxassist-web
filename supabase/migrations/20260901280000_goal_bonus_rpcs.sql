-- ============================================================
-- Consolidação Produtividade / Metas / Bonificação -- Fase 5
--
-- RPCs transacionais: fecha a vigência antiga + insere a nova +
-- grava auditoria, tudo atômico (uma função plpgsql roda numa única
-- transação implícita -- se qualquer passo falhar, tudo desfaz,
-- nunca fica um evento de auditoria órfão nem uma vigência fechada
-- sem substituta).
--
-- security invoker (decisão do plano): a função roda com o RLS de
-- quem chamou -- os INSERT/UPDATE internos continuam sujeitos às
-- policies já criadas nas Fases 2-4 (GESTOR + user_has_store_access).
-- O "if current_company_role() <> 'GESTOR'" no início de cada função
-- é só uma mensagem de erro mais clara -- a autorização de verdade é
-- a RLS, não essa checagem.
--
-- Ordem crítica em cada função: fecha a vigência antiga ANTES de
-- inserir a nova. Se fosse ao contrário, a nova linha (ATIVA) e a
-- antiga (ainda ATIVA por um instante) violariam o índice único
-- parcial das Fases 2-3 -- por isso o fechamento vem primeiro,
-- sempre.
-- ============================================================

create or replace function public.set_goal_target(
  p_company_id uuid,
  p_store_id uuid,
  p_scope_type text,
  p_scope_role text,
  p_scope_user_id uuid,
  p_indicator_code text,
  p_target_value numeric,
  p_period_start date,
  p_period_end date,
  p_reason text default null
) returns public.goal_targets
language plpgsql
security invoker
as $$
declare
  v_existing public.goal_targets;
  v_new public.goal_targets;
  v_action text;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode configurar metas.';
  end if;

  select * into v_existing
  from public.goal_targets
  where company_id = p_company_id
    and store_id = p_store_id
    and scope_type = p_scope_type
    and coalesce(scope_role, '') = coalesce(p_scope_role, '')
    and coalesce(scope_user_id::text, '') = coalesce(p_scope_user_id::text, '')
    and indicator_code = p_indicator_code
    and period_start = p_period_start
    and period_end = p_period_end
    and status = 'ATIVA'
    and valid_to is null
  for update;

  if v_existing.id is not null then
    update public.goal_targets
      set valid_to = now(), status = 'ENCERRADA', closed_by = auth.uid(), reason = p_reason
      where id = v_existing.id;
  end if;

  insert into public.goal_targets (
    company_id, store_id, scope_type, scope_role, scope_user_id, indicator_code,
    target_value, period_start, period_end, created_by
  ) values (
    p_company_id, p_store_id, p_scope_type, p_scope_role, p_scope_user_id, p_indicator_code,
    p_target_value, p_period_start, p_period_end, auth.uid()
  ) returning * into v_new;

  if v_existing.id is not null then
    v_action := 'SUBSTITUIDA';
    update public.goal_targets set superseded_by = v_new.id where id = v_existing.id;
  else
    v_action := 'CRIADA';
  end if;

  insert into public.goal_bonus_audit_events (
    company_id, store_id, entity_type, entity_id, action, previous_data, new_data,
    subject_scope_type, subject_role, subject_user_id, reason, changed_by
  ) values (
    p_company_id, p_store_id, 'GOAL_TARGET', v_new.id, v_action,
    case when v_existing.id is not null then to_jsonb(v_existing) else '{}'::jsonb end,
    to_jsonb(v_new),
    p_scope_type, p_scope_role, p_scope_user_id, p_reason, auth.uid()
  );

  return v_new;
end;
$$;

comment on function public.set_goal_target(uuid, uuid, text, text, uuid, text, numeric, date, date, text) is
  'Cria uma nova vigência de meta, fechando atomicamente a vigência ativa anterior (mesmo alvo/indicador/período) se existir, e gravando o evento de auditoria correspondente. security invoker -- autorização real é a RLS de goal_targets/goal_bonus_audit_events.';

create or replace function public.set_bonus_rule(
  p_company_id uuid,
  p_store_id uuid,
  p_indicator_code text,
  p_eligible_scope_type text,
  p_eligible_role text,
  p_eligible_user_id uuid,
  p_weight numeric,
  p_tier_rules jsonb,
  p_campaign_id uuid,
  p_period_start date,
  p_period_end date,
  p_reason text default null
) returns public.bonus_rules
language plpgsql
security invoker
as $$
declare
  v_existing public.bonus_rules;
  v_new public.bonus_rules;
  v_action text;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode configurar regras de bonificação.';
  end if;

  select * into v_existing
  from public.bonus_rules
  where company_id = p_company_id
    and coalesce(store_id::text, '') = coalesce(p_store_id::text, '')
    and eligible_scope_type = p_eligible_scope_type
    and coalesce(eligible_role, '') = coalesce(p_eligible_role, '')
    and coalesce(eligible_user_id::text, '') = coalesce(p_eligible_user_id::text, '')
    and indicator_code = p_indicator_code
    and coalesce(campaign_id::text, '') = coalesce(p_campaign_id::text, '')
    and period_start = p_period_start
    and period_end = p_period_end
    and status = 'ATIVA'
    and valid_to is null
  for update;

  if v_existing.id is not null then
    update public.bonus_rules
      set valid_to = now(), status = 'ENCERRADA', closed_by = auth.uid(), reason = p_reason
      where id = v_existing.id;
  end if;

  insert into public.bonus_rules (
    company_id, store_id, indicator_code, eligible_scope_type, eligible_role, eligible_user_id,
    weight, tier_rules, campaign_id, period_start, period_end, created_by
  ) values (
    p_company_id, p_store_id, p_indicator_code, p_eligible_scope_type, p_eligible_role, p_eligible_user_id,
    p_weight, p_tier_rules, p_campaign_id, p_period_start, p_period_end, auth.uid()
  ) returning * into v_new;

  if v_existing.id is not null then
    v_action := 'SUBSTITUIDA';
    update public.bonus_rules set superseded_by = v_new.id where id = v_existing.id;
  else
    v_action := 'CRIADA';
  end if;

  insert into public.goal_bonus_audit_events (
    company_id, store_id, entity_type, entity_id, action, previous_data, new_data,
    subject_scope_type, subject_role, subject_user_id, reason, changed_by
  ) values (
    p_company_id, p_store_id, 'BONUS_RULE', v_new.id, v_action,
    case when v_existing.id is not null then to_jsonb(v_existing) else '{}'::jsonb end,
    to_jsonb(v_new),
    p_eligible_scope_type, p_eligible_role, p_eligible_user_id, p_reason, auth.uid()
  );

  return v_new;
end;
$$;

comment on function public.set_bonus_rule(uuid, uuid, text, text, text, uuid, numeric, jsonb, uuid, date, date, text) is
  'Cria uma nova vigência de regra de bonificação, fechando atomicamente a vigência ativa anterior (mesmo alvo/indicador/campanha/período) se existir. Regra de campanha (campaign_id preenchido) nunca substitui a regra padrão (campaign_id null) nem vice-versa -- são versionadas separadamente. security invoker.';

create or replace function public.close_bonus_campaign(
  p_campaign_id uuid,
  p_status text default 'ENCERRADA',
  p_reason text default null
) returns public.bonus_campaigns
language plpgsql
security invoker
as $$
declare
  v_campaign public.bonus_campaigns;
  v_rule record;
  v_audit_action text;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode encerrar campanhas.';
  end if;
  if p_status not in ('ENCERRADA', 'CANCELADA') then
    raise exception 'Status inválido pra encerramento de campanha: %', p_status;
  end if;

  select * into v_campaign from public.bonus_campaigns where id = p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'Campanha não encontrada.';
  end if;
  if v_campaign.status <> 'ATIVA' or v_campaign.valid_to is not null then
    raise exception 'Campanha já está encerrada/cancelada.';
  end if;

  v_audit_action := case when p_status = 'CANCELADA' then 'CANCELADA' else 'ENCERRADA_ANTECIPADAMENTE' end;

  update public.bonus_campaigns
    set valid_to = now(), status = p_status, closed_by = auth.uid(), reason = p_reason
    where id = p_campaign_id
    returning * into v_campaign;

  insert into public.goal_bonus_audit_events (
    company_id, store_id, entity_type, entity_id, action, previous_data, new_data, reason, changed_by
  ) values (
    v_campaign.company_id, v_campaign.store_id, 'BONUS_CAMPAIGN', v_campaign.id, v_audit_action,
    '{}'::jsonb, to_jsonb(v_campaign), p_reason, auth.uid()
  );

  -- Encerra em cascata toda regra ATIVA vinculada a esta campanha --
  -- uma campanha cancelada não pode deixar suas regras valendo
  -- sozinhas, sem vigência própria nem rastro do porquê pararam.
  for v_rule in
    select * from public.bonus_rules
    where campaign_id = p_campaign_id and status = 'ATIVA' and valid_to is null
    for update
  loop
    update public.bonus_rules
      set valid_to = now(), status = p_status, closed_by = auth.uid(), reason = coalesce(p_reason, 'Campanha encerrada')
      where id = v_rule.id;

    insert into public.goal_bonus_audit_events (
      company_id, store_id, entity_type, entity_id, action, previous_data, new_data,
      subject_scope_type, subject_role, subject_user_id, reason, changed_by
    ) values (
      v_rule.company_id, v_rule.store_id, 'BONUS_RULE', v_rule.id, v_audit_action,
      to_jsonb(v_rule), '{}'::jsonb,
      v_rule.eligible_scope_type, v_rule.eligible_role, v_rule.eligible_user_id,
      coalesce(p_reason, 'Campanha encerrada'), auth.uid()
    );
  end loop;

  return v_campaign;
end;
$$;

comment on function public.close_bonus_campaign(uuid, text, text) is
  'Encerra ou cancela uma campanha e, em cascata na mesma transação, toda regra de bonificação ainda ativa vinculada a ela -- nenhuma regra de campanha fica valendo sozinha depois que a campanha acaba. security invoker.';
