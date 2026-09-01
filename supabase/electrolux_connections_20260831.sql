-- ============================================================
-- Correção de regra + preparo de arquitetura para múltiplas conexões
-- Electrolux (2026-08-31). A conexão Electrolux atualmente conectada ao
-- VoxAssist só tem acesso aos dados da Vox Serra -- a filial de um caso
-- de NPS deve vir da CONEXÃO/ORIGEM da sincronização, nunca de uma
-- tentativa de descobrir por técnico/profiles.store_id/user_store_access
-- /cidade/endereço (todos esses caminhos estavam vazios de qualquer
-- forma -- ver achado do dia anterior).
--
-- electrolux_connections é o registro de qual(is) conexão(ões)
-- Electrolux existem, cada uma com filial fixa. Hoje só existe 1 linha
-- (Serra, a que já está em produção). Vitória fica preparada na
-- estrutura, mas SEM linha própria ainda -- só é criada quando houver
-- usuário/credencial Electrolux real e autorizado pra ela.
--
-- credential_secret_name é só o NOME do secret no Supabase (ex.:
-- 'ELECTROLUX_API_PASSWORD') -- nunca a credencial em si. A leitura
-- real da credencial continua via Deno.env nas edge functions, como já
-- era; este campo é só rastreabilidade/documentação de qual secret
-- pertence a qual conexão, pronta pro dia em que existirem 2 conjuntos.
-- ============================================================

create table if not exists public.electrolux_connections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filial text not null check (filial in ('VITORIA', 'SERRA')),
  company_id uuid not null references public.companies (id),
  credential_secret_name text,
  active boolean not null default true,
  auth_status text not null default 'NUNCA_TESTADO' check (auth_status in ('OK', 'FALHA', 'NUNCA_TESTADO')),
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nunca duas conexões ativas pra mesma filial ao mesmo tempo -- evita
-- ambiguidade de qual credencial usar pra Serra, por exemplo.
create unique index if not exists idx_electrolux_connections_active_filial
  on public.electrolux_connections (filial)
  where active;

comment on table public.electrolux_connections is
  'Cada linha é uma conexão Electrolux isolada, com filial fixa e credenciais próprias (nunca gravadas aqui -- só o nome do secret). A filial de um atendimento/caso de NPS vem sempre da conexão que o sincronizou, nunca de inferência por técnico ou endereço.';
comment on column public.electrolux_connections.credential_secret_name is
  'Nome do secret no Supabase que guarda a credencial real desta conexão -- nunca a credencial em si.';

alter table public.external_appointments
  add column if not exists connection_id uuid references public.electrolux_connections (id);
alter table public.nps_cases
  add column if not exists connection_id uuid references public.electrolux_connections (id);

comment on column public.external_appointments.connection_id is
  'Qual conexão Electrolux sincronizou este atendimento -- rastreabilidade, e futuramente parte da chave de deduplicação junto com external_id (hoje a chave única ainda é origin+external_id, porque só existe uma conexão; revisar quando Vitória for conectada de verdade).';
comment on column public.nps_cases.connection_id is
  'Conexão Electrolux de origem do caso -- mesma conexão do external_appointment vinculado.';

-- Semeia a conexão Serra (a que já está em produção) -- idempotente, só
-- insere se ainda não existir uma conexão ativa pra Serra.
insert into public.electrolux_connections (name, filial, company_id, credential_secret_name, active, auth_status)
select 'Electrolux Serra', 'SERRA', c.id, 'ELECTROLUX_API_PASSWORD', true, 'OK'
from public.companies c
where not exists (select 1 from public.electrolux_connections where filial = 'SERRA')
limit 1;

-- ------------------------------------------------------------
-- Backfill: vincula os atendimentos/casos Electrolux já existentes à
-- conexão Serra e corrige filial nos 17 casos de NPS, com auditoria
-- preservada em nps_case_history por caso (nunca um UPDATE silencioso).
-- ------------------------------------------------------------
do $$
declare
  v_connection_id uuid;
  v_case record;
begin
  select id into v_connection_id from public.electrolux_connections where filial = 'SERRA' limit 1;
  if v_connection_id is null then
    raise exception 'Conexão Serra não encontrada -- backfill abortado.';
  end if;

  update public.external_appointments
  set connection_id = v_connection_id
  where origin = 'ELECTROLUX' and connection_id is null;

  for v_case in
    select nc.id, nc.filial as old_filial, nc.connection_id as old_connection_id
    from public.nps_cases nc
    join public.external_appointments ea on ea.id = nc.external_appointment_id
    where ea.origin = 'ELECTROLUX'
      and (nc.filial is distinct from 'SERRA' or nc.connection_id is distinct from v_connection_id)
  loop
    update public.nps_cases
    set filial = 'SERRA', connection_id = v_connection_id, updated_at = now()
    where id = v_case.id;

    insert into public.nps_case_history (nps_case_id, action, previous_data, new_data, changed_by)
    values (
      v_case.id,
      'FILIAL_CORRIGIDA_CONEXAO_SERRA',
      jsonb_build_object('filial', v_case.old_filial, 'connection_id', v_case.old_connection_id),
      jsonb_build_object('filial', 'SERRA', 'connection_id', v_connection_id),
      null
    );
  end loop;
end $$;
