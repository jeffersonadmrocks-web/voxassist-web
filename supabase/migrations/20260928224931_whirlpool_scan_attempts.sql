-- Diferencia uma tentativa ampla limitada pelo SAP de uma varredura completa.
alter table public.whirlpool_connections
  add column if not exists last_full_scan_attempt_at timestamptz;

create or replace function public.whirlpool_ingest_catalog(
  p_filial text,
  p_items jsonb,
  p_full_scan boolean default false,
  p_limit_reached boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_connection public.whirlpool_connections%rowtype;
  v_item jsonb;
  v_external public.whirlpool_external_orders%rowtype;
  v_total int := 0;
  v_queued int := 0;
  v_existing_service_order uuid;
  v_entry_date date;
  v_reason text;
  v_rejected jsonb := '[]'::jsonb;
  v_external_order_id text;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items deve ser um array JSON';
  end if;
  if jsonb_array_length(p_items) > 5000 then
    raise exception 'Lote excede 5000 itens';
  end if;

  select * into strict v_connection
  from public.whirlpool_connections
  where upper(filial) = upper(trim(p_filial)) and active = true;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_external_order_id := v_item->>'externalOrderId';

    if coalesce(v_external_order_id,'') !~ '^7015[0-9]{6}$' then
      v_rejected := v_rejected || jsonb_build_object('externalOrderId',v_external_order_id,'reason','NUMERO_EXTERNO_INVALIDO');
      continue;
    end if;
    if coalesce(v_item->>'serviceStatus','') not in
      ('Agendar','Em processo AT','Agendado','Cancelado','Liquidado') then
      v_rejected := v_rejected || jsonb_build_object('externalOrderId',v_external_order_id,'reason','STATUS_INVALIDO','serviceStatus',v_item->>'serviceStatus');
      continue;
    end if;
    if coalesce(v_item->>'disposition','') not in
      ('IMPORTAR_ATIVA','REVISAR_CANCELADA_30_DIAS','HISTORICO_EXTERNO') then
      v_rejected := v_rejected || jsonb_build_object('externalOrderId',v_external_order_id,'reason','CLASSIFICACAO_INVALIDA','disposition',v_item->>'disposition');
      continue;
    end if;

    v_entry_date := nullif(v_item->>'entryDate','')::date;
    v_reason := nullif(v_item->>'queueReason','');

    if v_reason is not null and v_reason not in ('ATIVA_NOVA','CANCELADA_30_DIAS') then
      v_rejected := v_rejected || jsonb_build_object('externalOrderId',v_external_order_id,'reason','MOTIVO_FILA_INVALIDO','queueReason',v_reason);
      continue;
    end if;

    select so.id into v_existing_service_order
    from public.service_orders so
    where so.company_id = v_connection.company_id
      and (
        so.manufacturer_os_number = v_external_order_id
        or so.os_number = v_external_order_id
      )
    order by (so.manufacturer_os_number = v_external_order_id) desc
    limit 1;

    insert into public.whirlpool_external_orders (
      connection_id, company_id, store_id, external_order_id,
      process_type, service_status, entry_date, service_order_id,
      first_seen_at, last_seen_at, consecutive_absences, deletion_state,
      source_snapshot
    ) values (
      v_connection.id, v_connection.company_id, v_connection.store_id,
      v_external_order_id, nullif(v_item->>'processType',''),
      v_item->>'serviceStatus', v_entry_date, v_existing_service_order,
      now(), now(), 0, 'PRESENTE',
      jsonb_build_object('disposition',v_item->>'disposition')
    )
    on conflict (connection_id, external_order_id) do update
    set process_type = excluded.process_type,
        entry_date = excluded.entry_date,
        service_order_id = coalesce(public.whirlpool_external_orders.service_order_id, excluded.service_order_id),
        status_changed_at = case
          when public.whirlpool_external_orders.service_status is distinct from excluded.service_status
          then now() else public.whirlpool_external_orders.status_changed_at end,
        service_status = excluded.service_status,
        last_seen_at = now(),
        consecutive_absences = 0,
        deletion_state = 'PRESENTE',
        deletion_recheck_due_at = null,
        source_snapshot = excluded.source_snapshot,
        updated_at = now()
    returning * into v_external;

    if v_reason is not null and v_existing_service_order is null then
      insert into public.whirlpool_import_queue (
        external_order_id, company_id, store_id, queue_reason, state
      ) values (
        v_external.id, v_connection.company_id, v_connection.store_id,
        v_reason, 'PENDENTE'
      )
      on conflict (external_order_id, queue_reason)
        where state in ('PENDENTE','PROCESSANDO','AGUARDANDO_OPERADOR','AGUARDANDO_CONEXAO_WHIRLPOOL','ERRO')
      do nothing;
      if found then v_queued := v_queued + 1; end if;
    end if;

    v_total := v_total + 1;
  end loop;

  update public.whirlpool_connections
  set last_full_scan_attempt_at = case when p_full_scan then now() else last_full_scan_attempt_at end,
      last_full_scan_at = case when p_full_scan and not p_limit_reached then now() else last_full_scan_at end,
      last_incremental_scan_at = now(),
      updated_at = now()
  where id = v_connection.id;

  insert into public.whirlpool_sync_events(company_id, connection_id, event_type, event_data)
  values (
    v_connection.company_id, v_connection.id, 'CATALOG_INGESTED',
    jsonb_build_object(
      'total', v_total, 'queued', v_queued, 'fullScan', p_full_scan,
      'limitReached', p_limit_reached,
      'rejected', v_rejected,
      'absenceReconciliationSkipped', (not p_full_scan or p_limit_reached)
    )
  );

  return jsonb_build_object(
    'total', v_total,
    'queued', v_queued,
    'fullScan', p_full_scan,
    'limitReached', p_limit_reached,
    'rejected', v_rejected
  );
end;
$$;

revoke all on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) from public;
revoke all on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) from anon;
revoke all on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) from authenticated;
grant execute on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) to service_role;

comment on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) is
  'Recebe somente catálogo sanitizado do worker; não cria clientes, equipamentos nem service_orders. Itens inválidos são pulados individualmente (ver "rejected" no retorno), nunca travam o lote inteiro.';

CREATE OR REPLACE FUNCTION public.whirlpool_worker_claim(p_connection_id uuid, p_worker_id uuid, p_lease_seconds integer DEFAULT 240)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.whirlpool_connections; token uuid:=gen_random_uuid();
  username text; password text; session_state text; needs_login boolean;
  login_lock_active boolean;
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
  login_lock_active := needs_login and c.login_attempted_credential_version = c.credential_version
    and c.login_attempted_at is not null and c.login_attempted_at > now() - interval '25 minutes';
  if login_lock_active then
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
    login_attempted_at=case when needs_login then now() else login_attempted_at end,
    updated_at=now()
  where id=c.id;

  return jsonb_build_object('claimed',true,'lock_token',token,'filial',c.filial,
    'credential_version',c.credential_version,'needs_login',needs_login,
    'username',username,'password',password,'session_state',session_state,
    'search_limit_incremental',c.search_limit_incremental,'search_limit_full',c.search_limit_full,
    'last_incremental_scan_at',c.last_incremental_scan_at,'last_full_scan_at',c.last_full_scan_at,
    'last_full_scan_attempt_at',c.last_full_scan_attempt_at,
    'external_partner_id',c.external_partner_id);
end
$function$
;
revoke all on function public.whirlpool_worker_claim(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.whirlpool_worker_claim(uuid,uuid,integer) to service_role;

