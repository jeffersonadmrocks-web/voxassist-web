-- ============================================================
-- Motor de Bonificação -- complemento ao simulador (Fase 2, UI).
--
-- simulate_bonus() (migration 20260912030000) já aceita percentuais
-- de atingimento prontos por critério -- útil pra testar a fórmula
-- em si, mas o simulador da interface (pedido do usuário: "informar
-- os indicadores do técnico") precisa aceitar os INDICADORES BRUTOS
-- (dias médios, % de reincidência, % de FG, nota NPS), exatamente
-- como o gestor pensa neles, e converter pra percentual usando a
-- MESMA lógica de calculate_bonus_result() -- nunca duplicar essa
-- conversão em JS no frontend (regra arquitetural: fórmula só existe
-- no banco).
-- ============================================================

create or replace function public.simulate_bonus_raw(
  p_program_id uuid,
  p_avg_daily_os numeric,
  p_tempo_dias numeric default null,
  p_reincidencia_pct numeric default null,
  p_fg_pct numeric default null,
  p_nps_score numeric default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_program record;
  v_c record;
  v_percents jsonb := '{}'::jsonb;
  v_value numeric;
  v_achieved numeric;
begin
  select * into v_program from public.bonus_programs where id = p_program_id and company_id = current_company_id();
  if v_program.id is null then raise exception 'Programa não encontrado'; end if;

  for v_c in select * from public.bonus_criteria where program_id = p_program_id and active loop
    v_value := case v_c.code
      when 'TEMPO_EFICIENCIA' then p_tempo_dias
      when 'QUALIDADE_REINCIDENCIA' then p_reincidencia_pct
      when 'FG_RECEITA' then p_fg_pct
      when 'NPS' then p_nps_score
    end;
    if v_value is null then
      continue; -- indicador não informado -- fica de fora (0%), simulador mostra só o potencial/split pra esse critério
    end if;
    if v_c.calc_method = 'LINEAR_ATE_META' then
      v_achieved := least(100, greatest(0, 100.0 * v_value / v_c.target_value));
    else
      v_achieved := coalesce(public.bonus_criteria_rule_percent(v_c.id, v_value), 0);
    end if;
    v_percents := v_percents || jsonb_build_object(v_c.code, v_achieved);
  end loop;

  return public.compute_bonus_breakdown(p_program_id, p_avg_daily_os, v_percents);
end;
$$;
comment on function public.simulate_bonus_raw is
  'Simulador com indicadores brutos (dias médios, % reincidência, % FG, nota NPS) -- converte pra percentual usando a mesma lógica de calculate_bonus_result(), nunca gravado. Indicador omitido (null) fica de fora do cálculo desse critério (mostra 0% conquistado, mas o potencial/peso continua visível).';
grant execute on function public.simulate_bonus_raw(uuid, numeric, numeric, numeric, numeric, numeric) to authenticated;
