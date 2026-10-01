-- ============================================================
-- Cadastro de Peças (achado do usuário, 2026-10-01): comparando com o
-- cadastro do sistema antigo (System III), faltavam os campos de
-- reposição/precificação que o usuário usa no dia a dia -- estoque
-- mínimo (alerta de reposição) e margem/desconto/IPI/ICMS (%). Apenas
-- colunas novas em stock_items (nenhuma tabela nova, nenhuma RPC nova
-- -- o mesmo PATCH direto via PostgREST que o cadastro já usa hoje
-- grava estas também, igual custo/preço de referência).
-- ============================================================

alter table public.stock_items
  add column if not exists minimum_quantity numeric,
  add column if not exists margin_percent numeric,
  add column if not exists discount_percent numeric,
  add column if not exists ipi_percent numeric,
  add column if not exists icms_percent numeric;

comment on column public.stock_items.minimum_quantity is
  'Estoque mínimo (ponto de reposição) -- equivalente a EST.MINIMO do sistema antigo. Usado só pra alerta visual quando available_quantity cai abaixo deste número; nunca bloqueia nenhuma operação sozinho.';
comment on column public.stock_items.margin_percent is 'Margem (%) -- equivalente a MARGEM do sistema antigo. Informativo, não recalcula preço de venda sozinho.';
comment on column public.stock_items.discount_percent is 'Desconto padrão (%) -- equivalente a DESCONTO do sistema antigo.';
comment on column public.stock_items.ipi_percent is 'IPI (%) -- equivalente a IPI do sistema antigo.';
comment on column public.stock_items.icms_percent is 'ICMS (%) -- equivalente a T.ICMS do sistema antigo.';
