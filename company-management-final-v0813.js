/* VoxAssist V0.8.13 — Loja Ativa estável + Configuração global do Gestor */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const uid=()=>state?.session?.user?.id||null;
  let selectorBusy=false;

  async function allowedStores(){
    if(!uid()) return [];
    const links=await api(`user_store_access?user_id=eq.${uid()}&select=store_id,company_id`).catch(()=>[]);
    let ids=(links||[]).map(x=>x.store_id).filter(Boolean);
    if(isGestor() && !ids.length){
      const memberships=await api(`user_companies?user_id=eq.${uid()}&active=eq.true&select=company_id`).catch(()=>[]);
      const cids=(memberships||[]).map(x=>x.company_id).filter(Boolean);
      if(cids.length){
        const all=await api(`stores?company_id=in.(${cids.join(',')})&active=eq.true&select=id,name,code,company_id,active&order=name`);
        return all||[];
      }
    }
    if(!ids.length) return [];
    return await api(`stores?id=in.(${ids.join(',')})&active=eq.true&select=id,name,code,company_id,active&order=name`).catch(()=>[]);
  }

  async function populateStoreSelector(force=false){
    const sel=document.querySelector('#activeStore');
    if(!sel||selectorBusy)return;
    selectorBusy=true;
    try{
      const small=sel.closest('label')?.querySelector('small'); if(small)small.textContent='LOJA ATIVA';
      const stores=await allowedStores();
      if(!stores.length){
        if(force || !sel.options.length) sel.innerHTML='<option value="">NENHUMA LOJA LIBERADA</option>';
        sel.disabled=true; return;
      }
      const current=state?.profile?.store_id;
      sel.innerHTML=stores.map(s=>`<option value="${E(s.id)}" ${String(s.id)===String(current)?'selected':''}>${E(s.code||s.name)}</option>`).join('');
      sel.disabled=stores.length<2;
      sel.onchange=async()=>{
        if(!sel.value||String(sel.value)===String(state?.profile?.store_id))return;
        sel.disabled=true;
        try{
          await api('rpc/switch_store',{method:'POST',body:JSON.stringify({target_store:sel.value})});
          await loadProfile();await loadCore();
          const keep=state.view||'dashboard';shell();await window.render(keep==='usuarios'?'usuarios':'dashboard');toast('Loja ativa alterada.');
        }catch(err){toast('Falha ao trocar de loja: '+err.message,'err');sel.disabled=false;}
      };
    }catch(err){console.error('Loja ativa:',err);}
    finally{selectorBusy=false;}
  }

  // C6 (Matriz Mestra de Configurações, resolvido 2026-09-09): a
  // função applyGlobalGestorView() foi removida -- já era código
  // morto autoconfirmado (comentário do usuário em 2026-09-07: guard
  // `.vx-admin-grid` nunca casava com o DOM real de company-only-
  // mode-v0813.js, função nunca executava). company-hierarchy-v0813.js
  // e company-multilist-fix-v0813.js têm o mesmo guard morto -- fora
  // do escopo estrito do C6 (formulário de empresa), registrado na
  // Matriz Mestra como achado pra limpeza futura, não removidos aqui.

  async function enhanceUserModal(){
    if(!isGestor())return;
    const form=document.querySelector('#vxAdminModal #vxUserForm');if(!form||form.dataset.vxStores==='1')return;
    const old=form.querySelector('select[name=store]');if(!old)return;
    form.dataset.vxStores='1';
    const stores=await allowedStores();
    const wrap=document.createElement('div');wrap.className='vx-user-store-access';
    wrap.innerHTML=`<label>LOJAS DE ACESSO *</label><div class="vx-store-checks">${stores.map(s=>`<label><input type="checkbox" name="vx_store_access" value="${E(s.id)}"> <b>${E(s.code||s.name)}</b></label>`).join('')}</div><small>O usuário verá no cabeçalho somente as lojas marcadas aqui.</small>`;
    old.parentElement?.insertBefore(wrap,old);old.style.display='none';
    const original=form.onsubmit;
    form.onsubmit=async function(e){
      const checked=[...form.querySelectorAll('[name=vx_store_access]:checked')].map(x=>x.value);
      if(!checked.length){e.preventDefault();toast('Selecione no mínimo uma loja de acesso.','err');return false;}
      old.value=checked[0];
      if(original)await original.call(form,e);
      setTimeout(async()=>{try{const email=encodeURIComponent(String(form.querySelector('[name=email]')?.value||'').trim());const p=await api(`profiles?email=eq.${email}&select=id`);const userId=p?.[0]?.id;if(!userId)return;await api(`user_store_access?user_id=eq.${userId}`,{method:'DELETE'}).catch(()=>{});for(const sid of checked){const s=stores.find(x=>x.id===sid);await api('user_store_access',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:userId,store_id:sid,company_id:s?.company_id||null})})}}catch(err){console.error(err)}},900);
    };
  }

  document.addEventListener('click',e=>{if(e.target.closest('#vxNewUser'))setTimeout(enhanceUserModal,80)});
  const prior=window.render;
  window.render=async function(view){const r=await prior(view);setTimeout(()=>{populateStoreSelector()},120);return r};
  setTimeout(()=>populateStoreSelector(true),500);
  const st=document.createElement('style');st.textContent='.vx-user-store-access{display:grid;gap:7px;margin:8px 0}.vx-store-checks{display:grid;gap:5px;padding:8px;border:1px solid #dbe5ee;border-radius:7px;background:#f8fafc}.vx-store-checks label{display:flex;align-items:center;gap:6px;font-size:10px}';document.head.appendChild(st);
})();