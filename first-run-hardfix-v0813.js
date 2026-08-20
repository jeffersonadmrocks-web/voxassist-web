/* VoxAssist V0.8.13 — hard fix primeiro acesso + sair do usuário */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const noCompany=()=>{const v=state?.profile?.active_company_id;return !v||String(v).toLowerCase()==='null'||String(v).toLowerCase()==='undefined'};

  function doLogout(){
    Promise.resolve().then(async()=>{try{await auth('logout',{})}catch{};try{clearSession()}catch{};try{localStorage.removeItem('vox_session')}catch{};loginScreen();});
  }

  function ensureLogout(){
    if(!state?.session)return;
    const header=document.querySelector('header');if(!header||header.querySelector('#vxLogoutVisible'))return;
    const b=document.createElement('button');b.id='vxLogoutVisible';b.type='button';b.className='secondary';b.textContent='Sair';
    b.style.marginLeft='8px';b.onclick=doLogout;
    const target=header.querySelector('.user')||header.querySelector('.desktop-topbar')||header;
    target.appendChild(b);
  }

  function modal(title,body){
    document.querySelector('#vxFirstRunModal')?.remove();
    const ov=document.createElement('div');ov.id='vxFirstRunModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${E(title)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">${body}</div></div>`;
    document.body.appendChild(ov);ov.querySelector('[data-close]').onclick=()=>ov.remove();return ov;
  }

  function bindCep(form){const z=form.querySelector('[name="zip"]');if(!z)return;const fmt=v=>String(v||'').replace(/\D/g,'').slice(0,8).replace(/^(\d{5})(\d)/,'$1-$2');async function lookup(){const d=z.value.replace(/\D/g,'');if(d.length!==8)return;try{const r=await fetch(`https://viacep.com.br/ws/${d}/json/`),j=await r.json();if(j.erro)return;const set=(n,v)=>{const e=form.querySelector(`[name="${n}"]`);if(e)e.value=v||''};set('address',j.logradouro);set('neighborhood',j.bairro);set('city',j.localidade);set('uf',j.uf)}catch{}}z.addEventListener('input',()=>{z.value=fmt(z.value);if(z.value.replace(/\D/g,'').length===8)lookup()});z.addEventListener('blur',lookup)}

  function openFirstCompany(){
    const m=modal('Cadastrar primeira Empresa / CNPJ',`<form id="vxFirstCompany" class="vx-admin-form">
      <label>RAZÃO SOCIAL *</label><input name="legal" required>
      <label>NOME FANTASIA</label><input name="trade">
      <div class="vx-form-2"><div><label>CNPJ / CPF</label><input name="doc"></div><div><label>NOME DA UNIDADE PRINCIPAL *</label><input name="store" required placeholder="Ex.: VOX VITÓRIA"></div></div>
      <div class="vx-form-2"><div><label>TELEFONE</label><input name="phone"></div><div><label>E-MAIL</label><input name="email" type="email"></div></div>
      <div class="vx-form-2"><div><label>CEP</label><input name="zip"></div><div><label>ENDEREÇO</label><input name="address"></div></div>
      <div class="vx-form-2"><div><label>NÚMERO</label><input name="number"></div><div><label>BAIRRO</label><input name="neighborhood"></div></div>
      <div class="vx-form-2"><div><label>CIDADE</label><input name="city"></div><div><label>UF</label><input name="uf" maxlength="2"></div></div>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">CRIAR EMPRESA E UNIDADE PRINCIPAL</button></div>
    </form>`);
    const form=m.querySelector('form');m.querySelector('[data-cancel]').onclick=()=>m.remove();bindCep(form);setTimeout(()=>window.vxBindInputMasks?.(m),0);
    form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),btn=e.submitter;btn.disabled=true;try{
      const result=await api('rpc/create_company_full',{method:'POST',body:JSON.stringify({p_legal_name:f.get('legal'),p_trade_name:f.get('trade')||'',p_document:f.get('doc')||'',p_code:'',p_phone:f.get('phone')||'',p_email:f.get('email')||'',p_zip_code:f.get('zip')||'',p_address:f.get('address')||'',p_address_number:f.get('number')||'',p_neighborhood:f.get('neighborhood')||'',p_city:f.get('city')||'',p_state:f.get('uf')||''})});
      const cid=Array.isArray(result)?result[0]:result;const stores=await api(`stores?company_id=eq.${cid}&select=id,name&order=created_at.asc`).catch(()=>[]);if(stores?.[0]&&f.get('store'))await api(`stores?id=eq.${stores[0].id}`,{method:'PATCH',body:JSON.stringify({name:String(f.get('store')).trim().toUpperCase()})});
      await loadProfile();if(!state.profile?.active_company_id&&cid)await api(`profiles?id=eq.${state.session.user.id}`,{method:'PATCH',body:JSON.stringify({active_company_id:cid,store_id:stores?.[0]?.id||null})}).catch(()=>{});await loadProfile();await loadCore();m.remove();shell();toast('Empresa e unidade principal criadas.');setTimeout(()=>window.render('usuarios'),50);
    }catch(err){toast('Falha ao criar primeira empresa: '+err.message,'err');btn.disabled=false;}};
  }

  function renderFirstRun(){
    state.view='usuarios';if(!state.openTabs.includes('usuarios'))state.openTabs.push('usuarios');
    document.querySelector('#title')&&(document.querySelector('#title').textContent='Configurações');
    document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='usuarios'));
    try{window.renderTabs?.('Configurações')}catch{}
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML=`<div class="vx-admin-page"><div class="vx-admin-hero"><div><h2>Configuração inicial do VoxAssist</h2><p>O ambiente está limpo. Cadastre a primeira Empresa/CNPJ para iniciar a operação.</p></div></div><section class="vx-admin-card"><div class="vx-admin-title"><h3>PRIMEIRO ACESSO</h3></div><p style="font-size:12px;color:#5f7184">Nenhuma empresa ou unidade está cadastrada. Ao criar a empresa, o VoxAssist criará automaticamente a unidade principal.</p><button class="primary" id="vxFirstCompanyBtn">+ CADASTRAR PRIMEIRA EMPRESA / CNPJ</button></section></div>`;
    document.querySelector('#vxFirstCompanyBtn').onclick=openFirstCompany;ensureLogout();
  }

  document.addEventListener('click',e=>{
    const cfg=e.target.closest?.('.nav[data-view="usuarios"],.tab[data-tab="usuarios"]');
    if(cfg&&noCompany()){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();renderFirstRun();return false}
  },true);

  const previous=window.render;window.render=async function(view){if(view==='usuarios'&&noCompany())return renderFirstRun();return previous(view)};
  const mo=new MutationObserver(()=>ensureLogout());mo.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('DOMContentLoaded',ensureLogout);setTimeout(ensureLogout,300);
  window.vxForceFirstRun=renderFirstRun;
})();