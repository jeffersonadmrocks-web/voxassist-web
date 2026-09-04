/* VoxAssist V0.8.13 — gestão completa de usuários independente da Loja Ativa */
(function(){
  const E=window.esc||((v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const gestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const companyId=()=>state?.profile?.active_company_id||null;
  const roles=['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'];
  const types=['GESTOR COMPLETO','ATENDENTE PADRÃO','TÉCNICO EXTERNO','TÉCNICO OFICINA','FINANCEIRO','ESTOQUE','PERSONALIZADO'];
  const perms=[
    ['OS','os.view','Visualizar O.S.'],['OS','os.create','Criar O.S.'],['OS','os.edit','Alterar O.S.'],['OS','os.status','Alterar situação'],['OS','os.cancel','Cancelar O.S.'],['OS','os.print','Imprimir / PDF'],['OS','os.financial','Acessar financeiro da O.S.'],['OS','os.whirlpool','Modo Whirlpool'],
    ['AGENDA','agenda.view_all','Visualizar todas as agendas'],['AGENDA','agenda.view_own','Visualizar própria agenda'],['AGENDA','agenda.edit','Agendar / reagendar'],['AGENDA','agenda.drag','Arrastar entre técnicos / ordem'],['AGENDA','agenda.block','Bloquear períodos'],
    ['FINANCEIRO','finance.view','Visualizar financeiro'],['FINANCEIRO','finance.edit','Lançar / alterar recebimentos'],['FINANCEIRO','finance.export','Exportar financeiro'],
    ['ESTOQUE','stock.view','Visualizar estoque'],['ESTOQUE','stock.edit','Movimentar estoque'],
    ['RELATÓRIOS','reports.view','Visualizar relatórios'],['RELATÓRIOS','reports.export','Exportar relatórios'],
    ['CONFIGURAÇÕES','settings.view','Acessar configurações'],['CONFIGURAÇÕES','settings.users','Gerenciar usuários'],['CONFIGURAÇÕES','settings.companies','Gerenciar empresas / lojas']
  ];
  const presets={
    'GESTOR COMPLETO':'*',
    'ATENDENTE PADRÃO':['os.view','os.create','os.edit','os.status','os.print','os.financial','os.whirlpool','agenda.view_all','agenda.edit','agenda.drag','reports.view'],
    'TÉCNICO EXTERNO':['os.view','os.edit','os.whirlpool','agenda.view_own'],
    'TÉCNICO OFICINA':['os.view','os.edit','os.status','os.print','stock.view'],
    'FINANCEIRO':['finance.view','finance.edit','finance.export','os.view','os.financial','reports.view'],
    'ESTOQUE':['stock.view','stock.edit','os.view'],
    'PERSONALIZADO':[]
  };

  function modal(title,body){
    document.querySelector('#vxUserManageModal')?.remove();
    const o=document.createElement('div');o.id='vxUserManageModal';o.className='vx-admin-overlay';
    o.innerHTML=`<div class="vx-admin-modal vx-user-manage-modal"><div class="vx-admin-modal-head"><h3>${E(title)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">${body}</div></div>`;
    document.body.appendChild(o);o.querySelector('[data-close]').onclick=()=>o.remove();o.onclick=e=>{if(e.target===o)o.remove()};return o;
  }
  function presetMap(type){const p=presets[type]||[];const out={};perms.forEach(([,k])=>out[k]=p==='*'||p.includes(k));return out}
  function permissionsHtml(values={}){let last='';return `<div class="vx-permissions">${perms.map(([g,k,l])=>`${g!==last?(last=g,`<div class="vx-perm-group">${g}</div>`):''}<label><input type="checkbox" data-perm="${k}" ${values[k]?'checked':''}> <span>${l}</span></label>`).join('')}</div>`}
  function setPerms(root,type){const map=presetMap(type);root.querySelectorAll('[data-perm]').forEach(x=>x.checked=!!map[x.dataset.perm]);}
  function readPerms(root){const o={};root.querySelectorAll('[data-perm]').forEach(x=>o[x.dataset.perm]=!!x.checked);return o}

  async function storesForCompany(){const cid=companyId();if(!cid)return[];return await api(`stores?company_id=eq.${cid}&select=id,name,code,active&order=name`).catch(()=>[])}
  // Achado do usuário em 2026-09-04: "GRUPOS DE ATENDIMENTO" no
  // cadastro do técnico -- mesmo padrão de checkbox-list de
  // LOJAS LIBERADAS logo acima, só que escopado a role==='TECNICO'
  // (grupo só faz sentido pra quem executa o atendimento).
  async function groupsForCompany(){const cid=companyId();if(!cid)return[];return await api(`service_groups?company_id=eq.${cid}&active=eq.true&select=id,name&order=name`).catch(()=>[])}
  async function usersForCompany(){const cid=companyId();if(!cid)return[];return await api('rpc/admin_company_users',{method:'POST',body:JSON.stringify({p_company_id:cid})}).catch(e=>{console.error(e);return[]})}

  async function refreshUsers(){
    if(state?.view!=='usuarios'||!gestor()||!companyId())return;
    const page=document.querySelector('.vx-admin-page');if(!page)return;
    const cards=[...page.querySelectorAll('.vx-admin-card')];
    const card=cards.find(c=>/USUÁRIOS/i.test(c.querySelector('.vx-admin-title h3')?.textContent||''));if(!card)return;
    const users=await usersForCompany();
    const title=card.querySelector('.vx-admin-title h3');if(title)title.textContent='USUÁRIOS DA EMPRESA SELECIONADA';
    const count=card.querySelector('.vx-admin-title span');if(count)count.textContent=String(users.length);
    const table=card.querySelector('table');if(!table)return;
    table.innerHTML=`<thead><tr><th>USUÁRIO</th><th>E-MAIL</th><th>PERFIL</th><th>TIPO DE ACESSO</th><th>LOJAS LIBERADAS</th><th>GRUPOS</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>${users.length?users.map(u=>`<tr><td><b>${E(u.full_name)}</b></td><td>${E(u.email||'—')}</td><td>${E(u.role||'—')}</td><td>${E(u.access_type||'PERSONALIZADO')}</td><td>${E((u.store_names||[]).join(', ')||'—')}</td><td>${E((u.service_group_names||[]).join(', ')||'—')}</td><td>${u.active?'<span class="vx-ok">ATIVO</span>':'<span class="vx-off">INATIVO</span>'}</td><td><button type="button" class="vx-user-manage-btn" data-user="${E(u.user_id)}">ALTERAR</button></td></tr>`).join(''):'<tr><td colspan="8">Nenhum usuário vinculado a esta empresa.</td></tr>'}</tbody>`;
    table.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>openUser(b.dataset.user,users));
  }

  async function openUser(id,cache){
    const u=cache.find(x=>String(x.user_id)===String(id));if(!u)return;
    const [stores,groups]=await Promise.all([storesForCompany(),groupsForCompany()]);
    const current=new Set((u.store_ids||[]).map(String));
    const currentGroups=new Set((u.service_group_ids||[]).map(String));
    const m=modal('Alterar usuário',`<form id="vxUserManageForm" class="vx-admin-form">
      <label>NOME COMPLETO *</label><input name="name" value="${E(u.full_name)}" required>
      <label>E-MAIL</label><input value="${E(u.email||'')}" disabled>
      <div class="vx-form-2"><div><label>PERFIL FUNCIONAL *</label><select name="role">${roles.map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select></div><div><label>TIPO DE ACESSO *</label><select name="access">${types.map(t=>`<option ${t===u.access_type?'selected':''}>${t}</option>`).join('')}</select></div></div>
      <label class="vx-toggle"><input type="checkbox" name="active" ${u.active?'checked':''}> USUÁRIO ATIVO</label>
      <label>LOJAS LIBERADAS *</label><div class="vx-store-checks">${stores.map(s=>`<label><input type="checkbox" data-store value="${E(s.id)}" ${current.has(String(s.id))?'checked':''}> <b>${E(s.code||s.name)}</b><span>${E(s.name)}</span></label>`).join('')}</div>
      <div id="vxUserGroupsBlock" style="display:${u.role==='TECNICO'?'':'none'}"><label>GRUPOS DE ATENDIMENTO</label><div class="vx-store-checks">${groups.length?groups.map(g=>`<label><input type="checkbox" data-group value="${E(g.id)}" ${currentGroups.has(String(g.id))?'checked':''}> <b>${E(g.name)}</b></label>`).join(''):'<span class="vx-sg-empty">Nenhum grupo cadastrado -- crie em "Grupos de Atendimento" nesta mesma tela.</span>'}</div></div>
      <div class="vx-access-head"><div><b>CONTEÚDOS DE ACESSO</b><small>O tipo de acesso aplica um padrão; você pode personalizar abaixo.</small></div><button type="button" class="secondary" id="vxApplyPreset">APLICAR PADRÃO</button></div>
      ${permissionsHtml(u.permissions||{})}
      <div class="vx-admin-form-actions"><button type="button" class="danger" id="vxDeleteUser">EXCLUIR USUÁRIO</button><span class="grow"></span><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR ALTERAÇÕES</button></div>
    </form>`);
    const f=m.querySelector('#vxUserManageForm');m.querySelector('[data-cancel]').onclick=()=>m.remove();
    f.role.addEventListener('change',()=>{const gb=f.querySelector('#vxUserGroupsBlock');if(gb)gb.style.display=f.role.value==='TECNICO'?'':'none';});
    m.querySelector('#vxApplyPreset').onclick=()=>setPerms(f,f.access.value);
    m.querySelector('#vxDeleteUser').onclick=async()=>{
      if(!confirm('Excluir este usuário do uso do VoxAssist? O histórico será preservado e o acesso será inativado.'))return;
      try{await api('rpc/admin_soft_delete_user',{method:'POST',body:JSON.stringify({p_user_id:u.user_id,p_company_id:companyId()})});m.remove();toast('Usuário inativado/excluído do acesso. O histórico foi preservado.');await refreshUsers()}catch(e){toast('Falha ao excluir usuário: '+e.message,'err')}
    };
    f.onsubmit=async e=>{e.preventDefault();const ss=[...f.querySelectorAll('[data-store]:checked')].map(x=>x.value);if(!ss.length)return toast('Selecione ao menos uma loja para o usuário.','err');const btn=e.submitter;btn.disabled=true;
      // Achado do usuário em 2026-09-04: só manda grupo quando o papel
      // é TECNICO (bloco visível) -- p_service_group_ids=null significa
      // "não mexer", evita apagar vínculo de grupo por engano se o
      // gestor só estava trocando outra coisa num usuário não-técnico.
      const groupIds=f.role.value==='TECNICO'?[...f.querySelectorAll('[data-group]:checked')].map(x=>x.value):null;
      try{
      await api('rpc/admin_update_user_access',{method:'POST',body:JSON.stringify({p_user_id:u.user_id,p_company_id:companyId(),p_full_name:f.name.value,p_role:f.role.value,p_active:f.active.checked,p_store_ids:ss,p_access_type:f.access.value,p_permissions:readPerms(f),p_service_group_ids:groupIds})});
      m.remove();toast('Usuário e permissões atualizados.');await refreshUsers();
    }catch(err){toast('Falha ao atualizar usuário: '+err.message,'err');btn.disabled=false;}};
  }

  async function enhanceNewUser(){
    if(!gestor())return;const f=document.querySelector('#vxAdminModal #vxUserForm');if(!f||f.dataset.vxAccess==='1')return;f.dataset.vxAccess='1';
    const actions=f.querySelector('.vx-admin-form-actions');if(!actions)return;
    const block=document.createElement('div');block.className='vx-new-access-block';block.innerHTML=`<label>TIPO DE ACESSO *</label><select name="vx_access_type">${types.map(t=>`<option>${t}</option>`).join('')}</select><div class="vx-access-head"><div><b>CONTEÚDOS DE ACESSO</b><small>Podem ser ajustados antes ou depois do cadastro.</small></div><button type="button" class="secondary" id="vxNewApplyPreset">APLICAR PADRÃO</button></div>${permissionsHtml(presetMap('GESTOR COMPLETO'))}`;f.insertBefore(block,actions);
    const access=f.querySelector('[name=vx_access_type]');const role=f.querySelector('[name=role]');
    const suggest=()=>{const map={GESTOR:'GESTOR COMPLETO',ATENDENTE:'ATENDENTE PADRÃO',TECNICO:'TÉCNICO EXTERNO',ESTOQUE:'ESTOQUE',FINANCEIRO:'FINANCEIRO'};access.value=map[role.value]||'PERSONALIZADO';setPerms(block,access.value)};role.addEventListener('change',suggest);f.querySelector('#vxNewApplyPreset').onclick=()=>setPerms(block,access.value);suggest();
    const original=f.onsubmit;f.onsubmit=async function(e){const email=String(f.querySelector('[name=email]')?.value||'').trim();const type=access.value;const pm=readPerms(block);const checked=[...f.querySelectorAll('[name=vx_store_access]:checked')].map(x=>x.value);if(original)await original.call(f,e);setTimeout(async()=>{try{const p=await api(`profiles?email=eq.${encodeURIComponent(email)}&select=id,full_name,role`);const x=p?.[0];if(!x)return;const ss=checked.length?checked:(f.querySelector('[name=store]')?.value?[f.querySelector('[name=store]').value]:[]);if(!ss.length)return;await api('rpc/admin_update_user_access',{method:'POST',body:JSON.stringify({p_user_id:x.id,p_company_id:companyId(),p_full_name:x.full_name,p_role:x.role,p_active:true,p_store_ids:ss,p_access_type:type,p_permissions:pm})});await refreshUsers()}catch(err){console.error('Permissões do novo usuário:',err)}},1200)};
  }

  document.addEventListener('click',e=>{if(e.target.closest('#vxNewUser'))setTimeout(enhanceNewUser,180)});
  const prior=window.render;window.render=async function(view){const r=await prior(view);if(view==='usuarios')setTimeout(refreshUsers,350);return r};
  // Trocar Loja Ativa jamais muda a lista da configuração: reconstituímos pelos vínculos da EMPRESA.
  document.addEventListener('change',e=>{if(e.target?.id==='activeStore'&&state?.view==='usuarios')setTimeout(refreshUsers,700)});
  const st=document.createElement('style');st.textContent=`.vx-user-manage-btn{border:1px solid #b8c9db;background:#fff;color:#164f83;padding:6px 10px;font-size:9px;cursor:pointer}.vx-user-manage-modal{width:min(820px,96vw)}.vx-toggle{display:flex!important;align-items:center;gap:7px}.vx-store-checks label span{margin-left:auto;color:#718397;font-size:9px}.vx-access-head{display:flex;justify-content:space-between;align-items:center;margin:12px 0 6px}.vx-access-head small{display:block;color:#718397;margin-top:2px}.vx-permissions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 16px;border:1px solid #dbe5ee;border-radius:8px;padding:10px;background:#f8fafc}.vx-permissions label{display:flex;align-items:center;gap:7px;font-size:10px}.vx-perm-group{grid-column:1/-1;font-size:9px;font-weight:800;color:#164f83;border-bottom:1px solid #dce6ef;padding:7px 0 3px}.vx-admin-form-actions .grow{flex:1}.vx-admin-form-actions .danger{border:1px solid #d33;background:#fff;color:#b32121;padding:9px 12px}.vx-new-access-block{display:grid;gap:7px}@media(max-width:760px){.vx-permissions{grid-template-columns:1fr}}`;document.head.appendChild(st);
  setTimeout(refreshUsers,700);
})();