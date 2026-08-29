/* VoxAssist Web V0.8.12 — DASH MESTRE V1 */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const M=window.money||((v)=>'R$ '+Number(v||0).toFixed(2));
  const D=window.dt||((v)=>v||'—');
  const norm=s=>String(s||'').toUpperCase().replaceAll('_',' ');
  const now=()=>new Date();
  const days=(a,b=new Date())=>(b-new Date(a))/86400000;
  const isOpen=o=>o.status!=='FINALIZADA';
  const role=()=>String(state?.profile?.role||'GESTOR').toUpperCase();
  const me=()=>state?.profile?.id;

  function visibleOrders(rows){
    const r=role(),id=me();
    if(r==='TECNICO')return rows.filter(o=>o.technician_id===id);
    if(r==='ATENDENTE')return rows.filter(o=>o.attendant_id===id||!o.attendant_id);
    return rows;
  }
  function card(title,value,sub='',tone=''){
    return `<div class="vx-dash-card ${tone}"><span>${E(title)}</span><b>${E(value)}</b>${sub?`<small>${sub}</small>`:''}</div>`;
  }
  function listEmpty(text){return `<div class="vx-dash-empty">${E(text)}</div>`;}
  function osLink(o,label){return `<button class="vx-dash-link" onclick="render('os:${o.id}')">${E(label||o.os_number)}</button>`;}
  function css(){
    if(document.querySelector('#vxDashMasterStyle'))return;
    const s=document.createElement('style');s.id='vxDashMasterStyle';s.textContent=`
    .vx-dash{display:grid;gap:14px}.vx-dash-head{display:flex;justify-content:space-between;gap:12px;align-items:end;flex-wrap:wrap}.vx-dash-head h2{margin:0;color:#16324d}.vx-dash-head small{color:#6f8193}.vx-dash-filters{display:flex;gap:8px;flex-wrap:wrap}.vx-dash-filters select{height:34px;border:1px solid #cbd6e0;background:#fff;padding:0 10px;border-radius:5px;color:#334b61}.vx-dash-metrics{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px}.vx-dash-card{background:#fff;border:1px solid #dce4eb;border-radius:8px;padding:14px;min-height:82px;box-shadow:0 1px 3px rgba(15,43,70,.04)}.vx-dash-card span{display:block;font-size:11px;font-weight:700;color:#6b7e90;text-transform:uppercase}.vx-dash-card b{display:block;font-size:26px;color:#173450;margin-top:4px}.vx-dash-card small{display:block;margin-top:4px;color:#75879a}.vx-dash-card.warn{border-left:4px solid #d89b2b}.vx-dash-card.danger{border-left:4px solid #c94c4c}.vx-dash-card.ok{border-left:4px solid #3d9466}.vx-dash-grid{display:grid;grid-template-columns:1.25fr .95fr;gap:12px}.vx-dash-box{background:#fff;border:1px solid #dce4eb;border-radius:8px;padding:13px}.vx-dash-box h3{font-size:13px;margin:0 0 10px;color:#173450}.vx-dash-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid #eef2f5}.vx-dash-row:first-of-type{border-top:0}.vx-dash-row strong{font-size:12px;color:#253f58}.vx-dash-row small{display:block;color:#718497;margin-top:2px}.vx-dash-badge{font-size:10px;font-weight:700;border:1px solid #cbd6e0;padding:3px 7px;border-radius:10px;color:#52697f;background:#f6f8fa;white-space:nowrap}.vx-dash-badge.red{color:#9a3030;border-color:#e2b4b4;background:#fff3f3}.vx-dash-badge.orange{color:#87530a;border-color:#e5c695;background:#fff8ec}.vx-dash-link{border:0;background:none;color:#145e9b;font-weight:700;cursor:pointer;padding:0}.vx-dash-empty{padding:16px 4px;color:#8796a5;font-size:12px}.vx-dash-table{width:100%;border-collapse:collapse}.vx-dash-table th,.vx-dash-table td{padding:8px 7px;border-top:1px solid #edf1f4;text-align:left;font-size:11px}.vx-dash-table th{color:#6d7e8e;font-size:10px}.vx-dash-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.vx-dash-section-title span{font-size:10px;color:#81909e}.vx-dash-exceptions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.vx-dash-ex{border:1px solid #e1e7ed;border-radius:6px;padding:10px}.vx-dash-ex b{font-size:18px;color:#233f59}.vx-dash-ex small{display:block;color:#75879a;margin-top:3px}@media(max-width:1000px){.vx-dash-metrics{grid-template-columns:repeat(2,1fr)}.vx-dash-grid{grid-template-columns:1fr}.vx-dash-exceptions{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  window.vxDashboardFilter='TODOS';
  window.vxSetDashboardFilter=function(v){window.vxDashboardFilter=v;renderDashboard();};

  window.renderDashboard=async function(){
    css();
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML='<div class="card">Carregando Central Diária...</div>';
    try{
      const [ordersAll,tasks,cases,appointments,partsReq,profiles,fin,parts]=await Promise.all([
        api('service_orders?select=*,clients(name),equipments(product_type,brand,model),profiles!service_orders_technician_id_fkey(full_name)&order=opened_at.desc&limit=300').catch(()=>state.orders||[]),
        api('tasks?select=*&order=due_at.asc.nullslast&limit=100').catch(()=>[]),
        api('dashboard_cases?select=*&order=created_at.desc&limit=100').catch(()=>[]),
        api('appointments?select=*&order=appointment_date.asc,start_time.asc&limit=100').catch(()=>[]),
        api('parts_requests?select=*&order=created_at.desc&limit=100').catch(()=>[]),
        api('profiles?select=id,full_name,role,active&order=full_name').catch(()=>[]),
        api('os_financial?select=*&limit=300').catch(()=>[]),
        api('os_parts?select=*&limit=500').catch(()=>[])
      ]);
      let orders=visibleOrders(ordersAll||[]);
      const f=window.vxDashboardFilter||'TODOS';
      if(f!=='TODOS')orders=orders.filter(o=>o.status===f);
      const open=orders.filter(isOpen),count=s=>orders.filter(o=>o.status===s).length;
      const overdueAnalysis=open.filter(o=>o.status==='AGUARDANDO ANALISE'&&days(o.opened_at)>2);
      const overdueApproval=open.filter(o=>o.status==='AGUARDANDO APROVACAO'&&days(o.updated_at||o.opened_at)>2);
      const overdueRepair=open.filter(o=>['AGUARDANDO CONSERTO','EM CONSERTO'].includes(o.status)&&days(o.updated_at||o.opened_at)>4);
      const urgent=open.filter(o=>norm(o.priority).includes('URG'));
      const noTech=open.filter(o=>!o.technician_id);
      const ready=open.filter(o=>o.status==='PRONTO PARA ENTREGA');
      const approval=open.filter(o=>o.status==='AGUARDANDO APROVACAO');
      const rejected=orders.filter(o=>o.approval_decision==='RECUSADO'||o.status==='ORCAMENTO RECUSADO');
      const today=new Date().toISOString().slice(0,10);
      const myTasks=(tasks||[]).filter(t=>role()==='GESTOR'||!t.assigned_to||t.assigned_to===me()).filter(t=>!['CONCLUIDO','CANCELADO'].includes(norm(t.status).replaceAll(' ','_')));
      const activeCases=(cases||[]).filter(c=>role()==='GESTOR'||!c.assigned_to||c.assigned_to===me()).filter(c=>!['RESOLVIDO','CANCELADO'].includes(norm(c.status).replaceAll(' ','_'))).filter(c=>!c.scheduled_for||c.scheduled_for<=today);
      const todayApps=(appointments||[]).filter(a=>a.appointment_date===today).filter(a=>role()!=='TECNICO'||a.technician_id===me());
      const pendingParts=(partsReq||[]).filter(p=>!['RECEBIDO','CANCELADO'].includes(norm(p.status).replaceAll(' ','_')));
      const financeByOs=new Map((fin||[]).map(x=>[x.service_order_id,x]));
      const partsByOs=new Map();(parts||[]).forEach(p=>partsByOs.set(p.service_order_id,(partsByOs.get(p.service_order_id)||0)+Number(p.quantity||0)*Number(p.unit_value||0)));
      const budgetTotal=o=>{const x=financeByOs.get(o.id)||{};return (partsByOs.get(o.id)||0)+Number(x.labor_value||0)+Number(x.freight_value||0)+Number(x.auxiliary_material_value||0)+Number(x.technical_report_value||0)-Number(x.discount_value||0)};
      const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0);
      const monthOrders=orders.filter(o=>new Date(o.opened_at)>=monthStart);
      const monthBudget=orders.filter(o=>financeByOs.has(o.id)&&new Date(financeByOs.get(o.id).updated_at||o.updated_at||o.opened_at)>=monthStart).reduce((s,o)=>s+budgetTotal(o),0);
      const readyMonth=orders.filter(o=>o.ready_at&&new Date(o.ready_at)>=monthStart);
      const deliveredMonth=orders.filter(o=>o.delivery_at&&new Date(o.delivery_at)>=monthStart);
      const roleLabel={GESTOR:'Visão Geral da Operação',ATENDENTE:'Minha Central de Atendimento',TECNICO:'Minha Central Técnica'}[role()]||'Central Diária';

      app.innerHTML=`<div class="vx-dash">
        <div class="vx-dash-head"><div><h2>${E(roleLabel)}</h2><small>Indicadores rastreáveis • dados de homologação</small></div><div class="vx-dash-filters"><select onchange="vxSetDashboardFilter(this.value)"><option value="TODOS" ${f==='TODOS'?'selected':''}>Todas as situações</option><option value="AGUARDANDO ANALISE" ${f==='AGUARDANDO ANALISE'?'selected':''}>Aguardando Análise</option><option value="AGUARDANDO APROVACAO" ${f==='AGUARDANDO APROVACAO'?'selected':''}>Aguardando Aprovação</option><option value="AGUARDANDO CONSERTO" ${f==='AGUARDANDO CONSERTO'?'selected':''}>Aguardando Conserto</option><option value="EM CONSERTO" ${f==='EM CONSERTO'?'selected':''}>Em Conserto</option><option value="PRONTO PARA ENTREGA" ${f==='PRONTO PARA ENTREGA'?'selected':''}>Pronto para Entrega</option></select></div></div>
        <div class="vx-dash-metrics">${card('OS Ativas',open.length,'Total conciliado com a base')}${card('Aguardando Análise',count('AGUARDANDO ANALISE'),overdueAnalysis.length+' acima do prazo',overdueAnalysis.length?'warn':'')}${card('Aguardando Aprovação',count('AGUARDANDO APROVACAO'),approval.length+' aguardando cliente')}${card('Prontas para Entrega',count('PRONTO PARA ENTREGA'),ready.length+' oportunidades de retirada','ok')}</div>
        <div class="vx-dash-box"><div class="vx-dash-section-title"><h3>GESTÃO POR EXCEÇÃO</h3><span>o que exige atenção agora</span></div><div class="vx-dash-exceptions"><div class="vx-dash-ex"><b>${overdueAnalysis.length+overdueApproval.length+overdueRepair.length}</b><small>OS acima do prazo</small></div><div class="vx-dash-ex"><b>${urgent.length}</b><small>OS urgentes</small></div><div class="vx-dash-ex"><b>${noTech.length}</b><small>OS sem técnico definido</small></div></div></div>
        <div class="vx-dash-grid">
          <div class="vx-dash-box"><div class="vx-dash-section-title"><h3>OPORTUNIDADES DO DIA</h3><span>${ready.length+approval.length} identificadas</span></div>${[...ready.slice(0,4).map(o=>`<div class="vx-dash-row"><div><strong>${osLink(o)} • aparelho pronto</strong><small>${E(o.clients?.name||'Cliente')} • disponível para retirada</small></div><span class="vx-dash-badge orange">RETIRADA</span></div>`),...approval.slice(0,4).map(o=>`<div class="vx-dash-row"><div><strong>${osLink(o)} • orçamento aguardando resposta</strong><small>${E(o.clients?.name||'Cliente')} • ${M(budgetTotal(o))}</small></div><span class="vx-dash-badge">CONTATO</span></div>`)].join('')||listEmpty('Nenhuma oportunidade identificada neste momento.')}</div>
          <div class="vx-dash-box"><div class="vx-dash-section-title"><h3>CASOS DE ATENÇÃO</h3><span>${activeCases.length} ativos</span></div>${activeCases.slice(0,6).map(c=>{const o=ordersAll.find(x=>x.id===c.service_order_id);return `<div class="vx-dash-row"><div><strong>${E(c.title)}</strong><small>${o?E(o.os_number)+' • ':''}${E(c.message||'')}</small></div><span class="vx-dash-badge ${norm(c.priority).includes('ALTA')?'red':''}">${E(c.priority)}</span></div>`}).join('')||listEmpty('Nenhum caso de atenção ativo.')}</div>
        </div>
        <div class="vx-dash-grid">
          <div class="vx-dash-box"><div class="vx-dash-section-title"><h3>TAREFAS / ATIVIDADES</h3><span>${myTasks.length} pendentes</span></div>${myTasks.slice(0,7).map(t=>{const o=ordersAll.find(x=>x.id===t.service_order_id);return `<div class="vx-dash-row"><div><strong>${E(t.title)}</strong><small>${o?E(o.os_number)+' • ':''}${E(t.description||'')}</small></div><span class="vx-dash-badge ${norm(t.priority).includes('ALTA')?'red':''}">${t.due_at?new Date(t.due_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'SEM PRAZO'}</span></div>`}).join('')||listEmpty('Nenhuma tarefa pendente.')}</div>
          <div class="vx-dash-box"><div class="vx-dash-section-title"><h3>AGENDA DE HOJE</h3><span>${todayApps.length} compromissos</span></div>${todayApps.slice(0,7).map(a=>{const o=ordersAll.find(x=>x.id===a.service_order_id);return `<div class="vx-dash-row"><div><strong>${o?osLink(o):'Compromisso'}</strong><small>${E(a.important_alert||a.period||'')}</small></div><span class="vx-dash-badge">${E((a.start_time||'').slice(0,5)||a.period)}</span></div>`}).join('')||listEmpty('Nenhum atendimento externo agendado para hoje.')}</div>
        </div>
        <div class="vx-dash-grid">
          <div class="vx-dash-box"><div class="vx-dash-section-title"><h3>PEDIDOS DE PEÇAS</h3><span>${pendingParts.length} em andamento</span></div>${pendingParts.slice(0,7).map(p=>{const o=ordersAll.find(x=>x.id===p.service_order_id);const late=p.expected_date&&p.expected_date<today;return `<div class="vx-dash-row"><div><strong>${o?osLink(o):'OS'} • ${E(p.description)}</strong><small>${E(p.supplier||'Fornecedor não informado')} ${p.order_number?'• '+E(p.order_number):''}</small></div><span class="vx-dash-badge ${late?'red':''}">${late?'ATRASADO':E(p.status)}</span></div>`}).join('')||listEmpty('Nenhum pedido de peça em andamento.')}</div>
          <div class="vx-dash-box"><div class="vx-dash-section-title"><h3>PRODUTIVIDADE • MÊS</h3><span>${E(role())}</span></div><table class="vx-dash-table"><tr><th>Indicador</th><th>Qtd.</th><th>Valor</th></tr><tr><td>OS abertas</td><td>${monthOrders.length}</td><td>—</td></tr><tr><td>Orçamentos</td><td>${orders.filter(o=>financeByOs.has(o.id)).length}</td><td>${M(monthBudget)}</td></tr><tr><td>Prontos</td><td>${readyMonth.length}</td><td>${M(readyMonth.reduce((s,o)=>s+budgetTotal(o),0))}</td></tr><tr><td>Entregues</td><td>${deliveredMonth.length}</td><td>${M(deliveredMonth.reduce((s,o)=>s+budgetTotal(o),0))}</td></tr><tr><td>Orçamentos recusados</td><td>${rejected.length}</td><td>${M(rejected.reduce((s,o)=>s+budgetTotal(o),0))}</td></tr></table></div>
        </div>
        ${role()==='GESTOR'?`<div class="vx-dash-box"><div class="vx-dash-section-title"><h3>EQUIPE / VISÃO POR USUÁRIO</h3><span>${profiles.filter(p=>p.active!==false).length} ativos</span></div><table class="vx-dash-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>OS vinculadas</th><th>Prontos</th></tr></thead><tbody>${profiles.filter(p=>p.active!==false).map(p=>`<tr><td>${E(p.full_name)}</td><td>${E(p.role)}</td><td>${ordersAll.filter(o=>o.technician_id===p.id||o.attendant_id===p.id).length}</td><td>${ordersAll.filter(o=>o.technician_id===p.id&&o.status==='PRONTO PARA ENTREGA').length}</td></tr>`).join('')||'<tr><td colspan="4">Sem usuários.</td></tr>'}</tbody></table></div>`:''}
      </div>`;
    }catch(err){app.innerHTML=`<div class="card error-card"><h3>Falha ao carregar Dash Mestre</h3><p>${E(err.message)}</p></div>`;}
  };
})();