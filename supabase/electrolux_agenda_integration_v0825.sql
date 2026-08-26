-- ============================================================
-- VoxAssist — Integração de agenda Electrolux (V0.8.13, 2026-08-25)
-- Migration aditiva e idempotente: só cria tabelas novas e colunas
-- novas (nullable/default). Nenhuma tabela nativa (appointments,
-- service_orders, appointment_history, technician_schedule_blocks)
-- é alterada ou tem linha existente tocada.
-- Seguro rodar mais de uma vez.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles: colunas aditivas pra suportar técnico provisório
-- ------------------------------------------------------------
alter table public.profiles add column if not exists origin text not null default 'VOXASSIST';
alter table public.profiles add column if not exists electrolux_external_id text;
alter table public.profiles add column if not exists registration_status text not null default 'ATIVO';

create unique index if not exists idx_profiles_electrolux_external_id
  on public.profiles (electrolux_external_id)
  where electrolux_external_id is not null;

-- ------------------------------------------------------------
-- external_appointments — compromissos importados de sistemas
-- externos (hoje só Electrolux). Nunca vira OS VoxAssist.
-- ------------------------------------------------------------
create table if not exists public.external_appointments (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('ELECTROLUX')),
  external_id text not null,
  external_order_number text,
  technician_id uuid references public.profiles (id) on delete set null,
  appointment_date date,
  period text check (period in ('MANHA', 'TARDE')),
  status text not null default 'ABERTO' check (status in ('ABERTO', 'AGENDADO', 'CONCLUIDO', 'CANCELADO')),
  external_status_raw text,
  external_internal_status text,
  client_name text,
  client_phone text,
  address_street text,
  address_neighborhood text,
  address_city text,
  address_state text,
  notes text,
  external_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origin, external_id)
);

create index if not exists idx_external_appointments_tech_date
  on public.external_appointments (technician_id, appointment_date, period);
create index if not exists idx_external_appointments_status
  on public.external_appointments (status);

alter table public.external_appointments enable row level security;

-- Gestor/atendente veem tudo; técnico só vê os compromissos atribuídos a
-- ele mesmo (mesma regra que visibleAppointments() já aplica em JS pra
-- appointments nativa — aqui fica garantido também no banco).
drop policy if exists "Usuários autenticados veem compromissos externos" on public.external_appointments;
create policy "Usuários autenticados veem compromissos externos"
  on public.external_appointments for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role <> 'TECNICO' or external_appointments.technician_id = auth.uid())
    )
  );

-- Só gestor/atendente atribui técnico (mesma regra que já bloqueia
-- TECNICO de arrastar/reagendar na agenda nativa).
drop policy if exists "Usuários autenticados atribuem técnico ao compromisso externo" on public.external_appointments;
create policy "Usuários autenticados atribuem técnico ao compromisso externo"
  on public.external_appointments for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO')
  );
-- Sem policy de insert/delete pra cliente — só service_role (o sync) cria/apaga.

-- ------------------------------------------------------------
-- external_appointment_history — histórico mínimo de sincronização,
-- mesmo formato de appointment_history nativa (previous/new em jsonb).
-- ------------------------------------------------------------
create table if not exists public.external_appointment_history (
  id uuid primary key default gen_random_uuid(),
  external_appointment_id uuid not null references public.external_appointments (id) on delete cascade,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_by text not null default 'ELECTROLUX_SYNC',
  synced_at timestamptz not null default now()
);

create index if not exists idx_external_appointment_history_appt
  on public.external_appointment_history (external_appointment_id, synced_at desc);

alter table public.external_appointment_history enable row level security;

drop policy if exists "Usuários autenticados veem histórico de compromissos externos" on public.external_appointment_history;
create policy "Usuários autenticados veem histórico de compromissos externos"
  on public.external_appointment_history for select
  using (auth.role() = 'authenticated');
-- Sem policy de insert/update/delete pra cliente — só service_role grava.

-- ------------------------------------------------------------
-- integration_sync_runs — observabilidade do job de sincronização,
-- nunca guarda segredo/token.
-- ------------------------------------------------------------
create table if not exists public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success boolean,
  orders_processed integer not null default 0,
  error_message text
);

create index if not exists idx_integration_sync_runs_origin
  on public.integration_sync_runs (origin, started_at desc);

alter table public.integration_sync_runs enable row level security;

drop policy if exists "Usuários autenticados veem execuções de sincronização" on public.integration_sync_runs;
create policy "Usuários autenticados veem execuções de sincronização"
  on public.integration_sync_runs for select
  using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- external_technician_link_suggestions — pendência de "possível
-- mesmo técnico". Nunca funde automaticamente.
-- ------------------------------------------------------------
create table if not exists public.external_technician_link_suggestions (
  id uuid primary key default gen_random_uuid(),
  origin text not null default 'ELECTROLUX',
  external_technician_id text,
  candidate_name text not null,
  suggested_profile_id uuid references public.profiles (id) on delete cascade,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'VINCULADO', 'SEPARADO')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (origin, external_technician_id, suggested_profile_id)
);

alter table public.external_technician_link_suggestions enable row level security;

drop policy if exists "Usuários autenticados veem sugestões de vínculo" on public.external_technician_link_suggestions;
create policy "Usuários autenticados veem sugestões de vínculo"
  on public.external_technician_link_suggestions for select
  using (auth.role() = 'authenticated');

drop policy if exists "Usuários autenticados resolvem sugestões de vínculo" on public.external_technician_link_suggestions;
create policy "Usuários autenticados resolvem sugestões de vínculo"
  on public.external_technician_link_suggestions for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
