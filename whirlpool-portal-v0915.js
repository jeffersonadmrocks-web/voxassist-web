/* VoxAssist Web — módulo Whirlpool (painel de triagem), casca pronta
   pra receber dado. Réplica do padrão isolado já comprovado em
   electrolux-reports-v0813.js (NUNCA tocado por este arquivo -- mesma
   disciplina de módulo isolado): view própria, nunca lê/grava tabela
   operacional do VoxAssist, wrap de window.render (nunca edita app.js).

   Achado do usuário (2026-09-15): diferente do Electrolux (item de
   menu próprio no sidebar), este módulo é acessado como CARD "WP / SEG"
   dentro do hub Atendimento (all-menus-layout.js -- data-target=
   "whirlpool-portal", ver openTarget()) -- nenhum botão próprio no
   sidebar/"Mais" mobile aqui, de propósito.

   Diferença deliberada do Electrolux: lá existe uma API própria (
   electrolux-proxy) alimentando o painel de verdade. A Whirlpool ainda
   NÃO tem isso -- o robô de importação (em construção, fora deste
   repositório) vai gravar direto nas OS do VoxAssist (service_orders),
   não num painel externo -- por isso este módulo nasce com estado
   vazio HONESTO (nenhum número inventado), pronto pra virar a tela de
   "OS Whirlpool/Seguradora aguardando tratativa" assim que o mecanismo
   de identificação (ex.: service_orders.source='WHIRLPOOL', mesmo
   padrão do bridge FG Electrolux) existir. */
(function(){
  const VIEW='whirlpool-portal';
  try{ if(typeof navMap!=='undefined') navMap[VIEW]='WP / Seguradora'; }catch(_e){}

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

  function renderHome(){
    const app=document.querySelector('#app');if(!app)return;
    const isGestor=String(state?.profile?.role||'').toUpperCase()==='GESTOR';
    app.innerHTML=`<div class="module-home">
      <div class="module-home-head">
        <div><h2>WP / Seguradora</h2><p>ORDENS WHIRLPOOL E SEGURADORA IMPORTADAS</p></div>
        <div class="module-head-actions"><button class="secondary" id="vxWpPortalBack">← Voltar</button></div>
      </div>
      <div class="module-summary">
        <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>TOTAL IMPORTADAS</span><b>—</b></button>
        <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>AGUARDANDO TRATATIVA</span><b>—</b></button>
        <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>EM ATENDIMENTO</span><b>—</b></button>
        <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>CONCLUÍDO</span><b>—</b></button>
      </div>
      <div class="vx-wpp-empty">
        <span class="vx-wpp-empty-icon">◷</span>
        <h3>Fonte de dados Whirlpool/Seguradora ainda não conectada</h3>
        <p>Esta tela já está pronta pra listar as OS importadas pelo robô, aguardando tratativa. Nenhum número acima é inventado enquanto isso -- os cards ficam com "—" até o robô começar a gravar OS de verdade no VoxAssist.</p>
        ${isGestor?'<small>Assim que o robô estiver gravando OS (service_orders.source=\'WHIRLPOOL\', mesmo padrão do bridge FG Electrolux), este é o único arquivo a estender -- nenhum outro módulo precisa mudar.</small>':''}
      </div>
    </div>`;
    document.getElementById('vxWpPortalBack').onclick=()=>window.render(state.view||'dashboard');
  }

  async function renderPage(){
    // Nunca seta state.view=VIEW aqui -- esta tela é um drill-down a
    // partir do card WP/SEG (Atendimento), não um destino de topo do
    // sidebar (mesmo motivo de renderStructureOnly em
    // all-menus-layout.js não setar state.view: o botão Voltar usa
    // state.view||'dashboard' pra saber pra onde voltar -- sobrescrever
    // aqui faria Voltar reabrir a própria tela WP/SEG num loop).
    installStyle();
    const title=document.querySelector('#title');if(title)title.textContent='WP / Seguradora';
    renderHome();
  }

  const priorRender=window.render;
  window.render=function(view){
    if(view===VIEW)return renderPage();
    return priorRender.apply(this,arguments);
  };

  installStyle();
})();
