/* VoxAssist Web V0.9.12 — Configurações > Financeiro > Bonificação dos Técnicos.
   Motor de bonificação configurável (migrations 20260912030000/040000):
   bonus_programs (bônus potencial + vigência, versionado) + bonus_criteria
   (4 critérios fixos: Tempo/Eficiência, Qualidade/Reincidência, FG, NPS --
   peso/faixas/meta configuráveis, método de cálculo fixo por critério) +
   bonus_results (snapshot append-only por técnico/período).
   Página injetada dentro de Configurações > Financeiro (mesmo padrão de
   permissions-catalog-v0901.js -- wrap de window.renderFinanceiroSettings,
   nunca edita settings-payment-methods-v0908.js diretamente). Nenhuma
   faixa/peso é hardcoded aqui além dos DEFAULTS de um programa novo (só
   pra facilitar o primeiro cadastro) -- tudo que já existe vem do banco. */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const companyId=()=>state?.profile?.active_company_id;
  let activeTab='programa';
  let currentProgram=null;

  const CRITERIA_META={
    TEMPO_EFICIENCIA:{label:'Tempo/Eficiência',calc_method:'FAIXAS',unit:'dias',help:'Faixas por dias entre abertura e encerramento da OS.'},
    QUALIDADE_REINCIDENCIA:{label:'Qualidade/Reincidência',calc_method:'FAIXAS',unit:'%',help:'Faixas por % de reincidência atribuível em até 90 dias.'},
    FG_RECEITA:{label:'FG (Geração de Receita)',calc_method:'LINEAR_ATE_META',unit:'%',help:'Proporcional: 0% da meta = 0%, meta atingida = 100%.'},
    NPS:{label:'NPS',calc_method:'LINEAR_ATE_META',unit:'pontos',help:'Proporcional: 0 = 0%, meta atingida = 100%. NPS negativo zera só este critério.'}
  };
  const DEFAULT_CRITERIA=[
    {code:'TEMPO_EFICIENCIA',weight_percent:20,rules:[{max_value:1,percent:100,description:'até 1 dia'},{min_value:1,max_value:3,percent:80,description:'até 3 dias'},{min_value:3,max_value:5,percent:60,description:'até 5 dias'},{min_value:5,percent:30,description:'acima de 5 dias'}]},
    {code:'QUALIDADE_REINCIDENCIA',weight_percent:25,rules:[{max_value:10,percent:100},{min_value:10,max_value:15,percent:90},{min_value:15,max_value:20,percent:75},{min_value:20,max_value:25,percent:50},{min_value:25,max_value:30,percent:25},{min_value:30,percent:0}]},
    {code:'FG_RECEITA',weight_percent:25,target_value:40},
    {code:'NPS',weight_percent:30,target_value:70}
  ];

  async function fetchCurrentProgram(cid){
    const rows=await api(`bonus_programs?company_id=eq.${cid}&status=eq.ATIVO&valid_to=is.null&select=*,bonus_criteria(*,bonus_criteria_rules(*))&order=created_at.desc&limit=1`).catch(()=>[]);
    return rows?.[0]||null;
  }

  function injectBonusCard(){
    const app=document.querySelector('#app');
    if(!app||!app.querySelector('.vx-admin-card'))return;
    let card=document.getElementById('vxBonusCard');
    if(!card){
      card=document.createElement('section');
      card.className='vx-admin-card';
      card.id='vxBonusCard';
      card.style.marginTop='12px';
      app.appendChild(card);
    }
    renderBonusCard(card);
  }

  async function renderBonusCard(card){
    const cid=companyId();
    card.innerHTML='<div class="vx-admin-title"><h3>BONIFICAÇÃO DOS TÉCNICOS</h3></div><p class="vx-sg-help">Carregando...</p>';
    currentProgram=cid?await fetchCurrentProgram(cid):null;
    card.innerHTML=`<div class="vx-admin-title"><h3>BONIFICAÇÃO DOS TÉCNICOS</h3></div>
      <p class="vx-sg-help">Motor configurável de produtividade + 4 critérios (Tempo/Eficiência, Qualidade/Reincidência, FG, NPS). Toda alteração cria uma nova versão -- resultados já calculados nunca mudam de regra sozinhos.</p>
      <div class="vx-sg-tabs">${[['programa','Programa Atual'],['simulador','Simulador'],['historico','Histórico']].map(([k,l])=>`<button type="button" class="vx-sg-tab${activeTab===k?' active':''}" data-bonus-tab="${k}">${l}</button>`).join('')}</div>
      <div id="vxBonusTabBody"></div>`;
    card.querySelectorAll('[data-bonus-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.bonusTab;renderBonusCard(card);});
    const body=card.querySelector('#vxBonusTabBody');
    if(activeTab==='programa')renderProgramaTab(body,cid);
    else if(activeTab==='simulador')renderSimuladorTab(body,cid);
    else renderHistoricoTab(body,cid);
  }

  function moneyOrDash(v){return v==null?'—':money(v);}

  function renderProgramaTab(body,cid){
    if(!currentProgram){
      body.innerHTML=`<p class="vx-sg-empty">Nenhum programa de bonificação configurado ainda.</p><button type="button" class="secondary" id="vxBonusNew">+ Criar programa de bonificação</button>`;
      body.querySelector('#vxBonusNew').onclick=()=>openProgramForm(cid,null);
      return;
    }
    const p=currentProgram;
    const criteria=[...(p.bonus_criteria||[])].sort((a,b)=>a.order_index-b.order_index);
    body.innerHTML=`
      <div class="vx-sg-row"><b>${E(p.name)}</b><span>${p.store_id?'Loja específica':'Empresa toda'} · vigência ${dateOnlySafe(p.period_start)} a ${dateOnlySafe(p.period_end)}</span></div>
      <div class="vx-bonus-params">
        <div><small>BASE (0%)</small><b>${p.base_daily_os} OS/dia</b></div>
        <div><small>TETO (100%)</small><b>${p.ceiling_daily_os} OS/dia</b></div>
        <div><small>VALOR POR PONTO</small><b>${money(p.value_per_point)}</b></div>
        <div><small>MÍNIMO</small><b>${money(p.min_bonus)}</b></div>
        <div><small>MÁXIMO</small><b>${money(p.max_bonus)}</b></div>
      </div>
      <table class="vx-grid-table" style="margin-top:10px"><thead><tr><th>CRITÉRIO</th><th>PESO</th><th>MÉTODO</th><th>FAIXAS / META</th></tr></thead><tbody>
        ${criteria.map(c=>`<tr><td>${E(c.label)}</td><td>${c.weight_percent}%</td><td>${c.calc_method==='FAIXAS'?'Faixas':'Proporcional até meta'}</td><td>${c.calc_method==='FAIXAS'?(c.bonus_criteria_rules||[]).sort((a,b)=>(a.order_index||0)-(b.order_index||0)).map(r=>`${r.min_value!=null?'>'+r.min_value:'≤0'}${r.max_value!=null?' até '+r.max_value:'+'} = ${r.percent}%`).join('; '):`meta = ${c.target_value}`}</td></tr>`).join('')}
      </tbody></table>
      <div style="margin-top:10px;display:flex;gap:8px"><button type="button" class="secondary" id="vxBonusEdit">Editar (nova versão)</button></div>`;
    body.querySelector('#vxBonusEdit').onclick=()=>openProgramForm(cid,p);
  }

  function dateOnlySafe(v){return v?String(v).slice(0,10).split('-').reverse().join('/'):'—';}

  function criteriaRowsHtml(code,rules){
    const rows=(rules&&rules.length?rules:[]).map((r,i)=>criteriaRuleRowHtml(code,r,i));
    return rows.join('');
  }
  function criteriaRuleRowHtml(code,r={},i){
    return `<div class="vx-bonus-rule-row" data-rule-row>
      <input type="number" step="0.01" placeholder="mín (aberto)" value="${r.min_value??''}" data-rule-min>
      <input type="number" step="0.01" placeholder="máx (aberto)" value="${r.max_value??''}" data-rule-max>
      <input type="number" step="0.01" placeholder="% atingido" value="${r.percent??''}" data-rule-percent required>
      <input type="text" placeholder="descrição (opcional)" value="${E(r.description||'')}" data-rule-desc>
      <button type="button" class="secondary" data-rule-remove>×</button>
    </div>`;
  }

  function openProgramForm(cid,existing){
    document.querySelector('#vxBonusModal')?.remove();
    const criteriaByCode=Object.fromEntries((existing?.bonus_criteria||[]).map(c=>[c.code,c]));
    const ov=document.createElement('div');ov.id='vxBonusModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal" style="max-width:760px">
      <div class="vx-admin-modal-head"><h3>${existing?'Nova versão do programa':'Novo programa de bonificação'}</h3><button type="button" data-close>×</button></div>
      <div class="vx-admin-modal-body">
        <form id="vxBonusForm" class="vx-admin-form">
          <label>NOME *</label><input name="name" required value="${existing?E(existing.name):'Bonificação Técnicos'}">
          <label>VIGÊNCIA (DE) *</label><input name="period_start" type="date" required value="${existing?dateInputVal(existing.period_start):''}">
          <label>VIGÊNCIA (ATÉ) *</label><input name="period_end" type="date" required value="${existing?dateInputVal(existing.period_end):''}">
          <div class="vx-admin-form-actions" style="grid-column:1/-1;margin:0"></div>
          <label>BASE -- OS/dia p/ bônus = R$0 *</label><input name="base_daily_os" type="number" step="0.01" required value="${existing?.base_daily_os??4}">
          <label>TETO -- OS/dia p/ bônus máximo *</label><input name="ceiling_daily_os" type="number" step="0.01" required value="${existing?.ceiling_daily_os??8}">
          <label>VALOR POR PONTO (R$) *</label><input name="value_per_point" type="number" step="0.01" required value="${existing?.value_per_point??750}">
          <label>BÔNUS MÍNIMO (R$)</label><input name="min_bonus" type="number" step="0.01" value="${existing?.min_bonus??0}">
          <label>BÔNUS MÁXIMO (R$) *</label><input name="max_bonus" type="number" step="0.01" required value="${existing?.max_bonus??3000}">
        </form>
        <div class="vx-bonus-criteria-editor">
          ${Object.entries(CRITERIA_META).map(([code,meta])=>{
            const c=criteriaByCode[code];
            const def=DEFAULT_CRITERIA.find(d=>d.code===code);
            const weight=c?c.weight_percent:def.weight_percent;
            return `<div class="vx-bonus-criteria-block" data-criteria-code="${code}">
              <div class="vx-bonus-criteria-head"><b>${meta.label}</b><span>${meta.help}</span></div>
              <label>PESO (%)</label><input type="number" step="0.01" min="0" max="100" value="${weight}" data-criteria-weight style="width:90px">
              ${meta.calc_method==='FAIXAS'
                ? `<div class="vx-bonus-rules" data-rules-list>${criteriaRowsHtml(code,c?(c.bonus_criteria_rules||[]).sort((a,b)=>(a.order_index||0)-(b.order_index||0)):def.rules)}</div>
                   <button type="button" class="secondary" data-rule-add>+ faixa</button>`
                : `<label>META (${meta.unit} p/ 100%)</label><input type="number" step="0.01" value="${c?c.target_value:def.target_value}" data-criteria-target style="width:110px">`
              }
            </div>`;
          }).join('')}
        </div>
        <div class="vx-sg-help" id="vxBonusWeightSum" style="margin-top:8px"></div>
        <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button type="button" class="primary" id="vxBonusSave">SALVAR NOVA VERSÃO</button></div>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.addEventListener('click',e=>{
      if(e.target.matches('[data-rule-add]')){
        const block=e.target.closest('[data-criteria-code]');
        block.querySelector('[data-rules-list]').insertAdjacentHTML('beforeend',criteriaRuleRowHtml(block.dataset.criteriaCode,{},0));
        updateWeightSum();
      }
      if(e.target.matches('[data-rule-remove]')){e.target.closest('[data-rule-row]').remove();}
    });
    ov.addEventListener('input',e=>{if(e.target.matches('[data-criteria-weight]'))updateWeightSum();});
    function updateWeightSum(){
      const sum=[...ov.querySelectorAll('[data-criteria-weight]')].reduce((s,el)=>s+(Number(el.value)||0),0);
      const box=ov.querySelector('#vxBonusWeightSum');
      box.textContent=`Soma dos pesos: ${sum}% ${sum===100?'✓':'-- precisa fechar em 100% pra salvar'}`;
      box.style.color=sum===100?'#0b6f3c':'#a35b00';
    }
    updateWeightSum();

    ov.querySelector('#vxBonusSave').onclick=async()=>{
      const btn=ov.querySelector('#vxBonusSave');btn.disabled=true;
      try{
        const f=new FormData(ov.querySelector('#vxBonusForm'));
        const criteria=[...ov.querySelectorAll('[data-criteria-code]')].map(block=>{
          const code=block.dataset.criteriaCode;
          const meta=CRITERIA_META[code];
          const weight_percent=Number(block.querySelector('[data-criteria-weight]').value||0);
          if(meta.calc_method==='FAIXAS'){
            const rules=[...block.querySelectorAll('[data-rule-row]')].map(row=>({
              min_value:row.querySelector('[data-rule-min]').value===''?null:Number(row.querySelector('[data-rule-min]').value),
              max_value:row.querySelector('[data-rule-max]').value===''?null:Number(row.querySelector('[data-rule-max]').value),
              percent:Number(row.querySelector('[data-rule-percent]').value||0),
              description:row.querySelector('[data-rule-desc]').value||null
            }));
            return {code,label:meta.label,calc_method:'FAIXAS',weight_percent,rules};
          }
          return {code,label:meta.label,calc_method:'LINEAR_ATE_META',weight_percent,target_value:Number(block.querySelector('[data-criteria-target]').value||0)};
        });
        await api('rpc/set_bonus_program',{method:'POST',body:JSON.stringify({
          p_company_id:cid,p_store_id:null,
          p_name:f.get('name'),
          p_period_start:f.get('period_start'),p_period_end:f.get('period_end'),
          p_base_daily_os:Number(f.get('base_daily_os')),p_ceiling_daily_os:Number(f.get('ceiling_daily_os')),
          p_value_per_point:Number(f.get('value_per_point')),p_min_bonus:Number(f.get('min_bonus')||0),p_max_bonus:Number(f.get('max_bonus')),
          p_criteria:criteria,
          p_reason:existing?'Nova versão via Configurações':null
        })});
        ov.remove();
        toast?.('Programa de bonificação salvo.');
        injectBonusCard();
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
  }
  function dateInputVal(v){return v?String(v).slice(0,10):'';}

  function renderSimuladorTab(body,cid){
    if(!currentProgram){body.innerHTML='<p class="vx-sg-empty">Configure um programa antes de simular.</p>';return;}
    body.innerHTML=`
      <div class="vx-form-3">
        <div class="vx-field"><label>MÉDIA DE OS ENCERRADAS/DIA</label><input type="number" step="0.01" id="vxSimAvg" placeholder="ex.: 6.4"></div>
      </div>
      <button type="button" class="secondary" id="vxSimPotential">Calcular potencial</button>
      <div id="vxSimPotentialResult" style="margin-top:10px"></div>
      <div class="vx-admin-title" style="margin-top:16px"><h3>INDICADORES DO TÉCNICO (opcional)</h3></div>
      <div class="vx-form-3">
        <div class="vx-field"><label>TEMPO MÉDIO (dias)</label><input type="number" step="0.01" id="vxSimTempo"></div>
        <div class="vx-field"><label>REINCIDÊNCIA (%)</label><input type="number" step="0.01" id="vxSimReinc"></div>
        <div class="vx-field"><label>TAXA FG (%)</label><input type="number" step="0.01" id="vxSimFg"></div>
        <div class="vx-field"><label>NPS (nota)</label><input type="number" step="0.01" id="vxSimNps"></div>
      </div>
      <button type="button" class="secondary" id="vxSimAchieved">Calcular bônus conquistado</button>
      <div id="vxSimAchievedResult" style="margin-top:10px"></div>`;
    function renderBreakdown(target,b){
      target.innerHTML=`<div class="vx-bonus-params"><div><small>POTENCIAL</small><b>${money(b.potential_bonus)}</b></div><div><small>TOTAL</small><b style="color:#078f46">${money(b.final_bonus)}</b></div></div>
        <table class="vx-grid-table" style="margin-top:8px"><thead><tr><th>CRITÉRIO</th><th>PESO</th><th>ATINGIDO</th><th>POTENCIAL DO CRITÉRIO</th><th>CONQUISTADO</th></tr></thead><tbody>
        ${b.criteria.map(c=>`<tr><td>${E(c.label)}</td><td>${c.weight_percent}%</td><td>${c.achieved_percent}%</td><td>${money(c.potential_share)}</td><td><b>${money(c.amount)}</b></td></tr>`).join('')}
        </tbody></table>`;
    }
    body.querySelector('#vxSimPotential').onclick=async()=>{
      const avg=Number(body.querySelector('#vxSimAvg').value||0);
      try{const b=await api('rpc/simulate_bonus',{method:'POST',body:JSON.stringify({p_program_id:currentProgram.id,p_avg_daily_os:avg})});renderBreakdown(body.querySelector('#vxSimPotentialResult'),b);}
      catch(err){toast?.('Não foi possível simular: '+err.message,'err');}
    };
    body.querySelector('#vxSimAchieved').onclick=async()=>{
      const avg=Number(body.querySelector('#vxSimAvg').value||0);
      const val=id=>{const v=body.querySelector(id).value;return v===''?null:Number(v);};
      try{
        const b=await api('rpc/simulate_bonus_raw',{method:'POST',body:JSON.stringify({
          p_program_id:currentProgram.id,p_avg_daily_os:avg,
          p_tempo_dias:val('#vxSimTempo'),p_reincidencia_pct:val('#vxSimReinc'),p_fg_pct:val('#vxSimFg'),p_nps_score:val('#vxSimNps')
        })});
        renderBreakdown(body.querySelector('#vxSimAchievedResult'),b);
      }catch(err){toast?.('Não foi possível simular: '+err.message,'err');}
    };
  }

  async function renderHistoricoTab(body,cid){
    body.innerHTML='<p class="vx-sg-help">Carregando histórico...</p>';
    const [programs,techs]=await Promise.all([
      api(`bonus_programs?company_id=eq.${cid}&select=id,name,status,period_start,period_end,valid_from,valid_to,reason&order=valid_from.desc`).catch(()=>[]),
      api('profiles?role=eq.TECNICO&active=eq.true&select=id,full_name&order=full_name').catch(()=>[])
    ]);
    body.innerHTML=`
      <div class="vx-admin-title"><h3>CALCULAR / CONSULTAR RESULTADO</h3></div>
      <div class="vx-form-3">
        <div class="vx-field"><label>TÉCNICO</label><select id="vxHistTech"><option value="">Selecione</option>${techs.map(t=>`<option value="${t.id}">${E(t.full_name)}</option>`).join('')}</select></div>
        <div class="vx-field"><label>PERÍODO (DE)</label><input type="date" id="vxHistFrom" value="${currentProgram?dateInputVal(currentProgram.period_start):''}"></div>
        <div class="vx-field"><label>PERÍODO (ATÉ)</label><input type="date" id="vxHistTo" value="${currentProgram?dateInputVal(currentProgram.period_end):''}"></div>
      </div>
      <button type="button" class="secondary" id="vxHistCalc" ${currentProgram?'':'disabled'}>Calcular bonificação real</button>
      <div id="vxHistResult" style="margin-top:10px"></div>
      <div class="vx-admin-title" style="margin-top:16px"><h3>VERSÕES DO PROGRAMA</h3></div>
      <div class="vx-sg-list">${programs.length?programs.map(p=>`<div class="vx-sg-row${p.status==='ATIVO'?'':' inactive'}"><b>${E(p.name)}</b><span>${p.status} · ${dateOnlySafe(p.period_start)} a ${dateOnlySafe(p.period_end)}${p.reason?' · '+E(p.reason):''}</span></div>`).join(''):'<p class="vx-sg-empty">Nenhuma versão ainda.</p>'}</div>
      <div class="vx-admin-title" style="margin-top:16px"><h3>RESULTADOS CALCULADOS</h3></div>
      <div id="vxBonusResultsList" class="vx-sg-list"><p class="vx-sg-empty">Selecione um técnico e período acima, ou calcule um novo resultado.</p></div>`;

    body.querySelector('#vxHistCalc')?.addEventListener('click',async()=>{
      const techId=body.querySelector('#vxHistTech').value;
      const from=body.querySelector('#vxHistFrom').value,to=body.querySelector('#vxHistTo').value;
      if(!techId||!from||!to)return toast?.('Selecione técnico e período.','err');
      const btn=body.querySelector('#vxHistCalc');btn.disabled=true;
      try{
        const r=await api('rpc/calculate_bonus_result',{method:'POST',body:JSON.stringify({p_program_id:currentProgram.id,p_technician_id:techId,p_period_start:from,p_period_end:to})});
        toast?.('Bonificação calculada.');
        await loadResults(body,techId,from,to);
        body.querySelector('#vxHistResult').innerHTML=`<p class="vx-sg-help">Última: ${money(r.final_bonus)} (potencial ${money(r.potential_bonus)}, média ${r.avg_daily_closed_os} OS/dia)</p>`;
      }catch(err){toast?.('Não foi possível calcular: '+err.message,'err');}
      btn.disabled=false;
    });
    body.querySelector('#vxHistTech')?.addEventListener('change',()=>{
      const techId=body.querySelector('#vxHistTech').value;
      if(techId)loadResults(body,techId,body.querySelector('#vxHistFrom').value,body.querySelector('#vxHistTo').value);
    });
  }

  async function loadResults(body,techId,from,to){
    const list=body.querySelector('#vxBonusResultsList');
    if(!list)return;
    let q=`bonus_results?technician_id=eq.${techId}&order=period_start.desc&select=*`;
    if(from)q+=`&period_start=gte.${from}`;
    if(to)q+=`&period_end=lte.${to}`;
    const rows=await api(q).catch(()=>[]);
    list.innerHTML=rows.length?rows.map(r=>`<div class="vx-sg-row"><b>${dateOnlySafe(r.period_start)} a ${dateOnlySafe(r.period_end)}</b><span>${r.status} · ${money(r.final_bonus)} de ${money(r.potential_bonus)} potencial</span>${r.status==='PROVISORIO'&&isGestor()?`<div class="vx-sg-row-actions"><button type="button" data-close-result="${r.id}">Fechar folha</button></div>`:''}</div>`).join(''):'<p class="vx-sg-empty">Nenhum resultado pra esse técnico/período.</p>';
    list.querySelectorAll('[data-close-result]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Fechar esta folha? Depois de fechada não pode ser recalculada.'))return;
      b.disabled=true;
      try{await api('rpc/close_bonus_result',{method:'POST',body:JSON.stringify({p_result_id:b.dataset.closeResult})});toast?.('Folha fechada.');await loadResults(body,techId,from,to);}
      catch(err){toast?.('Não foi possível fechar: '+err.message,'err');b.disabled=false;}
    });
  }

  const style=document.createElement('style');
  style.textContent=`
  .vx-sg-tabs{display:flex;gap:6px;margin:10px 0;flex-wrap:wrap}
  .vx-sg-tab{border:1px solid #cfd9e3;background:#fff;border-radius:6px;padding:6px 12px;font-size:10.5px;font-weight:700;color:#496175;cursor:pointer}
  .vx-sg-tab.active{background:#0d2536;color:#fff;border-color:#0d2536}
  .vx-bonus-params{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-top:8px}
  .vx-bonus-params div{border:1px solid #dbe4ec;border-radius:8px;padding:8px 10px}
  .vx-bonus-params small{display:block;color:#708296;font-size:8.5px;text-transform:uppercase;margin-bottom:3px}
  .vx-bonus-criteria-editor{display:grid;gap:12px;margin-top:14px}
  .vx-bonus-criteria-block{border:1px solid #dbe4ec;border-radius:8px;padding:10px}
  .vx-bonus-criteria-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:10px;color:#708296}
  .vx-bonus-rules{display:grid;gap:6px;margin:8px 0}
  .vx-bonus-rule-row{display:grid;grid-template-columns:1fr 1fr 1fr 2fr auto;gap:6px}
  .vx-bonus-rule-row input{height:30px;border:1px solid #cfd9e3;border-radius:6px;padding:0 6px;font-size:10px}
  @media(max-width:760px){.vx-bonus-rule-row{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(style);

  const base=window.renderFinanceiroSettings;
  if(typeof base==='function')window.renderFinanceiroSettings=async function(){const r=await base.apply(this,arguments);injectBonusCard();return r;};
})();
