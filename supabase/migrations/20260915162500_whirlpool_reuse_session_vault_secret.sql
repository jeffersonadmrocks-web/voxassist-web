CREATE OR REPLACE FUNCTION public.whirlpool_worker_report(p_connection_id uuid, p_lock_token uuid, p_outcome text, p_session_state text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.whirlpool_connections; session_id uuid; delay_minutes integer; session_name text;
begin
  select * into c from public.whirlpool_connections
   where id=p_connection_id and worker_lock_token=p_lock_token for update;
  if not found then raise exception 'Lease Whirlpool inválido ou expirado'; end if;

  if p_outcome='AUTH_OK' then
    session_id:=c.session_secret_id;
    if p_session_state is not null and length(p_session_state)>2 then
      session_name:='whirlpool_session_'||c.id::text;
      if session_id is null then
        select id into session_id
          from vault.decrypted_secrets
         where name=session_name
         limit 1;
      end if;
      if session_id is null then
        select vault.create_secret(p_session_state,session_name,
          'Sessão Playwright Whirlpool protegida — conexão '||c.id::text) into session_id;
      else
        perform vault.update_secret(session_id,p_session_state);
      end if;
    end if;
    update public.whirlpool_connections set session_secret_id=session_id,
      connection_status='CONECTADO',paused_at=null,pause_reason=null,last_auth_at=now(),
      portal_retry_count=0,next_retry_at=null,last_error_code=null,last_error_at=null,
      worker_lock_token=null,worker_lock_expires_at=null,worker_heartbeat_at=now(),updated_at=now()
    where id=c.id;
    update public.whirlpool_import_queue set state='PENDENTE',next_attempt_at=now(),updated_at=now()
     where company_id=c.company_id and state='AGUARDANDO_CONEXAO_WHIRLPOOL';

  elsif p_outcome='CREDENCIAIS_INVALIDAS' then
    update public.whirlpool_connections set connection_status='CREDENCIAIS_INVALIDAS',
      paused_at=now(),pause_reason='CREDENCIAIS_INVALIDAS',last_auth_failure_at=now(),
      next_retry_at=null,last_error_code='CREDENCIAIS_INVALIDAS',last_error_at=now(),
      worker_lock_token=null,worker_lock_expires_at=null,worker_heartbeat_at=now(),updated_at=now()
    where id=c.id;
    update public.whirlpool_import_queue set state='AGUARDANDO_CONEXAO_WHIRLPOOL',
      next_attempt_at=null,last_error_code='CREDENCIAIS_INVALIDAS',
      last_error_message='Integração pausada até o gestor atualizar as credenciais Whirlpool',updated_at=now()
     where company_id=c.company_id and state in ('PENDENTE','PROCESSANDO');

  elsif p_outcome='PORTAL_INDISPONIVEL' then
    delay_minutes:=case c.portal_retry_count when 0 then 5 when 1 then 15 else 45 end;
    update public.whirlpool_connections set connection_status='AGUARDANDO_CONEXAO_WHIRLPOOL',
      portal_retry_count=least(portal_retry_count+1,3),
      next_retry_at=now()+make_interval(mins=>delay_minutes),
      login_attempted_credential_version=null,
      last_error_code=coalesce(nullif(p_error_code,''),'PORTAL_INDISPONIVEL'),last_error_at=now(),
      worker_lock_token=null,worker_lock_expires_at=null,worker_heartbeat_at=now(),updated_at=now()
    where id=c.id;
    update public.whirlpool_import_queue set state='AGUARDANDO_CONEXAO_WHIRLPOOL',
      next_attempt_at=now()+make_interval(mins=>delay_minutes),
      last_error_code=coalesce(nullif(p_error_code,''),'PORTAL_INDISPONIVEL'),
      last_error_message='Whirlpool indisponível; VoxAssist continua operando',updated_at=now()
     where company_id=c.company_id and state in ('PENDENTE','PROCESSANDO');

  elsif p_outcome='SESSION_EXPIRED' then
    update public.whirlpool_connections set session_secret_id=null,connection_status='PRONTO',
      login_attempted_credential_version=null,next_retry_at=now()+interval '1 minute',
      last_error_code='SESSION_EXPIRED',last_error_at=now(),
      worker_lock_token=null,worker_lock_expires_at=null,worker_heartbeat_at=now(),updated_at=now()
    where id=c.id;

  else
    update public.whirlpool_connections set worker_lock_token=null,worker_lock_expires_at=null,
      worker_heartbeat_at=now(),updated_at=now() where id=c.id;
  end if;

  insert into public.whirlpool_sync_events(company_id,connection_id,event_type,event_data)
  values(c.company_id,c.id,'WORKER_'||p_outcome,
    jsonb_strip_nulls(jsonb_build_object('error_code',p_error_code,'retry_count',
      case when p_outcome='PORTAL_INDISPONIVEL' then least(c.portal_retry_count+1,3) else c.portal_retry_count end)));
  return jsonb_build_object('ok',true,'outcome',p_outcome);
end
$function$
;