alter table public.service_orders
  add column if not exists service_address_id uuid references public.client_addresses(id) on delete set null;

create unique index if not exists service_orders_company_whirlpool_uidx
  on public.service_orders(company_id, manufacturer_os_number)
  where manufacturer_os_number is not null and manufacturer_os_number like '7015%';

create or replace function public.whirlpool_import_pdf(
  p_filial text,
  p_payload jsonb,
  p_storage_path text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_conn public.whirlpool_connections%rowtype;
  v_ext public.whirlpool_external_orders%rowtype;
  v_queue public.whirlpool_import_queue%rowtype;
  v_client public.clients%rowtype;
  v_address public.client_addresses%rowtype;
  v_equipment public.equipments%rowtype;
  v_order public.service_orders%rowtype;
  v_appointment public.appointments%rowtype;
  v_number text := regexp_replace(coalesce(p_payload->>'externalOrderId', p_payload->>'numeroOS',''), '\D', '', 'g');
  v_doc text := regexp_replace(coalesce(p_payload#>>'{customer,document}',p_payload->>'documento',''), '\D', '', 'g');
  v_name text := coalesce(nullif(p_payload#>>'{customer,name}',''),nullif(p_payload->>'cliente',''),'CLIENTE IMPORTADO');
  v_brand text := upper(coalesce(nullif(p_payload->>'manufacturer',''),'WHIRLPOOL'));
  v_serial text := upper(coalesce(nullif(p_payload#>>'{equipment,serial}',''),nullif(p_payload->>'serie','')));
  v_date date;
  v_period text := upper(coalesce(nullif(p_payload->>'appointmentPeriod',''),nullif(p_payload->>'periodo','')));
  v_client_created boolean := false;
  v_address_created boolean := false;
  v_equipment_created boolean := false;
  v_order_created boolean := false;
  v_appointment_created boolean := false;
begin
  if coalesce(p_filial,'') <> 'SERRA' then raise exception 'Filial não autorizada'; end if;
  if v_number !~ '^7015[0-9]+$' then raise exception 'Número Whirlpool inválido'; end if;
  if v_doc = '' then raise exception 'CPF/CNPJ obrigatório para importação automática'; end if;
  if coalesce(p_storage_path,'') !~ ('^whirlpool/' || v_number || '/') then raise exception 'Caminho do PDF inválido'; end if;

  select * into v_conn from public.whirlpool_connections where filial=p_filial limit 1;
  if not found then raise exception 'Conexão Whirlpool não encontrada'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_conn.id::text || ':' || v_number,0));

  select * into v_ext from public.whirlpool_external_orders
   where connection_id=v_conn.id and external_order_id=v_number for update;
  if not found then raise exception 'OS não existe no catálogo Whirlpool'; end if;

  select * into v_queue from public.whirlpool_import_queue
   where external_order_id=v_ext.id and state='PENDENTE' for update;
  if not found then
    select * into v_order from public.service_orders
      where company_id=v_conn.company_id and manufacturer_os_number=v_number limit 1;
    if found then return jsonb_build_object('alreadyImported',true,'serviceOrderId',v_order.id,'externalOrderId',v_number); end if;
    raise exception 'OS não está pendente para importação';
  end if;

  select * into v_order from public.service_orders
    where company_id=v_conn.company_id and (manufacturer_os_number=v_number or os_number=v_number) limit 1;
  if found then
    update public.whirlpool_external_orders set service_order_id=v_order.id,updated_at=now() where id=v_ext.id;
    update public.whirlpool_import_queue set state='CONCLUIDO',service_order_id=v_order.id,completed_at=now(),updated_at=now() where id=v_queue.id;
    return jsonb_build_object('alreadyImported',true,'serviceOrderId',v_order.id,'externalOrderId',v_number);
  end if;

  select * into v_client from public.clients where company_id=v_conn.company_id and document_digits=v_doc limit 1;
  if not found then
    insert into public.clients(company_id,name,person_type,document,document_digits,email,phone_primary,
      zip_code,address,address_number,complement,neighborhood,city,state)
    values(v_conn.company_id,v_name,case when length(v_doc)=14 then 'PJ' else 'PF' end,v_doc,v_doc,
      nullif(p_payload#>>'{customer,email}',''),nullif(p_payload#>>'{customer,phone}',''),
      nullif(p_payload#>>'{customer,zipCode}',''),nullif(p_payload#>>'{customer,address}',''),
      nullif(p_payload#>>'{customer,addressNumber}',''),nullif(p_payload#>>'{customer,complement}',''),
      nullif(p_payload#>>'{customer,neighborhood}',''),nullif(p_payload#>>'{customer,city}',''),
      nullif(p_payload#>>'{customer,state}','')) returning * into v_client;
    v_client_created:=true;
  end if;

  select * into v_address from public.client_addresses
   where client_id=v_client.id
     and upper(coalesce(address,''))=upper(coalesce(p_payload#>>'{customer,address}',''))
     and upper(coalesce(address_number,''))=upper(coalesce(p_payload#>>'{customer,addressNumber}',''))
     and regexp_replace(coalesce(zip_code,''),'\D','','g')=regexp_replace(coalesce(p_payload#>>'{customer,zipCode}',''),'\D','','g')
     and upper(coalesce(complement,''))=upper(coalesce(p_payload#>>'{customer,complement}',''))
   limit 1;
  if not found then
    insert into public.client_addresses(client_id,label,zip_code,address,address_number,complement,neighborhood,city,state)
    values(v_client.id,'Whirlpool',nullif(p_payload#>>'{customer,zipCode}',''),nullif(p_payload#>>'{customer,address}',''),
      nullif(p_payload#>>'{customer,addressNumber}',''),nullif(p_payload#>>'{customer,complement}',''),
      nullif(p_payload#>>'{customer,neighborhood}',''),nullif(p_payload#>>'{customer,city}',''),
      nullif(p_payload#>>'{customer,state}','')) returning * into v_address;
    v_address_created:=true;
  end if;

  if v_serial <> '' then
    select * into v_equipment from public.equipments
      where company_id=v_conn.company_id and current_client_id=v_client.id and upper(coalesce(serial_number,''))=v_serial limit 1;
  end if;
  if v_equipment.id is null then
    insert into public.equipments(company_id,current_client_id,product_type,brand,model,serial_number,purchase_date,invoice_number,warranty_info,document_model)
    values(v_conn.company_id,v_client.id,
      coalesce(nullif(p_payload#>>'{equipment,productLine}',''),'EQUIPAMENTO'),v_brand,
      nullif(p_payload#>>'{equipment,model}',''),nullif(p_payload#>>'{equipment,serial}',''),
      nullif(p_payload#>>'{equipment,purchaseDate}','')::date,nullif(p_payload#>>'{equipment,invoiceNumber}',''),
      nullif(p_payload#>>'{service,orderType}',''),'WHIRLPOOL') returning * into v_equipment;
    v_equipment_created:=true;
  end if;

  insert into public.service_orders(company_id,store_id,os_number,manufacturer_os_number,manufacturer,client_id,equipment_id,
    service_address_id,service_type,product_location,reported_defect,technical_service,status,order_type,opened_at,internal_notes)
  values(v_conn.company_id,v_conn.store_id,v_number,v_number,v_brand,v_client.id,v_equipment.id,v_address.id,'EXTERNO','CONSUMIDOR',
    coalesce(nullif(p_payload#>>'{service,reportedDefect}',''),nullif(p_payload#>>'{service,complaint}','')),
    nullif(p_payload#>>'{service,complaint}',''),'AGUARDANDO ANALISE',
    coalesce(nullif(p_payload#>>'{service,orderType}',''),'GARANTIA'),
    coalesce(nullif(p_payload->>'entryDate','')::date,now()::date),
    case when upper(v_ext.service_status)='CANCELADO' then 'WHIRLPOOL: CANCELADA — REVISÃO OBRIGATÓRIA' else null end)
  returning * into v_order;
  v_order_created:=true;

  insert into public.manufacturer_imports(company_id,manufacturer,original_file_path,original_file_name,original_file_mime,
    extracted_data,confidence,service_order_id,import_status)
  values(v_conn.company_id,v_brand,p_storage_path,v_number||'.pdf','application/pdf',p_payload,
    '{"automatic":true,"requiredFields":"9/9"}'::jsonb,v_order.id,'IMPORTADO');

  insert into public.attachments(service_order_id,client_id,category,file_name,storage_path,mime_type,source)
  values(v_order.id,v_client.id,'OS_FABRICANTE',v_number||'.pdf',p_storage_path,'application/pdf','WHIRLPOOL_ROBOT');

  begin v_date:=nullif(p_payload->>'appointmentDate','')::date; exception when others then v_date:=null; end;
  if v_period not in ('MANHA','TARDE') then v_period:=null; end if;
  insert into public.appointments(service_order_id,appointment_date,period,status,appointment_type,duration_minutes,route_order)
  values(v_order.id,v_date,v_period,case when v_date is not null and v_period is not null then 'AGENDADO' else 'ABERTO' end,
    coalesce(nullif(p_payload->>'appointmentType',''),'VISITA NORMAL'),50,999)
  returning * into v_appointment;
  v_appointment_created:=true;

  update public.whirlpool_external_orders set service_order_id=v_order.id,updated_at=now() where id=v_ext.id;
  update public.whirlpool_import_queue set state='CONCLUIDO',service_order_id=v_order.id,completed_at=now(),updated_at=now() where id=v_queue.id;

  return jsonb_build_object('externalOrderId',v_number,'serviceOrderId',v_order.id,
    'created',jsonb_build_object('client',v_client_created,'address',v_address_created,'equipment',v_equipment_created,
      'serviceOrder',v_order_created,'appointment',v_appointment_created),
    'appointmentStatus',v_appointment.status,'addressLabel','Whirlpool');
end;
$$;
revoke all on function public.whirlpool_import_pdf(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.whirlpool_import_pdf(text,jsonb,text) to service_role;
