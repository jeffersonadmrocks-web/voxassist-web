-- ============================================================
-- WhatsApp interno (tela Usuários) -- 3 RPCs, mesmo padrão de
-- publish_chat_bot_flow/restore_chat_bot_flow_version
-- (20260901350000_chat_bot_flow_rpcs.sql): security invoker, checagem
-- de GESTOR só pra mensagem de erro clara (autorização real é a RLS),
-- checagem de empresa, auditoria append-only ao final.
-- ============================================================

create or replace function public.link_internal_whatsapp(
  p_user_id uuid,
  p_raw_jid text,
  p_phone text default null
) returns public.chat_internal_whatsapp_links
language plpgsql
security invoker
as $$
declare
  v_target public.profiles;
  v_row public.chat_internal_whatsapp_links;
  v_previous jsonb := '{}'::jsonb;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode vincular uma identidade de WhatsApp interno.';
  end if;
  if p_raw_jid is null or btrim(p_raw_jid) = '' then
    raise exception 'link_internal_whatsapp: identidade (raw_jid) obrigatória.';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if v_target.id is null then
    raise exception 'link_internal_whatsapp: usuário não encontrado.';
  end if;

  select * into v_row from public.chat_internal_whatsapp_links
    where company_id = current_company_id() and user_id = p_user_id
    for update;
  if v_row.id is not null then v_previous := to_jsonb(v_row); end if;

  -- Vincular só grava a identidade técnica -- reconhecimento e desvio
  -- do robô (recognized/bypass_bot) continuam como estavam (false por
  -- padrão numa vinculação nova), só ativados depois, explicitamente,
  -- na ficha do usuário.
  insert into public.chat_internal_whatsapp_links (company_id, user_id, raw_jid, phone, identity_status, validated_at)
  values (current_company_id(), p_user_id, p_raw_jid, p_phone, 'VINCULADO', now())
  on conflict (company_id, user_id) do update set
    raw_jid = excluded.raw_jid,
    phone = coalesce(excluded.phone, public.chat_internal_whatsapp_links.phone),
    identity_status = 'VINCULADO',
    validated_at = now(),
    updated_at = now()
  returning * into v_row;

  insert into public.chat_internal_whatsapp_audit_events (company_id, link_id, user_id, action, previous_data, new_data, changed_by)
  values (current_company_id(), v_row.id, p_user_id, 'VINCULADA', v_previous, to_jsonb(v_row), auth.uid());

  return v_row;
end;
$$;

comment on function public.link_internal_whatsapp(uuid, text, text) is
  'Vincula a identidade técnica (raw_jid) vista numa conversa real a um usuário -- só a identidade, nunca ativa reconhecimento/desvio do robô automaticamente. security invoker.';

create or replace function public.update_internal_whatsapp_ficha(
  p_user_id uuid,
  p_recognized boolean,
  p_bypass_bot boolean,
  p_default_destination_type text default null,
  p_default_destination_value text default null
) returns public.chat_internal_whatsapp_links
language plpgsql
security invoker
as $$
declare
  v_row public.chat_internal_whatsapp_links;
  v_previous jsonb;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode editar a ficha de WhatsApp interno.';
  end if;

  select * into v_row from public.chat_internal_whatsapp_links
    where company_id = current_company_id() and user_id = p_user_id
    for update;
  if v_row.id is null then
    raise exception 'update_internal_whatsapp_ficha: vincule uma identidade pela Central de Conversas antes de editar a ficha.';
  end if;
  v_previous := to_jsonb(v_row);

  update public.chat_internal_whatsapp_links set
    recognized = p_recognized,
    bypass_bot = p_bypass_bot,
    default_destination_type = p_default_destination_type,
    default_destination_value = p_default_destination_value,
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  insert into public.chat_internal_whatsapp_audit_events (company_id, link_id, user_id, action, previous_data, new_data, changed_by)
  values (current_company_id(), v_row.id, p_user_id, 'FICHA_ATUALIZADA', v_previous, to_jsonb(v_row), auth.uid());

  return v_row;
end;
$$;

comment on function public.update_internal_whatsapp_ficha(uuid, boolean, boolean, text, text) is
  'Ativa/desativa reconhecimento e desvio do robô, e define o destino padrão -- só depois de já existir um vínculo (link_internal_whatsapp). security invoker.';

create or replace function public.unlink_internal_whatsapp(
  p_user_id uuid
) returns void
language plpgsql
security invoker
as $$
declare
  v_row public.chat_internal_whatsapp_links;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode desvincular um WhatsApp interno.';
  end if;

  select * into v_row from public.chat_internal_whatsapp_links
    where company_id = current_company_id() and user_id = p_user_id
    for update;
  if v_row.id is null then return; end if;

  update public.chat_internal_whatsapp_links set
    identity_status = 'PENDENTE', raw_jid = null, phone = null,
    recognized = false, bypass_bot = false,
    default_destination_type = null, default_destination_value = null,
    validated_at = null, updated_at = now()
  where id = v_row.id;

  insert into public.chat_internal_whatsapp_audit_events (company_id, link_id, user_id, action, previous_data, new_data, changed_by)
  values (current_company_id(), v_row.id, p_user_id, 'DESVINCULADA', to_jsonb(v_row), '{}'::jsonb, auth.uid());
end;
$$;

comment on function public.unlink_internal_whatsapp(uuid) is
  'Remove o vínculo de WhatsApp interno de um usuário -- desliga reconhecimento e desvio do robô junto. security invoker.';
