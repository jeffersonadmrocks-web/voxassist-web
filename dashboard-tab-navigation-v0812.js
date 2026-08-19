/* VoxAssist V0.8.12 — Dashboard fixo + resultados em abas independentes */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const age=o=>Math.max(0,Math.floor((Date.now()-new Date(o.updated_at||o.opened_at||Date.now()))/86400000));
  const fmtDate=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
  const filters=new Map();
  const baseRender=window.render;
  const baseRenderTabs=window.renderTabs;

  function keyFor(title){return 'dashfilter:'+encodeURIComponent(title)}
  function labelFor(v){
    if(v==='dashboard')return 'Início';
    if(v.startsWith('dashfilter:'))return decodeURIComponent(v.slice(11));
    if(v.startsWith('os:'))return 'OS '+v.split(':')[1];
    const map={os:'Atendimento',clientes:'Clientes',oficina:'Oficina',agenda:'Atividades',estoque:'Loja Virtual',financeiro:'Financeiro',testes:'Relatórios',usuarios:'Configurações','nova-os':'Nova O.S.'};
    return map[v]||v.replace('feature:','');
  }

  window.renderTabs=function(){
    const tabs=document.querySelector('#tabs');if(!tabs)return;
    if(!state.openTabs.includes('dashboard'))state.openTabs.unshift('dashboard');
    tabs.innerHTML=state.openTabs.map(v=>`<button class="tab ${state.view===v?'active':''}" data-tab="${v}"><span>${E(labelFor(v))}</span>${v!=='dashboard'?`<i data-close="${v}" title="Fechar guia">×</i>`:''}</button>`).join('')+`<button class="tab tab-plus" id="tabPlus" title="Nova guia">+</button>`;
    tabs.querySelectorAll('.tab[data-tab]').forEach(t=>t.addEventListener('click',e=>{if(e.target.closest('[data-close]'))return;window.render(t.dataset.tab);}));
    tabs.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeTab(x.dataset.close);}));
    const plus=document.querySelector('#tabPlus');if(plus)plus.onclick=()=>window.render('dashboard');
  };

  function renderFilterTab(key){
    const f=filters.get(key);if(!f)return window.render('dashboard');
    state.view=key;if(!state.openTabs.includes(key))state.openTabs.push(key);window.renderTabs();
    const app=document.querySelector('#app');if(!app)return;
    const h=document.querySelector('#title');if(h)h.textContent=f.title;
    const rows=f.rows||[];
    app.innerHTML=`<div class="card" style="padding:14px"><div class="section-title" style="margin-bottom:10px"><div><h2 style="margin:0">${E(f.title)}</h2><small style="color:#6b7d90">Origem: Dashboard • ${rows.length} O.S. encontrada${rows.length===1?'':'s'}</small></div><button class="secondary" onclick="render('dashboard')">Voltar ao Dashboard</button></div><div class="table-wrap"><table><thead><tr><th>O.S.</th><th>Cliente</th><th>Equipamento</th><th>Situação</th><th>Entrada</th></tr></thead><tbody>${rows.map(o=>`<tr data-open-os="${E(o.id)}" style="cursor:pointer"><td><b>${E(o.os_number||'—')}</b></td><td>${E(o.clients?.name||o.client_name||'—')}</td><td>${E([o.equipments?.product_type,o.equipments?.brand,o.equipments?.model].filter(Boolean).join(' • ')||'—')}</td><td>${E(norm(o.status)||'—')}</td><td>${fmtDate(o.opened_at)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum registro encontrado.</td></tr>'}</tbody></table></div></div>`;
    app.querySelectorAll('[data-open-os]').forEach(tr=>tr.onclick=()=>window.render('os:'+tr.dataset.openOs));
  }

  window.vxOpenDashboardFilterTab=function(title,rows){
    const key=keyFor(title);filters.set(key,{title,rows:[...(rows||[])]});if(!state.openTabs.includes('dashboard'))state.openTabs.unshift('dashboard');if(!state.openTabs.includes(key))state.openTabs.push(key);return renderFilterTab(key);
  };

  window.render=async function(view){
    if(String(view||'').startsWith('dashfilter:'))return renderFilterTab(String(view));
    const out=await baseRender(view);
    if(!state.openTabs.includes('dashboard'))state.openTabs.unshift('dashboard');window.renderTabs();return out;
  };

  function allOrders(){return Array.isArray(state?.orders)?state.orders:[]}
  function open(o){return !['FINALIZADA','CANCELADA'].includes(norm(o.status))}
  function kpiFilter(t){const rows=allOrders();if(t==='OS ATIVAS')return ['OS Ativas',rows.filter(open)];if(t.includes('AGUARDANDO ANALISE'))return ['Aguardando Análise',rows.filter(o=>open(o)&&norm(o.status)==='AGUARDANDO ANALISE')];if(t.includes('AGUARDANDO APROVACAO'))return ['Aguardando Aprovação',rows.filter(o=>open(o)&&norm(o.status)==='AGUARDANDO APROVACAO')];if(t==='EM CONSERTO')return ['Em Conserto',rows.filter(o=>open(o)&&['EM CONSERTO','AGUARDANDO CONSERTO'].includes(norm(o.status)))];if(t.includes('PRONTOS PARA ENTREGA'))return ['Prontos para Entrega',rows.filter(o=>open(o)&&norm(o.status)==='PRONTO PARA ENTREGA')];if(t.includes('ORCAMENTOS')){const d=new Date(),m=new Date(d.getFullYear(),d.getMonth(),1);return ['Orçamentos do Mês',rows.filter(o=>new Date(o.opened_at)>=m)]}if(t.includes('ENTREGUES')){const d=new Date(),m=new Date(d.getFullYear(),d.getMonth(),1);return ['Entregues no Mês',rows.filter(o=>o.delivery_at&&new Date(o.delivery_at)>=m)]}return null}

  document.addEventListener('click',function(e){
    const k=e.target.closest('.vx-approved .vx-a-kpi');
    if(k){const f=kpiFilter(norm(k.querySelector('span')?.textContent));if(f){e.preventDefault();e.stopImmediatePropagation();return window.vxOpenDashboardFilterTab(f[0],f[1]);}}
    const b=e.target.closest('.vx-approved .vx-a-band');
    if(b){const parent=b.closest('.vx-a-vitem');const statusTitle=parent?.querySelector('h4')?.textContent||'Gestão Visual';const status=norm(statusTitle);const hidden=norm(b.querySelector('span')?.textContent);let st='';if(status.includes('ANALISE'))st='AGUARDANDO ANALISE';else if(status.includes('APROVACAO'))st='AGUARDANDO APROVACAO';else if(status.includes('CONSERTO'))st='AGUARDANDO CONSERTO';else if(status.includes('PRONTO'))st='PRONTO PARA ENTREGA';let min=0,max=9999;if(hidden.includes('0 A 3')){min=0;max=3}else if(hidden.includes('1 A 3')){min=1;max=3}else if(hidden.includes('4 A 7')){min=4;max=7}else if(hidden.includes('8+')){min=8;max=9999}const rows=allOrders().filter(o=>open(o)&&norm(o.status)===st&&age(o)>=min&&age(o)<=max);e.preventDefault();e.stopImmediatePropagation();return window.vxOpenDashboardFilterTab(`${statusTitle} • ${b.querySelector('span')?.textContent||''}`,rows);}
  },true);
})();
