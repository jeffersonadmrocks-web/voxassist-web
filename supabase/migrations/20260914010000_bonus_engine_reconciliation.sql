-- ============================================================
-- Motor de Bonificação -- reconciliação/conclusão (pacote único,
-- 2026-09-14).
--
-- Auditoria confirmou que a fundação (20260912030000/040000) NUNCA
-- chegou a ser aplicada no Supabase real (dgasmtvpgifceyqufcfg) --
-- bonus_programs/bonus_criteria/bonus_criteria_rules/bonus_results,
-- as 2 colunas em service_orders e as 7 RPCs não existem em produção
-- hoje. As duas migrations continuam corretas na FORMA (validado
-- linha a linha contra o schema real conhecido -- ver abaixo) e por
-- isso NÃO são reescritas: esta migration só ACRESCENTA o que faltava
-- pra fechar o pacote, sempre via CREATE OR REPLACE/idempotente,
-- nunca DROP.
--
-- Dependências reconciliadas contra supabase/schema.sql (retrato real
-- de 2026-09-01) + migrations commitadas depois:
--   companies/stores/profiles/service_orders: existem, colunas usadas
--     pela Fase 1 (technician_id, company_id, store_id, status,
--     order_type text, closed_at, opened_at, previous_service_order_id)
--     todas conferem;
--   current_company_id()/current_company_role()/is_company_gestor():
--     usadas em dezenas de RLS policies reais (schema.sql linha 981 em
--     diante) -- existem e funcionam em produção, mas o CORPO delas
--     nunca foi capturado em nenhuma migration versionada deste repo
--     (achado herdado de 2026-09-01, não introduzido aqui -- fora do
--     escopo deste pacote redefinir funções de RLS globais do app);
--   external_appointments.company_id/technician_id, nps_cases.
--     nps_score/concluded_at: existem (nps_score adicionado em
--     20260902060000, DEPOIS do retrato schema.sql de 09-01 -- a Fase 1
--     foi escrita depois e já assumiu corretamente essa coluna);
--   audit_log: existe, mesmo padrão (user_id,company_id,area,action,
--     entity_type,entity_id,old_data,new_data) já usado por dezenas de
--     outras áreas.
--
-- Achado NOVO desta reconciliação (gap real, não cosmético): nenhuma
-- das 7 RPCs de bonificação gravava em audit_log, apesar do comentário
-- original da Fase 1 já ter decidido reaproveitar audit_log em vez de
-- criar tabela própria -- a decisão foi tomada mas nunca implementada.
-- Corrigido abaixo (seção 14 do pacote: criação/nova versão/
-- encerramento de programa, cálculo, recálculo, fechamento).
--
-- Segunda correção: nenhuma das 7 funções tinha REVOKE EXECUTE FROM
-- PUBLIC explícito antes do GRANT TO authenticated -- no Postgres,
-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão. Nenhuma delas
-- fica utilizável por um usuário não autenticado de qualquer forma
-- (todas checam auth.uid()/is_company_gestor()/current_company_id()
-- no próprio corpo), mas o pacote pede explicitamente reforço na
-- superfície de GRANT, não só na lógica interna -- corrigido abaixo
-- pras 7 funções (redefinidas via CREATE OR REPLACE, comportamento
-- idêntico + REVOKE/GRANT reforçados).
-- ============================================================

-- ---------- 1) REVOKE explícito nas 7 funções já existentes ----------
-- (idempotente -- roda mesmo se a função ainda não existir na primeira
-- aplicação desta migration, porque 20260912030000/040000 rodam antes
-- na mesma leva de deploy)
revoke execute on function public.set_bonus_program(uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, jsonb, text) from public, anon;
revoke execute on function public.close_bonus_program(uuid, text) from public, anon;
revoke execute on function public.compute_bonus_breakdown(uuid, numeric, jsonb) from public, anon;
revoke execute on function public.simulate_bonus(uuid, numeric, jsonb) from public, anon;
revoke execute on function public.simulate_bonus_raw(uuid, numeric, numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function public.calculate_bonus_result(uuid, uuid, date, date) from public, anon;
revoke execute on function public.close_bonus_result(uuid, text) from public, anon;
-- compute_bonus_breakdown é chamada internamente por simulate_bonus/
-- simulate_bonus_raw/calculate_bonus_result (todas SECURITY DEFINER) --
-- authenticated continua podendo chamar direto (é só a fórmula, não
-- expõe dado de ninguém), mas sem isso ela ficaria só acessível via
-- PUBLIC residual, nunca revogado antes.
grant execute on function public.compute_bonus_breakdown(uuid, numeric, jsonb) to authenticated;

-- ---------- 2) audit_log nas 4 RPCs administrativas/de cálculo ----------
-- set_bonus_program: registra CRIACAO (1ª vez) ou NOVA_VERSAO
-- (quando encerra uma versão anterior), sempre depois de confirmado
-- que o novo program_id foi criado -- old_data/new_data carregam o
-- suficiente pra reconstruir o que mudou sem duplicar bonus_programs
-- inteiro no log.
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

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(), p_company_id, 'BONIFICACAO',
    case when v_previous_id is null then 'CRIAR_PROGRAMA' else 'NOVA_VERSAO' end,
    'bonus_programs', v_program_id,
    case when v_previous_id is not null then jsonb_build_object('previous_program_id', v_previous_id) else null end,
    jsonb_build_object('name', trim(p_name), 'period_start', p_period_start, 'period_end', p_period_end, 'store_id', p_store_id, 'reason', p_reason)
  );

  return v_program_id;
