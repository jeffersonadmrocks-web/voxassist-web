/* VoxAssist V0.8.13 — Chat — Beta ("Chat VoxAssist"). NÃO edita nenhum
   arquivo existente. Injeta um item a mais no menu lateral
   (.desktop-menu, mesma classe .nav dos itens nativos), visível só para
   GESTOR, e ao clicar substitui #app pela própria tela — mesmo padrão
   não-invasivo de electrolux-nps-v0826.js e operational-jornada-v0827.js.
   "Voltar" chama window.render('dashboard').

   A integração com a Digisac foi revogada (2026-08-28): o VoxAssist não
   depende mais dela. Novo padrão: VOXASSIST → CHAT VOXASSIST →
   MessagingService → MessagingProvider → WhatsAppQrProvider (rodando
   isolado no gateway Railway voxassist-whatsapp-gateway, repositório
   separado) → futuramente MetaCloudApiProvider. Este arquivo nunca fala
   com o gateway diretamente — sempre via a edge function
   chat-gateway-proxy, que segura o token de serviço e confere GESTOR +
   posse da conexão antes de repassar qualquer coisa.

   ETAPA C (2026-08-28): Configurações → Conexões — criar conexão, gerar
   QR, conectar/reconectar/desconectar. Ainda NÃO é a Central de
   Conversas completa (isso é etapa futura, com validação de estrutura
   visual antes de implementar). Restrito a GESTOR, mesmo critério das
   RLS de chat_connections. */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function role(){return state.profile?.role||'GESTOR'}
  function isGestor(){return role()==='GESTOR'}

  /* ---------- entrada no menu lateral ---------- */
  function ensureNavEntry(){
    const menu=document.querySelector('.desktop-menu');
    if(!menu)return;
    const existing=menu.querySelector('[data-chat-beta-entry]');
    if(!isGestor()){ if(existing)existing.remove(); return; }
    if(existing)return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='nav';
    btn.dataset.chatBetaEntry='1';
    btn.innerHTML='◆ <span>CHAT — BETA</span>';
    btn.onclick=openChatBetaScreen;
    menu.appendChild(btn);
  }
  const observer=new MutationObserver(ensureNavEntry);
  observer.observe(document.body,{childList:true,subtree:true});

  function goBack(){window.render('dashboard')}

  /* ---------- gateway (via edge function, nunca direto) ---------- */
  async function gatewayAction(action,payload){
    const res=await fetch(CFG.url+'/functions/v1/chat-gateway-proxy',{
      method:'POST',headers:authHeaders(),
      body:JSON.stringify({action,...payload}),
    });
    const data=await res.json().catch(()=>null);
    if(!data)throw new Error('Resposta inesperada da function.');
    if(!res.ok||data.ok===false)throw new Error(data.error||'Falha na operação.');
    return data;
  }

  /* ---------- navegação ---------- */
  let cache={connections:[],stores:[]};

  function openChatBetaScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active'));
    document.querySelector('[data-chat-beta-entry]')?.classList.add('active');
    renderHome();
  }

  function renderHome(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML=`<div class="vx-chatbeta">
      <div class="vx-chatbeta-head">
        <div><button id="chatBetaBack">← Voltar</button><h2>Chat — Beta</h2><small>Chat VoxAssist · ambiente de homologação</small></div>
      </div>
      <div class="vx-chatbeta-notice">A Digisac continua sendo utilizada pela Vox normalmente, de forma externa e independente, durante esta fase de transição. Esta área vai se tornar o Chat VoxAssist — comunicação própria com o cliente pelo WhatsApp, integrada a clientes e OS.</div>
      <div class="vx-chatbeta-card">
        <h3>Configurações</h3>
        <p class="vx-chatbeta-sub">Conexões WhatsApp da empresa ativa — cada conexão representa um número, autenticado por QR Code.</p>
        <button id="chatBetaGoConexoes" class="primary">Configurações → Conexões</button>
      </div>
    </div>`;
    document.getElementById('chatBetaBack').onclick=goBack;
    document.getElementById('chatBetaGoConexoes').onclick=openConexoesScreen;
  }

  /* ---------- Conexões ---------- */
  const STATUS_LABEL={
    DESCONECTADO:{text:'Desconectado',cls:'neutral'},
    CONECTANDO:{text:'Conectando…',cls:'neutral'},
    QR_REQUIRED:{text:'Aguardando QR',cls:'warn'},
    CONECTADO:{text:'Conectado',cls:'ok'},
    RECONNECTING:{text:'Reconectando…',cls:'warn'},
    SESSION_INVALID:{text:'Sessão inválida',cls:'err'},
    ERRO:{text:'Erro',cls:'err'},
  };

  async function loadConexoesData(){
    const [connections,stores]=await Promise.all([
      api('chat_connections?select=*&order=created_at.desc').catch(()=>[]),
      api('stores?select=id,name&active=eq.true&order=name').catch(()=>[]),
    ]);
    cache.connections=connections||[];
    cache.stores=stores||[];
  }

  async function openConexoesScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="vx-chatbeta"><div class="vx-chatbeta-loading">Carregando conexões…</div></div>';
    try{
      await loadConexoesData();
      renderConexoesScreen();
    }catch(e){
      app.innerHTML=`<div class="vx-chatbeta"><div class="vx-chatbeta-card"><h3>Falha ao carregar Conexões</h3><p class="vx-chatbeta-sub">${E(e.message||'Erro desconhecido.')}</p><button id="conexoesBackErr">← Voltar</button></div></div>`;
      document.getElementById('conexoesBackErr').onclick=renderHome;
    }
  }

  function storeName(storeId){
    if(!storeId)return'Todas as filiais';
    return cache.stores.find(s=>String(s.id)===String(storeId))?.name||'—';
  }

  function connectionCard(c){
    const label=STATUS_LABEL[c.status]||{text:c.status,cls:'neutral'};
    const lastConn=c.last_connected_at?new Date(c.last_connected_at).toLocaleString('pt-BR'):'Nunca conectou';
    const showConnect=c.status==='DESCONECTADO';
    const showReconnect=c.status==='ERRO'||c.status==='SESSION_INVALID';
    const showDisconnect=['CONECTANDO','QR_REQUIRED','CONECTADO','RECONNECTING'].includes(c.status);
    return `<div class="vx-conn-card" data-conn="${E(c.id)}">
      <div class="vx-conn-card-head">
        <b>${E(c.name)}</b>
        <span class="vx-conn-badge vx-conn-badge-${E(label.cls)}">${E(label.text)}</span>
      </div>
      <div class="vx-conn-card-body">
        <div><span>Filial</span><b>${E(storeName(c.store_id))}</b></div>
        <div><span>Número</span><b>${E(c.phone_number||'—')}</b></div>
        <div><span>Última conexão</span><b>${E(lastConn)}</b></div>
      </div>
      <div class="vx-conn-card-actions">
        ${showConnect?`<button class="primary" data-action="connect" data-id="${E(c.id)}">Conectar</button>`:''}
        ${showReconnect?`<button class="primary" data-action="reconnect" data-id="${E(c.id)}">Reconectar</button>`:''}
        ${showDisconnect?`<button data-action="disconnect" data-id="${E(c.id)}">Desconectar</button>`:''}
      </div>
    </div>`;
  }

  function renderConexoesScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML=`<div class="vx-chatbeta vx-chatbeta-wide">
      <div class="vx-chatbeta-head">
        <div><button id="conexoesBack">← Voltar</button><h2>Chat → Configurações → Conexões</h2><small>Cada conexão é um número WhatsApp independente, autenticado por QR Code</small></div>
      </div>
      <div class="vx-chatbeta-card">
        <h3>Nova conexão</h3>
        <form id="novaConexaoForm" class="vx-conn-new-form">
          <input name="name" placeholder="Nome da conexão (ex.: Vox Serra — Atendimento)" required maxlength="80">
          <select name="storeId"><option value="">Todas as filiais</option>${cache.stores.map(s=>`<option value="${E(s.id)}">${E(s.name)}</option>`).join('')}</select>
          <button type="submit" class="primary">+ Adicionar conexão</button>
        </form>
      </div>
      <div class="vx-conn-grid">
        ${cache.connections.length?cache.connections.map(connectionCard).join(''):'<div class="vx-chatbeta-sub">Nenhuma conexão criada ainda.</div>'}
      </div>
    </div>`;
    document.getElementById('conexoesBack').onclick=renderHome;
    document.getElementById('novaConexaoForm').onsubmit=handleCreateConexao;
    document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>handleConnAction(b.dataset.action,b.dataset.id));
  }

  async function handleCreateConexao(e){
    e.preventDefault();
    const f=new FormData(e.target);
    const name=String(f.get('name')||'').trim();
    const storeId=String(f.get('storeId')||'')||null;
    if(!name)return;
    const btn=e.target.querySelector('button[type=submit]');
    btn.disabled=true;
    try{
      await gatewayAction('create',{name,storeId});
      toast?.('Conexão criada.');
      await loadConexoesData();
      renderConexoesScreen();
    }catch(err){
      toast?.('Não foi possível criar a conexão: '+err.message,'err');
      btn.disabled=false;
    }
  }

  async function handleConnAction(action,connectionId){
    try{
      if(action==='connect'||action==='reconnect'){
        await gatewayAction(action,{connectionId});
        openQrModal(connectionId);
      }else if(action==='disconnect'){
        await gatewayAction('disconnect',{connectionId});
        toast?.('Conexão desconectada.');
      }
      await loadConexoesData();
      renderConexoesScreen();
    }catch(err){
      toast?.('Falha na operação: '+err.message,'err');
    }
  }

  /* ---------- QR ----------
     Poll simples (mesmo padrão já usado no resto do app — sem realtime
     nesta etapa) até vir uma imagem de QR ou a conexão virar CONECTADO.
     Nunca mostra nada além da imagem — o gateway já garante que /qr não
     devolve dado de sessão. */
  let qrPollTimer=null;
  function stopQrPoll(){if(qrPollTimer){clearInterval(qrPollTimer);qrPollTimer=null}}

  function openQrModal(connectionId){
    document.querySelector('#vxQrModal')?.remove();
    const bg=document.createElement('div');
    bg.id='vxQrModal';
    bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal vx-conn-qr-modal">
      <h3>Escaneie o QR Code</h3>
      <p class="vx-chatbeta-sub">WhatsApp do celular → Aparelhos conectados → Conectar um aparelho.</p>
      <div id="vxQrBox" class="vx-conn-qr-box"><span>Gerando QR…</span></div>
      <div class="vx-modal-actions"><button data-cancel>Fechar</button></div>
    </div>`;
    document.body.appendChild(bg);
    const close=()=>{stopQrPoll();bg.remove();loadConexoesData().then(renderConexoesScreen)};
    bg.querySelector('[data-cancel]').onclick=close;
    bg.addEventListener('click',e=>{if(e.target===bg)close()});

    let attempts=0;
    const MAX_ATTEMPTS=45; // ~90s a 2s por tentativa
    qrPollTimer=setInterval(async()=>{
      attempts++;
      try{
        const data=await gatewayAction('qr',{connectionId});
        const box=document.getElementById('vxQrBox');
        if(!box)return stopQrPoll();
        if(data.status==='CONECTADO'){
          stopQrPoll();
          box.innerHTML='<span>Conectado com sucesso ✓</span>';
          toast?.('WhatsApp conectado.');
          setTimeout(close,1200);
          return;
        }
        if(data.qr){
          box.innerHTML=`<img src="${E(data.qr)}" alt="QR Code" width="240" height="240">`;
        }else{
          box.innerHTML=`<span>Status: ${E(STATUS_LABEL[data.status]?.text||data.status)}</span>`;
        }
      }catch(err){
        stopQrPoll();
        const box=document.getElementById('vxQrBox');
        if(box)box.innerHTML=`<span>Falha ao obter o QR: ${E(err.message)}</span>`;
      }
      if(attempts>=MAX_ATTEMPTS)stopQrPoll();
    },2000);
  }
})();
