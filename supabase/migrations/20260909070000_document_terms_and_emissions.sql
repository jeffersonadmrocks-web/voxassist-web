-- ============================================================
-- Matriz Mestra, Área 02 -- "Documentos da OS (Entrada/Orçamento/
-- Entrega) + Termos e Condições". Plano completo aprovado pelo
-- usuário (2026-09-09), execução por fases -- esta migration é o
-- item 2 da Fase 1 ("Arquitetura de Documentos da OS").
--
-- document_terms: versionado, NUNCA UPDATE -- nova versão = INSERT
-- novo, version = max(version)+1 pro (company_id, document_type).
-- "Versão atual" = maior version.
--
-- os_document_emissions: snapshot IMUTÁVEL por emissão de documento
-- -- sem policy de UPDATE/DELETE em nenhum papel. document_version
-- auto-incrementado por (service_order_id, document_type).
--
-- Achado importante: NÃO existe o texto oficial de Termos e
-- Condições em nenhum arquivo deste repositório (a especificação
-- original de 25 seções, de outra sessão, não está disponível aqui
-- pra copiar com segurança) -- semeado com corpo vazio/placeholder
-- pra cada empresa existente, sinalizado pra preenchimento real na
-- tela de Configurações (settings-document-terms-v0909.js). Nunca
-- inventado texto legal/contratual.
-- ============================================================

create table if not exists public.document_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null check (document_type in ('ENTRADA', 'ORCAMENTO', 'ENTREGA')),
  version int not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists document_terms_company_type_version_uk on public.document_terms(company_id, document_type, version);
create index if not exists document_terms_current_idx on public.document_terms(company_id, document_type, version desc);

alter table public.document_terms enable row level security;

drop policy if exists "document_terms_select_company" on public.document_terms;
create policy "document_terms_select_company" on public.document_terms
  for select to authenticated using (company_id = public.current_company_id());

-- Só INSERT (nunca UPDATE/DELETE) -- nova versão é sempre linha nova.
drop policy if exists "document_terms_insert_gestor" on public.document_terms;
create policy "document_terms_insert_gestor" on public.document_terms
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.is_company_gestor(company_id));

create table if not exists public.os_document_emissions (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null check (document_type in ('ENTRADA', 'ORCAMENTO', 'ENTREGA')),
  document_version int not null,
  terms_version int,
  terms_snapshot text,
  data_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id),
  channel text not null check (channel in ('IMPRESSO', 'PDF', 'WHATSAPP'))
);
create unique index if not exists os_document_emissions_version_uk on public.os_document_emissions(service_order_id, document_type, document_version);
create index if not exists os_document_emissions_os_idx on public.os_document_emissions(service_order_id, document_type, document_version desc);

alter table public.os_document_emissions enable row level security;

-- Leitura por qualquer usuário da empresa; ESCRITA só via RPC
-- security definer (create_os_document_emission) -- sem policy de
-- INSERT direta pra ninguém, e SEM NENHUMA policy de UPDATE/DELETE
-- em nenhum papel (imutável de verdade, nem gestor pode apagar).
drop policy if exists "os_document_emissions_select_company" on public.os_document_emissions;
create policy "os_document_emissions_select_company" on public.os_document_emissions
  for select to authenticated using (company_id = public.current_company_id());

create or replace function public.admin_create_document_terms_version(
  p_company_id uuid,
  p_document_type text,
  p_body text
) returns public.document_terms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.document_terms%rowtype;
  v_next_version int;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar Termos e Condições.';
  end if;
  if p_document_type not in ('ENTRADA', 'ORCAMENTO', 'ENTREGA') then
    raise exception 'Tipo de documento inválido.';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
    from public.document_terms where company_id = p_company_id and document_type = p_document_type;

  insert into public.document_terms (company_id, document_type, version, body, created_by)
    values (p_company_id, p_document_type, v_next_version, coalesce(p_body, ''), auth.uid())
    returning * into v_row;

  return v_row;
end;
$$;
comment on function public.admin_create_document_terms_version is
  'Cria uma nova versão dos Termos e Condições de um tipo de documento -- NUNCA sobrescreve a anterior (nova linha sempre, version=max+1). Gestor-only.';

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
  if p_document_type not in ('ENTRADA', 'ORCAMENTO', 'ENTREGA') then
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
  'Registra uma emissão IMUTÁVEL de documento da OS (Entrada/Orçamento/Entrega) -- snapshot dos dados + dos Termos vigentes no momento, nunca alterado depois. Qualquer usuário da empresa da OS pode emitir (mesmo padrão de acesso de hoje pra imprimir/enviar).';

grant execute on function public.admin_create_document_terms_version(uuid, text, text) to authenticated;
grant execute on function public.create_os_document_emission(uuid, text, jsonb, text) to authenticated;

-- Semeadura: version=1 vazia pra cada empresa existente, nos 3 tipos
-- -- placeholder explícito, preenchimento real fica pra tela de
-- Configurações. Sem isso, create_os_document_emission funcionaria
-- normalmente (terms_version/terms_snapshot ficam null), mas a
-- primeira emissão de cada empresa não teria NENHUM termo pra
-- mostrar até alguém cadastrar -- melhor já ter a linha (vazia) do
-- que a ausência completa.
insert into public.document_terms (company_id, document_type, version, body)
select c.id, t.document_type, 1, ''
from public.companies c
cross join (values ('ENTRADA'), ('ORCAMENTO'), ('ENTREGA')) as t(document_type)
on conflict (company_id, document_type, version) do nothing;

-- Semeia automaticamente pra empresa nova também, mesmo padrão já
-- usado em order_types/payment_methods/product_conditions.
create or replace function public.seed_default_document_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.document_terms (company_id, document_type, version, body)
  values
    (new.id, 'ENTRADA', 1, ''),
    (new.id, 'ORCAMENTO', 1, ''),
    (new.id, 'ENTREGA', 1, '');
  return new;
end;
$$;
drop trigger if exists trg_seed_document_terms on public.companies;
create trigger trg_seed_document_terms after insert on public.companies
  for each row execute function public.seed_default_document_terms();
