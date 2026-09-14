-- ============================================================
-- Bonificação -- decisão de negócio aprovada pelo usuário em
-- 2026-09-14: técnico SEM amostra válida de NPS no período não pode
-- ser penalizado com 0% automaticamente (achado documentado, não
-- corrigido, na entrega anterior -- ver migration
-- 20260914010000_bonus_engine_reconciliation.sql). Antes desta
-- migration, calculate_bonus_result sempre calculava v_nps_pct=0
-- quando v_responded=0 (nenhum nps_cases.nps_score respondido no
-- período), e compute_bonus_breakdown tratava esse 0% como "atingiu
-- 0% do critério NPS" -- indistinguível de "atendeu mal e recebeu
-- nota baixa de verdade".
--
-- Decisão aprovada: classificar como N/A -- SEM AMOSTRA (nunca 0%) e
-- redistribuir os 30% (ou o peso configurado do critério, o que for)
-- PROPORCIONALMENTE entre os demais critérios elegíveis do MESMO
-- cálculo, preservando o potencial total de 100%. Técnico COM amostra
-- válida continua seguindo a regra de NPS exatamente como já
-- funcionava (nada muda pra ele).
--
-- compute_bonus_breakdown continua sendo a ÚNICA fórmula de dinheiro
-- (nunca duplicada no frontend) -- ganha um 4º parâmetro
-- (p_no_sample_codes, default '[]'::jsonb) com DEFAULT, então todo
-- call site que já chamava com 3 argumentos (simulate_bonus) continua
-- funcionando sem nenhuma mudança de comportamento; só
-- calculate_bonus_result passa a informar quando NPS não teve
-- amostra. DROP + CREATE (não só CREATE OR REPLACE) porque adicionar
-- um parâmetro muda a assinatura -- sem o DROP ficariam duas funções
-- sobrepostas (3 args antiga + 4 args nova) em vez de uma só.
-- ============================================================

drop function if exists public.compute_bonus_breakdown(uuid, numeric, jsonb);

