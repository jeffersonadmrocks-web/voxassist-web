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

  // ---------- vigência/período (correção pós-auditoria P1-1) ----------
  // status='ATIVA' e valid_to=null NÃO bastam -- meta/regra tem período de
  // negócio próprio (period_start/period_end). Uma meta de setembro não
  // pode contar o realizado de outubro, nem uma meta futura/encerrada deve
  // entrar no cálculo do dia de hoje.
  function toDateOnly(d){
    if(d instanceof Date)return new Date(d.getFullYear(),d.getMonth(),d.getDate());
    const parsed=new Date(d);
    if(Number.isNaN(parsed.getTime()))return null;
    return new Date(parsed.getFullYear(),parsed.getMonth(),parsed.getDate());
  }
  function isWithinPeriod(row,refDate){
    const ref=toDateOnly(refDate||new Date());
    const from=toDateOnly(row?.period_start), to=toDateOnly(row?.period_end);
    if(!ref||!from||!to)return false;
    return from<=ref&&ref<=to;
  }
  // Campanha só participa se ATIVA, não encerrada (valid_to null) e dentro
  // de starts_at/ends_at -- campanha cancelada/encerrada nunca soma bônus,
  // mesmo que a regra vinculada a ela ainda esteja marcada ATIVA.
  function isCampaignActiveOn(campaign,refDate){
    if(!campaign)return false;
    if(campaign.status!=='ATIVA'||campaign.valid_to)return false;
    const ref=toDateOnly(refDate||new Date());
    const from=toDateOnly(campaign.starts_at), to=toDateOnly(campaign.ends_at);
    if(!ref||!from||!to)return false;
    return from<=ref&&ref<=to;
  }

  // ---------- atribuição real por papel (correção pós-auditoria P1-5) ----------
  // service_orders tem technician_id E attendant_id -- os dois campos reais
  // já existentes (nenhum inventado). Um indicador baseado em OS só é
  // calculável pra quem tem um campo real de atribuição; pra outros papéis
  // (GESTOR/ESTOQUE/FINANCEIRO) o indicador fica NÃO CALCULÁVEL em vez de
  // silenciosamente atribuído a technician_id.
  function attributionFieldForRole(role){
    const r=norm(role);
    if(r==='TECNICO')return'technician_id';
    if(r==='ATENDENTE')return'attendant_id';
    return null;
  }

  // ---------- validação de tier_rules (correção pós-auditoria P1-4) ----------
  // Espelha a validação feita no banco (validate_tier_rules(), migration da
  // correção pós-auditoria) -- pra dar erro na hora no formulário, sem
  // esperar o round-trip da RPC. A validação real/autoritativa continua
  // sendo a do banco (um payload manipulado direto na API tem que ser
  // barrado lá, não só aqui).
  function validateTierRulesStructure(tierRules){
    if(!Array.isArray(tierRules)||!tierRules.length)return{valid:false,error:'Informe ao menos uma faixa de atingimento.'};
    const tiers=[];
    for(const t of tierRules){
      if(!t||typeof t!=='object')return{valid:false,error:'Faixa inválida (não é um objeto).'};
      const {min_pct,max_pct,type,value}=t;
      if(typeof min_pct!=='number'||!Number.isFinite(min_pct))return{valid:false,error:'min_pct precisa ser numérico.'};
      if(typeof max_pct!=='number'||!Number.isFinite(max_pct))return{valid:false,error:'max_pct precisa ser numérico.'};
      if(max_pct<min_pct)return{valid:false,error:'max_pct precisa ser >= min_pct.'};
      if(type!=='PERCENT'&&type!=='FIXED')return{valid:false,error:'type precisa ser PERCENT ou FIXED.'};
      if(typeof value!=='number'||!Number.isFinite(value))return{valid:false,error:'value precisa ser numérico.'};
      if(value<0)return{valid:false,error:'value precisa ser >= 0.'};
      tiers.push({min_pct,max_pct,type,value});
    }
    const sorted=[...tiers].sort((a,b)=>a.min_pct-b.min_pct);
    for(let i=0;i<sorted.length-1;i++){
      if(sorted[i].max_pct>=sorted[i+1].min_pct)return{valid:false,error:`Faixas sobrepostas: ${sorted[i].min_pct}-${sorted[i].max_pct} e ${sorted[i+1].min_pct}-${sorted[i+1].max_pct}.`};
    }
    return{valid:true,error:null,sorted};
  }

  // ---------- bonificação aditiva: padrão + campanhas (correção P1-2) ----------
  // Campanha é bonificação ADICIONAL -- nunca substitui a regra padrão.
  // Total = padrão válida + soma de cada campanha válida (ativa, dentro da
  // vigência, com meta/faixa aplicável). Retorna a composição rastreável
  // (defaultAmount, campaignBreakdown[]) -- nunca só um número opaco.
  function computeBonusBreakdown({rules,campaignsById,refDate,realizadoFn,goalFn}){
    const list=(Array.isArray(rules)?rules:[]).filter(r=>r&&isWithinPeriod(r,refDate));
    let defaultAmount=0;
    const campaignBreakdown=[];
    const byCampaign=new Map();
    list.forEach(rule=>{
      const realizado=realizadoFn(rule.indicator_code);
      const goal=goalFn(rule.indicator_code);
      const pctVal=goal?pct(realizado,goal.target_value):null;
      const tier=findBonusTier(rule.tier_rules,pctVal);
      if(!tier)return; // sem meta aplicável ou fora de qualquer faixa -- nunca inventa valor
      const amount=computeBonusAmount(tier,rule.weight,realizado);
      if(!rule.campaign_id){
        defaultAmount+=amount;
        return;
      }
      const campaign=campaignsById?.get(String(rule.campaign_id));
      if(!isCampaignActiveOn(campaign,refDate))return; // campanha encerrada/cancelada/fora da vigência -- não soma
      const key=String(rule.campaign_id);
      byCampaign.set(key,(byCampaign.get(key)||0)+amount);
    });
    byCampaign.forEach((amount,campaignId)=>{
      campaignBreakdown.push({campaignId,campaign:campaignsById?.get(campaignId)||null,amount});
    });
    const grandTotal=defaultAmount+campaignBreakdown.reduce((s,c)=>s+c.amount,0);
    return{defaultAmount,campaignBreakdown,grandTotal,hasAny:defaultAmount>0||campaignBreakdown.length>0};
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
    isWithinPeriod,
    isCampaignActiveOn,
    attributionFieldForRole,
    validateTierRulesStructure,
    computeBonusBreakdown,
  };

  if(typeof module!=='undefined'&&module.exports){
    module.exports=vxProductivityCalc;
  }
  if(root){
    root.vxProductivityCalc=vxProductivityCalc;
  }
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null));
