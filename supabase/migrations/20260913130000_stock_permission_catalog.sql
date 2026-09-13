-- ============================================================
-- EST-2A (1/6) -- catálogo de permissões: acrescenta estoque.entrada e
-- estoque.auditoria ao MESMO catálogo único já existente
-- (is_valid_permission_key, migration 20260908200000, última alteração
-- em 20260913100000 pra financeiro.reverse) -- não cria catálogo novo,
-- mesmo padrão já usado no Financeiro.
--
-- estoque.entrada: autoriza chamar stock_register_entry (RPC do
-- EST-2A). estoque.auditoria: reservada agora pro futuro botão de
-- auditoria da tela de estoque (ainda não construído neste pacote),
-- adicionada aqui só pra não precisar de outra migration de catálogo
-- quando essa tela existir -- não tem nenhuma RPC usando ainda.
-- ============================================================

create or replace function public.is_valid_permission_key(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key in (
    'os.view','os.create','os.edit','os.cancel','os.status','os.print','os.financial',
    'whirlpool.view','whirlpool.edit',
    'agenda.view_all','agenda.view_own','agenda.edit','agenda.drag','agenda.block',
    'financeiro.view','financeiro.edit','financeiro.export','financeiro.reverse',
    'estoque.view','estoque.edit','estoque.entrada','estoque.auditoria',
    'relatorios.view','relatorios.export',
    'config.view','config.users','config.companies'
  );
$$;
comment on function public.is_valid_permission_key is
  'Catálogo único de chaves de permissão válidas. estoque.entrada/estoque.auditoria adicionados em 2026-09-13 (EST-2A) pra stock_register_entry reaproveitar o mesmo catálogo -- mesmo padrão de financeiro.reverse, nenhum catálogo novo.';
