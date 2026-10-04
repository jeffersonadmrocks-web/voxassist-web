-- Parecer VOX usa o mesmo histórico imutável de emissões da OS.
alter table public.os_document_emissions drop constraint if exists os_document_emissions_document_type_check;
alter table public.os_document_emissions add constraint os_document_emissions_document_type_check
  check (document_type in ('ENTRADA', 'ORCAMENTO', 'ENTREGA', 'HISENSE', 'ASSURANT', 'PARECER_VOX'));

create or replace function public.create_os_document_emission(
  p_service_order_id uuid,
  p_document_type text,
  p_data_snapshot jsonb,
  p_channel text
) returns public.os_document_emissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_row public.os_document_emissions%rowtype;
  v_next_version int;
  v_terms record;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if p_document_type is null or p_document_type not in ('ENTRADA', 'ORCAMENTO', 'ENTREGA', 'HISENSE', 'ASSURANT', 'PARECER_VOX') then
    raise exception 'Tipo de documento inválido.';
  end if;
  if p_channel is null or p_channel not in ('IMPRESSO', 'PDF', 'WHATSAPP') then
    raise exception 'Canal inválido.';
  end if;

  select company_id into v_company_id from public.service_orders where id = p_service_order_id;
  if v_company_id is null then
    raise exception 'OS não encontrada.';
  end if;
  if v_company_id is distinct from public.current_company_id() then
    raise exception 'OS não pertence à empresa ativa.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_service_order_id::text || ':' || p_document_type, 0));

  select document_type, version, body into v_terms
    from public.document_terms
    where company_id = v_company_id and document_type = p_document_type
    order by version desc limit 1;

  select coalesce(max(document_version), 0) + 1 into v_next_version
    from public.os_document_emissions where service_order_id = p_service_order_id and document_type = p_document_type;

  insert into public.os_document_emissions
    (service_order_id, company_id, document_type, document_version, terms_version, terms_snapshot, data_snapshot, generated_by, channel)
    values (p_service_order_id, v_company_id, p_document_type, v_next_version, v_terms.version, v_terms.body, coalesce(p_data_snapshot, '{}'::jsonb), auth.uid(), p_channel)
    returning * into v_row;

  return v_row;
end;
$$;
comment on function public.create_os_document_emission is
  'Registra uma emissão IMUTÁVEL de documento da OS (Entrada/Orçamento/Entrega/Parecer Hisense/Parecer Assurant) -- snapshot dos dados + dos Termos vigentes no momento (quando existirem pro tipo), nunca alterado depois. Qualquer usuário da empresa da OS pode emitir (mesmo padrão de acesso de hoje pra imprimir/enviar).';

revoke all on function public.create_os_document_emission(uuid,text,jsonb,text) from public, anon;
grant execute on function public.create_os_document_emission(uuid,text,jsonb,text) to authenticated;
