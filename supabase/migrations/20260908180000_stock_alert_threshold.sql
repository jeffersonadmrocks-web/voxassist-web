-- ============================================================
-- Matriz Mestra, Área 05 (Estoque & Peças) -- "Alertas" -- CRIAR
-- confirmado: `stock_items` não tem nenhum campo de quantidade
-- mínima/limite, não existe nenhum alerta de estoque baixo hoje.
--
-- Escopo desta etapa: parâmetro padrão por empresa (quantidade
-- mínima usada quando o item não tem um limite próprio) + coluna
-- opcional por item (min_quantity) pra sobrescrever o padrão.
-- Card em Configurações mostra quantos itens estão abaixo do limite
-- HOJE (leitura, com os dados reais já existentes) -- não dispara
-- nenhuma notificação/e-mail/WhatsApp; isso fica pra uma etapa
-- futura. Editar o limite de um item específico continua fora
-- desta tela (pertence à tela de Estoque operacional, não tocada
-- aqui).
-- ============================================================

alter table public.stock_items add column if not exists min_quantity numeric;
comment on column public.stock_items.min_quantity is 'Quantidade mínima antes de considerar estoque baixo pra este item. Nulo = usa companies.stock_alert_default_min_quantity.';

alter table public.companies add column if not exists stock_alert_default_min_quantity numeric;
comment on column public.companies.stock_alert_default_min_quantity is 'Quantidade mínima padrão pra alerta de estoque baixo, usada quando o item não tem stock_items.min_quantity próprio. Cadastro apenas -- ainda não dispara nenhuma notificação.';
