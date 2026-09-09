-- ============================================================
-- Matriz Mestra, Área 01 -- "Parâmetros próprios por unidade".
-- Decisão do usuário (2026-09-09): "empresa fornece o padrão →
-- unidade pode sobrescrever somente os parâmetros explicitamente
-- definidos como configuráveis por unidade" -- sem tabela genérica
-- de chave/valor. Considerar horários, agenda/atendimento,
-- parâmetros operacionais e comunicação QUANDO HOUVER NECESSIDADE
-- REAL.
--
-- Achado ao investigar ANTES de desenhar: `companies.business_hours`
-- (jsonb por dia da semana) é puramente decorativo -- só aparece no
-- formulário de cadastro da empresa (company-profile-complete-
-- v0812.js), NUNCA lido por nenhuma lógica real de agenda/capacidade.
-- O parâmetro que de fato importa operacionalmente é
-- `company_schedule_settings` (work_days, capacidade manhã/tarde,
-- duração padrão) -- é ele que field-agenda-complete-v0813.js usa
-- pra calcular disponibilidade de verdade, hoje só por empresa
-- (sem store_id).
--
-- Esta migration cria a camada de sobrescrita EXPLÍCITA por loja
-- pra esses mesmos campos (mesmo padrão "ausência de linha = usa o
-- padrão da empresa" já usado em company_product_types) -- mirror
-- exato das colunas de company_schedule_settings, sem generalizar
-- pra chave/valor livre.
--
-- Escopo desta etapa é CADASTRO -- ligar a sobrescrita no motor real
-- de capacidade/disponibilidade da Agenda (field-agenda-complete-
-- v0813.js, hoje 100% por empresa) fica pra uma etapa futura própria,
-- com mais cautela (é lógica ativa de agendamento, mesmo padrão de
-- "cadastro primeiro, uso depois" já seguido pra todos os outros
-- catálogos desta sessão).
-- ============================================================

create table if not exists public.store_schedule_overrides (
  store_id uuid primary key references public.stores(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  work_days integer[],
  morning_enabled boolean,
  afternoon_enabled boolean,
  default_duration_minutes integer,
  morning_capacity_minutes integer,
  afternoon_capacity_minutes integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.store_schedule_overrides enable row level security;

drop policy if exists "store_schedule_overrides_select_company" on public.store_schedule_overrides;
create policy "store_schedule_overrides_select_company" on public.store_schedule_overrides
  for select to authenticated using (company_id = public.current_company_id());

drop policy if exists "store_schedule_overrides_write_gestor" on public.store_schedule_overrides;
create policy "store_schedule_overrides_write_gestor" on public.store_schedule_overrides
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = public.current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_set_store_schedule_override(
  p_company_id uuid,
  p_store_id uuid,
  p_work_days integer[],
  p_morning_enabled boolean,
  p_afternoon_enabled boolean,
  p_default_duration_minutes integer,
  p_morning_capacity_minutes integer,
  p_afternoon_capacity_minutes integer
) returns public.store_schedule_overrides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.store_schedule_overrides%rowtype;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar parâmetros da unidade.';
  end if;
  if not exists (select 1 from public.stores where id = p_store_id and company_id = p_company_id) then
    raise exception 'Loja não pertence à empresa.';
  end if;

  insert into public.store_schedule_overrides
    (store_id, company_id, work_days, morning_enabled, afternoon_enabled, default_duration_minutes, morning_capacity_minutes, afternoon_capacity_minutes, updated_by)
    values (p_store_id, p_company_id, p_work_days, p_morning_enabled, p_afternoon_enabled, p_default_duration_minutes, p_morning_capacity_minutes, p_afternoon_capacity_minutes, auth.uid())
  on conflict (store_id) do update
    set work_days = excluded.work_days, morning_enabled = excluded.morning_enabled, afternoon_enabled = excluded.afternoon_enabled,
        default_duration_minutes = excluded.default_duration_minutes, morning_capacity_minutes = excluded.morning_capacity_minutes,
        afternoon_capacity_minutes = excluded.afternoon_capacity_minutes, updated_at = now(), updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end;
$$;
comment on function public.admin_set_store_schedule_override is
  'Define/atualiza a sobrescrita de horário/capacidade de uma loja específica -- ausência de linha em store_schedule_overrides = usa o padrão de company_schedule_settings. Gestor-only. Só cadastro -- ainda não lido pelo motor de agenda (field-agenda-complete-v0813.js), que continua 100% por empresa.';

create or replace function public.admin_clear_store_schedule_override(
  p_company_id uuid,
  p_store_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar parâmetros da unidade.';
  end if;
  delete from public.store_schedule_overrides where store_id = p_store_id and company_id = p_company_id;
end;
$$;
comment on function public.admin_clear_store_schedule_override is
  'Remove a sobrescrita da loja -- volta a usar o padrão da empresa (company_schedule_settings). Gestor-only.';

grant execute on function public.admin_set_store_schedule_override(uuid, uuid, integer[], boolean, boolean, integer, integer, integer) to authenticated;
grant execute on function public.admin_clear_store_schedule_override(uuid, uuid) to authenticated;
