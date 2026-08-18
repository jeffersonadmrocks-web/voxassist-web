/* VoxAssist Web V0.8.12 — política de navegação contextual */
(function(){
  let keepContext=false;
  let explicitNavigation=false;

  function isExplicitNav(el){
    if(!el) return false;
    return !!el.closest('.nav,.tab[data-tab],.vx-back,.cancel,#newGuide,[data-explicit-nav="1"]');
  }

  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,input[type="submit"]');
    if(!el) return;
    explicitNavigation=isExplicitNav(el);
    if(explicitNavigation){ keepContext=false; return; }

    if(el.closest('#osForm,.vx-os-panel,.vx-os-head-actions,.vx-client-actions,.vx-address-actions,.vx-newos-actions')){
      keepContext=true;
    }
  },true);

  const baseRender=window.render;
  if(typeof baseRender!=='function') return;

  window.render=async function(view){
    if(!explicitNavigation && keepContext){
      /* Nova OS salva: após loadCore, a OS recém-criada é a mais recente da lista. */
      if(view==='os' && state?.view==='nova-os'){
        const newest=(state.orders||[]).slice().sort((a,b)=>new Date(b.opened_at||b.created_at||0)-new Date(a.opened_at||a.created_at||0))[0];
        keepContext=false;
        if(newest?.id) return baseRender(`os:${newest.id}`);
      }

      /* Dentro de uma OS, ações de gravação não podem expulsar o usuário do contexto. */
      if((view==='dashboard' || view==='os') && state?.activeOs){
        const id=typeof state.activeOs==='object'?state.activeOs.id:state.activeOs;
        keepContext=false;
        if(id) return baseRender(`os:${id}`);
      }
    }

    explicitNavigation=false;
    return baseRender(view);
  };
})();
