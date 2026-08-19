/* VoxAssist V0.8.12 — alternância entre abas sem fechar outras */
(function(){
  const uniq=a=>[...new Set((a||[]).filter(Boolean))];
  let switching=false;

  function renderTabsSafe(){
    if(typeof window.renderTabs==='function')window.renderTabs();
  }

  async function switchTo(target){
    if(!target||switching||typeof window.render!=='function')return;
    switching=true;
    const before=uniq(state?.openTabs||[]);
    if(!before.includes(target))before.push(target);
    try{
      await window.render(target);
    }finally{
      const after=uniq(state?.openTabs||[]);
      state.openTabs=uniq([...before,...after]);
      state.view=target;
      renderTabsSafe();
      switching=false;
    }
  }

  document.addEventListener('click',function(e){
    const tab=e.target.closest('#tabs .tab[data-tab]');
    if(!tab)return;
    if(e.target.closest('[data-close]'))return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    switchTo(tab.dataset.tab);
  },true);

  document.addEventListener('click',function(e){
    const close=e.target.closest('#tabs [data-close]');
    if(!close)return;
    // Fechamento continua permitido somente pelo X da própria aba.
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const key=close.dataset.close;
    if(typeof window.closeTab==='function')return window.closeTab(key);
    state.openTabs=(state.openTabs||[]).filter(v=>v!==key);
    if(state.view===key){
      state.view=state.openTabs[state.openTabs.length-1]||'dashboard';
      if(typeof window.render==='function')window.render(state.view);
    }else renderTabsSafe();
  },true);
})();