end;
$$;
comment on function public.set_bonus_program is
  'Cria uma nova versão do programa de bonificação (parâmetros do bônus potencial + os 4 critérios + faixas), numa transação só, encerrando a versão ativa anterior. Nunca UPDATE de uma versão em uso -- toda alteração é uma versão nova, preservando reprodutibilidade de bonus_results antigos. Gestor-only. Registra CRIAR_PROGRAMA/NOVA_VERSAO em audit_log.';
revoke execute on function public.set_bonus_program(uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, jsonb, text) from public, anon;
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

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'BONIFICACAO', 'ENCERRAR_PROGRAMA', 'bonus_programs', p_program_id, jsonb_build_object('reason', p_reason));
end;
$$;
comment on function public.close_bonus_program is 'Descontinua um programa de bonificação sem substituir por uma nova versão. Gestor-only. Registra ENCERRAR_PROGRAMA em audit_log.';
revoke execute on function public.close_bonus_program(uuid, text) from public, anon;
grant execute on function public.close_bonus_program(uuid, text) to authenticated;

-- calculate_bonus_result: idêntica à Fase 1 na lógica de cálculo (não
-- reescreve nenhuma regra de Tempo/Reincidência/FG/NPS -- auditoria não
-- encontrou contradição nelas), só acrescenta o audit_log no final,
-- diferenciando CALCULAR_RESULTADO (1ª vez) de RECALCULAR_PROVISORIO.
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

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (
    auth.uid(), v_program.company_id,
    'BONIFICACAO', case when v_existed then 'RECALCULAR_PROVISORIO' else 'CALCULAR_RESULTADO' end,
    'bonus_results', v_result.id,
    jsonb_build_object('technician_id', p_technician_id, 'period_start', p_period_start, 'period_end', p_period_end, 'final_bonus', v_result.final_bonus)
  );

  return v_result;
end;
$$;
comment on function public.calculate_bonus_result is
  'Cálculo oficial de bonificação de um técnico num período, a partir de dados reais (service_orders/nps_cases). Grava snapshot PROVISORIO em bonus_results (upsert enquanto não FECHADO -- trigger bloqueia qualquer alteração depois de FECHADO). Gestor-only. Registra CALCULAR_RESULTADO/RECALCULAR_PROVISORIO em audit_log.';
revoke execute on function public.calculate_bonus_result(uuid, uuid, date, date) from public, anon;
grant execute on function public.calculate_bonus_result(uuid, uuid, date, date) to authenticated;

create or replace function public.close_bonus_result(p_result_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company_id uuid; v_tech uuid;
begin
  select company_id, technician_id into v_company_id, v_tech from public.bonus_results where id = p_result_id;
  if v_company_id is null then raise exception 'Resultado não encontrado'; end if;
  if not is_company_gestor(v_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  update public.bonus_results
    set status = 'FECHADO', closed_by = auth.uid(), closed_at = now(), reason = p_reason
    where id = p_result_id and status = 'PROVISORIO';

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), v_company_id, 'BONIFICACAO', 'FECHAR_RESULTADO', 'bonus_results', p_result_id, jsonb_build_object('technician_id', v_tech, 'reason', p_reason));
end;
$$;
comment on function public.close_bonus_result is
  'Fecha a folha de bonificação de um resultado (PROVISORIO -> FECHADO) -- a partir daí a linha é imutável (trigger trg_block_closed_bonus_result_update). Gestor-only. Registra FECHAR_RESULTADO em audit_log.';
revoke execute on function public.close_bonus_result(uuid, text) from public, anon;
grant execute on function public.close_bonus_result(uuid, text) to authenticated;

-- ---------- 3) Achado NPS "sem amostra" -- documentado, NÃO decidido aqui ----------
-- external_appointments só existe pra origin='ELECTROLUX' (CHECK
-- constraint real, schema.sql). Ou seja: um técnico que não atende
-- Electrolux SEMPRE tem v_responded=0 no critério NPS, e a fórmula
-- atual (herdada, não alterada aqui) trata isso como v_nps_pct=0 --
-- 0% de atingimento nesse critério, igual a "NPS péssimo". O pedido
-- do usuário foi explícito: "se a regra antiga não definiu
-- corretamente 'sem amostra', PARAR esse ponto e relatar antes de
-- escolher arbitrariamente" -- por isso esta migration NÃO altera essa
-- fórmula. Fica registrado aqui para constar na migration também (além
-- do relatório final) que isso é uma decisão de negócio pendente, não
-- um bug corrigido silenciosamente.
