-- ============================================================
-- Robô de Atendimento -- Fase 1: config do fluxo (versionada)
--
-- chat_bot_flow_versions: rascunho/publicada/arquivada. Diferente do
-- padrão goal_targets/bonus_rules (nunca UPDATE, só INSERT de nova
-- vigência) -- aqui um RASCUNHO é uma linha só, livremente editável
-- (o GESTOR mexe várias vezes antes de publicar; versionar cada
-- tecla seria exagero). A imutabilidade só entra em vigor no momento
-- da publicação: uma vez que status sai de RASCUNHO, o trigger abaixo
-- bloqueia qualquer alteração de conteúdo pra sempre -- pra mudar,
-- cria-se um rascunho novo (RPC restore_chat_bot_flow_version, Fase
-- 3), nunca edita a publicada. Isso garante que
-- chat_conversation_bot_state.flow_version_id (Fase 2) sempre aponta
-- pra um snapshot estável, mesmo anos depois.
--
-- chat_bot_flow_steps/step_conditions/routing_rules são filhas de uma
-- versão -- CRUD livre enquanto a versão é RASCUNHO, travadas por RLS
-- assim que a versão deixa de ser RASCUNHO (nenhum trigger de
-- imutabilidade próprio nelas; a proteção vem só de checar o status
-- do pai via policy).
-- ============================================================

