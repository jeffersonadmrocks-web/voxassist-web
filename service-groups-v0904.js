/* VoxAssist Web V0.9.04 — Grupos de atendimento (gestão interna).
   Achado do usuário em 2026-09-04: Grupo NÃO é tipo de aparelho (isso
   já existe, só cosmético, em inferGroup) -- é um catálogo que o
   GESTOR cria e nomeia como quiser (ex.: "TVs", "Produtos Garantia"),
   representando área de responsabilidade/roteamento interno. Nunca
   aparece em documento impresso/enviado ao cliente. Mesmo padrão de
   injeção da tela "usuarios" já usado por company-hierarchy-v0813.js
   (MutationObserver + wrap de window.render), reaproveitando o mesmo
   CSS .vx-admin-card/.vx-admin-overlay/.vx-admin-modal já existente. */
(function(){
  const E=window.esc||((v='')=>String(v??''));

  function companyId(){return state?.profile?.active_company_id}
  function isGestor(){return String(state?.profile?.role||'').toUpperCase()==='GESTOR'}

  async function enhance(){
    if(state?.view!=='usuarios'||!isGestor())return;
    const page=document.querySelector('.vx-admin-page');
    if(!page||page.dataset.vxServiceGroups==='1')return;
    const cid=companyId();if(!cid)return;
    page.dataset.vxServiceGroups='1';
    const card=document.createElement('section');
    card.className='vx-admin-card';
    card.id='vxServiceGroupsCard';
    page.appendChild(card);
    await renderCard(card,cid);
  }

  async function renderCard(card,cid){
    const groups=await api(`service_groups?company_id=eq.${cid}&select=*&order=name`).catch(()=>[]);
    card.innerHTML=`<div class="vx-admin-title"><h3>GRUPOS DE ATENDIMENTO</h3><span>${groups.length}</span></div>
      <p class="vx-sg-help">Área de responsabilidade interna (ex.: "TVs", "Produtos Garantia") -- usada pro atendente escolher pra quem direcionar a OS e pro técnico vinculado ver os avisos certos. Nunca aparece em documento impresso ou enviado ao cliente.</p>
      <div class="vx-sg-list">${groups.length?groups.map(g=>`<div class="vx-sg-row${g.active?'':' inactive'}"><b>${E(g.name)}</b><span>${g.active?'ATIVO':'INATIVO'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(g.id)}">Renomear</button><button type="button" data-toggle="${E(g.id)}" data-active="${g.active?'1':'0'}">${g.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhum grupo cadastrado ainda.</p>'}</div>
      <button type="button" class="secondary" id="vxSgNew">+ Novo grupo</button>`;
    card.querySelector('#vxSgNew').onclick=()=>openGroupModal(null,card);
    card.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
      const g=groups.find(x=>String(x.id)===b.dataset.rename);
      if(g)openGroupModal(g,card);
    });
    card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
      const g=groups.find(x=>String(x.id)===b.dataset.toggle);if(!g)return;
      b.disabled=true;
      try{
        await api('rpc/admin_upsert_service_group',{method:'POST',body:JSON.stringify({p_company_id:companyId(),p_id:g.id,p_name:g.name,p_active:!g.active})});
        toast?.(g.active?'Grupo desativado.':'Grupo ativado.');
        await renderCard(card,companyId());
      }catch(err){toast?.('Não foi possível alterar o grupo: '+err.message,'err');b.disabled=false;}
    });
  }

  function openGroupModal(group,card){
    document.querySelector('#vxSgModal')?.remove();
    const ov=document.createElement('div');ov.id='vxSgModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${group?'Renomear grupo':'Novo grupo de atendimento'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxSgForm" class="vx-admin-form"><label>NOME DO GRUPO *</label><input name="name" required maxlength="60" value="${group?E(group.name):''}" placeholder="EX.: TVs, PRODUTOS GARANTIA"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        await api('rpc/admin_upsert_service_group',{method:'POST',body:JSON.stringify({p_company_id:companyId(),p_id:group?.id||null,p_name:String(f.get('name')).trim(),p_active:group?group.active:true})});
        ov.remove();
        toast?.(group?'Grupo atualizado.':'Grupo criado.');
        await renderCard(card,companyId());
      }catch(err){toast?.('Não foi possível salvar o grupo: '+err.message,'err');btn.disabled=false;}
    };
  }

  const baseRender=window.render;
  window.render=async function(view){const r=await baseRender(view);if(view==='usuarios')setTimeout(enhance,30);return r};

  const style=document.createElement('style');
  style.textContent=`.vx-sg-help{font-size:10px;color:#6c7e90;margin:0 0 10px}.vx-sg-list{margin-bottom:10px}.vx-sg-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #edf2f6}.vx-sg-row:first-child{border-top:0}.vx-sg-row b{flex:1;font-size:11.5px}.vx-sg-row.inactive b{color:#8a96a3;text-decoration:line-through}.vx-sg-row span{font-size:9px;font-weight:800;color:#496176;background:#eef3f8;border-radius:4px;padding:2px 6px}.vx-sg-row.inactive span{color:#8a96a3}.vx-sg-row-actions{display:flex;gap:6px}.vx-sg-row-actions button{font-size:9.5px;border:1px solid #cbd7e2;background:#fff;border-radius:5px;padding:4px 8px;cursor:pointer}.vx-sg-row-actions button:hover{background:#f4f8fb}.vx-sg-empty{font-size:11px;color:#8a96a3;margin:0 0 10px}`;
  document.head.appendChild(style);
})();
