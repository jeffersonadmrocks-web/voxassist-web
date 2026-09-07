/* VoxAssist Web V0.9.07 — INTEGRAÇÕES (status real + link, Configurações).
   Achado do usuário em 2026-09-07 (ampliação do menu Configurações):
   conexão WhatsApp (chat_connections, real) e config Electrolux
   (electrolux_panel_settings, real) existem e funcionam, mas moram
   escondidas dentro do Chat e do módulo Electrolux -- ninguém em
   Configurações via se estavam ligadas ou não. Este card só MOSTRA o
   status real (mesmas tabelas que os módulos já usam, nenhuma lógica
   nova/duplicada) e linka pra dentro de cada módulo pra gerenciar --
   não recria o fluxo de QR Code nem o cadastro de endpoint aqui.
   Mesmo padrão de injeção validado nesta sessão pra Grupos de
   Atendimento/Lojas: GESTOR-only, MutationObserver com debounce. */
(function(){
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
    if(state?.view!=='usuarios'||!isGestor())return;
    const page=document.querySelector('.vx-admin-page');
    if(!page||page.dataset.vxIntegrations==='1')return;
    const cid=companyId();if(!cid)return;
    page.dataset.vxIntegrations='1';
    const card=document.createElement('section');
    card.className='vx-admin-card';
    card.id='vxIntegrationsCard';
    extrasGrid(page).appendChild(card);
    await renderCard(card,cid);
   }catch(err){console.error('[integrations] falha ao injetar card:',err);}
  }

  async function renderCard(card,cid){
    const [connections,elxRows]=await Promise.all([
      api('chat_connections?select=id,name,status&order=created_at.desc').catch(()=>[]),
      api(`electrolux_panel_settings?company_id=eq.${cid}&select=api_url&limit=1`).catch(()=>[]),
    ]);
    const connected=connections.filter(c=>String(c.status||'').toUpperCase()==='CONECTADO');
    const elxConfigured=!!elxRows?.[0]?.api_url;
    card.innerHTML=`<div class="vx-admin-title"><h3>INTEGRAÇÕES</h3></div>
      <p class="vx-sg-help">Status das integrações desta empresa. A conexão em si é gerenciada dentro de cada módulo -- aqui é só um resumo com atalho.</p>
      <div class="vx-int-row">
        <div class="vx-int-label"><b>WhatsApp</b><small>${connections.length?`${connected.length} de ${connections.length} conexão${connections.length===1?'':'ões'} ativa${connected.length===1?'':'s'}`:'Nenhuma conexão cadastrada'}</small></div>
        <span class="vx-int-badge ${connected.length?'ok':'off'}">${connected.length?'CONECTADO':'DESCONECTADO'}</span>
        <button type="button" class="secondary" id="vxIntWhats">Gerenciar conexão</button>
      </div>
      <div class="vx-int-row">
        <div class="vx-int-label"><b>Electrolux</b><small>${elxConfigured?'Endereço de API configurado':'Endereço de API não configurado'}</small></div>
        <span class="vx-int-badge ${elxConfigured?'ok':'off'}">${elxConfigured?'CONFIGURADO':'NÃO CONFIGURADO'}</span>
        <button type="button" class="secondary" id="vxIntElx">Abrir Electrolux</button>
      </div>`;
    card.querySelector('#vxIntWhats').onclick=()=>window.render?.('chat');
    card.querySelector('#vxIntElx').onclick=()=>window.render?.('electrolux');
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

  const style=document.createElement('style');
  style.textContent=`.vx-int-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid #edf2f6}.vx-int-row:first-of-type{border-top:0}.vx-int-label{flex:1;display:flex;flex-direction:column;gap:2px}.vx-int-label b{font-size:11.5px}.vx-int-label small{font-size:9.5px;color:#8a96a3}.vx-int-badge{font-size:9px;font-weight:800;border-radius:4px;padding:3px 8px;white-space:nowrap}.vx-int-badge.ok{background:#e6f4ea;color:#1f7a3d}.vx-int-badge.off{background:#eef1f4;color:#8291a0}`;
  document.head.appendChild(style);
})();
