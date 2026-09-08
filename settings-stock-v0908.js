/* VoxAssist Web V0.9.08 — Configurações > Estoque & Peças.
   Matriz Mestra, Área 05 -- Locais de Estoque, Categorias de Peças e
   Unidades: todos CRIAR confirmados (nenhuma tabela/tela existia,
   stock_items é uma lista flat sem separação por depósito). Migration
   20260908090000, sem semeadura (nada fixo a preservar).
   Escopo desta etapa é só o CADASTRO -- ligar em stock_items/os_parts
   (campo local/categoria/unidade por item) fica pra uma etapa
   futura, sem mudar o comportamento atual do módulo de Estoque.
   Página própria, acessada pelo hub (settings-hub-v0908.js), card
   "ESTOQUE & PEÇAS" (antes placeholder, agora conteúdo real). */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const companyId=()=>state?.profile?.active_company_id;

  window.renderStockSettings=async function(){
    const app=document.querySelector('#app');if(!app)return;
    if(!isGestor()){app.innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Configurações disponíveis somente para gestores.</p></div>';return;}
    const cid=companyId();
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Estoque & Peças</h2><p>Locais, categorias e unidades desta empresa</p></div><div class="module-head-actions"><button class="secondary" id="vxStockBack">← Voltar</button></div></div>
      <section class="vx-admin-card" id="vxStockLocationsCard"></section>
      <section class="vx-admin-card" id="vxPartCategoriesCard" style="margin-top:12px"></section>
      <section class="vx-admin-card" id="vxStockUnitsCard" style="margin-top:12px"></section>
    </div>`;
    document.getElementById('vxStockBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
    LOCATIONS.render(cid);
    CATEGORIES.render(cid);
    UNITS.render(cid);
  };

  function simpleCatalogCard({cardId,table,rpc,title,help,placeholder,newLabel}){
    async function render(cid){
      const card=document.getElementById(cardId);if(!card)return;
      const rows=cid?await api(`${table}?company_id=eq.${cid}&select=*&order=sort_order`).catch(()=>[]):[];
      card.innerHTML=`<div class="vx-admin-title"><h3>${title}</h3><span>${rows.length}</span></div>
        <p class="vx-sg-help">${help}</p>
        <div class="vx-sg-list">${rows.length?rows.map(r=>`<div class="vx-sg-row${r.active?'':' inactive'}"><b>${E(r.name)}</b><span>${r.active?'ATIVO':'INATIVO'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(r.id)}">Renomear</button><button type="button" data-toggle="${E(r.id)}">${r.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nada cadastrado ainda.</p>'}</div>
        <button type="button" class="secondary" data-new>${newLabel}</button>`;
      card.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
        const r=rows.find(x=>String(x.id)===b.dataset.rename);
        if(r)openModal(cid,r);
      });
      card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
        const r=rows.find(x=>String(x.id)===b.dataset.toggle);if(!r)return;
        b.disabled=true;
        try{
          await api(`rpc/${rpc}`,{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:r.id,p_name:r.name,p_active:!r.active})});
          toast?.(r.active?'Desativado.':'Ativado.');
          await render(cid);
        }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');b.disabled=false;}
      });
      card.querySelector('[data-new]').onclick=()=>openModal(cid,null);
    }
    function openModal(cid,item){
      const modalId=cardId+'Modal';
      document.querySelector('#'+modalId)?.remove();
      const ov=document.createElement('div');ov.id=modalId;ov.className='vx-admin-overlay';
      ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${item?'Renomear':'Novo item'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form class="vx-admin-form"><label>NOME *</label><input name="name" required maxlength="60" value="${item?E(item.name):''}" placeholder="${placeholder}"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
      document.body.appendChild(ov);
      ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
      ov.querySelector('form').onsubmit=async e=>{
        e.preventDefault();
        const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
        try{
          await api(`rpc/${rpc}`,{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:item?.id||null,p_name:String(f.get('name')).trim(),p_active:item?item.active:true})});
          ov.remove();
          toast?.(item?'Atualizado.':'Criado.');
          await render(cid);
        }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
      };
    }
    return {render};
  }

  const LOCATIONS=simpleCatalogCard({cardId:'vxStockLocationsCard',table:'stock_locations',rpc:'admin_upsert_stock_location',title:'LOCAIS DE ESTOQUE',help:'Depósitos/unidades de estoque desta empresa. Separar o saldo de `stock_items` por local fica pra uma etapa futura.',placeholder:'EX.: ESTOQUE SERRA, ESTOQUE TÉCNICO',newLabel:'+ Novo local'});
  const CATEGORIES=simpleCatalogCard({cardId:'vxPartCategoriesCard',table:'part_categories',rpc:'admin_upsert_part_category',title:'CATEGORIAS DE PEÇAS',help:'Organização das peças por categoria. Vincular uma peça a uma categoria específica fica pra uma etapa futura.',placeholder:'EX.: PLACA, COMPRESSOR, TELA',newLabel:'+ Nova categoria'});
  const UNITS=simpleCatalogCard({cardId:'vxStockUnitsCard',table:'stock_units',rpc:'admin_upsert_stock_unit',title:'UNIDADES',help:'Unidades de medida usadas no estoque (UN, KIT, PAR, METRO...).',placeholder:'EX.: UN, KIT, PAR, METRO',newLabel:'+ Nova unidade'});
})();
