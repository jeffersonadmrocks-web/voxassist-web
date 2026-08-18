/* VoxAssist Web V0.8.12 — comportamento final das guias */
(function(){
  const previousRender=window.render;
  const labels={dashboard:'Início',os:'Atendimento',clientes:'Clientes',oficina:'Oficina',agenda:'Atividades',estoque:'Loja Virtual',financeiro:'Financeiro',testes:'Relatórios',usuarios:'Configurações','nova-os':'Nova O.S.'};

  function labelFor(v,fallback){
    if(v.startsWith('os:')) return 'OS '+v.split(':')[1];
    if(v.startsWith('guide:')) return 'Início';
    if(v.startsWith('feature:')) return v.slice(8).replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
    if(v.startsWith('op:')) return labels[v.slice(3)]||fallback||v.slice(3);
    return labels[v]||fallback||v;
  }

  window.renderTabs=function(fallback){
    const tabs=document.querySelector('#tabs');
    if(!tabs)return;
    tabs.innerHTML=state.openTabs.map(v=>`<button class="tab ${state.view===v?'active':''}" data-tab="${v}" title="${esc(labelFor(v,fallback))}"><span>${esc(labelFor(v,fallback))}</span>${v!=='dashboard'?`<i data-close="${v}" title="Fechar guia" aria-label="Fechar guia">×</i>`:''}</button>`).join('')+`<button type="button" class="tab tab-plus" id="tabPlus" title="Abrir nova guia" aria-label="Abrir nova guia">+</button>`;

    tabs.querySelectorAll('.tab[data-tab]').forEach(tab=>{
      tab.addEventListener('click',e=>{
        if(e.target.closest('[data-close]'))return;
        window.render(tab.dataset.tab);
      });
    });
    tabs.querySelectorAll('[data-close]').forEach(close=>{
      close.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        closeTab(close.dataset.close);
      });
    });
    const plus=tabs.querySelector('#tabPlus');
    if(plus) plus.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const key='guide:'+Date.now();
      state.openTabs.push(key);
      state.view=key;
      renderTabs();
      const title=document.querySelector('#title');if(title)title.textContent='Dashboard';
      document.querySelectorAll('.desktop-menu .nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='dashboard'));
      if(typeof window.renderDashboard==='function') window.renderDashboard();
      else previousRender('dashboard');
    });
  };

  window.render=async function(view){
    if(String(view).startsWith('guide:')){
      state.view=view;
      if(!state.openTabs.includes(view))state.openTabs.push(view);
      renderTabs();
      const title=document.querySelector('#title');if(title)title.textContent='Dashboard';
      document.querySelectorAll('.desktop-menu .nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='dashboard'));
      if(typeof window.renderDashboard==='function')return window.renderDashboard();
      return previousRender('dashboard');
    }
    const out=await previousRender(view);
    if(document.querySelector('#tabs'))renderTabs();
    return out;
  };
})();
