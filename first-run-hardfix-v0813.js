/* VoxAssist V0.8.13 — compatibilidade primeiro acesso Empresa-only */
(function(){
  window.vxForceFirstRun=function(){
    if(typeof window.render==='function') return window.render('usuarios');
  };
})();
