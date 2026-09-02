-- ============================================================
-- Consolidação Produtividade / Metas / Bonificação -- Fase 1
--
-- Base pra tudo que vem depois (goal_targets, bonus_rules,
-- bonus_campaigns, goal_bonus_audit_events, nas próximas fases):
--
-- 1. user_has_store_access(store_id) -- primeira função de RLS por
--    loja do schema. Até hoje TODO isolamento real era só por
--    company_id (confirmado por diagnóstico: nenhuma policy em
--    nenhuma tabela filtra por store_id/current_store_id). Acesso
--    depende SEMPRE de vínculo explícito -- role = GESTOR sozinho
--    NUNCA concede acesso implícito a nenhuma loja (correção pedida
--    pelo usuário em 2026-09-01: um gestor pode ser vinculado só à
--    Serra, só à Vitória, às duas, ou a nenhuma). Um GESTOR com
--    acesso a "todas as lojas" (administrador) recebe isso da mesma
--    forma que qualquer outro vínculo: uma linha explícita em
--    user_store_access com store_id = NULL, convenção de "curinga"
--    introduzida nesta mesma fase (ver ALTER logo abaixo) -- nunca
--    implícita, e cobre lojas novas criadas depois automaticamente
--    sem precisar de uma linha por loja.
--
-- 2. productivity_indicators -- catálogo dos indicadores elegíveis
--    pra meta/bonificação. Só os 4 que já têm cálculo real hoje em
--    runtime/dashboard-canonical-v1.js (Produtividade/Resumo
--    Financeiro) -- nenhum indicador novo inventado. Catálogo em
--    tabela (não hardcoded no frontend) pra permitir adicionar um
--    indicador novo depois sem migration nas tabelas de meta/regra.
-- ============================================================

-- user_store_access.store_id vira nullable nesta mesma fase (ALTER
-- logo abaixo, depois de productivity_indicators) -- NULL ali
-- significa "todas as lojas da empresa" pra aquele usuário, sempre
-- por vínculo explícito (uma linha inserida de propósito), nunca
-- implícito por papel. Note que isso é um conceito DIFERENTE do NULL
-- em bonus_rules.store_id (Fase 3) -- lá, NULL significa "regra vale
-- pra empresa toda" (escopo de uma REGRA); aqui, NULL significa
-- "usuário tem acesso a toda loja da empresa" (escopo de um ACESSO).
-- Mesma convenção sintática, propósitos distintos -- documentado nos
-- dois lugares pra não confundir quem ler depois.
create or replace function public.user_has_store_access(p_store_id uuid) returns boolean
language sql stable as $$
  select
    exists (
      select 1 from public.user_store_access usa
      where usa.user_id = auth.uid() and usa.active
        and usa.company_id = current_company_id()
        and (usa.store_id = p_store_id or usa.store_id is null)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.store_id = p_store_id
    )
    or exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.store_id = p_store_id and uc.active
        and uc.company_id = current_company_id()
    );
$$;

comment on function public.user_has_store_access(uuid) is
  'Primeira função de RLS por loja do schema. Acesso sempre por vínculo explícito -- role = GESTOR sozinho NUNCA concede acesso implícito. Fontes: user_store_access (store_id = NULL é o curinga explícito "todas as lojas"), profiles.store_id, user_companies.store_id.';

-- user_store_access já existia antes desta sessão (tabela de
-- produção) -- store_id era NOT NULL, então "acesso a todas as
-- lojas" nunca tinha como ser representado por uma linha própria.
-- Isto é aditivo e não quebra nenhuma linha existente (todas já têm
-- store_id preenchido); só passa a permitir NULL como valor válido
-- novo, com o significado de curinga explícito descrito acima.
alter table public.user_store_access alter column store_id drop not null;

comment on column public.user_store_access.store_id is
  'Loja concedida a este usuário. NULL = curinga explícito "todas as lojas da empresa" (inclusive lojas criadas depois) -- precisa de uma linha própria pra isso, nunca é implícito por papel/role.';

-- Evita duas linhas curinga redundantes pro mesmo usuário/empresa --
-- a UNIQUE original (user_id, company_id, store_id) não pega isso
-- porque Postgres trata cada NULL como distinto por padrão.
CREATE UNIQUE INDEX user_store_access_wildcard_unique
  ON public.user_store_access (user_id, company_id)
  WHERE (store_id IS NULL);

create table if not exists public.productivity_indicators (
  code text not null,
  label text not null,
  unit text not null default 'COUNT'::text,
  source_description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.productivity_indicators add constraint productivity_indicators_pkey PRIMARY KEY (code);
alter table public.productivity_indicators add constraint productivity_indicators_unit_check CHECK ((unit = ANY (ARRAY['BRL'::text, 'COUNT'::text, 'PERCENT'::text])));
alter table public.productivity_indicators enable row level security;

create policy "Todos autenticados veem o catálogo de indicadores" on public.productivity_indicators for SELECT to authenticated
  using (true);
-- Sem policy de INSERT/UPDATE/DELETE pra ninguém por enquanto -- o
-- catálogo é gerenciado por migration (mesma disciplina de qualquer
-- schema controlado), não pela aplicação. Se precisar virar editável
-- pelo GESTOR no futuro, isso é uma migration própria, não implícita.

insert into public.productivity_indicators (code, label, unit, source_description) values
  ('VALOR_RECEBIDO', 'Valor Recebido', 'BRL', 'Soma de payments.amount com paid_at preenchido e status fora de CANCELADO/CANCELADA/ESTORNADO/ESTORNADA -- mesma lógica de validPayments em runtime/dashboard-canonical-v1.js.'),
  ('OS_ATRIBUIDAS', 'OS Atribuídas', 'COUNT', 'Contagem de service_orders com technician_id = pessoa, status ativo (isOpen) -- mesma lógica do card Produtividade do Dashboard.'),
  ('OS_FINALIZADAS', 'OS Finalizadas/Prontos', 'COUNT', 'Contagem de service_orders com status PRONTO PARA ENTREGA ou FINALIZADA atribuídas à pessoa -- mesma lógica do card Produtividade do Dashboard.'),
  ('APROVEITAMENTO_PCT', 'Aproveitamento', 'PERCENT', 'OS Finalizadas/Prontos dividido por OS Atribuídas -- mesma lógica do card Produtividade do Dashboard.');
