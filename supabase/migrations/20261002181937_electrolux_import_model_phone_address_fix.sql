-- productName da API Electrolux contém o MODELO (ex.: IB54), não o tipo.
-- Normaliza telefone antes de aplicar máscara e separa endereço composto.
create or replace function public.electrolux_import_service_order(
  p_external_id text, p_order jsonb, p_connection_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := public.current_company_id();
  v_role text := public.current_company_role();
  v_permission boolean;
  v_conn public.electrolux_connections%rowtype;
  v_external public.external_appointments%rowtype;
  v_order public.service_orders%rowtype;
  v_client uuid;
  v_equipment uuid;
  v_svo text := nullif(btrim(p_order->>'svoNumber'),'');
  v_name text;
  v_phone text;
  v_digits text;
  v_type text;
  v_conn_count integer;
  v_street text;
  v_address_number text;
  v_complement text;
  v_address_parts text[];
begin
  if auth.uid() is null or v_company is null then
    raise exception 'Sessão ou empresa inválida' using errcode='42501';
  end if;
  select allowed into v_permission from public.user_permissions
    where user_id=auth.uid() and company_id=v_company and permission_key='os.create';
  if not (v_role='GESTOR' or coalesce(v_permission,v_role='ATENDENTE',false)) then
    raise exception 'Sem permissão para criar OS' using errcode='42501';
  end if;
  if nullif(btrim(p_external_id),'') is null or length(p_external_id)>100
    or jsonb_typeof(p_order) is distinct from 'object' then
    raise exception 'Dados da SVO inválidos';
  end if;

  -- Prefer the synchronized identity. Unsynchronized SVOs may be created from
  -- the authenticated Electrolux screen, with its single company connection.
  select * into v_external from public.external_appointments
    where company_id=v_company and origin='ELECTROLUX' and external_id=p_external_id;
  if v_external.id is not null then
    if v_svo is not null and v_external.external_order_number is not null
      and v_svo<>v_external.external_order_number then
      raise exception 'Número da SVO não corresponde ao atendimento';
    end if;
    v_svo := coalesce(v_external.external_order_number,v_svo);
    if p_connection_id is not null and v_external.connection_id is not null
      and p_connection_id<>v_external.connection_id then
      raise exception 'Conexão não corresponde ao atendimento';
    end if;
    p_connection_id := coalesce(v_external.connection_id,p_connection_id);
  end if;
  if p_connection_id is null then
    select count(*) into v_conn_count from public.electrolux_connections
      where company_id=v_company and active;
    if v_conn_count<>1 then
      raise exception 'Não foi possível determinar a conexão Electrolux desta empresa';
    end if;
    select id into p_connection_id from public.electrolux_connections
      where company_id=v_company and active;
  end if;
  select * into v_conn from public.electrolux_connections
    where id=p_connection_id and company_id=v_company and active;
  if v_conn.id is null then
    raise exception 'Conexão Electrolux não pertence à empresa ativa' using errcode='42501';
  end if;
  if v_svo is null or length(v_svo)>80 then raise exception 'Número da SVO obrigatório'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company::text||':electrolux:'||v_svo,0));
  select * into v_order from public.service_orders
    where company_id=v_company and electrolux_connection_id=v_conn.id
      and external_order_number=v_svo and source='ELECTROLUX';
  if v_order.id is not null then
    if v_role='TECNICO' and v_order.technician_id is distinct from auth.uid() then
      raise exception 'OS vinculada a outro técnico' using errcode='42501';
    end if;
    return jsonb_build_object('id',v_order.id,'os_number',v_order.os_number,'created',false);
  end if;
  if exists(select 1 from public.service_orders where company_id=v_company and
    (os_number=v_svo or (manufacturer='ELECTROLUX' and manufacturer_os_number=v_svo))) then
    raise exception 'Já existe uma OS com esta SVO. Confira o registro existente antes de importar';
  end if;
  v_name := coalesce(nullif(btrim(v_external.client_name),''),nullif(btrim(p_order->>'clientName'),''));
  if v_name is null then raise exception 'Nome do cliente não informado na SVO'; end if;
  v_phone := coalesce(nullif(btrim(v_external.client_phone),''),nullif(btrim(p_order->>'clientPhone'),''));
  v_digits := regexp_replace(coalesce(v_phone,''),'[^0-9]','','g');
  if length(v_digits) in (12,13) and left(v_digits,2)='55' then v_digits:=substr(v_digits,3); end if;
  v_phone := nullif(v_digits,'');
  v_street := coalesce(v_external.address_street,p_order->'address'->>'street');
  v_address_number := nullif(p_order->'address'->>'number','');
  v_complement := nullif(p_order->'address'->>'complement','');
  if v_address_number is null then
    v_address_parts := regexp_match(v_street,'^(.+),\s*([0-9]+[A-Za-z]?)(?:\s+|$)(.*)$');
    if v_address_parts is not null then
      v_street:=btrim(v_address_parts[1]);v_address_number:=v_address_parts[2];
      v_complement:=coalesce(v_complement,nullif(btrim(v_address_parts[3]),''));
    end if;
  end if;
  v_type := upper(coalesce(p_order->>'orderType',''));
  if v_type like '%FORA DE GARANTIA%' then v_type:='FORA DE GARANTIA';
  elsif v_type like '%SEGURADORA%' then v_type:='SEGURADORA';
  elsif v_type like '%GARANTIA%' then v_type:='GARANTIA';
  else raise exception 'Tipo de atendimento não informado. Confira os detalhes da SVO'; end if;

  if length(v_digits)>=10 then
    perform pg_advisory_xact_lock(hashtextextended(v_company::text||':client:'||v_digits,0));
    select id into v_client from public.clients
      where company_id=v_company and upper(btrim(name))=upper(v_name)
      and regexp_replace(regexp_replace(coalesce(phone_primary,''),'[^0-9]','','g'),'^55(?=[0-9]{10,11}$)','','g')=v_digits
      order by created_at limit 1;
  end if;
  if v_client is null then
    insert into public.clients(name,phone_primary,address,address_number,complement,neighborhood,city,state,company_id,created_by)
      values(upper(v_name),v_phone,
        v_street,v_address_number,v_complement,
        coalesce(v_external.address_neighborhood,p_order->'address'->>'neighborhood'),
        coalesce(v_external.address_city,p_order->'address'->>'city'),
        coalesce(v_external.address_state,p_order->'address'->>'state'),v_company,auth.uid())
      returning id into v_client;
  end if;
  insert into public.equipments(current_client_id,product_type,model,brand,company_id)
    values(v_client,'NÃO INFORMADO',coalesce(nullif(v_external.product_name,''),nullif(p_order->>'productName','')),'ELECTROLUX',v_company)
    returning id into v_equipment;
  -- Company is authoritative; no guessing a legacy store from the filial name.
  insert into public.service_orders(os_number,manufacturer_os_number,manufacturer,client_id,equipment_id,
    service_type,order_type,reported_defect,source,external_order_number,electrolux_connection_id,
    electrolux_status_raw,company_id,created_by,attendant_id,technician_id)
    values(v_svo,v_svo,'ELECTROLUX',v_client,v_equipment,'EXTERNO',v_type,
      coalesce(nullif(v_external.notes,''),p_order->>'claimedDefect'),'ELECTROLUX',v_svo,v_conn.id,
      coalesce(v_external.external_status_raw,p_order->>'status'),v_company,auth.uid(),auth.uid(),
      case when v_role='TECNICO' then auth.uid() else v_external.technician_id end)
    returning * into v_order;
  insert into public.os_financial(service_order_id) values(v_order.id)
    on conflict(service_order_id) do nothing;
  insert into public.audit_log(user_id,area,action,entity_type,entity_id,new_data,company_id)
    values(auth.uid(),'ELECTROLUX','IMPORTAR_OS','service_orders',v_order.id,
      jsonb_build_object('svo',v_svo,'connection_id',v_conn.id,'external_id',p_external_id,'order_type',v_type),v_company);
  return jsonb_build_object('id',v_order.id,'os_number',v_svo,'created',true);
end;
$$;
revoke all on function public.electrolux_import_service_order(text,jsonb,uuid) from public,anon;
grant execute on function public.electrolux_import_service_order(text,jsonb,uuid) to authenticated;
comment on function public.electrolux_import_service_order(text,jsonb,uuid) is
  'Importação manual autorizada por os.create, isolada por empresa/conexão, idempotente e auditada. Não importa valores nem altera OS existente.';
