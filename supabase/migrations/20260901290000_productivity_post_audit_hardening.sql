-- ============================================================
-- Consolidação Produtividade / Metas / Bonificação --
-- CORREÇÃO PÓS-AUDITORIA (auditoria sobre o commit 8ee55dd)
--
-- Não redesenha a arquitetura aprovada (Fases 1-10) -- só endurece
-- pontos concretos apontados na auditoria, todos no nível de
-- banco/RLS/RPC (a validação em JS de runtime/productivity-calc-v1.js
-- é só conveniência de formulário; a fronteira real de segurança
-- sempre foi -- e continua sendo -- o banco).
--
-- Itens endereçados nesta migration:
--   P1-3 -- acesso corporativo (store_id = NULL) exige vínculo
--           EXPLÍCITO de curinga (user_store_access.store_id IS NULL),
--           nunca role='GESTOR' sozinho.
--   P1-4 -- validate_tier_rules(jsonb): estrutura completa de cada
--           faixa + ausência de sobreposição, reforçada em CHECK.
--   P1-6 -- integridade cross-empresa: scope_user_id/eligible_user_id
--           precisam pertencer à mesma company_id; campaign_id precisa
--           pertencer à mesma company_id da regra; regra vinculada a
--           campanha restrita a uma loja não pode apontar pra outra.
--   P1-7 -- sobreposição real de vigências (não só o match exato de
--           período que o índice único parcial das Fases 2-3 pegava)
--           via EXCLUDE + btree_gist.
-- ============================================================

create extension if not exists btree_gist;

-- ---------- P1-3: acesso corporativo explícito ----------
-- Generaliza a lógica de user_has_store_access (Fase 1) pra aceitar
-- um usuário arbitrário como parâmetro -- necessário pra Fase de
-- integridade (checar se OUTRO usuário, não quem está logado, tem
-- vínculo com uma loja) sem duplicar a lógica de acesso em dois
-- lugares. user_has_store_access continua com a mesma assinatura e
-- comportamento de antes (CREATE OR REPLACE só troca a implementação
-- interna por uma chamada a esta função nova -- nenhuma migration
-- anterior é reescrita, isto é aditivo).
create or replace function public.user_id_has_store_access(p_user_id uuid, p_company_id uuid, p_store_id uuid) returns boolean
language sql stable as $$
  select
    exists (
      select 1 from public.user_store_access usa
      where usa.user_id = p_user_id and usa.active
        and usa.company_id = p_company_id
        and (usa.store_id = p_store_id or usa.store_id is null)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.store_id = p_store_id
    )
    or exists (
      select 1 from public.user_companies uc
      where uc.user_id = p_user_id and uc.store_id = p_store_id and uc.active
        and uc.company_id = p_company_id
    );
$$;

create or replace function public.user_has_store_access(p_store_id uuid) returns boolean
language sql stable as $$
  select public.user_id_has_store_access(auth.uid(), current_company_id(), p_store_id);
$$;

comment on function public.user_id_has_store_access(uuid, uuid, uuid) is
  'Mesma lógica de user_has_store_access, parametrizada por usuário -- usada pra validar vínculo de OUTRO usuário (ex.: scope_user_id de uma meta), não só de quem está logado.';

-- role = GESTOR sozinho NUNCA autoriza ação corporativa (store_id
-- NULL em bonus_rules/bonus_campaigns) -- achado da auditoria: um
-- GESTOR restrito a uma única loja não pode criar/alterar/encerrar
-- regra ou campanha "pra empresa toda". Só quem tem a linha CURINGA
-- explícita (user_store_access.store_id IS NULL, convenção da Fase 1)
-- tem autorização corporativa -- distinta de "tem acesso a QUALQUER
-- loja específica" (user_has_store_access aceita profiles.store_id e
-- user_companies.store_id como fontes também; acesso corporativo só
-- aceita a linha curinga, que é o único vínculo que garante cobertura
-- de lojas futuras).
create or replace function public.user_has_corporate_access() returns boolean
language sql stable as $$
  select exists (
    select 1 from public.user_store_access usa
    where usa.user_id = auth.uid() and usa.active
      and usa.company_id = current_company_id()
      and usa.store_id is null
  );
$$;

comment on function public.user_has_corporate_access() is
  'Autorização pra ação corporativa (store_id = NULL em bonus_rules/bonus_campaigns): exige a linha curinga explícita em user_store_access (store_id IS NULL), nunca role=GESTOR sozinho -- correção pós-auditoria P1-3.';

