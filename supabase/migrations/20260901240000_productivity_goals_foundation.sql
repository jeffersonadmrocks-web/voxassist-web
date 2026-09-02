-- ============================================================
-- Consolidação Produtividade / Metas / Bonificação -- Fase 1
--
-- Base pra tudo que vem depois (goal_targets, bonus_rules,
-- bonus_campaigns, goal_bonus_audit_events, nas próximas fases):
--
-- 1. user_has_store_access(store_id) -- primeira função de RLS por
--    loja do schema. Até hoje TODO isolamento real era só por
--    company_id (confirmado por diagnóstico: nenhuma policy em
--    nenhuma tabela filtra por store_id/current_store_id). GESTOR
--    sempre enxerga todas as lojas da própria empresa (mesmo
--    comportamento já implícito no resto do sistema); os demais
--    papéis dependem de user_store_access, profiles.store_id ou
--    user_companies.store_id -- as três fontes reais de vínculo
--    usuário↔loja já existentes no schema.
--
-- 2. productivity_indicators -- catálogo dos indicadores elegíveis
--    pra meta/bonificação. Só os 4 que já têm cálculo real hoje em
--    runtime/dashboard-canonical-v1.js (Produtividade/Resumo
--    Financeiro) -- nenhum indicador novo inventado. Catálogo em
--    tabela (não hardcoded no frontend) pra permitir adicionar um
--    indicador novo depois sem migration nas tabelas de meta/regra.
-- ============================================================

create or replace function public.user_has_store_access(p_store_id uuid) returns boolean
language sql stable as $$
  select
    current_company_role() = 'GESTOR'
    or exists (
      select 1 from public.user_store_access usa
      where usa.user_id = auth.uid() and usa.store_id = p_store_id and usa.active
        and usa.company_id = current_company_id()
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
  'Primeira função de RLS por loja do schema (diagnóstico 2026-09-01: nenhuma policy existente filtrava por store_id). GESTOR sempre acessa todas as lojas da própria empresa; demais papéis dependem de user_store_access, profiles.store_id ou user_companies.store_id.';

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
