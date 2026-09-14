-- Controle online seguro do robô Whirlpool.
-- Senhas e sessões ficam criptografadas no Supabase Vault; nunca em public.whirlpool_connections.
alter table public.whirlpool_connections
  add column if not exists credential_username_secret_id uuid,
  add column if not exists credential_password_secret_id uuid,
  add column if not exists session_secret_id uuid,
  add column if not exists credential_version bigint not null default 0,
  add column if not exists login_attempted_credential_version bigint,
  add column if not exists connection_status text not null default 'NAO_CONFIGURADO',
  add column if not exists paused_at timestamptz,
  add column if not exists pause_reason text,
  add column if not exists last_auth_at timestamptz,
  add column if not exists last_auth_failure_at timestamptz,
  add column if not exists portal_retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists worker_id uuid,
  add column if not exists worker_lock_token uuid,
  add column if not exists worker_lock_expires_at timestamptz,
  add column if not exists worker_heartbeat_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_at timestamptz;
alter table public.whirlpool_connections drop constraint if exists whirlpool_connections_status_check;
alter table public.whirlpool_connections add constraint whirlpool_connections_status_check check
(connection_status in ('NAO_CONFIGURADO','PRONTO','CONECTADO','CREDENCIAIS_INVALIDAS','AGUARDANDO_CONEXAO_WHIRLPOOL','PAUSADO'));
alter table public.whirlpool_connections drop constraint if exists whirlpool_connections_retry_count_check;
alter table public.whirlpool_connections add constraint whirlpool_connections_retry_count_check check (portal_retry_count between 0 and 3);
comment on column public.whirlpool_connections.credential_password_secret_id is 'Referência ao Vault; a senha nunca é armazenada nesta tabela nem devolvida ao frontend.';
comment on column public.whirlpool_connections.login_attempted_credential_version is 'Impede mais de uma tentativa de senha para a mesma versão.';
comment on column public.whirlpool_connections.worker_lock_expires_at is 'Lease global: somente uma instância pode operar a conexão por vez.';

