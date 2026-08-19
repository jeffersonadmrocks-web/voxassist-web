/* VoxAssist V0.8.12 — cadastro de usuário com e-mail + múltiplas lojas, sem opção TODAS */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const roles=['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'];

  async function openUserModal(){
    if(state?.profile?.role!=='GESTOR')return toast('Somente gestor pode cadastrar usuários.','err');
    let stores=[];
    try{stores=await api(`stores?company_id=eq.${state.profile.active_company_id}&active=eq.true&select=id,name,code&order=name`)}catch(e){return toast('Não foi possível carregar as lojas: '+e.message,'err')}
    if(!stores.length)return toast('Cadastre ao menos uma loja antes de criar usuários.','err');
    document.querySelector('#vxAdminModal')?.remove();
    const ov=document.createElement('div');ov.id='vxAdminModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>Cadastrar Usuário</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxUserForm2" class="vx-admin-form">
      <label>NOME COMPLETO *</label><input name="name" required autocomplete="name">
      <label>E-MAIL DO USUÁRIO *</label><input name="email" type="email" required autocomplete="email" placeholder="usuario@empresa.com.br">
      <div class="vx-form-2"><div><label>SENHA INICIAL *</label><input name="password" type="password" minlength="6" required autocomplete="new-password"></div><div><label>PERFIL *</label><select name="role">${roles.map(r=>`<option value="${r}">${r}</option>`).join('')}</select></div></div>
      <label>LOJAS QUE O USUÁRIO PODERÁ ACESSAR *</label>
      <div class="vx-store-checks">${stores.map(s=>`<label class="vx-store-check"><input type="checkbox" name="store_ids" value="${E(s.id)}"><span><b>${E(s.name)}</b><small>${E(s.code||'')}</small></span></label>`).join('')}</div>
      <small class="vx-help">Marque uma ou mais lojas. Não existe acesso automático a todas as lojas.</small>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">CRIAR USUÁRIO</button></div>
    </form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('[data-close]').onclick=()=>ov.remove();ov.querySelector('[data-cancel]').onclick=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)ov.remove()};
    ov.querySelector('#vxUserForm2').onsubmit=async e=>{
      e.preventDefault();const f=new FormData(e.target);const storeIds=f.getAll('store_ids');if(!storeIds.length)return toast('Selecione pelo menos uma loja para o usuário.','err');
      const btn=e.submitter;btn.disabled=true;
      try{
        const r=await fetch(CFG.url+'/functions/v1/voxassist-manage-user',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({full_name:f.get('name'),email:f.get('email'),password:f.get('password'),role:f.get('role'),store_ids:storeIds,company_id:state.profile.active_company_id})});
        const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao criar usuário');
        ov.remove();toast('Usuário cadastrado com e-mail e lojas autorizadas.');
        if(typeof render==='function')await render('usuarios');
      }catch(err){toast('Falha ao cadastrar usuário: '+err.message,'err');btn.disabled=false;}
    };
  }

  async function decorateUserTable(){
    const btn=document.querySelector('#vxNewUser');
    if(btn&&!btn.dataset.vxStoreFixed){
      btn.dataset.vxStoreFixed='1';
      const clone=btn.cloneNode(true);btn.replaceWith(clone);clone.onclick=openUserModal;
    }
    const rows=document.querySelectorAll('.vx-admin-card table tbody tr');
    for(const tr of rows){
      const first=tr.querySelector('td b');if(!first)continue;
      const cells=tr.querySelectorAll('td');if(cells.length<4)continue;
      const userName=first.textContent.trim();
      if(cells[3].textContent.includes('TODAS / SEM LOJA'))cells[3].textContent='SEM LOJA DEFINIDA';
    }
  }

  const style=document.createElement('style');style.textContent=`.vx-store-checks{display:grid;grid-template-columns:1fr 1fr;gap:7px;border:1px solid #d9e2ea;border-radius:8px;padding:8px;background:#f8fafc}.vx-store-check{display:flex!important;align-items:center;gap:8px;border:1px solid #dce5ed;border-radius:7px;padding:8px;background:#fff;cursor:pointer}.vx-store-check input{width:16px;height:16px;margin:0}.vx-store-check span{display:flex;flex-direction:column}.vx-store-check b{font-size:11px;color:#17324e}.vx-store-check small,.vx-help{font-size:9px;color:#718397}.vx-help{display:block;margin-top:5px}@media(max-width:700px){.vx-store-checks{grid-template-columns:1fr}}`;document.head.appendChild(style);
  const obs=new MutationObserver(()=>setTimeout(decorateUserTable,30));obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(decorateUserTable,300);
})();