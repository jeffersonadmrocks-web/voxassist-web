-- ============================================================
-- VoxAssist — Gestão de NPS Electrolux (V0.8.13, 2026-08-26)
-- Migration aditiva e idempotente. Estende external_appointments com
-- 2 colunas novas (nullable) e cria 3 tabelas novas. Nenhuma tabela
-- nativa do VoxAssist (appointments, service_orders, profiles fora
-- das colunas já aditivas da agenda) é tocada.
-- Seguro rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- external_appointments: 2 colunas novas pra Gestão de NPS
-- (data de abertura real da Electrolux e data de conclusão,
-- setada uma única vez pelo sync — ver resolveConcludedAt em
-- supabase/functions/_shared/electrolux.ts).
-- ------------------------------------------------------------
alter table public.external_appointments add column if not exists external_created_at timestamptz;
alter table public.external_appointments add column if not exists concluded_at timestamptz;

-- ------------------------------------------------------------
-- nps_cases — um caso de acompanhamento de NPS por atendimento
-- Electrolux concluído. 1:1 com external_appointments.
-- ------------------------------------------------------------
create table if not exists public.nps_cases (
  id uuid primary key default gen_random_uuid(),
  external_appointment_id uuid not null unique references public.external_appointments (id) on delete cascade,
  filial text check (filial in ('VITORIA', 'SERRA')),
  classification text not null default 'MEDIA' check (classification in ('ALTA', 'MEDIA', 'ATENCAO', 'NAO_ELEGIVEL')),
  situacao text not null default 'AGUARDANDO_CONTATO' check (situacao in (
    'AGUARDANDO_CONTATO', 'PRIMEIRO_CONTATO_ENVIADO', 'AGUARDANDO_RESPOSTA', 'LEMBRETE_ENVIADO',
    'CLIENTE_CONFIRMOU_RESPOSTA', 'CLIENTE_NAO_RECEBEU', 'CLIENTE_NAO_RESPONDEU',
    'CLIENTE_NAO_DESEJA_CONTATO', 'CASO_DE_ATENCAO', 'FINALIZADO'
  )),
  opened_at timestamptz,
  concluded_at timestamptz,
  visit_count integer not null default 1,
  has_complaint boolean not null default false,
  has_return_visit boolean not null default false,
  has_reopening boolean not null default false,
  whatsapp_valid boolean not null default true,
  survey_deadline_at timestamptz,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  attention_reason text,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nps_cases_situacao on public.nps_cases (situacao);
create index if not exists idx_nps_cases_classification on public.nps_cases (classification);
create index if not exists idx_nps_cases_responsible on public.nps_cases (responsible_user_id);

alter table public.nps_cases enable row level security;

-- Gestor/atendente veem tudo; técnico só vê os casos ligados a
-- atendimentos do próprio técnico (via external_appointments).
drop policy if exists "Usuários autenticados veem casos de NPS" on public.nps_cases;
create policy "Usuários autenticados veem casos de NPS"
  on public.nps_cases for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role <> 'TECNICO'
          or exists (
            select 1 from public.external_appointments ea
            where ea.id = nps_cases.external_appointment_id and ea.technician_id = auth.uid()
          )
        )
    )
  );

-- Só gestor/atendente alteram (técnico só visualiza, per spec seção 9).
drop policy if exists "Gestor e atendente alteram casos de NPS" on public.nps_cases;
create policy "Gestor e atendente alteram casos de NPS"
  on public.nps_cases for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO'));
-- Sem policy de insert/delete pra cliente — só service_role (o sync) cria.

-- ------------------------------------------------------------
-- nps_contacts — um registro por envio de mensagem/lembrete.
-- ------------------------------------------------------------
create table if not exists public.nps_contacts (
  id uuid primary key default gen_random_uuid(),
  nps_case_id uuid not null references public.nps_cases (id) on delete cascade,
  contact_type text not null check (contact_type in ('PRIMEIRO_CONTATO', 'LEMBRETE')),
  phone_used text not null,
  message_text text not null,
  filial text,
  previous_situacao text,
  new_situacao text,
  observacao text,
  confirmed_response boolean,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_nps_contacts_case on public.nps_contacts (nps_case_id, sent_at desc);

alter table public.nps_contacts enable row level security;

drop policy if exists "Usuários autenticados veem contatos de NPS" on public.nps_contacts;
create policy "Usuários autenticados veem contatos de NPS"
  on public.nps_contacts for select
  using (
    exists (
      select 1 from public.nps_cases c
      join public.profiles p on p.id = auth.uid()
      where c.id = nps_contacts.nps_case_id
        and (
          p.role <> 'TECNICO'
          or exists (
            select 1 from public.external_appointments ea
            where ea.id = c.external_appointment_id and ea.technician_id = auth.uid()
          )
        )
    )
  );

-- Só gestor/atendente registram contato (o próprio ato de enviar
-- mensagem/lembrete) — técnico é só leitura.
drop policy if exists "Gestor e atendente registram contato de NPS" on public.nps_contacts;
create policy "Gestor e atendente registram contato de NPS"
  on public.nps_contacts for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO'));

-- ------------------------------------------------------------
-- nps_case_history — auditoria (mesmo formato de
-- appointment_history/external_appointment_history).
-- ------------------------------------------------------------
create table if not exists public.nps_case_history (
  id uuid primary key default gen_random_uuid(),
  nps_case_id uuid not null references public.nps_cases (id) on delete cascade,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_nps_case_history_case on public.nps_case_history (nps_case_id, changed_at desc);

alter table public.nps_case_history enable row level security;

drop policy if exists "Usuários autenticados veem histórico de NPS" on public.nps_case_history;
create policy "Usuários autenticados veem histórico de NPS"
  on public.nps_case_history for select
  using (
    exists (
      select 1 from public.nps_cases c
      join public.profiles p on p.id = auth.uid()
      where c.id = nps_case_history.nps_case_id
        and (
          p.role <> 'TECNICO'
          or exists (
            select 1 from public.external_appointments ea
            where ea.id = c.external_appointment_id and ea.technician_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "Gestor e atendente registram histórico de NPS" on public.nps_case_history;
create policy "Gestor e atendente registram histórico de NPS"
  on public.nps_case_history for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO'));
