-- ============================================================
-- VoxAssist — Gestão Operacional, Fase 1 (Base) + Fase 2 (Alertas)
-- (V0.8.13, 2026-08-27). Migration aditiva e idempotente — não toca em
-- nenhuma coluna/tabela existente, só acrescenta 5 tabelas novas, 2
-- funções de pontuação, 1 view e triggers em tabelas já existentes
-- (service_orders, os_status_history, appointments, nps_cases,
-- nps_case_history, nps_contacts, os_parts, os_financial, attachments).
-- Nenhuma lógica de escrita existente foi alterada — as triggers só
-- observam INSERT/UPDATE que já acontecem hoje.
-- Seguro rodar mais de uma vez.
--
-- Nota: `service_orders`, `appointments`, `os_status_history`,
-- `os_parts`, `os_financial`, `attachments` não têm CREATE TABLE
-- versionado neste repo (schema real nunca foi dumpado — ver
-- HANDOFF_CLAUDE_CODE.md). Os nomes de coluna usados abaixo foram
-- confirmados via grep no uso real do front-end (JS), não em DDL.
-- ============================================================

-- ------------------------------------------------------------
-- operational_tasks
-- ------------------------------------------------------------
create table if not exists public.operational_tasks (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('OS', 'AGENDA', 'NPS', 'MANUAL')),
  service_order_id uuid references public.service_orders (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  nps_case_id uuid references public.nps_cases (id) on delete cascade,
  title text not null,
  description text,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'REAGENDADA', 'TRANSFERIDA', 'CANCELADA')),
  due_at timestamptz,
  reschedule_count integer not null default 0,
  blocks_user_id uuid references public.profiles (id) on delete set null,
  attention_flag boolean not null default false,
  awaiting_client_response boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operational_tasks_responsible on public.operational_tasks (responsible_user_id, status);
create index if not exists idx_operational_tasks_os on public.operational_tasks (service_order_id) where origin = 'OS';
create index if not exists idx_operational_tasks_agenda on public.operational_tasks (appointment_id) where origin = 'AGENDA';
create index if not exists idx_operational_tasks_nps on public.operational_tasks (nps_case_id) where origin = 'NPS';

alter table public.operational_tasks enable row level security;

-- Visibilidade: responsável vê a própria; GESTOR vê tudo; tarefas de fila
-- de time sem responsável (origem AGENDA/NPS não atribuída) ficam visíveis
-- pra qualquer perfil não-TECNICO — mesma regra já usada hoje pra "fila
-- aberta" da agenda (ver electrolux-agenda-bridge-v0825.js) e pros casos
-- de NPS sem filial definida.
drop policy if exists "Usuários veem suas tarefas operacionais" on public.operational_tasks;
create policy "Usuários veem suas tarefas operacionais"
  on public.operational_tasks for select
  using (
    responsible_user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR')
    or (
      responsible_user_id is null
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO')
    )
  );

-- Criação manual: só a própria (origin='MANUAL'). Tarefas de OS/Agenda/NPS
-- são criadas pelas triggers abaixo, que rodam SECURITY DEFINER e não
-- dependem desta policy.
drop policy if exists "Usuários criam tarefas manuais" on public.operational_tasks;
create policy "Usuários criam tarefas manuais"
  on public.operational_tasks for insert
  with check (origin = 'MANUAL' and created_by = auth.uid());

drop policy if exists "Responsável ou gestor atualiza a tarefa" on public.operational_tasks;
create policy "Responsável ou gestor atualiza a tarefa"
  on public.operational_tasks for update
  using (
    responsible_user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR')
  );

-- ------------------------------------------------------------
-- operational_events — espelho de atividade, alimenta o relógio de
-- inatividade. Só GESTOR e o próprio dono leem; escrita normal é via
-- trigger (SECURITY DEFINER); a única exceção de insert direto pro
-- client é o próprio usuário logando uma ação sua (ex.: "Executar agora"
-- na Minha Jornada, que não passa por nenhuma tabela de origem).
-- ------------------------------------------------------------
create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  source_table text,
  source_id uuid,
  operational_task_id uuid references public.operational_tasks (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_operational_events_user on public.operational_events (user_id, created_at desc);
create index if not exists idx_operational_events_task on public.operational_events (operational_task_id, created_at desc);

alter table public.operational_events enable row level security;

drop policy if exists "Usuários veem seus eventos operacionais" on public.operational_events;
create policy "Usuários veem seus eventos operacionais"
  on public.operational_events for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR')
  );

