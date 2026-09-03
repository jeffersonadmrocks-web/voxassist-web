-- ============================================================
-- Dashboard -- camada de autorização no backend (achado do usuário
-- 2026-09-02, continuação obrigatória da matriz de visibilidade).
--
-- A rodada anterior implementou a matriz inteira no FRONTEND
-- (dashboard-canonical-v1.js) -- correto pra apresentação, mas
-- "visibilidade não é segurança": uma chamada REST direta ainda
-- conseguia trazer dado além do que o perfil deveria ver. Esta
-- migration fecha isso pras fontes onde dá pra fazer sem quebrar uma
-- regra já aprovada.
--
-- ACHADO ARQUITETURAL (documentado, não escondido): service_orders e
-- os_status_history alimentam AO MESMO TEMPO "Indicadores gerais"
-- (que precisa ficar empresa inteira pra ATENDENTE -- correção
-- explícita pedida pelo usuário nesta mesma sessão) E "Oportunidades/
-- Gestão por Exceção/Feed/Produtividade" (que a matriz pede escopado
-- por loja autorizada pra ATENDENTE). RLS é por TABELA, não por
-- "card" -- não dá pra restringir uma consulta e liberar outra na
-- MESMA tabela sem saber qual tela está perguntando. Aplicar uma
-- policy de loja aqui quebraria a correção de Indicadores gerais já
-- entregue e aprovada nesta sessão. Por isso NENHUMA policy nova
-- entra em service_orders/os_status_history nesta migration -- o
-- escopo por loja desses cards específicos continua só no frontend
-- até existir uma fonte separada (RPC de agregados, por exemplo) pra
-- alimentar Indicadores gerais sem depender do acesso linha-a-linha
-- de service_orders. TECNICO já está coberto: service_orders e
-- os_status_history (via join) e appointments JÁ tinham RLS
-- restringindo technician_id=auth.uid() antes desta migration
-- (confirmado por auditoria, nenhuma mudança necessária).
--
-- O que ESTA migration fecha de verdade, sem esse conflito:
-- 1. dashboard_cases -- "dele/compartilhado/encaminhado", pros 3
--    perfis (RLS só tinha company_id antes).
-- 2. tasks -- "somente dele/própria", pros 3 perfis (RLS só tinha
--    company_id antes).
-- 3. parts_requests -- TECNICO só próprios/relacionados à OS
--    atribuída; ATENDENTE/GESTOR só lojas autorizadas ou próprios
--    (RLS só tinha company_id antes).
-- 4. os_financial/payments -- TECNICO só os vinculados à própria OS
--    (preserva o uso legítimo já aprovado -- orçamento/pagamento da
--    OS que o técnico está atendendo); GESTOR/ATENDENTE inalterados
--    (RLS só tinha company_id antes -- TECNICO conseguia ler
--    financeiro de QUALQUER OS da empresa direto via REST, gap real
--    e o mais grave dos encontrados, exatamente o que a seção 6 do
--    pedido do usuário aponta).
--
-- Todas as policies aqui são RESTRICTIVE (AND com as permissivas já
-- existentes, nunca as substitui nem enfraquece) -- a policy
-- "*_company" original de cada tabela continua intacta, só ganha uma
-- restrição A MAIS por cima.
-- ============================================================

-- ---------- helper reutilizável: "esta loja está entre as autorizadas do usuário atual" ----------
-- Mesmo critério já usado no frontend (dashboard-canonical-v1.js,
-- storeAuthorized()): sem nenhuma linha em user_store_access pro
-- usuário = sem restrição configurada = autorizado (GESTOR/ATENDENTE
-- default, mesmo comportamento de antes desta correção); registro sem
-- loja vinculada (p_store_id null) também não bloqueia.
create or replace function public.store_authorized(p_store_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select
    p_store_id is null
    or not exists (select 1 from public.user_store_access usa where usa.user_id = auth.uid() and usa.active = true)
    or exists (select 1 from public.user_store_access usa where usa.user_id = auth.uid() and usa.store_id = p_store_id and usa.active = true);
$$;
comment on function public.store_authorized(uuid) is
  'Helper reutilizável de autorização por loja -- mesmo critério do frontend (dashboard-canonical-v1.js storeAuthorized()). Sem restrição configurada em user_store_access = autorizado (default GESTOR/ATENDENTE); loja nula no registro nunca bloqueia.';

-- ---------- 1. dashboard_cases: dele/compartilhado/encaminhado ----------
-- Espelha exatamente caseVisibleToMe() do frontend -- mesma regra dos
-- dois lados, documentado assim de propósito (achado do usuário:
-- "evitar duplicar lógica diferente em dezenas de policies").
create policy "dashboard_cases_visibility_restrictive" on public.dashboard_cases as restrictive for select to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.dashboard_case_recipients r where r.case_id = dashboard_cases.id and (r.user_id = auth.uid() or r.role = current_company_role()))
    or exists (select 1 from public.service_orders so where so.id = dashboard_cases.service_order_id and so.technician_id = auth.uid())
  );
