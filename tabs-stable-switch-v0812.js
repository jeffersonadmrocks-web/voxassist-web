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

  function bindStableTabs(){
    const tabs=document.querySelector('#tabs');
    if(!tabs)return;
    tabs.querySelectorAll('.tab[data-tab]').forEach(tab=>{
      const clone=tab.cloneNode(true);
      tab.replaceWith(clone);
      clone.addEventListener('click',async e=>{
        if(e.target.closest('[data-close]'))return;
        e.preventDefault();
        e.stopPropagation();
        const target=clone.dataset.tab;
        if(!target||target===state.view)return;
        switching=true;
        try{
          dedupeTabs();
          if(!state.openTabs.includes(target))state.openTabs.push(target);
          state.view=target;
          await baseRender(target);
          dedupeTabs();
          state.view=target;
          if(typeof baseRenderTabs==='function')baseRenderTabs();
          requestAnimationFrame(()=>{
            document.querySelectorAll('#tabs .tab[data-tab]').forEach(t=>t.classList.toggle('active',t.dataset.tab===target));
            bindStableTabs();
          });
        } finally {
          switching=false;
        }
      },{capture:true});
      const close=clone.querySelector('[data-close]');
      if(close){
        close.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(typeof closeTab==='function')closeTab(close.dataset.close);},{capture:true});
      }
    });
  }

  window.renderTabs=function(){
    const r=typeof baseRenderTabs==='function'?baseRenderTabs.apply(this,arguments):undefined;
    requestAnimationFrame(bindStableTabs);
    return r;
  };

  window.render=async function(view){
    if(switching)return baseRender(view);
    const r=await baseRender(view);
    requestAnimationFrame(bindStableTabs);
    return r;
  };

  setTimeout(bindStableTabs,0);
})();
