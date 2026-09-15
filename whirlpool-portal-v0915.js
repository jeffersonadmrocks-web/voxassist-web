/* VoxAssist Web — módulo Whirlpool (painel de triagem), casca pronta
   pra receber dado. Réplica do padrão isolado já comprovado em
   electrolux-reports-v0813.js (NUNCA tocado por este arquivo -- mesma
   disciplina de módulo isolado): view própria, nunca lê/grava tabela
   operacional do VoxAssist, wrap de window.render (nunca edita
   app.js), nav auto-registrado no sidebar/mobile.

   Diferença deliberada do Electrolux: lá existe uma API própria (
   electrolux-proxy) alimentando o painel de verdade. A Whirlpool
   ainda NÃO tem isso -- só um robô de importação em construção
   (achado do usuário, 2026-09-15), fora deste repositório. Por isso
   este módulo nasce com estado vazio HONESTO (nenhum card/número
   inventado) em vez de já oferecer uma "configuração de API" como o
   Electrolux -- isso pressuporia uma arquitetura (sincronização via
   REST) que ainda não foi decidida pra Whirlpool. Quando a fonte de
   dado real existir (robô alimentando uma tabela/Storage, ou uma API
   oficial), este arquivo é o único lugar a estender -- os 9 grupos/
   Kanban do Electrolux não foram replicados aqui de propósito (não dá
   pra assumir que a Whirlpool tem as mesmas situações da SAE
   Electrolux só pelo nome do módulo). */
(function(){
  const VIEW='whirlpool-portal';
  try{ if(typeof navMap!=='undefined') navMap[VIEW]='Whirlpool'; }catch(_e){}

  function installStyle(){
    if(document.querySelector('#vxWpPortalStyle'))return;
    const s=document.createElement('style');
    s.id='vxWpPortalStyle';
    s.textContent=`
      .vx-wpp-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:48px 24px;color:#516375}
      .vx-wpp-empty-icon{font-size:34px;color:#8494a6}
      .vx-wpp-empty h3{margin:0;color:#172033;font-size:16px}
      .vx-wpp-empty p{margin:0;max-width:520px;font-size:13px;line-height:1.6}
      .vx-wpp-empty small{color:#8494a6;font-size:11px}
    `;
    document.head.appendChild(s);
  }

  function ensureNav(){
    const side=document.querySelector('.sidebar');
    if(!side || side.querySelector('.nav[data-view="'+VIEW+'"]')) return;
    const btn=document.createElement('button');
    btn.className='nav';btn.dataset.view=VIEW;btn.innerHTML='◈ <span>WP / SEG</span>';
    // Mesmo ponto de inserção do Electrolux (antes de "Configurações")
    // -- mantém a ordem visual dos módulos de fábrica juntos no menu.
    const elxBtn=side.querySelector('.nav[data-view="electrolux"]');
    const configBtn=side.querySelector('.nav[data-view="usuarios"]');
    if(elxBtn && elxBtn.parentElement){
      elxBtn.insertAdjacentElement('afterend',btn);
    } else if(configBtn && configBtn.parentElement){
      configBtn.parentElement.insertBefore(btn,configBtn);
    } else {
      (side.querySelector('.desktop-menu')||side).appendChild(btn);
    }
    btn.onclick=()=>window.render(VIEW);
  }

  function renderHome(){
    const app=document.querySelector('#app');if(!app)return;
    const isGestor=String(state?.profile?.role||'').toUpperCase()==='GESTOR';
    app.innerHTML=`<div class="module-home">
      <div class="module-home-head">
        <div><h2>Whirlpool</h2><p>PAINEL DE TRIAGEM • ORDENS WHIRLPOOL</p></div>
      </div>
      <div class="module-summary">
        <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>TOTAL</span><b>—</b></button>
        <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>AGUARDANDO PEÇA</span><b>—</b></button>
        <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>EM ATENDIMENTO</span><b>—</b></button>
        <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>CONCLUÍDO</span><b>—</b></button>
      </div>
      <div class="vx-wpp-empty">
        <span class="vx-wpp-empty-icon">◷</span>
        <h3>Fonte de dados Whirlpool ainda não conectada</h3>
        <p>Este painel já está pronto no mesmo padrão do módulo Electrolux -- só falta a fonte de dado real da Whirlpool (robô de importação ou API oficial) começar a alimentar aqui. Nenhum número acima é inventado enquanto isso -- os cards ficam com "—" até existir dado de verdade.</p>
        ${isGestor?'<small>Assim que o robô/API estiver pronto, este é o único arquivo a estender (whirlpool-portal-v0915.js) -- nenhum outro módulo Whirlpool precisa mudar.</small>':''}
      </div>
    </div>`;
  }

  async function renderPage(){
    installStyle();ensureNav();
    try{state.view=VIEW;if(typeof addTab==='function')addTab(VIEW,'Whirlpool');}catch(_e){}
    const title=document.querySelector('#title');if(title)title.textContent='Whirlpool';
    document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===VIEW));
    try{if(typeof renderTabs==='function')renderTabs('Whirlpool');}catch(_e){}
    renderHome();
  }

  const priorRender=window.render;
  window.render=function(view){
    if(view===VIEW)return renderPage();
    return priorRender.apply(this,arguments);
  };

  const mo=new MutationObserver(()=>ensureNav());
  mo.observe(document.documentElement,{childList:true,subtree:true});
  installStyle();ensureNav();setTimeout(ensureNav,250);setTimeout(ensureNav,1000);
})();
