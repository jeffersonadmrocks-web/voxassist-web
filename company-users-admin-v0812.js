/* VoxAssist V0.8.12 — Empresas, usuários e isolamento visual por empresa */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const baseRender=window.render;
  const roles=['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'];

  async function memberships(){
    if(!state?.session?.user?.id)return [];
    try{return await api(`user_companies?user_id=eq.${state.session.user.id}&active=eq.true&select=company_id,role,store_id,is_default,companies(id,legal_name,trade_name,code)&order=is_default.desc`)}catch{return []}
  }
  async function addCompanySelector(){
    const header=document.querySelector('header .user');if(!header||header.querySelector('#vxCompanySelect'))return;
    const rows=await memberships();if(!rows.length)return;
    const wrap=document.createElement('div');wrap.className='vx-company-switch';
    wrap.innerHTML=`<small>EMPRESA ATIVA</small><select id="vxCompanySelect">${rows.map(r=>`<option value="${E(r.company_id)}" ${r.company_id===state.profile?.active_company_id?'selected':''}>${E(r.companies?.trade_name||r.companies?.legal_name||r.companies?.code||'EMPRESA')}</option>`).join('')}</select>`;
    header.prepend(wrap);
    wrap.querySelector('select').onchange=async e=>{
      const id=e.target.value;e.target.disabled=true;
      try{
        await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:id})});
        await loadProfile();await loadCore();
        shell();await window.render('dashboard');toast('Empresa ativa alterada. Os dados foram recarregados com isolamento por empresa.');
      }catch(err){toast('Não foi possível trocar de empresa: '+err.message,'err');e.target.disabled=false;}
    };
  }

  function modal(title,body){
    document.querySelector('#vxAdminModal')?.remove();
    const ov=document.createElement('div');ov.id='vxAdminModal';ov.className='vx-admin-overlay';ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${E(title)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">${body}</div></div>`;document.body.appendChild(ov);
    ov.querySelector('[data-close]').onclick=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)ov.remove()};return ov;
  }

  async function renderAdmin(){
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML='<div class="card">Carregando cadastros de empresas e usuários...</div>';
    let companies=[],stores=[],users=[],links=[];
    try{
      [companies,stores,users,links]=await Promise.all([
        api('companies?select=*&order=trade_name.nullslast,legal_name'),
        api('stores?select=*&order=name'),
        api('profiles?select=id,full_name,email,role,store_id,active,active_company_id&order=full_name'),
        api(`user_companies?company_id=eq.${state.profile?.active_company_id}&select=user_id,role,store_id,active,is_default`)
      ]);
    }catch(e){app.innerHTML=`<div class="card error-card"><h3>Falha ao carregar configurações</h3><p>${E(e.message)}</p></div>`;return;}
    const linkMap=new Map((links||[]).map(x=>[x.user_id,x]));
    const activeCompany=(companies||[]).find(c=>c.id===state.profile?.active_company_id);
    app.innerHTML=`<div class="vx-admin-page">
      <div class="vx-admin-hero"><div><h2>Empresas e Usuários</h2><p>Cadastros separados por empresa. O banco só entrega dados da empresa ativa ao usuário autenticado.</p></div><div class="vx-active-company"><span>EMPRESA ATIVA</span><strong>${E(activeCompany?.trade_name||activeCompany?.legal_name||'—')}</strong></div></div>
      <div class="vx-admin-actions"><button class="primary" id="vxNewCompany">+ CADASTRAR EMPRESA</button><button class="primary" id="vxNewUser">+ CADASTRAR USUÁRIO</button><button class="secondary" id="vxNewStore">+ CADASTRAR LOJA</button></div>
      <div class="vx-admin-grid">
        <section class="vx-admin-card"><div class="vx-admin-title"><h3>EMPRESAS</h3><span>${companies.length}</span></div>${companies.map(c=>`<div class="vx-company-row ${c.id===state.profile?.active_company_id?'active':''}"><div><b>${E(c.trade_name||c.legal_name)}</b><small>${E(c.legal_name)}${c.document?' • '+E(c.document):''}</small></div><span>${c.id===state.profile?.active_company_id?'ATIVA':'DISPONÍVEL'}</span></div>`).join('')||'<p>Nenhuma empresa cadastrada.</p>'}</section>
        <section class="vx-admin-card"><div class="vx-admin-title"><h3>LOJAS DA EMPRESA ATIVA</h3><span>${stores.length}</span></div>${stores.map(s=>`<div class="vx-company-row"><div><b>${E(s.name)}</b><small>${E(s.code||'SEM CÓDIGO')}</small></div><span>${s.active?'ATIVA':'INATIVA'}</span></div>`).join('')||'<p>Nenhuma loja cadastrada nesta empresa.</p>'}</section>
      </div>
      <section class="vx-admin-card"><div class="vx-admin-title"><h3>USUÁRIOS DA EMPRESA ATIVA</h3><span>${users.length}</span></div><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Loja</th><th>Situação</th></tr></thead><tbody>${users.map(u=>{const l=linkMap.get(u.id)||{};const st=stores.find(s=>s.id===(l.store_id||u.store_id));return `<tr><td><b>${E(u.full_name)}</b></td><td>${E(u.email||'—')}</td><td>${E(l.role||u.role)}</td><td>${E(st?.name||'TODAS / SEM LOJA')}</td><td>${u.active&&l.active!==false?'<span class="vx-ok">ATIVO</span>':'<span class="vx-off">INATIVO</span>'}</td></tr>`}).join('')||'<tr><td colspan="5">Nenhum usuário nesta empresa.</td></tr>'}</tbody></table></div></section>
      <div class="vx-security-note"><b>ISOLAMENTO MULTIEMPRESA ATIVO</b><span>Clientes, equipamentos, O.S., estoque, tarefas, pedidos e demais dados operacionais são filtrados no próprio banco pela empresa ativa. A troca de empresa exige vínculo do usuário.</span></div>
    </div>`;

    document.querySelector('#vxNewCompany').onclick=()=>newCompany(renderAdmin);
    document.querySelector('#vxNewStore').onclick=()=>newStore(renderAdmin);
    document.querySelector('#vxNewUser').onclick=()=>newUser(stores,renderAdmin);
  }

  function newCompany(done){
    const m=modal('Cadastrar Empresa',`<form id="vxCompanyForm" class="vx-admin-form"><label>RAZÃO SOCIAL *</label><input name="legal" required><label>NOME FANTASIA</label><input name="trade"><div class="vx-form-2"><div><label>CNPJ / CPF</label><input name="doc"></div><div><label>CÓDIGO CURTO</label><input name="code" placeholder="EX.: VOX2"></div></div><div class="vx-form-2"><div><label>TELEFONE</label><input name="phone"></div><div><label>E-MAIL</label><input name="email" type="email"></div></div><div class="vx-form-2"><div><label>CEP</label><input name="zip"></div><div><label>ENDEREÇO</label><input name="address"></div></div><div class="vx-form-2"><div><label>NÚMERO</label><input name="number"></div><div><label>BAIRRO</label><input name="neighborhood"></div></div><div class="vx-form-2"><div><label>CIDADE</label><input name="city"></div><div><label>UF</label><input name="uf" maxlength="2"></div></div><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR EMPRESA</button></div></form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();
    m.querySelector('#vxCompanyForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const btn=e.submitter;btn.disabled=true;try{await api('rpc/create_company_full',{method:'POST',body:JSON.stringify({p_legal_name:f.get('legal'),p_trade_name:f.get('trade')||'',p_document:f.get('doc')||'',p_code:f.get('code')||'',p_phone:f.get('phone')||'',p_email:f.get('email')||'',p_zip_code:f.get('zip')||'',p_address:f.get('address')||'',p_address_number:f.get('number')||'',p_neighborhood:f.get('neighborhood')||'',p_city:f.get('city')||'',p_state:f.get('uf')||''})});m.remove();toast('Empresa cadastrada. Ela já está disponível no seletor de empresa.');await done();await refreshCompanySelector();}catch(err){toast('Falha ao cadastrar empresa: '+err.message,'err');btn.disabled=false;}};
  }

  function newStore(done){
    const m=modal('Cadastrar Loja / Unidade',`<form id="vxStoreForm" class="vx-admin-form"><label>NOME DA LOJA *</label><input name="name" required><label>CÓDIGO</label><input name="code" placeholder="EX.: VIX / SERRA"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR LOJA</button></div></form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();m.querySelector('#vxStoreForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const btn=e.submitter;btn.disabled=true;try{await api('stores',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({name:String(f.get('name')).toUpperCase(),code:String(f.get('code')||'').toUpperCase()||null,company_id:state.profile.active_company_id,active:true})});m.remove();toast('Loja cadastrada na empresa ativa.');await done();}catch(err){toast('Falha ao cadastrar loja: '+err.message,'err');btn.disabled=false;}};
  }

  function newUser(stores,done){
    const m=modal('Cadastrar Usuário',`<form id="vxUserForm" class="vx-admin-form"><label>NOME COMPLETO *</label><input name="name" required><label>E-MAIL *</label><input name="email" type="email" required><div class="vx-form-2"><div><label>SENHA INICIAL *</label><input name="password" type="password" minlength="6" required></div><div><label>PERFIL *</label><select name="role">${roles.map(r=>`<option>${r}</option>`).join('')}</select></div></div><label>LOJA / UNIDADE</label><select name="store"><option value="">TODAS / SEM LOJA ESPECÍFICA</option>${stores.map(s=>`<option value="${E(s.id)}">${E(s.name)}</option>`).join('')}</select><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">CRIAR USUÁRIO</button></div></form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();m.querySelector('#vxUserForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const btn=e.submitter;btn.disabled=true;try{const r=await fetch(CFG.url+'/functions/v1/voxassist-manage-user',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({full_name:f.get('name'),email:f.get('email'),password:f.get('password'),role:f.get('role'),store_id:f.get('store')||null,company_id:state.profile.active_company_id})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao criar usuário');m.remove();toast('Usuário cadastrado e vinculado à empresa ativa.');await done();}catch(err){toast('Falha ao cadastrar usuário: '+err.message,'err');btn.disabled=false;}};
  }

  async function refreshCompanySelector(){document.querySelector('.vx-company-switch')?.remove();await addCompanySelector();}

  window.render=async function(view){
    if(view==='usuarios'){
      state.view='usuarios';if(!state.openTabs.includes('usuarios'))state.openTabs.push('usuarios');
      document.querySelector('#title')&&(document.querySelector('#title').textContent='Configurações');
      document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='usuarios'));
      if(typeof window.renderTabs==='function')window.renderTabs('Configurações');
      await renderAdmin();await addCompanySelector();return;
    }
    const r=await baseRender(view);setTimeout(addCompanySelector,0);return r;
  };

  const style=document.createElement('style');style.textContent=`
  .vx-company-switch{display:flex;flex-direction:column;gap:2px;min-width:180px;margin-right:8px}.vx-company-switch small{font-size:8px;color:#6b7d90;font-weight:800}.vx-company-switch select{height:34px;border:1px solid #cfd9e3;border-radius:7px;background:#fff;padding:0 8px;font-size:10px;font-weight:700;color:#18344f}
  .vx-admin-page{display:grid;gap:10px}.vx-admin-hero{display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #dfe7ef;border-radius:10px;padding:14px}.vx-admin-hero h2{margin:0;font-size:18px;color:#17324e}.vx-admin-hero p{margin:4px 0 0;font-size:11px;color:#6d7f91}.vx-active-company{background:#eef7f1;border:1px solid #cfe7d8;border-radius:8px;padding:9px 12px;min-width:220px}.vx-active-company span{display:block;font-size:8px;color:#63806d}.vx-active-company strong{font-size:12px;color:#14633b}.vx-admin-actions{display:flex;gap:8px}.vx-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vx-admin-card{background:#fff;border:1px solid #dfe7ef;border-radius:10px;padding:12px}.vx-admin-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.vx-admin-title h3{margin:0;font-size:12px;color:#17324e}.vx-admin-title span{font-size:10px;background:#edf3f8;border-radius:10px;padding:3px 7px}.vx-company-row{display:flex;align-items:center;justify-content:space-between;padding:9px 7px;border-bottom:1px solid #edf1f4}.vx-company-row:last-child{border:0}.vx-company-row b{display:block;font-size:11px}.vx-company-row small{display:block;font-size:9px;color:#718397;margin-top:2px}.vx-company-row>span{font-size:8px;font-weight:800;color:#60758c}.vx-company-row.active{background:#f1faf5}.vx-company-row.active>span{color:#16834b}.vx-ok{color:#16834b;font-weight:800}.vx-off{color:#c33;font-weight:800}.vx-security-note{background:#edf8f2;border:1px solid #cce8d8;border-left:4px solid #15924b;border-radius:8px;padding:11px;display:flex;gap:12px;align-items:center}.vx-security-note b{font-size:10px;color:#14633b;white-space:nowrap}.vx-security-note span{font-size:10px;color:#4f6859}.vx-admin-overlay{position:fixed;inset:0;z-index:40000;background:rgba(9,27,49,.42);display:flex;align-items:center;justify-content:center;padding:20px}.vx-admin-modal{width:min(620px,96vw);max-height:88vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.22)}.vx-admin-modal-head{position:sticky;top:0;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e3e9ef;z-index:2}.vx-admin-modal-head h3{margin:0;font-size:15px;color:#17324e}.vx-admin-modal-head button{border:0;background:#edf2f7;width:32px;height:32px;border-radius:8px;font-size:18px}.vx-admin-modal-body{padding:15px}.vx-admin-form{display:grid;gap:8px}.vx-admin-form label{font-size:9px;font-weight:800;color:#536a80}.vx-admin-form input,.vx-admin-form select{width:100%;height:36px;border:1px solid #bcc9d5;padding:0 8px;box-sizing:border-box}.vx-form-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.vx-admin-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}@media(max-width:950px){.vx-admin-grid,.vx-form-2{grid-template-columns:1fr}.vx-admin-hero{align-items:flex-start;gap:10px;flex-direction:column}}
  `;document.head.appendChild(style);
  setTimeout(addCompanySelector,400);
})();
