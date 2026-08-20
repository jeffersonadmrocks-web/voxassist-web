/* VoxAssist V0.8.13 — Log-off somente no cabeçalho */
(function(){
  function cleanup(){
    document.querySelector('#vxVisibleLogout')?.remove();
    document.querySelectorAll('.vx-visible-logout').forEach(x=>x.remove());
    const btn=document.querySelector('header #logout');
    if(btn){btn.style.display='';btn.title='Encerrar sessão do usuário';}
  }
  document.addEventListener('DOMContentLoaded',cleanup);
  new MutationObserver(cleanup).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(cleanup,100);
})();
