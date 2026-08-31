-- ============================================================
-- Achado real (2026-08-31): sync-electrolux-nps registrava toda
-- execução como success=true mesmo quando inserts em nps_cases
-- falhavam silenciosamente (16 de 17 atendimentos concluídos da
-- Electrolux nunca viraram caso de NPS, por meses). integration_sync_runs
-- só tinha error_message (texto único, pra exceção não tratada) --
-- não tinha onde registrar falhas parciais item a item nem contagens
-- de promovidos/pulados/falhos. Sem isso, o bug seguinte do mesmo tipo
-- ficaria invisível de novo.
-- ============================================================

alter table public.integration_sync_runs
  add column if not exists promoted_count integer,
  add column if not exists skipped_count integer,
  add column if not exists failed_count integer,
  add column if not exists failed_details jsonb;

comment on column public.integration_sync_runs.promoted_count is
  'Quantos casos mudaram de situação nesta execução (ex.: AGUARDANDO_PRAZO_NPS -> AGUARDANDO_CONTATO).';
comment on column public.integration_sync_runs.skipped_count is
  'Quantos itens de origem já estavam tratados (não precisaram de ação nesta execução).';
comment on column public.integration_sync_runs.failed_count is
  'Quantas operações de persistência falharam de forma inesperada nesta execução -- success deve ser false quando este número é maior que zero.';
comment on column public.integration_sync_runs.failed_details is
  'Lista de falhas individuais: [{external_appointment_id, error}]. Nunca contém telefone, nome ou endereço -- só o id do agendamento (uuid) e a mensagem técnica do erro de persistência.';
