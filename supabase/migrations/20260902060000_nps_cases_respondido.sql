-- ============================================================
-- NPS Electrolux -- estado RESPONDIDO (correção P0, achado do usuário
-- 2026-09-02).
--
-- Auditoria confirmou que não existe reconciliação automática possível
-- hoje: a única API integrada (GET /api/dashboard/service-orders,
-- ver _shared/electrolux.ts) não devolve nenhum campo de NPS -- nem
-- status, nem nota, nem data de resposta, nem comentário. O "Respondido
-- / NPS: 10" que o usuário vê é só no DASHBOARD VISUAL da própria
-- Electrolux, sem rota de API por trás (confirmado com o usuário).
-- sync-electrolux-nps também nunca foi desenhado pra isso -- ele só
-- CRIA casos novos e promove por tempo (6h), nunca revisita um caso já
-- existente contra dado novo.
--
-- Sem fonte automática, a única correção honesta é dar ao
-- atendente/gestor uma forma de registrar manualmente o que já viu no
-- painel da Electrolux -- nota, nota do técnico, data da resposta e
-- comentário -- e um estado RESPONDIDO de verdade (distinto de
-- CLIENTE_CONFIRMOU_RESPOSTA, que é só relato verbal do cliente sem
-- nenhum dado da pesquisa em si). Isso tira o caso da fila de
-- pendência e impede novo envio, sem apagar nada -- mesma filosofia de
-- FINALIZADO, só que com os dados da pesquisa preenchidos.
-- ============================================================

alter table public.nps_cases add column nps_score integer;
alter table public.nps_cases add column technician_nps_score integer;
alter table public.nps_cases add column response_comment text;
alter table public.nps_cases add column responded_at timestamptz;

alter table public.nps_cases add constraint nps_cases_nps_score_check CHECK ((nps_score IS NULL) OR (nps_score BETWEEN 0 AND 10));
alter table public.nps_cases add constraint nps_cases_technician_nps_score_check CHECK ((technician_nps_score IS NULL) OR (technician_nps_score BETWEEN 0 AND 10));

alter table public.nps_cases drop constraint nps_cases_situacao_check;
alter table public.nps_cases add constraint nps_cases_situacao_check
  CHECK ((situacao = ANY (ARRAY[
    'AGUARDANDO_ENCERRAMENTO'::text, 'AGUARDANDO_PRAZO_NPS'::text, 'AGUARDANDO_CONTATO'::text,
    'PRIMEIRO_CONTATO_ENVIADO'::text, 'AGUARDANDO_RESPOSTA'::text, 'LEMBRETE_ENVIADO'::text,
    'CLIENTE_CONFIRMOU_RESPOSTA'::text, 'CLIENTE_NAO_RECEBEU'::text, 'CLIENTE_NAO_RESPONDEU'::text,
    'CLIENTE_NAO_DESEJA_CONTATO'::text, 'CASO_DE_ATENCAO'::text, 'FINALIZADO'::text,
    'RESPONDIDO'::text
  ])));

-- nps_score só é exigido quando o caso de fato está marcado como
-- respondido -- os outros desfechos continuam sem essa obrigação.
alter table public.nps_cases add constraint nps_cases_respondido_requires_score
  CHECK ((situacao <> 'RESPONDIDO') OR (nps_score IS NOT NULL AND responded_at IS NOT NULL));

comment on column public.nps_cases.nps_score is
  'Nota 0-10 da pesquisa de NPS da Electrolux, registrada manualmente por quem viu o resultado no painel da própria Electrolux -- não existe API que devolva isso hoje.';
comment on column public.nps_cases.technician_nps_score is
  'Nota do técnico na mesma pesquisa, quando a Electrolux exibe separadamente. Opcional.';
comment on column public.nps_cases.response_comment is
  'Comentário livre do cliente na pesquisa, quando houver, copiado do painel da Electrolux.';
comment on column public.nps_cases.responded_at is
  'Data/hora da resposta conforme registrada no painel da Electrolux -- não é o momento em que alguém marcou o caso no VoxAssist, e sim o que a Electrolux mostra.';
