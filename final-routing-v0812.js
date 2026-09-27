/* VoxAssist V0.8.12 — roteamento final: Dashboard aprovado + Importar OS */
(function(){
  const previous=window.render;
  function patchAtendimento(){
    const cards=[...document.querySelectorAll('.module-action-card')];
    const c=cards.find(x=>/SITUAÇÃO DOS APARELHOS/i.test(x.textContent)||/IMPORTAR O\.S\./i.test(x.textContent));
    if(!c)return;
    const strong=c.querySelector('strong'),small=c.querySelector('small'),icon=c.querySelector('.icon');
    if(strong)strong.textContent='IMPORTAR O.S.';
    if(small)small.textContent='Importe OS de fabricantes ou seguradoras a partir de arquivos PDF.';
    if(icon)icon.textContent='⇧';
    c.dataset.target='importar-os';
    c.onclick=(e)=>{e.preventDefault();e.stopPropagation();window.renderImportOs?.();};
  }
  window.render=async function(view){
    if(view==='dashboard' && typeof window.renderDashboard==='function'){
      try{state.view='dashboard';addTab?.('dashboard','Início');renderTabs?.('Início');}catch(e){}
      const title=document.querySelector('#title');if(title)title.textContent='Dashboard';
      return window.renderDashboard();
    }
    if(view==='importar-os' && typeof window.renderImportOs==='function') return window.renderImportOs();
    const r=await previous.apply(this,arguments);
    if(view==='os') setTimeout(patchAtendimento,0);
    return r;
  };
  document.addEventListener('click',e=>{
    const c=e.target.closest('.module-action-card');
    if(c && /IMPORTAR O\.S\./i.test(c.textContent)){e.preventDefault();e.stopImmediatePropagation();window.renderImportOs?.();}
  },true);
  setTimeout(()=>{if(state?.view==='os')patchAtendimento();},300);
})();