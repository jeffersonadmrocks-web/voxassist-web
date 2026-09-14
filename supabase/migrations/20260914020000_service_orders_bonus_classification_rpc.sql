-- ============================================================
-- Classificação de exceção/reincidência da OS pra Bonificação
-- (pacote de conclusão, 2026-09-14).
--
-- Achado da auditoria: service_orders.excluded_from_time_metric e
-- reincidence_attributable (migration 20260912030000) nunca ganharam
-- NENHUMA interface -- a suposição de que a "Fase 2" já expunha esses
-- campos na OS era falsa (grep no main inteiro: zero referências fora
-- da própria migration). Sem RPC dedicada, a única forma de gravar
-- esses campos seria PATCH direto em service_orders pelo frontend --
-- a RLS de service_orders só isola por empresa/técnico, não por papel,
-- então QUALQUER usuário autenticado da empresa (não só o gestor)
-- conseguiria classificar essas exceções sem nenhuma auditoria. Esta
-- migration fecha essa lacuna com uma RPC gestor-only, auditável,
-- pro mesmo padrão de segurança já usado em todo o resto do app.
-- ============================================================

create or replace function public.classify_service_order_bonus_flags(
  p_service_order_id uuid,
  p_excluded_from_time_metric boolean default null,
  p_reincidence_attributable boolean default null,
  p_reason text default null
) returns public.service_orders
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_os public.service_orders;
  v_old jsonb;
begin
  select * into v_os from public.service_orders where id = p_service_order_id;
  if v_os.id is null then raise exception 'OS não encontrada'; end if;
  if not is_company_gestor(v_os.company_id) then
    raise exception 'Acesso permitido somente ao gestor da empresa';
  end if;
  if p_excluded_from_time_metric is null and p_reincidence_attributable is null then
    raise exception 'Informe ao menos um dos dois campos a classificar';
  end if;
  if p_reincidence_attributable is not null and v_os.order_type <> 'REINGRESSO' then
    raise exception 'reincidence_attributable só se aplica a OS do tipo REINGRESSO';
  end if;

  v_old := jsonb_build_object(
    'excluded_from_time_metric', v_os.excluded_from_time_metric,
    'reincidence_attributable', v_os.reincidence_attributable
  );

  update public.service_orders set
    excluded_from_time_metric = coalesce(p_excluded_from_time_metric, excluded_from_time_metric),
    reincidence_attributable = coalesce(p_reincidence_attributable, reincidence_attributable),
    updated_at = now()
  where id = p_service_order_id
  returning * into v_os;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(), v_os.company_id, 'BONIFICACAO', 'CLASSIFICAR_EXCECAO_OS', 'service_orders', p_service_order_id,
    v_old,
    jsonb_build_object('excluded_from_time_metric', v_os.excluded_from_time_metric, 'reincidence_attributable', v_os.reincidence_attributable, 'reason', p_reason)
  );

  return v_os;
end;
$$;
comment on function public.classify_service_order_bonus_flags is
  'Classifica excluded_from_time_metric (exceção de atraso externo comprovado) e/ou reincidence_attributable (reincidência atribuível ao reparo anterior, só em OS REINGRESSO) -- gestor-only, auditável (audit_log área BONIFICACAO). Nunca é escrita por PATCH direto do frontend em service_orders -- essas 2 colunas só mudam por aqui.';
revoke execute on function public.classify_service_order_bonus_flags(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.classify_service_order_bonus_flags(uuid, boolean, boolean, text) to authenticated;
