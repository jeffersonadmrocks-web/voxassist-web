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
    </div>`;
    document.getElementById('vxCatalogBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
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

  const style=document.createElement('style');
  style.textContent=`.vx-catalog-type-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}.vx-catalog-type{display:flex;align-items:center;gap:7px;font-size:11.5px;border:1px solid #dbe5ee;border-radius:6px;padding:7px 9px;cursor:pointer}.vx-catalog-type.off{color:#8a96a3;background:#f7f9fb}.vx-catalog-type input{cursor:pointer}`;
  document.head.appendChild(style);
})();
