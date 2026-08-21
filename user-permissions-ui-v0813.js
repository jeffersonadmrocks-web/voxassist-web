/* VoxAssist V0.8.13 — Permissões por empresa + cabeçalho estável */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const roleOptions=['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'];
  const accessOptions=['PERSONALIZADO','GESTOR COMPLETO','ATENDENTE PADRÃO','TÉCNICO EXTERNO','TÉCNICO OFICINA','FINANCEIRO','ESTOQUE'];
  const permissionGroups=[
    {title:'Ordens de Serviço',items:[['os.view','Visualizar O.S.'],['os.create','Criar O.S.'],['os.edit','Editar O.S.'],['os.cancel','Cancelar O.S.'],['os.status','Alterar situação da O.S.']]},
    {title:'Whirlpool',items:[['whirlpool.view','Visualizar modo Whirlpool'],['whirlpool.edit','Preencher / editar atendimento Whirlpool']]},
    {title:'Agenda',items:[['agenda.view_all','Visualizar todas as agendas'],['agenda.edit','Agendar / reagendar atendimentos'],['agenda.block','Bloquear períodos de agenda']]},
    {title:'Financeiro',critical:true,items:[['financeiro.view','Visualizar financeiro'],['financeiro.edit','Incluir / alterar lançamentos financeiros']]},
    {title:'Estoque',items:[['estoque.view','Visualizar estoque'],['estoque.edit','Movimentar / alterar estoque']]},
    {title:'Relatórios',items:[['relatorios.view','Visualizar e gerar relatórios']]},
    {title:'Configurações e Segurança',critical:true,items:[['config.view','Acessar Configurações'],['config.users','Gerenciar usuários e permissões']]}
  ];

  const uid=()=>state?.session?.user?.id||null;
  const activeCompany=()=>state?.profile?.active_company_id||null;

  async function getMemberships(){
    if(!uid())return [];
    try{return await api(`user_companies?user_id=eq.${uid()}&active=eq.true&select=company_id,role,is_default,companies(id,legal_name,trade_name,document)&order=is_default.desc`)}catch{return []}
  }

  function doLogout(){
    Promise.resolve().then(async()=>{try{await auth('logout',{})}catch{};try{clearSession()}catch{};try{localStorage.removeItem('vox_session')}catch{};try{loginScreen()}catch{location.reload()}});
  }

  async function ensureHeader(){
    if(!state?.session)return;
    const header=document.querySelector('header'); if(!header)return;
    // Remove qualquer logout legado/lateral e preserva apenas o oficial do topo.
    document.querySelectorAll('#vxVisibleLogout,.vx-visible-logout,.sidebar #logout,.side #logout,aside #logout').forEach(x=>x.remove());
    let actions=header.querySelector('.vx-header-actions');
    if(!actions){actions=document.createElement('div');actions.className='vx-header-actions';header.appendChild(actions)}
    let logout=actions.querySelector('#vxTopLogout');
    if(!logout){logout=document.createElement('button');logout.id='vxTopLogout';logout.type='button';logout.className='secondary';logout.textContent='Sair';logout.title='Encerrar sessão';logout.onclick=doLogout;actions.appendChild(logout)}

    const rows=await getMemberships();
    let sw=actions.querySelector('#vxHeaderCompanyWrap');
    if(!rows.length){if(sw)sw.remove();return;}
    if(!sw){sw=document.createElement('label');sw.id='vxHeaderCompanyWrap';sw.className='vx-header-company';actions.prepend(sw)}
    sw.innerHTML=`<small>EMPRESA ATIVA</small><select id="vxHeaderCompany">${rows.map(r=>`<option value="${E(r.company_id)}" ${String(r.company_id)===String(activeCompany())?'selected':''}>${E(r.companies?.trade_name||r.companies?.legal_name||'EMPRESA')}</option>`).join('')}</select>`;
    const sel=sw.querySelector('select');
    sel.onchange=async()=>{const target=sel.value;sel.disabled=true;try{await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:target})});await loadProfile();await loadCore();shell();toast('Empresa ativa alterada.');setTimeout(()=>window.render?.('dashboard'),0)}catch(err){toast('Não foi possível trocar de empresa: '+err.message,'err');sel.disabled=false}};
  }

  async function fetchManagedCompanies(){
    if(!uid())return [];
    try{const rows=await api(`user_companies?user_id=eq.${uid()}&role=eq.GESTOR&active=eq.true&select=company_id,companies(id,legal_name,trade_name,document)&order=is_default.desc`);return rows.map(r=>r.companies).filter(Boolean)}catch{return []}
  }

  async function fetchUser(userId){
    const cid=activeCompany(); if(!cid)return null;
    const rows=await api('rpc/admin_company_users',{method:'POST',body:JSON.stringify({p_company_id:cid})});
    return (rows||[]).find(u=>String(u.user_id)===String(userId))||null;
  }

  function permissionCard(group,p){
    return `<section class="vx-perm-card ${group.critical?'critical':''}"><header><h3>${E(group.title)}</h3>${group.critical?'<span>PERMISSÕES CRÍTICAS</span>':''}</header><div class="vx-perm-list">${group.items.map(([key,label])=>`<label><span>${E(label)}</span><input type="checkbox" name="vxperm" value="${E(key)}" ${p?.[key]?'checked':''}></label>`).join('')}</div></section>`;
  }

  async function openPermissions(userId){
    const u=await fetchUser(userId); if(!u)return toast('Não foi possível carregar o usuário.','err');
    const companies=await fetchManagedCompanies();
    const selected=new Set((u.company_ids||[]).map(String));
    const p=u.permissions||{};
    document.querySelector('#vxPermPage')?.remove();
    const page=document.createElement('div');page.id='vxPermPage';page.className='vx-perm-page';
    page.innerHTML=`
      <div class="vx-perm-top"><div><button type="button" class="secondary" data-close>← Voltar</button><h2>Permissões de usuário <small>${E(u.full_name||'')}</small></h2></div><div class="vx-perm-top-actions"><button class="secondary" data-block>Bloquear todas</button><button class="secondary" data-default>Restaurar padrão</button><button class="primary" data-all>Liberar todas</button></div></div>
      <div class="vx-user-summary">
        <label>Nome<input name="vxname" value="${E(u.full_name||'')}"></label>
        <label>Perfil<select name="vxrole">${roleOptions.map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select></label>
        <label>Tipo de acesso<select name="vxaccess">${accessOptions.map(a=>`<option ${a===(u.access_type||'PERSONALIZADO')?'selected':''}>${a}</option>`).join('')}</select></label>
        <label class="vx-active-toggle"><input type="checkbox" name="vxactive" ${u.active?'checked':''}> Usuário ativo nesta empresa</label>
      </div>
      <section class="vx-company-access"><div><h3>Empresas liberadas</h3><p>O usuário verá no cabeçalho somente as empresas selecionadas aqui.</p></div><div class="vx-company-pills">${companies.map(c=>`<label><input type="checkbox" name="vxcompany" value="${E(c.id)}" ${selected.has(String(c.id))?'checked':''}><span>${E(c.trade_name||c.legal_name)}</span></label>`).join('')}</div></section>
      <div class="vx-perm-company-context"><b>Permissões desta empresa:</b><span>${E((companies.find(c=>String(c.id)===String(activeCompany()))||{}).trade_name||'EMPRESA ATIVA')}</span></div>
      <div class="vx-perm-grid">${permissionGroups.map(g=>permissionCard(g,p)).join('')}</div>
      <div class="vx-perm-footer"><button class="secondary danger" data-inactivate>INATIVAR / EXCLUIR ACESSO</button><div><button class="secondary" data-close>CANCELAR</button><button class="primary" data-save>SALVAR ALTERAÇÕES</button></div></div>`;
    document.body.appendChild(page);

    page.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>page.remove());
    page.querySelector('[data-all]').onclick=()=>page.querySelectorAll('[name=vxperm]').forEach(x=>x.checked=true);
    page.querySelector('[data-block]').onclick=()=>page.querySelectorAll('[name=vxperm]').forEach(x=>x.checked=false);
    page.querySelector('[data-default]').onclick=()=>{const role=page.querySelector('[name=vxrole]').value;const defaults={GESTOR:permissionGroups.flatMap(g=>g.items.map(x=>x[0])),ATENDENTE:['os.view','os.create','os.edit','os.status','whirlpool.view','agenda.view_all','agenda.edit','estoque.view','relatorios.view'],TECNICO:['os.view','os.edit','whirlpool.view','whirlpool.edit','agenda.edit','estoque.view'],ESTOQUE:['estoque.view','estoque.edit','os.view'],FINANCEIRO:['financeiro.view','financeiro.edit','relatorios.view','os.view']}[role]||[];page.querySelectorAll('[name=vxperm]').forEach(x=>x.checked=defaults.includes(x.value));};

    page.querySelector('[data-inactivate]').onclick=async()=>{if(!confirm('Inativar o acesso deste usuário à empresa ativa? O histórico será preservado.'))return;try{await api('rpc/admin_soft_delete_user',{method:'POST',body:JSON.stringify({p_user_id:u.user_id,p_company_id:activeCompany()})});page.remove();toast('Acesso inativado. Histórico preservado.');window.render?.('usuarios')}catch(err){toast(err.message,'err')}};

    page.querySelector('[data-save]').onclick=async()=>{
      const companyIds=[...page.querySelectorAll('[name=vxcompany]:checked')].map(x=>x.value);if(!companyIds.length)return toast('Selecione ao menos uma empresa.','err');
      const permissions={};page.querySelectorAll('[name=vxperm]').forEach(x=>permissions[x.value]=x.checked);
      const btn=page.querySelector('[data-save]');btn.disabled=true;btn.textContent='SALVANDO...';
      try{
        let r=await fetch(CFG.url+'/functions/v1/voxassist-manage-user',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({action:'set_companies',user_id:u.user_id,company_ids:companyIds,role:page.querySelector('[name=vxrole]').value})});
        let d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao alterar empresas');
        if(companyIds.includes(String(activeCompany()))){await api('rpc/admin_update_user_access_company_only',{method:'POST',body:JSON.stringify({p_user_id:u.user_id,p_company_id:activeCompany(),p_full_name:page.querySelector('[name=vxname]').value,p_role:page.querySelector('[name=vxrole]').value,p_active:page.querySelector('[name=vxactive]').checked,p_access_type:page.querySelector('[name=vxaccess]').value,p_permissions:permissions})})}
        page.remove();toast('Usuário e permissões atualizados.');await window.render?.('usuarios');
      }catch(err){toast('Falha ao salvar permissões: '+err.message,'err');btn.disabled=false;btn.textContent='SALVAR ALTERAÇÕES'}
    };
  }

  // Intercepta o botão ALTERAR existente e abre a nova tela completa.
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-user-manage]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openPermissions(b.dataset.userManage)},true);

  const style=document.createElement('style');style.textContent=`
    .vx-header-actions{margin-left:auto;display:flex;align-items:center;gap:10px;padding-right:10px}.vx-header-company{display:flex;flex-direction:column;gap:2px;min-width:210px}.vx-header-company small{font-size:8px;color:#60758c;font-weight:800}.vx-header-company select{height:34px;border:1px solid #cbd7e2;border-radius:7px;background:#fff;padding:0 10px;font-size:11px;font-weight:700;color:#17324e}#vxTopLogout{height:36px;padding:0 16px;white-space:nowrap}
    .vx-perm-page{position:fixed;inset:0;z-index:60000;background:#f4f7fa;overflow:auto;padding:18px 22px 90px;color:#172b3f}.vx-perm-top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}.vx-perm-top>div:first-child{display:flex;align-items:center;gap:12px}.vx-perm-top h2{margin:0;font-size:22px}.vx-perm-top h2 small{font-weight:600}.vx-perm-top-actions{display:flex;gap:8px}.vx-user-summary{display:grid;grid-template-columns:2fr 1fr 1.2fr 1.4fr;gap:10px;background:#fff;border:1px solid #dbe4ec;border-radius:10px;padding:14px;margin-bottom:12px}.vx-user-summary label{font-size:10px;font-weight:800;color:#496175;display:grid;gap:5px}.vx-user-summary input,.vx-user-summary select{height:38px;border:1px solid #cbd7e2;border-radius:6px;padding:0 9px;background:#fff}.vx-active-toggle{display:flex!important;align-items:center!important;flex-direction:row!important;gap:8px!important}.vx-active-toggle input{width:20px;height:20px}.vx-company-access{display:flex;justify-content:space-between;gap:20px;background:#fff;border:1px solid #dbe4ec;border-radius:10px;padding:14px;margin-bottom:12px}.vx-company-access h3{margin:0 0 3px;font-size:14px}.vx-company-access p{margin:0;color:#718397;font-size:10px}.vx-company-pills{display:flex;flex-wrap:wrap;gap:8px}.vx-company-pills label{cursor:pointer}.vx-company-pills input{display:none}.vx-company-pills span{display:block;border:1px solid #cbd7e2;border-radius:18px;padding:8px 13px;font-size:10px;font-weight:800;background:#fff}.vx-company-pills input:checked+span{background:#e9f3ff;border-color:#2c7be5;color:#1557a5}.vx-perm-company-context{display:flex;gap:8px;align-items:center;margin:14px 2px 8px}.vx-perm-company-context span{background:#eaf7ef;color:#17643c;border-radius:14px;padding:5px 10px;font-size:10px;font-weight:800}.vx-perm-grid{display:grid;grid-template-columns:repeat(3,minmax(280px,1fr));gap:12px}.vx-perm-card{background:#fff;border:1px solid #dbe4ec;border-radius:9px;overflow:hidden}.vx-perm-card>header{background:#0d2536;color:#fff;padding:10px 12px;display:flex;justify-content:space-between;align-items:center}.vx-perm-card>header h3{margin:0;font-size:17px;font-weight:600}.vx-perm-card>header span{font-size:8px;background:#8d2c2c;padding:4px 6px;border-radius:4px}.vx-perm-card.critical{border-color:#e7bcbc}.vx-perm-list label{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #edf1f4;font-size:11px;cursor:pointer}.vx-perm-list label:last-child{border-bottom:0}.vx-perm-list input{width:18px;height:18px}.vx-perm-footer{position:fixed;left:0;right:0;bottom:0;z-index:60001;background:#fff;border-top:1px solid #dbe4ec;padding:12px 22px;display:flex;justify-content:space-between;box-shadow:0 -4px 16px rgba(17,40,64,.08)}.vx-perm-footer>div{display:flex;gap:8px}.danger{color:#a72828!important;border-color:#e5b8b8!important}@media(max-width:1100px){.vx-perm-grid{grid-template-columns:repeat(2,minmax(260px,1fr))}.vx-user-summary{grid-template-columns:1fr 1fr}}@media(max-width:700px){.vx-perm-page{padding:12px 12px 100px}.vx-perm-top{align-items:flex-start;flex-direction:column}.vx-perm-top-actions{flex-wrap:wrap}.vx-user-summary,.vx-perm-grid{grid-template-columns:1fr}.vx-company-access{flex-direction:column}.vx-header-company{min-width:150px}}
  `;document.head.appendChild(style);

  const observer=new MutationObserver(()=>{clearTimeout(window.__vxHeaderTimer);window.__vxHeaderTimer=setTimeout(ensureHeader,80)});observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureHeader,100));setTimeout(ensureHeader,300);
  window.vxOpenUserPermissions=openPermissions;
})();