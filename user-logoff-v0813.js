/* VoxAssist V0.8.13 — cabeçalho seguro e seletor de empresa estável */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const getState=()=>{ try{return (typeof state!=='undefined'&&state)?state:null}catch{return null} };
  let remountTimer=null;

  async function doLogout(){
    // Achado do usuário em 2026-09-02 (pacote fila/robô/presença):
    // "Offline: logout explícito" precisa de um sinal próprio, não só
    // esperar o heartbeat vencer -- grava ANTES de derrubar a sessão
    // (depois disso a chamada não teria mais auth.uid() válido pra
    // RLS). Nunca trava o logout se isso falhar.
    try{
      const s=getState();
      const uid=s?.session?.user?.id;
      if(uid&&typeof api==='function')await api('user_presence',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:uid,company_id:s?.profile?.active_company_id||null,logged_out_at:new Date().toISOString()})});
    }catch(e){}
    try{ if(typeof auth==='function') await auth('logout',{}); }catch(e){}
    try{ if(typeof clearSession==='function') clearSession(); }catch(e){}
    try{ localStorage.removeItem('vox_session'); }catch(e){}
    try{ if(typeof loginScreen==='function') loginScreen(); else location.reload(); }catch(e){ location.reload(); }
  }

  function cleanupLegacyLogout(){
    document.querySelectorAll('.vx-visible-logout,#vxVisibleLogout,.sidebar #logout,.sidebar [data-logout]').forEach(x=>x.remove());
  }

  function ensureHeaderLogout(){
    cleanupLegacyLogout();
    const s=getState(); if(!s?.session)return;
    const header=document.querySelector('header');if(!header)return;
    let btn=header.querySelector('#logout');
    if(!btn){btn=document.createElement('button');btn.id='logout';btn.type='button';btn.className='secondary';btn.textContent='Sair';btn.style.marginLeft='10px';btn.style.flex='0 0 auto';(header.querySelector('.user')||header).appendChild(btn)}
    // Achado do usuário em 2026-09-02: desktop-layout-patch.js cria este
    // botão com classe sr-only (técnica de acessibilidade via
    // position/clip com !important, não display:none -- ver .sr-only em
    // desktop-layout.css). Só resetar btn.style.display não desfazia
    // isso -- !important na classe vence estilo inline não-important, o
    // botão continuava clipado em 1x1px, tecnicamente no DOM mas
    // invisível. Precisa remover a classe pra a regra parar de valer.
    btn.classList.remove('sr-only');
    btn.style.display='';btn.style.marginLeft='10px';btn.style.flex='0 0 auto';
    btn.title='Encerrar sessão do usuário';
    if(!btn.dataset.vxBound){btn.dataset.vxBound='1';btn.addEventListener('click',doLogout)}
  }

  // C4 (Matriz Mestra de Configurações, resolvido 2026-09-09): este
  // arquivo tinha seu próprio seletor de empresa ativa
  // (#vxStableCompanyWrap/#vxStableCompanySelect), concorrente com
  // outros 3. company-selector-singleton-v0813.js é o único que de
  // fato aparece pro usuário -- removido o seletor duplicado daqui,
  // mantendo só a responsabilidade real deste arquivo (o botão SAIR,
  // com o fix de sr-only documentado acima).
  function ensureAll(){ensureHeaderLogout()}

  document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureAll,100));
  new MutationObserver(()=>{
    clearTimeout(remountTimer);
    remountTimer=setTimeout(()=>{
      const header=document.querySelector('header');
      if(header&&!header.querySelector('#logout'))ensureAll();
    },200);
  }).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(ensureAll,300);setTimeout(ensureAll,1000);
})();
