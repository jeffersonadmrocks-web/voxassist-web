/* VoxAssist Web V0.9.08 — Configurações > Cadastros & Catálogos > Produtos.
   Achado do usuário em 2026-09-08: product_groups/product_types JÁ
   EXISTEM no banco, populados, GLOBAIS (sem company_id), read-only via
   RLS -- nunca ligados a nenhuma tela. Decisão arquitetural explícita
   do usuário: NÃO duplicar registro por empresa ("TV — Empresa A"),
   NÃO adicionar company_id direto no catálogo mestre. Em vez disso,
   camada de associação (company_product_types, migration
   20260908030000) -- a empresa escolhe quais tipos do catálogo mestre
   usa; ausência de linha = ativo por padrão (empresa herda o catálogo
   inteiro, não precisa reconfigurar nada no primeiro acesso).
   Catálogo mestre continua intocado aqui -- esta tela NUNCA cria/edita
   product_groups/product_types, só liga/desliga o uso PARA a empresa
   ativa. Administração do catálogo global fica fora de escopo (pedido
   explícito do usuário: "restrita ao nível administrativo adequado do
   VoxAssist, caso realmente seja necessária").
   Página própria (não empilhada na tela de Empresa & Usuários) --
   acessada pelo hub de Configurações (settings-hub-v0908.js), card
   "CADASTROS & CATÁLOGOS". */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const companyId=()=>state?.profile?.active_company_id;

  window.renderProductCatalog=async function(){
    const app=document.querySelector('#app');if(!app)return;
    if(!isGestor()){app.innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Configurações disponíveis somente para gestores.</p></div>';return;}
    const cid=companyId();
    app.innerHTML='<div class="card">Carregando catálogo de produtos...</div>';
    const [groups,types,companyRows]=await Promise.all([
      api('product_groups?active=eq.true&select=*&order=name').catch(()=>[]),
      api('product_types?active=eq.true&select=*&order=name').catch(()=>[]),
      cid?api(`company_product_types?company_id=eq.${cid}&select=product_type_id,active`).catch(()=>[]):[],
    ]);
    const offMap=new Map(companyRows.filter(r=>r.active===false).map(r=>[String(r.product_type_id),true]));
    const groupsOrdered=groups.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Produtos</h2><p>Cadastros & Catálogos -- escolha quais tipos do catálogo do VoxAssist esta empresa utiliza</p></div><div class="module-head-actions"><button class="secondary" id="vxCatalogBack">← Voltar</button></div></div>
      <p class="vx-sg-help" style="margin:0 0 14px">O catálogo de grupos e tipos de produto (TV, Geladeira, Freezer...) é compartilhado entre todas as empresas do VoxAssist. Aqui você só liga/desliga o que <b>esta empresa</b> usa -- desativar um tipo não afeta as demais empresas nem apaga OS já cadastradas.</p>
      <div id="vxCatalogGroups"></div>
      <section class="vx-admin-card" id="vxConditionsCard" style="margin-top:12px"></section>
    </div>`;
    document.getElementById('vxCatalogBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
    renderConditionsCard(cid);
    const host=document.getElementById('vxCatalogGroups');
    host.innerHTML=groupsOrdered.map(g=>{
      const groupTypes=types.filter(t=>t.group_id===g.id).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      if(!groupTypes.length)return '';
      return `<section class="vx-admin-card" style="margin-bottom:12px"><div class="vx-admin-title"><h3>${E(g.name)}</h3><span>${groupTypes.length}</span></div><div class="vx-catalog-type-grid">${groupTypes.map(t=>{
        const off=offMap.has(String(t.id));
        return `<label class="vx-catalog-type${off?' off':''}"><input type="checkbox" data-type-id="${E(t.id)}" ${off?'':'checked'}> ${E(t.name)}</label>`;
      }).join('')}</div></section>`;
    }).join('')||'<p class="vx-sg-empty">Nenhum tipo de produto cadastrado no catálogo do VoxAssist ainda.</p>';
    host.querySelectorAll('[data-type-id]').forEach(cb=>cb.onchange=async()=>{
      cb.disabled=true;
      try{
        await api('rpc/admin_set_company_product_type',{method:'POST',body:JSON.stringify({p_company_id:cid,p_product_type_id:cb.dataset.typeId,p_active:cb.checked})});
        cb.closest('.vx-catalog-type').classList.toggle('off',!cb.checked);
        toast?.(cb.checked?'Tipo ativado para esta empresa.':'Tipo desativado para esta empresa.');
      }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');cb.checked=!cb.checked;}
      finally{cb.disabled=false;}
    });
  };

  // Achado do usuário em 2026-09-08: "estado do produto" era lista fixa
  // (NOVO/USADO/ARRANHADO/AVARIADO) em new-os-v0812.js e
  // os-detail-v0812.js (equipPanel), sem tela de gestão. Diferente do
  // catálogo de tipos de produto (global/compartilhado): estado é POR
  // EMPRESA de verdade -- tabela nova (product_conditions, migration
  // 20260908060000), mesmo padrão de service_groups/order_types.
  async function renderConditionsCard(cid){
    const card=document.getElementById('vxConditionsCard');if(!card)return;
    const conditions=cid?await api(`product_conditions?company_id=eq.${cid}&select=*&order=sort_order`).catch(()=>[]):[];
    card.innerHTML=`<div class="vx-admin-title"><h3>ESTADO DO PRODUTO</h3><span>${conditions.length}</span></div>
      <p class="vx-sg-help">Usado no campo ESTADO DO APARELHO, na Nova OS e na aba Equipamento da OS aberta.</p>
      <div class="vx-sg-list" id="vxConditionsList">${conditions.length?conditions.map(c=>`<div class="vx-sg-row${c.active?'':' inactive'}"><b>${E(c.name)}</b><span>${c.active?'ATIVO':'INATIVO'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(c.id)}">Renomear</button><button type="button" data-toggle="${E(c.id)}">${c.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhum estado cadastrado ainda.</p>'}</div>
      <button type="button" class="secondary" id="vxConditionNew">+ Novo estado</button>`;
    card.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
      const c=conditions.find(x=>String(x.id)===b.dataset.rename);
      if(c)openConditionModal(cid,c);
    });
    card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
      const c=conditions.find(x=>String(x.id)===b.dataset.toggle);if(!c)return;
      b.disabled=true;
      try{
        await api('rpc/admin_upsert_product_condition',{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:c.id,p_name:c.name,p_active:!c.active})});
        toast?.(c.active?'Estado desativado.':'Estado ativado.');
        await renderConditionsCard(cid);
      }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');b.disabled=false;}
    });
    document.getElementById('vxConditionNew').onclick=()=>openConditionModal(cid,null);
  }

  function openConditionModal(cid,condition){
    document.querySelector('#vxConditionModal')?.remove();
    const ov=document.createElement('div');ov.id='vxConditionModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${condition?'Renomear estado':'Novo estado'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxConditionForm" class="vx-admin-form"><label>NOME *</label><input name="name" required maxlength="30" value="${condition?E(condition.name):''}" placeholder="EX.: RISCADO, INCOMPLETO"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        await api('rpc/admin_upsert_product_condition',{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:condition?.id||null,p_name:String(f.get('name')).trim(),p_active:condition?condition.active:true})});
        ov.remove();
        toast?.(condition?'Estado atualizado.':'Estado criado.');
        await renderConditionsCard(cid);
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
  }

  const style=document.createElement('style');
  style.textContent=`.vx-catalog-type-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}.vx-catalog-type{display:flex;align-items:center;gap:7px;font-size:11.5px;border:1px solid #dbe5ee;border-radius:6px;padding:7px 9px;cursor:pointer}.vx-catalog-type.off{color:#8a96a3;background:#f7f9fb}.vx-catalog-type input{cursor:pointer}`;
  document.head.appendChild(style);
})();