-- RLS de bonus_campaigns/bonus_rules (Fase 3) tratava store_id IS
-- NULL como liberado pra qualquer GESTOR -- corrigido aqui pra exigir
-- user_has_corporate_access() especificamente nesse caso.
drop policy if exists "bonus_campaigns_insert_gestor" on public.bonus_campaigns;
create policy "bonus_campaigns_insert_gestor" on public.bonus_campaigns for INSERT to authenticated
  with check (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and created_by = auth.uid()
    and (
      (store_id is not null and user_has_store_access(store_id))
      or (store_id is null and user_has_corporate_access())
    )
  );

drop policy if exists "bonus_campaigns_close_gestor" on public.bonus_campaigns;
create policy "bonus_campaigns_close_gestor" on public.bonus_campaigns for UPDATE to authenticated
  using (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and (
      (store_id is not null and user_has_store_access(store_id))
      or (store_id is null and user_has_corporate_access())
    )
  )
  with check (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and (
      (store_id is not null and user_has_store_access(store_id))
      or (store_id is null and user_has_corporate_access())
    )
  );

drop policy if exists "bonus_rules_insert_gestor" on public.bonus_rules;
create policy "bonus_rules_insert_gestor" on public.bonus_rules for INSERT to authenticated
  with check (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and created_by = auth.uid()
    and (
      (store_id is not null and user_has_store_access(store_id))
      or (store_id is null and user_has_corporate_access())
    )
  );

drop policy if exists "bonus_rules_close_gestor" on public.bonus_rules;
create policy "bonus_rules_close_gestor" on public.bonus_rules for UPDATE to authenticated
  using (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and (
      (store_id is not null and user_has_store_access(store_id))
      or (store_id is null and user_has_corporate_access())
    )
  )
  with check (
    company_id = current_company_id()
    and current_company_role() = 'GESTOR'
    and (
      (store_id is not null and user_has_store_access(store_id))
      or (store_id is null and user_has_corporate_access())
    )
  );

-- ---------- P1-4: validação real de tier_rules ----------
-- jsonb_typeof(tier_rules)='array' (Fase 3) não garante nada sobre o
-- CONTEÚDO das faixas. Espelha exatamente a validação de
-- runtime/productivity-calc-v1.js#validateTierRulesStructure: cada
-- faixa precisa de min_pct/max_pct/value numéricos, max_pct>=min_pct,
-- type em PERCENT/FIXED, value>=0, e nenhuma faixa pode se sobrepor a
-- outra (toque exato de fronteira já conta como sobreposição -- força
-- a convenção "0-69.99 / 70-100" em vez de "0-70 / 70-100").
create or replace function public.validate_tier_rules(p_tier_rules jsonb) returns boolean
language plpgsql immutable as $$
declare
  v_elem jsonb;
  v_min numeric;
  v_max numeric;
  v_value numeric;
  v_prev_max numeric;
  r record;
begin
  if p_tier_rules is null or jsonb_typeof(p_tier_rules) is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(p_tier_rules) = 0 then
    return false;
  end if;

  for v_elem in select value from jsonb_array_elements(p_tier_rules)
  loop
    if jsonb_typeof(v_elem) is distinct from 'object' then
      return false;
    end if;
    if v_elem->'min_pct' is null or jsonb_typeof(v_elem->'min_pct') is distinct from 'number' then
      return false;
    end if;
    if v_elem->'max_pct' is null or jsonb_typeof(v_elem->'max_pct') is distinct from 'number' then
      return false;
    end if;
    if v_elem->'value' is null or jsonb_typeof(v_elem->'value') is distinct from 'number' then
      return false;
    end if;
    if coalesce(v_elem->>'type', '') not in ('PERCENT', 'FIXED') then
      return false;
    end if;
    v_min := (v_elem->>'min_pct')::numeric;
    v_max := (v_elem->>'max_pct')::numeric;
    v_value := (v_elem->>'value')::numeric;
    if v_max < v_min then
      return false;
    end if;
    if v_value < 0 then
      return false;
    end if;
  end loop;

  v_prev_max := null;
  for r in
    select (elem->>'min_pct')::numeric as min_pct, (elem->>'max_pct')::numeric as max_pct
    from jsonb_array_elements(p_tier_rules) elem
    order by (elem->>'min_pct')::numeric, (elem->>'max_pct')::numeric
  loop
    if v_prev_max is not null and v_prev_max >= r.min_pct then
      return false;
    end if;
    v_prev_max := r.max_pct;
  end loop;

  return true;
end;
$$;