comment on policy "dashboard_cases_visibility_restrictive" on public.dashboard_cases is
  'RESTRICTIVE -- fecha no banco o que caseVisibleToMe() já fazia só no frontend (achado 2026-09-02, matriz de visibilidade). Dele, compartilhado com ele, encaminhado pra ele, ou relacionado à OS que ele atende -- pros 3 perfis, sem exceção pra GESTOR.';

-- ---------- 2. tasks: somente dele/própria ----------
create policy "tasks_assigned_to_restrictive" on public.tasks as restrictive for select to authenticated
  using (assigned_to = auth.uid());
comment on policy "tasks_assigned_to_restrictive" on public.tasks is
  'RESTRICTIVE -- "Minhas Tarefas" nunca tinha filtro de dono nenhum no banco (nem no frontend, até a correção 2026-09-02) -- qualquer membro da empresa lia tarefa de qualquer um. Agora só o próprio assigned_to, pros 3 perfis.';

-- ---------- 3. parts_requests: TECNICO próprios/relacionados; ATENDENTE/GESTOR lojas autorizadas ----------
create policy "parts_requests_visibility_restrictive" on public.parts_requests as restrictive for select to authenticated
  using (
    requested_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.service_orders so where so.id = parts_requests.service_order_id and (
        (current_company_role() = 'TECNICO' and so.technician_id = auth.uid())
        or (current_company_role() <> 'TECNICO' and public.store_authorized(so.store_id))
      )
    )
    or parts_requests.service_order_id is null
  );
comment on policy "parts_requests_visibility_restrictive" on public.parts_requests is
  'RESTRICTIVE -- matriz 2026-09-02: TECNICO só pedidos próprios ou de OS atribuída a ele; ATENDENTE/GESTOR só lojas autorizadas (store_authorized(), default sem restrição). Pedido sem OS vinculada não é bloqueado (mesmo critério de "sem dado suficiente pra restringir, não esconde").';

-- ---------- 4. os_financial/payments: TECNICO só a própria OS ----------
-- Achado do usuário em 2026-09-02 (seção 6, o mais grave dos gaps):
-- TECNICO conseguia ler os_financial/payments de QUALQUER OS da
-- empresa via REST direto -- a tela do Dashboard escondia o card
-- "Resumo Financeiro" pra TECNICO, mas isso nunca foi proteção real
-- (RLS antes só verificava company_id). Preserva o uso legítimo já
-- aprovado (orçamento/pagamento da OWN OS que o técnico atende, usado
-- na tela de detalhe da OS) -- só bloqueia o que seria uma visão
-- financeira GERENCIAL (outras OS, agregados).
create policy "os_financial_technician_scope_restrictive" on public.os_financial as restrictive for select to authenticated
  using (
    current_company_role() <> 'TECNICO'
    or exists (select 1 from public.service_orders so where so.id = os_financial.service_order_id and so.technician_id = auth.uid())
  );
comment on policy "os_financial_technician_scope_restrictive" on public.os_financial is
  'RESTRICTIVE -- fecha o gap mais grave apontado pelo usuário (matriz 2026-09-02, seção 6): TECNICO só via financeiro da própria OS, nunca a empresa toda, mesmo por REST direto. GESTOR/ATENDENTE inalterados.';

create policy "payments_technician_scope_restrictive" on public.payments as restrictive for select to authenticated
  using (
    current_company_role() <> 'TECNICO'
    or exists (select 1 from public.service_orders so where so.id = payments.service_order_id and so.technician_id = auth.uid())
  );
comment on policy "payments_technician_scope_restrictive" on public.payments is
  'RESTRICTIVE -- mesmo critério de os_financial_technician_scope_restrictive, tabela payments.';
