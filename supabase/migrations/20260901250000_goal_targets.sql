-- ============================================================
-- Consolidação Produtividade / Metas / Bonificação -- Fase 2
--
-- goal_targets: metas em 3 níveis (LOJA/EQUIPE/INDIVIDUAL), sempre
-- vinculadas a uma loja (store_id obrigatório -- decisão confirmada
-- pelo usuário: reflete o modelo multiloja real). EQUIPE = grupo por
-- papel (ex.: "meta dos Técnicos") -- scope_role identifica o papel,
-- e a meta vale pra todo mundo daquele papel naquela loja.
--
-- Modelo versionado: NUNCA UPDATE do valor/período/escopo em si --
-- só INSERT de nova vigência + fechamento da anterior (valid_to,
-- status, closed_by, superseded_by). Um trigger BEFORE UPDATE
-- bloqueia qualquer tentativa de alterar as colunas substantivas,
-- garantindo no banco (não só na aplicação) que uma meta vigente
-- nunca é apagada/alterada retroativamente -- só substituída por uma
-- nova vigência, com a antiga preservada e consultável.
-- ============================================================

create table if not exists public.goal_targets (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid not null,
  scope_type text not null,
  scope_role text,
  scope_user_id uuid,
  indicator_code text not null,
  target_value numeric not null,
  period_start date not null,
  period_end date not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  superseded_by uuid,
  status text not null default 'ATIVA'::text,
  created_by uuid not null,
  closed_by uuid,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.goal_targets add constraint goal_targets_pkey PRIMARY KEY (id);
alter table public.goal_targets add constraint goal_targets_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.goal_targets add constraint goal_targets_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
alter table public.goal_targets add constraint goal_targets_indicator_code_fkey FOREIGN KEY (indicator_code) REFERENCES productivity_indicators(code);
alter table public.goal_targets add constraint goal_targets_scope_user_id_fkey FOREIGN KEY (scope_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.goal_targets add constraint goal_targets_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES goal_targets(id);
alter table public.goal_targets add constraint goal_targets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.goal_targets add constraint goal_targets_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES profiles(id);

alter table public.goal_targets add constraint goal_targets_scope_type_check CHECK ((scope_type = ANY (ARRAY['LOJA'::text, 'EQUIPE'::text, 'INDIVIDUAL'::text])));
alter table public.goal_targets add constraint goal_targets_status_check CHECK ((status = ANY (ARRAY['ATIVA'::text, 'ENCERRADA'::text, 'CANCELADA'::text])));
alter table public.goal_targets add constraint goal_targets_scope_role_check CHECK ((scope_role IS NULL) OR (scope_role = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text, 'TECNICO'::text, 'ESTOQUE'::text, 'FINANCEIRO'::text])));
alter table public.goal_targets add constraint goal_targets_period_check CHECK ((period_end >= period_start));
alter table public.goal_targets add constraint goal_targets_target_value_check CHECK ((target_value > 0));
-- Discriminador: cada scope_type preenche só o campo que lhe cabe --
-- LOJA não tem papel nem pessoa; EQUIPE tem papel, não pessoa;
-- INDIVIDUAL tem pessoa, não papel.
alter table public.goal_targets add constraint goal_targets_scope_discriminator_check CHECK (
  (scope_type = 'LOJA' AND scope_role IS NULL AND scope_user_id IS NULL)
  OR (scope_type = 'EQUIPE' AND scope_role IS NOT NULL AND scope_user_id IS NULL)
  OR (scope_type = 'INDIVIDUAL' AND scope_role IS NULL AND scope_user_id IS NOT NULL)
);

-- Impede duas metas ATIVAS conflitantes pro mesmo alvo/indicador/
-- período -- reforça a hierarquia no próprio banco, não só na
-- aplicação. coalesce() evita o efeito colateral de NULL != NULL em
-- índice único (scope_role/scope_user_id são NULL em metas de LOJA).
CREATE UNIQUE INDEX goal_targets_active_unique
  ON public.goal_targets (company_id, store_id, scope_type, coalesce(scope_role, ''), coalesce(scope_user_id::text, ''), indicator_code, period_start, period_end)
  WHERE (status = 'ATIVA' AND valid_to IS NULL);

CREATE INDEX idx_goal_targets_lookup ON public.goal_targets USING btree (company_id, store_id, indicator_code, status);
CREATE INDEX idx_goal_targets_scope_user ON public.goal_targets USING btree (scope_user_id) WHERE (scope_user_id IS NOT NULL);

create or replace function public.goal_targets_block_retroactive_update() returns trigger
language plpgsql as $$
begin
  if (
    NEW.company_id is distinct from OLD.company_id
    or NEW.store_id is distinct from OLD.store_id
    or NEW.scope_type is distinct from OLD.scope_type
    or NEW.scope_role is distinct from OLD.scope_role
    or NEW.scope_user_id is distinct from OLD.scope_user_id
    or NEW.indicator_code is distinct from OLD.indicator_code
    or NEW.target_value is distinct from OLD.target_value
    or NEW.period_start is distinct from OLD.period_start
    or NEW.period_end is distinct from OLD.period_end
    or NEW.created_by is distinct from OLD.created_by
    or NEW.created_at is distinct from OLD.created_at
  ) then
    raise exception 'goal_targets: alteração retroativa não permitida -- só é possível fechar a vigência atual (valid_to/status/closed_by/superseded_by/reason). Para mudar o valor, período ou escopo de uma meta, crie uma nova vigência.';
  end if;
  return NEW;
end;
$$;

create trigger trg_goal_targets_block_retroactive_update
  before update on public.goal_targets
  for each row execute function public.goal_targets_block_retroactive_update();

alter table public.goal_targets enable row level security;

-- SELECT: GESTOR vê tudo da loja; meta de LOJA é sempre visível a
-- quem tem acesso à loja (é coletiva por natureza); meta de EQUIPE só
-- pra quem tem aquele papel (confirmado pelo usuário: "a meta dos
-- técnicos" é literalmente a meta de quem é técnico, não de todo
-- mundo da loja); meta INDIVIDUAL só pra quem é o alvo dela.
create policy "goal_targets_select" on public.goal_targets for SELECT to authenticated
  using (
    company_id = current_company_id()
    and user_has_store_access(store_id)
    and (
      current_company_role() = 'GESTOR'
      or scope_type = 'LOJA'
      or (scope_type = 'EQUIPE' and scope_role = current_company_role())
      or (scope_type = 'INDIVIDUAL' and scope_user_id = auth.uid())
    )
  );

create policy "goal_targets_insert_gestor" on public.goal_targets for INSERT to authenticated
  with check (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and user_has_store_access(store_id)
    and created_by = auth.uid()
  );

-- UPDATE só serve pra fechar vigência (o trigger acima trava o resto)
-- -- restrito a GESTOR COM acesso àquela loja especificamente (não
-- basta ser GESTOR da empresa -- achado na revisão de 2026-09-01: sem
-- checar user_has_store_access aqui, um GESTOR vinculado só à Serra
-- conseguiria fechar a vigência de uma meta da Vitória).
create policy "goal_targets_close_gestor" on public.goal_targets for UPDATE to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR' and user_has_store_access(store_id))
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR' and user_has_store_access(store_id));

-- Sem policy de DELETE -- meta vigente nunca é apagada, só fechada.

comment on table public.goal_targets is
  'Metas de produtividade em 3 níveis (LOJA/EQUIPE/INDIVIDUAL), versionadas -- nunca UPDATE do valor/período/escopo (trigger bloqueia), só INSERT de nova vigência + fechamento da anterior. store_id sempre obrigatório (modelo multiloja).';
