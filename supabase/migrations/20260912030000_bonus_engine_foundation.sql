-- ============================================================
-- Motor de Bonificação dos Técnicos -- Fase 1 (fundação: schema, RLS,
-- RPCs, motor de cálculo).
--
-- Auditoria feita ANTES de criar qualquer tabela (pedido explícito do
-- usuário): não existe goal_targets/bonus_rules/bonus_campaigns/
-- goal_bonus_audit_events em produção hoje -- confirmado por
-- introspecção real do banco (supabase/schema.sql, gerado em
-- 2026-09-01, 59 tabelas, nenhuma delas) e pelos 30+ migrations
-- commitados depois disso. A única "fundação" que já existia foi
-- construída na branch remota feat/produtividade-metas-bonificacao,
-- mas ela tem histórico de git completamente desconectado do main
-- atual (raiz em 2026-08-18, sem ancestral comum -- o main foi
-- reconstruído do zero em 2026-09-07, provavelmente após o incidente
-- de 2026-08-18) e suas migrations NUNCA rodaram no banco real
-- (mesma introspecção de 2026-09-01 confirma). Não dá pra herdar
-- essa branch por merge -- portamos o DESENHO (versionamento sem
-- UPDATE retroativo, RLS, auditoria) pro schema atual, mas com
-- tabelas novas: o modelo antigo (bonus_rules = 1 indicador com
-- faixas próprias) não suporta o que a especificação nova pede (1
-- "bônus potencial" único, DIVIDIDO entre 4 critérios por peso e
-- atingimento) -- é uma camada a mais que o desenho antigo não tinha.
--
-- Reaproveitado do schema atual em vez de recriado: audit_log
-- (genérico, já usado por várias áreas -- não precisa de uma tabela
-- goal_bonus_audit_events própria), is_company_gestor()/
-- current_company_id()/current_company_role() (mesmas funções de RLS
-- de todo o resto do app), productivity: service_orders.status/
-- closed_at (motor único de encerramento, advance_service_order_status,
-- migration 20260903010000 -- nunca reimplementado aqui), NPS:
-- nps_cases.nps_score/technician_nps_score via external_appointments.
-- technician_id (fluxo Electrolux já maduro, migration
-- 20260902060000), Qualidade/Reincidência: order_types.REINGRESSO +
-- service_orders.previous_service_order_id (mesmo padrão já usado
-- pelo app pra vincular um atendimento de retorno ao anterior).
-- ============================================================

-- ---------- 2 campos novos em service_orders, aditivos ----------
-- Faltava um jeito de (a) excluir da métrica de Tempo/Eficiência um
-- atraso comprovadamente externo (cliente não retirou/autorizou a
-- tempo) e (b) classificar se um REINGRESSO é de fato atribuível ao
-- serviço anterior (nem todo retorno é culpa do reparo -- pode ser
-- defeito novo, mau uso etc.). Sem esses 2 flags não tem como aplicar
-- as regras exatas da especificação sem chutar. Ambos nullable,
-- default null = "não classificado ainda" -- não afeta nenhuma OS
-- existente, e a Fase 2 (interface) expõe os dois campos na tela da
-- OS pro atendente/gestor classificar quando for o caso.
alter table public.service_orders
  add column if not exists excluded_from_time_metric boolean,
  add column if not exists reincidence_attributable boolean;

comment on column public.service_orders.excluded_from_time_metric is
  'true = atraso comprovadamente externo (cliente não autorizou/retirou a tempo) -- esta OS não entra na média de dias do critério Tempo/Eficiência da Bonificação. Null/false = entra normalmente.';
comment on column public.service_orders.reincidence_attributable is
  'Só relevante quando order_type=REINGRESSO: true = reincidência atribuível ao serviço anterior (conta contra o critério Qualidade/Reincidência da Bonificação do técnico que fez o serviço original); false = causa não atribuível (defeito novo, mau uso etc); null = ainda não classificado (não conta nem a favor nem contra até ser classificado).';

