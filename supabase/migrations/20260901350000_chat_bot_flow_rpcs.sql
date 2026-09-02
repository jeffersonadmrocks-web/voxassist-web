-- ============================================================
-- Robô de Atendimento -- Fase 3: RPCs de publicar/restaurar
--
-- security invoker (mesma decisão das RPCs de Metas/Bonificação
-- desta sessão): rodam com a RLS de quem chamou -- os INSERT/UPDATE
-- internos continuam sujeitos às policies das Fases 1-2. As
-- checagens de "current_company_role() <> 'GESTOR'" aqui são só
-- mensagem de erro mais clara -- a autorização de verdade é a RLS.
-- ============================================================

create or replace function public.publish_chat_bot_flow(
  p_flow_version_id uuid,
  p_reason text default null
) returns public.chat_bot_flow_versions
language plpgsql
security invoker
as $$
declare
  v_draft public.chat_bot_flow_versions;
  v_prev_published public.chat_bot_flow_versions;
  v_published public.chat_bot_flow_versions;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode publicar o Robô de Atendimento.';
  end if;

  select * into v_draft from public.chat_bot_flow_versions where id = p_flow_version_id for update;
  if v_draft.id is null then
    raise exception 'publish_chat_bot_flow: versão não encontrada.';
  end if;
  if v_draft.company_id <> current_company_id() then
    raise exception 'publish_chat_bot_flow: versão pertence a outra empresa.';
  end if;
  if v_draft.status <> 'RASCUNHO' then
    raise exception 'publish_chat_bot_flow: só é possível publicar uma versão em RASCUNHO.';
  end if;
  if not exists (select 1 from public.chat_bot_flow_steps where flow_version_id = p_flow_version_id and active) then
    raise exception 'publish_chat_bot_flow: o fluxo precisa de pelo menos uma pergunta de triagem ativa antes de publicar.';
  end if;

  select * into v_prev_published from public.chat_bot_flow_versions
    where company_id = current_company_id() and status = 'PUBLICADA' and valid_to is null
    for update;

  if v_prev_published.id is not null then
    update public.chat_bot_flow_versions
      set status = 'ARQUIVADA', valid_to = now(), superseded_by = p_flow_version_id
      where id = v_prev_published.id;
  end if;

  update public.chat_bot_flow_versions
    set status = 'PUBLICADA', valid_from = now(), published_by = auth.uid(), published_at = now(), reason = p_reason
    where id = p_flow_version_id
    returning * into v_published;

  insert into public.chat_bot_flow_audit_events (
    company_id, entity_type, entity_id, action, previous_data, new_data, reason, changed_by
  ) values (
    current_company_id(), 'FLOW_VERSION', p_flow_version_id, 'PUBLICADA',
    case when v_prev_published.id is not null then to_jsonb(v_prev_published) else '{}'::jsonb end,
    to_jsonb(v_published), p_reason, auth.uid()
  );

  return v_published;
end;
$$;

comment on function public.publish_chat_bot_flow(uuid, text) is
  'Publica uma versão RASCUNHO do Robô de Atendimento: arquiva a PUBLICADA anterior (se existir) e promove a nova, tudo atômico. Exige pelo menos uma pergunta de triagem ativa. security invoker -- autorização real é a RLS de chat_bot_flow_versions.';

create or replace function public.restore_chat_bot_flow_version(
  p_source_version_id uuid,
  p_reason text default null
) returns public.chat_bot_flow_versions
language plpgsql
security invoker
as $$
declare
  v_source public.chat_bot_flow_versions;
  v_new public.chat_bot_flow_versions;
  v_step record;
  v_new_step_id uuid;
  v_cond record;
  v_rule record;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode restaurar uma versão do Robô de Atendimento.';
  end if;

  select * into v_source from public.chat_bot_flow_versions where id = p_source_version_id;
  if v_source.id is null then
    raise exception 'restore_chat_bot_flow_version: versão de origem não encontrada.';
  end if;
  if v_source.company_id <> current_company_id() then
    raise exception 'restore_chat_bot_flow_version: versão pertence a outra empresa.';
  end if;
  if exists (select 1 from public.chat_bot_flow_versions where company_id = current_company_id() and status = 'RASCUNHO') then
    raise exception 'restore_chat_bot_flow_version: já existe um rascunho em andamento -- publique ou descarte antes de restaurar outra versão.';
  end if;

  insert into public.chat_bot_flow_versions (
    company_id, status, welcome_message, invalid_message, retry_limit,
    always_human_toggle, lookup_toggle, resume_toggle, resume_hours,
    after_hours_toggle, business_hours_text, after_hours_message,
    default_attendant_id, created_by, reason
  ) values (
    current_company_id(), 'RASCUNHO', v_source.welcome_message, v_source.invalid_message, v_source.retry_limit,
    v_source.always_human_toggle, v_source.lookup_toggle, v_source.resume_toggle, v_source.resume_hours,
    v_source.after_hours_toggle, v_source.business_hours_text, v_source.after_hours_message,
    v_source.default_attendant_id, auth.uid(), p_reason
  ) returning * into v_new;

  -- Copia os steps preservando a ordem, guardando o mapeamento
  -- id-antigo -> id-novo numa tabela temporária (existe só dentro
  -- desta transação) pra recriar as condições e regras corretamente.
  create temporary table _chat_bot_step_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  for v_step in select * from public.chat_bot_flow_steps where flow_version_id = p_source_version_id order by step_order asc loop
    insert into public.chat_bot_flow_steps (
      flow_version_id, step_key, step_order, question_text, answer_type, options, routing_dimension, active
    ) values (
      v_new.id, v_step.step_key, v_step.step_order, v_step.question_text, v_step.answer_type, v_step.options, v_step.routing_dimension, v_step.active
    ) returning id into v_new_step_id;
    insert into _chat_bot_step_id_map (old_id, new_id) values (v_step.id, v_new_step_id);
  end loop;

  for v_cond in select * from public.chat_bot_flow_step_conditions where step_id in (select id from public.chat_bot_flow_steps where flow_version_id = p_source_version_id) loop
    insert into public.chat_bot_flow_step_conditions (step_id, depends_on_step_id, depends_on_value)
    values (
      (select new_id from _chat_bot_step_id_map where old_id = v_cond.step_id),
      (select new_id from _chat_bot_step_id_map where old_id = v_cond.depends_on_step_id),
      v_cond.depends_on_value
    );
  end loop;

  for v_rule in select * from public.chat_bot_routing_rules where flow_version_id = p_source_version_id loop
    insert into public.chat_bot_routing_rules (flow_version_id, store_id, warranty_value, brand_value, target_attendant_id)
    values (v_new.id, v_rule.store_id, v_rule.warranty_value, v_rule.brand_value, v_rule.target_attendant_id);
  end loop;

  insert into public.chat_bot_flow_audit_events (
    company_id, entity_type, entity_id, action, previous_data, new_data, reason, changed_by
  ) values (
    current_company_id(), 'FLOW_VERSION', v_new.id, 'RESTAURADA',
    jsonb_build_object('source_version_id', p_source_version_id), to_jsonb(v_new), p_reason, auth.uid()
  );

  return v_new;
end;
$$;

comment on function public.restore_chat_bot_flow_version(uuid, text) is
  'Cria um RASCUNHO novo copiando o conteúdo completo (mensagens, perguntas, condições, regras de roteamento) de uma versão antiga -- nunca altera a versão de origem. Falha se já existir um rascunho em andamento. security invoker.';