drop policy if exists "Usuário registra a própria ação manual" on public.operational_events;
create policy "Usuário registra a própria ação manual"
  on public.operational_events for insert
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- operational_alerts
-- ------------------------------------------------------------
create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  operational_task_id uuid references public.operational_tasks (id) on delete set null,
  alert_type text not null check (alert_type in ('TASK_STALLED', 'LOW_ACTIVITY', 'DEADLINE_APPROACHING')),
  severity text not null check (severity in ('LEMBRETE', 'ATENCAO', 'OCORRENCIA', 'CRITICO')),
  status text not null default 'ATIVO' check (status in ('ATIVO', 'RECONHECIDO', 'JUSTIFICADO', 'RESOLVIDO')),
  message text not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_operational_alerts_user on public.operational_alerts (user_id, status);

alter table public.operational_alerts enable row level security;

drop policy if exists "Usuários veem seus alertas" on public.operational_alerts;
create policy "Usuários veem seus alertas"
  on public.operational_alerts for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR')
  );

-- Reconhecer o próprio alerta (o escalonamento/criação em si é sempre via
-- service_role na edge function, que ignora RLS).
drop policy if exists "Usuário reconhece o próprio alerta" on public.operational_alerts;
create policy "Usuário reconhece o próprio alerta"
  on public.operational_alerts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- operational_justifications
-- ------------------------------------------------------------
create table if not exists public.operational_justifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  operational_alert_id uuid references public.operational_alerts (id) on delete set null,
  reason_code text not null check (reason_code in (
    'ATENDIMENTO_PRESENCIAL', 'LIGACAO_EXTENSA', 'REUNIAO_TREINAMENTO',
    'ATIVIDADE_EXTERNA', 'PAUSA_AUTORIZADA', 'INDISPONIBILIDADE_TECNICA', 'OUTRO'
  )),
  note text,
  period_start timestamptz not null default now(),
  period_end timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_operational_justifications_user on public.operational_justifications (user_id, period_start, period_end);

alter table public.operational_justifications enable row level security;

drop policy if exists "Usuários veem suas justificativas" on public.operational_justifications;
create policy "Usuários veem suas justificativas"
  on public.operational_justifications for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR')
  );

drop policy if exists "Usuário registra a própria justificativa" on public.operational_justifications;
create policy "Usuário registra a própria justificativa"
  on public.operational_justifications for insert
  with check (user_id = auth.uid());

-- Não existe FK de operational_alerts pra operational_justifications de
-- propósito — a referência inversa (operational_justifications.operational_alert_id)
-- já é suficiente pra achar "qual justificativa cobre este alerta" sem
-- criar uma dependência circular de FK entre as duas tabelas.

-- ------------------------------------------------------------
-- operational_expectations — só os parâmetros que a Fase 2 precisa
-- (thresholds de inatividade). company_id null = default global.
-- ------------------------------------------------------------
create table if not exists public.operational_expectations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  lembrete_minutes integer not null default 20,
  atencao_minutes integer not null default 30,
  ocorrencia_minutes integer not null default 45,
  critico_minutes integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.operational_expectations enable row level security;

drop policy if exists "Autenticados veem os parâmetros de alerta" on public.operational_expectations;
create policy "Autenticados veem os parâmetros de alerta"
  on public.operational_expectations for select
  using (auth.uid() is not null);

drop policy if exists "Gestor ajusta os parâmetros de alerta" on public.operational_expectations;
create policy "Gestor ajusta os parâmetros de alerta"
  on public.operational_expectations for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR'));

insert into public.operational_expectations (company_id, lembrete_minutes, atencao_minutes, ocorrencia_minutes, critico_minutes)
select null, 20, 30, 45, 60
where not exists (select 1 from public.operational_expectations where company_id is null);

-- ------------------------------------------------------------
-- Motor de prioridades — funções puras (usam now(), não guardam nada) +
-- view security_invoker (respeita a RLS de operational_tasks).
-- ------------------------------------------------------------
create or replace function public.fn_operational_priority_score(
  p_due_at timestamptz,
  p_awaiting_client_response boolean,
  p_attention_flag boolean,
  p_blocks_user_id uuid,
  p_reschedule_count integer,
  p_created_at timestamptz
) returns integer
language sql stable
as $$
  select
    (case when p_due_at is not null and p_due_at < now() then 50 else 0 end)
    + (case when p_due_at is not null and p_due_at >= now() and p_due_at <= now() + interval '30 minutes' then 35 else 0 end)
    + (case when p_awaiting_client_response then 30 else 0 end)
    + (case when p_attention_flag then 30 else 0 end)
    + (case when p_blocks_user_id is not null then 25 else 0 end)
    + (case when p_reschedule_count > 1 then 20 else 0 end)
    + least(greatest(floor(extract(epoch from (now() - p_created_at)) / 86400), 0)::integer, 10)
    + (case when p_due_at is null then 1 else 0 end);
