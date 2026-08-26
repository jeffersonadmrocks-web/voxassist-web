/* VoxAssist V0.8.12 — alternância entre abas sem fechar outras */
(function(){
  function renderTabsSafe(){
    if(typeof window.renderTabs==='function')window.renderTabs();
  }

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