create or replace function public.compute_bonus_breakdown(
  p_program_id uuid,
  p_avg_daily_os numeric,
  p_achieved_percents jsonb, -- {"TEMPO_EFICIENCIA": 80, "QUALIDADE_REINCIDENCIA": 100, "FG_RECEITA": 62.5, "NPS": 100}
  p_no_sample_codes jsonb default '[]'::jsonb -- ex.: '["NPS"]' -- códigos sem amostra válida neste período; peso deles é redistribuído entre os demais critérios ativos, nunca contado como 0%
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
  v_no_sample_set text[];
  v_eligible_weight numeric;
  v_effective_weight numeric;
  v_status text;
begin
  select * into v_program from public.bonus_programs where id = p_program_id;
  if v_program.id is null then raise exception 'Programa não encontrado'; end if;

  v_potential := greatest(
    v_program.min_bonus,
    least(v_program.max_bonus, (p_avg_daily_os - v_program.base_daily_os) * v_program.value_per_point)
  );
  if v_potential < 0 then v_potential := 0; end if;

  select coalesce(array_agg(elem), array[]::text[]) into v_no_sample_set
    from jsonb_array_elements_text(coalesce(p_no_sample_codes, '[]'::jsonb)) as elem;

  -- Peso total dos critérios ativos QUE TÊM amostra -- é sobre este
  -- total que os pesos configurados são redistribuídos
  -- proporcionalmente (nunca sobre 100 direto, pra preservar a
  -- proporção relativa já definida pelo gestor entre os critérios
  -- restantes). Ex.: TEMPO 25 + QUALIDADE 25 + FG 20 = 70 elegíveis
  -- (NPS 30 sem amostra) -> TEMPO e QUALIDADE viram ~35,7% cada, FG
  -- ~28,6% -- mesma proporção 25:25:20 de antes, só somando 100 agora.
  select coalesce(sum(weight_percent), 0) into v_eligible_weight
    from public.bonus_criteria
    where program_id = p_program_id and active
      and not (code = any(v_no_sample_set));

  for v_c in
    select * from public.bonus_criteria where program_id = p_program_id and active order by order_index
  loop
    if v_c.code = any(v_no_sample_set) then
      v_status := 'SEM_AMOSTRA';
      v_effective_weight := 0;
      v_achieved := null;
      v_amount := 0;
    else
      v_status := 'OK';
      v_effective_weight := case when v_eligible_weight > 0 then (v_c.weight_percent / v_eligible_weight) * 100 else 0 end;
      v_achieved := coalesce((p_achieved_percents->>v_c.code)::numeric, 0);
      v_achieved := greatest(0, least(100, v_achieved));
      v_amount := v_potential * (v_effective_weight / 100.0) * (v_achieved / 100.0);
    end if;
    v_final := v_final + v_amount;
    v_criteria := v_criteria || jsonb_build_object(
      'code', v_c.code,
      'label', v_c.label,
      'weight_percent', v_c.weight_percent,
      'effective_weight_percent', round(v_effective_weight, 4),
      'status', v_status,
      'achieved_percent', v_achieved,
      'potential_share', round(v_potential * (v_effective_weight / 100.0), 2),
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
  'Fórmula única de dinheiro: bônus potencial (produtividade) dividido pelos pesos dos critérios ativos, multiplicado pelo percentual atingido de cada um. Usada pelo simulador (percentuais hipotéticos) e pelo cálculo real (percentuais vindos dos dados reais da OS/NPS) -- nunca duplicada em outro lugar, inclusive no frontend. p_no_sample_codes (2026-09-14): critério marcado aqui vira status=SEM_AMOSTRA (achieved_percent=null, nunca 0%) e seu peso é redistribuído proporcionalmente entre os demais critérios ativos do mesmo cálculo -- nunca penaliza o técnico por falta de dado.';
revoke execute on function public.compute_bonus_breakdown(uuid, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.compute_bonus_breakdown(uuid, numeric, jsonb, jsonb) to authenticated;

-- ---------- calculate_bonus_result: idêntica, só marca NPS sem amostra ----------
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
  v_no_sample_codes jsonb := '[]'::jsonb;
  v_breakdown jsonb;
  v_result public.bonus_results;
  v_c jsonb;
  v_existed boolean;
begin
  select * into v_program from public.bonus_programs where id = p_program_id;
  if v_program.id is null then raise exception 'Programa não encontrado'; end if;
  if not is_company_gestor(v_program.company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;

  select exists(
    select 1 from public.bonus_results
    where program_id = p_program_id and technician_id = p_technician_id
      and period_start = p_period_start and period_end = p_period_end
  ) into v_existed;

  v_days := (p_period_end - p_period_start) + 1;

  select count(*) into v_closed_count
  from public.service_orders so
  where so.technician_id = p_technician_id
    and so.company_id = v_program.company_id
    and (v_program.store_id is null or so.store_id = v_program.store_id)
    and so.status in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO')
    and so.closed_at::date between p_period_start and p_period_end;
  v_avg_daily_os := round(v_closed_count::numeric / v_days, 4);

  select count(*) into v_original_closed_count
  from public.service_orders so
  where so.technician_id = p_technician_id
    and so.company_id = v_program.company_id
    and (v_program.store_id is null or so.store_id = v_program.store_id)
    and so.status in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO')
    and so.order_type <> 'REINGRESSO'
    and so.closed_at::date between p_period_start and p_period_end;

  select avg(extract(day from (so.closed_at - so.opened_at))) into v_time_avg
  from public.service_orders so
  where so.technician_id = p_technician_id
    and so.company_id = v_program.company_id
    and (v_program.store_id is null or so.store_id = v_program.store_id)
    and so.status in ('FINALIZADA', 'ORCAMENTO RECUSADO ENCERRADO')
    and so.closed_at::date between p_period_start and p_period_end
    and coalesce(so.excluded_from_time_metric, false) = false;

  select count(*) into v_reincidence_pct
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
  -- Achado do usuário em 2026-09-14: v_responded=0 NÃO é "atingiu 0%
  -- de NPS" -- é ausência de amostra. v_nps_pct só é usado abaixo
  -- quando HÁ amostra (v_no_sample_codes decide o resto); mantido em
  -- 0 aqui só porque a variável precisa de algum valor numérico, nunca
  -- chega a compor v_percents/o cálculo de dinheiro quando sem amostra.
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
      if v_responded = 0 then
        v_no_sample_codes := v_no_sample_codes || to_jsonb('NPS'::text);
      elsif v_c->>'calc_method' = 'LINEAR_ATE_META' then
        v_percents := v_percents || jsonb_build_object('NPS', least(100, greatest(0, 100.0 * v_nps_pct / (v_c->>'target_value')::numeric)));
      else
        v_percents := v_percents || jsonb_build_object('NPS', coalesce(public.bonus_criteria_rule_percent((v_c->>'id')::uuid, v_nps_pct), 0));
      end if;
    end if;
  end loop;

  v_breakdown := public.compute_bonus_breakdown(p_program_id, v_avg_daily_os, v_percents, v_no_sample_codes);

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

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (
    auth.uid(), v_program.company_id,
    'BONIFICACAO', case when v_existed then 'RECALCULAR_PROVISORIO' else 'CALCULAR_RESULTADO' end,
    'bonus_results', v_result.id,
    jsonb_build_object('technician_id', p_technician_id, 'period_start', p_period_start, 'period_end', p_period_end, 'final_bonus', v_result.final_bonus, 'no_sample_codes', v_no_sample_codes)
  );

  return v_result;
end;
$$;
comment on function public.calculate_bonus_result is
  'Cálculo oficial de bonificação de um técnico num período, a partir de dados reais (service_orders/nps_cases). Grava snapshot PROVISORIO em bonus_results (upsert enquanto não FECHADO -- trigger bloqueia qualquer alteração depois de FECHADO). Gestor-only. Registra CALCULAR_RESULTADO/RECALCULAR_PROVISORIO em audit_log. NPS sem nenhuma resposta no período (v_responded=0) nunca conta como 0% -- marcado SEM_AMOSTRA e redistribuído (ver compute_bonus_breakdown), decisão de negócio de 2026-09-14.';
revoke execute on function public.calculate_bonus_result(uuid, uuid, date, date) from public, anon;
grant execute on function public.calculate_bonus_result(uuid, uuid, date, date) to authenticated;
