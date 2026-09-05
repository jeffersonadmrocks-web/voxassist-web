-- ============================================================
-- Achado do usuário em 2026-09-05: o modal "Solicitar peça"
-- (os-detail-v0812.js, vxOpenSolicitarPecaModal) juntava a peça e a
-- observação livre numa string só ("DESCRICAO — observação"), gravada
-- direto em parts_requests.description -- ficava ilegível na lista de
-- "Pedidos de Peças" do Dashboard e não dava pra separar os dois na
-- hora de ver o detalhe. Coluna nova e aditiva pra guardar a
-- observação separada da descrição/identificação da peça em si.
-- ============================================================
alter table public.parts_requests add column if not exists notes text;
comment on column public.parts_requests.notes is
  'Observação livre da solicitação (ex.: urgência, link do fornecedor) -- separada da descrição da peça em si (achado do usuário 2026-09-05, antes ficavam concatenadas em description).';
