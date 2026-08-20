/* VoxAssist V0.8.13 — BASELINE EMPRESA-ONLY */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const roles=['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'];
  const perms=['os.view','os.create','os.edit','os.cancel','os.status','whirlpool.view','whirlpool.edit','agenda.view_all','agenda.edit','agenda.block','financeiro.view','financeiro.edit','estoque.view','estoque.edit','relatorios.view','config.view','config.users'];
  const uid=()=>state?.session?.user?.id||null;
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';

  function cleanupLegacyStore(){
    document.querySelector('#vxVisibleLogout')?.remove();
    const activeStore=document.querySelector('#activeStore');
    if(activeStore){const p=activeStore.closest('label')||activeStore.parentElement;if(p)p.style.display='none';}
    document.querySelectorAll('[id*=Store],[class*=store-switch],[class*=store-context]').forEach(el=>{
      if(el.id==='vxCompanySelect')return;
      if(/loja ativa/i.test(el.textContent||'')) el.style.display='none';
    });
    const userSmall=document.querySelector('header .user small');
    if(userSmall&&state?.profile)userSmall.textContent=String(state.profile.role||'SEM PERFIL')+' • ACESSO POR EMPRESA';
  }

  async function memberships(){
    if(!uid())return [];
    return await api(`user_companies?user_id=eq.${uid()}&active=eq.true&select=company_id,role,is_default,companies(id,legal_name,trade_name,document,code)&order=is_default.desc`).catch(()=>[]);
  }

  async function refreshCompanySelector(){
    const user=document.querySelector('header .user');if(!user)return;
    user.querySelector('.vx-company-switch')?.remove();
    const rows=await memberships();
    if(!rows.length)return;
    const wrap=document.createElement('div');wrap.className='vx-company-switch';
    wrap.innerHTML=`<small>EMPRESA ATIVA</small><select id="vxCompanySelect">${rows.map(r=>`<option value="${E(r.company_id)}" ${String(r.company_id)===String(state.profile?.active_company_id)?'selected':''}>${E(r.companies?.trade_name||r.companies?.legal_name||'EMPRESA')}</option>`).join('')}</select>`;
    user.prepend(wrap);
    wrap.querySelector('select').onchange=async e=>{
      const id=e.target.value;e.target.disabled=true;
      try{await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:id})});await loadProfile();await loadCore();shell();await window.render('dashboard');toast('Empresa ativa alterada.');}
      catch(err){toast('Falha ao trocar de empresa: '+err.message,'err');e.target.disabled=false;}
    };
  }

  function modal(title,body){
    document.querySelector('#vxCompanyOnlyModal')?.remove();
    const ov=document.createElement('div');ov.id='vxCompanyOnlyModal';ov.className='vx-admin-overlay';ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${E(title)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">${body}</div></div>`;document.body.appendChild(ov);ov.querySelector('[data-close]').onclick=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)ov.remove()};return ov;
  }

  async function companyRows(){return await api('companies?select=*&order=trade_name.nullslast,legal_name').catch(()=>[])}
  async function managedCompanies(){
    if(!uid())return [];
    const rows=await api(`user_companies?user_id=eq.${uid()}&role=eq.GESTOR&active=eq.true&select=company_id,companies(id,legal_name,trade_name,document)&order=is_default.desc`).catch(()=>[]);
    return rows.map(x=>x.companies).filter(Boolean);
  }

  async function renderAdmin(){
    if(!isGestor()){document.querySelector('#app').innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Configurações disponíveis somente para gestores.</p></div>';return;}
    const app=document.querySelector('#app');app.innerHTML='<div class="card">Carregando empresas e usuários...</div>';
    const companies=await companyRows();
    const activeId=state.profile?.active_company_id||null;
    const active=companies.find(c=>String(c.id)===String(activeId));
    let users=[];
    if(activeId){users=await api('rpc/admin_company_users',{method:'POST',body:JSON.stringify({p_company_id:activeId})}).catch(()=>[])}
    app.innerHTML=`<div class="vx-admin-page company-only">
      <div class="vx-admin-hero"><div><h2>Empresas e Usuários</h2><p>Modo Empresa-only. Não existe Loja/Unidade operacional. Todo dado é isolado pela Empresa ativa.</p></div><div class="vx-active-company"><span>EMPRESA ATIVA</span><strong>${E(active?.trade_name||active?.legal_name||'NENHUMA EMPRESA CADASTRADA')}</strong></div></div>
      <div class="vx-admin-actions"><button class="primary" id="vxCOnewCompany">+ CADASTRAR EMPRESA</button><button class="primary" id="vxCOnewUser" ${activeId?'':'disabled'}>+ CADASTRAR USUÁRIO</button></div>
      <section class="vx-admin-card"><div class="vx-admin-title"><h3>EMPRESAS DISPONÍVEIS</h3><span>${companies.length}</span></div>${companies.map(c=>`<div class="vx-company-row ${String(c.id)===String(activeId)?'active':''}"><div><b>${E(c.trade_name||c.legal_name)}</b><small>${E(c.legal_name)} • CNPJ ${E(c.document||'—')}</small></div><div class="co-actions">${String(c.id)===String(activeId)?'<span class="vx-ok">ATIVA</span>':`<button class="secondary" data-company-use="${E(c.id)}">USAR</button>`}</div></div>`).join('')||'<p>Nenhuma empresa cadastrada. Cadastre a primeira empresa para iniciar.</p>'}</section>
      <section class="vx-admin-card"><div class="vx-admin-title"><h3>USUÁRIOS DA EMPRESA ATIVA</h3><span>${users.length}</span></div><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Empresas Liberadas</th><th>Acesso</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${E(u.full_name)}</b></td><td>${E(u.email||'—')}</td><td>${E(u.role)}</td><td>${E((u.company_names||[]).join(', ')||'—')}</td><td>${E(u.access_type||'PERSONALIZADO')}</td><td>${u.active?'<span class="vx-ok">ATIVO</span>':'<span class="vx-off">INATIVO</span>'}</td><td><button class="secondary" data-user-manage="${E(u.user_id)}">ALTERAR</button></td></tr>`).join('')||'<tr><td colspan="7">Nenhum usuário vinculado à empresa ativa.</td></tr>'}</tbody></table></div></section>
      <div class="vx-security-note"><b>ISOLAMENTO POR EMPRESA</b><span>OS, clientes, equipamentos, agenda, estoque, financeiro e demais dados usam company_id e RLS. Trocar Empresa ativa altera o contexto operacional; não existe mais contexto de Loja.</span></div>
    </div>`;
    document.querySelector('#vxCOnewCompany').onclick=()=>newCompany();
    document.querySelector('#vxCOnewUser')?.addEventListener('click',()=>newUser());
    app.querySelectorAll('[data-company-use]').forEach(b=>b.onclick=async()=>{try{await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:b.dataset.companyUse})});await loadProfile();await loadCore();await renderAdmin();await refreshCompanySelector()}catch(e){toast(e.message,'err')}});
    app.querySelectorAll('[data-user-manage]').forEach(b=>b.onclick=()=>manageUser(users.find(u=>String(u.user_id)===String(b.dataset.userManage))));
  }

  function newCompany(){
    const m=modal('Cadastrar Empresa',`<form id="coCompanyForm" class="vx-admin-form"><label>RAZÃO SOCIAL *</label><input name="legal" required><label>NOME FANTASIA</label><input name="trade"><div class="vx-form-2"><div><label>CNPJ *</label><input name="doc" required placeholder="00.000.000/0000-00"></div><div><label>CÓDIGO INTERNO</label><input name="code"></div></div><div class="vx-form-2"><div><label>TELEFONE</label><input name="phone"></div><div><label>E-MAIL</label><input name="email" type="email"></div></div><div class="vx-form-2"><div><label>CEP</label><input name="zip"></div><div><label>ENDEREÇO</label><input name="address"></div></div><div class="vx-form-2"><div><label>NÚMERO</label><input name="number"></div><div><label>BAIRRO</label><input name="neighborhood"></div></div><div class="vx-form-2"><div><label>CIDADE</label><input name="city"></div><div><label>UF</label><input name="uf" maxlength="2"></div></div><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR EMPRESA</button></div></form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();
    m.querySelector('#coCompanyForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;try{await api('rpc/create_company_full',{method:'POST',body:JSON.stringify({p_legal_name:f.get('legal'),p_trade_name:f.get('trade')||'',p_document:f.get('doc'),p_code:f.get('code')||'',p_phone:f.get('phone')||'',p_email:f.get('email')||'',p_zip_code:f.get('zip')||'',p_address:f.get('address')||'',p_address_number:f.get('number')||'',p_neighborhood:f.get('neighborhood')||'',p_city:f.get('city')||'',p_state:f.get('uf')||''})});m.remove();await loadProfile();await loadCore();await renderAdmin();await refreshCompanySelector();toast('Empresa cadastrada com isolamento próprio.');}catch(err){toast('Falha ao cadastrar empresa: '+err.message,'err');btn.disabled=false;}};
  }

  async function newUser(){
    const companies=await managedCompanies();
    const active=state.profile?.active_company_id;
    const m=modal('Cadastrar Usuário',`<form id="coUserForm" class="vx-admin-form"><label>NOME COMPLETO *</label><input name="name" required><label>E-MAIL *</label><input name="email" type="email" required><div class="vx-form-2"><div><label>SENHA INICIAL *</label><input name="password" type="password" minlength="10" required><small>Mínimo de 10 caracteres.</small></div><div><label>PERFIL *</label><select name="role">${roles.map(r=>`<option>${r}</option>`).join('')}</select></div></div><label>EMPRESAS LIBERADAS *</label><div class="co-company-checks">${companies.map(c=>`<label><input type="checkbox" name="company_ids" value="${E(c.id)}" ${String(c.id)===String(active)?'checked':''}> ${E(c.trade_name||c.legal_name)} <small>${E(c.legal_name)}</small></label>`).join('')}</div><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">CRIAR USUÁRIO</button></div></form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();
    m.querySelector('#coUserForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),ids=[...m.querySelectorAll('[name=company_ids]:checked')].map(x=>x.value),btn=e.submitter;if(!ids.length)return toast('Selecione ao menos uma empresa.','err');btn.disabled=true;try{const r=await fetch(CFG.url+'/functions/v1/voxassist-manage-user',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({action:'create',full_name:f.get('name'),email:f.get('email'),password:f.get('password'),role:f.get('role'),company_ids:ids})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao criar usuário');m.remove();await renderAdmin();toast('Usuário criado e vinculado às empresas selecionadas.');}catch(err){toast(err.message,'err');btn.disabled=false;}};
  }

  async function manageUser(u){
    if(!u)return;const companies=await managedCompanies();const selected=new Set((u.company_ids||[]).map(String));const p=u.permissions||{};
    const m=modal('Alterar Usuário',`<form id="coManageForm" class="vx-admin-form"><label>NOME</label><input name="name" value="${E(u.full_name)}"><div class="vx-form-2"><div><label>PERFIL</label><select name="role">${roles.map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select></div><div><label>TIPO DE ACESSO</label><select name="access"><option>PERSONALIZADO</option><option>GESTOR COMPLETO</option><option>ATENDENTE PADRÃO</option><option>TÉCNICO EXTERNO</option><option>TÉCNICO OFICINA</option><option>FINANCEIRO</option><option>ESTOQUE</option></select></div></div><label>EMPRESAS LIBERADAS</label><div class="co-company-checks">${companies.map(c=>`<label><input type="checkbox" name="company_ids" value="${E(c.id)}" ${selected.has(String(c.id))?'checked':''}> ${E(c.trade_name||c.legal_name)}</label>`).join('')}</div><label><input type="checkbox" name="active" ${u.active?'checked':''}> ATIVO NESTA EMPRESA</label><label>PERMISSÕES DESTA EMPRESA</label><div class="co-perms">${perms.map(k=>`<label><input type="checkbox" name="perm" value="${k}" ${p[k]?'checked':''}> ${k}</label>`).join('')}</div><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button type="button" class="secondary danger" data-inactivate>INATIVAR / EXCLUIR ACESSO</button><button class="primary">SALVAR ALTERAÇÕES</button></div></form>`);
    m.querySelector('select[name=access]').value=u.access_type||'PERSONALIZADO';m.querySelector('[data-cancel]').onclick=()=>m.remove();
    m.querySelector('[data-inactivate]').onclick=async()=>{if(!confirm('Inativar o acesso deste usuário à empresa ativa? O histórico será preservado.'))return;try{await api('rpc/admin_soft_delete_user',{method:'POST',body:JSON.stringify({p_user_id:u.user_id,p_company_id:state.profile.active_company_id})});m.remove();await renderAdmin();toast('Acesso inativado. Histórico preservado.');}catch(e){toast(e.message,'err')}};
    m.querySelector('#coManageForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),ids=[...m.querySelectorAll('[name=company_ids]:checked')].map(x=>x.value),permissions={};m.querySelectorAll('[name=perm]').forEach(x=>permissions[x.value]=x.checked);if(!ids.length)return toast('Selecione ao menos uma empresa.','err');const btn=e.submitter;btn.disabled=true;try{let r=await fetch(CFG.url+'/functions/v1/voxassist-manage-user',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({action:'set_companies',user_id:u.user_id,company_ids:ids,role:f.get('role')})});let d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao alterar empresas');if(ids.includes(String(state.profile.active_company_id))){await api('rpc/admin_update_user_access_company_only',{method:'POST',body:JSON.stringify({p_user_id:u.user_id,p_company_id:state.profile.active_company_id,p_full_name:f.get('name'),p_role:f.get('role'),p_active:!!f.get('active'),p_access_type:f.get('access'),p_permissions:permissions})});}m.remove();await renderAdmin();toast('Usuário atualizado.');}catch(err){toast(err.message,'err');btn.disabled=false;}};
  }

  const prior=window.render;
  window.render=async function(view){
    cleanupLegacyStore();
    if(view==='usuarios'){
      state.view='usuarios';if(!state.openTabs.includes('usuarios'))state.openTabs.push('usuarios');
      document.querySelector('#title')&&(document.querySelector('#title').textContent='Configurações');
      document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='usuarios'));
      if(typeof window.renderTabs==='function')window.renderTabs('Configurações');
      await renderAdmin();await refreshCompanySelector();cleanupLegacyStore();return;
    }
    const r=await prior(view);setTimeout(()=>{cleanupLegacyStore();refreshCompanySelector()},120);return r;
  };

  const st=document.createElement('style');st.textContent=`.company-only .vx-admin-grid{display:block}.co-actions{display:flex;align-items:center;gap:8px}.co-company-checks,.co-perms{display:grid;gap:6px;border:1px solid #dbe5ee;border-radius:7px;padding:9px;background:#f8fafc;max-height:210px;overflow:auto}.co-company-checks label,.co-perms label{display:flex;align-items:center;gap:7px;font-size:10px}.co-company-checks small{margin-left:5px;color:#718397}.danger{color:#9f1d1d!important;border-color:#e9baba!important}.vx-company-switch{display:flex;flex-direction:column;gap:2px;min-width:190px;margin-right:8px}.vx-company-switch small{font-size:8px;color:#6b7d90;font-weight:800}.vx-company-switch select{height:34px;border:1px solid #cfd9e3;border-radius:7px;background:#fff;padding:0 8px;font-size:10px;font-weight:700;color:#18344f}`;document.head.appendChild(st);
  new MutationObserver(cleanupLegacyStore).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>{cleanupLegacyStore();refreshCompanySelector()},500);
})();
