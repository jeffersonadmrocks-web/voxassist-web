-- ============================================================
-- Fase C (Hisense/Gorenje + Assurant) -- item 1: estender o tipo de
-- documento já existente em os_document_emissions (Matriz Mestra,
-- Área 02, migration 20260909070000) em vez de criar tabela nova.
--
-- Achado na investigação: qualquer OS pode precisar gerar um PARECER
-- TÉCNICO pra Hisense/Gorenje ou pra Assurant (seguradora) -- não é
-- um tipo de OS separado nem precisa de fidelidade a um PDF externo
-- do fabricante (isso é exclusividade do Whirlpool, já resolvida nas
-- Fases B). É só mais um tipo de documento emitido a partir dos
-- MESMOS dados canônicos da OS (cliente/equipamento/defeito/técnico),
-- com um punhado de campos extras específicos -- exatamente o que
-- data_snapshot (jsonb, já pensado pra isso) foi desenhado pra
-- guardar, sem precisar de coluna nova.
--
-- HISENSE/ASSURANT não usam document_terms (Termos e Condições) --
-- são pareceres técnicos internos pro fabricante/seguradora, não
-- contratos com o cliente final. create_os_document_emission já lida
-- bem com isso: se não achar nenhuma linha em document_terms pro tipo,
-- grava terms_version/terms_snapshot como NULL (ambos são colunas
-- nullable) -- não precisa e não deve mexer em document_terms.
-- ============================================================

alter table public.os_document_emissions drop constraint if exists os_document_emissions_document_type_check;
alter table public.os_document_emissions add constraint os_document_emissions_document_type_check
  check (document_type in ('ENTRADA', 'ORCAMENTO', 'ENTREGA', 'HISENSE', 'ASSURANT'));

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
  if p_document_type not in ('ENTRADA', 'ORCAMENTO', 'ENTREGA', 'HISENSE', 'ASSURANT') then
    raise exception 'Tipo de documento inválido.';
  end if;
  if p_channel not in ('IMPRESSO', 'PDF', 'WHATSAPP') then
    raise exception 'Canal inválido.';
  end if;

  select company_id into v_company_id from public.service_orders where id = p_service_order_id;
  if v_company_id is null then
    raise exception 'OS não encontrada.';
  end if;
  if v_company_id <> public.current_company_id() then
    raise exception 'OS não pertence à empresa ativa.';
  end if;

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
