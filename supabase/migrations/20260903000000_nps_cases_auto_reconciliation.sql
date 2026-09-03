-- ============================================================
-- NPS Electrolux -- reconciliação automática da resposta (correção,
-- achado do usuário 2026-09-03).
--
-- Premissa usada na migration anterior (20260902060000_nps_cases_
-- respondido.sql) estava incorreta: o comentário daquela migration
-- afirma "não existe API que devolva isso hoje" para nota/resposta do
-- NPS. Auditoria confirmou o contrário -- GET /api/dashboard/service-
-- orders/{externalId} (_shared/electrolux.ts, mesma origem já usada
-- por sync-electrolux-agenda e get-electrolux-appointment-detail) já
-- devolve os campos da pesquisa (npsStatus, npsValue, npsComments,
-- npsDateAnswer, npsTechnicianValue) para QUALQUER SVO, aberta ou
-- encerrada -- confirmado ao vivo (somente leitura) contra 3 SVOs
-- reais já encerradas, todas com npsStatus="Respondido" e nota real,
-- enquanto o nps_cases local dessas mesmas 3 continuava
-- AGUARDANDO_PRAZO_NPS com nps_score nulo.
--
-- Causa raiz real: ninguém nunca CONSULTAVA esse endpoint pra isso.
-- sync-electrolux-nps nunca bate na Electrolux (só lê
-- external_appointments). sync-electrolux-agenda até bate no endpoint
-- de detalhe, mas só UMA VEZ por atendimento (no momento exato em que
-- ele some da listagem ativa), e só pra ler `.status` -- todo o resto
-- do corpo, inclusive os campos de NPS, era descartado.
--
-- Esta migration só adiciona a coluna de throttle usada pela nova
-- rotina de reconciliação em sync-electrolux-nps (ver Edge Function) --
-- os campos onde a nota/resposta são gravados (nps_score,
-- technician_nps_score, response_comment, responded_at) já existem
-- desde 20260902060000, reaproveitados sem alteração.
-- ============================================================

alter table public.nps_cases add column last_electrolux_check_at timestamptz;

comment on column public.nps_cases.last_electrolux_check_at is
  'Última vez que a reconciliação automática consultou o detalhe da SVO na Electrolux pra checar resposta de NPS. Usado só pra throttle/ordenação do próximo lote -- não é a data da resposta em si (isso é responded_at).';

create index if not exists nps_cases_reconciliation_idx
  on public.nps_cases (last_electrolux_check_at)
  where situacao not in ('RESPONDIDO', 'FINALIZADO');

comment on index public.nps_cases_reconciliation_idx is
  'Suporte ao lote de reconciliação automática -- só casos ainda não resolvidos (RESPONDIDO/FINALIZADO), ordenados pelo que faz mais tempo que não é revisitado.';
