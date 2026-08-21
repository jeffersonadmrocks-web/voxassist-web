/* VoxAssist V0.8.13 — cabeçalho seguro: Empresa Ativa + Sair */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  let syncing=false;

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
    const header=document.querySelector('header'); if(!header) return;
    let btn=header.querySelector('#logout');
    if(!btn){btn=document.createElement('button');btn.id='logout';btn.type='button';btn.className='secondary';btn.textContent='Sair';btn.style.marginLeft='10px';btn.style.flex='0 0 auto';(header.querySelector('.user')||header).appendChild(btn)}
    btn.style.display='';btn.title='Encerrar sessão do usuário';
    if(!btn.dataset.vxBound){btn.dataset.vxBound='1';btn.addEventListener('click',doLogout)}
  }

  async function memberships(){
    const id=window.state?.session?.user?.id;if(!id||typeof api!=='function')return [];
    try{return await api(`user_companies?user_id=eq.${id}&active=eq.true&select=company_id,companies(id,legal_name,trade_name)&order=is_default.desc`)}catch{return []}
  }

  function removeLegacyCompanySelectors(header){
    if(!header)return;
    document.querySelectorAll('#activeStore,#vxHeaderCompany,#vxCompanySelect,#vxHeaderCompanyWrap,.vx-company-switch').forEach(el=>{
      if(el.id==='vxSecureCompanySelect'||el.id==='vxSecureCompanyWrap')return;
      const wrap=el.closest?.('label');
      if(wrap&&wrap.id!=='vxSecureCompanyWrap')wrap.remove();else if(el.id!=='vxSecureCompanyWrap')el.remove();
    });
    header.querySelectorAll('select').forEach(sel=>{
      if(sel.id==='vxSecureCompanySelect')return;
      const id=(sel.id||'').toLowerCase(),cl=(sel.className||'').toString().toLowerCase();
      if(id.includes('store')||id.includes('company')||cl.includes('store')||cl.includes('company')){
        const wrap=sel.closest('label');if(wrap)wrap.remove();else sel.remove();
      }
    });
  }

  async function ensureSecureCompany(){
    if(syncing||!window.state?.session)return;
    const header=document.querySelector('header');if(!header)return;
    syncing=true;
    try{
      removeLegacyCompanySelectors(header);
      const rows=await memberships();
      let wrap=header.querySelector('#vxSecureCompanyWrap');
      if(!rows.length){wrap?.remove();return;}
      if(!wrap){wrap=document.createElement('label');wrap.id='vxSecureCompanyWrap';wrap.className='vx-secure-company';const user=header.querySelector('.user')||header;user.prepend(wrap)}
      const active=String(window.state?.profile?.active_company_id||'');
      wrap.innerHTML=`<small>EMPRESA ATIVA</small><select id="vxSecureCompanySelect">${rows.map(r=>`<option value="${E(r.company_id)}" ${String(r.company_id)===active?'selected':''}>${E(r.companies?.trade_name||r.companies?.legal_name||'EMPRESA')}</option>`).join('')}</select>`;
      const sel=wrap.querySelector('select');
      sel.onchange=async()=>{
        const target=sel.value;sel.disabled=true;
        try{
          await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:target})});
          if(typeof loadProfile==='function')await loadProfile();
          if(String(window.state?.profile?.active_company_id||'')!==String(target))throw new Error('Servidor não confirmou a empresa selecionada');
          if(typeof loadCore==='function')await loadCore();
          if(typeof shell==='function')shell();
          setTimeout(()=>{ensureHeader();try{window.render?.('dashboard')}catch{}},0);
          try{toast('Empresa ativa alterada com segurança.')}catch{}
        }catch(err){try{toast('Falha ao trocar de empresa: '+err.message,'err')}catch{};try{await loadProfile()}catch{};setTimeout(ensureHeader,0)}
      };
    }finally{syncing=false}
  }

  function ensureHeader(){ensureHeaderLogout();ensureSecureCompany()}

  const style=document.createElement('style');
  style.textContent='.vx-secure-company{display:flex;flex-direction:column;gap:2px;min-width:210px;margin-right:8px}.vx-secure-company small{font-size:8px;font-weight:800;color:#60758c}.vx-secure-company select{height:34px;border:1px solid #cbd7e2;border-radius:7px;background:#fff;padding:0 10px;font-size:11px;font-weight:700;color:#17324e}';
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureHeader,100));
  new MutationObserver(()=>setTimeout(ensureHeader,30)).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(ensureHeader,300);setTimeout(ensureHeader,1000);
})();
