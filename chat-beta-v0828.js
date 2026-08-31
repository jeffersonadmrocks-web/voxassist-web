/* VoxAssist V0.8.13 — Chat — Beta (agora "Chat VoxAssist", área de
   homologação do sistema de comunicação próprio). NÃO edita nenhum
   arquivo existente. Injeta um item a mais no menu lateral
   (.desktop-menu, mesma classe .nav dos itens nativos), visível só para
   GESTOR, e ao clicar substitui #app pela própria tela — mesmo padrão
   não-invasivo de electrolux-nps-v0826.js e operational-jornada-v0827.js.
   "Voltar" chama window.render('dashboard').

   A integração com a Digisac foi revogada (decisão registrada em
   2026-08-28): o VoxAssist não depende mais dela. A Digisac continua
   sendo usada pela Vox EXTERNAMENTE e de forma independente durante a
   transição — este arquivo não tem nenhuma chamada pra ela. O novo
   padrão é VOXASSIST → CHAT VOXASSIST → MessagingService →
   MessagingProvider (WhatsAppQrProvider primeiro, MetaCloudApiProvider
   depois) — nenhuma dessas camadas existe ainda; esta versão é só o
   ponto de entrada (menu + tela placeholder) preparado pra receber a
   implementação em etapas futuras, sem prometer nada que ainda não
   existe. */
(function(){
  function role(){return state.profile?.role||'GESTOR'}
  function isGestor(){return role()==='GESTOR'}

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
    renderScreen();
  }

  function renderScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML=`<div class="vx-chatbeta">
      <div class="vx-chatbeta-head">
        <div><button id="chatBetaBack">← Voltar</button><h2>Chat — Beta</h2><small>Chat VoxAssist · ambiente de homologação</small></div>
      </div>
      <div class="vx-chatbeta-notice">A Digisac continua sendo utilizada pela Vox normalmente, de forma externa e independente, durante esta fase de transição. Esta área vai se tornar o Chat VoxAssist — comunicação própria com o cliente pelo WhatsApp, integrada a clientes e OS.</div>
      <div class="vx-chatbeta-card">
        <h3>Em construção</h3>
        <p class="vx-chatbeta-sub">Nenhuma conexão WhatsApp foi criada ainda. As próximas etapas trazem: conexão por QR Code, Central de Conversas, vínculo com OS e histórico — restrito a GESTOR/ATENDENTE/TÉCNICO conforme as permissões já usadas no resto do VoxAssist.</p>
      </div>
    </div>`;
    document.getElementById('chatBetaBack').onclick=goBack;
  }
})();
