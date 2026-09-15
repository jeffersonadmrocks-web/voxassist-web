-- Ingestão idempotente do catálogo sanitizado Whirlpool.
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
    if coalesce(v_item->>'externalOrderId','') !~ '^7015[0-9]{6}$' then
      raise exception 'Número externo inválido';
    end if;
    if coalesce(v_item->>'serviceStatus','') not in
      ('Agendar','Em processo AT','Agendado','Cancelado','Liquidado') then
      raise exception 'Status de serviço inválido para %', v_item->>'externalOrderId';
    end if;
    if coalesce(v_item->>'disposition','') not in
      ('IMPORTAR_ATIVA','REVISAR_CANCELADA_30_DIAS','HISTORICO_EXTERNO') then
      raise exception 'Classificação inválida para %', v_item->>'externalOrderId';
    end if;

    v_entry_date := nullif(v_item->>'entryDate','')::date;
    v_reason := nullif(v_item->>'queueReason','');

    select so.id into v_existing_service_order
    from public.service_orders so
    where so.company_id = v_connection.company_id
      and (
        so.manufacturer_os_number = v_item->>'externalOrderId'
        or so.os_number = v_item->>'externalOrderId'
      )
    order by (so.manufacturer_os_number = v_item->>'externalOrderId') desc
    limit 1;

    insert into public.whirlpool_external_orders (
      connection_id, company_id, store_id, external_order_id,
      process_type, service_status, entry_date, service_order_id,
      first_seen_at, last_seen_at, consecutive_absences, deletion_state,
      source_snapshot
    ) values (
      v_connection.id, v_connection.company_id, v_connection.store_id,
      v_item->>'externalOrderId', nullif(v_item->>'processType',''),
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
      if v_reason not in ('ATIVA_NOVA','CANCELADA_30_DIAS') then
        raise exception 'Motivo de fila inválido para %', v_item->>'externalOrderId';
      end if;
      insert into public.whirlpool_import_queue (
        external_order_id, company_id, store_id, queue_reason, state
      ) values (
        v_external.id, v_connection.company_id, v_connection.store_id,
        v_reason, 'PENDENTE'
      )
      on conflict (external_order_id, queue_reason)
        where state in ('PENDENTE','PROCESSANDO','AGUARDANDO_OPERADOR','ERRO')
      do nothing;
      if found then v_queued := v_queued + 1; end if;
    end if;

    v_total := v_total + 1;
  end loop;

  update public.whirlpool_connections
  set last_full_scan_at = case when p_full_scan then now() else last_full_scan_at end,
      last_incremental_scan_at = case when not p_full_scan then now() else last_incremental_scan_at end,
      updated_at = now()
  where id = v_connection.id;

  insert into public.whirlpool_sync_events(company_id, connection_id, event_type, event_data)
  values (
    v_connection.company_id, v_connection.id, 'CATALOG_INGESTED',
    jsonb_build_object(
      'total', v_total, 'queued', v_queued, 'fullScan', p_full_scan,
      'limitReached', p_limit_reached,
      'absenceReconciliationSkipped', (not p_full_scan or p_limit_reached)
    )
  );

  return jsonb_build_object(
    'total', v_total,
    'queued', v_queued,
    'fullScan', p_full_scan,
    'limitReached', p_limit_reached
  );
end;
$$;

revoke all on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) from public;
revoke all on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) from anon;
revoke all on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) from authenticated;
grant execute on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) to service_role;

comment on function public.whirlpool_ingest_catalog(text,jsonb,boolean,boolean) is
  'Recebe somente catálogo sanitizado do worker; não cria clientes, equipamentos nem service_orders.';
