/* VoxAssist — Tela "Produtividade / Metas" (Fase 7)
 * Ponto central único de Produtividade, Metas, Bonificação e Campanhas --
 * consome runtime/productivity-calc-v1.js (Fase 6) como fonte canônica de
 * cálculo, e as tabelas/RPCs das Fases 1-5 (goal_targets/bonus_rules/
 * bonus_campaigns/goal_bonus_audit_events/set_goal_target/set_bonus_rule/
 * close_bonus_campaign). Segue o padrão de sobrescrita encadeada de
 * window.render já usado no resto do app (field-agenda-v0813.js,
 * operations-test-v0812.js, whirlpool-import-v0813.js) -- nunca substitui
 * o router, só intercepta a view nova e repassa o resto.
 *
 * Controles de criar/editar meta/regra/campanha só aparecem pra GESTOR --
 * a autorização de verdade é a RLS das Fases 2-4 (INSERT/UPDATE restrito a
 * GESTOR com acesso à loja); esconder o botão aqui é só uma camada de UX,
 * nunca a fronteira real de permissão.
 */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const calc=()=>window.vxProductivityCalc;
  const money=v=>typeof window.money==='function'?window.money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const isGestor=()=>norm(state?.profile?.role)==='GESTOR';
  const meId=()=>state?.profile?.id;
  const meRole=()=>norm(state?.profile?.role);
  const meStoreId=()=>state?.profile?.store_id;

  const TAB_LABELS=[['visao-geral','Visão Geral'],['produtividade','Produtividade'],['metas','Metas'],['bonificacao','Bonificação'],['campanhas','Campanhas'],['historico','Histórico']];
  const SCOPE_LABEL={LOJA:'Loja',EQUIPE:'Equipe',INDIVIDUAL:'Individual'};
  const ROLE_LABEL={GESTOR:'Gestor',ATENDENTE:'Atendente',TECNICO:'Técnico',ESTOQUE:'Estoque',FINANCEIRO:'Financeiro'};

  let pm={loaded:false,stores:[],profiles:[],indicators:[],goals:[],rules:[],campaigns:[],auditEvents:[],orders:[],finMap:new Map(),payments:[],activeTab:'visao-geral',selectedStoreId:null};

  async function loadAll(){
    const isG=isGestor();
    const [stores,profiles,indicators,goals,rules,campaigns,auditEvents,orders,financial,payments]=await Promise.all([
      api('stores?select=id,name&active=eq.true&order=name').catch(()=>[]),
      api('profiles?select=id,full_name,role,store_id&active=eq.true&order=full_name').catch(()=>[]),
      api('productivity_indicators?select=*&active=eq.true&order=label').catch(()=>[]),
      api(`goal_targets?select=*,scope_profile:profiles!goal_targets_scope_user_id_fkey(full_name)&status=eq.ATIVA&valid_to=is.null&order=created_at.desc`).catch(()=>[]),
      api(`bonus_rules?select=*,eligible_profile:profiles!bonus_rules_eligible_user_id_fkey(full_name),bonus_campaigns(name)&status=eq.ATIVA&valid_to=is.null&order=created_at.desc`).catch(()=>[]),
      api('bonus_campaigns?select=*&order=created_at.desc&limit=100').catch(()=>[]),
      api('goal_bonus_audit_events?select=*,changed_by_profile:profiles!goal_bonus_audit_events_changed_by_fkey(full_name)&order=created_at.desc&limit=150').catch(()=>[]),
      api('service_orders?select=id,os_number,status,technician_id,store_id,opened_at,updated_at&order=opened_at.desc&limit=1000').catch(()=>[]),
      api('os_financial?select=*&limit=1500').catch(()=>[]),
      api('payments?select=*&order=paid_at.desc.nullslast&limit=2000').catch(()=>[]),
    ]);
    pm={
      ...pm,
      loaded:true,
      stores, profiles, indicators, goals, rules, campaigns, auditEvents, orders,
      finMap:new Map((financial||[]).map(f=>[String(f.service_order_id),f])),
      payments:calc()?calc().validPayments(payments):(payments||[]),
      selectedStoreId:pm.selectedStoreId||(isG?(stores[0]?.id||null):meStoreId()),
    };
  }

  // ---------- cálculo de indicador real, por pessoa/loja/período ----------
  // Só os 4 indicadores confirmados (Fase 1) -- nenhum inventado aqui.
  const monthStart=()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d};

  function ordersFor({userId,storeId}){
    return pm.orders.filter(o=>{
      if(storeId&&String(o.store_id||'')!==String(storeId))return false;
      if(userId&&String(o.technician_id||'')!==String(userId))return false;
      return true;
    });
  }
  function computeIndicator(code,{userId,storeId}={}){
    const rows=ordersFor({userId,storeId});
    if(code==='OS_ATRIBUIDAS')return rows.filter(o=>!['FINALIZADA','CANCELADA'].includes(norm(o.status))).length;
    if(code==='OS_FINALIZADAS')return rows.filter(o=>['PRONTO PARA ENTREGA','FINALIZADA'].includes(norm(o.status))).length;
    if(code==='APROVEITAMENTO_PCT'){
      const atribuidas=computeIndicator('OS_ATRIBUIDAS',{userId,storeId});
      const finalizadas=computeIndicator('OS_FINALIZADAS',{userId,storeId});
      const total=atribuidas+finalizadas;
      return total?Math.round((finalizadas/total)*10000)/100:0;
    }
    if(code==='VALOR_RECEBIDO'){
      const ids=new Set(rows.map(o=>String(o.id)));
      const from=monthStart();
      return pm.payments.filter(p=>ids.has(String(p.service_order_id))&&new Date(p.paid_at)>=from).reduce((s,p)=>s+Number(p.amount||0),0);
    }
    return 0;
  }

  // ---------- metas aplicáveis: hierarquia INDIVIDUAL > EQUIPE > LOJA ----------
  function goalsApplicableTo({userId,role,storeId}){
    return pm.goals.filter(g=>{
      if(String(g.store_id)!==String(storeId))return false;
      if(g.scope_type==='INDIVIDUAL')return String(g.scope_user_id)===String(userId);
      if(g.scope_type==='EQUIPE')return g.scope_role===role;
      return g.scope_type==='LOJA';
    });
  }
  function resolveGoalFor({userId,role,storeId,indicatorCode}){
    const candidates=goalsApplicableTo({userId,role,storeId}).filter(g=>g.indicator_code===indicatorCode);
    return calc()?calc().resolveApplicableGoal(candidates):(candidates[0]||null);
  }

  // ---------- bonificação aplicável ----------
  function rulesApplicableTo({userId,role,storeId}){
    return pm.rules.filter(r=>{
      if(r.store_id&&String(r.store_id)!==String(storeId))return false;
      if(r.eligible_scope_type==='INDIVIDUAL')return String(r.eligible_user_id)===String(userId);
      if(r.eligible_scope_type==='EQUIPE')return r.eligible_role===role;
      return r.eligible_scope_type==='LOJA';
    });
  }
  function estimateBonus({userId,role,storeId}){
    const rules=rulesApplicableTo({userId,role,storeId});
    if(!rules.length)return null; // sem regra válida -- nunca inventa número
    let total=0;
    const detail=[];
    rules.forEach(r=>{
      const realizado=computeIndicator(r.indicator_code,{userId,storeId});
      const meta=resolveGoalFor({userId,role,storeId,indicatorCode:r.indicator_code});
      const pctVal=calc()?calc().pct(realizado,meta?.target_value):null;
      const tier=calc()?calc().findBonusTier(r.tier_rules,pctVal):null;
      const base=r.indicator_code==='VALOR_RECEBIDO'?realizado:computeIndicator('VALOR_RECEBIDO',{userId,storeId});
      const amount=calc()?calc().computeBonusAmount(tier,r.weight,base):0;
      if(tier){total+=amount;detail.push({rule:r,pctVal,tier,amount})}
    });
    return {total,detail};
  }

  // ---------- API/RPC de escrita ----------
  async function callRpc(name,params){
    const res=await api(`rpc/${name}`,{method:'POST',body:JSON.stringify(params)});
    return res;
  }

  // ---------- render ----------
  function tabButtons(){
    return TAB_LABELS.map(([k,label])=>`<button type="button" class="vx-pm-tab ${pm.activeTab===k?'active':''}" data-tab="${k}">${E(label)}</button>`).join('');
  }
  function storeSelector(){
    if(!isGestor())return'';
    return `<select id="vxPmStoreSelect">${pm.stores.map(s=>`<option value="${E(s.id)}" ${String(pm.selectedStoreId)===String(s.id)?'selected':''}>${E(s.name)}</option>`).join('')}</select>`;
  }

  function renderVisaoGeral(){
    const storeId=pm.selectedStoreId;
    const storeName=pm.stores.find(s=>String(s.id)===String(storeId))?.name||'—';
    const storePeople=pm.profiles.filter(p=>String(p.store_id)===String(storeId)&&p.id!==meId());
    const target=isGestor()?null:{id:meId(),role:meRole()};
    const people=isGestor()?storePeople:[target];

    const storeRecebido=computeIndicator('VALOR_RECEBIDO',{storeId});
    const storeGoal=resolveGoalFor({role:null,userId:null,storeId,indicatorCode:'VALOR_RECEBIDO'});
    const storePct=calc()&&storeGoal?calc().pct(storeRecebido,storeGoal.target_value):null;

    const rows=people.filter(Boolean).map(p=>{
      const realizado=computeIndicator('VALOR_RECEBIDO',{userId:p.id,storeId});
      const goal=resolveGoalFor({userId:p.id,role:norm(p.role),storeId,indicatorCode:'VALOR_RECEBIDO'});
      const pctVal=calc()&&goal?calc().pct(realizado,goal.target_value):null;
      const bonus=estimateBonus({userId:p.id,role:norm(p.role),storeId});
      return {p,realizado,goal,pctVal,bonus};
    });
    const acima=rows.filter(r=>r.pctVal!=null&&r.pctVal>=100).length;
    const abaixo=rows.filter(r=>r.pctVal!=null&&r.pctVal<100).length;

    return `<div class="vx-pm-panel">
      <div class="vx-pm-summary-grid">
        <div class="vx-pm-summary-card"><span>Resultado da loja (Mês)</span><b>${money(storeRecebido)}</b><small>${storeGoal?`Meta: ${money(storeGoal.target_value)} · ${storePct==null?'—':storePct+'%'}`:'Sem meta de loja configurada'}</small></div>
        <div class="vx-pm-summary-card"><span>Funcionários acima da meta</span><b>${acima}</b><small>de ${rows.length} avaliados</small></div>
        <div class="vx-pm-summary-card"><span>Funcionários abaixo da meta</span><b>${abaixo}</b><small>de ${rows.length} avaliados</small></div>
      </div>
      <div class="vx-pm-card">
        <h3>${isGestor()?`Equipe — ${E(storeName)}`:'Meu resultado'}</h3>
        <table class="vx-pm-table"><thead><tr><th>Pessoa</th><th>Papel</th><th>Recebido (Mês)</th><th>Meta aplicável</th><th>Atingimento</th><th>Bonificação estimada</th></tr></thead>
        <tbody>${rows.length?rows.map(r=>`<tr>
          <td>${E(r.p.full_name)}</td>
          <td>${E(ROLE_LABEL[norm(r.p.role)]||r.p.role)}</td>
          <td>${money(r.realizado)}</td>
          <td>${r.goal?`${money(r.goal.target_value)} <small>(${SCOPE_LABEL[r.goal.scope_type]})</small>`:'<span class="vx-pm-empty">Não configurada</span>'}</td>
          <td>${r.pctVal==null?'—':`<b class="${r.pctVal>=100?'ok':'warn'}">${r.pctVal}%</b>`}</td>
          <td>${r.bonus?money(r.bonus.total):'<span class="vx-pm-empty">Sem regra válida</span>'}</td>
        </tr>`).join(''):'<tr><td colspan="6" class="vx-pm-empty">Ninguém pra avaliar nesta loja.</td></tr>'}</tbody></table>
      </div>
    </div>`;
  }

  function renderProdutividade(){
    const storeId=pm.selectedStoreId;
    const techs=pm.profiles.filter(p=>norm(p.role)==='TECNICO'&&(!storeId||String(p.store_id)===String(storeId)));
    const rows=(isGestor()?techs:techs.filter(t=>t.id===meId())).map(t=>({
      t,
      atribuidas:computeIndicator('OS_ATRIBUIDAS',{userId:t.id,storeId}),
      finalizadas:computeIndicator('OS_FINALIZADAS',{userId:t.id,storeId}),
      aproveitamento:computeIndicator('APROVEITAMENTO_PCT',{userId:t.id,storeId}),
      recebido:computeIndicator('VALOR_RECEBIDO',{userId:t.id,storeId}),
    }));
    return `<div class="vx-pm-panel"><div class="vx-pm-card">
      <h3>Produtividade por técnico</h3>
      <table class="vx-pm-table"><thead><tr><th>Técnico</th><th>OS Atribuídas</th><th>OS Finalizadas/Prontos</th><th>Aproveitamento</th><th>Valor Recebido (Mês)</th></tr></thead>
      <tbody>${rows.length?rows.map(r=>`<tr><td>${E(r.t.full_name)}</td><td>${r.atribuidas}</td><td>${r.finalizadas}</td><td>${r.aproveitamento}%</td><td>${money(r.recebido)}</td></tr>`).join(''):'<tr><td colspan="5" class="vx-pm-empty">Nenhum técnico nesta loja.</td></tr>'}</tbody></table>
    </div></div>`;
  }

  function scopeFormFields(prefix,roles){
    return `<label>Nível<select id="${prefix}ScopeType"><option value="LOJA">Loja (todo mundo)</option><option value="EQUIPE">Equipe (grupo por papel)</option><option value="INDIVIDUAL">Individual (uma pessoa)</option></select></label>
      <label id="${prefix}RoleWrap" hidden>Papel (grupo)<select id="${prefix}Role">${roles.map(r=>`<option value="${r}">${E(ROLE_LABEL[r])}</option>`).join('')}</select><small id="${prefix}RoleMembers" class="vx-pm-hint"></small></label>
      <label id="${prefix}UserWrap" hidden>Pessoa<select id="${prefix}User">${pm.profiles.map(p=>`<option value="${E(p.id)}">${E(p.full_name)} (${E(ROLE_LABEL[norm(p.role)]||p.role)})</option>`).join('')}</select></label>`;
  }
  function wireScopeToggle(prefix){
    const sel=document.getElementById(`${prefix}ScopeType`);
    const roleWrap=document.getElementById(`${prefix}RoleWrap`);
    const userWrap=document.getElementById(`${prefix}UserWrap`);
    const roleSelect=document.getElementById(`${prefix}Role`);
    const membersHint=document.getElementById(`${prefix}RoleMembers`);
    const updateMembers=()=>{
      if(!roleSelect||!membersHint)return;
      const role=roleSelect.value;
      const storeId=pm.selectedStoreId;
      const members=pm.profiles.filter(p=>norm(p.role)===role&&String(p.store_id)===String(storeId));
      membersHint.textContent=members.length?`Aplica a: ${members.map(m=>m.full_name).join(', ')}`:'Nenhuma pessoa com esse papel nesta loja.';
    };
    const toggle=()=>{
      roleWrap.hidden=sel.value!=='EQUIPE';
      userWrap.hidden=sel.value!=='INDIVIDUAL';
      if(sel.value==='EQUIPE')updateMembers();
    };
    sel.onchange=toggle;
    if(roleSelect)roleSelect.onchange=updateMembers;
    toggle();
  }

  function renderMetas(){
    const rows=pm.goals.filter(g=>String(g.store_id)===String(pm.selectedStoreId));
    const formHtml=isGestor()?`<div class="vx-pm-card vx-pm-form-card">
      <h3>Nova meta</h3>
      <form id="vxPmGoalForm" class="vx-pm-form">
        ${scopeFormFields('vxPmGoal',['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'])}
        <label>Indicador<select id="vxPmGoalIndicator">${pm.indicators.map(i=>`<option value="${E(i.code)}">${E(i.label)}</option>`).join('')}</select></label>
        <label>Valor da meta<input type="number" id="vxPmGoalValue" min="0.01" step="0.01" required></label>
        <label>Início do período<input type="date" id="vxPmGoalStart" required></label>
        <label>Fim do período<input type="date" id="vxPmGoalEnd" required></label>
        <label>Motivo (opcional)<input type="text" id="vxPmGoalReason" maxlength="200"></label>
        <button type="submit" class="primary">Salvar meta</button>
      </form>
    </div>`:'';
    return `<div class="vx-pm-panel">${formHtml}<div class="vx-pm-card">
      <h3>Metas ativas</h3>
      <table class="vx-pm-table"><thead><tr><th>Nível</th><th>Alvo</th><th>Indicador</th><th>Meta</th><th>Período</th></tr></thead>
      <tbody>${rows.length?rows.map(g=>`<tr><td>${SCOPE_LABEL[g.scope_type]}</td><td>${g.scope_type==='EQUIPE'?E(ROLE_LABEL[g.scope_role]||g.scope_role):g.scope_type==='INDIVIDUAL'?E(g.scope_profile?.full_name||'—'):'Loja toda'}</td><td>${E(pm.indicators.find(i=>i.code===g.indicator_code)?.label||g.indicator_code)}</td><td>${g.indicator_code==='VALOR_RECEBIDO'?money(g.target_value):g.target_value}</td><td>${g.period_start} — ${g.period_end}</td></tr>`).join(''):'<tr><td colspan="5" class="vx-pm-empty">Nenhuma meta ativa nesta loja.</td></tr>'}</tbody></table>
    </div></div>`;
  }

  function renderBonificacao(){
    const rows=pm.rules.filter(r=>!r.store_id||String(r.store_id)===String(pm.selectedStoreId));
    const formHtml=isGestor()?`<div class="vx-pm-card vx-pm-form-card">
      <h3>Nova regra de bonificação</h3>
      <form id="vxPmRuleForm" class="vx-pm-form">
        ${scopeFormFields('vxPmRule',['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'])}
        <label>Indicador<select id="vxPmRuleIndicator">${pm.indicators.map(i=>`<option value="${E(i.code)}">${E(i.label)}</option>`).join('')}</select></label>
        <label>Peso<input type="number" id="vxPmRuleWeight" min="0.01" step="0.01" value="1" required></label>
        <label>Vale só pra esta loja<input type="checkbox" id="vxPmRuleStoreOnly" checked></label>
        <label>Campanha (opcional)<select id="vxPmRuleCampaign"><option value="">Regra padrão (sem campanha)</option>${pm.campaigns.filter(c=>c.status==='ATIVA'&&!c.valid_to).map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select></label>
        <label>Início do período<input type="date" id="vxPmRuleStart" required></label>
        <label>Fim do período<input type="date" id="vxPmRuleEnd" required></label>
        <div class="vx-pm-tiers" id="vxPmRuleTiers"></div>
        <button type="button" id="vxPmRuleAddTier" class="vx-pm-add-tier-btn">+ faixa de atingimento</button>
        <label>Motivo (opcional)<input type="text" id="vxPmRuleReason" maxlength="200"></label>
        <button type="submit" class="primary">Salvar regra</button>
      </form>
    </div>`:'';
    return `<div class="vx-pm-panel">${formHtml}<div class="vx-pm-card">
      <h3>Regras ativas</h3>
      <table class="vx-pm-table"><thead><tr><th>Nível</th><th>Alvo</th><th>Indicador</th><th>Peso</th><th>Campanha</th><th>Faixas</th></tr></thead>
      <tbody>${rows.length?rows.map(r=>`<tr><td>${SCOPE_LABEL[r.eligible_scope_type]}</td><td>${r.eligible_scope_type==='EQUIPE'?E(ROLE_LABEL[r.eligible_role]||r.eligible_role):r.eligible_scope_type==='INDIVIDUAL'?E(r.eligible_profile?.full_name||'—'):(r.store_id?'Esta loja':'Empresa toda')}</td><td>${E(pm.indicators.find(i=>i.code===r.indicator_code)?.label||r.indicator_code)}</td><td>${r.weight}</td><td>${E(r.bonus_campaigns?.name||'—')}</td><td>${(r.tier_rules||[]).map(t=>`${t.min_pct}–${t.max_pct}%: ${t.type==='PERCENT'?t.value+'%':money(t.value)}`).join(' · ')}</td></tr>`).join(''):'<tr><td colspan="6" class="vx-pm-empty">Nenhuma regra ativa.</td></tr>'}</tbody></table>
    </div></div>`;
  }

  function renderCampanhas(){
    const formHtml=isGestor()?`<div class="vx-pm-card vx-pm-form-card">
      <h3>Nova campanha</h3>
      <form id="vxPmCampaignForm" class="vx-pm-form">
        <label>Nome<input type="text" id="vxPmCampaignName" maxlength="120" required></label>
        <label>Descrição (opcional)<input type="text" id="vxPmCampaignDesc" maxlength="300"></label>
        <label>Vale só pra esta loja<input type="checkbox" id="vxPmCampaignStoreOnly" checked></label>
        <label>Início<input type="date" id="vxPmCampaignStart" required></label>
        <label>Fim<input type="date" id="vxPmCampaignEnd" required></label>
        <button type="submit" class="primary">Criar campanha</button>
      </form>
    </div>`:'';
    return `<div class="vx-pm-panel">${formHtml}<div class="vx-pm-card">
      <h3>Campanhas</h3>
      <table class="vx-pm-table"><thead><tr><th>Nome</th><th>Loja</th><th>Vigência</th><th>Status</th>${isGestor()?'<th></th>':''}</tr></thead>
      <tbody>${pm.campaigns.length?pm.campaigns.map(c=>`<tr><td>${E(c.name)}</td><td>${c.store_id?E(pm.stores.find(s=>s.id===c.store_id)?.name||'—'):'Empresa toda'}</td><td>${c.starts_at} — ${c.ends_at}</td><td>${E(c.status)}</td>${isGestor()?`<td>${c.status==='ATIVA'&&!c.valid_to?`<button type="button" class="vx-pm-close-campaign-btn" data-campaign="${E(c.id)}">Encerrar</button>`:''}</td>`:''}</tr>`).join(''):`<tr><td colspan="${isGestor()?5:4}" class="vx-pm-empty">Nenhuma campanha criada ainda.</td></tr>`}</tbody></table>
    </div></div>`;
  }

  function renderHistorico(){
    const rows=pm.auditEvents;
    return `<div class="vx-pm-panel"><div class="vx-pm-card">
      <h3>Histórico de alterações</h3>
      <table class="vx-pm-table"><thead><tr><th>Quando</th><th>Entidade</th><th>Ação</th><th>Responsável</th><th>Motivo</th></tr></thead>
      <tbody>${rows.length?rows.map(a=>`<tr><td>${new Date(a.created_at).toLocaleString('pt-BR')}</td><td>${E({GOAL_TARGET:'Meta',BONUS_RULE:'Regra de bonificação',BONUS_CAMPAIGN:'Campanha'}[a.entity_type]||a.entity_type)}</td><td>${E({CRIADA:'Criada',SUBSTITUIDA:'Substituída',ENCERRADA_ANTECIPADAMENTE:'Encerrada antecipadamente',CANCELADA:'Cancelada'}[a.action]||a.action)}</td><td>${E(a.changed_by_profile?.full_name||'—')}</td><td>${E(a.reason||'—')}</td></tr>`).join(''):'<tr><td colspan="5" class="vx-pm-empty">Nenhum evento registrado ainda.</td></tr>'}</tbody></table>
    </div></div>`;
  }

  function renderTabContent(){
    if(pm.activeTab==='visao-geral')return renderVisaoGeral();
    if(pm.activeTab==='produtividade')return renderProdutividade();
    if(pm.activeTab==='metas')return renderMetas();
    if(pm.activeTab==='bonificacao')return renderBonificacao();
    if(pm.activeTab==='campanhas')return renderCampanhas();
    if(pm.activeTab==='historico')return renderHistorico();
    return '';
  }

  function wireTab(){
    if(pm.activeTab==='metas'&&isGestor()){
      wireScopeToggle('vxPmGoal');
      document.getElementById('vxPmGoalForm')?.addEventListener('submit',handleGoalSubmit);
    }
    if(pm.activeTab==='bonificacao'&&isGestor()){
      wireScopeToggle('vxPmRule');
      wireTierRows();
      document.getElementById('vxPmRuleForm')?.addEventListener('submit',handleRuleSubmit);
    }
    if(pm.activeTab==='campanhas'&&isGestor()){
      document.getElementById('vxPmCampaignForm')?.addEventListener('submit',handleCampaignSubmit);
      document.querySelectorAll('[data-campaign]').forEach(btn=>btn.onclick=()=>handleCloseCampaign(btn.dataset.campaign));
    }
  }

  // ---------- faixas de bonificação (tier_rules) ----------
  let tierRowCount=0;
  function tierRowHtml(idx){
    return `<div class="vx-pm-tier-row" data-tier-idx="${idx}">
      <input type="number" placeholder="De %" class="vx-pm-tier-min" min="0" step="0.01" required>
      <input type="number" placeholder="Até %" class="vx-pm-tier-max" min="0" step="0.01" required>
      <select class="vx-pm-tier-type"><option value="PERCENT">% do valor recebido</option><option value="FIXED">Valor fixo (R$)</option></select>
      <input type="number" placeholder="Valor" class="vx-pm-tier-value" min="0" step="0.01" required>
      <button type="button" class="vx-pm-tier-remove" title="Remover faixa">×</button>
    </div>`;
  }
  function wireTierRows(){
    const container=document.getElementById('vxPmRuleTiers');
    const addBtn=document.getElementById('vxPmRuleAddTier');
    if(!container||!addBtn)return;
    tierRowCount=0;
    container.innerHTML=tierRowHtml(tierRowCount++);
    const wireRemove=()=>container.querySelectorAll('.vx-pm-tier-remove').forEach(b=>b.onclick=()=>{if(container.children.length>1)b.closest('.vx-pm-tier-row').remove()});
    wireRemove();
    addBtn.onclick=()=>{container.insertAdjacentHTML('beforeend',tierRowHtml(tierRowCount++));wireRemove()};
  }
  function collectTierRules(){
    return [...document.querySelectorAll('#vxPmRuleTiers .vx-pm-tier-row')].map(row=>({
      min_pct:Number(row.querySelector('.vx-pm-tier-min').value||0),
      max_pct:Number(row.querySelector('.vx-pm-tier-max').value||0),
      type:row.querySelector('.vx-pm-tier-type').value,
      value:Number(row.querySelector('.vx-pm-tier-value').value||0),
    }));
  }

  function scopeValuesFrom(prefix){
    const scopeType=document.getElementById(`${prefix}ScopeType`).value;
    return {
      scopeType,
      role:scopeType==='EQUIPE'?document.getElementById(`${prefix}Role`).value:null,
      userId:scopeType==='INDIVIDUAL'?document.getElementById(`${prefix}User`).value:null,
    };
  }

  async function handleGoalSubmit(e){
    e.preventDefault();
    const {scopeType,role,userId}=scopeValuesFrom('vxPmGoal');
    try{
      await callRpc('set_goal_target',{
        p_company_id:state.profile.active_company_id,
        p_store_id:pm.selectedStoreId,
        p_scope_type:scopeType,
        p_scope_role:role,
        p_scope_user_id:userId,
        p_indicator_code:document.getElementById('vxPmGoalIndicator').value,
        p_target_value:Number(document.getElementById('vxPmGoalValue').value),
        p_period_start:document.getElementById('vxPmGoalStart').value,
        p_period_end:document.getElementById('vxPmGoalEnd').value,
        p_reason:document.getElementById('vxPmGoalReason').value||null,
      });
      toast?.('Meta salva.');
      await loadAll();
      renderScreen();
    }catch(err){toast?.('Não foi possível salvar a meta: '+err.message,'err')}
  }

  async function handleRuleSubmit(e){
    e.preventDefault();
    const {scopeType,role,userId}=scopeValuesFrom('vxPmRule');
    const storeOnly=document.getElementById('vxPmRuleStoreOnly').checked;
    try{
      await callRpc('set_bonus_rule',{
        p_company_id:state.profile.active_company_id,
        p_store_id:storeOnly?pm.selectedStoreId:null,
        p_indicator_code:document.getElementById('vxPmRuleIndicator').value,
        p_eligible_scope_type:scopeType,
        p_eligible_role:role,
        p_eligible_user_id:userId,
        p_weight:Number(document.getElementById('vxPmRuleWeight').value),
        p_tier_rules:collectTierRules(),
        p_campaign_id:document.getElementById('vxPmRuleCampaign').value||null,
        p_period_start:document.getElementById('vxPmRuleStart').value,
        p_period_end:document.getElementById('vxPmRuleEnd').value,
        p_reason:document.getElementById('vxPmRuleReason').value||null,
      });
      toast?.('Regra de bonificação salva.');
      await loadAll();
      renderScreen();
    }catch(err){toast?.('Não foi possível salvar a regra: '+err.message,'err')}
  }

  async function handleCampaignSubmit(e){
    e.preventDefault();
    const storeOnly=document.getElementById('vxPmCampaignStoreOnly').checked;
    try{
      await api('bonus_campaigns',{method:'POST',body:JSON.stringify({
        company_id:state.profile.active_company_id,
        store_id:storeOnly?pm.selectedStoreId:null,
        name:document.getElementById('vxPmCampaignName').value,
        description:document.getElementById('vxPmCampaignDesc').value||null,
        starts_at:document.getElementById('vxPmCampaignStart').value,
        ends_at:document.getElementById('vxPmCampaignEnd').value,
        created_by:meId(),
      })});
      toast?.('Campanha criada.');
      await loadAll();
      renderScreen();
    }catch(err){toast?.('Não foi possível criar a campanha: '+err.message,'err')}
  }

  async function handleCloseCampaign(campaignId){
    if(!confirm('Encerrar esta campanha? As regras de bonificação vinculadas a ela também serão encerradas.'))return;
    try{
      await callRpc('close_bonus_campaign',{p_campaign_id:campaignId,p_status:'ENCERRADA',p_reason:null});
      toast?.('Campanha encerrada.');
      await loadAll();
      renderScreen();
    }catch(err){toast?.('Não foi possível encerrar a campanha: '+err.message,'err')}
  }

  function renderScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML=`<div class="vx-pm-wrap">
      <div class="vx-pm-head">
        <button type="button" id="vxPmBack" class="vx-pm-back">← Voltar</button>
        <div class="vx-pm-head-title"><h1>Produtividade / Metas</h1><p>Indicadores, metas, desempenho e bonificação por loja, equipe e funcionário.</p></div>
        ${storeSelector()}
      </div>
      <div class="vx-pm-tabs">${tabButtons()}</div>
      ${renderTabContent()}
    </div>`;
    document.getElementById('vxPmBack').onclick=()=>window.render('dashboard');
    document.getElementById('vxPmStoreSelect')?.addEventListener('change',e=>{pm.selectedStoreId=e.target.value;renderScreen()});
    document.querySelectorAll('.vx-pm-tab').forEach(b=>b.onclick=()=>{pm.activeTab=b.dataset.tab;renderScreen()});
    wireTab();
  }

  async function renderProdutividadeMetas(initialTab){
    const app=document.querySelector('#app');
    if(!app)return;
    pm.activeTab=initialTab||'visao-geral';
    app.innerHTML='<div class="card">Carregando produtividade e metas...</div>';
    await loadAll();
    renderScreen();
  }

  window.renderProdutividadeMetas=renderProdutividadeMetas;

  const priorRender=window.render;
  window.render=async function(view){
    if(view==='produtividade-metas')return renderProdutividadeMetas('visao-geral');
    if(typeof view==='string'&&view.startsWith('produtividade-metas:'))return renderProdutividadeMetas(view.split(':')[1]);
    return priorRender(view);
  };

  window.VoxAssistRuntime=window.VoxAssistRuntime||{};
  window.VoxAssistRuntime.productivityMetas={name:'Produtividade/Metas V1',version:'1.0.0',owner:'runtime/productivity-metas-v1.js'};
})();