CREATE OR REPLACE FUNCTION public.whirlpool_connection_admin_status(p_company_id uuid)
 RETURNS TABLE(id uuid, company_id uuid, store_id uuid, filial text, external_partner_id text, active boolean, connection_status text, credentials_configured boolean, credential_version bigint, paused_at timestamp with time zone, pause_reason text, last_auth_at timestamp with time zone, last_auth_failure_at timestamp with time zone, portal_retry_count integer, next_retry_at timestamp with time zone, worker_online boolean, worker_heartbeat_at timestamp with time zone, last_incremental_scan_at timestamp with time zone, last_full_scan_at timestamp with time zone, last_error_code text, last_error_at timestamp with time zone, pending_imports bigint, waiting_connection_imports bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    (select count(*) from public.whirlpool_import_queue q where q.company_id=c.company_id and q.state in ('PENDENTE','PROCESSANDO')),
    (select count(*) from public.whirlpool_import_queue q where q.company_id=c.company_id and q.state='AGUARDANDO_CONEXAO_WHIRLPOOL')
  from public.whirlpool_connections c
  where c.company_id=p_company_id
  order by c.created_at;
end
$function$
;
revoke all on function public.whirlpool_connection_admin_status(uuid) from public, anon;
grant execute on function public.whirlpool_connection_admin_status(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.whirlpool_is_company_manager(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.user_companies uc
    join public.profiles p on p.id = uc.user_id
    where uc.user_id = (select auth.uid())
      and uc.company_id = p_company_id
      and uc.active = true
      and upper(coalesce(uc.role, p.role, '')) = 'GESTOR'
      and p.active = true
  )
$function$
;
revoke all on function public.whirlpool_is_company_manager(uuid) from public, anon;
grant execute on function public.whirlpool_is_company_manager(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.whirlpool_save_credentials(p_connection_id uuid, p_username text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.whirlpool_connections;
  username_id uuid;
  password_id uuid;
  new_version bigint;
begin
  select * into c from public.whirlpool_connections where id=p_connection_id for update;
  if not found then raise exception 'Conexão Whirlpool não encontrada'; end if;
  if not public.whirlpool_is_company_manager(c.company_id) then
    raise exception 'Apenas gestor ativo pode alterar credenciais Whirlpool';
  end if;
  if length(trim(coalesce(p_username,''))) < 2 or length(p_username) > 200 then
    raise exception 'Usuário Whirlpool inválido';
  end if;
  if length(coalesce(p_password,'')) < 4 or length(p_password) > 500 then
    raise exception 'Senha Whirlpool inválida';
  end if;

  if c.credential_username_secret_id is null then
    select vault.create_secret(trim(p_username), 'whirlpool_username_'||c.id::text,
      'Usuário Whirlpool protegido — conexão '||c.id::text) into username_id;
  else
    username_id := c.credential_username_secret_id;
    perform vault.update_secret(username_id, trim(p_username));
  end if;
  if c.credential_password_secret_id is null then
    select vault.create_secret(p_password, 'whirlpool_password_'||c.id::text,
      'Senha Whirlpool protegida — conexão '||c.id::text) into password_id;
  else
    password_id := c.credential_password_secret_id;
    perform vault.update_secret(password_id, p_password);
  end if;

  new_version := c.credential_version + 1;
  update public.whirlpool_connections
  set credential_username_secret_id=username_id,
      credential_password_secret_id=password_id,
      credential_version=new_version,
      login_attempted_credential_version=null,
      connection_status='PRONTO',
      paused_at=null,pause_reason=null,
      portal_retry_count=0,next_retry_at=null,
      last_error_code=null,last_error_at=null,
      worker_lock_token=null,worker_lock_expires_at=null,
      updated_at=now()
  where id=c.id;

  update public.whirlpool_import_queue
     set state='PENDENTE', next_attempt_at=now(), updated_at=now()
   where company_id=c.company_id and state='AGUARDANDO_CONEXAO_WHIRLPOOL';

  insert into public.whirlpool_sync_events(company_id,connection_id,event_type,event_data)
  values(c.company_id,c.id,'CREDENTIALS_UPDATED',
    jsonb_build_object('credential_version',new_version,'changed_by',(select auth.uid())));

  return jsonb_build_object('ok',true,'credential_version',new_version,'connection_status','PRONTO');
end
$function$
;
revoke all on function public.whirlpool_save_credentials(uuid,text,text) from public, anon;
grant execute on function public.whirlpool_save_credentials(uuid,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.whirlpool_set_paused(p_connection_id uuid, p_paused boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.whirlpool_connections;
begin
  select * into c from public.whirlpool_connections where id=p_connection_id for update;
  if not found then raise exception 'Conexão Whirlpool não encontrada'; end if;
  if not public.whirlpool_is_company_manager(c.company_id) then
    raise exception 'Apenas gestor ativo pode pausar a integração Whirlpool';
  end if;
  update public.whirlpool_connections set
    connection_status=case when p_paused then 'PAUSADO'
      when credential_password_secret_id is null then 'NAO_CONFIGURADO' else 'PRONTO' end,
    paused_at=case when p_paused then now() else null end,
    pause_reason=case when p_paused then 'PAUSADO_PELO_GESTOR' else null end,
    worker_lock_token=null,worker_lock_expires_at=null,updated_at=now()
  where id=c.id;
  insert into public.whirlpool_sync_events(company_id,connection_id,event_type,event_data)
  values(c.company_id,c.id,case when p_paused then 'ROBOT_PAUSED' else 'ROBOT_RESUMED' end,
    jsonb_build_object('changed_by',(select auth.uid())));
  return jsonb_build_object('ok',true,'paused',p_paused);
end
$function$
;
revoke all on function public.whirlpool_set_paused(uuid,boolean) from public, anon;
grant execute on function public.whirlpool_set_paused(uuid,boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.whirlpool_worker_claim(p_connection_id uuid, p_worker_id uuid, p_lease_seconds integer DEFAULT 240)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.whirlpool_connections; token uuid:=gen_random_uuid();
  username text; password text; session_state text; needs_login boolean;
begin
  if coalesce(p_lease_seconds,0) < 60 or p_lease_seconds > 900 then
    raise exception 'Lease inválido';
  end if;
  select * into c from public.whirlpool_connections where id=p_connection_id for update skip locked;
  if not found then return jsonb_build_object('claimed',false,'reason','BUSY'); end if;
  if not c.active or c.connection_status in ('NAO_CONFIGURADO','PAUSADO','CREDENCIAIS_INVALIDAS') then
    return jsonb_build_object('claimed',false,'reason',c.connection_status);
  end if;
  if c.next_retry_at is not null and c.next_retry_at > now() then
    return jsonb_build_object('claimed',false,'reason','BACKOFF','next_retry_at',c.next_retry_at);
  end if;
  if c.worker_lock_expires_at is not null and c.worker_lock_expires_at > now() then
    return jsonb_build_object('claimed',false,'reason','BUSY');
  end if;
  needs_login := c.session_secret_id is null;
  if needs_login and c.login_attempted_credential_version = c.credential_version then
    return jsonb_build_object('claimed',false,'reason','LOGIN_ALREADY_ATTEMPTED');
  end if;

  select decrypted_secret into username from vault.decrypted_secrets where id=c.credential_username_secret_id;
  select decrypted_secret into password from vault.decrypted_secrets where id=c.credential_password_secret_id;
  if c.session_secret_id is not null then
    select decrypted_secret into session_state from vault.decrypted_secrets where id=c.session_secret_id;
  end if;
  if username is null or password is null then
    return jsonb_build_object('claimed',false,'reason','CREDENTIALS_MISSING');
  end if;

  update public.whirlpool_connections set worker_id=p_worker_id,worker_lock_token=token,
    worker_lock_expires_at=now()+make_interval(secs=>p_lease_seconds),
    worker_heartbeat_at=now(),
    login_attempted_credential_version=case when needs_login then credential_version else login_attempted_credential_version end,
    updated_at=now()
  where id=c.id;

  return jsonb_build_object('claimed',true,'lock_token',token,'filial',c.filial,
    'credential_version',c.credential_version,'needs_login',needs_login,
    'username',username,'password',password,'session_state',session_state);
end
$function$
;
revoke all on function public.whirlpool_worker_claim(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.whirlpool_worker_claim(uuid,uuid,integer) to service_role;

CREATE OR REPLACE FUNCTION public.whirlpool_worker_report(p_connection_id uuid, p_lock_token uuid, p_outcome text, p_session_state text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.whirlpool_connections; session_id uuid; delay_minutes integer;
begin
  select * into c from public.whirlpool_connections
   where id=p_connection_id and worker_lock_token=p_lock_token for update;
  if not found then raise exception 'Lease Whirlpool inválido ou expirado'; end if;

  if p_outcome='AUTH_OK' then
    session_id:=c.session_secret_id;
    if p_session_state is not null and length(p_session_state)>2 then
      if session_id is null then
        select vault.create_secret(p_session_state,'whirlpool_session_'||c.id::text,
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
revoke all on function public.whirlpool_worker_report(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.whirlpool_worker_report(uuid,uuid,text,text,text) to service_role;