$$;

create or replace function public.fn_operational_priority_reason(
  p_due_at timestamptz,
  p_awaiting_client_response boolean,
  p_attention_flag boolean,
  p_blocks_user_id uuid,
  p_reschedule_count integer
) returns text
language sql stable
as $$
  select case
    when p_due_at is not null and p_due_at < now() then 'Tarefa vencida'
    when p_due_at is not null and p_due_at <= now() + interval '30 minutes' then 'Prazo em menos de 30 minutos'
    when p_awaiting_client_response then 'Cliente aguardando retorno'
    when p_attention_flag then 'Caso de atenção / prioridade alta'
    when p_blocks_user_id is not null then 'Bloqueando outra pessoa'
    when p_reschedule_count > 1 then 'Reagendada mais de uma vez'
    else 'Atividade dentro do prazo'
  end;
$$;

drop view if exists public.operational_tasks_view;
create view public.operational_tasks_view
with (security_invoker = true) as
select
  t.*,
  public.fn_operational_priority_score(t.due_at, t.awaiting_client_response, t.attention_flag, t.blocks_user_id, t.reschedule_count, t.created_at) as priority_score,
  public.fn_operational_priority_reason(t.due_at, t.awaiting_client_response, t.attention_flag, t.blocks_user_id, t.reschedule_count) as priority_reason
from public.operational_tasks t;

-- ------------------------------------------------------------
-- Auto-geração/sincronização de operational_tasks a partir de OS
-- ------------------------------------------------------------
create or replace function public.trg_sync_operational_task_from_service_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'INSERT' then
    insert into public.operational_tasks (origin, service_order_id, title, responsible_user_id, created_by, status)
    values (
      'OS', new.id, 'OS ' || coalesce(new.os_number, new.id::text),
      coalesce(new.technician_id, new.attendant_id, new.created_by),
      new.created_by, 'PENDENTE'
    );
    return new;
  end if;

  v_status := case
    when new.status = 'FINALIZADA' then 'CONCLUIDA'
    when new.status = 'CANCELADA' then 'CANCELADA'
    else 'PENDENTE'
  end;

  update public.operational_tasks
  set status = v_status,
      awaiting_client_response = (new.status = 'AGUARDANDO APROVACAO'),
      responsible_user_id = coalesce(new.technician_id, new.attendant_id, new.created_by),
      updated_at = now()
  where service_order_id = new.id and origin = 'OS';

  return new;
end;
$$;

drop trigger if exists trg_operational_task_service_order_insert on public.service_orders;
create trigger trg_operational_task_service_order_insert
  after insert on public.service_orders
  for each row execute function public.trg_sync_operational_task_from_service_order();

drop trigger if exists trg_operational_task_service_order_update on public.service_orders;
create trigger trg_operational_task_service_order_update
  after update of status, technician_id, attendant_id on public.service_orders
  for each row execute function public.trg_sync_operational_task_from_service_order();

create or replace function public.trg_mirror_event_from_os_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
begin
  if new.changed_by is null then
    return new;
  end if;
  select id into v_task_id from public.operational_tasks where service_order_id = new.service_order_id and origin = 'OS' limit 1;
  insert into public.operational_events (user_id, event_type, source_table, source_id, operational_task_id, metadata)
  values (
    new.changed_by,
    case when new.previous_status is null then 'OS_CRIADA' else 'OS_STATUS_ALTERADO' end,
    'os_status_history', new.id, v_task_id,
    jsonb_build_object('service_order_id', new.service_order_id, 'new_status', new.new_status, 'previous_status', new.previous_status)
  );
  return new;
end;
$$;

drop trigger if exists trg_operational_event_os_status_history on public.os_status_history;
create trigger trg_operational_event_os_status_history
  after insert on public.os_status_history
  for each row execute function public.trg_mirror_event_from_os_status_history();

-- ------------------------------------------------------------
-- Auto-geração/sincronização a partir da Agenda nativa (appointments) —
-- combina sync de tarefa + espelho de evento na mesma trigger porque
-- appointment_history não tem CREATE TABLE versionado e pode nem existir
-- de verdade (ver nota da pesquisa).
-- ------------------------------------------------------------
create or replace function public.trg_sync_operational_task_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due timestamptz;
  v_status text;
  v_actor uuid;
  v_task_id uuid;
  v_os_number text;