create table if not exists public.chat_bot_flow_versions (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  status text not null default 'RASCUNHO'::text,
  welcome_message text not null default '',
  invalid_message text not null default 'Não entendi sua resposta. Pode tentar de novo?',
  retry_limit integer not null default 3,
  always_human_toggle boolean not null default true,
  lookup_toggle boolean not null default true,
  resume_toggle boolean not null default true,
  resume_hours integer not null default 24,
  after_hours_toggle boolean not null default true,
  business_hours_text text not null default 'Segunda a sexta, 08h às 18h',
  after_hours_message text not null default '',
  default_attendant_id uuid,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  superseded_by uuid,
  created_by uuid not null,
  published_by uuid,
  published_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_pkey PRIMARY KEY (id);
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_default_attendant_id_fkey FOREIGN KEY (default_attendant_id) REFERENCES profiles(id);
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES chat_bot_flow_versions(id);
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_published_by_fkey FOREIGN KEY (published_by) REFERENCES profiles(id);
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_status_check CHECK ((status = ANY (ARRAY['RASCUNHO'::text, 'PUBLICADA'::text, 'ARQUIVADA'::text])));
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_retry_limit_check CHECK ((retry_limit > 0));
alter table public.chat_bot_flow_versions add constraint chat_bot_flow_versions_resume_hours_check CHECK ((resume_hours > 0));

-- Só uma versão RASCUNHO e uma PUBLICADA por empresa por vez -- evita
-- ambiguidade sobre "qual é o rascunho atual" ou qual está valendo.
CREATE UNIQUE INDEX chat_bot_flow_versions_draft_unique ON public.chat_bot_flow_versions (company_id) WHERE (status = 'RASCUNHO');
CREATE UNIQUE INDEX chat_bot_flow_versions_published_unique ON public.chat_bot_flow_versions (company_id) WHERE (status = 'PUBLICADA');
CREATE INDEX idx_chat_bot_flow_versions_company ON public.chat_bot_flow_versions USING btree (company_id, status);

create or replace function public.chat_bot_flow_versions_block_retroactive_update() returns trigger
language plpgsql as $$
begin
  if OLD.status <> 'RASCUNHO' then
    if (
      NEW.company_id is distinct from OLD.company_id
      or NEW.welcome_message is distinct from OLD.welcome_message
      or NEW.invalid_message is distinct from OLD.invalid_message
      or NEW.retry_limit is distinct from OLD.retry_limit
      or NEW.always_human_toggle is distinct from OLD.always_human_toggle
      or NEW.lookup_toggle is distinct from OLD.lookup_toggle
      or NEW.resume_toggle is distinct from OLD.resume_toggle
      or NEW.resume_hours is distinct from OLD.resume_hours
      or NEW.after_hours_toggle is distinct from OLD.after_hours_toggle
      or NEW.business_hours_text is distinct from OLD.business_hours_text
      or NEW.after_hours_message is distinct from OLD.after_hours_message
      or NEW.default_attendant_id is distinct from OLD.default_attendant_id
      or NEW.created_by is distinct from OLD.created_by
      or NEW.created_at is distinct from OLD.created_at
    ) then
      raise exception 'chat_bot_flow_versions: versão publicada/arquivada não pode ser alterada -- crie um novo rascunho (restaurar) pra mudar o conteúdo.';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_chat_bot_flow_versions_block_retroactive_update
  before update on public.chat_bot_flow_versions
  for each row execute function public.chat_bot_flow_versions_block_retroactive_update();

alter table public.chat_bot_flow_versions enable row level security;
create policy "chat_bot_flow_versions_select_company" on public.chat_bot_flow_versions for SELECT to authenticated
  using (company_id = current_company_id());
create policy "chat_bot_flow_versions_insert_gestor" on public.chat_bot_flow_versions for INSERT to authenticated
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR' and created_by = auth.uid());
create policy "chat_bot_flow_versions_update_gestor" on public.chat_bot_flow_versions for UPDATE to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR')
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');
-- Sem DELETE -- histórico de versão nunca é apagado, só arquivado.

create table if not exists public.chat_bot_flow_steps (
  id uuid not null default gen_random_uuid(),
  flow_version_id uuid not null,
  step_key text not null,
  step_order integer not null,
  question_text text not null,
  answer_type text not null default 'FREE_TEXT'::text,
  options jsonb not null default '[]'::jsonb,
  routing_dimension text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.chat_bot_flow_steps add constraint chat_bot_flow_steps_pkey PRIMARY KEY (id);
alter table public.chat_bot_flow_steps add constraint chat_bot_flow_steps_flow_version_id_fkey FOREIGN KEY (flow_version_id) REFERENCES chat_bot_flow_versions(id) ON DELETE CASCADE;
alter table public.chat_bot_flow_steps add constraint chat_bot_flow_steps_answer_type_check CHECK ((answer_type = ANY (ARRAY['CHOICE'::text, 'FREE_TEXT'::text])));
alter table public.chat_bot_flow_steps add constraint chat_bot_flow_steps_routing_dimension_check CHECK ((routing_dimension IS NULL) OR (routing_dimension = ANY (ARRAY['STORE'::text, 'WARRANTY'::text, 'BRAND'::text])));
alter table public.chat_bot_flow_steps add constraint chat_bot_flow_steps_unique_key UNIQUE (flow_version_id, step_key);
CREATE INDEX idx_chat_bot_flow_steps_version ON public.chat_bot_flow_steps USING btree (flow_version_id, step_order);

alter table public.chat_bot_flow_steps enable row level security;
create policy "chat_bot_flow_steps_select_company" on public.chat_bot_flow_steps for SELECT to authenticated
  using (exists (select 1 from public.chat_bot_flow_versions v where v.id = flow_version_id and v.company_id = current_company_id()));
create policy "chat_bot_flow_steps_write_gestor_draft" on public.chat_bot_flow_steps for ALL to authenticated
  using (current_company_role() = 'GESTOR' and exists (select 1 from public.chat_bot_flow_versions v where v.id = flow_version_id and v.company_id = current_company_id() and v.status = 'RASCUNHO'))
  with check (current_company_role() = 'GESTOR' and exists (select 1 from public.chat_bot_flow_versions v where v.id = flow_version_id and v.company_id = current_company_id() and v.status = 'RASCUNHO'));

create table if not exists public.chat_bot_flow_step_conditions (
  id uuid not null default gen_random_uuid(),
  step_id uuid not null,
  depends_on_step_id uuid not null,
  depends_on_value text not null,
  created_at timestamptz not null default now()
);
alter table public.chat_bot_flow_step_conditions add constraint chat_bot_flow_step_conditions_pkey PRIMARY KEY (id);
alter table public.chat_bot_flow_step_conditions add constraint chat_bot_flow_step_conditions_step_id_fkey FOREIGN KEY (step_id) REFERENCES chat_bot_flow_steps(id) ON DELETE CASCADE;
alter table public.chat_bot_flow_step_conditions add constraint chat_bot_flow_step_conditions_depends_on_step_id_fkey FOREIGN KEY (depends_on_step_id) REFERENCES chat_bot_flow_steps(id) ON DELETE CASCADE;
alter table public.chat_bot_flow_step_conditions add constraint chat_bot_flow_step_conditions_no_self_dependency CHECK ((step_id <> depends_on_step_id));
-- Um step só pode ter UMA condição (igualdade simples) -- cobre os
-- exemplos reais do protótipo ("se garantia = Em garantia, pede nota
-- fiscal") sem virar um motor de expressão AND/OR genérico.
alter table public.chat_bot_flow_step_conditions add constraint chat_bot_flow_step_conditions_unique_step UNIQUE (step_id);

alter table public.chat_bot_flow_step_conditions enable row level security;
create policy "chat_bot_flow_step_conditions_select_company" on public.chat_bot_flow_step_conditions for SELECT to authenticated
  using (exists (select 1 from public.chat_bot_flow_steps s join public.chat_bot_flow_versions v on v.id = s.flow_version_id where s.id = step_id and v.company_id = current_company_id()));
create policy "chat_bot_flow_step_conditions_write_gestor_draft" on public.chat_bot_flow_step_conditions for ALL to authenticated
  using (current_company_role() = 'GESTOR' and exists (select 1 from public.chat_bot_flow_steps s join public.chat_bot_flow_versions v on v.id = s.flow_version_id where s.id = step_id and v.company_id = current_company_id() and v.status = 'RASCUNHO'))
  with check (current_company_role() = 'GESTOR' and exists (select 1 from public.chat_bot_flow_steps s join public.chat_bot_flow_versions v on v.id = s.flow_version_id where s.id = step_id and v.company_id = current_company_id() and v.status = 'RASCUNHO'));

create table if not exists public.chat_bot_routing_rules (
  id uuid not null default gen_random_uuid(),
  flow_version_id uuid not null,
  store_id uuid,
  warranty_value text,
  brand_value text,
  target_attendant_id uuid not null,
  specificity integer generated always as (
    (case when store_id is not null then 1 else 0 end)
    + (case when warranty_value is not null then 1 else 0 end)
    + (case when brand_value is not null then 1 else 0 end)
  ) stored,
  created_at timestamptz not null default now()
);
alter table public.chat_bot_routing_rules add constraint chat_bot_routing_rules_pkey PRIMARY KEY (id);
alter table public.chat_bot_routing_rules add constraint chat_bot_routing_rules_flow_version_id_fkey FOREIGN KEY (flow_version_id) REFERENCES chat_bot_flow_versions(id) ON DELETE CASCADE;
alter table public.chat_bot_routing_rules add constraint chat_bot_routing_rules_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
alter table public.chat_bot_routing_rules add constraint chat_bot_routing_rules_target_attendant_id_fkey FOREIGN KEY (target_attendant_id) REFERENCES profiles(id);
-- Regra com as 3 dimensões nulas seria idêntica ao atendente padrão
-- da versão -- não faz sentido, forçaria ambiguidade sem motivo.
alter table public.chat_bot_routing_rules add constraint chat_bot_routing_rules_specificity_check CHECK ((specificity >= 1));
-- Duas regras com a MESMA combinação exata (inclusive "ambos nulos"
-- numa dimensão) nunca podem coexistir -- é o único empate que a
-- especificidade sozinha não resolve.
CREATE UNIQUE INDEX chat_bot_routing_rules_unique_combo ON public.chat_bot_routing_rules (flow_version_id, coalesce(store_id::text, ''), coalesce(warranty_value, ''), coalesce(brand_value, ''));
CREATE INDEX idx_chat_bot_routing_rules_version ON public.chat_bot_routing_rules USING btree (flow_version_id, specificity DESC);

-- Normaliza warranty_value/brand_value (maiúsculo/trim) -- evita duas
-- regras "equivalentes" (Electrolux vs ELECTROLUX) escaparem do índice
-- único acima só por causa de caixa/espaço. A mesma normalização é
-- replicada no lado JS (chatBotFlow.ts) ao casar a resposta do
-- cliente contra as regras -- precisa bater dos dois lados.
create or replace function public.chat_bot_routing_rules_normalize() returns trigger
language plpgsql as $$
begin
  if NEW.warranty_value is not null then
    NEW.warranty_value := upper(trim(NEW.warranty_value));
    if NEW.warranty_value = '' then NEW.warranty_value := null; end if;
  end if;
  if NEW.brand_value is not null then
    NEW.brand_value := upper(trim(NEW.brand_value));
    if NEW.brand_value = '' then NEW.brand_value := null; end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_chat_bot_routing_rules_normalize
  before insert or update on public.chat_bot_routing_rules
  for each row execute function public.chat_bot_routing_rules_normalize();

alter table public.chat_bot_routing_rules enable row level security;
create policy "chat_bot_routing_rules_select_company" on public.chat_bot_routing_rules for SELECT to authenticated
  using (exists (select 1 from public.chat_bot_flow_versions v where v.id = flow_version_id and v.company_id = current_company_id()));
create policy "chat_bot_routing_rules_write_gestor_draft" on public.chat_bot_routing_rules for ALL to authenticated
  using (current_company_role() = 'GESTOR' and exists (select 1 from public.chat_bot_flow_versions v where v.id = flow_version_id and v.company_id = current_company_id() and v.status = 'RASCUNHO'))
  with check (current_company_role() = 'GESTOR' and exists (select 1 from public.chat_bot_flow_versions v where v.id = flow_version_id and v.company_id = current_company_id() and v.status = 'RASCUNHO'));

comment on table public.chat_bot_flow_versions is
  'Configuração versionada do Robô de Atendimento inicial. RASCUNHO é livremente editável; publicar congela o conteúdo pra sempre (trigger) -- pra mudar depois de publicada, cria-se um rascunho novo (RPC restore_chat_bot_flow_version). Só uma RASCUNHO e uma PUBLICADA por empresa por vez.';
comment on table public.chat_bot_flow_steps is
  'Perguntas de triagem de uma versão do fluxo -- CRUD livre enquanto a versão é RASCUNHO (RLS), travado assim que publicada.';
comment on table public.chat_bot_flow_step_conditions is
  'Ramificação condicional simples (1 condição de igualdade por step) -- ex.: "se garantia = Em garantia, pede nota fiscal".';
comment on table public.chat_bot_routing_rules is
  'Regra de roteamento por combinação loja/garantia/marca -- prioridade AUTOMÁTICA por especificidade (mais dimensões preenchidas vence), nunca ordem manual. warranty_value/brand_value normalizados (maiúsculo/trim) pra casar de forma confiável com a resposta do cliente.';
