/* VoxAssist Web V0.8.12 — fidelidade visual ao layout Desktop aprovado */
(function(){
  const oldRender = window.render;
  const firstName = ()=>String(state.profile?.full_name||'Administrador').trim().split(/\s+/)[0]||'Administrador';

  window.shell = function(){
    document.body.innerHTML=`
      <aside class="sidebar desktop-sidebar">
        <div class="brand desktop-brand">VOX <span>ASSIST</span></div>
        <div class="user-card"><b>${esc(state.profile?.role||'ADMINISTRADOR')}</b><small>${esc(state.profile?.role||'ADMINISTRADOR')} • Online</small></div>
        <div class="desktop-menu">
          <button class="nav active" data-view="dashboard">⌂ <span>VISÃO GERAL</span></button>
          <button class="nav" data-view="os">▣ <span>ATENDIMENTO</span></button>
          <button class="nav" data-view="oficina">⚒ <span>OFICINA</span></button>
          <button class="nav" data-view="agenda">☑ <span>ATIVIDADES</span></button>
          <button class="nav" data-view="financeiro">$ <span>FINANCEIRO</span></button>
          <button class="nav" data-view="estoque">▤ <span>LOJA VIRTUAL</span></button>
          <button class="nav" data-view="testes">▥ <span>RELATÓRIOS</span></button>
          <button class="nav" data-view="usuarios">⚙ <span>CONFIGURAÇÕES</span></button>
        </div>
        <div class="desktop-version">VoxAssist v0.8.12<br>© 2026 Vox Eletrônica</div>
      </aside>
      <main class="desktop-main">
        <header class="desktop-topbar">
          <div class="welcome">Bom dia, <b>${esc(firstName())}</b></div>
          <label class="store-picker"><small>LOJA ATIVA</small><select id="activeStore"><option>VOX SERRA</option><option>VOX VITÓRIA</option></select></label>
          <div class="global-search"><input id="globalSearch" placeholder="PESQUISAR CLIENTE, OS, EQUIPAMENTO..."></div>
          <h1 id="title" class="sr-only">Dashboard</h1>
          <button id="newOs" class="sr-only">Nova OS</button><button id="logout" class="sr-only">Sair</button>
        </header>
        <div id="tabs" class="tabs desktop-tabs"></div>
        <section id="app" class="desktop-app"></section>
        <footer class="desktop-footer"><span>Atalhos: F2 Nova OS</span><span>F3 Pesquisa OS</span><span>F11 Observações Internas</span><span>Ctrl+W Salvar</span><span>F10 Início</span><button id="newGuide">+ NOVA GUIA</button></footer>
      </main>`;

    $$('.nav').forEach(b=>{ if(!can(b.dataset.view)) b.classList.add('disabled'); b.onclick=()=>can(b.dataset.view)&&render(b.dataset.view); });
    $('#globalSearch').onkeydown=e=>{ if(e.key==='Enter'){ const q=up(e.target.value); render('os'); setTimeout(()=>{const s=$('#osSearch'); if(s){s.value=q;s.dispatchEvent(new Event('input'));}},40); } };
    $('#newGuide').onclick=()=>render('dashboard');
    document.addEventListener('keydown', desktopShortcutHandler);
  };

  function desktopShortcutHandler(e){
    if(e.key==='F2'){e.preventDefault();render('nova-os')}
    if(e.key==='F3'){e.preventDefault();render('os')}
    if(e.key==='F10'){e.preventDefault();render('dashboard')}
    if(e.key==='F11'){e.preventDefault(); if(state.activeOs) render('os:'+state.activeOs); else toast('Abra uma OS para acessar as Observações Internas / F11.');}
    if(e.ctrlKey && e.key.toLowerCase()==='w'){e.preventDefault(); const btn=document.querySelector('.sticky-actions .primary'); if(btn)btn.click(); else toast('Nenhuma edição aberta para salvar.');}
  }

  window.renderTabs = function(label){
    const tabs=$('#tabs'); if(!tabs)return;
    const labels={dashboard:'Início',os:'Pesquisa O.S.',clientes:'Clientes',oficina:'Oficina',agenda:'Atividades',estoque:'Loja Virtual',financeiro:'Financeiro',testes:'Relatórios',usuarios:'Configurações','nova-os':'Nova O.S.'};
    tabs.innerHTML=state.openTabs.map(v=>`<button class="tab ${state.view===v?'active':''}" data-tab="${v}"><span>${esc(v.startsWith('os:')?'OS '+v.split(':')[1]:(labels[v]||label||v))}</span>${v!=='dashboard'?`<i data-close="${v}">×</i>`:''}</button>`).join('')+`<button class="tab tab-plus" id="tabPlus">+</button>`;
    $$('.tab[data-tab]').forEach(t=>t.onclick=e=>{if(e.target.dataset.close)return;render(t.dataset.tab)});
    $$('[data-close]').forEach(x=>x.onclick=e=>{e.stopPropagation();closeTab(x.dataset.close)});
    $('#tabPlus').onclick=()=>render('dashboard');
  };

  window.renderDashboard = function(){
    const all=state.orders.filter(x=>x.status!=='FINALIZADA');
    const analysis=all.filter(x=>x.status==='AGUARDANDO ANALISE');
    const approval=all.filter(x=>x.status==='AGUARDANDO APROVACAO');
    const ready=all.filter(x=>x.status==='PRONTO PARA ENTREGA');
    const other=all.filter(x=>!['AGUARDANDO ANALISE','AGUARDANDO APROVACAO','PRONTO PARA ENTREGA'].includes(x.status));
    const techs=[...new Set(state.orders.map(o=>o.profiles?.full_name).filter(Boolean))];
    const brands=[...new Set(state.orders.map(o=>o.equipments?.brand).filter(Boolean))];

    $('#app').innerHTML=`
      <div class="daily-hero">
        <div><h2>Central diária de trabalho</h2><p>Indicadores, oportunidades, casos, peças e produtividade em uma única visão.</p></div>
        <div class="hero-actions"><button class="desk-blue" onclick="render('nova-os')">+ NOVA ORDEM DE SERVIÇO</button><button class="desk-light" onclick="render('os')">PESQUISAR O.S.</button><button class="desk-orange" onclick="render('agenda')">NOVO CASO</button></div>
      </div>
      <div class="desktop-filterbar">
        <label>LOJA<select id="fStore"><option>VOX SERRA</option><option>VOX VITÓRIA</option></select></label>
        <label>MARCA<select id="fBrand"><option value="">TODOS</option>${brands.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label>
        <label>GRUPO<select id="fGroup"><option value="">TODOS</option><option>TV</option><option>REFRIGERAÇÃO</option><option>LINHA BRANCA</option></select></label>
        <label>TÉCNICO<select id="fTech"><option value="">TODOS</option>${techs.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label>
        <label>ATENDENTE<select id="fAtt"><option value="">TODOS</option></select></label>
        <button id="refreshDash">ATUALIZAR</button>
      </div>
      <div class="desktop-metrics">
        ${deskMetric('OS ATIVAS',all.length,'#1876d2','Ordens registradas','all')}
        ${deskMetric('AGUARDANDO ANÁLISE',analysis.length,'#ef7d00','Situação principal','analysis')}
        ${deskMetric('AGUARDANDO APROVAÇÃO',approval.length,'#7656df','Situação principal','approval')}
        ${deskMetric('PRONTO PARA ENTREGA',ready.length,'#138a48','Situação principal','ready')}
        ${deskMetric('DEMAIS SITUAÇÕES',other.length,'#0d9a83','Outras OS ativas','other')}
      </div>
      <div class="selected-orders card desktop-panel"><h3>ORDENS DA SITUAÇÃO SELECIONADA</h3><div id="dashOrders">${desktopOrdersTable(all.slice(0,14))}</div></div>
      <div class="desktop-panel quick-panel"><h3>ACESSOS RÁPIDOS</h3><div class="quick-grid">
        ${quick('+','NOVA O.S.','Abrir atendimento','nova-os','blue')}
        ${quick('♟','CLIENTES','Cadastro e histórico','clientes','cyan')}
        ${quick('⚒','OFICINA','Fila técnica','oficina','orange')}
        ${quick('□','ESTOQUE / PEÇAS','Dentro da Oficina','estoque','green')}
        ${quick('!','CASOS','Pendências direcionadas','agenda','red')}
        ${quick('◷','SYSTEM3','Sincronização de transição','system3','purple')}
      </div></div>
      <div class="desktop-bottom-tabs">
        <button class="active">Oportunidades do Dia</button><button>Casos de Atenção</button><button onclick="render('agenda')">Minhas Tarefas</button><button onclick="render('agenda')">Agenda / Compromissos</button><button onclick="render('estoque')">Pedidos de Peças</button><button>Produtividade / Bonificação</button>
      </div>
      <div class="desktop-bottom-content"><span>Ambiente de homologação — dados fictícios.</span></div>`;

    function show(rows){$('#dashOrders').innerHTML=desktopOrdersTable(rows)}
    document.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{const k=b.dataset.set;show(k==='analysis'?analysis:k==='approval'?approval:k==='ready'?ready:k==='other'?other:all)});
    $('#refreshDash').onclick=async()=>{await loadCore();renderDashboard();};
    $('#fBrand').onchange=applyFilters; $('#fTech').onchange=applyFilters; $('#fGroup').onchange=applyFilters;
    function applyFilters(){let rows=all;const brand=$('#fBrand').value,tech=$('#fTech').value,group=$('#fGroup').value;if(brand)rows=rows.filter(o=>o.equipments?.brand===brand);if(tech)rows=rows.filter(o=>o.profiles?.full_name===tech);if(group)rows=rows.filter(o=>(o.equipments?.product_type||'').includes(group==='REFRIGERAÇÃO'?'REFRIG':group));show(rows)}
  };

  function deskMetric(title,n,color,sub,set){return `<button class="desk-metric" data-set="${set}" style="--metric:${color}"><span>${title}</span><b>${n}</b><small>${sub}</small></button>`}
  function quick(icon,title,sub,view,color){return `<button class="quick-card ${color}" onclick="${view==='system3'?"toast('System3 permanece no módulo de transição/homologação.')":`render('${view}')`}"><b>${icon}</b><span><strong>${title}</strong><small>${sub}</small></span></button>`}
  function desktopOrdersTable(rows){return `<div class="desktop-table-wrap"><table class="desktop-table"><thead><tr><th>OS</th><th>CLIENTE</th><th>PRODUTO</th><th>MARCA</th><th>TÉCNICO</th><th>STATUS</th></tr></thead><tbody>${rows.map(o=>`<tr onclick="render('os:${o.id}')"><td>${esc(o.os_number)}</td><td>${esc(o.clients?.name||'—')}</td><td>${esc([o.equipments?.product_type,o.equipments?.model].filter(Boolean).join(' ')||'—')}</td><td>${esc(o.equipments?.brand||'—')}</td><td>${esc(o.profiles?.full_name||'—')}</td><td>${esc(o.status||'—')}</td></tr>`).join('')||'<tr><td colspan="6">Nenhuma OS encontrada.</td></tr>'}</tbody></table></div>`}

  const originalRender = window.render;
  window.render = async function(view){
    const r=await originalRender(view);
    if(view==='dashboard'||!view){setTimeout(()=>{ if($('#app')&&!$('.daily-hero')) window.renderDashboard(); },0)}
    return r;
  };
})();