comment on function public.validate_tier_rules(jsonb) is
  'Validação real de estrutura de tier_rules -- espelha validateTierRulesStructure() em runtime/productivity-calc-v1.js. Reforçada em CHECK constraint: um payload manipulado direto na API/RPC é barrado no banco, não só no formulário. Correção pós-auditoria P1-4.';

alter table public.bonus_rules drop constraint if exists bonus_rules_tier_rules_is_array_check;
alter table public.bonus_rules add constraint bonus_rules_tier_rules_valid_check CHECK (public.validate_tier_rules(tier_rules));

-- ---------- P1-6: integridade cross-empresa/loja ----------
create or replace function public.goal_targets_integrity_check() returns trigger
language plpgsql as $$
declare
  v_user_company uuid;
begin
  if NEW.scope_user_id is not null then
    select company_id into v_user_company from public.profiles where id = NEW.scope_user_id;
    if v_user_company is null or v_user_company is distinct from NEW.company_id then
      raise exception 'goal_targets: scope_user_id não pertence à mesma empresa da meta.';
    end if;
    if not public.user_id_has_store_access(NEW.scope_user_id, NEW.company_id, NEW.store_id) then
      raise exception 'goal_targets: scope_user_id não tem vínculo com a loja desta meta.';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_goal_targets_integrity_check
  before insert or update on public.goal_targets
  for each row execute function public.goal_targets_integrity_check();

comment on function public.goal_targets_integrity_check() is
  'Bloqueia scope_user_id de outra empresa ou sem vínculo com a loja da meta -- impede relação cross-empresa mesmo via payload manipulado direto na RPC/API. Correção pós-auditoria P1-6.';

create or replace function public.bonus_rules_integrity_check() returns trigger
language plpgsql as $$
declare
  v_user_company uuid;
  v_campaign record;
begin
  if NEW.eligible_user_id is not null then
    select company_id into v_user_company from public.profiles where id = NEW.eligible_user_id;
    if v_user_company is null or v_user_company is distinct from NEW.company_id then
      raise exception 'bonus_rules: eligible_user_id não pertence à mesma empresa da regra.';
    end if;
  end if;

  if NEW.campaign_id is not null then
    select * into v_campaign from public.bonus_campaigns where id = NEW.campaign_id;
    if v_campaign.id is null then
      raise exception 'bonus_rules: campaign_id inexistente.';
    end if;
    if v_campaign.company_id is distinct from NEW.company_id then
      raise exception 'bonus_rules: campanha pertence a outra empresa.';
    end if;
    if v_campaign.store_id is not null and NEW.store_id is distinct from v_campaign.store_id then
      raise exception 'bonus_rules: campanha é restrita a uma loja específica -- a regra precisa apontar pra mesma loja da campanha.';
    end if;
  end if;

  return NEW;
end;
$$;

create trigger trg_bonus_rules_integrity_check
  before insert or update on public.bonus_rules
  for each row execute function public.bonus_rules_integrity_check();

comment on function public.bonus_rules_integrity_check() is
  'Bloqueia eligible_user_id de outra empresa, campaign_id de outra empresa, e regra de loja diferente da campanha à qual está vinculada (quando a campanha é restrita a uma loja). Correção pós-auditoria P1-6.';

-- ---------- P1-7: sobreposição real de vigências ----------
-- Os índices únicos parciais das Fases 2-3 só bloqueavam MATCH EXATO
-- de período (period_start/period_end idênticos) -- duas metas/regras
-- com períodos que se sobrepõem parcialmente (ex.: 01/09-30/09 e
-- 15/09-15/10) passavam sem bloqueio, criando ambiguidade silenciosa
-- de qual vale no dia 20/09. EXCLUDE USING gist com daterange(...,'&&')
-- bloqueia qualquer sobreposição, não só o match exato -- o match
-- exato é só o caso trivial de uma faixa se sobrepor a si mesma.
-- Substitui os índices únicos antigos (redundantes depois desta
-- constraint, que é estritamente mais forte).
drop index if exists public.goal_targets_active_unique;
alter table public.goal_targets add constraint goal_targets_active_no_overlap
  EXCLUDE USING gist (
    company_id WITH =,
    store_id WITH =,
    scope_type WITH =,
    (coalesce(scope_role, '')) WITH =,
    (coalesce(scope_user_id::text, '')) WITH =,
    indicator_code WITH =,
    daterange(period_start, period_end, '[]') WITH &&
  ) WHERE (status = 'ATIVA' AND valid_to IS NULL);

comment on constraint goal_targets_active_no_overlap on public.goal_targets is
  'Impede vigências ATIVAS com período sobreposto (não só idêntico) pro mesmo alvo/indicador/loja -- correção pós-auditoria P1-7. Substitui o índice único parcial da Fase 2 (goal_targets_active_unique), que só pegava match exato.';

