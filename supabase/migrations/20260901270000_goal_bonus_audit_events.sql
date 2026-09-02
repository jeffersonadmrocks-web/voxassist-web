-- ============================================================
-- Consolidação Produtividade / Metas / Bonificação -- Fase 4
--
-- goal_bonus_audit_events: registro legível, num único lugar, de
-- toda mudança em goal_targets/bonus_rules/bonus_campaigns --
-- config anterior, nova, responsável, data/hora, motivo (requisito
-- explícito do usuário: "registrar pelo menos: configuração
-- anterior; configuração nova; usuário responsável; data/hora...").
-- O modelo versionado das 3 tabelas (Fases 2-3) já impede alteração
-- retroativa silenciosa por si só (nunca UPDATE do valor em si), mas
-- reconstruir "quem mudou o quê, quando" via UNION entre 3 tabelas
-- de formato diferente é caro e amarra a auditoria à forma interna
-- delas -- por isso uma tabela dedicada, mesmo esqueleto de
-- chat_conversation_events (só nunca usada até esta sessão).
--
-- Estritamente append-only: sem policy de UPDATE nem DELETE. A
-- escrita será feita pelas RPCs transacionais da Fase 5 (security
-- invoker -- rodam com o mesmo RLS de quem chamou, então a policy de
-- INSERT abaixo é quem realmente autoriza, não a RPC em si).
-- ============================================================

create table if not exists public.goal_bonus_audit_events (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  subject_scope_type text,
  subject_role text,
  subject_user_id uuid,
  reason text,
  changed_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_pkey PRIMARY KEY (id);
alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id);

alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_entity_type_check CHECK ((entity_type = ANY (ARRAY['GOAL_TARGET'::text, 'BONUS_RULE'::text, 'BONUS_CAMPAIGN'::text])));
alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_action_check CHECK ((action = ANY (ARRAY['CRIADA'::text, 'SUBSTITUIDA'::text, 'ENCERRADA_ANTECIPADAMENTE'::text, 'CANCELADA'::text])));
alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_subject_scope_type_check CHECK ((subject_scope_type IS NULL) OR (subject_scope_type = ANY (ARRAY['LOJA'::text, 'EQUIPE'::text, 'INDIVIDUAL'::text])));
alter table public.goal_bonus_audit_events add constraint goal_bonus_audit_events_subject_role_check CHECK ((subject_role IS NULL) OR (subject_role = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text, 'TECNICO'::text, 'ESTOQUE'::text, 'FINANCEIRO'::text])));

-- store_id nullable aqui pela mesma razão de bonus_rules/
-- bonus_campaigns.store_id (Fase 3): a entidade auditada pode ser de
-- empresa toda, não só de uma loja específica. goal_targets é sempre
-- de uma loja, então eventos de GOAL_TARGET sempre têm store_id
-- preenchido na prática -- não reforçado por CHECK pra não acoplar
-- esta tabela genérica de auditoria à regra de uma entidade
-- específica.
comment on column public.goal_bonus_audit_events.store_id is
  'Loja da entidade auditada, quando aplicável. NULL para eventos de entidade que valem pra empresa toda (bonus_rules/bonus_campaigns com store_id NULL) -- goal_targets sempre preenche, por ser sempre por loja.';

CREATE INDEX idx_goal_bonus_audit_events_entity ON public.goal_bonus_audit_events USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_goal_bonus_audit_events_subject ON public.goal_bonus_audit_events USING btree (subject_user_id) WHERE (subject_user_id IS NOT NULL);
CREATE INDEX idx_goal_bonus_audit_events_company ON public.goal_bonus_audit_events USING btree (company_id, store_id, created_at DESC);

alter table public.goal_bonus_audit_events enable row level security;

-- SELECT: GESTOR com acesso à loja da entidade vê tudo (inclusive
-- eventos de LOJA/EQUIPE, sem subject_user_id); qualquer pessoa vê
-- só os eventos que dizem respeito a ela mesma (histórico próprio,
-- conforme a regra de permissão do usuário: ATENDENTE/TECNICO só
-- visualiza histórico próprio, nunca o de terceiros).
create policy "goal_bonus_audit_events_select" on public.goal_bonus_audit_events for SELECT to authenticated
  using (
    company_id = current_company_id()
    and (
      (current_company_role() = 'GESTOR' and (store_id is null or user_has_store_access(store_id)))
      or subject_user_id = auth.uid()
    )
  );

-- INSERT restrito a GESTOR com acesso à loja da entidade -- mesma
-- checagem das policies de escrita de goal_targets/bonus_rules/
-- bonus_campaigns, já que só um GESTOR pode alterar essas entidades
-- (logo só um GESTOR gera eventos de auditoria sobre elas).
create policy "goal_bonus_audit_events_insert_gestor" on public.goal_bonus_audit_events for INSERT to authenticated
  with check (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and (store_id is null or user_has_store_access(store_id))
    and changed_by = auth.uid()
  );

-- Sem policy de UPDATE nem DELETE -- append-only de verdade, nem
-- GESTOR pode alterar um evento já gravado.

comment on table public.goal_bonus_audit_events is
  'Auditoria append-only de goal_targets/bonus_rules/bonus_campaigns -- config anterior/nova/responsável/data/motivo num único lugar. Nunca UPDATE/DELETE; escrita só via as RPCs transacionais da Fase 5.';