begin
  v_due := case
    when new.appointment_date is null then null
    when new.period = 'MANHA' then (new.appointment_date::date + time '12:00:00')::timestamptz
    else (new.appointment_date::date + time '18:00:00')::timestamptz
  end;

  v_status := case
    when new.status = 'REALIZADO' then 'CONCLUIDA'
    when new.status = 'CANCELADO' then 'CANCELADA'
    else 'PENDENTE'
  end;

  if tg_op = 'INSERT' then
    select os_number into v_os_number from public.service_orders where id = new.service_order_id;
    insert into public.operational_tasks (origin, appointment_id, service_order_id, title, responsible_user_id, created_by, status, due_at, attention_flag)
    values (
      'AGENDA', new.id, new.service_order_id,
      'Atendimento externo' || case when v_os_number is not null then ' - OS ' || v_os_number else '' end,
      new.technician_id, coalesce(new.created_by, new.updated_by), v_status, v_due, (new.important_alert is not null and new.important_alert <> '')
    )
    returning id into v_task_id;
    v_actor := coalesce(new.created_by, new.updated_by);
  else
    update public.operational_tasks
    set status = v_status,
        responsible_user_id = new.technician_id,
        due_at = v_due,
        attention_flag = (new.important_alert is not null and new.important_alert <> '') or (new.status = 'NAO_REALIZADO'),
        reschedule_count = case when new.appointment_date is distinct from old.appointment_date then reschedule_count + 1 else reschedule_count end,
        updated_at = now()
    where appointment_id = new.id and origin = 'AGENDA'
    returning id into v_task_id;
    v_actor := coalesce(new.updated_by, new.created_by);
  end if;

  if v_actor is not null then
    insert into public.operational_events (user_id, event_type, source_table, source_id, operational_task_id, metadata)
    values (v_actor, 'AGENDA_ATUALIZADA', 'appointments', new.id, v_task_id, jsonb_build_object('status', new.status));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_operational_task_appointment_insert on public.appointments;
create trigger trg_operational_task_appointment_insert
  after insert on public.appointments
  for each row execute function public.trg_sync_operational_task_from_appointment();

drop trigger if exists trg_operational_task_appointment_update on public.appointments;
create trigger trg_operational_task_appointment_update
  after update of status, technician_id, appointment_date, period on public.appointments
  for each row execute function public.trg_sync_operational_task_from_appointment();

-- ------------------------------------------------------------
-- Auto-geração/sincronização a partir do NPS Electrolux — tarefa fica
-- sem responsible_user_id (fila de time, mesma regra de visibilidade de
-- fila aberta já usada em outros lugares). Casos NAO_ELEGIVEL não geram
-- tarefa (não precisam de atenção de ninguém).
-- ------------------------------------------------------------
create or replace function public.trg_sync_operational_task_from_nps_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_client text;
begin
  if new.classification = 'NAO_ELEGIVEL' then
    return new;
  end if;

  v_status := case
    when new.situacao in ('FINALIZADO', 'CLIENTE_CONFIRMOU_RESPOSTA', 'CLIENTE_NAO_DESEJA_CONTATO') then 'CONCLUIDA'
    else 'PENDENTE'
  end;

  if tg_op = 'INSERT' then
    select client_name into v_client from public.external_appointments where id = new.external_appointment_id;
    insert into public.operational_tasks (origin, nps_case_id, title, responsible_user_id, status, attention_flag)
    values (
      'NPS', new.id, 'NPS Electrolux' || case when v_client is not null then ' - ' || v_client else '' end,
      null, v_status, (new.classification = 'ATENCAO')
    );
  else
    update public.operational_tasks
    set status = v_status,
        attention_flag = (new.classification = 'ATENCAO'),
        updated_at = now()
    where nps_case_id = new.id and origin = 'NPS';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_operational_task_nps_case_insert on public.nps_cases;
create trigger trg_operational_task_nps_case_insert
  after insert on public.nps_cases
  for each row execute function public.trg_sync_operational_task_from_nps_case();

drop trigger if exists trg_operational_task_nps_case_update on public.nps_cases;
create trigger trg_operational_task_nps_case_update
  after update of classification, situacao on public.nps_cases
  for each row execute function public.trg_sync_operational_task_from_nps_case();

create or replace function public.trg_mirror_event_from_nps_case_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
begin
  if new.changed_by is null then
    return new;
  end if;
  select id into v_task_id from public.operational_tasks where nps_case_id = new.nps_case_id and origin = 'NPS' limit 1;
  insert into public.operational_events (user_id, event_type, source_table, source_id, operational_task_id, metadata)
  values (new.changed_by, 'NPS_CASO_ATUALIZADO', 'nps_case_history', new.id, v_task_id, jsonb_build_object('action', new.action));
  return new;