-- Campanha é bonificação ADITIVA (P1-2) -- regra de campanha pode
-- coexistir de propósito com a regra padrão e com regras de OUTRAS
-- campanhas no mesmo período. Só a regra PADRÃO (campaign_id IS NULL)
-- precisa ser inequívoca pro mesmo alvo/indicador/período -- mesmo
-- escopo do índice único antigo.
drop index if exists public.bonus_rules_active_default_unique;
alter table public.bonus_rules add constraint bonus_rules_active_default_no_overlap
  EXCLUDE USING gist (
    company_id WITH =,
    (coalesce(store_id::text, '')) WITH =,
    eligible_scope_type WITH =,
    (coalesce(eligible_role, '')) WITH =,
    (coalesce(eligible_user_id::text, '')) WITH =,
    indicator_code WITH =,
    daterange(period_start, period_end, '[]') WITH &&
  ) WHERE (status = 'ATIVA' AND valid_to IS NULL AND campaign_id IS NULL);

comment on constraint bonus_rules_active_default_no_overlap on public.bonus_rules is
  'Impede regras PADRÃO (campaign_id IS NULL) ATIVAS com período sobreposto pro mesmo alvo/indicador/loja -- correção pós-auditoria P1-7. Regras de campanha (campaign_id preenchido) ficam de fora do escopo desta constraint de propósito -- são aditivas, não substituem a padrão (P1-2), e podem coexistir/sobrepor entre si e com a padrão.';

-- ---------- RPCs: reforço defense-in-depth (P1-3 + P1-4) ----------
-- RLS já bloqueia os dois casos abaixo (policies atualizadas acima);
-- estas checagens só antecipam um erro legível na RPC, no mesmo
-- espírito do "if current_company_role() <> 'GESTOR'" que já existia
-- desde a Fase 5 -- não são a fronteira real de autorização.
create or replace function public.set_bonus_rule(
  p_company_id uuid,
  p_store_id uuid,
  p_indicator_code text,
  p_eligible_scope_type text,
  p_eligible_role text,
  p_eligible_user_id uuid,
  p_weight numeric,
  p_tier_rules jsonb,
  p_campaign_id uuid,
  p_period_start date,
  p_period_end date,
  p_reason text default null
) returns public.bonus_rules
language plpgsql
security invoker
as $$
declare
  v_existing public.bonus_rules;
  v_new public.bonus_rules;
  v_action text;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode configurar regras de bonificação.';
  end if;
  if p_store_id is null and not public.user_has_corporate_access() then
    raise exception 'set_bonus_rule: regra corporativa (sem loja) exige vínculo explícito de acesso a todas as lojas -- GESTOR restrito a lojas específicas não pode criar/alterar regra corporativa.';
  end if;
  if p_store_id is not null and not public.user_has_store_access(p_store_id) then
    raise exception 'set_bonus_rule: sem vínculo de acesso a esta loja.';
  end if;
  if not public.validate_tier_rules(p_tier_rules) then
    raise exception 'set_bonus_rule: tier_rules inválido -- verifique faixas (min_pct/max_pct/type/value numéricos, max_pct >= min_pct, sem sobreposição).';
  end if;

  select * into v_existing
  from public.bonus_rules
  where company_id = p_company_id
    and coalesce(store_id::text, '') = coalesce(p_store_id::text, '')
    and eligible_scope_type = p_eligible_scope_type
    and coalesce(eligible_role, '') = coalesce(p_eligible_role, '')
    and coalesce(eligible_user_id::text, '') = coalesce(p_eligible_user_id::text, '')
    and indicator_code = p_indicator_code
    and coalesce(campaign_id::text, '') = coalesce(p_campaign_id::text, '')
    and period_start = p_period_start
    and period_end = p_period_end
    and status = 'ATIVA'
    and valid_to is null
  for update;

  if v_existing.id is not null then
    update public.bonus_rules
      set valid_to = now(), status = 'ENCERRADA', closed_by = auth.uid(), reason = p_reason
      where id = v_existing.id;
  end if;

  insert into public.bonus_rules (
    company_id, store_id, indicator_code, eligible_scope_type, eligible_role, eligible_user_id,
    weight, tier_rules, campaign_id, period_start, period_end, created_by
  ) values (
    p_company_id, p_store_id, p_indicator_code, p_eligible_scope_type, p_eligible_role, p_eligible_user_id,
    p_weight, p_tier_rules, p_campaign_id, p_period_start, p_period_end, auth.uid()
  ) returning * into v_new;

  if v_existing.id is not null then
    v_action := 'SUBSTITUIDA';
    update public.bonus_rules set superseded_by = v_new.id where id = v_existing.id;
  else
    v_action := 'CRIADA';
  end if;

  insert into public.goal_bonus_audit_events (
    company_id, store_id, entity_type, entity_id, action, previous_data, new_data,
    subject_scope_type, subject_role, subject_user_id, reason, changed_by
  ) values (
    p_company_id, p_store_id, 'BONUS_RULE', v_new.id, v_action,
    case when v_existing.id is not null then to_jsonb(v_existing) else '{}'::jsonb end,
    to_jsonb(v_new),
    p_eligible_scope_type, p_eligible_role, p_eligible_user_id, p_reason, auth.uid()
  );

  return v_new;
