-- Varredura automática do catálogo Whirlpool: o worker precisa saber, no
-- momento do claim, se já é hora de uma varredura completa de
-- reconciliação (todas as páginas, limite alto) ou se uma incremental
-- (limite menor, mais rápida) já basta -- sem reprocessar 100 páginas a
-- cada ~15 minutos. Os campos já existiam em whirlpool_connections
-- (search_limit_incremental/full, last_incremental/full_scan_at); só
-- faltava devolvê-los no claim, que já é a única leitura autenticada da
-- conexão que o worker faz antes de decidir o que fazer.
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
    'username',username,'password',password,'session_state',session_state,
    'search_limit_incremental',c.search_limit_incremental,'search_limit_full',c.search_limit_full,
    'last_incremental_scan_at',c.last_incremental_scan_at,'last_full_scan_at',c.last_full_scan_at);
end
$function$
;
revoke all on function public.whirlpool_worker_claim(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.whirlpool_worker_claim(uuid,uuid,integer) to service_role;
