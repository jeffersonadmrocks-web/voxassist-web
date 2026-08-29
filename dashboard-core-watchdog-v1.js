/* VoxAssist Dashboard Core V1 — watchdog de carregamento seguro */
(function(){'use strict';
  const WAIT_MS=12000;
  function app(){return document.querySelector('#app');}
  function isLoading(){const a=app();return !!a && /Carregando inteligência operacional/i.test(a.textContent||'');}
  function showRecovery(){const a=app();if(!a||!isLoading())return;a.innerHTML=`<div class="card" style="border-left:4px solid #b54708"><h3 style="margin:0 0 8px;color:#173450">Dashboard demorou para carregar</h3><p style="margin:0 0 10px;color:#64748b">Uma das fontes operacionais não respondeu no tempo esperado. Para preservar a estabilidade, o VoxAssist interrompeu a espera em vez de manter a tela travada.</p><button id="vxDashRetry" class="primary">Tentar novamente</button> <button id="vxDashFallback" class="secondary">Voltar à Visão Geral</button><small style="display:block;margin-top:8px;color:#718399">Nenhum dado foi alterado por esta falha.</small></div>`;document.querySelector('#vxDashRetry')?.addEventListener('click',()=>{try{window.vxDashboardCoreState&&(window.vxDashboardCoreState.data=null);window.renderDashboard?.(true);}catch(e){console.error('[DashWatchdog]',e);}});document.querySelector('#vxDashFallback')?.addEventListener('click',()=>{try{window.render?.('dashboard');}catch(e){location.reload();}});}
  function arm(){setTimeout(showRecovery,WAIT_MS);}
  const original=window.renderDashboard;
  if(typeof original==='function')window.renderDashboard=async function(){arm();try{return await original.apply(this,arguments);}catch(e){console.error('[DashWatchdog] render failed',e);showRecovery();}};
  document.addEventListener('click',e=>{if(e.target.closest('[data-nav="dashboard"], [data-route="dashboard"]'))arm();},true);
  arm();
})();