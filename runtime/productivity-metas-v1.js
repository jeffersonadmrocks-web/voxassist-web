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

  let pm={loaded:false,stores:[],profiles:[],indicators:[],goals:[],rules:[],campaigns:[],auditEvents:[],orders:[],finMap:new Map(),payments:[],activeTab:'visao-geral',selectedStoreId:null,hasCorporateAccess:false};

  async function loadAll(){
    const isG=isGestor();
    const [stores,profiles,indicators,goals,rules,campaigns,auditEvents,orders,financial,payments,wildcardAccess]=await Promise.all([
      api('stores?select=id,name&active=eq.true&order=name').catch(()=>[]),
      api('profiles?select=id,full_name,role,store_id&active=eq.true&order=full_name').catch(()=>[]),
      api('productivity_indicators?select=*&active=eq.true&order=label').catch(()=>[]),
      api(`goal_targets?select=*,scope_profile:profiles!goal_targets_scope_user_id_fkey(full_name)&status=eq.ATIVA&valid_to=is.null&order=created_at.desc`).catch(()=>[]),
      api(`bonus_rules?select=*,eligible_profile:profiles!bonus_rules_eligible_user_id_fkey(full_name),bonus_campaigns(name)&status=eq.ATIVA&valid_to=is.null&order=created_at.desc`).catch(()=>[]),
      api('bonus_campaigns?select=*&order=created_at.desc&limit=100').catch(()=>[]),
      api('goal_bonus_audit_events?select=*,changed_by_profile:profiles!goal_bonus_audit_events_changed_by_fkey(full_name)&order=created_at.desc&limit=150').catch(()=>[]),
      api('service_orders?select=id,os_number,status,technician_id,attendant_id,store_id,opened_at,updated_at&order=opened_at.desc&limit=1000').catch(()=>[]),
      api('os_financial?select=*&limit=1500').catch(()=>[]),
      api('payments?select=*&order=paid_at.desc.nullslast&limit=2000').catch(()=>[]),
      isGestor()?api(`user_store_access?select=id&user_id=eq.${meId()}&store_id=is.null&active=eq.true&limit=1`).catch(()=>[]):Promise.resolve([]),
    ]);
    pm={
      ...pm,
      loaded:true,
      stores, profiles, indicators, goals, rules, campaigns, auditEvents, orders,
      finMap:new Map((financial||[]).map(f=>[String(f.service_order_id),f])),
      payments:calc()?calc().validPayments(payments):(payments||[]),
      selectedStoreId:pm.selectedStoreId||(isG?(stores[0]?.id||null):meStoreId()),
      // Vínculo curinga explícito (user_store_access.store_id IS NULL) --
      // sem confirmação positiva, a UI nunca oferece a opção "empresa
      // toda" pra criar/fechar regra/campanha corporativa (correção
      // pós-auditoria P1-3). Ausência de prova = sem acesso corporativo,
      // nunca o contrário.
      hasCorporateAccess:Array.isArray(wildcardAccess)&&wildcardAccess.length>0,
    };
  }

  // ---------- cálculo de indicador real, por pessoa/loja/período ----------
  // Só os 4 indicadores confirmados (Fase 1) -- nenhum inventado aqui.
  const monthStart=()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d};

  // Atribuição real por papel (correção pós-auditoria P1-5):
  // technician_id pra TECNICO, attendant_id pra ATENDENTE -- os dois
  // campos já existentes em service_orders (nenhum inventado). Pra
  // qualquer outro papel (GESTOR/ESTOQUE/FINANCEIRO) não existe hoje
  // campo real de atribuição de OS -- ordersFor devolve vazio nesse
  // caso, e computeIndicator devolve null (NÃO CALCULÁVEL) em vez de
  // atribuir silenciosamente ao técnico ou inventar zero.
  function ordersFor({userId,storeId,role}){
    const field=userId?calc()?.attributionFieldForRole(role):null;
    return pm.orders.filter(o=>{
      if(storeId&&String(o.store_id||'')!==String(storeId))return false;
      if(userId){
        if(!field)return false;
        if(String(o[field]||'')!==String(userId))return false;
      }
      return true;
    });
  }
  // periodStart/periodEnd: quando informados (vindos da meta/regra
  // sendo avaliada), VALOR_RECEBIDO usa o período PRÓPRIO dela --
  // nunca assume mês corrente pra todo mundo (correção pós-auditoria
  // P1-1). Sem período informado (ex.: aba Produtividade, que é um
  // retrato solto, não vinculado a uma meta específica), cai no mês
  // corrente como antes.
  function computeIndicator(code,{userId,storeId,role,periodStart,periodEnd}={}){
    if(userId&&!calc()?.attributionFieldForRole(role))return null; // NÃO CALCULÁVEL pra este papel -- nunca 0 disfarçado
    const rows=ordersFor({userId,storeId,role});
    if(code==='OS_ATRIBUIDAS')return rows.filter(o=>!['FINALIZADA','CANCELADA'].includes(norm(o.status))).length;
    if(code==='OS_FINALIZADAS')return rows.filter(o=>['PRONTO PARA ENTREGA','FINALIZADA'].includes(norm(o.status))).length;
    if(code==='APROVEITAMENTO_PCT'){
      const atribuidas=computeIndicator('OS_ATRIBUIDAS',{userId,storeId,role});
      const finalizadas=computeIndicator('OS_FINALIZADAS',{userId,storeId,role});
      const total=atribuidas+finalizadas;
      return total?Math.round((finalizadas/total)*10000)/100:0;
    }
    if(code==='VALOR_RECEBIDO'){
      const ids=new Set(rows.map(o=>String(o.id)));
      const from=periodStart?new Date(periodStart+'T00:00:00'):monthStart();
      const to=periodEnd?new Date(periodEnd+'T23:59:59'):null;
      return pm.payments.filter(p=>{
        if(!ids.has(String(p.service_order_id)))return false;
        const paidAt=new Date(p.paid_at);
        if(paidAt<from)return false;
        if(to&&paidAt>to)return false;
        return true;
      }).reduce((s,p)=>s+Number(p.amount||0),0);
    }
    return 0;
  }
  function fmtIndicatorValue(code,value){
    if(value==null)return '<span class="vx-pm-empty">Não calculável</span>';
    if(code==='VALOR_RECEBIDO')return money(value);
    if(code==='APROVEITAMENTO_PCT')return value+'%';
    return value;
  }

  // ---------- metas aplicáveis: hierarquia INDIVIDUAL > EQUIPE > LOJA ----------
  // refDate: só considera meta VIGENTE naquela data (period_start <=
  // refDate <= period_end) -- meta futura ou encerrada não entra como
  // "aplicável agora", mesmo com status=ATIVA/valid_to=null (correção
  // pós-auditoria P1-1).
  function goalsApplicableTo({userId,role,storeId}){
    return pm.goals.filter(g=>{
      if(String(g.store_id)!==String(storeId))return false;
      if(g.scope_type==='INDIVIDUAL')return String(g.scope_user_id)===String(userId);
      if(g.scope_type==='EQUIPE')return g.scope_role===role;
      return g.scope_type==='LOJA';
    });
  }
  function resolveGoalFor({userId,role,storeId,indicatorCode,refDate}){
    const ref=refDate||new Date();
    const candidates=goalsApplicableTo({userId,role,storeId})
      .filter(g=>g.indicator_code===indicatorCode)
      .filter(g=>calc()?calc().isWithinPeriod(g,ref):true);
    return calc()?calc().resolveApplicableGoal(candidates):(candidates[0]||null);
  }
  function goalPeriodBadge(g){
    if(!calc())return'';
    if(calc().isWithinPeriod(g,new Date()))return '<span class="vx-pm-badge vx-pm-badge-ok">Vigente</span>';
    return new Date(g.period_start+'T00:00:00')>new Date()?'<span class="vx-pm-badge">Futura</span>':'<span class="vx-pm-badge vx-pm-badge-muted">Encerrada</span>';
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
  // Bonificação de campanha é ADITIVA à regra padrão, nunca substitui
  // (correção pós-auditoria P1-2) -- computeBonusBreakdown (Fase 6)
  // devolve a composição rastreável (defaultAmount + campaignBreakdown
  // por campanha), nunca só um total opaco. realizadoFn/goalFn usam o
  // período PRÓPRIO de cada regra (2º argumento `rule`), não mês
  // corrente fixo.
  function estimateBonus({userId,role,storeId}){
    if(!calc())return null;
    if(userId&&!calc().attributionFieldForRole(role))return null; // papel sem indicador calculável -- nunca gera bonificação de um 0% inventado
    const rules=rulesApplicableTo({userId,role,storeId});
    if(!rules.length)return null;
    const campaignsById=new Map(pm.campaigns.map(c=>[String(c.id),c]));
    const breakdown=calc().computeBonusBreakdown({
      rules,
      campaignsById,
      refDate:new Date(),
      realizadoFn:(indicatorCode,rule)=>computeIndicator(indicatorCode,{userId,storeId,role,periodStart:rule?.period_start,periodEnd:rule?.period_end}),
      goalFn:(indicatorCode,rule)=>resolveGoalFor({userId,role,storeId,indicatorCode,refDate:rule?.period_start}),
    });
    return breakdown.hasAny?breakdown:null;
  }
  function bonusCellHtml(bonus){
    if(!bonus)return '<span class="vx-pm-empty">Sem regra válida</span>';
    const parts=[];
    if(bonus.defaultAmount>0)parts.push(`Bônus padrão: ${money(bonus.defaultAmount)}`);
    bonus.campaignBreakdown.forEach(c=>{if(c.amount>0)parts.push(`Campanha ${E(c.campaign?.name||'—')}: ${money(c.amount)}`)});
    if(!parts.length)return '<span class="vx-pm-empty">Sem faixa atingida</span>';
    return `<div class="vx-pm-bonus-breakdown">${parts.map(p=>`<div>${p}</div>`).join('')}<div class="vx-pm-bonus-total">Total estimado: <b>${money(bonus.grandTotal)}</b></div></div>`;
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

    const storeGoal=resolveGoalFor({role:null,userId:null,storeId,indicatorCode:'VALOR_RECEBIDO'});
    const storeRecebido=computeIndicator('VALOR_RECEBIDO',{storeId,periodStart:storeGoal?.period_start,periodEnd:storeGoal?.period_end});
    const storePct=calc()&&storeGoal?calc().pct(storeRecebido,storeGoal.target_value):null;

    const rows=people.filter(Boolean).map(p=>{
      const role=norm(p.role);
      const goal=resolveGoalFor({userId:p.id,role,storeId,indicatorCode:'VALOR_RECEBIDO'});
      // Realizado usa o período PRÓPRIO da meta aplicável (não mês
      // corrente fixo) -- correção pós-auditoria P1-1. Sem meta
      // aplicável, mostra o mês corrente só como retrato geral.
      const realizado=computeIndicator('VALOR_RECEBIDO',{userId:p.id,storeId,role,periodStart:goal?.period_start,periodEnd:goal?.period_end});
      const pctVal=(realizado!=null&&calc()&&goal)?calc().pct(realizado,goal.target_value):null;
      const bonus=estimateBonus({userId:p.id,role,storeId});
      return {p,realizado,goal,pctVal,bonus};
    });
    const acima=rows.filter(r=>r.pctVal!=null&&r.pctVal>=100).length;
    const abaixo=rows.filter(r=>r.pctVal!=null&&r.pctVal<100).length;

    return `<div class="vx-pm-panel">
      <div class="vx-pm-summary-grid">
        <div class="vx-pm-summary-card"><span>Resultado da loja${storeGoal?` (${storeGoal.period_start} — ${storeGoal.period_end})`:' (Mês)'}</span><b>${money(storeRecebido)}</b><small>${storeGoal?`Meta: ${money(storeGoal.target_value)} · ${storePct==null?'—':storePct+'%'}`:'Sem meta de loja configurada'}</small></div>
        <div class="vx-pm-summary-card"><span>Funcionários acima da meta</span><b>${acima}</b><small>de ${rows.length} avaliados</small></div>
        <div class="vx-pm-summary-card"><span>Funcionários abaixo da meta</span><b>${abaixo}</b><small>de ${rows.length} avaliados</small></div>
      </div>
      <div class="vx-pm-card">
        <h3>${isGestor()?`Equipe — ${E(storeName)}`:'Meu resultado'}</h3>
        <table class="vx-pm-table"><thead><tr><th>Pessoa</th><th>Papel</th><th>Recebido (no período da meta)</th><th>Meta aplicável</th><th>Atingimento</th><th>Bonificação estimada</th></tr></thead>
        <tbody>${rows.length?rows.map(r=>`<tr>
          <td>${E(r.p.full_name)}</td>
          <td>${E(ROLE_LABEL[norm(r.p.role)]||r.p.role)}</td>
          <td>${fmtIndicatorValue('VALOR_RECEBIDO',r.realizado)}</td>
          <td>${r.goal?`${money(r.goal.target_value)} <small>(${SCOPE_LABEL[r.goal.scope_type]} · ${r.goal.period_start}—${r.goal.period_end})</small>`:'<span class="vx-pm-empty">Não configurada</span>'}</td>
          <td>${r.pctVal==null?'—':`<b class="${r.pctVal>=100?'ok':'warn'}">${r.pctVal}%</b>`}</td>
          <td>${bonusCellHtml(r.bonus)}</td>
        </tr>`).join(''):'<tr><td colspan="6" class="vx-pm-empty">Ninguém pra avaliar nesta loja.</td></tr>'}</tbody></table>
      </div>
    </div>`;
  }

  // Duas tabelas -- técnico (technician_id) e atendente (attendant_id),
  // os dois campos reais de atribuição de OS confirmados em
  // service_orders (correção pós-auditoria P1-5: produtividade de
  // atendente não pode ficar de fora nem ser silenciosamente somada à
  // do técnico). Qualquer outro papel não entra aqui -- não tem campo
  // de atribuição real hoje, ficaria "Não calculável" em toda coluna.
  function produtividadeRowsFor(role,storeId){
    const people=pm.profiles.filter(p=>norm(p.role)===role&&(!storeId||String(p.store_id)===String(storeId)));
    const list=isGestor()?people:people.filter(t=>t.id===meId());
    return list.map(t=>({
      t,
      atribuidas:computeIndicator('OS_ATRIBUIDAS',{userId:t.id,storeId,role}),
      finalizadas:computeIndicator('OS_FINALIZADAS',{userId:t.id,storeId,role}),
      aproveitamento:computeIndicator('APROVEITAMENTO_PCT',{userId:t.id,storeId,role}),
      recebido:computeIndicator('VALOR_RECEBIDO',{userId:t.id,storeId,role}),
    }));
  }
  function produtividadeTableHtml(title,rows,emptyLabel){
    return `<div class="vx-pm-card">
      <h3>${E(title)}</h3>
      <table class="vx-pm-table"><thead><tr><th>Nome</th><th>OS Atribuídas</th><th>OS Finalizadas/Prontos</th><th>Aproveitamento</th><th>Valor Recebido (Mês)</th></tr></thead>
      <tbody>${rows.length?rows.map(r=>`<tr><td>${E(r.t.full_name)}</td><td>${fmtIndicatorValue('OS_ATRIBUIDAS',r.atribuidas)}</td><td>${fmtIndicatorValue('OS_FINALIZADAS',r.finalizadas)}</td><td>${fmtIndicatorValue('APROVEITAMENTO_PCT',r.aproveitamento)}</td><td>${fmtIndicatorValue('VALOR_RECEBIDO',r.recebido)}</td></tr>`).join(''):`<tr><td colspan="5" class="vx-pm-empty">${E(emptyLabel)}</td></tr>`}</tbody></table>
    </div>`;
  }
  function renderProdutividade(){
    const storeId=pm.selectedStoreId;
    return `<div class="vx-pm-panel">
      ${produtividadeTableHtml('Produtividade por técnico',produtividadeRowsFor('TECNICO',storeId),'Nenhum técnico nesta loja.')}
      ${produtividadeTableHtml('Produtividade por atendente',produtividadeRowsFor('ATENDENTE',storeId),'Nenhum atendente nesta loja.')}
    </div>`;
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
      <tbody>${rows.length?rows.map(g=>`<tr><td>${SCOPE_LABEL[g.scope_type]}</td><td>${g.scope_type==='EQUIPE'?E(ROLE_LABEL[g.scope_role]||g.scope_role):g.scope_type==='INDIVIDUAL'?E(g.scope_profile?.full_name||'—'):'Loja toda'}</td><td>${E(pm.indicators.find(i=>i.code===g.indicator_code)?.label||g.indicator_code)}</td><td>${g.indicator_code==='VALOR_RECEBIDO'?money(g.target_value):g.target_value}</td><td>${g.period_start} — ${g.period_end} ${goalPeriodBadge(g)}</td></tr>`).join(''):'<tr><td colspan="5" class="vx-pm-empty">Nenhuma meta ativa nesta loja.</td></tr>'}</tbody></table>
    </div></div>`;
  }

  // "Vale só pra esta loja" só pode ser desmarcado por quem tem o
  // vínculo curinga explícito (correção pós-auditoria P1-3) -- sem
  // isso a UI nem oferece a opção corporativa, que o banco rejeitaria
  // de qualquer forma (RLS + checagem explícita na RPC).
  function storeOnlyFieldHtml(id){
    const locked=!pm.hasCorporateAccess;
    return `<label>Vale só pra esta loja<input type="checkbox" id="${id}" ${locked?'checked disabled':'checked'}></label>${locked?'<small class="vx-pm-hint">Você não tem vínculo de acesso a todas as lojas -- só pode configurar pra esta loja.</small>':''}`;
  }

  function renderBonificacao(){
    const rows=pm.rules.filter(r=>!r.store_id||String(r.store_id)===String(pm.selectedStoreId));
    const formHtml=isGestor()?`<div class="vx-pm-card vx-pm-form-card">
      <h3>Nova regra de bonificação</h3>
      <form id="vxPmRuleForm" class="vx-pm-form">
        ${scopeFormFields('vxPmRule',['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'])}
        <label>Indicador<select id="vxPmRuleIndicator">${pm.indicators.map(i=>`<option value="${E(i.code)}">${E(i.label)}</option>`).join('')}</select></label>
        <label>Peso<input type="number" id="vxPmRuleWeight" min="0.01" step="0.01" value="1" required></label>
        ${storeOnlyFieldHtml('vxPmRuleStoreOnly')}
        <label>Campanha (opcional -- bonificação de campanha é SOMADA à regra padrão, nunca a substitui)<select id="vxPmRuleCampaign"><option value="">Regra padrão (sem campanha)</option>${pm.campaigns.filter(c=>c.status==='ATIVA'&&!c.valid_to).map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select></label>
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
      <table class="vx-pm-table"><thead><tr><th>Nível</th><th>Alvo</th><th>Indicador</th><th>Peso</th><th>Campanha</th><th>Faixas</th><th>Vigência</th></tr></thead>
      <tbody>${rows.length?rows.map(r=>`<tr><td>${SCOPE_LABEL[r.eligible_scope_type]}</td><td>${r.eligible_scope_type==='EQUIPE'?E(ROLE_LABEL[r.eligible_role]||r.eligible_role):r.eligible_scope_type==='INDIVIDUAL'?E(r.eligible_profile?.full_name||'—'):(r.store_id?'Esta loja':'Empresa toda')}</td><td>${E(pm.indicators.find(i=>i.code===r.indicator_code)?.label||r.indicator_code)}</td><td>${r.weight}</td><td>${E(r.bonus_campaigns?.name||(r.campaign_id?'—':'Padrão'))}</td><td>${(r.tier_rules||[]).map(t=>`${t.min_pct}–${t.max_pct}%: ${t.type==='PERCENT'?t.value+'%':money(t.value)}`).join(' · ')}</td><td>${r.period_start}—${r.period_end} ${goalPeriodBadge(r)}</td></tr>`).join(''):'<tr><td colspan="7" class="vx-pm-empty">Nenhuma regra ativa.</td></tr>'}</tbody></table>
    </div></div>`;
  }

  function renderCampanhas(){
    const formHtml=isGestor()?`<div class="vx-pm-card vx-pm-form-card">
      <h3>Nova campanha</h3>
      <form id="vxPmCampaignForm" class="vx-pm-form">
        <label>Nome<input type="text" id="vxPmCampaignName" maxlength="120" required></label>
        <label>Descrição (opcional)<input type="text" id="vxPmCampaignDesc" maxlength="300"></label>
        ${storeOnlyFieldHtml('vxPmCampaignStoreOnly')}
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
    const storeOnlyEl=document.getElementById('vxPmRuleStoreOnly');
    const storeOnly=storeOnlyEl.disabled?true:storeOnlyEl.checked; // checkbox travado (sem vínculo curinga) -- nunca envia store_id null
    const tierRules=collectTierRules();
    const tierCheck=calc()?calc().validateTierRulesStructure(tierRules):{valid:true};
    if(!tierCheck.valid){toast?.('Faixas de bonificação inválidas: '+tierCheck.error,'err');return}
    try{
      await callRpc('set_bonus_rule',{
        p_company_id:state.profile.active_company_id,
        p_store_id:storeOnly?pm.selectedStoreId:null,
        p_indicator_code:document.getElementById('vxPmRuleIndicator').value,
        p_eligible_scope_type:scopeType,
        p_eligible_role:role,
        p_eligible_user_id:userId,
        p_weight:Number(document.getElementById('vxPmRuleWeight').value),
        p_tier_rules:tierRules,
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
    const storeOnlyEl=document.getElementById('vxPmCampaignStoreOnly');
    const storeOnly=storeOnlyEl.disabled?true:storeOnlyEl.checked; // checkbox travado (sem vínculo curinga) -- nunca envia store_id null
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
