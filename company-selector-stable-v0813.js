/* VoxAssist V0.8.13 — seletor de empresa estável (sem reconstrução durante clique) */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  let switching=false;
  let refreshTimer=null;

  const uid=()=>window.state?.session?.user?.id||null;
  const activeCompany=()=>window.state?.profile?.active_company_id||null;

  async function memberships(){
    if(!uid()) return [];
    try{
      return await api(`user_companies?user_id=eq.${uid()}&active=eq.true&select=company_id,role,is_default,companies(id,legal_name,trade_name,document)&order=is_default.desc`);
    }catch(e){ return []; }
  }

  function header(){ return document.querySelector('header'); }

  function hideLegacySelectors(){
    document.querySelectorAll('#vxHeaderCompanyWrap,.vx-company-switch').forEach(el=>{
      if(el.id!=='vxStableCompanyWrap') el.style.display='none';
    });
  }

  async function mount(force=false){
    if(switching || !window.state?.session) return;
    const h=header(); if(!h) return;
    hideLegacySelectors();

    let wrap=h.querySelector('#vxStableCompanyWrap');
    if(wrap && !force) return;

    const rows=await memberships();
    if(!rows.length){ if(wrap) wrap.remove(); return; }

    if(!wrap){
      wrap=document.createElement('label');
      wrap.id='vxStableCompanyWrap';
      wrap.className='vx-stable-company';
      const logout=h.querySelector('#vxTopLogout,#logout');
      if(logout?.parentElement===h) h.insertBefore(wrap,logout);
      else h.appendChild(wrap);
    }

    const current=String(activeCompany()||'');
    wrap.innerHTML=`<small>EMPRESA ATIVA</small><select id="vxStableCompanySelect">${rows.map(r=>`<option value="${E(r.company_id)}" ${String(r.company_id)===current?'selected':''}>${E(r.companies?.trade_name||r.companies?.legal_name||'EMPRESA')}</option>`).join('')}</select>`;

    const sel=wrap.querySelector('select');
    sel.onmousedown=()=>{ switching=true; };
    sel.onblur=()=>{ setTimeout(()=>{ if(!sel.disabled) switching=false; },120); };
    sel.onchange=async()=>{
      const target=sel.value;
      if(!target || target===String(activeCompany()||'')){ switching=false; return; }
      sel.disabled=true;
      try{
        await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:target})});
        await loadProfile();
        if(String(activeCompany()||'')!==String(target)) throw new Error('A empresa selecionada não foi confirmada pelo servidor.');
        await loadCore();
        switching=false;
        sel.disabled=false;
        await mount(true);
        toast('Empresa ativa alterada com segurança.');
        const currentView=window.state?.view||'dashboard';
        if(typeof window.render==='function') await window.render(currentView);
      }catch(err){
        switching=false;
        sel.disabled=false;
        await mount(true);
        toast('Falha ao trocar de empresa: '+(err?.message||err),'err');
      }
    };
  }

  const style=document.createElement('style');
  style.textContent=`
    #vxHeaderCompanyWrap,.vx-company-switch{display:none!important}
    #vxStableCompanyWrap{margin-left:auto;display:flex!important;flex-direction:column;gap:2px;min-width:210px;max-width:280px;flex:0 0 auto;z-index:30}
    #vxStableCompanyWrap small{font-size:8px;color:#60758c;font-weight:800;line-height:1}
    #vxStableCompanySelect{height:34px;border:1px solid #cbd7e2;border-radius:7px;background:#fff;padding:0 28px 0 10px;font-size:11px;font-weight:700;color:#17324e;min-width:210px}
    #vxStableCompanySelect:disabled{opacity:.7;cursor:wait}
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>mount(true));
  setTimeout(()=>mount(true),300);
  setTimeout(()=>mount(true),1200);

  new MutationObserver(()=>{
    hideLegacySelectors();
    if(switching) return;
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>{
      const h=header();
      if(!h) return;
      if(!h.querySelector('#vxStableCompanyWrap')) mount(true);
    },150);
  }).observe(document.documentElement,{childList:true,subtree:true});
})();
