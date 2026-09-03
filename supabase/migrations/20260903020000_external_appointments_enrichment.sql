-- ============================================================
-- Agenda Electrolux -- campos complementares reais (achado do usuário
-- 2026-09-03): o card "Agenda dos Técnicos" do Dashboard passou a
-- mostrar os compromissos da Electrolux, mas faltava Bairro, Modelo e
-- Peça -- pedido explícito: nunca inventar, só mostrar o que
-- realmente vem da Electrolux.
--
-- Auditoria ao vivo (somente leitura) confirmou:
--   - productName JÁ vem na listagem barata (GET /api/dashboard/
--     service-orders, a mesma que sync-electrolux-agenda já consulta
--     a cada 10min) -- nenhuma chamada nova precisa existir pra isso.
--   - endereço (bairro/cidade/rua/UF) e peças SÓ vêm no detalhe por id
--     (GET /api/dashboard/service-orders/{id}) -- não existem na
--     listagem. As colunas address_* já existiam no schema mas nunca
--     foram escritas por código nenhum (confirmado: 100% null hoje).
-- ============================================================

alter table public.external_appointments add column if not exists product_name text;
comment on column public.external_appointments.product_name is
  'Modelo do produto (campo productName da Electrolux) -- vem de graça na listagem já sincronizada a cada 10min, sem chamada extra.';

alter table public.external_appointments add column if not exists parts jsonb;
comment on column public.external_appointments.parts is
  'Peças já vinculadas à SVO na Electrolux (campo parts do detalhe -- [{codigo,descricao,disponivel}]), quando já existir alguma no momento da consulta. Nunca inventado -- null até o enriquecimento buscar e a Electrolux realmente ter alguma peça associada.';

alter table public.external_appointments add column if not exists detail_checked_at timestamptz;
comment on column public.external_appointments.detail_checked_at is
  'Última vez que o detalhe (endereço/peças) foi consultado pra esta SVO -- throttle do enriquecimento, não é data de evento nenhum.';

create index if not exists external_appointments_detail_enrichment_idx
  on public.external_appointments (detail_checked_at)
  where address_neighborhood is null and appointment_date is not null;
comment on index public.external_appointments_detail_enrichment_idx is
  'Suporte ao lote de enriquecimento (endereço/peças) -- só SVOs agendadas ainda sem endereço capturado, ordenadas pelo que faz mais tempo sem checar.';
