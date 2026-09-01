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

  /* ---------- horário de atendimento ----------
     Mesma regra do backend (chat-inbound-webhook, via
     _shared/messagingService.ts): segunda a sexta, 08h-18h, horário de
     Brasília. America/Sao_Paulo é UTC-3 fixo (sem horário de verão
     desde 2019) -- por isso dá pra calcular só com aritmética de
     milissegundos, sem depender de Intl/timezone. Isto aqui é só pra
     exibição (o back-end é quem decide de verdade se manda a mensagem
     automática); nunca usado pra bloquear nenhuma ação do atendente. */
  const BUSINESS_TZ_OFFSET_MIN=-180;
  function isWithinBusinessHoursNow(){
    const wall=new Date(Date.now()+BUSINESS_TZ_OFFSET_MIN*60*1000);
    const weekday=wall.getUTCDay(), hour=wall.getUTCHours();
    return weekday>=1&&weekday<=5&&hour>=8&&hour<18;
  }
  function businessHoursBadge(){
    const open=isWithinBusinessHoursNow();
    return `<span class="vx-hours-badge vx-hours-badge-${open?'ok':'off'}">${open?'Atendimento aberto agora':'Fora do horário — resposta automática ativa'}</span>`;
  }

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
  /* ---------- erros do chat-gateway-proxy ----------
     Achado real (2026-08-31): "unauthorized" podia significar duas
     coisas bem diferentes — sessão VoxAssist inválida OU o gateway
     recusando o token de serviço (problema de configuração, não do
     usuário). A function agora diferencia (gateway_unauthorized é um
     código próprio) — o frontend traduz cada um pra uma mensagem que
     não confunde as duas causas. */
  const GATEWAY_ERROR_MESSAGES={
    unauthorized:'Sua sessão expirou — faça login novamente.',
    forbidden:'Este recurso é restrito a usuários GESTOR.',
    no_active_company:'Nenhuma empresa ativa selecionada.',
    gateway_not_configured:'A integração com o gateway ainda não foi configurada.',
    gateway_unauthorized:'O gateway recusou a autenticação de serviço — não é um problema da sua sessão, é uma configuração pendente (contate o suporte técnico).',
    gateway_unreachable:'Não foi possível contatar o gateway no momento.',
    connection_not_found:'Conexão não encontrada.',
  };
  async function gatewayAction(action,payload){
    const res=await fetch(CFG.url+'/functions/v1/chat-gateway-proxy',{
      method:'POST',headers:authHeaders(),
      body:JSON.stringify({action,...payload}),
    });
    const data=await res.json().catch(()=>null);
    if(!data)throw new Error('Resposta inesperada da function.');
    if(!res.ok||data.ok===false)throw new Error(GATEWAY_ERROR_MESSAGES[data.error]||data.error||'Falha na operação.');
    return data;
  }

  /* ---------- navegação ---------- */
  let cache={connections:[],stores:[]};

  async function openChatBetaScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active'));
    document.querySelector('[data-chat-beta-entry]')?.classList.add('active');
    await renderHome();
  }

  // Busca as conexões toda vez que a tela inicial abre — mesmo achado
  // real documentado abaixo (renderConexoesScreen): sem isso, quem olha
  // só a tela inicial nunca sabe se uma conexão existente ficou
  // desconectada (ou "sumiu" por falta de refresh, como já aconteceu).
  async function connectionsSummary(){
    const rows=await api('chat_connections?select=id,name,status&order=created_at.desc').catch(()=>null);
    if(!rows)return'<p class="vx-chatbeta-sub">Não foi possível carregar o resumo de conexões.</p>';
    if(!rows.length)return'<p class="vx-chatbeta-sub">Nenhuma conexão criada ainda.</p>';
    return `<div class="vx-conn-summary-list">${rows.map(c=>{
      const label=STATUS_LABEL[c.status]||{text:c.status,cls:'neutral'};
      return `<div class="vx-conn-summary-row"><b>${E(c.name)}</b><span class="vx-conn-badge vx-conn-badge-${E(label.cls)}">${E(label.text)}</span></div>`;
    }).join('')}</div>`;
  }

  async function renderHome(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML=`<div class="vx-chatbeta">
      <div class="vx-chatbeta-head">
        <div><button id="chatBetaBack">← Voltar</button><h2>Chat — Beta</h2><small>Chat VoxAssist · ambiente de homologação</small></div>
      </div>
      <div class="vx-chatbeta-notice">A Digisac continua sendo utilizada pela Vox normalmente, de forma externa e independente, durante esta fase de transição. Esta área vai se tornar o Chat VoxAssist — comunicação própria com o cliente pelo WhatsApp, integrada a clientes e OS.</div>
      <div class="vx-chatbeta-card">
        <h3>Horário de atendimento</h3>
        <p class="vx-chatbeta-sub">Segunda a sexta, das 8h às 18h (horário de Brasília). Fora desse período, quem escrever recebe uma mensagem automática avisando que o atendimento está fechado — sem repetir várias vezes pro mesmo cliente, e volta ao normal sozinho no próximo expediente.</p>
        ${businessHoursBadge()}
      </div>
      <div class="vx-chatbeta-card">
        <h3>Configurações</h3>
        <p class="vx-chatbeta-sub">Conexões WhatsApp da empresa ativa — cada conexão representa um número, autenticado por QR Code.</p>
        <div id="chatBetaConnSummary" class="vx-chatbeta-sub">Carregando…</div>
        <button id="chatBetaGoConexoes" class="primary">Configurações → Conexões</button>
      </div>
      <div class="vx-chatbeta-card">
        <h3>Conversas (teste)</h3>
        <p class="vx-chatbeta-sub">Fluxo mínimo pra validar recebimento/envio real com uma conexão de teste — ainda não é a Central de Conversas completa.</p>
        <button id="chatBetaGoConversas">Conversas → teste</button>
      </div>
      <div class="vx-chatbeta-card">
        <h3>Importação de histórico</h3>
        <p class="vx-chatbeta-sub">Conversas, contatos e mensagens que o WhatsApp disponibilizar na primeira conexão. Estrutura de dados já pronta; o gatilho real ainda depende do gateway (etapa futura) — aqui dá pra acompanhar o que já existir.</p>
        <button id="chatBetaGoImport">Importação → histórico</button>
      </div>
    </div>`;
    document.getElementById('chatBetaBack').onclick=goBack;
    document.getElementById('chatBetaGoConexoes').onclick=openConexoesScreen;
    document.getElementById('chatBetaGoConversas').onclick=openConversasScreen;
    document.getElementById('chatBetaGoImport').onclick=openImportPickerScreen;
    document.getElementById('chatBetaConnSummary').innerHTML=await connectionsSummary();
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
        <button data-action="import" data-id="${E(c.id)}">Importações</button>
      </div>
    </div>`;
  }

  function renderConexoesScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML=`<div class="vx-chatbeta vx-chatbeta-wide">
      <div class="vx-chatbeta-head">
        <div><button id="conexoesBack">← Voltar</button><h2>Chat → Configurações → Conexões</h2><small>Cada conexão é um número WhatsApp independente, autenticado por QR Code</small></div>
        ${businessHoursBadge()}
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
    if(action==='import'){ await openImportScreen(connectionId); return; }
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

  /* ---------- Importação de histórico ----------
     Lê chat_import_runs/chat_contacts direto (RLS já restringe a
     GESTOR da empresa) -- schema pronto desde o Lote 1/2 do plano
     técnico de importação, mas o gatilho real (gateway processando
     messaging-history.set em lotes) ainda não existe, então aqui é
     leitura + estado vazio honesto, nunca um botão fingindo funcionar. */
  const IMPORT_STATUS_LABEL={
    RUNNING:{text:'Importando…',cls:'warn'},
    COMPLETED:{text:'Sincronização inicial concluída',cls:'ok'},
    PARTIAL:{text:'Histórico importado parcialmente',cls:'warn'},
    INTERRUPTED:{text:'Sincronização interrompida',cls:'err'},
    FAILED:{text:'Falha na importação',cls:'err'},
  };
  const CONTACT_STATUS_LABEL={
    NAO_VINCULADO:{text:'Não vinculado',cls:'neutral'},
    VINCULADO_CLIENTE:{text:'Vinculado a cliente',cls:'ok'},
    SOMENTE_CONTATO:{text:'Só contato',cls:'neutral'},
  };

  async function openImportPickerScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="vx-chatbeta"><div class="vx-chatbeta-loading">Carregando conexões…</div></div>';
    try{
      const connections=await api('chat_connections?select=id,name&order=created_at.desc').catch(()=>[]);
      if(!connections||!connections.length){
        app.innerHTML=`<div class="vx-chatbeta"><div class="vx-chatbeta-card"><h3>Importação de histórico</h3><p class="vx-chatbeta-sub">Nenhuma conexão criada ainda — crie uma conexão em Configurações → Conexões primeiro.</p><button id="importBackErr">← Voltar</button></div></div>`;
        document.getElementById('importBackErr').onclick=renderHome;
        return;
      }
      if(connections.length===1){ await openImportScreen(connections[0].id); return; }
      app.innerHTML=`<div class="vx-chatbeta">
        <div class="vx-chatbeta-head"><div><button id="importPickBack">← Voltar</button><h2>Importação de histórico</h2><small>Escolha a conexão</small></div></div>
        <div class="vx-conn-summary-list">${connections.map(c=>`<div class="vx-conn-summary-row vx-conv-row" data-pick="${E(c.id)}" style="cursor:pointer"><b>${E(c.name)}</b><span>→</span></div>`).join('')}</div>
      </div>`;
      document.getElementById('importPickBack').onclick=renderHome;
      document.querySelectorAll('[data-pick]').forEach(el=>el.onclick=()=>openImportScreen(el.dataset.pick));
    }catch(e){
      app.innerHTML=`<div class="vx-chatbeta"><div class="vx-chatbeta-card"><h3>Falha ao carregar conexões</h3><p class="vx-chatbeta-sub">${E(e.message||'Erro desconhecido.')}</p><button id="importBackErr2">← Voltar</button></div></div>`;
      document.getElementById('importBackErr2').onclick=renderHome;
    }
  }

  function importRunCard(r){
    const label=IMPORT_STATUS_LABEL[r.status]||{text:r.status,cls:'neutral'};
    const started=r.started_at?new Date(r.started_at).toLocaleString('pt-BR'):'—';
    const finished=r.finished_at?new Date(r.finished_at).toLocaleString('pt-BR'):'Em andamento';
    const showResume=r.status==='INTERRUPTED';
    return `<div class="vx-import-run-card">
      <div class="vx-import-run-head">
        <b>${E(r.sync_type==='RECUPERACAO'?'Recuperação':'Inicial')}</b>
        <span class="vx-conn-badge vx-conn-badge-${E(label.cls)}">${E(label.text)}</span>
      </div>
      <div class="vx-chatbeta-sub">Início: ${E(started)} · Término: ${E(finished)}</div>
      <div class="vx-import-run-counts">
        <div>Conversas<b>${E(r.chats_received)}</b></div>
        <div>Contatos<b>${E(r.contacts_received)}</b></div>
        <div>Mensagens recebidas<b>${E(r.messages_received)}</b></div>
        <div>Inseridas<b>${E(r.messages_inserted)}</b></div>
        <div>Duplicadas<b>${E(r.messages_duplicate)}</b></div>
        <div>Em quarentena<b>${E(r.messages_quarantined)}</b></div>
        <div>Falharam<b>${E(r.messages_failed)}</b></div>
      </div>
      ${r.error_message?`<div class="vx-chatbeta-sub">Erro: ${E(r.error_message)}</div>`:''}
      ${showResume?`<button class="vx-import-start" disabled title="Depende do gateway aceitar retomada de importação — ainda não implementado">Retomar importação</button>`:''}
    </div>`;
  }

  function contactRow(c){
    const label=CONTACT_STATUS_LABEL[c.status]||{text:c.status,cls:'neutral'};
    return `<div class="vx-contact-row">
      <div><b>${E(c.display_name||c.customer_phone||'Contato WhatsApp')}</b><br><span>${E(c.customer_phone||'Telefone não identificado')}</span></div>
      <span class="vx-conn-badge vx-conn-badge-${E(label.cls)}">${E(label.text)}</span>
    </div>`;
  }

  async function openImportScreen(connectionId){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="vx-chatbeta"><div class="vx-chatbeta-loading">Carregando importações…</div></div>';
    try{
      const [connRows,runs,contacts]=await Promise.all([
        api(`chat_connections?id=eq.${connectionId}&select=id,name`).catch(()=>[]),
        api(`chat_import_runs?connection_id=eq.${connectionId}&select=*&order=started_at.desc`).catch(()=>[]),
        api(`chat_contacts?connection_id=eq.${connectionId}&select=*&order=created_at.desc&limit=50`).catch(()=>[]),
      ]);
      const connName=connRows?.[0]?.name||'Conexão';
      app.innerHTML=`<div class="vx-chatbeta vx-chatbeta-wide">
        <div class="vx-chatbeta-head">
          <div><button id="importBack">← Voltar</button><h2>Importação de histórico — ${E(connName)}</h2><small>Conversas, contatos e mensagens que o WhatsApp disponibilizar</small></div>
        </div>
        <div class="vx-chatbeta-card">
          <h3>Nova importação</h3>
          <p class="vx-chatbeta-sub">O volume disponível depende do WhatsApp, do aparelho principal e da sessão vinculada — nunca é garantido que o histórico completo esteja disponível.</p>
          <div class="vx-import-legend">${Object.values(IMPORT_STATUS_LABEL).map(l=>`<span class="vx-conn-badge vx-conn-badge-${E(l.cls)}">${E(l.text)}</span>`).join('')}</div>
          <button class="primary vx-import-start" id="importStartBtn" disabled title="O gateway ainda não processa messaging-history.set em lotes -- gatilho pendente de implementação">Iniciar importação</button>
          <p class="vx-chatbeta-sub">Estrutura de banco já pronta (schema aplicado e testado). O disparo real depende do gateway WhatsApp suportar a sincronização de histórico — próxima etapa do plano técnico.</p>
        </div>
        <div class="vx-chatbeta-card">
          <h3>Execuções</h3>
          ${runs&&runs.length?runs.map(importRunCard).join(''):'<p class="vx-chatbeta-sub">Nenhuma importação executada ainda.</p>'}
        </div>
        <div class="vx-chatbeta-card">
          <h3>Contatos importados</h3>
          <p class="vx-chatbeta-sub">Nenhum contato do WhatsApp vira cliente automaticamente — vínculo é sempre uma ação manual.</p>
          <div class="vx-conn-summary-list">${contacts&&contacts.length?contacts.map(contactRow).join(''):'<p class="vx-chatbeta-sub">Nenhum contato importado ainda.</p>'}</div>
        </div>
      </div>`;
      document.getElementById('importBack').onclick=openConexoesScreen;
      document.getElementById('importStartBtn').onclick=()=>toast?.('Ainda não disponível — depende da implementação do gateway (Lote 5/6 do plano técnico).','err');
    }catch(e){
      app.innerHTML=`<div class="vx-chatbeta"><div class="vx-chatbeta-card"><h3>Falha ao carregar importações</h3><p class="vx-chatbeta-sub">${E(e.message||'Erro desconhecido.')}</p><button id="importBackErr3">← Voltar</button></div></div>`;
      document.getElementById('importBackErr3').onclick=openConexoesScreen;
    }
  }

  /* ---------- Conversas (teste) — ETAPA D ----------
     Fluxo mínimo pra homologar recebimento/envio real com uma conexão
     de teste. NÃO é a Central de Conversas completa (3 colunas, contexto
     de OS/cliente, filtros, transferência) — isso é etapa futura, com
     validação da estrutura visual antes de implementar. Aqui só existe
     o essencial pra provar que a mensagem chega e sai de verdade. */
  let conversasCache={list:[]};
  let conversaAtualId=null;
  let conversaPollTimer=null;
  function stopConversaPoll(){if(conversaPollTimer){clearInterval(conversaPollTimer);conversaPollTimer=null}}

  async function openConversasScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    stopConversaPoll();
    app.innerHTML='<div class="vx-chatbeta"><div class="vx-chatbeta-loading">Carregando conversas…</div></div>';
    try{
      conversasCache.list=await api('chat_conversations?select=id,customer_phone,customer_name,status,last_message_preview,last_message_at&order=last_message_at.desc.nullslast').catch(()=>[]);
      renderConversasScreen();
    }catch(e){
      app.innerHTML=`<div class="vx-chatbeta"><div class="vx-chatbeta-card"><h3>Falha ao carregar Conversas</h3><p class="vx-chatbeta-sub">${E(e.message||'Erro desconhecido.')}</p><button id="conversasBackErr">← Voltar</button></div></div>`;
      document.getElementById('conversasBackErr').onclick=renderHome;
    }
  }

  function renderConversasScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    const rows=conversasCache.list;
    app.innerHTML=`<div class="vx-chatbeta vx-chatbeta-wide">
      <div class="vx-chatbeta-head">
        <div><button id="conversasBack">← Voltar</button><h2>Conversas (teste)</h2><small>Mensagens reais recebidas/enviadas pela conexão de teste</small></div>
      </div>
      <div class="vx-conn-summary-list">
        ${rows.length?rows.map(c=>`<div class="vx-conn-summary-row vx-conv-row" data-conv="${E(c.id)}" style="cursor:pointer">
          <div><b>${E(c.customer_name||c.customer_phone||'Contato WhatsApp')}</b><br><span class="vx-chatbeta-sub">${E(c.last_message_preview||'Sem mensagens ainda')}</span></div>
          <span class="vx-conn-badge vx-conn-badge-neutral">${E(c.status)}</span>
        </div>`).join(''):'<p class="vx-chatbeta-sub">Nenhuma conversa ainda — envie uma mensagem para o número da conexão de teste a partir de outro celular.</p>'}
      </div>
    </div>`;
    document.getElementById('conversasBack').onclick=()=>{stopConversaPoll();renderHome()};
    document.querySelectorAll('[data-conv]').forEach(el=>el.onclick=()=>openConversaDetail(el.dataset.conv));
  }

  async function loadMensagens(conversationId){
    return api(`chat_messages?conversation_id=eq.${conversationId}&select=id,direction,body,status,created_at,deleted_at,origin&order=created_at.asc`).catch(()=>[]);
  }

  // Ticks só fazem sentido pra mensagem enviada por nós (OUTBOUND) --
  // mesma escada de status.MENSAGENS_STATUS_CHECK: AGUARDANDO_ENVIO ->
  // ENVIADA -> ENTREGUE -> LIDA, ou FALHOU.
  function mensagemTick(m){
    if(m.direction!=='OUTBOUND')return'';
    if(m.status==='AGUARDANDO_ENVIO')return'<span class="vx-msg-tick">🕐</span>';
    if(m.status==='ENVIADA')return'<span class="vx-msg-tick">✓</span>';
    if(m.status==='ENTREGUE')return'<span class="vx-msg-tick">✓✓</span>';
    if(m.status==='LIDA')return'<span class="vx-msg-tick vx-msg-tick-read">✓✓</span>';
    if(m.status==='FALHOU')return'<span class="vx-msg-tick" title="Falha no envio">⚠</span>';
    return'';
  }

  function mensagemRow(m){
    const hora=new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const lado=m.direction==='OUTBOUND'?'vx-msg-out':'vx-msg-in';
    const isDeleted=!!m.deleted_at;
    const isImport=m.origin==='IMPORT';
    const deletedLabel=isDeleted?'<span class="vx-msg-deleted-label">🗑 Apagada no WhatsApp — mantida aqui como registro</span>':'';
    const importTag=isImport?'<span class="vx-msg-tag vx-msg-tag-import">Histórico</span>':'';
    return `<div class="vx-msg-row ${lado}${isDeleted?' vx-msg-deleted':''}"><div class="vx-msg-bubble">${deletedLabel}<span>${E(m.body||'[sem texto]')}</span><div class="vx-msg-meta">${importTag}<small>${E(hora)}</small>${mensagemTick(m)}</div></div></div>`;
  }

  async function openConversaDetail(conversationId){
    conversaAtualId=conversationId;
    const conv=conversasCache.list.find(c=>String(c.id)===String(conversationId));
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML=`<div class="vx-chatbeta vx-chatbeta-wide">
      <div class="vx-chatbeta-head">
        <div><button id="conversaBack">← Voltar</button><h2>${E(conv?.customer_name||conv?.customer_phone||'Contato WhatsApp')}</h2><small>${E(conv?.customer_phone||'Telefone ainda não identificado')}</small></div>
      </div>
      <div id="vxMsgList" class="vx-msg-list"><div class="vx-chatbeta-loading">Carregando mensagens…</div></div>
      <form id="vxMsgForm" class="vx-conn-new-form">
        <input name="body" placeholder="Escrever mensagem…" required maxlength="4000">
        <button type="submit" class="primary">Enviar</button>
      </form>
    </div>`;
    document.getElementById('conversaBack').onclick=()=>{stopConversaPoll();openConversasScreen()};
    document.getElementById('vxMsgForm').onsubmit=handleSendMensagem;
    await refreshMensagens();
    stopConversaPoll();
    conversaPollTimer=setInterval(refreshMensagens,3000);
  }

  async function refreshMensagens(){
    if(!conversaAtualId)return;
    const list=document.getElementById('vxMsgList');
    if(!list)return stopConversaPoll();
    const msgs=await loadMensagens(conversaAtualId);
    list.innerHTML=msgs.length?msgs.map(mensagemRow).join(''):'<p class="vx-chatbeta-sub">Nenhuma mensagem ainda.</p>';
    list.scrollTop=list.scrollHeight;
  }

  async function handleSendMensagem(e){
    e.preventDefault();
    const f=new FormData(e.target);
    const body=String(f.get('body')||'').trim();
    if(!body||!conversaAtualId)return;
    const btn=e.target.querySelector('button[type=submit]');
    const input=e.target.querySelector('input[name=body]');
    btn.disabled=true;
    try{
      const res=await fetch(CFG.url+'/functions/v1/chat-send-message',{
        method:'POST',headers:authHeaders(),
        body:JSON.stringify({conversationId:conversaAtualId,body}),
      });
      const data=await res.json().catch(()=>null);
      if(!res.ok||!data?.ok)throw new Error(data?.message||data?.error||'Falha ao enviar.');
      input.value='';
      await refreshMensagens();
    }catch(err){
      toast?.('Não foi possível enviar: '+err.message,'err');
    }finally{
      btn.disabled=false;
    }
  }
})();
