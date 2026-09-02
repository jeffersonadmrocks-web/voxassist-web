-- ============================================================
-- Achado do usuário em 2026-09-02: o popup "Novo caso de atenção"
-- (OS → botão CASO DE ATENÇÃO) não deixava escolher pra quem o caso
-- vai -- e hoje TODO caso aparece no Dashboard de TODO mundo da
-- empresa (dashboard_cases nunca foi filtrado por destinatário, ver
-- runtime/dashboard-canonical-v1.js). Pedido: poder escolher um ou
-- mais operadores específicos, ou um grupo (papel, ex. "Atendentes"),
-- e o caso só aparecer no Dashboard de quem foi selecionado.
--
-- Tabela nova, N:N -- um caso pode ter vários destinatários, cada um
-- sendo OU uma pessoa específica (user_id) OU um papel inteiro (role,
-- ex. 'ATENDENTE' -- todo mundo com esse papel na empresa). Nunca os
-- dois na mesma linha (exatamente um dos dois preenchido).
--
-- Sem destinatário nenhum = visível pra empresa toda (mesmo
-- comportamento de hoje, nada quebra pros casos já existentes). GESTOR
-- sempre vê todos os casos da empresa, independente de destinatário
-- (mesmo padrão "GESTOR vê tudo" já usado no resto do app) -- isso é
-- responsabilidade do código que lê (Dashboard), não desta tabela.
-- ============================================================

create table if not exists public.dashboard_case_recipients (
  id uuid not null default gen_random_uuid(),
  case_id uuid not null,
  company_id uuid not null,
  user_id uuid,
  role text,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.dashboard_case_recipients add constraint dashboard_case_recipients_pkey PRIMARY KEY (id);
alter table public.dashboard_case_recipients add constraint dashboard_case_recipients_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.dashboard_cases(id) ON DELETE CASCADE;
alter table public.dashboard_case_recipients add constraint dashboard_case_recipients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.dashboard_case_recipients add constraint dashboard_case_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.dashboard_case_recipients add constraint dashboard_case_recipients_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.dashboard_case_recipients add constraint dashboard_case_recipients_role_check CHECK (role is null or role in ('GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'));
alter table public.dashboard_case_recipients add constraint dashboard_case_recipients_exactly_one_target CHECK ((user_id is not null and role is null) or (user_id is null and role is not null));
CREATE INDEX idx_dashboard_case_recipients_case ON public.dashboard_case_recipients USING btree (case_id);
CREATE INDEX idx_dashboard_case_recipients_user ON public.dashboard_case_recipients USING btree (user_id) WHERE user_id IS NOT NULL;

comment on table public.dashboard_case_recipients is 'Destinatários de um caso de atenção (dashboard_cases): uma pessoa (user_id) ou um papel inteiro (role). Sem nenhuma linha = visível pra empresa toda, mesmo comportamento de antes desta tabela existir.';

alter table public.dashboard_case_recipients enable row level security;
create policy "dashboard_case_recipients_select_company" on public.dashboard_case_recipients for SELECT to authenticated
  using (company_id = current_company_id());
create policy "dashboard_case_recipients_insert_company" on public.dashboard_case_recipients for INSERT to authenticated
  with check (company_id = current_company_id());
create policy "dashboard_case_recipients_delete_company" on public.dashboard_case_recipients for DELETE to authenticated
  using (company_id = current_company_id());
