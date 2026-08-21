/* VoxAssist V0.8.13 — contexto de empresa sincronizado com backend */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const uid=()=>state?.session?.user?.id||null;
  let busy=false;

  async function memberships(){
    if(!uid())return [];
    try{return await api(`user_companies?user_id=eq.${uid()}&active=eq.true&select=company_id,companies(id,legal_name,trade_name)&order=is_default.desc`)}catch{return []}
  }

  function removeLegacyCompanySelectors(header){
    if(!header)return;
    header.querySelectorAll('select').forEach(sel=>{
      if(sel.id==='vxCompanyContextSelect')return;
      const id=(sel.id||'').toLowerCase(), cls=(sel.className||'').toString().toLowerCase();
      if(id.includes('store')||id.includes('company')||cls.includes('store')||cls.includes('company')){
        const wrap=sel.closest('label,div');
        if(wrap && !wrap.classList.contains('user')) wrap.remove(); else sel.remove();
      }
    });
    document.querySelectorAll('#activeStore,#vxHeaderCompany,#vxCompanySelect').forEach(x=>{if(x.id!=='vxCompanyContextSelect'){const w=x.closest('label,div');if(w&&w!==header)w.remove();else x.remove();}});
  }

  async function ensureCompanyContext(){
    if(busy||!state?.session)return;
    const header=document.querySelector('header'); if(!header)return;
    busy=true;
    try{
      removeLegacyCompanySelectors(header);
      const rows=await memberships();
      let host=header.querySelector('#vxCompanyContextWrap');
      if(!rows.length){host?.remove();return;}
      if(!host){host=document.createElement('label');host.id='vxCompanyContextWrap';host.className='vx-company-context-wrap';const actions=header.querySelector('.vx-header-actions')||header.querySelector('.user')||header;actions.prepend(host)}
      const active=String(state?.profile?.active_company_id||'');
      host.innerHTML=`<small>EMPRESA ATIVA</small><select id="vxCompanyContextSelect">${rows.map(r=>`<option value="${E(r.company_id)}" ${String(r.company_id)===active?'selected':''}>${E(r.companies?.trade_name||r.companies?.legal_name||'EMPRESA')}</option>`).join('')}</select>`;
      const sel=host.querySelector('select');
      sel.onchange=async()=>{
        const target=sel.value;sel.disabled=true;
        try{
          await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:target})});
          await loadProfile();
          if(String(state?.profile?.active_company_id||'')!==String(target)) throw new Error('A empresa ativa não foi confirmada pelo servidor.');
          await loadCore();
          shell();
          setTimeout(async()=>{await ensureCompanyContext();window.render?.('dashboard')},0);
          toast('Empresa ativa alterada com segurança.');
        }catch(err){
          toast('Falha ao trocar de empresa: '+err.message,'err');
          try{await loadProfile()}catch{}
          setTimeout(ensureCompanyContext,0);
        }
      };
    } finally {busy=false;}
  }

  const style=document.createElement('style');
  style.textContent=`.vx-company-context-wrap{display:flex;flex-direction:column;gap:2px;min-width:210px}.vx-company-context-wrap small{font-size:8px;font-weight:800;color:#60758c}.vx-company-context-wrap select{height:34px;border:1px solid #cbd7e2;border-radius:7px;background:#fff;padding:0 10px;font-size:11px;font-weight:700;color:#17324e}`;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureCompanyContext,250));
  new MutationObserver(()=>setTimeout(ensureCompanyContext,50)).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(ensureCompanyContext,500);
})();
