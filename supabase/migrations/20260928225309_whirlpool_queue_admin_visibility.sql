-- Os contadores da conexão devem refletir apenas a fila que o worker processa.
create or replace function public.whirlpool_connection_admin_status(p_company_id uuid)
 returns table(id uuid, company_id uuid, store_id uuid, filial text, external_partner_id text, active boolean, connection_status text, credentials_configured boolean, credential_version bigint, paused_at timestamptz, pause_reason text, last_auth_at timestamptz, last_auth_failure_at timestamptz, portal_retry_count integer, next_retry_at timestamptz, worker_online boolean, worker_heartbeat_at timestamptz, last_incremental_scan_at timestamptz, last_full_scan_at timestamptz, last_error_code text, last_error_at timestamptz, pending_imports bigint, waiting_connection_imports bigint)
 language plpgsql security definer set search_path = ''
as $$
begin
  if not public.whirlpool_is_company_manager(p_company_id) then
    raise exception 'Apenas gestor ativo pode administrar a integração Whirlpool';
  end if;
  return query
  select c.id,c.company_id,c.store_id,c.filial,c.external_partner_id,c.active,
    c.connection_status,
    (c.credential_username_secret_id is not null and c.credential_password_secret_id is not null),
    c.credential_version,c.paused_at,c.pause_reason,c.last_auth_at,c.last_auth_failure_at,
    c.portal_retry_count,c.next_retry_at,
    (c.worker_heartbeat_at > now() - interval '10 minutes'),c.worker_heartbeat_at,
    c.last_incremental_scan_at,c.last_full_scan_at,c.last_error_code,c.last_error_at,
    (select count(*) from public.whirlpool_import_queue q where q.company_id=c.company_id and q.queue_reason='ATIVA_NOVA' and q.state in ('PENDENTE','PROCESSANDO')),
    (select count(*) from public.whirlpool_import_queue q where q.company_id=c.company_id and q.queue_reason='ATIVA_NOVA' and q.state='AGUARDANDO_CONEXAO_WHIRLPOOL')
  from public.whirlpool_connections c
  where c.company_id=p_company_id
  order by c.created_at;
end
$$;

-- Resumo restrito ao gestor, sem dados pessoais do cliente nem credenciais.
create or replace function public.whirlpool_queue_admin_summary(p_company_id uuid)
 returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not public.whirlpool_is_company_manager(p_company_id) then
    raise exception 'Apenas gestor ativo pode consultar a fila Whirlpool';
  end if;
  return jsonb_build_object(
    'cancelled_review_count', (select count(*) from public.whirlpool_import_queue q where q.company_id=p_company_id and q.queue_reason='CANCELADA_30_DIAS' and q.state in ('PENDENTE','AGUARDANDO_CONEXAO_WHIRLPOOL')),
    'active_error_count', (select count(*) from public.whirlpool_import_queue q where q.company_id=p_company_id and q.queue_reason='ATIVA_NOVA' and q.state='ERRO'),
    'cancelled_review', coalesce((
      select jsonb_agg(jsonb_build_object('os',x.external_order_id,'status',x.service_status) order by x.created_at)
      from (select eo.external_order_id,eo.service_status,q.created_at
            from public.whirlpool_import_queue q join public.whirlpool_external_orders eo on eo.id=q.external_order_id
            where q.company_id=p_company_id and q.queue_reason='CANCELADA_30_DIAS' and q.state in ('PENDENTE','AGUARDANDO_CONEXAO_WHIRLPOOL')
            order by q.created_at limit 20) x
    ),'[]'::jsonb),
    'active_errors', coalesce((
      select jsonb_agg(jsonb_build_object('os',x.external_order_id,'code',x.last_error_code) order by x.created_at)
      from (select eo.external_order_id,q.last_error_code,q.created_at
            from public.whirlpool_import_queue q join public.whirlpool_external_orders eo on eo.id=q.external_order_id
            where q.company_id=p_company_id and q.queue_reason='ATIVA_NOVA' and q.state='ERRO'
            order by q.created_at limit 20) x
    ),'[]'::jsonb)
  );
end
$$;
revoke all on function public.whirlpool_queue_admin_summary(uuid) from public, anon, authenticated;
grant execute on function public.whirlpool_queue_admin_summary(uuid) to authenticated;
