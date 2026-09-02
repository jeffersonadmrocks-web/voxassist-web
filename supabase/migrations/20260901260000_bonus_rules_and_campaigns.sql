-- ============================================================
-- Consolidação Produtividade / Metas / Bonificação -- Fase 3
--
-- bonus_campaigns: agrupamento temporário de regras de bonificação
-- (uma campanha não é uma segunda estrutura -- é só um conjunto de
-- bonus_rules com campaign_id preenchido e vigência própria).
--
-- bonus_rules: regra de bonificação configurável (indicador elegível,
-- peso, faixas de atingimento, público elegível). store_id NULLABLE
-- aqui (decisão documentada no plano: regra tende a ser política de
-- empresa, diferente de goal_targets.store_id que é sempre
-- obrigatório porque meta é física por loja).
--
-- Mesmo modelo versionado de goal_targets nas duas tabelas: nunca
-- UPDATE das colunas substantivas, só INSERT de nova vigência +
-- fechamento da anterior, reforçado por trigger BEFORE UPDATE. Isso
-- fecha a mesma brecha em bonus_campaigns -- sem isso, um GESTOR
-- poderia editar datas/nome de campanha direto, sem deixar rastro,
-- o que violaria a regra de auditoria tão quanto editar uma regra.
-- ============================================================

create table if not exists public.bonus_campaigns (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid,
  name text not null,
  description text,
  starts_at date not null,
  ends_at date not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  superseded_by uuid,
  status text not null default 'ATIVA'::text,
  created_by uuid not null,
  closed_by uuid,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.bonus_campaigns add constraint bonus_campaigns_pkey PRIMARY KEY (id);
alter table public.bonus_campaigns add constraint bonus_campaigns_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.bonus_campaigns add constraint bonus_campaigns_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
alter table public.bonus_campaigns add constraint bonus_campaigns_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES bonus_campaigns(id);
alter table public.bonus_campaigns add constraint bonus_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.bonus_campaigns add constraint bonus_campaigns_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES profiles(id);
alter table public.bonus_campaigns add constraint bonus_campaigns_status_check CHECK ((status = ANY (ARRAY['ATIVA'::text, 'ENCERRADA'::text, 'CANCELADA'::text])));
alter table public.bonus_campaigns add constraint bonus_campaigns_dates_check CHECK ((ends_at >= starts_at));
CREATE INDEX idx_bonus_campaigns_lookup ON public.bonus_campaigns USING btree (company_id, store_id, status);

create table if not exists public.bonus_rules (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid,
  indicator_code text not null,
  eligible_scope_type text not null,
  eligible_role text,
  eligible_user_id uuid,
  weight numeric not null default 1,
  tier_rules jsonb not null,
  campaign_id uuid,
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
alter table public.bonus_rules add constraint bonus_rules_pkey PRIMARY KEY (id);
alter table public.bonus_rules add constraint bonus_rules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.bonus_rules add constraint bonus_rules_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
alter table public.bonus_rules add constraint bonus_rules_indicator_code_fkey FOREIGN KEY (indicator_code) REFERENCES productivity_indicators(code);
alter table public.bonus_rules add constraint bonus_rules_eligible_user_id_fkey FOREIGN KEY (eligible_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.bonus_rules add constraint bonus_rules_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES bonus_campaigns(id) ON DELETE CASCADE;
alter table public.bonus_rules add constraint bonus_rules_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES bonus_rules(id);
alter table public.bonus_rules add constraint bonus_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.bonus_rules add constraint bonus_rules_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES profiles(id);

alter table public.bonus_rules add constraint bonus_rules_eligible_scope_type_check CHECK ((eligible_scope_type = ANY (ARRAY['LOJA'::text, 'EQUIPE'::text, 'INDIVIDUAL'::text])));
alter table public.bonus_rules add constraint bonus_rules_status_check CHECK ((status = ANY (ARRAY['ATIVA'::text, 'ENCERRADA'::text, 'CANCELADA'::text])));
alter table public.bonus_rules add constraint bonus_rules_eligible_role_check CHECK ((eligible_role IS NULL) OR (eligible_role = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text, 'TECNICO'::text, 'ESTOQUE'::text, 'FINANCEIRO'::text])));
alter table public.bonus_rules add constraint bonus_rules_period_check CHECK ((period_end >= period_start));
alter table public.bonus_rules add constraint bonus_rules_weight_check CHECK ((weight > 0));
alter table public.bonus_rules add constraint bonus_rules_tier_rules_is_array_check CHECK (jsonb_typeof(tier_rules) = 'array');
-- Mesmo discriminador de goal_targets, pro público elegível.
alter table public.bonus_rules add constraint bonus_rules_eligible_discriminator_check CHECK (
  (eligible_scope_type = 'LOJA' AND eligible_role IS NULL AND eligible_user_id IS NULL)
  OR (eligible_scope_type = 'EQUIPE' AND eligible_role IS NOT NULL AND eligible_user_id IS NULL)
  OR (eligible_scope_type = 'INDIVIDUAL' AND eligible_role IS NULL AND eligible_user_id IS NOT NULL)
);

-- Só a regra "padrão" (sem campanha) precisa ser única por alvo/
-- indicador/período -- regra de campanha é deliberadamente uma
-- camada adicional/temporária por cima da padrão, então pode
-- coexistir com ela (é o objetivo de uma campanha).
CREATE UNIQUE INDEX bonus_rules_active_default_unique
  ON public.bonus_rules (company_id, coalesce(store_id::text, ''), eligible_scope_type, coalesce(eligible_role, ''), coalesce(eligible_user_id::text, ''), indicator_code, period_start, period_end)
  WHERE (status = 'ATIVA' AND valid_to IS NULL AND campaign_id IS NULL);

CREATE INDEX idx_bonus_rules_lookup ON public.bonus_rules USING btree (company_id, store_id, indicator_code, status);
CREATE INDEX idx_bonus_rules_campaign ON public.bonus_rules USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);
CREATE INDEX idx_bonus_rules_eligible_user ON public.bonus_rules USING btree (eligible_user_id) WHERE (eligible_user_id IS NOT NULL);

