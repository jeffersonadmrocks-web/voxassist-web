/* VoxAssist V0.8.13 — ativa o Dashboard aprovado sem alterar o roteador principal */
(function(){
  'use strict';
  let busy=false;
  let timer=null;

  function isDashboard(){
    try{return typeof state!=='undefined' && !!state.session && state.view==='dashboard';}
    catch(_){return false;}
  }

  async function ensureApprovedDashboard(){
    if(busy || !isDashboard()) return;
    const app=document.querySelector('#app');
    if(!app || typeof window.renderDashboard!=='function') return;
    if(app.querySelector('.vx-approved')) return;
    busy=true;
    try{await window.renderDashboard();}
    catch(e){console.error('Falha ao ativar Dashboard aprovado',e);}
    finally{busy=false;}
  }

  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(ensureApprovedDashboard,60);
  }

  window.addEventListener('load',()=>setTimeout(ensureApprovedDashboard,250),{once:true});
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-view="dashboard"]');
    if(nav)setTimeout(ensureApprovedDashboard,80);
  },true);

  const obs=new MutationObserver(()=>{
    if(isDashboard() && !document.querySelector('#app .vx-approved')) schedule();
  });
  obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(ensureApprovedDashboard,800);
})();