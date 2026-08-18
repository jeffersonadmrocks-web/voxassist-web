/* VoxAssist Web V0.8.12 — comportamento final das guias */
(function(){
  const previousRender=window.render;
  const labels={dashboard:'Início',os:'Atendimento',clientes:'Clientes',oficina:'Oficina',agenda:'Atividades',estoque:'Loja Virtual',financeiro:'Financeiro',testes:'Relatórios',usuarios:'Configurações','nova-os':'Nova O.S.'};
  let switchingExistingTab=false;

  function labelFor(v,fallback){
    if(String(v).startsWith('os:')) return 'OS '+String(v).split(':')[1];
    if(String(v).startsWith('guide:')) return 'Início';
    if(String(v).startsWith('feature:')) return String(v).slice(8).replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
    if(String(v).startsWith('op:')) return labels[String(v).slice(3)]||fallback||String(v).slice(3);
    return labels[v]||fallback||v;
  }

  function replaceActiveTab(next){
    const current=state.view;
    let idx=state.openTabs.indexOf(current);
    if(idx<0) idx=Math.max(0,state.openTabs.length-1);

    // Remove outra ocorrência do destino para evitar uma guia duplicada criada pelo modelo antigo.
    state.openTabs=state.openTabs.filter((v,i)=>v!==next || i===idx);
    idx=Math.min(idx,state.openTabs.length-1);

    if(state.openTabs.length===0){
      state.openTabs=[next];
      idx=0;
    }else{
      state.openTabs[idx]=next;
    }
    state.view=next;
  }

  window.renderTabs=function(fallback){
    const tabs=document.querySelector('#tabs');
    if(!tabs)return;
    tabs.innerHTML=state.openTabs.map(v=>`<button class="tab ${state.view===v?'active':''}" data-tab="${v}" title="${esc(labelFor(v,fallback))}"><span>${esc(labelFor(v,fallback))}</span>${v!=='dashboard'?`<i data-close="${v}" title="Fechar guia" aria-label="Fechar guia">×</i>`:''}</button>`).join('')+`<button type="button" class="tab tab-plus" id="tabPlus" title="Abrir nova guia" aria-label="Abrir nova guia">+</button>`;

    tabs.querySelectorAll('.tab[data-tab]').forEach(tab=>{
      tab.addEventListener('click',async e=>{
        if(e.target.closest('[data-close]'))return;
        switchingExistingTab=true;
        try{await window.render(tab.dataset.tab);}finally{switchingExistingTab=false;}
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
    view=String(view||'dashboard');

    // Clique numa guia existente: apenas seleciona a guia e restaura seu conteúdo.
    if(switchingExistingTab){
      state.view=view;
      if(!state.openTabs.includes(view))state.openTabs.push(view);
      if(view.startsWith('guide:')){
        renderTabs();
        const title=document.querySelector('#title');if(title)title.textContent='Dashboard';
        document.querySelectorAll('.desktop-menu .nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='dashboard'));
        if(typeof window.renderDashboard==='function')return window.renderDashboard();
        return previousRender('dashboard');
      }
      const out=await previousRender(view);
      if(document.querySelector('#tabs'))renderTabs();
      return out;
    }

    // Navegação normal: altera o conteúdo da guia ativa. Nova guia somente pelo botão +.
    if(!view.startsWith('guide:')) replaceActiveTab(view);

    if(view.startsWith('guide:')){
      state.view=view;
      if(!state.openTabs.includes(view))state.openTabs.push(view);
      renderTabs();
      const title=document.querySelector('#title');if(title)title.textContent='Dashboard';
      document.querySelectorAll('.desktop-menu .nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='dashboard'));
      if(typeof window.renderDashboard==='function')return window.renderDashboard();
      return previousRender('dashboard');
    }

    const out=await previousRender(view);

    // Camadas antigas podem tentar inserir a mesma tela como nova guia; normaliza novamente.
    const seen=new Set();
    state.openTabs=state.openTabs.filter(v=>{
      if(seen.has(v))return false;
      seen.add(v);return true;
    });
    state.view=view;
    if(document.querySelector('#tabs'))renderTabs();
    return out;
  };
})();