-- ---------- triggers anti-retroativos (mesmo padrão de goal_targets) ----------

create or replace function public.bonus_campaigns_block_retroactive_update() returns trigger
language plpgsql as $$
begin
  if (
    NEW.company_id is distinct from OLD.company_id
    or NEW.store_id is distinct from OLD.store_id
    or NEW.name is distinct from OLD.name
    or NEW.description is distinct from OLD.description
    or NEW.starts_at is distinct from OLD.starts_at
    or NEW.ends_at is distinct from OLD.ends_at
    or NEW.created_by is distinct from OLD.created_by
    or NEW.created_at is distinct from OLD.created_at
  ) then
    raise exception 'bonus_campaigns: alteração retroativa não permitida -- só é possível encerrar a campanha atual (valid_to/status/closed_by/superseded_by/reason). Para mudar nome, datas ou descrição, crie uma nova campanha.';
  end if;
  return NEW;
end;
$$;
create trigger trg_bonus_campaigns_block_retroactive_update
  before update on public.bonus_campaigns
  for each row execute function public.bonus_campaigns_block_retroactive_update();

create or replace function public.bonus_rules_block_retroactive_update() returns trigger
language plpgsql as $$
begin
  if (
    NEW.company_id is distinct from OLD.company_id
    or NEW.store_id is distinct from OLD.store_id
    or NEW.indicator_code is distinct from OLD.indicator_code
    or NEW.eligible_scope_type is distinct from OLD.eligible_scope_type
    or NEW.eligible_role is distinct from OLD.eligible_role
    or NEW.eligible_user_id is distinct from OLD.eligible_user_id
    or NEW.weight is distinct from OLD.weight
    or NEW.tier_rules is distinct from OLD.tier_rules
    or NEW.campaign_id is distinct from OLD.campaign_id
    or NEW.period_start is distinct from OLD.period_start
    or NEW.period_end is distinct from OLD.period_end
    or NEW.created_by is distinct from OLD.created_by
    or NEW.created_at is distinct from OLD.created_at
  ) then
    raise exception 'bonus_rules: alteração retroativa não permitida -- só é possível encerrar a regra atual (valid_to/status/closed_by/superseded_by/reason). Para mudar peso, faixas, público elegível ou período, crie uma nova regra.';
  end if;
  return NEW;
end;
$$;
create trigger trg_bonus_rules_block_retroactive_update
  before update on public.bonus_rules
  for each row execute function public.bonus_rules_block_retroactive_update();

-- ---------- RLS ----------

alter table public.bonus_campaigns enable row level security;
-- Campanha (nome/datas/status) não é dado individualmente sensível
-- como um valor de bônus -- visível a quem tem acesso à loja
-- (ou à empresa toda, quando store_id é nulo).
create policy "bonus_campaigns_select" on public.bonus_campaigns for SELECT to authenticated
  using (
    company_id = current_company_id()
    and (store_id is null or user_has_store_access(store_id))
  );
create policy "bonus_campaigns_insert_gestor" on public.bonus_campaigns for INSERT to authenticated
  with check (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and (store_id is null or user_has_store_access(store_id))
    and created_by = auth.uid()
  );
create policy "bonus_campaigns_close_gestor" on public.bonus_campaigns for UPDATE to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR')
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');

alter table public.bonus_rules enable row level security;
-- Mesma regra de visibilidade de goal_targets (Fase 2): loja é
-- coletiva/aberta a quem tem acesso; equipe só pra quem tem o papel;
-- individual só pro alvo; GESTOR vê tudo.
create policy "bonus_rules_select" on public.bonus_rules for SELECT to authenticated
  using (
    company_id = current_company_id()
    and (store_id is null or user_has_store_access(store_id))
    and (
      current_company_role() = 'GESTOR'
      or eligible_scope_type = 'LOJA'
      or (eligible_scope_type = 'EQUIPE' and eligible_role = current_company_role())
      or (eligible_scope_type = 'INDIVIDUAL' and eligible_user_id = auth.uid())
    )
  );
create policy "bonus_rules_insert_gestor" on public.bonus_rules for INSERT to authenticated
  with check (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and (store_id is null or user_has_store_access(store_id))
    and created_by = auth.uid()
  );
create policy "bonus_rules_close_gestor" on public.bonus_rules for UPDATE to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR')
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');

-- Sem policy de DELETE em nenhuma das duas tabelas.

comment on table public.bonus_campaigns is
  'Agrupamento temporário de bonus_rules (campaign_id) -- não é uma segunda arquitetura de bonificação, só uma vigência própria pra um conjunto de regras. Versionada como goal_targets: sem UPDATE retroativo.';
comment on table public.bonus_rules is
  'Regra de bonificação configurável (indicador, peso, faixas de atingimento em tier_rules, público elegível). store_id nullable (regra pode valer pra empresa toda); goal_targets.store_id é sempre obrigatório porque meta é física por loja. Versionada: sem UPDATE retroativo.';
