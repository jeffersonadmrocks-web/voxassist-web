-- ============================================================
-- VoxAssist — Gestão Operacional: backfill único (2026-08-27)
-- As triggers de gestao_operacional_v0827.sql só disparam AFTER
-- INSERT/UPDATE — não retroagem pros registros que já existiam antes da
-- migration ser aplicada. Este script espelha a mesma lógica das
-- triggers em INSERTs diretos, só pra quem ainda não tem
-- operational_task. Idempotente (where not exists), seguro rodar mais
-- de uma vez.
-- ============================================================

insert into public.operational_tasks (origin, service_order_id, title, responsible_user_id, created_by, status, awaiting_client_response)
select
  'OS', so.id, 'OS ' || coalesce(so.os_number, so.id::text),
  coalesce(so.technician_id, so.attendant_id, so.created_by), so.created_by,
  case when so.status = 'FINALIZADA' then 'CONCLUIDA' when so.status = 'CANCELADA' then 'CANCELADA' else 'PENDENTE' end,
  (so.status = 'AGUARDANDO APROVACAO')
from public.service_orders so
where not exists (select 1 from public.operational_tasks t where t.service_order_id = so.id and t.origin = 'OS');

insert into public.operational_tasks (origin, appointment_id, service_order_id, title, responsible_user_id, created_by, status, due_at, attention_flag)
select
  'AGENDA', a.id, a.service_order_id,
  'Atendimento externo' || case when so.os_number is not null then ' - OS ' || so.os_number else '' end,
  a.technician_id, coalesce(a.created_by, a.updated_by),
  case when a.status = 'REALIZADO' then 'CONCLUIDA' when a.status = 'CANCELADO' then 'CANCELADA' else 'PENDENTE' end,
  case
    when a.appointment_date is null then null
    when a.period = 'MANHA' then (a.appointment_date::date + time '12:00:00')::timestamptz
    else (a.appointment_date::date + time '18:00:00')::timestamptz
  end,
  (a.important_alert is not null and a.important_alert <> '') or (a.status = 'NAO_REALIZADO')
from public.appointments a
left join public.service_orders so on so.id = a.service_order_id
where not exists (select 1 from public.operational_tasks t where t.appointment_id = a.id and t.origin = 'AGENDA');

insert into public.operational_tasks (origin, nps_case_id, title, responsible_user_id, status, attention_flag)
select
  'NPS', nc.id, 'NPS Electrolux' || case when ea.client_name is not null then ' - ' || ea.client_name else '' end,
  null,
  case when nc.situacao in ('FINALIZADO', 'CLIENTE_CONFIRMOU_RESPOSTA', 'CLIENTE_NAO_DESEJA_CONTATO') then 'CONCLUIDA' else 'PENDENTE' end,
  (nc.classification = 'ATENCAO')
from public.nps_cases nc
left join public.external_appointments ea on ea.id = nc.external_appointment_id
where nc.classification <> 'NAO_ELEGIVEL'
  and not exists (select 1 from public.operational_tasks t where t.nps_case_id = nc.id and t.origin = 'NPS');
