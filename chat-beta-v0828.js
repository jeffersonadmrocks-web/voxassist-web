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

  /* ---------- 4 estágios ----------
     Achado real (HTTP 500 num teste com /schedule/0): um rótulo único
     "Endpoint indisponível" escondia que Edge Function, chegada na
     Digisac e validação de token já tinham passado — só o endpoint
     específico não respondeu de forma funcional. Mostra os 4 como uma
     escada: um estágio só marca ✓ se o anterior também marcou. */
  const STAGE_ROWS=[
    ['edgeFunctionReached','Edge Function alcançada'],
    ['digisacReached','API Digisac alcançada'],
    ['tokenValidated','Token validado'],
    ['endpointFunctional','Endpoint funcional validado'],
  ];
  function renderStages(stages){
    if(!stages)return'';
    return `<div class="vx-chatbeta-stages">${STAGE_ROWS.map(([k,label])=>
      `<div class="vx-chatbeta-stage vx-chatbeta-stage-${stages[k]?'yes':'no'}"><span class="vx-chatbeta-stage-dot" aria-hidden="true">${stages[k]?'✓':'✕'}</span>${E(label)}</div>`
    ).join('')}</div>`;
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
      ${renderStages(r.stages)}
      <div class="vx-chatbeta-fields">
        <div><span>Conta/empresa</span><b>${E(r.accountName||'—')}</b></div>
        <div><span>Usuário autenticado</span><b>${E(r.authenticatedUser||'—')}</b></div>
      </div>
    </div>`;
  }

  /* ---------- teste de conexão ----------
     Diferencia os motivos de falha em vez de um "verifique sua conexão"
     genérico (achado real em produção: um bloqueio de CORS e uma queda de
     rede geram o MESMO tipo de exceção no fetch() do navegador — a
     especificação de CORS existe justamente pra esconder o motivo exato
     de um script, então não dá pra distinguir os dois com certeza aqui;
     o texto abaixo é honesto sobre essa ambiguidade). Sessão
     ausente/expirada (401) e falta de permissão GESTOR (403) já vêm como
     código HTTP da própria function e são diferenciados normalmente. */
  async function runTest(){
    renderScreen({phase:'loading'});
    let res;
    try{
      res=await fetch(CFG.url+'/functions/v1/digisac-test',{method:'POST',headers:authHeaders()});
    }catch(e){
      renderScreen({phase:'blocked',message:'Não foi possível chamar a função de teste (bloqueio de CORS/rede ou instabilidade de conexão) — verifique se o domínio atual está liberado na function e tente novamente.'});
      return;
    }
    if(res.status===401){renderScreen({phase:'blocked',message:'Sessão ausente ou expirada — faça login novamente.'});return}
    if(res.status===403){renderScreen({phase:'blocked',message:'Este teste é restrito a usuários GESTOR — seu perfil não tem essa permissão.'});return}
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data||typeof data.status!=='string'){renderScreen({phase:'blocked',message:'A função de teste respondeu, mas com um formato inesperado — erro retornado pela Edge Function.'});return}
    renderScreen({phase:'done',result:data});
  }
})();
