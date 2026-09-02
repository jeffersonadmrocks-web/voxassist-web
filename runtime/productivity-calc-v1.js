/* VoxAssist — Módulo de cálculo de Produtividade/Metas/Bonificação (Fase 6)
 * Fonte única do cálculo financeiro e de hierarquia de metas -- extraído de
 * runtime/dashboard-canonical-v1.js pra ser a MESMA fonte usada pelo
 * Dashboard e pela tela Produtividade/Metas (Fase 7), em vez de duas
 * implementações que hoje só concordam por coincidência.
 *
 * Sem dependência de DOM -- funções puras, testáveis fora do navegador
 * (o wrapper no fim expõe tanto window.vxProductivityCalc quanto
 * module.exports, pra poder rodar teste em Node sem jsdom).
 */
(function(root){
  'use strict';

  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();

  // ---------- financeiro: mesma fórmula real já usada no Dashboard ----------
  // "Orçado" de uma OS -- soma dos componentes de os_financial, nunca
  // negativo mesmo com desconto maior que o restante.
  function budget(f){
    return Math.max(0, Number(f?.labor_value||0)+Number(f?.freight_value||0)+Number(f?.auxiliary_material_value||0)+Number(f?.technical_report_value||0)-Number(f?.discount_value||0));
  }

  // "Recebido" real -- só pagamentos com paid_at preenchido e status fora
  // de cancelado/estornado. Cada linha de payments é um recebimento
  // distinto (parcial ou não) -- somar todas nunca duplica, porque
  // estorno/cancelamento já tira a linha da soma (não gera negativo à
  // parte pra compensar).
  function validPayments(payments){
    return (Array.isArray(payments)?payments:[]).filter(p=>p&&p.paid_at&&!['CANCELADO','CANCELADA','ESTORNADO','ESTORNADA'].includes(norm(p.status)));
  }

  function receivedSum(payments){
    return validPayments(payments).reduce((s,p)=>s+Number(p.amount||0),0);
  }

  // ---------- indicador: % de atingimento ----------
  // realizado/meta*100 -- nunca Infinity/NaN quando meta é 0/indefinida;
  // cai em null (chamador decide como exibir "Não configurado").
  function pct(realizado, meta){
    const m=Number(meta);
    if(!Number.isFinite(m)||m<=0)return null;
    const r=Number(realizado)||0;
    return Math.round((r/m)*10000)/100; // 2 casas decimais, sem drift de ponto flutuante
  }

  // ---------- hierarquia de metas: INDIVIDUAL > EQUIPE > LOJA ----------
  // Recebe as metas ATIVAS já filtradas (mesmo indicador/período/loja) que
  // se aplicam a uma pessoa -- no máximo 1 de cada scope_type, garantido
  // pelo índice único parcial do banco (Fase 2). Resolve qual delas conta
  // pro cálculo de bônus individual: a mais específica vence.
  const SCOPE_PRECEDENCE={INDIVIDUAL:3, EQUIPE:2, LOJA:1};
  function resolveApplicableGoal(candidates){
    const list=(Array.isArray(candidates)?candidates:[]).filter(Boolean);
    if(!list.length)return null;
    return list.reduce((best,cur)=>{
      const curRank=SCOPE_PRECEDENCE[cur.scope_type]||0;
      const bestRank=best?(SCOPE_PRECEDENCE[best.scope_type]||0):-1;
      return curRank>bestRank?cur:best;
    }, null);
  }

  // ---------- bonificação: busca de faixa em tier_rules ----------
  // tier_rules = [{min_pct,max_pct,type:'PERCENT'|'FIXED',value}, ...].
  // Retorna a faixa cujo intervalo [min_pct,max_pct] contém o
  // atingimento, ou null se nenhuma faixa configurada cobre esse valor
  // (nunca inventa bonificação fora de faixa configurada).
  function findBonusTier(tierRules, atingimentoPct){
    if(atingimentoPct==null)return null;
    const tiers=Array.isArray(tierRules)?tierRules:[];
    return tiers.find(t=>t&&Number(t.min_pct)<=atingimentoPct&&atingimentoPct<=Number(t.max_pct))||null;
  }

  // Valor final da bonificação, dado uma faixa encontrada e o peso da
  // regra -- PERCENT aplica sobre o valor recebido (base), FIXED é um
  // valor absoluto (não escala com o valor recebido).
  function computeBonusAmount(tier, weight, baseValue){
    if(!tier)return 0;
    const w=Number(weight)||1;
    if(tier.type==='PERCENT')return Math.max(0, Number(baseValue||0)*(Number(tier.value)||0)/100*w);
    if(tier.type==='FIXED')return Math.max(0, (Number(tier.value)||0)*w);
    return 0;
  }

  const vxProductivityCalc={
    budget,
    validPayments,
    receivedSum,
    pct,
    resolveApplicableGoal,
    findBonusTier,
    computeBonusAmount,
    SCOPE_PRECEDENCE,
  };

  if(typeof module!=='undefined'&&module.exports){
    module.exports=vxProductivityCalc;
  }
  if(root){
    root.vxProductivityCalc=vxProductivityCalc;
  }
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null));
