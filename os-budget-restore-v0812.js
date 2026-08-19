/* VoxAssist Web V0.8.12 — hotfix: preservar orçamento existente e apenas acrescentar gestão de peças */
(function(){
  function repositionPartsBox(){
    const panel=document.querySelector('#vx-orcamento');
    const box=document.querySelector('#vxPartsLaunchedBox');
    if(!panel||!box)return;

    /* O patch anterior reutilizou vx-screen-box e fez a tabela ocupar o painel inteiro.
       Mantemos todo o orçamento original e transformamos a lista de peças em um bloco compacto. */
    box.classList.remove('vx-screen-box');
    box.classList.add('vx-parts-launched','vx-parts-launched-compact');

    const fieldsets=[...panel.querySelectorAll('fieldset')];
    const partsFieldset=fieldsets.find(x=>/PEÇAS DO ORÇAMENTO/i.test(x.textContent||''));
    if(partsFieldset){
      if(box.nextElementSibling!==partsFieldset) partsFieldset.insertAdjacentElement('beforebegin',box);
      return;
    }

    /* Fallback: mantém o bloco dentro do conteúdo original, sem substituir nada. */
    const mainBox=panel.querySelector('.vx-screen-box');
    if(mainBox && box.parentElement!==mainBox) mainBox.appendChild(box);
  }

  const base=window.renderOsDetail;
  if(typeof base==='function'){
    window.renderOsDetail=async function(){
      const r=await base.apply(this,arguments);
      try{repositionPartsBox()}catch(e){console.warn('Hotfix orçamento:',e)}
      return r;
    };
  }
})();
