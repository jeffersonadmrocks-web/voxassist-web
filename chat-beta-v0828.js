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
    // Achado real (Fase 1 da correção visual, 2026-09-01): o clique
    // aqui ia pra uma tela intermediária ("Chat — Beta", com cards de
    // Horário/Configurações/Conversas/Importação) antes da Central de
    // Conversas de verdade -- o protótipo aprovado (central-conversas-
    // mockup.html) entra direto no board de 3 colunas. Configurações →
    // Conexões e Importação continuam alcançáveis de dentro do board
    // (engrenagem no cabeçalho), só não são mais a primeira tela.
    btn.onclick=()=>{
      document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active'));
      document.querySelector('[data-chat-beta-entry]')?.classList.add('active');
      openConversasScreen();
    };
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
  let cache={connections:[],stores:[],attendants:[],tags:[],quickReplies:[]};

  /* ---------- Respostas rápidas (Fase 4) ----------
     Templates reutilizáveis de mensagem, por empresa -- mesmo padrão
     de catálogo de chat_tags (Fase 2): popover no composer,
     criar/excluir direto dali. */
  let quickReplyPopoverOpen=false;

  async function loadQuickReplies(){
    cache.quickReplies=await api('chat_quick_reply_templates?select=*&order=created_at.desc').catch(()=>[]);
  }

  /* ---------- Tags (Fase 2) ----------
     Catálogo por empresa (chat_tags) + atribuição por conversa
     (chat_conversation_tags) -- ver migration chat_tags. Uma conversa
     guarda só os ids das tags atribuídas; rótulo/cor vêm sempre do
     catálogo (cache.tags), nunca duplicados na conversa. */
  const TAG_SWATCH_COLORS=['#8a5cc9','#1f8a5f','#c9483d','#b8860b','#2f6bab','#1f7a8c','#a34a9b','#5c6773'];
  let selectedTagSwatch=TAG_SWATCH_COLORS[0];
  let tagPopoverOpenFor=null;

  /* ---------- Nota interna (Fase 3) ----------
     Mensagem visível só pra equipe, NUNCA enviada ao WhatsApp -- grava
     direto em chat_messages (origin='INTERNAL') via REST, nunca
     passando por chat-send-message (a única function que despacha pro
     gateway). Reseta ao trocar de conversa, igual ao protótipo. */
  let internalNoteMode=false;

  /* ---------- Resposta com citação (Fase 5) ----------
     Guarda a mensagem que o atendente escolheu "responder" (banner
     acima do composer, cancelável) -- metadado do VoxAssist, ver
     comentário da migration da Fase 5 sobre o gateway não ter suporte
     confirmado a citação nativa do WhatsApp. Reseta ao trocar de
     conversa e ao enviar. */
  let replyingTo=null;

  /* ---------- Anexos (Fase 6) -- LADO SEGURO apenas ----------
     Upload real pro bucket privado `chat-media` (migration
     20260901320000), mesmo padrão comprovado de system3-legacy.js
     (fetch autenticado direto na Storage REST API, nunca
     supabase-js .storage.from(), nunca URL pública). O anexo fica
     salvo no VoxAssist e visível no histórico (status
     AGUARDANDO_ENVIO, nunca avança) -- o envio real ao WhatsApp
     depende do contrato de mídia do gateway externo
     (voxassist-whatsapp-gateway, Railway), que não existe documentado
     em lugar nenhum deste repositório (investigado antes de escrever
     este código). Isto é uma pendência EXPLÍCITA, nunca fingida como
     concluída -- toda mensagem com anexo mostra um aviso visível de
     "pendente de envio". Limites espelham os limites reais e públicos
     da plataforma WhatsApp Business (não inventados) e são reforçados
     também no banco (trigger da mesma migration). */
  const MEDIA_LIMITS={IMAGE:5*1024*1024,AUDIO:16*1024*1024,VIDEO:16*1024*1024,DOCUMENT:100*1024*1024};
  function mediaTypeForMime(mime){
    if(/^image\//.test(mime||''))return'IMAGE';
    if(/^audio\//.test(mime||''))return'AUDIO';
    if(/^video\//.test(mime||''))return'VIDEO';
    if(mime==='application/pdf')return'DOCUMENT';
    return null;
  }
  let attachmentUploading=false;
  const mediaBlobCache=new Map();
  async function uploadChatMedia(file,path){
    const r=await fetch(`${CFG.url}/storage/v1/object/chat-media/${encodeURIComponent(path).replace(/%2F/g,'/')}`,{
      method:'POST',
      headers:{apikey:CFG.key,Authorization:'Bearer '+state.session.access_token,'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},
      body:file,
    });
    if(!r.ok)throw new Error(await r.text());
    return r.json();
  }
  async function downloadChatMediaBlobUrl(path){
    if(mediaBlobCache.has(path))return mediaBlobCache.get(path);
    const r=await fetch(`${CFG.url}/storage/v1/object/chat-media/${encodeURIComponent(path).replace(/%2F/g,'/')}`,{
      headers:{apikey:CFG.key,Authorization:'Bearer '+state.session.access_token},
    });
    if(!r.ok)throw new Error(await r.text());
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    mediaBlobCache.set(path,url);
    return url;
  }
  function updateAttachButtonsState(){
    document.getElementById('vxAttachBtn')?.toggleAttribute('disabled',attachmentUploading);
    document.getElementById('vxAttachCameraBtn')?.toggleAttribute('disabled',attachmentUploading);
  }
  async function handleAttachmentPick(file){
    // attachmentUploading trava novo envio enquanto o anterior não
    // termina -- proteção contra duplicidade por duplo clique/duplo
    // disparo do input, pedida explicitamente pelo usuário.
    if(!file||!conversaAtualId||attachmentUploading)return;
    const mediaType=mediaTypeForMime(file.type);
    if(!mediaType){toast?.('Tipo de arquivo não suportado -- envie imagem, PDF, áudio ou vídeo.','err');return}
    const limit=MEDIA_LIMITS[mediaType];
    if(file.size>limit){toast?.(`Arquivo muito grande -- limite de ${Math.round(limit/1024/1024)}MB pra este tipo.`,'err');return}
    if(file.size<=0){toast?.('Arquivo vazio ou inválido.','err');return}
    // Captura a conversa ALVO antes do upload assíncrono -- se o
    // atendente trocar de conversa enquanto o upload está em
    // andamento, o anexo tem que continuar indo pra conversa que
    // estava selecionada quando ele clicou, nunca pra que estiver
    // selecionada quando o upload terminar.
    const targetConversationId=conversaAtualId;
    attachmentUploading=true;
    updateAttachButtonsState();
    try{
      const companyId=state.profile.active_company_id;
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${companyId}/${targetConversationId}/${Date.now()}-${safeName}`;
      await uploadChatMedia(file,path);
      await api('chat_messages',{method:'POST',body:JSON.stringify({
        company_id:companyId,conversation_id:targetConversationId,direction:'OUTBOUND',origin:'REALTIME',
        message_type:mediaType,status:'AGUARDANDO_ENVIO',sender_user_id:myUserId(),
        media_status:'DISPONIVEL',media_storage_path:path,media_mime_type:file.type,media_size_bytes:file.size,
      })});
      toast?.('Anexo salvo no VoxAssist -- envio ao WhatsApp ainda pendente (ver aviso na mensagem).');
      if(String(conversaAtualId)===String(targetConversationId))await refreshMensagens();
    }catch(err){
      toast?.('Não foi possível enviar o anexo: '+err.message,'err');
    }finally{
      attachmentUploading=false;
      updateAttachButtonsState();
    }
  }
  function mediaBodyHtml(m){
    const filename=(m.media_storage_path||'').split('/').pop()||'arquivo';
    const sizeLabel=m.media_size_bytes?`${Math.round(m.media_size_bytes/1024)} KB`:'';
    if(m.message_type==='IMAGE')return `<div class="vx-msg-media vx-msg-media-image" data-media-path="${E(m.media_storage_path)}"><img alt="Imagem anexada"><span class="vx-msg-media-fallback">🖼 Carregando imagem…</span></div>`;
    if(m.message_type==='AUDIO')return `<div class="vx-msg-media vx-msg-media-audio" data-media-path="${E(m.media_storage_path)}"><audio controls></audio></div>`;
    if(m.message_type==='VIDEO')return `<div class="vx-msg-media vx-msg-media-video" data-media-path="${E(m.media_storage_path)}"><video controls></video></div>`;
    if(m.message_type==='DOCUMENT')return `<button type="button" class="vx-msg-media-doc" data-media-path="${E(m.media_storage_path)}" data-media-name="${E(filename)}">📄 ${E(filename)} <small>${E(sizeLabel)}</small></button>`;
    return'';
  }
  function mediaPendingNoteHtml(m){
    if(m.message_type&&m.message_type!=='TEXT'&&m.status==='AGUARDANDO_ENVIO'&&m.media_status==='DISPONIVEL'){
      return '<div class="vx-msg-media-pending">⏳ Anexo salvo no VoxAssist — envio ao WhatsApp pendente (integração de mídia com o gateway ainda não confirmada)</div>';
    }
    return'';
  }
  function wireMediaElements(container){
    container.querySelectorAll('.vx-msg-media-image, .vx-msg-media-audio, .vx-msg-media-video').forEach(el=>{
      const path=el.dataset.mediaPath;
      if(!path)return;
      downloadChatMediaBlobUrl(path).then(url=>{
        if(el.classList.contains('vx-msg-media-image')){const img=el.querySelector('img');if(img)img.src=url;el.querySelector('.vx-msg-media-fallback')?.remove()}
        else if(el.classList.contains('vx-msg-media-audio')){const a=el.querySelector('audio');if(a)a.src=url}
        else if(el.classList.contains('vx-msg-media-video')){const v=el.querySelector('video');if(v)v.src=url}
      }).catch(()=>{el.innerHTML='<span class="vx-msg-media-error">Falha ao carregar anexo</span>'});
    });
    container.querySelectorAll('.vx-msg-media-doc').forEach(btn=>{
      btn.onclick=async()=>{
        const path=btn.dataset.mediaPath;
        try{
          const url=await downloadChatMediaBlobUrl(path);
          const a=document.createElement('a');a.href=url;a.download=btn.dataset.mediaName||'arquivo';document.body.appendChild(a);a.click();a.remove();
        }catch(err){toast?.('Não foi possível baixar o anexo: '+err.message,'err')}
      };
    });
  }

  async function loadTags(){
    cache.tags=await api('chat_tags?select=*&order=label').catch(()=>[]);
  }

  function hexToRgba(hex,alpha){
    const h=String(hex||'').replace('#','');
    const r=parseInt(h.substring(0,2),16)||0,g=parseInt(h.substring(2,4),16)||0,b=parseInt(h.substring(4,6),16)||0;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function tagPill(t,removable){
    return `<span class="vx-cc-tag-pill" style="background:${hexToRgba(t.color,.14)};color:${E(t.color)};border-color:${hexToRgba(t.color,.4)}">${E(t.label)}${removable?`<button type="button" class="vx-cc-tag-remove" data-tag-remove="${E(t.id)}" aria-label="Remover tag ${E(t.label)}">×</button>`:''}</span>`;
  }

  function convTagIds(c){
    return (c.chat_conversation_tags||[]).map(x=>String(x.tag_id));
  }

  function convTagsHtml(c){
    const ids=convTagIds(c);
    const tags=ids.map(id=>cache.tags.find(t=>String(t.id)===id)).filter(Boolean);
    if(!tags.length)return'';
    const shown=tags.slice(0,2), rest=tags.length-shown.length;
    return `<div class="vx-cc-conv-tags">${shown.map(t=>tagPill(t,false)).join('')}${rest>0?`<span class="vx-cc-tag-more">+${rest}</span>`:''}</div>`;
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
      document.getElementById('conexoesBackErr').onclick=openConversasScreen;
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
    document.getElementById('conexoesBack').onclick=openConversasScreen;
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
        document.getElementById('importBackErr').onclick=openConversasScreen;
        return;
      }
      if(connections.length===1){ await openImportScreen(connections[0].id); return; }
      app.innerHTML=`<div class="vx-chatbeta">
        <div class="vx-chatbeta-head"><div><button id="importPickBack">← Voltar</button><h2>Importação de histórico</h2><small>Escolha a conexão</small></div></div>
        <div class="vx-conn-summary-list">${connections.map(c=>`<div class="vx-conn-summary-row vx-conv-row" data-pick="${E(c.id)}" style="cursor:pointer"><b>${E(c.name)}</b><span>→</span></div>`).join('')}</div>
      </div>`;
      document.getElementById('importPickBack').onclick=openConversasScreen;
      document.querySelectorAll('[data-pick]').forEach(el=>el.onclick=()=>openImportScreen(el.dataset.pick));
    }catch(e){
      app.innerHTML=`<div class="vx-chatbeta"><div class="vx-chatbeta-card"><h3>Falha ao carregar conexões</h3><p class="vx-chatbeta-sub">${E(e.message||'Erro desconhecido.')}</p><button id="importBackErr2">← Voltar</button></div></div>`;
      document.getElementById('importBackErr2').onclick=openConversasScreen;
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

  /* ---------- Central de Conversas ----------
     Consolidação Geral (2026-09-01): layout de 3 colunas já aprovado no
     protótipo congelado (Conversas / Chat / Contexto VoxAssist), com
     busca, filtros (Todas/Minhas/Não atribuídas/Não lidas) e Nova
     Conversa permitindo número ainda não cadastrado. Usa só colunas que
     já existem no schema real (assigned_user_id/client_id/
     current_store_id/service_order_id/unread_count) -- nenhum dado
     fictício, nenhuma coluna nova. Preserva 100% do que já era real:
     QR/conexão/sessão, envio/recebimento, tratamento LID/remote_jid,
     mensagens reais, ausência automática. Nunca mostra remote_jid/
     sender_lid como se fosse telefone -- só customer_phone. */
  const CONV_SELECT='id,customer_phone,customer_name,status,last_message_preview,last_message_at,unread_count,assigned_user_id,client_id,current_store_id,connection_id,service_order_id,next_callback_at,next_callback_reason,remote_jid,sender_lid,profiles!chat_conversations_assigned_user_id_fkey(full_name),clients!chat_conversations_client_id_fkey(name),stores!chat_conversations_store_id_fkey(name),chat_conversation_tags(tag_id)';
  let hubState={list:[],filter:'TODAS',search:'',storeFilter:'',connectionFilter:'',selectedId:null,currentTransferHistory:[],activeTab:'CENTRAL'};
  let conversaAtualId=null;
  let conversaPollTimer=null;
  let listPollTimer=null;
  let threadSearchQuery='';
  function stopConversaPoll(){if(conversaPollTimer){clearInterval(conversaPollTimer);conversaPollTimer=null}}
  function stopListPoll(){if(listPollTimer){clearInterval(listPollTimer);listPollTimer=null}}
  function myUserId(){return state?.session?.user?.id||null}

  async function loadConversasHubData(){
    hubState.list=await api(`chat_conversations?select=${CONV_SELECT}&order=last_message_at.desc.nullslast`).catch(()=>[]);
  }
  async function loadAttendants(){
    cache.attendants=await api('profiles?select=id,full_name,role&active=eq.true&role=in.(GESTOR,ATENDENTE)&order=full_name').catch(()=>[]);
  }

  async function openConversasScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    stopConversaPoll();stopListPoll();
    hubState.selectedId=null;
    hubState.activeTab='CENTRAL';
    app.innerHTML='<div class="vx-chatbeta"><div class="vx-chatbeta-loading">Carregando Central de Conversas…</div></div>';
    try{
      await Promise.all([loadConversasHubData(),loadConexoesData(),loadAttendants(),loadTags(),loadQuickReplies()]);
      renderConversasHub();
      stopListPoll();
      listPollTimer=setInterval(async()=>{await loadConversasHubData();renderConvList()},8000);
    }catch(e){
      app.innerHTML=`<div class="vx-chatbeta"><div class="vx-chatbeta-card"><h3>Falha ao carregar Conversas</h3><p class="vx-chatbeta-sub">${E(e.message||'Erro desconhecido.')}</p><button id="conversasBackErr">← Voltar</button></div></div>`;
      document.getElementById('conversasBackErr').onclick=openConversasScreen;
    }
  }

  /* ---------- linguagem visual alinhada ao protótipo aprovado
     (central-conversas-mockup.html) -- Fase 1 da correção visual,
     2026-09-01: só camada visual, nenhuma tabela nova, nenhuma lógica
     de negócio alterada. Recursos que o protótipo mostra mas que
     exigem schema novo (tags, nota interna, respostas rápidas,
     resposta com citação, anexos, Robô de Atendimento, Monitor de
     Atividades) ficam para as próximas fases -- não fingidos aqui. */
  function initials(name){
    const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length)return '?';
    return (parts[0][0]+(parts[1]?.[0]||'')).toUpperCase();
  }
  // Achado do usuário em 2026-09-02 (mockup aprovado): faltavam os
  // chips "Tempo excedido" e "Retornos de hoje". "Sem resposta" fica de
  // fora por ser hoje idêntico a "Não lidas" (unread_count>0 só
  // acontece quando o cliente escreveu e ninguém respondeu ainda --
  // ver waitingText abaixo) -- duplicar o chip com nome diferente
  // criaria dois filtros iguais, não reportado sem confirmação.
  const CONV_FILTER_CHIPS=[['TODAS','Todas'],['MINHAS','Minhas'],['NAO_ATRIBUIDAS','Não atribuídas'],['NAO_LIDAS','Não lidas'],['TEMPO_EXCEDIDO','Tempo excedido'],['RETORNOS_HOJE','Retornos de hoje']];
  // Limiar padrão de "tempo excedido" -- ainda não configurável por
  // empresa (isso é a Fase 6/Monitor de atividades); até lá, mesmo
  // valor fixo aqui e lá, pra nunca ter dois números diferentes pro
  // mesmo conceito.
  const SLA_WAIT_LIMIT_MIN=30;
  const CONV_STATUS_LABEL={
    ABERTA:{text:'Aberta',cls:'ok'},
    EM_ATENDIMENTO:{text:'Em atendimento',cls:'info'},
    AGUARDANDO_CLIENTE:{text:'Aguardando cliente',cls:'warn'},
    FINALIZADA:{text:'Encerrada',cls:'err'},
    ARQUIVADA:{text:'Arquivada',cls:'neutral'},
  };

  function filteredConvList(){
    const me=myUserId();
    let rows=hubState.list;
    if(hubState.filter==='MINHAS')rows=rows.filter(c=>String(c.assigned_user_id||'')===String(me));
    else if(hubState.filter==='NAO_ATRIBUIDAS')rows=rows.filter(c=>!c.assigned_user_id);
    else if(hubState.filter==='NAO_LIDAS')rows=rows.filter(c=>Number(c.unread_count||0)>0);
    else if(hubState.filter==='TEMPO_EXCEDIDO')rows=rows.filter(c=>{
      if(!(Number(c.unread_count||0)>0)||!c.last_message_at)return false;
      return Math.floor((Date.now()-new Date(c.last_message_at).getTime())/60000)>=SLA_WAIT_LIMIT_MIN;
    });
    else if(hubState.filter==='RETORNOS_HOJE')rows=rows.filter(c=>{
      if(!c.next_callback_at)return false;
      const d=new Date(c.next_callback_at),now=new Date();
      return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate();
    });
    if(hubState.storeFilter)rows=rows.filter(c=>String(c.current_store_id||'')===hubState.storeFilter);
    if(hubState.connectionFilter)rows=rows.filter(c=>String(c.connection_id||'')===hubState.connectionFilter);
    const q=hubState.search.trim().toLowerCase();
    if(q)rows=rows.filter(c=>(c.customer_name||'').toLowerCase().includes(q)||(c.customer_phone||'').toLowerCase().includes(q)||(c.clients?.name||'').toLowerCase().includes(q));
    return rows;
  }

  // "Aguardando há X" -- só quando unread_count>0 (cliente escreveu e
  // ninguém respondeu ainda; ver correção real em chat-inbound-webhook/
  // chat-send-message). Tempo calculado a partir de last_message_at,
  // dado já real -- nenhuma coluna nova.
  function waitingText(c){
    if(!(Number(c.unread_count||0)>0)||!c.last_message_at)return'';
    const mins=Math.max(0,Math.floor((Date.now()-new Date(c.last_message_at).getTime())/60000));
    if(mins<60)return `Cliente aguardando há ${mins} min`;
    const h=Math.floor(mins/60),m=mins%60;
    if(h<24)return `Cliente aguardando há ${h}h${m?m+'min':''}`;
    return `Cliente aguardando há ${Math.floor(h/24)}d`;
  }

  function convRow(c){
    const name=c.customer_name||c.clients?.name;
    const matched=!!name;
    const hora=c.last_message_at?new Date(c.last_message_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
    const unread=Number(c.unread_count||0);
    const st=CONV_STATUS_LABEL[c.status]||{text:c.status,cls:'neutral'};
    const assignedName=c.profiles?.full_name||null;
    const wt=waitingText(c);
    return `<li class="vx-cc-row ${String(c.id)===String(hubState.selectedId)?'active':''}" data-conv="${E(c.id)}">
      <div class="vx-cc-avatar ${matched?'':'unmatched'}">${matched?E(initials(name)):'?'}</div>
      <div class="vx-cc-main">
        <div class="vx-cc-line1"><span class="vx-cc-name ${matched?'':'unmatched'}">${matched?E(name):'Contato WhatsApp'}</span><span class="vx-cc-time">${E(hora)}</span></div>
        <div class="vx-cc-preview"><span class="vx-cc-prev-text">${E(c.last_message_preview||'Sem mensagens ainda')}</span>${unread?`<span class="vx-cc-unread">${unread}</span>`:''}</div>
        <div class="vx-cc-meta ${assignedName?'':'unassigned'}">${E(c.stores?.name||'—')} · ${E(assignedName||'Não atribuída')}</div>
        <div class="vx-cc-status-row"><span class="vx-cc-pill ${st.cls}">${E(st.text)}</span></div>
        ${wt?`<div class="vx-cc-waiting">${E(wt)}</div>`:''}
        ${convTagsHtml(c)}
      </div>
    </li>`;
  }

  // Achado do usuário em 2026-09-02 (mockup aprovado): a busca da lista
  // era só um filtro simples da lista já visível -- sem dropdown
  // agrupado nem detecção de telefone novo digitado. Regra de telefone
  // válido replicada de normalizePhone em
  // supabase/functions/_shared/messagingService.ts:12-18 -- mesmo
  // critério do backend, não um regex novo inventado aqui.
  function normalizePhoneLocal(raw){
    const digits=String(raw||'').replace(/\D/g,'');
    if(!digits)return null;
    const withoutCountryCode=digits.startsWith('55')&&digits.length>11?digits.slice(2):digits;
    if(!/^[1-9]{2}9?\d{8}$/.test(withoutCountryCode))return null;
    return withoutCountryCode;
  }
  function isPhoneCandidate(raw){return !!normalizePhoneLocal(raw)}
  let searchDropdownWired=false;
  function ensureSearchDropdownOutsideClickHandler(){
    if(searchDropdownWired)return;
    searchDropdownWired=true;
    document.addEventListener('click',e=>{
      const box=document.getElementById('chatSearchResults');
      if(box&&!box.hidden&&!e.target.closest('.vx-cc-search'))box.hidden=true;
    });
  }
  function renderSearchDropdown(){
    const box=document.getElementById('chatSearchResults');
    if(!box)return;
    const q=hubState.search.trim();
    if(!q){box.hidden=true;box.innerHTML='';return}
    const ql=q.toLowerCase();
    const matches=hubState.list.filter(c=>(c.customer_name||'').toLowerCase().includes(ql)||(c.customer_phone||'').toLowerCase().includes(ql)||(c.clients?.name||'').toLowerCase().includes(ql)).slice(0,6);
    const phone=normalizePhoneLocal(q);
    let html='';
    if(matches.length)html+=`<div class="vx-cc-sr-group">Conversas</div>`+matches.map(c=>{
      const name=c.customer_name||c.clients?.name||'Contato WhatsApp';
      return `<div class="vx-cc-sr-row" data-sr-conv="${E(c.id)}"><div class="vx-cc-sr-avatar">${E(initials(name))}</div><div><div class="vx-cc-sr-name">${E(name)}</div><div class="vx-cc-sr-sub">${E(c.customer_phone||'')}</div></div></div>`;
    }).join('');
    if(phone)html+=`<div class="vx-cc-sr-newphone" data-sr-newphone="${E(phone)}"><div class="vx-cc-sr-newphone-icon">+</div><div><div class="vx-cc-sr-newphone-title">Iniciar nova conversa</div><div class="vx-cc-sr-newphone-sub">${E(phone)}</div></div></div>`;
    if(!html)html='<div class="vx-cc-sr-empty">Nenhuma conversa encontrada.</div>';
    box.innerHTML=html;
    box.hidden=false;
    box.querySelectorAll('[data-sr-conv]').forEach(el=>el.onclick=()=>{box.hidden=true;selectConversa(el.dataset.srConv)});
    box.querySelectorAll('[data-sr-newphone]').forEach(el=>el.onclick=()=>{box.hidden=true;openNovaConversaModal(el.dataset.srNewphone)});
  }

  function renderConvList(){
    const list=document.getElementById('chatConvList');
    if(!list)return;
    const rows=filteredConvList();
    list.innerHTML=rows.length?rows.map(convRow).join(''):'<div class="vx-cc-empty-list">Nenhuma conversa neste filtro.</div>';
    list.querySelectorAll('[data-conv]').forEach(el=>el.onclick=()=>selectConversa(el.dataset.conv));
  }

  /* ---------- abas Central de Conversas / Robô de Atendimento ----------
     Achado do usuário em 2026-09-02 (comparação com o mockup aprovado,
     artifact 42ebf5fb): o botão do robô navegava pra uma tela totalmente
     separada, parecendo "outro sistema". chat-bot-config-v1.js continua
     substituindo #app inteiro (nenhuma das duas telas renderiza dentro
     de sub-container) -- não dá pra manter o quadro de 3 painéis
     escondido atrás sem reescrever as duas telas. O que dá pra entregar
     sem esse risco: a MESMA barra de abas, clicável nos dois estados,
     injetada no topo do #app depois de cada render -- parece uma aba,
     navega como aba, sem duplicar lógica de roteamento nenhuma. */
  function chatTabBar(active){
    if(!isGestor())return'';
    return `<div class="vx-cc-tabbar">
      <button type="button" class="vx-cc-tab ${active==='CENTRAL'?'active':''}" data-chat-tab="CENTRAL">Central de Conversas</button>
      <button type="button" class="vx-cc-tab ${active==='ROBO'?'active':''}" data-chat-tab="ROBO">🤖 Robô de Atendimento</button>
    </div>`;
  }
  function wireChatTabBar(){
    document.querySelectorAll('[data-chat-tab]').forEach(b=>b.onclick=()=>{
      if(b.dataset.chatTab==='CENTRAL')switchToCentralTab();
      else if(b.dataset.chatTab==='ROBO')switchToRoboTab();
    });
  }
  async function switchToRoboTab(){
    if(hubState.activeTab==='ROBO')return;
    stopConversaPoll();stopListPoll();
    hubState.activeTab='ROBO';
    const app=document.querySelector('#app');
    if(app)app.innerHTML='<div class="vx-chatbeta"><div class="vx-chatbeta-loading">Carregando Robô de Atendimento…</div></div>';
    if(typeof window.renderChatBotConfig==='function')await window.renderChatBotConfig();
    document.querySelector('#app')?.insertAdjacentHTML('afterbegin',chatTabBar('ROBO'));
    wireChatTabBar();
  }
  function switchToCentralTab(){
    if(hubState.activeTab==='CENTRAL')return;
    hubState.activeTab='CENTRAL';
    renderConversasHub();
    stopListPoll();
    listPollTimer=setInterval(async()=>{await loadConversasHubData();renderConvList()},8000);
  }

  function renderConversasHub(){
    const app=document.querySelector('#app');
    if(!app)return;
    hubState.activeTab='CENTRAL';
    app.innerHTML=`<div class="vx-cc-wrap">
      ${chatTabBar('CENTRAL')}
      <div class="vx-cc-top">
        <button id="chatHubBack" class="vx-cc-back">← Voltar</button>
        <div class="vx-cc-title-block"><h1>Central de Conversas</h1><p>Chat VoxAssist · desktop, 3 colunas</p></div>
        ${businessHoursBadge()}
        ${isGestor()?'<button id="chatHubMonitor" class="vx-cc-settings-btn" type="button" title="Monitor de atividades -- visão do gestor sobre a operação">📊 Monitor</button><button id="chatHubUsers" class="vx-cc-settings-btn" type="button" title="Usuários -- WhatsApp interno">👤 Usuários</button>':''}
        <button id="chatHubSettings" class="vx-cc-settings-btn" type="button" title="Configurações → Conexões (adicionar, remover, reconectar números)">⚙ Configurações</button>
      </div>
      <div class="vx-cc-board">
        <section class="vx-cc-pane vx-cc-pane-list">
          <div class="vx-cc-pane-head">
            <div class="vx-cc-pane-head-row"><h2>Conversas</h2><button class="vx-cc-new-btn" id="chatNewConv" type="button">+ Nova</button></div>
            <div class="vx-cc-search"><input id="chatSearch" placeholder="Buscar por nome ou telefone…" value="${E(hubState.search)}" autocomplete="off"><div class="vx-cc-search-results" id="chatSearchResults" hidden></div></div>
            <div class="vx-cc-filter-chips">
              ${CONV_FILTER_CHIPS.map(([k,l])=>`<button type="button" class="vx-cc-chip ${hubState.filter===k?'active':''}" data-filter="${k}">${l}</button>`).join('')}
            </div>
            <div class="vx-cc-filter-selects">
              <select id="chatStoreFilter"><option value="">Todas as lojas</option>${cache.stores.map(s=>`<option value="${E(s.id)}" ${hubState.storeFilter===String(s.id)?'selected':''}>${E(s.name)}</option>`).join('')}</select>
              <select id="chatConnFilter"><option value="">Todas as conexões</option>${cache.connections.map(c=>`<option value="${E(c.id)}" ${hubState.connectionFilter===String(c.id)?'selected':''}>${E(c.name)}</option>`).join('')}</select>
            </div>
          </div>
          <ul id="chatConvList" class="vx-cc-conv-list"></ul>
        </section>
        <section class="vx-cc-pane vx-cc-pane-thread" id="vxChatMid">
          <div class="vx-cc-thread-empty">Selecione uma conversa à esquerda, ou inicie uma nova.</div>
        </section>
        <aside class="vx-cc-pane vx-cc-pane-ctx">
          <div class="vx-cc-pane-head"><h2>Contexto VoxAssist</h2></div>
          <div class="vx-cc-ctx-body" id="vxChatCtx"><p class="vx-cc-ctx-empty">Selecione uma conversa para ver o contexto.</p></div>
        </aside>
      </div>
    </div>`;
    document.getElementById('chatHubBack').onclick=()=>{stopConversaPoll();stopListPoll();goBack()};
    document.getElementById('chatHubSettings').onclick=()=>{stopConversaPoll();stopListPoll();openConexoesScreen()};
    document.getElementById('chatHubMonitor')?.addEventListener('click',()=>{stopConversaPoll();stopListPoll();if(typeof window.render==='function')window.render('chat-monitor')});
    document.getElementById('chatHubUsers')?.addEventListener('click',()=>{stopConversaPoll();stopListPoll();if(typeof window.render==='function')window.render('chat-internal-whatsapp')});
    wireChatTabBar();
    document.getElementById('chatNewConv').onclick=openNovaConversaModal;
    document.getElementById('chatSearch').oninput=e=>{hubState.search=e.target.value;renderConvList();renderSearchDropdown()};
    document.getElementById('chatSearch').addEventListener('focus',()=>{if(hubState.search.trim())renderSearchDropdown()});
    ensureSearchDropdownOutsideClickHandler();
    document.getElementById('chatStoreFilter').onchange=e=>{hubState.storeFilter=e.target.value;renderConvList()};
    document.getElementById('chatConnFilter').onchange=e=>{hubState.connectionFilter=e.target.value;renderConvList()};
    document.querySelectorAll('.vx-cc-filter-chips [data-filter]').forEach(b=>b.onclick=()=>{
      hubState.filter=b.dataset.filter;
      document.querySelectorAll('.vx-cc-filter-chips [data-filter]').forEach(x=>x.classList.toggle('active',x===b));
      renderConvList();
    });
    renderConvList();
    if(hubState.selectedId)selectConversa(hubState.selectedId,true);
  }

  // Usado pelo Monitor de atividades (runtime/chat-monitor-v1.js) e
  // por qualquer outra tela que precise abrir uma conversa real da
  // Central a partir de fora deste arquivo.
  window.vxOpenChatConversation=id=>{hubState.activeTab='CENTRAL';selectConversa(id)};

  async function selectConversa(id,skipListRerender){
    stopConversaPoll();
    internalNoteMode=false;
    quickReplyPopoverOpen=false;
    replyingTo=null;
    threadSearchQuery='';
    hubState.selectedId=id;
    const conv=hubState.list.find(c=>String(c.id)===String(id));
    // Abrir a conversa marca como lida -- mesma correção real do
    // unread_count (antes nunca era incrementado nem resetado por
    // ninguém). Não espera a resposta do PATCH pra atualizar a UI.
    if(conv&&Number(conv.unread_count||0)>0){
      conv.unread_count=0;
      api(`chat_conversations?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({unread_count:0})}).catch(()=>{});
    }
    if(!skipListRerender)renderConvList();
    const mid=document.getElementById('vxChatMid');
    if(!mid)return;
    const name=conv?.customer_name||conv?.clients?.name;
    const matched=!!name;
    const st=CONV_STATUS_LABEL[conv?.status]||{text:conv?.status||'',cls:'neutral'};
    const isMine=String(conv?.assigned_user_id||'')===String(myUserId());
    const isFinalizada=conv?.status==='FINALIZADA';
    const otherAttendants=cache.attendants.filter(a=>String(a.id)!==String(conv?.assigned_user_id||''));
    mid.innerHTML=`<div class="vx-cc-thread-head">
        <div class="vx-cc-thread-avatar ${matched?'':'unmatched'}">${matched?E(initials(name)):'?'}</div>
        <div class="vx-cc-thread-head-main">
          <div class="vx-cc-thread-title">${matched?E(name):'Contato WhatsApp'} <span class="vx-cc-pill ${st.cls}">${E(st.text)}</span></div>
          <div class="vx-cc-thread-sub">📱 ${E(conv?.customer_phone||'Identificação pendente')} · ${E(conv?.stores?.name||'—')}</div>
        </div>
        <div class="vx-cc-thread-actions">
          ${isMine?'':'<button type="button" class="vx-cc-th-btn vx-cc-th-btn-success" id="vxCtxAssume">Assumir</button>'}
          <div class="vx-cc-transfer-wrap">
            <button type="button" class="vx-cc-th-btn" id="vxCtxTransferBtn">Transferir</button>
            <div class="vx-cc-transfer-pop" id="vxCtxTransferPop" hidden>
              ${otherAttendants.length?otherAttendants.map(a=>`<button type="button" class="vx-cc-transfer-opt" data-transfer-to="${E(a.id)}">${E(a.full_name)}</button>`).join(''):'<div class="vx-cc-transfer-empty">Nenhum outro atendente ativo.</div>'}
            </div>
          </div>
          ${isFinalizada?'<button type="button" class="vx-cc-th-btn" id="vxCtxReopen">Reabrir</button>':'<button type="button" class="vx-cc-th-btn vx-cc-th-btn-danger" id="vxCtxClose">Encerrar</button>'}
          ${isGestor()?`<div class="vx-cc-transfer-wrap"><button type="button" class="vx-cc-th-btn" id="vxCtxLinkUserBtn" ${(conv?.remote_jid||conv?.sender_lid)?'':'disabled title="Esta conversa ainda não tem identidade técnica capturada."'}>🔗 Vincular usuário</button><div class="vx-cc-transfer-pop" id="vxCtxLinkUserPop" hidden>${cache.attendants.length?cache.attendants.map(a=>`<button type="button" class="vx-cc-transfer-opt" data-link-user="${E(a.id)}">${E(a.full_name)}</button>`).join(''):'<div class="vx-cc-transfer-empty">Nenhum usuário ativo.</div>'}</div></div>`:''}
        </div>
      </div>
      <div class="vx-cc-thread-toolbar">
        <div class="vx-cc-tb-search-wrap">
          <button type="button" class="vx-cc-tb-btn" id="vxThreadSearchBtn" title="Buscar nesta conversa">🔍 Buscar na conversa</button>
          <div class="vx-cc-tb-search-box" id="vxThreadSearchBox" hidden><input type="text" id="vxThreadSearchInput" placeholder="Buscar nas mensagens desta conversa…"></div>
        </div>
        <div class="vx-cc-callback-wrap">
          <button type="button" class="vx-cc-tb-btn ${conv?.next_callback_at?'active':''}" id="vxCallbackBtn" title="Agendar retorno para esta conversa">📅 ${conv?.next_callback_at?'Retorno: '+new Date(conv.next_callback_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Agendar retorno'}</button>
          <div class="vx-cc-callback-pop" id="vxCallbackPop" hidden>
            <label>Data e hora<input type="datetime-local" id="vxCallbackWhen" value="${conv?.next_callback_at?E(new Date(new Date(conv.next_callback_at).getTime()-new Date(conv.next_callback_at).getTimezoneOffset()*60000).toISOString().slice(0,16)):''}"></label>
            <label>Motivo<input type="text" id="vxCallbackReason" maxlength="200" value="${E(conv?.next_callback_reason||'')}" placeholder="Ex.: cliente pediu pra ligar depois das 14h"></label>
            <div class="vx-cc-callback-pop-actions">
              <button type="button" id="vxCallbackSave">Agendar</button>
              ${conv?.next_callback_at?'<button type="button" id="vxCallbackClear">Cancelar retorno</button>':''}
            </div>
          </div>
        </div>
      </div>
      <div id="vxMsgList" class="vx-msg-list"><div class="vx-chatbeta-loading">Carregando mensagens…</div></div>
      <div id="vxReplyBanner" class="vx-cc-reply-banner" hidden></div>
      <form id="vxMsgForm" class="vx-cc-composer">
        <button type="button" id="vxNoteToggleBtn" class="vx-cc-note-btn" title="Nota interna" aria-label="Alternar nota interna">📝</button>
        <div class="vx-cc-qr-wrap">
          <button type="button" id="vxQuickReplyBtn" class="vx-cc-note-btn" title="Respostas rápidas" aria-label="Respostas rápidas">💬</button>
          <div class="vx-cc-qr-popover" id="vxQuickReplyPopover" ${quickReplyPopoverOpen?'':'hidden'}></div>
        </div>
        <button type="button" id="vxAttachBtn" class="vx-cc-note-btn" title="Anexar arquivo (imagem, PDF, áudio ou vídeo)" aria-label="Anexar arquivo">📎</button>
        <input type="file" id="vxAttachFileInput" accept="image/*,application/pdf,audio/*,video/mp4" hidden>
        <button type="button" id="vxAttachCameraBtn" class="vx-cc-note-btn" title="Tirar foto" aria-label="Tirar foto">📷</button>
        <input type="file" id="vxAttachCameraInput" accept="image/*" capture="environment" hidden>
        <input name="body" placeholder="Escrever mensagem…" required maxlength="4000">
        <button type="submit" class="vx-cc-send-btn">Enviar</button>
      </form>`;
    document.getElementById('vxMsgForm').onsubmit=handleSendMensagem;
    document.getElementById('vxAttachBtn').onclick=()=>document.getElementById('vxAttachFileInput').click();
    document.getElementById('vxAttachCameraBtn').onclick=()=>document.getElementById('vxAttachCameraInput').click();
    document.getElementById('vxAttachFileInput').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)handleAttachmentPick(f)};
    document.getElementById('vxAttachCameraInput').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)handleAttachmentPick(f)};
    updateAttachButtonsState();
    renderReplyBanner();
    document.getElementById('vxQuickReplyBtn').onclick=e=>{
      e.stopPropagation();
      quickReplyPopoverOpen=!quickReplyPopoverOpen;
      document.getElementById('vxQuickReplyPopover').hidden=!quickReplyPopoverOpen;
      if(quickReplyPopoverOpen)renderQuickReplyPopoverContent();
    };
    document.getElementById('vxNoteToggleBtn').onclick=()=>{
      internalNoteMode=!internalNoteMode;
      const form=document.getElementById('vxMsgForm');
      form.classList.toggle('note-mode',internalNoteMode);
      document.getElementById('vxNoteToggleBtn').classList.toggle('active',internalNoteMode);
      const inputEl=form.querySelector('input[name=body]');
      inputEl.placeholder=internalNoteMode?'Escrever nota interna (não enviada ao cliente)…':'Escrever mensagem…';
    };
    document.getElementById('vxCtxAssume')?.addEventListener('click',()=>assumirConversa(conv.id));
    document.getElementById('vxCtxReopen')?.addEventListener('click',()=>reabrirConversa(conv.id));
    document.getElementById('vxCtxClose')?.addEventListener('click',()=>encerrarConversa(conv.id));
    document.getElementById('vxCtxTransferBtn')?.addEventListener('click',e=>{
      e.stopPropagation();
      const p=document.getElementById('vxCtxTransferPop');
      p.hidden=!p.hidden;
      if(p.hidden)return;
      // Recalcula na hora do clique -- não usa o "otherAttendants" fixo
      // da renderização do cabeçalho, que fica desatualizado quando o
      // responsável muda sem re-render completo do cabeçalho (ex.:
      // auto-atribuição pela 1ª mensagem, ou "Assumir e responder" do
      // conflito de propriedade).
      const currentConv=hubState.list.find(c=>String(c.id)===String(conv.id));
      const fresh=cache.attendants.filter(a=>String(a.id)!==String(currentConv?.assigned_user_id||''));
      p.innerHTML=fresh.length?fresh.map(a=>`<button type="button" class="vx-cc-transfer-opt" data-transfer-to="${E(a.id)}">${E(a.full_name)}</button>`).join(''):'<div class="vx-cc-transfer-empty">Nenhum outro atendente ativo.</div>';
      p.querySelectorAll('[data-transfer-to]').forEach(b=>{b.onclick=()=>transferirConversa(conv.id,b.dataset.transferTo)});
    });
    document.querySelectorAll('[data-transfer-to]').forEach(b=>b.onclick=()=>transferirConversa(conv.id,b.dataset.transferTo));
    document.getElementById('vxThreadSearchBtn').onclick=()=>{
      const box=document.getElementById('vxThreadSearchBox');
      box.hidden=!box.hidden;
      if(!box.hidden)document.getElementById('vxThreadSearchInput').focus();
    };
    document.getElementById('vxThreadSearchInput').oninput=e=>{threadSearchQuery=e.target.value;applyThreadSearchFilter()};
    document.getElementById('vxCallbackBtn').onclick=e=>{e.stopPropagation();const p=document.getElementById('vxCallbackPop');p.hidden=!p.hidden};
    document.getElementById('vxCallbackSave').onclick=()=>{
      const when=document.getElementById('vxCallbackWhen').value;
      const reason=document.getElementById('vxCallbackReason').value.trim();
      if(!when)return toast?.('Escolha a data e hora do retorno.','err');
      scheduleCallback(conv.id,new Date(when).toISOString(),reason);
    };
    document.getElementById('vxCallbackClear')?.addEventListener('click',()=>clearCallback(conv.id));
    document.getElementById('vxCtxLinkUserBtn')?.addEventListener('click',e=>{
      e.stopPropagation();
      const p=document.getElementById('vxCtxLinkUserPop');
      p.hidden=!p.hidden;
    });
    document.querySelectorAll('[data-link-user]').forEach(btn=>btn.onclick=async()=>{
      const target=cache.attendants.find(a=>String(a.id)===String(btn.dataset.linkUser));
      try{
        await api('rpc/link_internal_whatsapp',{method:'POST',body:JSON.stringify({p_user_id:btn.dataset.linkUser,p_raw_jid:conv.sender_lid||conv.remote_jid,p_phone:conv.customer_phone||null})});
        toast?.(`Identidade vinculada a ${target?.full_name||'usuário'}. Ative "Reconhecimento" e "Desviar do robô" na ficha dele(a), em Usuários, pra rotear automaticamente.`);
        document.getElementById('vxCtxLinkUserPop').hidden=true;
      }catch(err){toast?.('Não foi possível vincular: '+err.message,'err')}
    });
    hubState.currentTransferHistory=await api(`chat_conversation_events?conversation_id=eq.${id}&action=eq.TRANSFER&select=*&order=created_at.desc`).catch(()=>[]);
    renderContexto(conv);
    conversaAtualId=id;
    await refreshMensagens();
    stopConversaPoll();
    conversaPollTimer=setInterval(refreshMensagens,3000);
  }

  /* ---------- Contexto VoxAssist ---------- */
  function renderContexto(conv){
    const ctx=document.getElementById('vxChatCtx');
    if(!ctx||!conv)return;
    const clienteNome=conv.clients?.name||null;
    const lojaNome=conv.stores?.name||null;
    const responsavelNome=conv.profiles?.full_name||null;
    const st=CONV_STATUS_LABEL[conv.status]||{text:conv.status,cls:'neutral'};
    const deletedEvents=(hubState.currentMessages||[]).filter(m=>m.deleted_at).map(m=>({time:new Date(m.created_at).toLocaleString('pt-BR'),text:`Mensagem apagada no WhatsApp (${m.direction==='OUTBOUND'?'enviada':'recebida'})`}));
    const clientCard=clienteNome?`<div class="vx-cc-ctx-card"><h3>Cliente</h3><div class="vx-cc-ctx-client-name">${E(clienteNome)}</div><div class="vx-cc-ctx-client-line">📞 ${E(conv.customer_phone||'—')}</div></div>`
      :`<div class="vx-cc-ctx-card"><h3>Cliente</h3><p class="vx-cc-ctx-unmatched-label">Contato não vinculado</p><input id="vxCtxClientSearch" class="vx-cc-ctx-search" placeholder="Buscar cliente por nome ou telefone…"><div id="vxCtxClientResults" class="vx-cc-ctx-client-results"></div></div>`;
    const assignedTagIds=convTagIds(conv);
    const tagsCard=`<div class="vx-cc-ctx-card"><h3>Tags</h3><div class="vx-cc-ctx-tags">
      ${assignedTagIds.map(id=>cache.tags.find(t=>String(t.id)===id)).filter(Boolean).map(t=>tagPill(t,true)).join('')}
      <button type="button" class="vx-cc-tag-add-btn" id="vxCtxTagAddBtn">+ tag</button>
      <div class="vx-cc-tag-popover" id="vxCtxTagPopover" ${String(tagPopoverOpenFor)===String(conv.id)?'':'hidden'}>
        <div class="vx-cc-tag-popover-list" id="vxCtxTagPopoverList"></div>
        <div class="vx-cc-tag-new-row">
          <input type="text" id="vxCtxTagNewLabel" placeholder="Nova tag…" maxlength="24" autocomplete="off">
          <div class="vx-cc-tag-swatches" id="vxCtxTagSwatches"></div>
          <button type="button" id="vxCtxTagCreateBtn">Criar tag</button>
        </div>
      </div>
      </div></div>`;
    const osCard=`<div class="vx-cc-ctx-card"><h3>Ordem de Serviço</h3>${conv.service_order_id?'<button type="button" class="vx-cc-ctx-link-btn" id="vxCtxOpenOs">Abrir OS →</button>':'<p class="vx-cc-ctx-empty-text">Nenhuma OS vinculada.</p>'}</div>`;
    const atendimentoCard=`<div class="vx-cc-ctx-card"><h3>Atendimento</h3>
      <div class="vx-cc-ctx-kv"><span>Status</span><span class="vx-cc-pill ${st.cls}">${E(st.text)}</span></div>
      <div class="vx-cc-ctx-kv"><span>Loja atual</span><span>${E(lojaNome||'—')}</span></div>
      <div class="vx-cc-ctx-kv"><span>Responsável</span><span>${E(responsavelNome||'Não atribuída')}</span></div>
      </div>`;
    const auditCard=deletedEvents.length?`<div class="vx-cc-ctx-card"><h3>Auditoria da conversa</h3>${deletedEvents.map(a=>`<div class="vx-cc-ctx-kv"><span>${E(a.text)}</span><span>${E(a.time)}</span></div>`).join('')}</div>`:'';
    // Histórico de transferências -- quem/de quem/pra quem/quando,
    // regra dada pelo usuário em 2026-09-01. Lido de
    // chat_conversation_events (já existia no schema, nunca era
    // escrito) via hubState.currentTransferHistory, carregado em
    // selectConversa antes de chamar renderContexto.
    const attendantName=id=>id?(cache.attendants.find(a=>String(a.id)===String(id))?.full_name||'—'):'Ninguém';
    const transferHistory=hubState.currentTransferHistory||[];
    const transferCard=transferHistory.length?`<div class="vx-cc-ctx-card"><h3>Histórico de transferências</h3>${transferHistory.map(ev=>`<div class="vx-cc-ctx-kv"><span>${E(attendantName(ev.previous_data?.assigned_user_id))} → ${E(attendantName(ev.new_data?.assigned_user_id))}</span><span>${new Date(ev.created_at).toLocaleString('pt-BR')}</span></div>`).join('')}</div>`:'';
    const actionsCard=`<div class="vx-cc-ctx-card"><h3>Ações</h3><div class="vx-cc-ctx-actions">
      <button type="button" class="vx-cc-ctx-action-btn" id="vxCtxTransferStore">Transferir loja</button>
      </div></div>`;
    ctx.innerHTML=clientCard+tagsCard+osCard+atendimentoCard+transferCard+auditCard+actionsCard;
    document.getElementById('vxCtxOpenOs')?.addEventListener('click',()=>window.render('os:'+conv.service_order_id));
    document.getElementById('vxCtxTransferStore')?.addEventListener('click',()=>openTransferLojaModal(conv.id,conv.current_store_id));
    const searchInput=document.getElementById('vxCtxClientSearch');
    if(searchInput)searchInput.oninput=()=>renderClientResults(conv.id,searchInput.value);
    ctx.querySelectorAll('[data-tag-remove]').forEach(btn=>{
      btn.onclick=()=>toggleConversationTag(conv.id,btn.dataset.tagRemove,false);
    });
    document.getElementById('vxCtxTagAddBtn')?.addEventListener('click',e=>{
      e.stopPropagation();
      tagPopoverOpenFor=(String(tagPopoverOpenFor)===String(conv.id))?null:conv.id;
      renderContexto(conv);
    });
    renderTagPopoverContent(conv);
  }

  /* Conteúdo do popover de tags renderizado à parte (não pelo
     ctx.innerHTML acima) pra poder repintar só a lista/swatches -- ao
     trocar a cor selecionada, por exemplo -- sem fechar o popover nem
     perder o texto já digitado no campo de nova tag. */
  function renderTagPopoverContent(conv){
    const list=document.getElementById('vxCtxTagPopoverList');
    const swatchesEl=document.getElementById('vxCtxTagSwatches');
    if(!list||!swatchesEl)return;
    const assignedIds=convTagIds(conv);
    list.innerHTML=cache.tags.length?cache.tags.map(t=>`
      <div class="vx-cc-tag-popover-item">
        <label><input type="checkbox" data-tag-toggle="${E(t.id)}" ${assignedIds.includes(String(t.id))?'checked':''}><span class="vx-cc-tag-dot" style="background:${E(t.color)}"></span>${E(t.label)}</label>
        <button type="button" class="vx-cc-tag-delete-btn" data-tag-delete="${E(t.id)}" title="Excluir tag" aria-label="Excluir tag ${E(t.label)}">🗑</button>
      </div>`).join(''):'<div class="vx-cc-tag-empty">Nenhuma tag criada ainda.</div>';
    list.querySelectorAll('[data-tag-toggle]').forEach(cb=>{
      cb.onchange=()=>toggleConversationTag(conv.id,cb.dataset.tagToggle,cb.checked);
    });
    list.querySelectorAll('[data-tag-delete]').forEach(btn=>{
      btn.onclick=()=>deleteTagFromCatalog(btn.dataset.tagDelete);
    });
    swatchesEl.innerHTML=TAG_SWATCH_COLORS.map(color=>`<button type="button" class="vx-cc-tag-swatch ${color===selectedTagSwatch?'selected':''}" style="background:${color}" data-swatch="${color}" aria-label="Cor ${color}"></button>`).join('');
    swatchesEl.querySelectorAll('[data-swatch]').forEach(btn=>{
      btn.onclick=()=>{selectedTagSwatch=btn.dataset.swatch;renderTagPopoverContent(conv)};
    });
    const createBtn=document.getElementById('vxCtxTagCreateBtn');
    if(createBtn)createBtn.onclick=()=>{
      const input=document.getElementById('vxCtxTagNewLabel');
      createTagAndAssign(conv.id,input.value,selectedTagSwatch);
      selectedTagSwatch=TAG_SWATCH_COLORS[0];
    };
  }

  function renderQuickReplyPopoverContent(){
    const pop=document.getElementById('vxQuickReplyPopover');
    if(!pop)return;
    pop.innerHTML=`
      <div class="vx-cc-qr-list">${cache.quickReplies.length?cache.quickReplies.map(q=>`
        <div class="vx-cc-qr-item">
          <button type="button" class="vx-cc-qr-option" data-qr-use="${E(q.id)}">${E(q.title)}<small>${E(q.body)}</small></button>
          <button type="button" class="vx-cc-qr-delete-btn" data-qr-delete="${E(q.id)}" title="Excluir resposta rápida" aria-label="Excluir ${E(q.title)}">🗑</button>
        </div>`).join(''):'<div class="vx-cc-qr-empty">Nenhuma resposta rápida criada ainda.</div>'}</div>
      <div class="vx-cc-qr-new-row">
        <input type="text" id="vxQrNewTitle" placeholder="Título (ex: Saudação)" maxlength="60" autocomplete="off">
        <textarea id="vxQrNewBody" placeholder="Texto da resposta…" maxlength="1000" rows="2"></textarea>
        <button type="button" id="vxQrCreateBtn">Criar resposta rápida</button>
      </div>`;
    pop.querySelectorAll('[data-qr-use]').forEach(btn=>{
      btn.onclick=()=>useQuickReply(btn.dataset.qrUse);
    });
    pop.querySelectorAll('[data-qr-delete]').forEach(btn=>{
      btn.onclick=e=>{e.stopPropagation();deleteQuickReply(btn.dataset.qrDelete)};
    });
    const createBtn=document.getElementById('vxQrCreateBtn');
    if(createBtn)createBtn.onclick=()=>{
      const title=document.getElementById('vxQrNewTitle').value;
      const body=document.getElementById('vxQrNewBody').value;
      createQuickReply(title,body);
    };
  }

  function useQuickReply(id){
    const q=cache.quickReplies.find(x=>String(x.id)===String(id));
    if(!q)return;
    const input=document.querySelector('#vxMsgForm input[name=body]');
    if(input)input.value=q.body;
    quickReplyPopoverOpen=false;
    document.getElementById('vxQuickReplyPopover').hidden=true;
    input?.focus();
  }

  async function createQuickReply(title,body){
    const t=String(title||'').trim(), b=String(body||'').trim();
    if(!t||!b)return;
    try{
      const created=await api('chat_quick_reply_templates',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({company_id:state.profile.active_company_id,title:t,body:b,created_by:myUserId()})});
      const q=created?.[0];
      if(q)cache.quickReplies.unshift(q);
      renderQuickReplyPopoverContent();
      toast?.(`Resposta rápida "${t}" criada.`);
    }catch(err){toast?.('Não foi possível criar a resposta rápida: '+err.message,'err')}
  }

  async function deleteQuickReply(id){
    const q=cache.quickReplies.find(x=>String(x.id)===String(id));
    if(!confirm(`Excluir a resposta rápida "${q?.title||''}"?`))return;
    try{
      await api(`chat_quick_reply_templates?id=eq.${id}`,{method:'DELETE'});
      cache.quickReplies=cache.quickReplies.filter(x=>String(x.id)!==String(id));
      renderQuickReplyPopoverContent();
      toast?.(`Resposta rápida "${q?.title||''}" excluída.`);
    }catch(err){toast?.('Não foi possível excluir a resposta rápida: '+err.message,'err')}
  }

  async function toggleConversationTag(conversationId,tagId,checked){
    try{
      if(checked){
        await api('chat_conversation_tags',{method:'POST',body:JSON.stringify({conversation_id:conversationId,tag_id:tagId,company_id:state.profile.active_company_id,created_by:myUserId()})});
      }else{
        await api(`chat_conversation_tags?conversation_id=eq.${conversationId}&tag_id=eq.${tagId}`,{method:'DELETE'});
      }
      await refreshConvSummary(conversationId);
      if(String(hubState.selectedId)===String(conversationId))renderContexto(hubState.list.find(c=>String(c.id)===String(conversationId)));
    }catch(err){toast?.('Não foi possível atualizar a tag: '+err.message,'err')}
  }

  async function createTagAndAssign(conversationId,label,color){
    const trimmed=String(label||'').trim();
    if(!trimmed)return;
    try{
      const created=await api('chat_tags',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({company_id:state.profile.active_company_id,label:trimmed,color,created_by:myUserId()})});
      const tag=created?.[0];
      if(!tag)throw new Error('Falha ao criar a tag.');
      cache.tags.push(tag);
      await toggleConversationTag(conversationId,tag.id,true);
      toast?.(`Tag "${trimmed}" criada.`);
    }catch(err){toast?.('Não foi possível criar a tag: '+err.message,'err')}
  }

  async function deleteTagFromCatalog(tagId){
    const tag=cache.tags.find(t=>String(t.id)===String(tagId));
    if(!confirm(`Excluir a tag "${tag?.label||''}"? Ela sai de todas as conversas que a usam.`))return;
    try{
      await api(`chat_tags?id=eq.${tagId}`,{method:'DELETE'});
      cache.tags=cache.tags.filter(t=>String(t.id)!==String(tagId));
      await loadConversasHubData();
      renderConvList();
      if(hubState.selectedId){
        const conv=hubState.list.find(c=>String(c.id)===String(hubState.selectedId));
        if(conv)renderContexto(conv);
      }
      toast?.(`Tag "${tag?.label||''}" excluída.`);
    }catch(err){toast?.('Não foi possível excluir a tag: '+err.message,'err')}
  }

  function renderClientResults(conversationId,term){
    const box=document.getElementById('vxCtxClientResults');
    if(!box)return;
    const q=term.trim().toLowerCase();
    if(q.length<2){box.innerHTML='';return}
    const matches=(state.clients||[]).filter(c=>(c.name||'').toLowerCase().includes(q)||(c.phone_primary||'').includes(q)).slice(0,6);
    box.innerHTML=matches.length?matches.map(c=>`<div class="vx-ctx-client-opt" data-client="${E(c.id)}">${E(c.name)}<small>${E(c.phone_primary||'')}</small></div>`).join(''):'<p class="vx-chatbeta-sub">Nenhum cliente encontrado.</p>';
    box.querySelectorAll('[data-client]').forEach(el=>el.onclick=()=>vincularCliente(conversationId,el.dataset.client));
  }

  async function refreshConvSummary(conversationId){
    if(!conversationId)return;
    const rows=await api(`chat_conversations?id=eq.${conversationId}&select=${CONV_SELECT}`).catch(()=>null);
    if(!rows||!rows.length)return;
    const idx=hubState.list.findIndex(c=>String(c.id)===String(conversationId));
    if(idx>=0)hubState.list[idx]=rows[0];else hubState.list.unshift(rows[0]);
    renderConvList();
  }

  async function vincularCliente(conversationId,clientId){
    try{
      await api(`chat_conversations?id=eq.${conversationId}`,{method:'PATCH',body:JSON.stringify({client_id:clientId})});
      toast?.('Cliente vinculado à conversa.');
      await refreshConvSummary(conversationId);
      renderContexto(hubState.list.find(c=>String(c.id)===String(conversationId)));
    }catch(err){toast?.('Não foi possível vincular o cliente: '+err.message,'err')}
  }

  /* ---------- Auditoria de atribuição/transferência ----------
     chat_conversation_events já existia no schema (fundação do chat,
     28/08) mas nunca era escrito por nenhum código -- usado agora pra
     registrar quem/de quem/pra quem/quando em cada mudança de
     responsável, regra dada pelo usuário em 2026-09-01. */
  async function logConversationEvent(conversationId,action,previousData,newData){
    try{
      await api('chat_conversation_events',{method:'POST',body:JSON.stringify({company_id:state.profile.active_company_id,conversation_id:conversationId,action,previous_data:previousData||{},new_data:newData||{},changed_by:myUserId()})});
    }catch(err){/* auditoria não pode travar a ação principal -- só loga no console */console.error?.('Falha ao registrar evento de conversa:',err)}
  }

  async function assumirConversa(conversationId){
    try{
      const conv=hubState.list.find(c=>String(c.id)===String(conversationId));
      const previousUserId=conv?.assigned_user_id||null;
      await api(`chat_conversations?id=eq.${conversationId}`,{method:'PATCH',body:JSON.stringify({assigned_user_id:myUserId()})});
      await logConversationEvent(conversationId,'ASSUMIR',{assigned_user_id:previousUserId},{assigned_user_id:myUserId()});
      toast?.('Conversa atribuída a você.');
      await refreshConvSummary(conversationId);
      renderContexto(hubState.list.find(c=>String(c.id)===String(conversationId)));
    }catch(err){toast?.('Não foi possível assumir a conversa: '+err.message,'err')}
  }

  async function mudarStatusConversa(conversationId,status,successMsg){
    try{
      await api(`chat_conversations?id=eq.${conversationId}`,{method:'PATCH',body:JSON.stringify({status})});
      toast?.(successMsg);
      await refreshConvSummary(conversationId);
      if(String(hubState.selectedId)===String(conversationId))await selectConversa(conversationId,true);
    }catch(err){toast?.('Não foi possível atualizar a conversa: '+err.message,'err')}
  }
  function encerrarConversa(conversationId){
    if(!confirm('Encerrar esta conversa? Ela sai do atendimento ativo, mas o histórico continua disponível.'))return;
    mudarStatusConversa(conversationId,'FINALIZADA','Conversa encerrada.');
  }
  function reabrirConversa(conversationId){
    mudarStatusConversa(conversationId,'ABERTA','Conversa reaberta.');
  }
  async function transferirConversa(conversationId,targetUserId){
    try{
      const conv=hubState.list.find(c=>String(c.id)===String(conversationId));
      const previousUserId=conv?.assigned_user_id||null;
      await api(`chat_conversations?id=eq.${conversationId}`,{method:'PATCH',body:JSON.stringify({assigned_user_id:targetUserId})});
      await logConversationEvent(conversationId,'TRANSFER',{assigned_user_id:previousUserId},{assigned_user_id:targetUserId});
      const target=cache.attendants.find(a=>String(a.id)===String(targetUserId));
      toast?.(`Conversa transferida para ${target?.full_name||'outro atendente'}.`);
      await refreshConvSummary(conversationId);
      if(String(hubState.selectedId)===String(conversationId))await selectConversa(conversationId,true);
    }catch(err){toast?.('Não foi possível transferir a conversa: '+err.message,'err')}
  }
  // "📅 Agendar retorno" -- achado do usuário em 2026-09-02 (mockup
  // aprovado, artifact 42ebf5fb): faltava na barra de ferramentas da
  // conversa. Guarda só o PRÓXIMO retorno (chat_conversations.
  // next_callback_at/next_callback_reason, migration
  // 20260902010000) -- o histórico completo fica no evento
  // SCHEDULE_CALLBACK/CLEAR_CALLBACK via logConversationEvent, mesmo
  // padrão já usado por TRANSFER/ASSUMIR.
  async function scheduleCallback(conversationId,whenIso,reason){
    try{
      const conv=hubState.list.find(c=>String(c.id)===String(conversationId));
      const previous={next_callback_at:conv?.next_callback_at||null,next_callback_reason:conv?.next_callback_reason||null};
      const next={next_callback_at:whenIso,next_callback_reason:reason||null};
      await api(`chat_conversations?id=eq.${conversationId}`,{method:'PATCH',body:JSON.stringify(next)});
      await logConversationEvent(conversationId,'SCHEDULE_CALLBACK',previous,next);
      if(conv)Object.assign(conv,next);
      toast?.('Retorno agendado.');
      if(String(hubState.selectedId)===String(conversationId))await selectConversa(conversationId,true);
      else renderConvList();
    }catch(err){toast?.('Não foi possível agendar o retorno: '+err.message,'err')}
  }
  async function clearCallback(conversationId){
    try{
      const conv=hubState.list.find(c=>String(c.id)===String(conversationId));
      const previous={next_callback_at:conv?.next_callback_at||null,next_callback_reason:conv?.next_callback_reason||null};
      const next={next_callback_at:null,next_callback_reason:null};
      await api(`chat_conversations?id=eq.${conversationId}`,{method:'PATCH',body:JSON.stringify(next)});
      await logConversationEvent(conversationId,'CLEAR_CALLBACK',previous,next);
      if(conv)Object.assign(conv,next);
      toast?.('Retorno cancelado.');
      if(String(hubState.selectedId)===String(conversationId))await selectConversa(conversationId,true);
      else renderConvList();
    }catch(err){toast?.('Não foi possível cancelar o retorno: '+err.message,'err')}
  }
  // "🔍 Buscar na conversa" -- 100% client-side sobre
  // hubState.currentMessages, já carregado por refreshMensagens; nunca
  // dispara uma chamada nova ao banco.
  function applyThreadSearchFilter(){
    const list=document.getElementById('vxMsgList');
    if(!list)return;
    const q=threadSearchQuery.trim().toLowerCase();
    list.querySelectorAll('.vx-msg-row[data-msg-body]').forEach(row=>{
      row.hidden=!!q&&!row.dataset.msgBody.includes(q);
    });
  }
  function openTransferLojaModal(conversationId,currentStoreId){
    document.querySelector('#vxTransferLojaModal')?.remove();
    const bg=document.createElement('div');
    bg.id='vxTransferLojaModal';
    bg.className='vx-modal-bg';
    const options=cache.stores.filter(s=>String(s.id)!==String(currentStoreId||''));
    bg.innerHTML=`<div class="vx-modal">
      <h3>Transferir loja da conversa</h3>
      <p class="vx-chatbeta-sub">A conexão WhatsApp não muda — ela atende todas as lojas da empresa. Só a loja associada a esta conversa muda.</p>
      ${options.length?options.map(s=>`<button type="button" class="vx-cc-transfer-opt" data-store="${E(s.id)}">${E(s.name)}</button>`).join(''):'<p class="vx-chatbeta-sub">Nenhuma outra loja cadastrada.</p>'}
      <div class="vx-modal-actions"><button type="button" data-cancel>Fechar</button></div>
    </div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.querySelector('[data-cancel]').onclick=close;
    bg.addEventListener('click',e=>{if(e.target===bg)close()});
    bg.querySelectorAll('[data-store]').forEach(btn=>btn.onclick=async()=>{
      try{
        await api(`chat_conversations?id=eq.${conversationId}`,{method:'PATCH',body:JSON.stringify({current_store_id:btn.dataset.store})});
        toast?.('Loja da conversa atualizada.');
        close();
        await refreshConvSummary(conversationId);
        renderContexto(hubState.list.find(c=>String(c.id)===String(conversationId)));
      }catch(err){toast?.('Não foi possível transferir a loja: '+err.message,'err')}
    });
  }

  /* ---------- Nova Conversa ----------
     Permite iniciar com um número ainda não cadastrado como cliente
     (cliente vinculado é uma ação separada, no Contexto). Nunca duplica:
     se já existir conversa ativa com o mesmo número nessa conexão,
     reaproveita em vez de criar outra (regra já aprovada). */
  async function openNovaConversaModal(prefillPhone){
    // Chamado tanto como listener direto de clique (recebe o
    // MouseEvent, ignorado aqui) quanto pelo dropdown de busca (recebe
    // o telefone já normalizado como string) -- só usa o argumento
    // quando é mesmo uma string.
    const phoneValue=typeof prefillPhone==='string'?prefillPhone:'';
    document.querySelector('#vxNovaConvModal')?.remove();
    let connections=await api('chat_connections?select=id,name,status&order=created_at.desc').catch(()=>[]);
    connections=(connections||[]).filter(c=>c.status==='CONECTADO');
    const bg=document.createElement('div');
    bg.id='vxNovaConvModal';
    bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal">
      <h3>Nova conversa</h3>
      <p class="vx-chatbeta-sub">Informe o número do WhatsApp — não precisa ser um cliente já cadastrado.</p>
      ${connections.length?`<form id="vxNovaConvForm" class="vx-conn-new-form vx-conn-new-form-col">
        ${connections.length>1?`<select name="connectionId">${connections.map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select>`:`<input type="hidden" name="connectionId" value="${E(connections[0].id)}">`}
        <input name="phone" placeholder="Número (com DDD, só dígitos)" required maxlength="20" inputmode="numeric" value="${E(phoneValue)}">
        <input name="name" placeholder="Nome do contato (opcional)" maxlength="120">
        <div class="vx-modal-actions"><button type="button" data-cancel>Cancelar</button><button type="submit" class="primary">Iniciar conversa</button></div>
      </form>`:`<p class="vx-chatbeta-sub">Nenhuma conexão conectada no momento — conecte uma em Configurações → Conexões antes de iniciar uma nova conversa.</p><div class="vx-modal-actions"><button type="button" data-cancel>Fechar</button></div>`}
    </div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.querySelector('[data-cancel]').onclick=close;
    bg.addEventListener('click',e=>{if(e.target===bg)close()});
    bg.querySelector('#vxNovaConvForm')?.addEventListener('submit',e=>handleNovaConversa(e,close));
  }

  async function handleNovaConversa(e,close){
    e.preventDefault();
    const f=new FormData(e.target);
    const connectionId=String(f.get('connectionId')||'');
    const phone=String(f.get('phone')||'').replace(/\D/g,'');
    const name=String(f.get('name')||'').trim()||null;
    if(!connectionId||!phone)return;
    const btn=e.target.querySelector('button[type=submit]');
    btn.disabled=true;
    try{
      const existing=await api(`chat_conversations?connection_id=eq.${connectionId}&customer_phone=eq.${phone}&status=in.(ABERTA,EM_ATENDIMENTO,AGUARDANDO_CLIENTE)&select=id&limit=1`).catch(()=>[]);
      let convId=existing&&existing.length?existing[0].id:null;
      if(!convId){
        const created=await api('chat_conversations',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({company_id:state.profile.active_company_id,connection_id:connectionId,customer_phone:phone,customer_name:name,status:'ABERTA',assigned_user_id:myUserId()})});
        convId=created?.[0]?.id;
      }
      close();
      await loadConversasHubData();
      renderConvList();
      if(convId)await selectConversa(convId);
    }catch(err){
      toast?.('Não foi possível iniciar a conversa: '+err.message,'err');
      btn.disabled=false;
    }
  }

  async function loadMensagens(conversationId){
    // reply_to: embed via a FK que a migration da Fase 5 criou --
    // traz o corpo/direção da mensagem citada junto, sem round-trip
    // extra pra montar o preview de citação em cada linha.
    return api(`chat_messages?conversation_id=eq.${conversationId}&select=id,direction,body,status,created_at,deleted_at,origin,sender_user_id,reply_to_message_id,message_type,media_status,media_storage_path,media_mime_type,media_size_bytes,profiles!chat_messages_sender_user_id_fkey(full_name),reply_to:chat_messages!chat_messages_reply_to_message_id_fkey(id,body,direction,origin)&order=created_at.asc`).catch(()=>[]);
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

  // Preview curto da mensagem citada -- mesmo texto usado no bloco de
  // citação dentro da bolha e no banner do composer (Fase 5).
  function quoteSnippetText(m){
    if(!m)return'';
    if(m.origin==='INTERNAL')return'📝 '+(m.body||'').slice(0,80);
    return (m.body||'[sem texto]').slice(0,80);
  }
  function quoteSnippetAuthor(m){
    if(!m)return'';
    return m.origin==='INTERNAL'?'Nota interna':(m.direction==='OUTBOUND'?'Você':'Cliente');
  }
  function mensagemRow(m){
    const hora=new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const quoteBlock=m.reply_to?`<div class="vx-msg-quote"><b>${E(quoteSnippetAuthor(m.reply_to))}</b><span>${E(quoteSnippetText(m.reply_to))}</span></div>`:'';
    if(m.origin==='INTERNAL'){
      const autor=m.profiles?.full_name||'—';
      return `<div class="vx-msg-row vx-msg-internal" data-msg-body="${E((m.body||'').toLowerCase())}"><div class="vx-msg-bubble vx-msg-bubble-internal">${quoteBlock}<span class="vx-msg-internal-tag">📝 Nota interna — visível só pra equipe</span><span><b>${E(autor)}:</b> ${E(m.body||'')}</span><small>${E(hora)}</small></div><button type="button" class="vx-msg-reply-btn" data-reply="${E(m.id)}" title="Responder">↩</button></div>`;
    }
    const lado=m.direction==='OUTBOUND'?'vx-msg-out':'vx-msg-in';
    const isDeleted=!!m.deleted_at;
    const isImport=m.origin==='IMPORT';
    // origin='BOT' (Fase 7 do Robô de Atendimento) -- mensagem
    // automática (boas-vindas/triagem/fora do horário quando há fluxo
    // publicado), enviada de verdade ao cliente via gateway, igual
    // REALTIME -- só o selo abaixo distingue visualmente na Central,
    // mesma ideia do selo "Histórico" já usado pra IMPORT.
    const isBot=m.origin==='BOT';
    const deletedLabel=isDeleted?'<span class="vx-msg-deleted-label">🗑 Apagada no WhatsApp — mantida aqui como registro</span>':'';
    const importTag=isImport?'<span class="vx-msg-tag vx-msg-tag-import">Histórico</span>':'';
    const botTag=isBot?'<span class="vx-msg-tag vx-msg-tag-bot">🤖 Robô</span>':'';
    const replyBtn=isDeleted?'':`<button type="button" class="vx-msg-reply-btn" data-reply="${E(m.id)}" title="Responder">↩</button>`;
    const isMedia=m.message_type&&m.message_type!=='TEXT'&&m.media_storage_path;
    const bodyHtml=isMedia?mediaBodyHtml(m):`<span>${E(m.body||'[sem texto]')}</span>`;
    return `<div class="vx-msg-row ${lado}${isDeleted?' vx-msg-deleted':''}" data-msg-body="${E((m.body||'').toLowerCase())}"><div class="vx-msg-bubble${isBot?' vx-msg-bubble-bot':''}">${quoteBlock}${deletedLabel}${bodyHtml}${isMedia?mediaPendingNoteHtml(m):''}<div class="vx-msg-meta">${importTag}${botTag}<small>${E(hora)}</small>${mensagemTick(m)}</div></div>${replyBtn}</div>`;
  }
  function renderReplyBanner(){
    const el=document.getElementById('vxReplyBanner');
    if(!el)return;
    if(!replyingTo){el.hidden=true;el.innerHTML='';return}
    el.hidden=false;
    el.innerHTML=`<div class="vx-cc-reply-banner-body"><b>Respondendo a ${E(quoteSnippetAuthor(replyingTo))}</b><span>${E(quoteSnippetText(replyingTo))}</span></div><button type="button" id="vxReplyCancel" title="Cancelar resposta">×</button>`;
    document.getElementById('vxReplyCancel').onclick=()=>{replyingTo=null;renderReplyBanner()};
  }
  function startReply(messageId){
    const msg=(hubState.currentMessages||[]).find(m=>String(m.id)===String(messageId));
    if(!msg)return;
    replyingTo=msg;
    renderReplyBanner();
    document.querySelector('#vxMsgForm input[name=body]')?.focus();
  }

  async function refreshMensagens(){
    if(!conversaAtualId)return;
    const list=document.getElementById('vxMsgList');
    if(!list)return stopConversaPoll();
    const msgs=await loadMensagens(conversaAtualId);
    const deletedBefore=(hubState.currentMessages||[]).filter(m=>m.deleted_at).length;
    hubState.currentMessages=msgs;
    list.innerHTML=msgs.length?msgs.map(mensagemRow).join(''):'<p class="vx-chatbeta-sub">Nenhuma mensagem ainda.</p>';
    list.scrollTop=list.scrollHeight;
    list.querySelectorAll('[data-reply]').forEach(btn=>btn.onclick=()=>startReply(btn.dataset.reply));
    wireMediaElements(list);
    applyThreadSearchFilter();
    await refreshConvSummary(conversaAtualId);
    const deletedAfter=msgs.filter(m=>m.deleted_at).length;
    // Só re-renderiza o Contexto se algo relevante pra ele mudou (nova
    // mensagem apagada) -- nunca a cada poll de 3s, senão apaga o que o
    // atendente estiver digitando na busca de "vincular cliente".
    if(deletedAfter!==deletedBefore&&String(hubState.selectedId)===String(conversaAtualId)){
      const conv=hubState.list.find(c=>String(c.id)===String(conversaAtualId));
      if(conv)renderContexto(conv);
    }
  }

  /* Pergunta o que fazer quando o atendente envia mensagem numa
     conversa já atribuída a OUTRO atendente -- regra dada pelo
     usuário em 2026-09-01. Nunca decide sozinho (nem assume, nem
     ignora): sempre pergunta, e mantém o responsável atual se a
     escolha for só interagir. */
  function askOwnershipConflict(assignedName){
    return new Promise(resolve=>{
      document.querySelector('#vxOwnershipModal')?.remove();
      const bg=document.createElement('div');
      bg.id='vxOwnershipModal';
      bg.className='vx-modal-bg';
      bg.innerHTML=`<div class="vx-modal">
        <h3>Conversa de outro atendente</h3>
        <p class="vx-chatbeta-sub">Esta conversa está atribuída a <b>${E(assignedName)}</b>. O que você quer fazer?</p>
        <div class="vx-modal-actions">
          <button type="button" data-choice="cancel">Cancelar</button>
          <button type="button" data-choice="interact">Só responder (mantém ${E(assignedName)})</button>
          <button type="button" data-choice="assume" class="primary">Assumir e responder</button>
        </div>
      </div>`;
      document.body.appendChild(bg);
      const close=choice=>{bg.remove();resolve(choice)};
      bg.querySelectorAll('[data-choice]').forEach(b=>{b.onclick=()=>close(b.dataset.choice)});
      bg.addEventListener('click',e=>{if(e.target===bg)close('cancel')});
    });
  }

  async function handleSendMensagem(e){
    e.preventDefault();
    const f=new FormData(e.target);
    const body=String(f.get('body')||'').trim();
    if(!body||!conversaAtualId)return;
    const btn=e.target.querySelector('button[type=submit]');
    const input=e.target.querySelector('input[name=body]');
    const conv=hubState.list.find(c=>String(c.id)===String(conversaAtualId));
    const me=myUserId();
    // Auto-atribuição por ação humana (regra dada pelo usuário em
    // 2026-09-01): a primeira mensagem humana (nota interna ou real)
    // numa conversa sem responsável assume automaticamente pra quem
    // enviou -- nunca por mensagem automática/bot/IA/fora do horário,
    // que nunca passam por aqui (só o clique real do atendente chama
    // handleSendMensagem). Se já pertence a OUTRO atendente, pergunta
    // em vez de decidir sozinho.
    if(conv&&!conv.assigned_user_id){
      try{
        await api(`chat_conversations?id=eq.${conversaAtualId}`,{method:'PATCH',body:JSON.stringify({assigned_user_id:me})});
        await logConversationEvent(conversaAtualId,'AUTO_ASSIGN_FIRST_MESSAGE',{assigned_user_id:null},{assigned_user_id:me});
        conv.assigned_user_id=me;
        await refreshConvSummary(conversaAtualId);
        renderContexto(hubState.list.find(c=>String(c.id)===String(conversaAtualId)));
        document.getElementById('vxCtxAssume')?.remove();
        toast?.('Conversa atribuída a você automaticamente.');
      }catch(err){toast?.('Não foi possível atribuir a conversa automaticamente: '+err.message,'err')}
    }else if(conv&&String(conv.assigned_user_id)!==String(me)){
      const owner=cache.attendants.find(a=>String(a.id)===String(conv.assigned_user_id));
      const choice=await askOwnershipConflict(owner?.full_name||'outro atendente');
      if(choice==='cancel')return;
      if(choice==='assume'){
        try{
          const previousUserId=conv.assigned_user_id;
          await api(`chat_conversations?id=eq.${conversaAtualId}`,{method:'PATCH',body:JSON.stringify({assigned_user_id:me})});
          await logConversationEvent(conversaAtualId,'ASSUMIR',{assigned_user_id:previousUserId},{assigned_user_id:me});
          conv.assigned_user_id=me;
          await refreshConvSummary(conversaAtualId);
          renderContexto(hubState.list.find(c=>String(c.id)===String(conversaAtualId)));
          document.getElementById('vxCtxAssume')?.remove();
        }catch(err){toast?.('Não foi possível assumir a conversa: '+err.message,'err');return}
      }
    }
    btn.disabled=true;
    const replyToMessageId=replyingTo?.id||null;
    try{
      if(internalNoteMode){
        // Grava direto via REST -- nunca passa por chat-send-message,
        // que é a única function que despacha mensagem pro gateway/
        // WhatsApp. Não atualiza last_message_preview/last_message_at/
        // unread_count da conversa (essas colunas são só pra
        // resumo real de conversa com o cliente).
        await api('chat_messages',{method:'POST',body:JSON.stringify({company_id:state.profile.active_company_id,conversation_id:conversaAtualId,direction:'OUTBOUND',origin:'INTERNAL',message_type:'TEXT',body,sender_user_id:myUserId(),reply_to_message_id:replyToMessageId})});
      }else{
        const res=await fetch(CFG.url+'/functions/v1/chat-send-message',{
          method:'POST',headers:authHeaders(),
          body:JSON.stringify({conversationId:conversaAtualId,body,replyToMessageId}),
        });
        const data=await res.json().catch(()=>null);
        if(!res.ok||!data?.ok)throw new Error(data?.message||data?.error||'Falha ao enviar.');
      }
      input.value='';
      replyingTo=null;
      renderReplyBanner();
      await refreshMensagens();
    }catch(err){
      toast?.('Não foi possível enviar: '+err.message,'err');
    }finally{
      btn.disabled=false;
    }
  }
})();
