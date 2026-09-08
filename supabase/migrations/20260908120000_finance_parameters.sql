-- ============================================================
-- Matriz Mestra, Área 06 (Financeiro) -- "Parâmetros (juros/taxas/
-- arredondamento)" -- CRIAR confirmado: nenhuma coluna/tabela
-- existente guarda esses parâmetros hoje, e o fluxo de Finalizar OS
-- (os-detail-v0812.js) não aplica juros/multa/arredondamento em
-- nenhum cálculo -- valores são digitados e somados diretamente.
--
-- Guardados como colunas em `companies` (mesmo lugar de
-- business_hours/document_footer, únicos parâmetros por-empresa já
-- existentes) em vez de tabela nova, por serem um valor único por
-- empresa, não uma lista. Editados via PATCH direto em
-- `companies` (mesmo padrão de company-profile-complete-v0812.js),
-- protegido pela policy companies_update_gestor já existente --
-- nenhuma RPC nova necessária.
--
-- Escopo desta etapa é só o CADASTRO do parâmetro -- nenhum cálculo
-- de juros/multa/arredondamento é aplicado em nenhuma OS por esta
-- migration; ligar isso ao fluxo de Finalizar OS fica pra uma etapa
-- futura, quando houver uma regra de cobrança real definida.
-- ============================================================

alter table public.companies
  add column if not exists finance_interest_rate_monthly numeric,
  add column if not exists finance_fine_rate numeric,
  add column if not exists finance_rounding_mode text default 'NENHUM';

alter table public.companies drop constraint if exists companies_finance_rounding_mode_check;
alter table public.companies add constraint companies_finance_rounding_mode_check
  check (finance_rounding_mode in ('NENHUM', 'PARA_CIMA', 'PARA_BAIXO', 'MAIS_PROXIMO'));

comment on column public.companies.finance_interest_rate_monthly is 'Juros ao mês (%), parâmetro cadastrado -- ainda não aplicado em nenhum cálculo de OS.';
comment on column public.companies.finance_fine_rate is 'Multa por atraso (%), parâmetro cadastrado -- ainda não aplicado em nenhum cálculo de OS.';
comment on column public.companies.finance_rounding_mode is 'Regra de arredondamento de valores financeiros, parâmetro cadastrado -- ainda não aplicado em nenhum cálculo de OS.';
