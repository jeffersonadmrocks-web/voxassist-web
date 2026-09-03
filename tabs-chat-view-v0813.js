/* VoxAssist Web V0.8.13 -- ensina o roteador de guias (tabs-final-fix.js)
   sobre a view 'chat'. A Central de Conversas (chat-beta-v0828.js) é um
   módulo bolt-on que renderiza #app por conta própria (openConversasScreen),
   nunca fez parte do roteador central de app.js -- então window.render('chat')
   não existia de verdade antes desta guia. Envolve window.render (não
   edita tabs-final-fix.js) pra: 1) registrar/substituir a guia ativa por
   'chat' com a mesma lógica de sempre (uma view = uma guia, nunca
   duplicada); 2) chamar openConversasScreen() de verdade; 3) redesenhar a
   barra. Qualquer outra view continua indo pro window.render original,
   comportamento intocado. */
(function(){
  const previousRender=window.render;

  function replaceActiveTabWithChat(){
    if(typeof state==='undefined'||!Array.isArray(state.openTabs))return;
    const current=state.view;
    let idx=state.openTabs.indexOf(current);
    if(idx<0)idx=Math.max(0,state.openTabs.length-1);
    state.openTabs=state.openTabs.filter((v,i)=>v!=='chat'||i===idx);
    idx=Math.min(idx,state.openTabs.length-1);
    if(state.openTabs.length===0){state.openTabs=['chat'];idx=0}else{state.openTabs[idx]='chat'}
    state.view='chat';
  }

  window.render=async function(view){
    if(String(view)==='chat'){
      replaceActiveTabWithChat();
      if(typeof window.openConversasScreen==='function')await window.openConversasScreen();
      if(document.querySelector('#tabs')&&typeof window.renderTabs==='function')window.renderTabs();
      return;
    }
    return previousRender(view);
  };
})();
