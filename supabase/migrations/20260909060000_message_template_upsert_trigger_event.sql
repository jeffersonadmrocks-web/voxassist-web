-- ============================================================
-- Estende admin_upsert_message_template com p_trigger_event
-- (parâmetro novo com default, retrocompatível -- mesmo padrão já
-- usado em admin_upsert_payment_method/max_installments). Só 1
-- mensagem por evento por empresa: marcar uma nova limpa
-- automaticamente o trigger_event de qualquer outra que já tivesse
-- esse mesmo evento (evita ambiguidade de "qual mensagem sugerir").
-- ============================================================

create or replace function public.admin_upsert_message_template(
  p_company_id uuid,
  p_id uuid,
  p_name text,
  p_body text,
  p_active boolean,
  p_trigger_event text default null
) returns public.message_templates
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.message_templates%rowtype;
  v_next_sort int;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar mensagens padrão.';
  end if;
  if p_trigger_event is not null and p_trigger_event not in ('OS_PRONTO_PARA_ENTREGA') then
    raise exception 'Evento de disparo inválido.';
  end if;

  if p_trigger_event is not null then
    update public.message_templates set trigger_event = null
      where company_id = p_company_id and trigger_event = p_trigger_event and id is distinct from p_id;
  end if;

  if p_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_next_sort from public.message_templates where company_id = p_company_id;
    insert into public.message_templates (company_id, name, body, active, sort_order, trigger_event, created_by)
      values (p_company_id, trim(p_name), coalesce(p_body, ''), coalesce(p_active, true), v_next_sort, p_trigger_event, auth.uid())
      returning * into v_row;
  else
    update public.message_templates
      set name = trim(p_name), body = coalesce(p_body, ''), active = coalesce(p_active, true), trigger_event = p_trigger_event
      where id = p_id and company_id = p_company_id
      returning * into v_row;
  end if;

  return v_row;
end;
$function$;
