/* VoxAssist Web V0.9.07 — LOJAS (cadastro real, Configurações).
   Achado do usuário em 2026-09-07 (ampliação do menu Configurações):
   não existia formulário nenhum de criar/editar loja em lugar nenhum
   do app -- company-store-model-v0813.js só LISTA nomes (somente
   leitura). Mesmo padrão de injeção já validado pra Grupos de
   Atendimento (service-groups-v0904.js): GESTOR-only,
   MutationObserver com debounce (a tela de "usuarios" é reconstruída
   de forma assíncrona quando o gestor tem mais de uma empresa --
   setTimeout único perde a corrida), mesmo CSS .vx-admin-card/
   .vx-admin-overlay/.vx-admin-modal já existente. Reaproveita a
   tabela stores já usada em toda a Fase D/pedidos de peça/OS -- não
   cria tabela nova. RPC admin_upsert_store, migration
   20260907020000. */
(function(){
  console.log('[cfg-debug] service-stores-admin-v0907.js carregou');
  const E=window.esc||((v='')=>String(v??''));

  function companyId(){return state?.profile?.active_company_id}
  function isGestor(){return String(state?.profile?.role||'').toUpperCase()==='GESTOR'}

  // Achado do usuário em 2026-09-07: card ia direto pra .vx-admin-page
  // (grid de 1 coluna só) -- empilhava numa lista longa. Reaproveita a
  // mesma grade compartilhada de 2 colunas (.vx-admin-grid, já
  // existente nesse painel) que os outros cards novos usam.
  function extrasGrid(page){
    let grid=page.querySelector('#vxAdminExtrasGrid');
    if(!grid){grid=document.createElement('div');grid.id='vxAdminExtrasGrid';grid.className='vx-config-extras-grid';page.appendChild(grid);}
    return grid;
  }

  async function enhance(){
   try{
    console.log('[cfg-debug] stores-admin enhance() rodou -- view:',state?.view,'gestor:',isGestor());
    if(state?.view!=='usuarios'||!isGestor())return;
    const page=document.querySelector('.vx-admin-page');
    if(!page||page.dataset.vxStoresAdmin==='1')return;
    const cid=companyId();if(!cid)return;
    page.dataset.vxStoresAdmin='1';
    const card=document.createElement('section');
    card.className='vx-admin-card';
    card.id='vxStoresAdminCard';
    extrasGrid(page).appendChild(card);
    await renderCard(card,cid);
    console.log('[cfg-debug] stores-admin card injetado com sucesso');
   }catch(err){console.error('[cfg-debug] stores-admin enhance() ERRO:',err);}
  }

  async function renderCard(card,cid){
    const stores=await api(`stores?company_id=eq.${cid}&select=*&order=name`).catch(()=>[]);
    card.innerHTML=`<div class="vx-admin-title"><h3>LOJAS</h3><span>${stores.length}</span></div>
      <p class="vx-sg-help">Unidades desta empresa (ex.: "VOX SERRA"). Usada na abertura de OS, pedidos de peça e agenda.</p>
      <div class="vx-sg-list">${stores.length?stores.map(s=>`<div class="vx-sg-row${s.active?'':' inactive'}"><b>${E(s.name)}</b><span>${E(s.code||'SEM CÓDIGO')} • ${s.active?'ATIVA':'INATIVA'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(s.id)}">Renomear</button><button type="button" data-toggle="${E(s.id)}" data-active="${s.active?'1':'0'}">${s.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhuma loja cadastrada ainda.</p>'}</div>
      <button type="button" class="secondary" id="vxStNew">+ Nova loja</button>`;
    card.querySelector('#vxStNew').onclick=()=>openStoreModal(null,card);
    card.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
      const s=stores.find(x=>String(x.id)===b.dataset.rename);
      if(s)openStoreModal(s,card);
    });
    card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
      const s=stores.find(x=>String(x.id)===b.dataset.toggle);if(!s)return;
      b.disabled=true;
      try{
        await api('rpc/admin_upsert_store',{method:'POST',body:JSON.stringify({p_company_id:companyId(),p_id:s.id,p_name:s.name,p_code:s.code,p_active:!s.active})});
        toast?.(s.active?'Loja desativada.':'Loja ativada.');
        await renderCard(card,companyId());
      }catch(err){toast?.('Não foi possível alterar a loja: '+err.message,'err');b.disabled=false;}
    });
  }

  function openStoreModal(store,card){
    document.querySelector('#vxStModal')?.remove();
    const ov=document.createElement('div');ov.id='vxStModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${store?'Renomear loja':'Nova loja'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxStForm" class="vx-admin-form"><label>NOME DA LOJA *</label><input name="name" required maxlength="80" value="${store?E(store.name):''}" placeholder="EX.: VOX SERRA"><label>CÓDIGO (opcional)</label><input name="code" maxlength="20" value="${store?E(store.code||''):''}" placeholder="EX.: SERRA"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        await api('rpc/admin_upsert_store',{method:'POST',body:JSON.stringify({p_company_id:companyId(),p_id:store?.id||null,p_name:String(f.get('name')).trim(),p_code:String(f.get('code')||'').trim(),p_active:store?store.active:true})});
        ov.remove();
        toast?.(store?'Loja atualizada.':'Loja criada.');
        await renderCard(card,companyId());
      }catch(err){toast?.('Não foi possível salvar a loja: '+err.message,'err');btn.disabled=false;}
    };
  }

  let enhanceDebounce=null;
  function scheduleEnhance(){
    if(enhanceDebounce)clearTimeout(enhanceDebounce);
    enhanceDebounce=setTimeout(enhance,120);
  }
  const baseRender=window.render;
  window.render=async function(view){const r=await baseRender(view);if(view==='usuarios')scheduleEnhance();return r};

  const appRoot=document.querySelector('#app')||document.body;
  new MutationObserver(()=>{if(state?.view==='usuarios')scheduleEnhance();}).observe(appRoot,{childList:true,subtree:true});
})();
