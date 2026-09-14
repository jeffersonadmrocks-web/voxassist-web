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

  async function renderIntegrationsPage(){
    const app=document.querySelector('#app');if(!app)return;
    if(!isGestor()){
      app.innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Integrações disponíveis somente para gestores.</p></div>';
      return;
    }
    const cid=companyId();if(!cid)return;
    window.state.view='config-integracoes';
    app.innerHTML='<div class="vx-admin-page"><div class="module-home-head"><div><h2>Integrações</h2><p>Conexões e serviços externos desta empresa.</p></div><div class="module-head-actions"><button type="button" class="secondary" id="vxIntegrationsBack">← Voltar</button></div></div><div id="vxAdminExtrasGrid" class="vx-config-extras-grid"></div></div>';
    document.getElementById('vxIntegrationsBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
    const card=document.createElement('section');
    card.className='vx-admin-card';
    card.id='vxIntegrationsCard';
    app.querySelector('#vxAdminExtrasGrid').appendChild(card);
    await renderCard(card,cid);
    window.dispatchEvent(new CustomEvent('vx:integrations-ready'));
  }

  async function renderCard(card,cid){
    const [connections,elxRows,syncStatusRows]=await Promise.all([
      api('chat_connections?select=id,name,status&order=created_at.desc').catch(()=>[]),
      api(`electrolux_panel_settings?company_id=eq.${cid}&select=api_url&limit=1`).catch(()=>[]),
      api('rpc/get_electrolux_sync_status',{method:'POST',body:JSON.stringify({p_company_id:cid})}).catch(()=>[]),
    ]);
    const connected=connections.filter(c=>String(c.status||'').toUpperCase()==='CONECTADO');
    const elxConfigured=!!elxRows?.[0]?.api_url;
    const syncStatus=syncStatusRows?.[0]||{};
    const lastSync=syncStatus.last_sync_at;
    const syncErrors=syncStatus.connections_with_error||0;
    card.innerHTML=`<div class="vx-admin-title"><h3>INTEGRAÇÕES</h3></div>
      <p class="vx-sg-help">Status das integrações desta empresa. A conexão em si é gerenciada dentro de cada módulo -- aqui é só um resumo com atalho.</p>
      <div class="vx-int-row">
        <div class="vx-int-label"><b>WhatsApp</b><small>${connections.length?`${connected.length} de ${connections.length} conexão${connections.length===1?'':'ões'} ativa${connected.length===1?'':'s'}`:'Nenhuma conexão cadastrada'}</small></div>
        <span class="vx-int-badge ${connected.length?'ok':'off'}">${connected.length?'CONECTADO':'DESCONECTADO'}</span>
        <button type="button" class="secondary" id="vxIntWhats">Gerenciar conexão</button>
      </div>
      <div class="vx-int-row">
        <div class="vx-int-label"><b>Electrolux</b><small>${elxConfigured?'Endereço de API configurado':'Endereço de API não configurado'}${lastSync?' · última sincronização '+new Date(lastSync).toLocaleString('pt-BR'):''}${syncErrors?' · '+syncErrors+' conexão(ões) com erro':''}</small></div>
        <span class="vx-int-badge ${elxConfigured?(syncErrors?'off':'ok'):'off'}">${elxConfigured?(syncErrors?'COM ERRO':'CONFIGURADO'):'NÃO CONFIGURADO'}</span>
        <button type="button" class="secondary" id="vxIntElx">Abrir Electrolux</button>
      </div>`;
    card.querySelector('#vxIntWhats').onclick=()=>window.render?.('chat');
    card.querySelector('#vxIntElx').onclick=()=>window.render?.('electrolux');
  }

  const baseRender=window.render;
  window.render=async function(view){
    if(view==='config-integracoes')return renderIntegrationsPage();
    return baseRender(view);
  };

  const style=document.createElement('style');
  style.textContent=`.vx-int-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid #edf2f6}.vx-int-row:first-of-type{border-top:0}.vx-int-label{flex:1;display:flex;flex-direction:column;gap:2px}.vx-int-label b{font-size:11.5px}.vx-int-label small{font-size:9.5px;color:#8a96a3}.vx-int-badge{font-size:9px;font-weight:800;border-radius:4px;padding:3px 8px;white-space:nowrap}.vx-int-badge.ok{background:#e6f4ea;color:#1f7a3d}.vx-int-badge.off{background:#eef1f4;color:#8291a0}`;
  document.head.appendChild(style);
})();
