/* VoxAssist V0.8.12 — alternância estável de abas sem piscar/recriar */
(function(){
  const baseRender=window.render;
  const baseRenderTabs=window.renderTabs;
  let switching=false;

  function dedupeTabs(){
    if(!Array.isArray(state?.openTabs))return;
    const seen=new Set();
    state.openTabs=state.openTabs.filter(v=>{if(seen.has(v))return false;seen.add(v);return true;});
  }

  function paintActive(target){
    document.querySelectorAll('#tabs .tab[data-tab]').forEach(t=>t.classList.toggle('active',t.dataset.tab===target));
  }

  async function switchExisting(target){
    if(!target||target===state.view||switching)return;
    switching=true;
    const tabs=document.querySelector('#tabs');
    const snapshot=tabs?.innerHTML||'';
    const renderTabsBefore=window.renderTabs;
    try{
      dedupeTabs();
      if(!state.openTabs.includes(target))state.openTabs.push(target);
      state.view=target;
      paintActive(target);

      /* Durante a troca, bloqueia qualquer rotina antiga que tente reconstruir a barra de abas. */
      window.renderTabs=function(){return;};
      await baseRender(target);

      dedupeTabs();
      state.view=target;
      const now=document.querySelector('#tabs');
      if(now&&snapshot&&now.innerHTML!==snapshot)now.innerHTML=snapshot;
      paintActive(target);
    } finally {
      window.renderTabs=renderTabsBefore;
      switching=false;
    }
  }

  document.addEventListener('click',function(e){
    const tab=e.target.closest('#tabs .tab[data-tab]');
    if(!tab||e.target.closest('[data-close]'))return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    switchExisting(tab.dataset.tab);
  },true);

  window.renderTabs=function(){
    if(switching)return;
    return typeof baseRenderTabs==='function'?baseRenderTabs.apply(this,arguments):undefined;
  };

  window.render=async function(view){
    if(switching)return baseRender(view);
    const r=await baseRender(view);
    return r;
  };
})();
