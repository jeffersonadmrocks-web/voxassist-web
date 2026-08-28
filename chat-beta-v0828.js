/* VoxAssist V0.8.13 — Chat — Beta (integração Digisac, etapa 1: só teste de
   conexão). NÃO edita nenhum arquivo existente. Injeta um item a mais no
   menu lateral (.desktop-menu, mesma classe .nav dos itens nativos),
   visível só para GESTOR, e ao clicar substitui #app pela própria tela —
   mesmo padrão não-invasivo de electrolux-nps-v0826.js e
   operational-jornada-v0827.js. "Voltar" chama window.render('dashboard').
   Digisac continua sendo o sistema operacional oficial: este painel nunca
   lê conversas/mensagens, nunca envia WhatsApp, nunca cria contato/abre
   atendimento — só chama a edge function digisac-test (GET de baixo risco,
   sem side-effect no Digisac) e mostra o resultado já sanitizado que ela
   devolve. O JWT usado é sempre o da sessão atual do VoxAssist
   (authHeaders(), já usado em toda a base) — nunca pedido ao usuário. */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function role(){return state.profile?.role||'GESTOR'}
  function isGestor(){return role()==='GESTOR'}

  const STATUS_LABEL={
    CONEXAO_VALIDA:{text:'Conexão válida',cls:'ok'},
    TOKEN_RECUSADO:{text:'Token recusado',cls:'err'},
    ENDPOINT_INDISPONIVEL:{text:'Endpoint indisponível',cls:'warn'},
    CONFIGURACAO_AUSENTE:{text:'Configuração ausente',cls:'warn'},
  };

  /* ---------- entrada no menu lateral ----------
     .desktop-menu é recriado inteiro toda vez que window.shell() roda
     (login, logout, troca de empresa — ver achado real documentado em
     electrolux-nps-v0826.js). Ancorar em document.body com
     MutationObserver, sem nenhuma flag de "tela ativa" (mesmo bug já
     corrigido nos outros dois módulos: uma flag manual travava o botão
     escondido pra sempre depois de sair da tela por qualquer caminho que
     não fosse "Voltar"). ensureNavEntry() é idempotente e se
     autocorrige sozinha a cada mutação do DOM. */
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

  /* ---------- navegação ---------- */
  function openChatBetaScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active'));
    document.querySelector('[data-chat-beta-entry]')?.classList.add('active');
    renderScreen({phase:'idle'});
  }

  function renderScreen(uiState){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML=`<div class="vx-chatbeta">
      <div class="vx-chatbeta-head">
        <div><button id="chatBetaBack">← Voltar</button><h2>Chat — Beta</h2><small>Integração Digisac · etapa 1 — validação de conexão</small></div>
      </div>
      <div class="vx-chatbeta-notice">O Digisac continua sendo o sistema operacional oficial de atendimento. Este painel, por enquanto, só testa se a conexão com a API está funcionando — nenhuma conversa é lida, nenhum contato é criado e nenhuma mensagem é enviada pelo WhatsApp.</div>
      <div class="vx-chatbeta-card">
        <h3>Teste de conexão</h3>
        <p class="vx-chatbeta-sub">Restrito a usuários GESTOR. Chama a função <code>digisac-test</code> usando a sua sessão atual — nenhum token é digitado ou colado aqui.</p>
        <button id="chatBetaRun" class="primary" ${uiState.phase==='loading'?'disabled':''}>${uiState.phase==='loading'?'Testando…':'Testar conexão com Digisac'}</button>
        ${renderResult(uiState)}
      </div>
    </div>`;
    document.getElementById('chatBetaBack').onclick=goBack;
    document.getElementById('chatBetaRun').onclick=runTest;
  }

  function renderResult(uiState){
    if(uiState.phase==='idle')return '';
    if(uiState.phase==='loading')return '<div class="vx-chatbeta-result vx-chatbeta-loading">Consultando a API da Digisac…</div>';
    if(uiState.phase==='blocked')return `<div class="vx-chatbeta-result vx-chatbeta-err"><b>Não foi possível testar</b><span>${E(uiState.message)}</span></div>`;
    const r=uiState.result||{};
    const label=STATUS_LABEL[r.status]||{text:r.status||'—',cls:'warn'};
    return `<div class="vx-chatbeta-result vx-chatbeta-${E(label.cls)}">
      <div class="vx-chatbeta-status"><b>${E(label.text)}</b>${r.httpStatus!=null?`<span>HTTP ${E(r.httpStatus)}</span>`:''}</div>
      <p>${E(r.message||'')}</p>
      <div class="vx-chatbeta-fields">
        <div><span>Conta/empresa</span><b>${E(r.accountName||'—')}</b></div>
        <div><span>Usuário autenticado</span><b>${E(r.authenticatedUser||'—')}</b></div>
      </div>
    </div>`;
  }

  async function runTest(){
    renderScreen({phase:'loading'});
    try{
      const res=await fetch(CFG.url+'/functions/v1/digisac-test',{method:'POST',headers:authHeaders()});
      const data=await res.json().catch(()=>({}));
      if(res.status===401){renderScreen({phase:'blocked',message:'Sua sessão expirou — faça login novamente.'});return}
      if(res.status===403){renderScreen({phase:'blocked',message:'Este teste é restrito a usuários GESTOR.'});return}
      if(!res.ok||!data||typeof data.status!=='string'){renderScreen({phase:'blocked',message:'A função de teste não respondeu como esperado.'});return}
      renderScreen({phase:'done',result:data});
    }catch(e){
      renderScreen({phase:'blocked',message:'Falha ao chamar a função de teste — verifique sua conexão.'});
    }
  }
})();
