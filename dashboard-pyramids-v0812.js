/* Dashboard Core V1 compatibility + scoped API timeout guard */
(function(){
  'use strict';
  if(!window.__VX_DASHBOARD_CORE_V1__) return;
  if(window.__VX_DASHBOARD_SCOPED_TIMEOUT__) return;
  window.__VX_DASHBOARD_SCOPED_TIMEOUT__ = true;

  const originalRender = window.renderDashboard;
  if(typeof originalRender !== 'function') return;

  window.renderDashboard = function(){
    const originalApi = window.api;
    if(typeof originalApi !== 'function') return originalRender.apply(this, arguments);

    window.api = function(path){
      const args = arguments;
      const ctx = this;
      const timeoutMs = 7000;
      let timer;
      const timeout = new Promise((_, reject)=>{
        timer = setTimeout(()=>reject(new Error('DASHBOARD_API_TIMEOUT: '+String(path||''))), timeoutMs);
      });
      return Promise.race([
        Promise.resolve().then(()=>originalApi.apply(ctx, args)),
        timeout
      ]).finally(()=>clearTimeout(timer));
    };

    try {
      const result = originalRender.apply(this, arguments);
      return result;
    } finally {
      /* Important: restore immediately. Dashboard queries are already started synchronously,
         so authentication and all other VoxAssist modules keep using the untouched API. */
      window.api = originalApi;
    }
  };
})();