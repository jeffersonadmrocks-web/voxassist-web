-- Achado do usuário em 2026-09-03: o modal "Casos de Atenção" era só
-- leitura -- pediu pra dar pra responder (comentar) e encaminhar
-- (reatribuir) um caso sem sair do popup. dashboard_cases.status e
-- .assigned_to nunca eram escritos por nenhum código até agora (busca
-- ampla confirmou) -- esta migration é o primeiro lugar que grava
-- neles, então também fecha uma lacuna real: dashboard_cases só tinha
-- uma policy permissiva de ALL (sem nenhuma restrição por visibilidade
-- em UPDATE), só a de SELECT era restritiva.

create table if not exists public.dashboard_case_comments (
  id uuid not null default gen_random_uuid(),
  case_id uuid not null,
  company_id uuid not null,
  body text,
  event_type text not null default 'COMENTARIO',
  previous_data jsonb,
  new_data jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.dashboard_case_comments add constraint dashboard_case_comments_pkey primary key (id);
alter table public.dashboard_case_comments add constraint dashboard_case_comments_case_id_fkey
  foreign key (case_id) references public.dashboard_cases(id) on delete cascade;
alter table public.dashboard_case_comments add constraint dashboard_case_comments_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.dashboard_case_comments add constraint dashboard_case_comments_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.dashboard_case_comments add constraint dashboard_case_comments_event_type_check
  check (event_type in ('COMENTARIO','REASSIGN','STATUS_CHANGE'));
create index idx_dashboard_case_comments_case on public.dashboard_case_comments using btree (case_id, created_at);

comment on table public.dashboard_case_comments is
  'Fio de comentários + eventos de sistema (reatribuição/mudança de situação) de um caso de atenção. Append-only -- comentário nunca é editado nem apagado, mesmo princípio já usado pra mensagem do Chat.';

alter table public.dashboard_case_comments enable row level security;

-- Mesma condição de visibilidade já usada em dashboard_cases_visibility_restrictive
-- (20260902090000), reaproveitada via subquery -- nunca duplicar a regra em paralelo.
create policy "dashboard_case_comments_select_visible" on public.dashboard_case_comments for select to authenticated
  using (
    exists (
      select 1 from public.dashboard_cases c
      where c.id = dashboard_case_comments.case_id
        and c.company_id = current_company_id()
        and (
          c.created_by = auth.uid()
          or c.assigned_to = auth.uid()
          or exists (select 1 from public.dashboard_case_recipients r where r.case_id = c.id and (r.user_id = auth.uid() or r.role = current_company_role()))
          or exists (select 1 from public.service_orders so where so.id = c.service_order_id and so.technician_id = auth.uid())
        )
    )
  );
create policy "dashboard_case_comments_insert_visible" on public.dashboard_case_comments for insert to authenticated
  with check (
    company_id = current_company_id()
    and exists (
      select 1 from public.dashboard_cases c
      where c.id = dashboard_case_comments.case_id
        and c.company_id = current_company_id()
        and (
          c.created_by = auth.uid()
          or c.assigned_to = auth.uid()
          or exists (select 1 from public.dashboard_case_recipients r where r.case_id = c.id and (r.user_id = auth.uid() or r.role = current_company_role()))
          or exists (select 1 from public.service_orders so where so.id = c.service_order_id and so.technician_id = auth.uid())
        )
    )
  );
-- Sem update/delete -- append-only, de propósito.

-- Fecha a lacuna: dashboard_cases só tinha policy permissiva de ALL
-- (nenhuma restrição por visibilidade em UPDATE). Seguro adicionar
-- agora porque nenhum código grava em status/assigned_to hoje -- esta
-- migration é o primeiro a fazer isso.
create policy "dashboard_cases_update_visible" on public.dashboard_cases as restrictive for update to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.dashboard_case_recipients r where r.case_id = dashboard_cases.id and (r.user_id = auth.uid() or r.role = current_company_role()))
    or exists (select 1 from public.service_orders so where so.id = dashboard_cases.service_order_id and so.technician_id = auth.uid())
  );

grant select, insert on public.dashboard_case_comments to authenticated;
