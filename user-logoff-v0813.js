/* VoxAssist V0.8.13 — Log-off oficial somente no cabeçalho */
(function(){
  async function doLogout(){
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
    if(!window.state?.session) return;
    const header=document.querySelector('header');
    if(!header) return;
    let btn=header.querySelector('#logout');
    if(!btn){
      btn=document.createElement('button');
      btn.id='logout';
      btn.type='button';
      btn.className='secondary';
      btn.textContent='Sair';
      btn.style.marginLeft='10px';
      btn.style.flex='0 0 auto';
      const target=header.querySelector('.user')||header;
      target.appendChild(btn);
    }
    btn.style.display='';
    btn.title='Encerrar sessão do usuário';
    if(!btn.dataset.vxBound){btn.dataset.vxBound='1';btn.addEventListener('click',doLogout);}
  }

  document.addEventListener('DOMContentLoaded',ensureHeaderLogout);
  new MutationObserver(ensureHeaderLogout).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(ensureHeaderLogout,100);
  setTimeout(ensureHeaderLogout,800);
})();