-- ---------- bonus_programs (bônus potencial + vigência, versionado) ----------
create table if not exists public.bonus_programs (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  base_daily_os numeric not null default 4,
  ceiling_daily_os numeric not null default 8,
  value_per_point numeric not null default 750,
  min_bonus numeric not null default 0,
  max_bonus numeric not null default 3000,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  superseded_by uuid,
  status text not null default 'ATIVO',
  created_by uuid not null references public.profiles(id),
  closed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.bonus_programs add constraint bonus_programs_pkey primary key (id);
alter table public.bonus_programs add constraint bonus_programs_superseded_by_fkey foreign key (superseded_by) references public.bonus_programs(id);
alter table public.bonus_programs add constraint bonus_programs_status_check check (status in ('ATIVO','ENCERRADO','CANCELADO'));
alter table public.bonus_programs add constraint bonus_programs_period_check check (period_end >= period_start);
alter table public.bonus_programs add constraint bonus_programs_ceiling_check check (ceiling_daily_os > base_daily_os);
alter table public.bonus_programs add constraint bonus_programs_value_per_point_check check (value_per_point > 0);
alter table public.bonus_programs add constraint bonus_programs_bonus_range_check check (max_bonus >= min_bonus and min_bonus >= 0);
create unique index if not exists bonus_programs_active_unique
  on public.bonus_programs (company_id, coalesce(store_id::text, ''))
  where (status = 'ATIVO' and valid_to is null);
create index if not exists idx_bonus_programs_lookup on public.bonus_programs (company_id, store_id, status);

comment on table public.bonus_programs is
  'Programa de bonificação (parâmetros do bônus potencial: base/teto de produtividade, valor por ponto, mínimo/máximo) por empresa (store_id null = empresa toda). Versionado: nunca UPDATE de linha em uso -- editar cria uma linha nova (valid_from) e encerra a anterior (valid_to/superseded_by), sempre via set_bonus_program(). Resultados antigos (bonus_results) sempre apontam pro program_id usado no cálculo -- reprodutíveis mesmo depois de mudar a regra.';

-- ---------- bonus_criteria (os 4 critérios, filhos de uma versão de programa) ----------
create table if not exists public.bonus_criteria (
  id uuid not null default gen_random_uuid(),
  program_id uuid not null references public.bonus_programs(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  calc_method text not null,
  target_value numeric,
  weight_percent numeric not null,
  active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.bonus_criteria add constraint bonus_criteria_pkey primary key (id);
alter table public.bonus_criteria add constraint bonus_criteria_code_check check (code in ('TEMPO_EFICIENCIA','QUALIDADE_REINCIDENCIA','FG_RECEITA','NPS'));
alter table public.bonus_criteria add constraint bonus_criteria_calc_method_check check (calc_method in ('FAIXAS','LINEAR_ATE_META'));
alter table public.bonus_criteria add constraint bonus_criteria_target_value_check check (calc_method <> 'LINEAR_ATE_META' or target_value > 0);
-- Metodologia fixa por critério (pedido explícito do usuário: "manter
-- a metodologia de tempo já aprovada" pra Tempo/Qualidade -- faixas
-- discretas; FG/NPS são proporcionais até uma meta). Só peso/faixas/
-- meta são configuráveis -- a FORMA da fórmula de cada critério, não.
-- calculate_bonus_result() só sabe interpretar essa combinação.
alter table public.bonus_criteria add constraint bonus_criteria_code_method_check check (
  (code in ('TEMPO_EFICIENCIA','QUALIDADE_REINCIDENCIA') and calc_method = 'FAIXAS')
  or (code in ('FG_RECEITA','NPS') and calc_method = 'LINEAR_ATE_META')
);
alter table public.bonus_criteria add constraint bonus_criteria_weight_check check (weight_percent >= 0 and weight_percent <= 100);
alter table public.bonus_criteria add constraint bonus_criteria_program_code_unique unique (program_id, code);
create index if not exists idx_bonus_criteria_program on public.bonus_criteria (program_id);

comment on table public.bonus_criteria is
  'Um dos 4 critérios (código fixo, mas peso/meta/faixas configuráveis) de uma versão de bonus_programs. calc_method decide a fórmula: FAIXAS (tabela de faixas em bonus_criteria_rules, ex. Tempo/Qualidade) ou LINEAR_ATE_META (proporcional de 0 até target_value=100%, ex. FG/NPS). Filho de uma versão de programa -- nunca editado depois de criado, só substituído junto com uma nova versão via set_bonus_program().';

-- ---------- bonus_criteria_rules (faixas de cada critério, quando calc_method=FAIXAS) ----------
create table if not exists public.bonus_criteria_rules (
  id uuid not null default gen_random_uuid(),
  criteria_id uuid not null references public.bonus_criteria(id) on delete cascade,
  min_value numeric,
  max_value numeric,
  percent numeric not null,
  description text,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.bonus_criteria_rules add constraint bonus_criteria_rules_pkey primary key (id);
alter table public.bonus_criteria_rules add constraint bonus_criteria_rules_percent_check check (percent >= 0 and percent <= 100);
alter table public.bonus_criteria_rules add constraint bonus_criteria_rules_bounds_check check (min_value is not null or max_value is not null);
create index if not exists idx_bonus_criteria_rules_criteria on public.bonus_criteria_rules (criteria_id, order_index);

comment on table public.bonus_criteria_rules is
  'Faixa de atingimento de um critério com calc_method=FAIXAS (ex. Tempo/Eficiência: até 1 dia=100%, até 3=80%...). min_value/max_value null = aberto (sem piso/teto). Não usada por critérios LINEAR_ATE_META (FG/NPS) -- esses usam bonus_criteria.target_value.';

-- ---------- valida soma de pesos = 100% por versão de programa ----------
-- Constraint trigger DEFERRED: valida só no COMMIT da transação, não a
-- cada INSERT individual -- set_bonus_program() insere os 4 critérios
-- um de cada vez na mesma transação, a soma só fecha depois do
-- último. Enforçado no banco (não só na RPC) -- qualquer caminho de
-- escrita futuro tem que respeitar o mesmo invariante.
create or replace function public.check_bonus_criteria_weight_sum()
returns trigger
language plpgsql
as $$
declare
  v_program_id uuid;
  v_sum numeric;
begin
  v_program_id := coalesce(new.program_id, old.program_id);
  select coalesce(sum(weight_percent), 0) into v_sum
  from public.bonus_criteria
  where program_id = v_program_id and active;
  if v_sum <> 0 and v_sum <> 100 then
    raise exception 'bonus_criteria: soma dos pesos dos critérios ativos deve ser 100%% (está em %)', v_sum;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_bonus_criteria_weight_sum on public.bonus_criteria;
create constraint trigger trg_bonus_criteria_weight_sum
  after insert or update or delete on public.bonus_criteria
  deferrable initially deferred
  for each row execute function public.check_bonus_criteria_weight_sum();

-- ---------- bonus_results (snapshot append-only, imutável quando FECHADO) ----------
create table if not exists public.bonus_results (
  id uuid not null default gen_random_uuid(),
  program_id uuid not null references public.bonus_programs(id),
  company_id uuid not null references public.companies(id),
  store_id uuid references public.stores(id),
  technician_id uuid not null references public.profiles(id),
  period_start date not null,
  period_end date not null,
  avg_daily_closed_os numeric not null,
  potential_bonus numeric not null,
  criteria_results jsonb not null,
  final_bonus numeric not null,
  status text not null default 'PROVISORIO',
  calculated_by uuid references public.profiles(id),
  calculated_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  reason text
);
alter table public.bonus_results add constraint bonus_results_pkey primary key (id);
alter table public.bonus_results add constraint bonus_results_status_check check (status in ('PROVISORIO','FECHADO'));
alter table public.bonus_results add constraint bonus_results_period_check check (period_end >= period_start);
alter table public.bonus_results add constraint bonus_results_unique unique (program_id, technician_id, period_start, period_end);
create index if not exists idx_bonus_results_technician on public.bonus_results (technician_id, period_start desc);
create index if not exists idx_bonus_results_company on public.bonus_results (company_id, store_id, period_start desc);

comment on table public.bonus_results is
  'Snapshot detalhado do cálculo de bonificação de um técnico num período, usando uma versão específica (program_id) das regras -- sempre reproduzível, mesmo que o programa mude depois. criteria_results guarda, por critério: código, peso, valor bruto do indicador, percentual atingido, valor conquistado. status=FECHADO trava a linha (trigger abaixo) -- "folha fechada" nunca é sobrescrita silenciosamente; recalcular gera outra linha só se o período ainda não tiver sido fechado.';

create or replace function public.block_closed_bonus_result_change()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'FECHADO' then
    raise exception 'bonus_results: linha já FECHADA (folha fechada) não pode ser alterada nem excluída.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_block_closed_bonus_result_update on public.bonus_results;
create trigger trg_block_closed_bonus_result_update
  before update or delete on public.bonus_results
  for each row execute function public.block_closed_bonus_result_change();

-- ---------- RLS ----------
alter table public.bonus_programs enable row level security;
create policy "bonus_programs_select" on public.bonus_programs for select to authenticated
  using (company_id = current_company_id());
create policy "bonus_programs_write_gestor" on public.bonus_programs for all to authenticated
  using (company_id = current_company_id() and is_company_gestor(company_id))
  with check (company_id = current_company_id() and is_company_gestor(company_id));

alter table public.bonus_criteria enable row level security;
create policy "bonus_criteria_select" on public.bonus_criteria for select to authenticated
  using (exists (select 1 from public.bonus_programs p where p.id = bonus_criteria.program_id and p.company_id = current_company_id()));
create policy "bonus_criteria_write_gestor" on public.bonus_criteria for all to authenticated
  using (exists (select 1 from public.bonus_programs p where p.id = bonus_criteria.program_id and p.company_id = current_company_id() and is_company_gestor(p.company_id)))
  with check (exists (select 1 from public.bonus_programs p where p.id = bonus_criteria.program_id and p.company_id = current_company_id() and is_company_gestor(p.company_id)));

alter table public.bonus_criteria_rules enable row level security;
create policy "bonus_criteria_rules_select" on public.bonus_criteria_rules for select to authenticated
  using (exists (
    select 1 from public.bonus_criteria c join public.bonus_programs p on p.id = c.program_id
    where c.id = bonus_criteria_rules.criteria_id and p.company_id = current_company_id()
  ));
create policy "bonus_criteria_rules_write_gestor" on public.bonus_criteria_rules for all to authenticated
  using (exists (
    select 1 from public.bonus_criteria c join public.bonus_programs p on p.id = c.program_id
    where c.id = bonus_criteria_rules.criteria_id and p.company_id = current_company_id() and is_company_gestor(p.company_id)
  ))
  with check (exists (
    select 1 from public.bonus_criteria c join public.bonus_programs p on p.id = c.program_id
    where c.id = bonus_criteria_rules.criteria_id and p.company_id = current_company_id() and is_company_gestor(p.company_id)
  ));

-- bonus_results: gestor vê tudo da empresa; técnico só os próprios.
-- Sem policy de insert/update/delete pra authenticated -- só é escrito
-- pelas RPCs abaixo (security definer), nunca digitado à mão.
alter table public.bonus_results enable row level security;
create policy "bonus_results_select" on public.bonus_results for select to authenticated
  using (company_id = current_company_id() and (is_company_gestor(company_id) or technician_id = auth.uid()));

-- ============================================================
-- RPCs
-- ============================================================

-- Cria uma NOVA VERSÃO completa do programa (parâmetros + critérios +
-- faixas) numa transação só, encerrando a versão ativa anterior
-- (mesma empresa/loja). p_criteria: jsonb array de
-- {code,label,description,calc_method,target_value,weight_percent,
-- rules:[{min_value,max_value,percent,description}]}.
create or replace function public.set_bonus_program(
  p_company_id uuid,
  p_store_id uuid,
  p_name text,
  p_period_start date,
  p_period_end date,
  p_base_daily_os numeric,
  p_ceiling_daily_os numeric,
  p_value_per_point numeric,
  p_min_bonus numeric,
  p_max_bonus numeric,
  p_criteria jsonb,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_program_id uuid;
  v_previous_id uuid;
  v_criterion jsonb;
  v_rule jsonb;
  v_criteria_id uuid;
begin
  if not is_company_gestor(p_company_id) then
    raise exception 'Acesso permitido somente ao gestor da empresa';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Informe o nome do programa';
  end if;
  if jsonb_typeof(p_criteria) <> 'array' or jsonb_array_length(p_criteria) = 0 then
    raise exception 'Informe ao menos um critério';
  end if;

  select id into v_previous_id
  from public.bonus_programs
  where company_id = p_company_id and coalesce(store_id::text, '') = coalesce(p_store_id::text, '')
    and status = 'ATIVO' and valid_to is null;

  -- Encerra a versão anterior ANTES de inserir a nova -- o índice
  -- único parcial (bonus_programs_active_unique) só permite 1 linha
  -- ATIVA/valid_to nula por empresa+loja ao mesmo tempo; inserir a
  -- nova antes de tirar a antiga desse estado bateria na constraint.
  if v_previous_id is not null then
    update public.bonus_programs
      set status = 'ENCERRADO', valid_to = now(), closed_by = auth.uid(), reason = coalesce(p_reason, 'Substituído por nova versão')
      where id = v_previous_id;
  end if;

  insert into public.bonus_programs (
    company_id, store_id, name, period_start, period_end,
    base_daily_os, ceiling_daily_os, value_per_point, min_bonus, max_bonus,
    created_by
  ) values (
    p_company_id, p_store_id, trim(p_name), p_period_start, p_period_end,
    p_base_daily_os, p_ceiling_daily_os, p_value_per_point, p_min_bonus, p_max_bonus,
    auth.uid()
  ) returning id into v_program_id;

  for v_criterion in select * from jsonb_array_elements(p_criteria) loop
    insert into public.bonus_criteria (
      program_id, code, label, description, calc_method, target_value, weight_percent, active, order_index
    ) values (
      v_program_id,
      v_criterion->>'code',
      v_criterion->>'label',
      v_criterion->>'description',
      v_criterion->>'calc_method',
      nullif(v_criterion->>'target_value', '')::numeric,
      (v_criterion->>'weight_percent')::numeric,
      coalesce((v_criterion->>'active')::boolean, true),
      coalesce((v_criterion->>'order_index')::int, 0)
    ) returning id into v_criteria_id;

    if v_criterion ? 'rules' and jsonb_typeof(v_criterion->'rules') = 'array' then
      for v_rule in select * from jsonb_array_elements(v_criterion->'rules') loop
        insert into public.bonus_criteria_rules (
          criteria_id, min_value, max_value, percent, description, order_index
        ) values (
          v_criteria_id,
          nullif(v_rule->>'min_value', '')::numeric,
          nullif(v_rule->>'max_value', '')::numeric,
          (v_rule->>'percent')::numeric,
          v_rule->>'description',
          coalesce((v_rule->>'order_index')::int, 0)
        );
      end loop;
    end if;
  end loop;

  if v_previous_id is not null then
    update public.bonus_programs set superseded_by = v_program_id where id = v_previous_id;
  end if;

  return v_program_id;
end;
$$;
comment on function public.set_bonus_program is
  'Cria uma nova versão do programa de bonificação (parâmetros do bônus potencial + os 4 critérios + faixas), numa transação só, encerrando a versão ativa anterior. Nunca UPDATE de uma versão em uso -- toda alteração é uma versão nova, preservando reprodutibilidade de bonus_results antigos. Gestor-only.';
grant execute on function public.set_bonus_program(uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, jsonb, text) to authenticated;

create or replace function public.close_bonus_program(p_program_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.bonus_programs where id = p_program_id;
  if v_company_id is null then raise exception 'Programa não encontrado'; end if;
  if not is_company_gestor(v_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  update public.bonus_programs
    set status = 'CANCELADO', valid_to = now(), closed_by = auth.uid(), reason = p_reason
    where id = p_program_id and valid_to is null;
end;
$$;
comment on function public.close_bonus_program is 'Descontinua um programa de bonificação sem substituir por uma nova versão. Gestor-only.';
grant execute on function public.close_bonus_program(uuid, text) to authenticated;

-- Motor de cálculo compartilhado: bônus potencial + split por peso +
-- valor conquistado por critério, a partir de percentuais de
-- atingimento JÁ CALCULADOS (0-100) por critério. Único lugar que
-- transforma "atingimento" em dinheiro -- usado tanto pelo simulador
-- quanto pelo cálculo real, pra nunca ter fórmula divergente entre
-- telas (regra arquitetural pedida pelo usuário).
create or replace function public.compute_bonus_breakdown(
  p_program_id uuid,
  p_avg_daily_os numeric,
  p_achieved_percents jsonb -- {"TEMPO_EFICIENCIA": 80, "QUALIDADE_REINCIDENCIA": 100, "FG_RECEITA": 62.5, "NPS": 100}
) returns jsonb
language plpgsql
stable
as $$
declare
  v_program record;
  v_potential numeric;
  v_criteria jsonb := '[]'::jsonb;
  v_final numeric := 0;
  v_c record;
  v_achieved numeric;
  v_amount numeric;
begin
  select * into v_program from public.bonus_programs where id = p_program_id;
  if v_program.id is null then raise exception 'Programa não encontrado'; end if;

  v_potential := greatest(
    v_program.min_bonus,
    least(v_program.max_bonus, (p_avg_daily_os - v_program.base_daily_os) * v_program.value_per_point)
  );
  if v_potential < 0 then v_potential := 0; end if;

  for v_c in
    select * from public.bonus_criteria where program_id = p_program_id and active order by order_index
  loop
    v_achieved := coalesce((p_achieved_percents->>v_c.code)::numeric, 0);
    v_achieved := greatest(0, least(100, v_achieved));
    v_amount := v_potential * (v_c.weight_percent / 100.0) * (v_achieved / 100.0);
    v_final := v_final + v_amount;
    v_criteria := v_criteria || jsonb_build_object(
      'code', v_c.code,
      'label', v_c.label,
      'weight_percent', v_c.weight_percent,
      'achieved_percent', v_achieved,
      'potential_share', round(v_potential * (v_c.weight_percent / 100.0), 2),
      'amount', round(v_amount, 2)
    );
  end loop;

  return jsonb_build_object(
    'program_id', p_program_id,
    'avg_daily_os', p_avg_daily_os,
    'potential_bonus', round(v_potential, 2),
    'criteria', v_criteria,
    'final_bonus', round(v_final, 2)
  );
end;
$$;
comment on function public.compute_bonus_breakdown is
  'Fórmula única de dinheiro: bônus potencial (produtividade) dividido pelos pesos dos critérios ativos, multiplicado pelo percentual atingido de cada um. Usada pelo simulador (percentuais hipotéticos) e pelo cálculo real (percentuais vindos dos dados reais da OS/NPS) -- nunca duplicada em outro lugar, inclusive no frontend.';

-- Simulador: só calcula, nunca grava. p_achieved_percents é opcional
-- (se omitido, mostra só o potencial + o quanto cada critério
-- REPRESENTA do potencial, sem "conquistado" -- primeira metade da
-- tela do simulador).
create or replace function public.simulate_bonus(p_program_id uuid, p_avg_daily_os numeric, p_achieved_percents jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.compute_bonus_breakdown(p_program_id, p_avg_daily_os, p_achieved_percents)
  where exists (
    select 1 from public.bonus_programs p where p.id = p_program_id and p.company_id = current_company_id()
  );
$$;
comment on function public.simulate_bonus is 'Simulador -- calcula sem gravar nada. Qualquer usuário autenticado da empresa pode simular (não expõe dado de ninguém, só a regra).';
grant execute on function public.simulate_bonus(uuid, numeric, jsonb) to authenticated;

-- Lookup de faixa (critérios calc_method=FAIXAS).
-- Faixa "até X" (ex.: Tempo/Eficiência: até 1 dia=100%, até 3=80%...):
-- intervalo (min_value, max_value] -- min EXCLUSIVE, max INCLUSIVE --
-- pra não ter ambiguidade exatamente na fronteira (ex.: raw=1 cai só
-- na faixa "até 1", nunca também na próxima "de 1 até 3").
create or replace function public.bonus_criteria_rule_percent(p_criteria_id uuid, p_raw_value numeric)
returns numeric
language sql
stable
as $$
  select r.percent
  from public.bonus_criteria_rules r
  where r.criteria_id = p_criteria_id
    and (r.min_value is null or p_raw_value > r.min_value)
    and (r.max_value is null or p_raw_value <= r.max_value)
  order by coalesce(r.min_value, -1e18) desc
  limit 1;
$$;

-- Cálculo REAL a partir dos dados da OS/NPS -- único lugar que lê
-- service_orders/nps_cases pra bonificação (nenhuma tela lê essas
-- tabelas direto pra calcular bônus). Grava um snapshot PROVISORIO em
-- bonus_results (idempotente enquanto não FECHADO -- upsert).
create or replace function public.calculate_bonus_result(
  p_program_id uuid,
  p_technician_id uuid,
  p_period_start date,
  p_period_end date
) returns public.bonus_results
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_program record;
  v_days integer;
  v_closed_count integer;
  v_original_closed_count integer;
  v_avg_daily_os numeric;
  v_fg_count integer;
  v_eligible_count integer;
  v_time_avg numeric;
  v_reincidence_pct numeric;
  v_fg_pct numeric;
  v_nps_pct numeric;
  v_promoters integer;
  v_detractors integer;
  v_responded integer;
  v_percents jsonb;
  v_breakdown jsonb;
  v_result public.bonus_results;
  v_c jsonb;
begin
  select * into v_program from public.bonus_programs where id = p_program_id;
  if v_program.id is null then raise exception 'Programa não encontrado'; end if;
  if not is_company_gestor(v_program.company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;

  v_days := (p_period_end - p_period_start) + 1;

  -- Produtividade: só OS efetivamente encerradas no VoxAssist
  -- (mesmos status terminais de advance_service_order_status,
  -- migration 20260903010000 -- nunca reimplementa a régua de
  -- "o que é fechamento" aqui).
  select count(*) into v_closed_count
  from public.service_orders so
  where so.technician_id = p_technician_id
    and so.company_id = v_program.company_id
    and (v_program.store_id is null or so.store_id = v_program.store_id)
    and so.status in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO')
    and so.closed_at::date between p_period_start and p_period_end;
  v_avg_daily_os := round(v_closed_count::numeric / v_days, 4);

  -- Base pro critério de Qualidade/Reincidência: OS ORIGINAIS
  -- encerradas (exclui REINGRESSO -- a própria visita de retorno não
  -- pode se somar ao denominador da taxa que ela mesma alimenta; isso
  -- diluiria a taxa e premiaria perversamente quem tem mais retorno).
  select count(*) into v_original_closed_count
  from public.service_orders so
  where so.technician_id = p_technician_id
    and so.company_id = v_program.company_id
    and (v_program.store_id is null or so.store_id = v_program.store_id)
    and so.status in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO')
    and so.order_type <> 'REINGRESSO'
    and so.closed_at::date between p_period_start and p_period_end;

  -- Tempo/Eficiência: média de dias entre abertura e encerramento,
  -- excluindo OS marcada como atraso externo comprovado.
  select avg(extract(day from (so.closed_at - so.opened_at))) into v_time_avg
  from public.service_orders so
  where so.technician_id = p_technician_id
    and so.company_id = v_program.company_id
    and (v_program.store_id is null or so.store_id = v_program.store_id)
    and so.status in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO')
    and so.closed_at::date between p_period_start and p_period_end
    and coalesce(so.excluded_from_time_metric, false) = false;

  -- Qualidade/Reincidência: % das OS encerradas do técnico que
  -- geraram um REINGRESSO atribuível em até 90 dias.
  select count(*) into v_reincidence_pct -- reaproveita a variável como contador antes de virar %
  from public.service_orders reingresso
  join public.service_orders original on original.id = reingresso.previous_service_order_id
  where original.technician_id = p_technician_id
    and original.company_id = v_program.company_id
    and (v_program.store_id is null or original.store_id = v_program.store_id)
    and original.status in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO')
    and original.closed_at::date between p_period_start and p_period_end
    and reingresso.order_type = 'REINGRESSO'
    and reingresso.reincidence_attributable = true
    and reingresso.opened_at <= original.closed_at + interval '90 days';
  if v_original_closed_count > 0 then
    v_reincidence_pct := round(100.0 * v_reincidence_pct / v_original_closed_count, 2);
  else
    v_reincidence_pct := 0;
  end if;

  -- FG: OS Fora de Garantia encerradas / atendimentos elegíveis.
  -- Elegível = OS original (exclui REINGRESSO, mesmo motivo do
  -- critério de Qualidade -- uma visita de retorno não é uma nova
  -- oportunidade de FG) e exclui GARANTIA pura (garantia de fábrica
  -- não é uma oportunidade de FG).
  select
    count(*) filter (where so.order_type = 'FORA DE GARANTIA'),
    count(*) filter (where so.order_type not in ('GARANTIA', 'REINGRESSO'))
  into v_fg_count, v_eligible_count
  from public.service_orders so
  where so.technician_id = p_technician_id
    and so.company_id = v_program.company_id
    and (v_program.store_id is null or so.store_id = v_program.store_id)
    and so.status in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO')
    and so.closed_at::date between p_period_start and p_period_end;
  v_fg_pct := case when v_eligible_count > 0 then round(100.0 * v_fg_count / v_eligible_count, 2) else 0 end;

  -- NPS: promotores (9-10) - detratores (0-6), sobre o total
  -- respondido (7-8 neutro fica só no total; sem resposta não entra).
  select
    count(*) filter (where nc.nps_score >= 9),
    count(*) filter (where nc.nps_score <= 6),
    count(*) filter (where nc.nps_score is not null)
  into v_promoters, v_detractors, v_responded
  from public.nps_cases nc
  join public.external_appointments ea on ea.id = nc.external_appointment_id
  where ea.technician_id = p_technician_id
    and ea.company_id = v_program.company_id
    and nc.concluded_at::date between p_period_start and p_period_end;
  v_nps_pct := case when v_responded > 0 then greatest(0, 100.0 * (v_promoters - v_detractors) / v_responded) else 0 end;

  v_percents := '{}'::jsonb;
  for v_c in select * from jsonb_array_elements((
    select coalesce(jsonb_agg(jsonb_build_object('code', code, 'calc_method', calc_method, 'target_value', target_value, 'id', id)), '[]'::jsonb)
    from public.bonus_criteria where program_id = p_program_id and active
  )) loop
    if v_c->>'code' = 'TEMPO_EFICIENCIA' then
      v_percents := v_percents || jsonb_build_object('TEMPO_EFICIENCIA', coalesce(public.bonus_criteria_rule_percent((v_c->>'id')::uuid, coalesce(v_time_avg, 0)), 0));
    elsif v_c->>'code' = 'QUALIDADE_REINCIDENCIA' then
      v_percents := v_percents || jsonb_build_object('QUALIDADE_REINCIDENCIA', coalesce(public.bonus_criteria_rule_percent((v_c->>'id')::uuid, v_reincidence_pct), 0));
    elsif v_c->>'code' = 'FG_RECEITA' then
      if v_c->>'calc_method' = 'LINEAR_ATE_META' then
        v_percents := v_percents || jsonb_build_object('FG_RECEITA', least(100, greatest(0, 100.0 * v_fg_pct / (v_c->>'target_value')::numeric)));
      else
        v_percents := v_percents || jsonb_build_object('FG_RECEITA', coalesce(public.bonus_criteria_rule_percent((v_c->>'id')::uuid, v_fg_pct), 0));
      end if;
    elsif v_c->>'code' = 'NPS' then
      if v_c->>'calc_method' = 'LINEAR_ATE_META' then
        v_percents := v_percents || jsonb_build_object('NPS', least(100, greatest(0, 100.0 * v_nps_pct / (v_c->>'target_value')::numeric)));
      else
        v_percents := v_percents || jsonb_build_object('NPS', coalesce(public.bonus_criteria_rule_percent((v_c->>'id')::uuid, v_nps_pct), 0));
      end if;
    end if;
  end loop;

  v_breakdown := public.compute_bonus_breakdown(p_program_id, v_avg_daily_os, v_percents);

  insert into public.bonus_results (
    program_id, company_id, store_id, technician_id, period_start, period_end,
    avg_daily_closed_os, potential_bonus, criteria_results, final_bonus, calculated_by
  ) values (
    p_program_id, v_program.company_id, v_program.store_id, p_technician_id, p_period_start, p_period_end,
    v_avg_daily_os, (v_breakdown->>'potential_bonus')::numeric, v_breakdown->'criteria', (v_breakdown->>'final_bonus')::numeric, auth.uid()
  )
  on conflict (program_id, technician_id, period_start, period_end) do update set
    avg_daily_closed_os = excluded.avg_daily_closed_os,
    potential_bonus = excluded.potential_bonus,
    criteria_results = excluded.criteria_results,
    final_bonus = excluded.final_bonus,
    calculated_by = excluded.calculated_by,
    calculated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;
comment on function public.calculate_bonus_result is
  'Cálculo oficial de bonificação de um técnico num período, a partir de dados reais (service_orders/nps_cases). Grava snapshot PROVISORIO em bonus_results (upsert enquanto não FECHADO -- trigger bloqueia qualquer alteração depois de FECHADO). Gestor-only.';
grant execute on function public.calculate_bonus_result(uuid, uuid, date, date) to authenticated;

create or replace function public.close_bonus_result(p_result_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.bonus_results where id = p_result_id;
  if v_company_id is null then raise exception 'Resultado não encontrado'; end if;
  if not is_company_gestor(v_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  update public.bonus_results
    set status = 'FECHADO', closed_by = auth.uid(), closed_at = now(), reason = p_reason
    where id = p_result_id and status = 'PROVISORIO';
end;
$$;
comment on function public.close_bonus_result is
  'Fecha a folha de bonificação de um resultado (PROVISORIO -> FECHADO) -- a partir daí a linha é imutável (trigger trg_block_closed_bonus_result_update). Gestor-only.';
grant execute on function public.close_bonus_result(uuid, text) to authenticated;
