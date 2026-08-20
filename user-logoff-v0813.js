/* VoxAssist V0.8.13 — Log-off visível e seguro do usuário */
(function(){
  function doLogout(){
    if(!confirm('Deseja sair do VoxAssist?')) return;
    (async()=>{
      try{
        if(typeof auth==='function') await auth('logout',{});
      }catch(e){}
      try{ if(typeof clearSession==='function') clearSession(); }catch(e){}
      try{
        localStorage.removeItem('vox_session');
        sessionStorage.clear();
      }catch(e){}
      if(typeof loginScreen==='function') loginScreen(); else location.reload();
    })();
  }

  function inject(){
    if(!document.body || document.querySelector('#vxVisibleLogout')) return;
    const sidebar=document.querySelector('.desktop-sidebar,.sidebar');
    if(!sidebar) return;
    const btn=document.createElement('button');
    btn.id='vxVisibleLogout';
    btn.type='button';
    btn.className='vx-visible-logout';
    btn.innerHTML='<span>↪</span><b>SAIR / LOG-OFF</b>';
    btn.title='Encerrar sessão do usuário';
    btn.addEventListener('click',doLogout);
    const version=sidebar.querySelector('.desktop-version');
    if(version) sidebar.insertBefore(btn,version); else sidebar.appendChild(btn);
  }

  const st=document.createElement('style');
  st.textContent=`
    .vx-visible-logout{margin:12px 10px 16px;width:calc(100% - 20px);height:38px;border:1px solid rgba(255,255,255,.2);border-radius:7px;background:rgba(255,255,255,.06);color:#fff;display:flex;align-items:center;gap:9px;justify-content:flex-start;padding:0 12px;cursor:pointer;font-size:11px}
    .vx-visible-logout:hover{background:rgba(255,255,255,.12)}
    .vx-visible-logout span{font-size:16px}.vx-visible-logout b{font-weight:800;letter-spacing:.2px}
  `;
  document.head.appendChild(st);
  document.addEventListener('DOMContentLoaded',inject);
  new MutationObserver(inject).observe(document.documentElement,{childList:true,subtree:true});
})();
