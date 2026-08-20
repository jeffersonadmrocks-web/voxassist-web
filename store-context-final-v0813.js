/* VoxAssist V0.8.13 — regra definitiva: Loja Ativa + Configuração global do Gestor */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const uid=()=>state?.session?.user?.id||null;

  async function allowedStores(){
    if(!uid()) return [];
    if(isGestor()) return await api('stores?select=id,name,code,company_id,active,companies(id,trade_name,legal_name,active)&active=eq.true&order=name').catch(()=>[]);
    const links=await api(`user_store_access?user_id=eq.${uid()}&select=store_id`).catch(()=>[]);
    const ids=links.map(x=>x.store_id).filter(Boolean); if(!ids.length) return [];
    return await api(`stores?id=in.(${ids.join(',')})&active=eq.true&select=id,name,code,company_id,active,companies(id,trade_name,legal_name,active)&order=name`).catch(()=>[]);
  }

  async function populateStoreSelector(){
    const sel=document.querySelector('#activeStore'); if(!sel) return;
    const label=sel.closest('label'); const small=label?.querySelector('small'); if(small) small.textContent='LOJA ATIVA';
    const stores=await allowedStores();
    const current=state?.profile?.store_id;
    sel.innerHTML=stores.length?stores.map(s=>`<option value="${E(s.id)}" ${String(s.id)===String(current)?'selected':''}>${E(s.code||s.name)}</option>`).join(''):'<option value="">NENHUMA LOJA LIBERADA</option>';
    sel.disabled=stores.length<2;
    sel.onchange=async()=>{
      if(!sel.value||String(sel.value)===String(state?.profile?.store_id))return;
      const keep=state.view||'dashboard'; sel.disabled=true;
      try{
        await api('rpc/switch_store',{method:'POST',body:JSON.stringify({target_store:sel.value})});
        await loadProfile(); await loadCore(); shell(); await render(keep==='usuarios'?'usuarios':'dashboard'); toast('Loja ativa alterada.');
      }catch(e){toast('Falha ao trocar de loja: '+e.message,'err'); sel.disabled=false;}
    };
  }

  async function globalConfigView(){
    if(state?.view!=='usuarios'||!isGestor())return;
    const page=document.querySelector('.vx-admin-page'); if(!page)return;
    const companyCard=page.querySelector('.vx-admin-grid .vx-admin-card:first-child');
    const storeCard=page.querySelector('.vx-admin-grid .vx-admin-card:nth-child(2)');
    const [companies,stores]=await Promise.all([
      api('companies?select=*&order=trade_name.nullslast,legal_name').catch(()=>[]),
      api('stores?select=id,name,code,company_id,active,companies(id,trade_name,legal_name)&order=name').catch(()=>[])
    ]);
    if(companyCard){
      const title=companyCard.querySelector('.vx-admin-title h3'); if(title)title.textContent='EMPRESAS / CNPJ';
      companyCard.querySelectorAll('.vx-company-actions-inline em,[data-use]').forEach(x=>x.remove());
      companyCard.querySelectorAll('.vx-company-actions-inline span').forEach(x=>{ if(x.textContent.trim()==='ATIVA'||x.textContent.trim()==='DISPONÍVEL')x.textContent='ATIVA'; });
    }
    if(storeCard){
      const title=storeCard.querySelector('.vx-admin-title h3'); if(title)title.textContent='TODAS AS LOJAS / UNIDADES';
      const badge=storeCard.querySelector('.vx-admin-title span'); if(badge)badge.textContent=String(stores.length);
      [...storeCard.children].forEach(ch=>{if(!ch.classList.contains('vx-admin-title'))ch.remove()});
      stores.forEach(s=>{const r=document.createElement('div');r.className='vx-company-row';r.innerHTML=`<div><b>${E(s.code||s.name)}</b><small>${E(s.companies?.trade_name||s.companies?.legal_name||'EMPRESA')} • ${E(s.name)}</small></div><span class="${s.active?'vx-ok':'vx-off'}">${s.active?'ATIVA':'INATIVA'}</span>`;storeCard.appendChild(r)});
    }
    const hero=page.querySelector('.vx-admin-hero p'); if(hero)hero.textContent='Área administrativa global do Gestor: empresas, lojas/unidades, usuários e permissões. A Loja Ativa do cabeçalho controla apenas a operação diária.';
  }

  async function enhanceUserModal(){
    if(!isGestor())return;
    const modal=document.querySelector('#vxAdminModal'); const form=modal?.querySelector('#vxUserForm'); if(!form||form.dataset.vxStores==='1')return;
    form.dataset.vxStores='1';
    const stores=await api('stores?select=id,name,code,company_id,active,companies(trade_name,legal_name)&active=eq.true&order=name').catch(()=>[]);
    const oldSelect=form.querySelector('select[name=store]');
    if(oldSelect){
      const wrap=document.createElement('div');wrap.className='vx-user-store-access';
      wrap.innerHTML=`<label>LOJAS DE ACESSO *</label><div class="vx-store-checks">${stores.map(s=>`<label><input type="checkbox" name="vx_store_access" value="${E(s.id)}"> <b>${E(s.code||s.name)}</b><small>${E(s.companies?.trade_name||s.companies?.legal_name||'')}</small></label>`).join('')}</div><small>Selecione no mínimo uma loja. No cabeçalho, o usuário verá somente as lojas liberadas aqui.</small>`;
      oldSelect.parentElement?.insertBefore(wrap,oldSelect); oldSelect.style.display='none';
    }
    const original=form.onsubmit;
    form.onsubmit=async function(e){
      const checked=[...form.querySelectorAll('input[name=vx_store_access]:checked')].map(x=>x.value);
      if(!checked.length){e.preventDefault();toast('Selecione no mínimo uma loja de acesso.','err');return false;}
      const primary=form.querySelector('select[name=store]');
      const activeCompany=String(state?.profile?.active_company_id||'');
      const selectedStores=checked.map(id=>stores.find(s=>String(s.id)===String(id))).filter(Boolean);
      const primaryStore=selectedStores.find(s=>String(s.company_id)===activeCompany)||selectedStores[0];
      if(primary) primary.value=primaryStore?.id||checked[0];
      if(original) await original.call(form,e);
      setTimeout(async()=>{
        try{
          const email=String(form.querySelector('input[name=email]')?.value||'').trim(); if(!email)return;
          const p=await api(`profiles?email=eq.${encodeURIComponent(email)}&select=id,role`); const userId=p?.[0]?.id; if(!userId)return;
          await api(`user_store_access?user_id=eq.${userId}`,{method:'DELETE'}).catch(()=>{});
          const companies=[...new Set(selectedStores.map(s=>s.company_id).filter(Boolean))];
          for(const cid of companies){
            await api('user_companies',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:userId,company_id:cid,role:String(form.querySelector('select[name=role]')?.value||'ATENDENTE'),active:true})}).catch(()=>{});
          }
          for(const s of selectedStores){
            await api('user_store_access',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:userId,store_id:s.id,company_id:s.company_id})}).catch(()=>{});
          }
        }catch(err){console.warn('Falha ao completar acessos multi-loja',err);}
      },900);
    };
  }

  const mo=new MutationObserver(()=>{setTimeout(()=>{populateStoreSelector();globalConfigView();enhanceUserModal()},30)});
  mo.observe(document.documentElement,{childList:true,subtree:true});
  const prior=window.render; window.render=async function(view){const r=await prior(view);setTimeout(()=>{populateStoreSelector();if(view==='usuarios')globalConfigView()},60);return r};

  const st=document.createElement('style');st.textContent=`.vx-user-store-access{display:grid;gap:7px;margin:8px 0}.vx-store-checks{display:grid;gap:5px;padding:8px;border:1px solid #dbe5ee;border-radius:7px;background:#f8fafc}.vx-store-checks label{display:grid;grid-template-columns:20px 1fr auto;align-items:center;gap:5px;font-size:10px}.vx-store-checks small{font-size:8px;color:#718397}`;document.head.appendChild(st);
})();