end;
$$;

drop trigger if exists trg_operational_event_nps_case_history on public.nps_case_history;
create trigger trg_operational_event_nps_case_history
  after insert on public.nps_case_history
  for each row execute function public.trg_mirror_event_from_nps_case_history();

create or replace function public.trg_mirror_event_from_nps_contacts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
begin
  select id into v_task_id from public.operational_tasks where nps_case_id = new.nps_case_id and origin = 'NPS' limit 1;
  insert into public.operational_events (user_id, event_type, source_table, source_id, operational_task_id, metadata)
  values (new.sent_by, 'NPS_CONTATO_ENVIADO', 'nps_contacts', new.id, v_task_id, jsonb_build_object('contact_type', new.contact_type));
  return new;
end;
$$;

drop trigger if exists trg_operational_event_nps_contacts on public.nps_contacts;
create trigger trg_operational_event_nps_contacts
  after insert on public.nps_contacts
  for each row execute function public.trg_mirror_event_from_nps_contacts();

-- ------------------------------------------------------------
-- Espelho de evento pra os_parts/os_financial/attachments — nenhuma das
-- 3 tem coluna de ator confiável nem tabela de histórico própria, então
-- usa auth.uid() (funciona porque a escrita hoje é direto do cliente via
-- PostgREST sob a sessão do usuário).
-- ------------------------------------------------------------
create or replace function public.trg_mirror_event_from_os_parts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return new;
  end if;
  select id into v_task_id from public.operational_tasks where service_order_id = new.service_order_id and origin = 'OS' limit 1;
  insert into public.operational_events (user_id, event_type, source_table, source_id, operational_task_id, metadata)
  values (v_actor, 'OS_PECA_REGISTRADA', 'os_parts', new.id, v_task_id, jsonb_build_object('service_order_id', new.service_order_id));
  return new;
end;
$$;

drop trigger if exists trg_operational_event_os_parts on public.os_parts;
create trigger trg_operational_event_os_parts
  after insert on public.os_parts
  for each row execute function public.trg_mirror_event_from_os_parts();

create or replace function public.trg_mirror_event_from_os_financial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return new;
  end if;
  select id into v_task_id from public.operational_tasks where service_order_id = new.service_order_id and origin = 'OS' limit 1;
  insert into public.operational_events (user_id, event_type, source_table, source_id, operational_task_id, metadata)
  values (v_actor, 'OS_FINANCEIRO_ATUALIZADO', 'os_financial', new.id, v_task_id, jsonb_build_object('service_order_id', new.service_order_id));
  return new;
end;
$$;

drop trigger if exists trg_operational_event_os_financial on public.os_financial;
create trigger trg_operational_event_os_financial
  after insert or update on public.os_financial
  for each row execute function public.trg_mirror_event_from_os_financial();

create or replace function public.trg_mirror_event_from_attachments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_actor uuid;
begin
  v_actor := coalesce(new.created_by, auth.uid());
  if v_actor is null then
    return new;
  end if;
  select id into v_task_id from public.operational_tasks where service_order_id = new.service_order_id and origin = 'OS' limit 1;
  insert into public.operational_events (user_id, event_type, source_table, source_id, operational_task_id, metadata)
  values (v_actor, 'OS_ANEXO_REGISTRADO', 'attachments', new.id, v_task_id, jsonb_build_object('service_order_id', new.service_order_id));
  return new;
end;
$$;

drop trigger if exists trg_operational_event_attachments on public.attachments;
create trigger trg_operational_event_attachments
  after insert on public.attachments
  for each row execute function public.trg_mirror_event_from_attachments();

-- ------------------------------------------------------------
-- Auto-resolução de alerta: quando um evento novo chega pro usuário,
-- qualquer alerta de inatividade ATIVO/RECONHECIDO dele já era —
-- "retomada" per a seção 5 do documento. Não espera o próximo ciclo da
-- edge function.
-- ------------------------------------------------------------
create or replace function public.trg_auto_resolve_alerts_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;
  update public.operational_alerts
  set status = 'RESOLVIDO', resolved_at = now()
  where user_id = new.user_id
    and status in ('ATIVO', 'RECONHECIDO')
    and alert_type in ('TASK_STALLED', 'LOW_ACTIVITY')
    and created_at < new.created_at;
  return new;
end;
$$;

drop trigger if exists trg_operational_alert_auto_resolve on public.operational_events;
create trigger trg_operational_alert_auto_resolve
  after insert on public.operational_events
  for each row execute function public.trg_auto_resolve_alerts_on_event();
