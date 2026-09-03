/* VoxAssist Web V0.8.13 -- arrastar guia (estilo navegador) pra trocar a
   posicao de uma aba com a outra. Nao mexe em abrir/fechar/trocar guia
   (tabs-final-fix.js, intocado) -- so envolve window.renderTabs pra
   religar o drag-and-drop toda vez que a barra e redesenhada (o proprio
   renderTabs ja reescreve #tabs.innerHTML do zero a cada chamada, entao
   os listeners velhos somem sozinhos -- reanexar aqui e o comportamento
   certo, nao um vazamento). */
(function(){
  const previousRenderTabs=window.renderTabs;
  let draggedKey=null;

  function moveTab(fromKey,toKey){
    if(!fromKey||!toKey||fromKey===toKey)return;
    const arr=state.openTabs;
    const fromIdx=arr.indexOf(fromKey), toIdx=arr.indexOf(toKey);
    if(fromIdx<0||toIdx<0)return;
    arr.splice(fromIdx,1);
    arr.splice(toIdx,0,fromKey);
    window.renderTabs();
  }

  window.renderTabs=function(fallback){
    const out=typeof previousRenderTabs==='function'?previousRenderTabs(fallback):undefined;
    const tabs=document.querySelector('#tabs');
    if(!tabs)return out;
    tabs.querySelectorAll('.tab[data-tab]').forEach(tab=>{
      tab.draggable=true;
      tab.addEventListener('dragstart',e=>{
        draggedKey=tab.dataset.tab;
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',draggedKey);
        setTimeout(()=>tab.classList.add('tab-dragging'),0);
      });
      tab.addEventListener('dragend',()=>{
        tab.classList.remove('tab-dragging');
        tabs.querySelectorAll('.tab-drag-over').forEach(t=>t.classList.remove('tab-drag-over'));
        draggedKey=null;
      });
      tab.addEventListener('dragover',e=>{
        if(!draggedKey)return;
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        tab.classList.add('tab-drag-over');
      });
      tab.addEventListener('dragleave',()=>tab.classList.remove('tab-drag-over'));
      tab.addEventListener('drop',e=>{
        e.preventDefault();
        tab.classList.remove('tab-drag-over');
        moveTab(draggedKey,tab.dataset.tab);
        draggedKey=null;
      });
    });
    return out;
  };
})();
