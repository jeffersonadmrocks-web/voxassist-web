/* VoxAssist Web V0.9.04 — abrir OS em nova aba a partir de um alerta.
   Achado do usuário em 2026-09-04: o botão "Abrir OS →" do cartão de
   alerta (event-alerts-v0904.js) navegava na MESMA aba -- se o
   operador estivesse no meio de uma ação importante (preenchendo um
   orçamento, por exemplo), clicar no alerta perderia esse trabalho.
   O app não tem roteamento por URL (render() nunca atualiza a barra
   de endereço) -- então abrir uma aba nova precisa de um jeito de
   dizer pra ELA, já no carregamento, "assim que logar, vá direto pra
   esta OS". Usa um parâmetro de URL (?openOs=<id>) só pra esse
   transporte inicial; consumido uma única vez aqui, limpo da URL logo
   em seguida (history.replaceState) pra não repetir em recarregamentos
   futuros dessa mesma aba. `boot` é function declaration em app.js
   (vira propriedade de window, ao contrário de `state`/`const`) --
   por isso dá pra embrulhar daqui sem tocar em app.js. */
(function(){
  const PARAM='openOs';
  window.vxOpenOsInNewTab=function(osId){
    const url=location.origin+location.pathname+'?'+PARAM+'='+encodeURIComponent(osId);
    window.open(url,'_blank','noopener');
  };
  const baseBoot=window.boot;
  if(typeof baseBoot!=='function')return;
  window.boot=async function(){
    const r=await baseBoot.apply(this,arguments);
    const id=new URLSearchParams(location.search).get(PARAM);
    if(id){
      history.replaceState(null,'',location.pathname);
      await (window.render||render)('os:'+id);
    }
    return r;
  };
})();
