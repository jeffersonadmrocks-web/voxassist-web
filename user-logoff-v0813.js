/* VoxAssist V0.8.13 — cabeçalho seguro e seletor de empresa estável */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  let switching=false;
  let remountTimer=null;

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
    if(!window.state?.session)return;
    const header=document.querySelector('header');if(!header)return;
    let btn=header.querySelector('#logout');
    if(!btn){btn=document.createElement('button');btn.id='logout';btn.type='button';btn.className='secondary';btn.textContent='Sair';btn.style.marginLeft='10px';btn.style.flex='0 0 auto';(header.querySelector('.user')||header).appendChild(btn)}
    btn.style.display='';btn.title='Encerrar sessão do usuário';
    if(!btn.dataset.vxBound){btn.dataset.vxBound='1';btn.addEventListener('click',doLogout)}
  }

  async function memberships(){
    const id=window.state?.session?.user?.id;if(!id||typeof api!=='function')return [];
    try{return await api(`user_companies?user_id=eq.${id}&active=eq.true&select=company_id,companies(id,legal_name,trade_name)&order=is_default.desc`)}catch{return []}
  }

  function hideLegacyCompanySelectors(){
    document.querySelectorAll('#activeStore,#vxHeaderCompanyWrap,.vx-company-switch').forEach(el=>{if(el.id!=='vxStableCompanyWrap')el.style.display='none'});
  }

  async function mountStableSelector(force=false){
    if(switching||!window.state?.session)return;
    const header=document.querySelector('header');if(!header)return;
    hideLegacyCompanySelectors();
    let wrap=header.querySelector('#vxStableCompanyWrap');
    if(wrap&&!force)return;

    const rows=await memberships();
    if(!rows.length){wrap?.remove();return;}
    if(!wrap){
      wrap=document.createElement('label');wrap.id='vxStableCompanyWrap';wrap.className='vx-stable-company';
      const user=header.querySelector('.user')||header;user.prepend(wrap);
    }
    const active=String(window.state?.profile?.active_company_id||'');
    wrap.innerHTML=`<small>EMPRESA ATIVA</small><select id="vxStableCompanySelect">${rows.map(r=>`<option value="${E(r.company_id)}" ${String(r.company_id)===active?'selected':''}>${E(r.companies?.trade_name||r.companies?.legal_name||'EMPRESA')}</option>`).join('')}</select>`;
    const sel=wrap.querySelector('select');

    sel.addEventListener('pointerdown',()=>{switching=true});
    sel.addEventListener('blur',()=>setTimeout(()=>{if(!sel.disabled)switching=false},150));
    sel.addEventListener('change',async()=>{
      const target=sel.value;
      if(!target||target===String(window.state?.profile?.active_company_id||'')){switching=false;return;}
      sel.disabled=true;
      try{
        await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:target})});
        if(typeof loadProfile==='function')await loadProfile();
        if(String(window.state?.profile?.active_company_id||'')!==String(target))throw new Error('Servidor não confirmou a empresa selecionada');
        if(typeof loadCore==='function')await loadCore();
        switching=false;sel.disabled=false;
        await mountStableSelector(true);
        try{toast('Empresa ativa alterada com segurança.')}catch{}
        const view=window.state?.view||'dashboard';
        if(typeof window.render==='function')await window.render(view);
      }catch(err){
        switching=false;sel.disabled=false;
        try{await loadProfile()}catch{}
        await mountStableSelector(true);
        try{toast('Falha ao trocar de empresa: '+(err?.message||err),'err')}catch{}
      }
    });
  }

  function ensureAll(){ensureHeaderLogout();hideLegacyCompanySelectors();if(!switching)mountStableSelector(false)}

  const style=document.createElement('style');
  style.textContent='#vxHeaderCompanyWrap,.vx-company-switch{display:none!important}#vxStableCompanyWrap{display:flex!important;flex-direction:column;gap:2px;min-width:210px;margin-right:8px;flex:0 0 auto;z-index:50}#vxStableCompanyWrap small{font-size:8px;font-weight:800;color:#60758c;line-height:1}#vxStableCompanySelect{height:34px;border:1px solid #cbd7e2;border-radius:7px;background:#fff;padding:0 28px 0 10px;font-size:11px;font-weight:700;color:#17324e;min-width:210px}#vxStableCompanySelect:disabled{opacity:.7;cursor:wait}';
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureAll,100));
  new MutationObserver(()=>{
    hideLegacyCompanySelectors();
    if(switching)return;
    clearTimeout(remountTimer);
    remountTimer=setTimeout(()=>{
      const header=document.querySelector('header');
      if(header&&!header.querySelector('#vxStableCompanyWrap'))ensureAll();
    },150);
  }).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(ensureAll,300);setTimeout(ensureAll,1000);
})();