end;
$$;

comment on function public.set_bonus_rule(uuid, uuid, text, text, text, uuid, numeric, jsonb, uuid, date, date, text) is
  'Cria uma nova vigência de regra de bonificação -- correção pós-auditoria adiciona checagem explícita de acesso corporativo (P1-3) e validação defensiva de tier_rules (P1-4) antes do INSERT, além do que já era garantido por RLS/CHECK (defense-in-depth, não a fronteira real).';

create or replace function public.close_bonus_campaign(
  p_campaign_id uuid,
  p_status text default 'ENCERRADA',
  p_reason text default null
) returns public.bonus_campaigns
language plpgsql
security invoker
as $$
declare
  v_campaign public.bonus_campaigns;
  v_rule record;
  v_audit_action text;
begin
  if current_company_role() <> 'GESTOR' then
    raise exception 'Somente GESTOR pode encerrar campanhas.';
  end if;
  if p_status not in ('ENCERRADA', 'CANCELADA') then
    raise exception 'Status inválido pra encerramento de campanha: %', p_status;
  end if;

  select * into v_campaign from public.bonus_campaigns where id = p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'Campanha não encontrada.';
  end if;
  if v_campaign.status <> 'ATIVA' or v_campaign.valid_to is not null then
    raise exception 'Campanha já está encerrada/cancelada.';
  end if;
  if v_campaign.store_id is null and not public.user_has_corporate_access() then
    raise exception 'close_bonus_campaign: encerrar campanha corporativa exige vínculo explícito de acesso a todas as lojas.';
  end if;
  if v_campaign.store_id is not null and not public.user_has_store_access(v_campaign.store_id) then
    raise exception 'close_bonus_campaign: sem vínculo de acesso à loja desta campanha.';
  end if;

  v_audit_action := case when p_status = 'CANCELADA' then 'CANCELADA' else 'ENCERRADA_ANTECIPADAMENTE' end;

  update public.bonus_campaigns
    set valid_to = now(), status = p_status, closed_by = auth.uid(), reason = p_reason
    where id = p_campaign_id
    returning * into v_campaign;

  insert into public.goal_bonus_audit_events (
    company_id, store_id, entity_type, entity_id, action, previous_data, new_data, reason, changed_by
  ) values (
    v_campaign.company_id, v_campaign.store_id, 'BONUS_CAMPAIGN', v_campaign.id, v_audit_action,
    '{}'::jsonb, to_jsonb(v_campaign), p_reason, auth.uid()
  );

  for v_rule in
    select * from public.bonus_rules
    where campaign_id = p_campaign_id and status = 'ATIVA' and valid_to is null
    for update
  loop
    update public.bonus_rules
      set valid_to = now(), status = p_status, closed_by = auth.uid(), reason = coalesce(p_reason, 'Campanha encerrada')
      where id = v_rule.id;

    insert into public.goal_bonus_audit_events (
      company_id, store_id, entity_type, entity_id, action, previous_data, new_data,
      subject_scope_type, subject_role, subject_user_id, reason, changed_by
    ) values (
      v_rule.company_id, v_rule.store_id, 'BONUS_RULE', v_rule.id, v_audit_action,
      to_jsonb(v_rule), '{}'::jsonb,
      v_rule.eligible_scope_type, v_rule.eligible_role, v_rule.eligible_user_id,
      coalesce(p_reason, 'Campanha encerrada'), auth.uid()
    );
  end loop;

  return v_campaign;
end;
$$;

comment on function public.close_bonus_campaign(uuid, text, text) is
  'Encerra/cancela campanha em cascata com suas regras ativas -- correção pós-auditoria adiciona checagem explícita de acesso corporativo (P1-3) quando a campanha é store_id NULL, além do que já era garantido por RLS.';
