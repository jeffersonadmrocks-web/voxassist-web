/* Dashboard Core V1 compatibility + API timeout guard */
(function(){
  'use strict';
  if(window.__VX_API_TIMEOUT_GUARD__) return;
  window.__VX_API_TIMEOUT_GUARD__ = true;

  const originalApi = window.api;
  if(typeof originalApi === 'function'){
    window.api = function(path){
      const timeoutMs = 7000;
      let timer;
      const timeout = new Promise((_, reject)=>{
        timer = setTimeout(()=>reject(new Error('TIMEOUT_API: '+String(path||''))), timeoutMs);
      });
      return Promise.race([
        Promise.resolve().then(()=>originalApi.apply(this, arguments)),
        timeout
      ]).finally(()=>clearTimeout(timer));
    };
  }
})();