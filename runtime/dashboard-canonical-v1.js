/* VoxAssist — Dashboard Canônico V1
 * Fonte única do Dashboard. Não altera login, shell, abas, OS ou demais módulos.
 * Sem MutationObserver, sem sobrescritas encadeadas, sem números fictícios.
 */
(function(){
  'use strict';
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const M=v=>typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const role=()=>norm(state?.profile?.role||'GESTOR');
  const me=()=>state?.profile?.id;
  const age=o=>Math.max(0,Math.floor((Date.now()-new Date(o.updated_at||o.opened_at||Date.now()).getTime())/86400000));
  const isOpen=o=>!['FINALIZADA','CANCELADA'].includes(norm(o.status));
  const safe=x=>Array.isArray(x)?x:[];
  const scope=rows=>role()==='TECNICO'?rows.filter(o=>o.technician_id===me()):role()==='ATENDENTE'?rows.filter(o=>o.attendant_id===me()||!o.attendant_id):rows;
  const budget=f=>Math.max(0,Number(f?.labor_value||0)+Number(f?.freight_value||0)+Number(f?.auxiliary_material_value||0)+Number(f?.technical_report_value||0)-Number(f?.discount_value||0));
  const startMonth=()=>new Date(new Date().getFullYear(),new Date().getMonth(),1);
  const withTimeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,rej)=>setTimeout(()=>rej(new Error(label+' excedeu '+ms+'ms')),ms))]);
  const inferGroup=t=>{t=norm(t);if(t.includes('TV'))return 'TV';if(/REFRIG|FREEZER|AR-COND|GELADEIRA/.test(t))return 'REFRIGERAÇÃO';if(/MICRO|FOG|LAVA|BEBED/.test(t))return 'LINHA BRANCA';if(/AUDIO|ÁUDIO|SOM|RADIO|RÁDIO/.test(t))return 'ÁUDIO';return t?'GERAL':''};
  const startOf=p=>{const n=new Date();n.setHours(0,0,0,0);if(p==='dia')return n;if(p==='semana'){const d=new Date(n),offset=(d.getDay()+6)%7;d.setDate(d.getDate()-offset);return d}return new Date(n.getFullYear(),n.getMonth(),1)};
  const dateVal=(o,keys)=>{for(const k of keys){if(o&&o[k]){const d=new Date(o[k]);if(!Number.isNaN(d.getTime()))return d}}return null};

  async function source(label,path,fallback=[]){
    try{return {label,ok:true,data:await withTimeout(api(path),7000,label)}}catch(error){return {label,ok:false,data:fallback,error}}
  }

  function modal(title,rows){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>O.S.</th><th>Cliente</th><th>Equipamento</th><th>Situação</th><th>Dias</th></tr></thead><tbody>${rows.map(o=>`<tr data-os="${E(o.id)}"><td><b>${E(o.os_number||'—')}</b></td><td>${E(o.clients?.name||'—')}</td><td>${E([o.equipments?.product_type,o.equipments?.brand,o.equipments?.model].filter(Boolean).join(' • ')||'—')}</td><td>${E(norm(o.status)||'—')}</td><td>${age(o)}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
    bg.querySelectorAll('[data-os]').forEach(tr=>tr.onclick=()=>{const id=tr.dataset.os;bg.remove();if(typeof window.render==='function')window.render('os:'+id);else if(typeof render==='function')render('os:'+id);});
  }

  function card(title,value,sub='',tone='',key=''){return `<button type="button" class="vx-c-kpi ${tone}" data-drill="${key}"><span>${E(title)}</span><b>${E(value)}</b><small>${E(sub)}</small></button>`}
  function item(title,sub,badge=''){return `<div class="vx-c-row"><div><strong>${E(title)}</strong><small>${E(sub)}</small></div>${badge?`<span>${E(badge)}</span>`:''}</div>`}
  function orderValue(o,finMap){const direct=Number(o.total_amount||o.budget_total||o.valor_total||o.total||o.amount||0);if(direct)return direct;return budget(finMap.get(String(o.id)))}
  function prodSubBlock(kind,title,stores,techs,groups){
    return `<div class="vx-c-prod-sub" data-kind="${kind}"><div class="vx-c-prod-sub-head"><strong>${E(title)}</strong><div class="vx-c-prod-period"><button type="button" data-period="mes" class="active">MÊS</button><button type="button" data-period="semana">SEMANA</button><button type="button" data-period="dia">DIA</button></div></div><div class="vx-c-prod-metrics"><div><span>APARELHOS</span><b data-count>0</b></div><div><span>VALOR</span><b data-value>R$ 0,00</b></div></div><div class="vx-c-prod-filters"><label>LOJA<select data-filter="store"><option value="">TODAS</option>${stores.map(s=>`<option value="${E(s.id)}">${E(s.name)}</option>`).join('')}</select></label><label>GRUPO<select data-filter="group"><option value="">TODOS</option>${groups.map(g=>`<option value="${E(g)}">${E(g)}</option>`).join('')}</select></label><label>TÉCNICO<select data-filter="tech"><option value="">TODOS</option>${techs.map(t=>`<option value="${E(t.id)}">${E(t.full_name)}</option>`).join('')}</select></label></div></div>`;
  }
  function prodRecalc(sec,orders,finMap){
    const from=startOf(sec.querySelector('.vx-c-prod-period .active')?.dataset.period||'mes');
    const store=sec.querySelector('[data-filter="store"]')?.value||'',group=sec.querySelector('[data-filter="group"]')?.value||'',tech=sec.querySelector('[data-filter="tech"]')?.value||'';
    const isReady=sec.dataset.kind==='ready';
    const rows=orders.filter(o=>{
      const d=isReady?dateVal(o,['ready_at','completed_at','pronto_at']):dateVal(o,['delivery_at','delivered_at','saida_at','closed_at']);
      if(!d||d<from)return false;
      if(store&&String(o.store_id||'')!==store)return false;
      if(group&&String(o.__group||'')!==group)return false;
      if(tech&&String(o.technician_id||'')!==tech)return false;
      return true;
    });
    sec.querySelector('[data-count]').textContent=rows.length;
    sec.querySelector('[data-value]').textContent=M(rows.reduce((s,o)=>s+orderValue(o,finMap),0));
  }
  function discovery(){
    const pool=[
      ['Gestão','Nem todo atraso é um problema isolado; repetição costuma indicar gargalo de processo.','Observe onde a fila cresce por vários dias. O ponto de acúmulo merece investigação antes de cobrar velocidade das pessoas.'],
      ['Prioridade','Urgência sem critério transforma tudo em urgente.','Defina prioridade pelo impacto no cliente, prazo e risco operacional. Isso reduz decisões por impulso.'],
      ['Qualidade','Um indicador útil deve levar a uma ação possível.','Se um número não permite identificar causa, responsável ou próximo passo, ele é apenas informação — não inteligência de gestão.'],
      ['Segurança','A melhor permissão é a menor necessária para realizar o trabalho.','Privilégio mínimo reduz impacto de erro humano, credencial comprometida e acesso indevido.'],
      ['Produtividade','Mais atividade não significa mais resultado.','Compare volume concluído, tempo de ciclo, retorno do cliente e retrabalho para distinguir esforço de produtividade real.']
    ];
    const d=pool[Math.floor(Date.now()/86400000)%pool.length];
    return `<div class="vx-c-discovery"><div><strong>💡 DESCOBERTA DO DIA · ${E(d[0])}</strong><p>${E(d[1])}</p></div><details><summary>Quero saber mais</summary><p>${E(d[2])}</p><small>Conteúdo local. Não consulta nem envia dados operacionais.</small></details></div>`;
  }

  window.renderDashboard=async function(){
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML='<div class="card">Carregando inteligência operacional...</div>';
    const results=await Promise.all([
      source('Ordens','service_orders?select=*,clients(name),equipments(product_type,brand,model),profiles!service_orders_technician_id_fkey(full_name)&order=opened_at.desc&limit=500',state?.orders||[]),
      source('Tarefas','tasks?select=*&order=due_at.asc.nullslast&limit=200',state?.tasks||[]),
      source('Casos de atenção','dashboard_cases?select=*&order=created_at.desc&limit=200',[]),
      source('Agenda','appointments?select=*&order=appointment_date.asc,start_time.asc&limit=200',[]),
      source('Peças','parts_requests?select=*&order=created_at.desc&limit=200',[]),
      source('Financeiro','os_financial?select=*&limit=1000',[]),
      source('Pagamentos','payments?select=*&order=paid_at.desc.nullslast&limit=1500',[]),
      source('Lojas','stores?select=id,name&active=eq.true&order=name',[]),
      source('Técnicos','profiles?select=id,full_name,role&active=eq.true&order=full_name',[])
    ]);
    const by=Object.fromEntries(results.map(r=>[r.label,r]));
    const orders=scope(safe(by['Ordens'].data)), active=orders.filter(isOpen);
    const analysis=active.filter(o=>norm(o.status)==='AGUARDANDO ANALISE');
    const approval=active.filter(o=>norm(o.status)==='AGUARDANDO APROVACAO');
    const repair=active.filter(o=>['AGUARDANDO CONSERTO','EM CONSERTO'].includes(norm(o.status)));
    const ready=active.filter(o=>norm(o.status)==='PRONTO PARA ENTREGA');
    const overdueAnalysis=analysis.filter(o=>age(o)>3), overdueApproval=approval.filter(o=>age(o)>2), overdueRepair=repair.filter(o=>age(o)>7);
    const noTech=active.filter(o=>!o.technician_id), urgent=active.filter(o=>norm(o.priority).includes('URG'));
    const tasks=safe(by['Tarefas'].data).filter(t=>!['CONCLUIDO','CANCELADO'].includes(norm(t.status)));
    const cases=safe(by['Casos de atenção'].data).filter(c=>!['RESOLVIDO','CANCELADO'].includes(norm(c.status)));
    const today=new Date().toISOString().slice(0,10), apps=safe(by['Agenda'].data).filter(a=>a.appointment_date===today);
    const parts=safe(by['Peças'].data).filter(p=>!['RECEBIDO','CANCELADO'].includes(norm(p.status)));
    const finMap=new Map(safe(by['Financeiro'].data).map(f=>[String(f.service_order_id),f]));
    const validPayments=safe(by['Pagamentos'].data).filter(p=>p.paid_at&&!['CANCELADO','CANCELADA','ESTORNADO','ESTORNADA'].includes(norm(p.status)));
    const day0=new Date();day0.setHours(0,0,0,0);const month0=startMonth();
    const receivedToday=validPayments.filter(p=>new Date(p.paid_at)>=day0).reduce((s,p)=>s+Number(p.amount||0),0);
    const receivedMonth=validPayments.filter(p=>new Date(p.paid_at)>=month0).reduce((s,p)=>s+Number(p.amount||0),0);
    const readyValue=ready.reduce((s,o)=>s+budget(finMap.get(String(o.id))),0);
    const failures=results.filter(r=>!r.ok).map(r=>r.label);
    const drills={active,analysis,approval,repair,ready,overdue:[...overdueAnalysis,...overdueApproval,...overdueRepair],noTech,urgent};
    const stores=safe(by['Lojas'].data);
    const techs=safe(by['Técnicos'].data).filter(t=>norm(t.role)==='TECNICO');
    const prodOrders=orders.map(o=>({...o,__group:inferGroup(o.equipments?.product_type)}));
    const groups=[...new Set(prodOrders.map(o=>o.__group).filter(Boolean))].sort();

    app.innerHTML=`<div class="vx-canonical">
      ${failures.length?`<div class="vx-c-warning"><strong>Dados parciais:</strong> ${E(failures.join(', '))} não responderam. O Dashboard continuou com as demais fontes.</div>`:''}
      <div class="vx-c-head"><div><h2>${role()==='GESTOR'?'Visão Geral da Operação':role()==='TECNICO'?'Minha Central Técnica':'Minha Central de Atendimento'}</h2><p>Indicadores rastreáveis, sem valores demonstrativos.</p></div><span>${new Date().toLocaleDateString('pt-BR')}</span></div>
      <div class="vx-c-kpis">${card('OS Ativas',active.length,'em andamento','', 'active')}${card('Aguardando Análise',analysis.length,overdueAnalysis.length+' acima de 3 dias',overdueAnalysis.length?'warn':'','analysis')}${card('Aguardando Aprovação',approval.length,overdueApproval.length+' acima de 2 dias',overdueApproval.length?'warn':'','approval')}${card('Em Conserto',repair.length,overdueRepair.length+' acima de 7 dias',overdueRepair.length?'warn':'','repair')}${card('Prontos para Entrega',ready.length,M(readyValue),'ok','ready')}</div>
      <div class="vx-c-grid"><section><div class="vx-c-title"><h3>Radar de Gestão</h3><small>falhas e oportunidades acionáveis</small></div>${item('OS acima do prazo',`${overdueAnalysis.length} análise • ${overdueApproval.length} aprovação • ${overdueRepair.length} conserto`,String(overdueAnalysis.length+overdueApproval.length+overdueRepair.length))}${item('OS sem técnico definido','Risco de fila sem responsável',String(noTech.length))}${item('OS urgentes','Prioridades declaradas na operação',String(urgent.length))}${item('Aparelhos prontos','Oportunidade de contato para retirada',String(ready.length))}<div class="vx-c-actions"><button data-drill="overdue">Ver atrasos</button><button data-drill="noTech">Ver sem técnico</button><button data-drill="urgent">Ver urgentes</button></div></section>
      <section><div class="vx-c-title"><h3>Hoje</h3><small>trabalho e compromissos</small></div>${item('Agenda',apps.length+' compromisso'+(apps.length===1?'':'s'))}${item('Tarefas pendentes',tasks.length+' atividade'+(tasks.length===1?'':'s'))}${item('Casos de atenção',cases.length+' caso'+(cases.length===1?'':'s'))}${item('Pedidos de peças',parts.length+' pendente'+(parts.length===1?'':'s'))}</section></div>
      <div class="vx-c-grid"><section><div class="vx-c-title"><h3>Resumo Financeiro</h3><small>somente pagamentos registrados</small></div><div class="vx-c-fin"><div><span>Recebido hoje</span><b>${M(receivedToday)}</b></div><div><span>Recebido no mês</span><b>${M(receivedMonth)}</b></div><div><span>Valor em prontos</span><b>${M(readyValue)}</b></div></div></section>
      <section><div class="vx-c-title"><h3>Metas e Bonificação</h3><small>sem valores fictícios</small></div><div class="vx-c-empty">Não configurado. Indicadores de meta e bônus só serão exibidos quando houver regra persistida e auditável.</div></section></div>
      ${role()==='GESTOR'?`<div class="vx-c-grid vx-c-grid-1"><section><div class="vx-c-title"><h3>Produtividade</h3><small>prontos × entregues, por loja/grupo/técnico</small></div><div class="vx-c-prod-grid">${prodSubBlock('ready','APARELHOS PRONTOS',stores,techs,groups)}${prodSubBlock('delivered','APARELHOS ENTREGUES',stores,techs,groups)}</div></section></div>`:''}
      ${discovery()}
    </div>`;
    app.querySelectorAll('[data-drill]').forEach(el=>el.onclick=()=>{const k=el.dataset.drill;if(drills[k])modal(el.textContent.trim()||'Detalhamento',drills[k]);});
    app.querySelectorAll('.vx-c-prod-sub').forEach(sec=>{
      prodRecalc(sec,prodOrders,finMap);
      sec.querySelectorAll('select').forEach(s=>s.onchange=()=>prodRecalc(sec,prodOrders,finMap));
      sec.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{sec.querySelectorAll('[data-period]').forEach(x=>x.classList.remove('active'));b.classList.add('active');prodRecalc(sec,prodOrders,finMap)});
    });
  };

  window.VoxAssistRuntime=window.VoxAssistRuntime||{};
  window.VoxAssistRuntime.dashboard={name:'Dashboard Canônico V1',version:'1.0.0',owner:'runtime/dashboard-canonical-v1.js'};
})();