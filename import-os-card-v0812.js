/* VoxAssist V0.8.12 — Importar O.S. no mesmo padrão visual/tamanho dos demais cards */
(function(){
  function apply(){
    const cards=[...document.querySelectorAll('.module-action-card')];
    const c=cards.find(x=>/SITUAÇÃO DOS APARELHOS/i.test(x.textContent)||/IMPORTAR O\.S\./i.test(x.textContent));
    if(!c)return;
    const strong=c.querySelector('strong'),small=c.querySelector('small'),icon=c.querySelector('.icon');
    if(strong)strong.textContent='IMPORTAR O.S.';
    if(small)small.textContent='Importe OS de fabricantes ou seguradoras a partir de arquivos PDF.';
    if(icon)icon.textContent='⇧';
    c.dataset.target='importar-os';
    c.style.minHeight='';c.style.height='';c.style.padding='';c.style.gridRow='';c.style.alignSelf='';
    c.classList.remove('vx-import-card-expanded','vx-import-card-large');
  }
  const base=window.render;
  if(typeof base==='function')window.render=async function(view){const r=await base.apply(this,arguments);if(view==='os')setTimeout(apply,0);return r;};
  setTimeout(apply,300);
})();