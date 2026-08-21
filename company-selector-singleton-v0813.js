/* VoxAssist V0.8.13 — seletor único de Empresa Ativa */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  let mountedHeader=null;
  let busy=false;

  function getState(){try{return state}catch{return null}}

  async function memberships(){
    const s=getState(); const uid=s?.session?.user?.id;
    if(!uid||typeof api!=='function')return [];
    try{return await api(`user_companies?user_id=eq.${uid}&active=eq.true&select=company_id,companies(id,legal_name,trade_name)&order=is_default.desc`)}catch{return []}
  }

  function hideAllLegacy(){
    const selectors=[
      '#activeStore','#vxHeaderCompanyWrap','#vxHeaderCompany','#vxCompanySelect',
      '#vxSecureCompanyWrap','#vxSecureCompanySelect','#vxStableCompanyWrap','#vxStableCompanySelect',
      '.vx-company-switch','.vx-header-company','.vx-secure-company','.vx-stable-company'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el=>{
      if(el.id==='vxCanonicalCompanyWrap'||el.id==='vxCanonicalCompanySelect')return;
      const wrap=el.closest?.('label');
      if(wrap&&wrap.id!=='vxCanonicalCompanyWrap')wrap.style.display='none';
      else el.style.display='none';
    });
  }

  async function mount(force=false){
    if(busy)return;
    const s=getState();
    if(!s?.session)return;
    const header=document.querySelector('header'); if(!header)return;
    hideAllLegacy();
    let wrap=header.querySelector('#vxCanonicalCompanyWrap');
    if(wrap&&!force&&mountedHeader===header)return;

    busy=true;
    try{
      const rows=await memberships();
      if(!rows.length){wrap?.remove();return;}
      if(!wrap){
        wrap=document.createElement('label');
        wrap.id='vxCanonicalCompanyWrap';
        wrap.className='vx-canonical-company';
        const user=header.querySelector('.user')||header;
        user.prepend(wrap);
      }
      const active=String(s.profile?.active_company_id||'');
      wrap.innerHTML=`<small>EMPRESA ATIVA</small><select id="vxCanonicalCompanySelect">${rows.map(r=>`<option value="${E(r.company_id)}" ${String(r.company_id)===active?'selected':''}>${E(r.companies?.trade_name||r.companies?.legal_name||'EMPRESA')}</option>`).join('')}</select>`;
      const sel=wrap.querySelector('select');
      sel.onchange=async()=>{
        const target=sel.value;
        const current=String(getState()?.profile?.active_company_id||'');
        if(!target||target===current)return;
        sel.disabled=true;
        try{
          await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:target})});
          if(typeof loadProfile==='function')await loadProfile();
          if(String(getState()?.profile?.active_company_id||'')!==String(target))throw new Error('Servidor não confirmou a empresa selecionada');
          if(typeof loadCore==='function')await loadCore();
          wrap.querySelector('select').disabled=false;
          await mount(true);
          try{toast('Empresa ativa alterada com segurança.')}catch{}
          const v=getState()?.view||'dashboard';
          if(typeof render==='function')await render(v);
        }catch(err){
          try{toast('Falha ao trocar de empresa: '+(err?.message||err),'err')}catch{}
          try{if(typeof loadProfile==='function')await loadProfile()}catch{}
          await mount(true);
        }
      };
      mountedHeader=header;
      hideAllLegacy();
    } finally { busy=false; }
  }

  const style=document.createElement('style');
  style.textContent=`
    #activeStore,#vxHeaderCompanyWrap,#vxSecureCompanyWrap,#vxStableCompanyWrap,.vx-company-switch,.vx-header-company,.vx-secure-company,.vx-stable-company{display:none!important}
    #vxCanonicalCompanyWrap{display:flex!important;flex-direction:column;gap:2px;min-width:210px;margin-right:8px;flex:0 0 auto}
    #vxCanonicalCompanyWrap small{font-size:8px;font-weight:800;color:#60758c;line-height:1}
    #vxCanonicalCompanySelect{height:34px;border:1px solid #cbd7e2;border-radius:7px;background:#fff;padding:0 28px 0 10px;font-size:11px;font-weight:700;color:#17324e;min-width:210px}
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>mount(true),150));
  new MutationObserver(()=>{
    hideAllLegacy();
    const header=document.querySelector('header');
    if(header&&!header.querySelector('#vxCanonicalCompanyWrap'))setTimeout(()=>mount(true),80);
  }).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>mount(true),400);
  setTimeout(()=>mount(true),1200);
})();