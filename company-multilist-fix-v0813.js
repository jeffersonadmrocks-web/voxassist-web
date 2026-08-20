/* VoxAssist V0.8.13 — corrige listagem multiempresa usando vínculos do usuário */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const uid=()=>state?.session?.user?.id||null;

  async function loadMembershipCompanies(){
    const id=uid(); if(!id) return [];
    try{
      return await api(`user_companies?user_id=eq.${id}&active=eq.true&select=company_id,role,is_default,store_id,companies(id,legal_name,trade_name,document,code)&order=is_default.desc`);
    }catch(e){ return []; }
  }

  async function fixCompanyCard(){
    if(state?.view!=='usuarios') return;
    const page=document.querySelector('.vx-admin-page');
    if(!page) return;
    const rows=await loadMembershipCompanies();
    if(!rows.length) return;
    const card=page.querySelector('.vx-admin-grid .vx-admin-card:first-child');
    if(!card) return;
    const title=card.querySelector('.vx-admin-title h3');
    if(title) title.textContent='EMPRESAS / CNPJ';
    const badge=card.querySelector('.vx-admin-title span');
    if(badge) badge.textContent=String(rows.length);
    [...card.children].forEach(ch=>{ if(!ch.classList.contains('vx-admin-title')) ch.remove(); });
    rows.forEach(r=>{
      const c=r.companies||{};
      const active=String(r.company_id)===String(state.profile?.active_company_id);
      const row=document.createElement('div');
      row.className='vx-company-row '+(active?'active':'');
      row.innerHTML=`<div><b>${E(c.trade_name||c.legal_name||'EMPRESA')}</b><small>${E(c.legal_name||'')}${c.document?' • CNPJ/CPF '+E(c.document):''}</small></div><div class="vx-company-actions-inline"><span>${active?'ATIVA':'DISPONÍVEL'}</span>${active?'':`<button type="button" class="vx-activate-company" data-company="${E(r.company_id)}">USAR ESTA EMPRESA</button>`}<button type="button" class="vx-edit-company" data-company="${E(r.company_id)}">ALTERAR</button></div>`;
      card.appendChild(row);
    });
    card.querySelectorAll('.vx-activate-company').forEach(b=>b.onclick=async e=>{
      e.preventDefault(); e.stopPropagation(); b.disabled=true;
      try{
        await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:b.dataset.company})});
        if(typeof loadProfile==='function') await loadProfile();
        if(typeof loadCore==='function') await loadCore();
        toast('Empresa ativa alterada.');
        await window.render('usuarios');
      }catch(err){ toast('Não foi possível trocar de empresa: '+err.message,'err'); b.disabled=false; }
    });
  }

  const mo=new MutationObserver(()=>{ if(state?.view==='usuarios') setTimeout(fixCompanyCard,30); });
  mo.observe(document.documentElement,{childList:true,subtree:true});
  const prior=window.render;
  window.render=async function(view){ const r=await prior(view); if(view==='usuarios') setTimeout(fixCompanyCard,50); return r; };

  const st=document.createElement('style');
  st.textContent=`.vx-company-actions-inline{display:flex;align-items:center;gap:7px}.vx-company-actions-inline>span{font-size:8px;font-weight:800;color:#60758c}.vx-company-row.active .vx-company-actions-inline>span{color:#16834b}.vx-company-actions-inline button{min-height:28px;padding:3px 8px;font-size:8px;border:1px solid #b8c9da;background:#fff;color:#164f80;cursor:pointer}.vx-activate-company{font-weight:800}`;
  document.head.appendChild(st);
})();
