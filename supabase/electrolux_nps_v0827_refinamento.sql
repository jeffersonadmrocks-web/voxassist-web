-- ============================================================
-- VoxAssist — Gestão de NPS Electrolux (V0.8.13, 2026-08-27)
-- Segunda rodada de refinamento: carência obrigatória de 6h antes de um
-- caso concluído virar elegível para contato de NPS. Migration aditiva e
-- idempotente sobre electrolux_nps_v0826.sql — não edita aquele arquivo
-- (já aplicado contra o backend real da Electrolux).
-- Seguro rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- Backfill: casos existentes com situacao='AGUARDANDO_CONTATO' (valor
-- descontinuado nesta rodada) precisam virar AGUARDANDO_ELEGIBILIDADE ou
-- ELEGIVEL_PARA_NPS antes de trocar a constraint, senão ficam presos com
-- um valor que a nova constraint não aceita mais.
-- ------------------------------------------------------------
update public.nps_cases
set situacao = case
    when concluded_at is not null and now() - concluded_at >= interval '6 hours' then 'ELEGIVEL_PARA_NPS'
    else 'AGUARDANDO_ELEGIBILIDADE'
  end,
  updated_at = now()
where situacao = 'AGUARDANDO_CONTATO';

-- ------------------------------------------------------------
-- Constraint de situacao: troca AGUARDANDO_CONTATO por
-- AGUARDANDO_ELEGIBILIDADE + ELEGIVEL_PARA_NPS.
-- ------------------------------------------------------------
alter table public.nps_cases drop constraint if exists nps_cases_situacao_check;
alter table public.nps_cases add constraint nps_cases_situacao_check check (situacao in (
  'AGUARDANDO_ELEGIBILIDADE', 'ELEGIVEL_PARA_NPS', 'PRIMEIRO_CONTATO_ENVIADO', 'AGUARDANDO_RESPOSTA', 'LEMBRETE_ENVIADO',
  'CLIENTE_CONFIRMOU_RESPOSTA', 'CLIENTE_NAO_RECEBEU', 'CLIENTE_NAO_RESPONDEU',
  'CLIENTE_NAO_DESEJA_CONTATO', 'CASO_DE_ATENCAO', 'FINALIZADO'
));

alter table public.nps_cases alter column situacao set default 'AGUARDANDO_ELEGIBILIDADE';
