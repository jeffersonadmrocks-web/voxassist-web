-- Fundação do robô Whirlpool: catálogo externo, filas e auditoria.
-- Nenhuma tabela abaixo altera automaticamente service_orders.
-- Escritas do worker usam service_role; usuários autenticados têm leitura por empresa.

create table if not exists public.whirlpool_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete restrict,
  filial text not null,
  external_partner_id text,
  active boolean not null default true,
  search_limit_incremental integer not null default 100 check (search_limit_incremental between 1 and 10000),
  search_limit_full integer not null default 1000 check (search_limit_full between 1 and 10000),
  last_incremental_scan_at timestamptz,
  last_full_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, filial)
);

create table if not exists public.whirlpool_external_orders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.whirlpool_connections(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete restrict,
  external_order_id text not null check (external_order_id ~ '^7015[0-9]{6}$'),
  process_type text,
  service_status text not null default '',
  entry_date date,
  service_order_id uuid references public.service_orders(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status_changed_at timestamptz,
  consecutive_absences integer not null default 0 check (consecutive_absences >= 0),
  deletion_state text not null default 'PRESENTE'
    check (deletion_state in ('PRESENTE','SUSPEITA_DE_EXCLUSAO','EXCLUSAO_CONFIRMADA')),
  deletion_recheck_due_at timestamptz,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_order_id)
);

create index if not exists whirlpool_external_orders_company_status_idx
  on public.whirlpool_external_orders(company_id, service_status, entry_date desc);
create index if not exists whirlpool_external_orders_unlinked_idx
  on public.whirlpool_external_orders(company_id, entry_date desc)
  where service_order_id is null;

create table if not exists public.whirlpool_import_queue (
  id uuid primary key default gen_random_uuid(),
  external_order_id uuid not null references public.whirlpool_external_orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete restrict,
  queue_reason text not null
    check (queue_reason in ('ATIVA_NOVA','CANCELADA_30_DIAS','REPROCESSAR_PDF')),
  state text not null default 'PENDENTE'
    check (state in ('PENDENTE','PROCESSANDO','AGUARDANDO_OPERADOR','CONCLUIDO','IGNORADO','ERRO')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  service_order_id uuid references public.service_orders(id) on delete set null,
  completed_at timestamptz,
  manual_completed_by uuid,
  manual_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whirlpool_import_queue_open_unique
  on public.whirlpool_import_queue(external_order_id, queue_reason)
  where state in ('PENDENTE','PROCESSANDO','AGUARDANDO_OPERADOR','ERRO');
create index if not exists whirlpool_import_queue_work_idx
  on public.whirlpool_import_queue(state, next_attempt_at, created_at);

create table if not exists public.whirlpool_appointment_sync_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete restrict,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  external_order_id uuid not null references public.whirlpool_external_orders(id) on delete cascade,
  operation text not null default 'UPSERT' check (operation = 'UPSERT'),
  desired_date date not null,
  desired_period text not null check (desired_period in ('MANHA','TARDE')),
  desired_technician_id uuid,
  desired_technician_name text not null,
  state text not null default 'PENDENTE'
    check (state in ('PENDENTE','PROCESSANDO','PENDENTE_MANUAL_WHIRLPOOL','CONCLUIDO','ERRO')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  portal_confirmed_at timestamptz,
  manual_completed_by uuid,
  manual_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whirlpool_appointment_sync_open_unique
  on public.whirlpool_appointment_sync_queue(service_order_id)
  where state in ('PENDENTE','PROCESSANDO','PENDENTE_MANUAL_WHIRLPOOL','ERRO');
create index if not exists whirlpool_appointment_sync_work_idx
  on public.whirlpool_appointment_sync_queue(state, next_attempt_at, created_at);

create table if not exists public.whirlpool_sync_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid references public.whirlpool_connections(id) on delete set null,
  external_order_id uuid references public.whirlpool_external_orders(id) on delete set null,
  service_order_id uuid references public.service_orders(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.whirlpool_connections enable row level security;
alter table public.whirlpool_external_orders enable row level security;
alter table public.whirlpool_import_queue enable row level security;
alter table public.whirlpool_appointment_sync_queue enable row level security;
alter table public.whirlpool_sync_events enable row level security;

drop policy if exists whirlpool_connections_select_company on public.whirlpool_connections;
create policy whirlpool_connections_select_company on public.whirlpool_connections
  for select to authenticated using (company_id = current_company_id());

drop policy if exists whirlpool_external_orders_select_company on public.whirlpool_external_orders;
create policy whirlpool_external_orders_select_company on public.whirlpool_external_orders
  for select to authenticated using (company_id = current_company_id());

drop policy if exists whirlpool_import_queue_select_company on public.whirlpool_import_queue;
create policy whirlpool_import_queue_select_company on public.whirlpool_import_queue
  for select to authenticated using (company_id = current_company_id());

drop policy if exists whirlpool_import_queue_gestor_update on public.whirlpool_import_queue;
create policy whirlpool_import_queue_gestor_update on public.whirlpool_import_queue
  for update to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR')
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');

drop policy if exists whirlpool_appointment_queue_select_company on public.whirlpool_appointment_sync_queue;
create policy whirlpool_appointment_queue_select_company on public.whirlpool_appointment_sync_queue
  for select to authenticated using (company_id = current_company_id());

drop policy if exists whirlpool_appointment_queue_gestor_update on public.whirlpool_appointment_sync_queue;
create policy whirlpool_appointment_queue_gestor_update on public.whirlpool_appointment_sync_queue
  for update to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR')
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');

drop policy if exists whirlpool_sync_events_select_company on public.whirlpool_sync_events;
create policy whirlpool_sync_events_select_company on public.whirlpool_sync_events
  for select to authenticated using (company_id = current_company_id());

comment on table public.whirlpool_external_orders is
  'Catálogo externo Whirlpool. Não contém dados pessoais; preserva presença, status e vínculo com a OS VoxAssist.';
comment on table public.whirlpool_import_queue is
  'Fila não destrutiva para captura de PDF e importação de OS Whirlpool.';
comment on table public.whirlpool_appointment_sync_queue is
  'Fila não bloqueante: falha de escrita no portal vira PENDENTE_MANUAL_WHIRLPOOL.';
