/* VoxAssist Web — módulo Whirlpool (painel de sincronização + tela de
   triagem). Réplica do padrão isolado já comprovado em
   electrolux-reports-v0813.js (NUNCA tocado por este arquivo -- mesma
   disciplina de módulo isolado): view própria, wrap de window.render
   (nunca edita app.js).

   Achado do usuário (2026-09-15): diferente do Electrolux (item de
   menu próprio no sidebar), este módulo é acessado como CARD "WP / SEG"
   dentro do hub Atendimento (all-menus-layout.js -- data-target=
   "whirlpool-portal", ver openTarget()).

   Migration 20260915010000_whirlpool_sync_status.sql cria a PONTE real
   entre o VoxAssist e o executor externo do robô Whirlpool (login no
   portal + fila de importação, construído fora deste repositório): a
   tabela public.whirlpool_sync_status, onde o executor (service_role)
   grava status/reason/next_retry_at/fila/is_running a cada ciclo, e o
   GESTOR pode gravar um pedido de sincronização manual (RPC
   request_whirlpool_manual_sync) que o executor detecta no próximo
   ciclo. Nunca lê/grava senha, cookie ou token -- só estado
   operacional. */
(function(){
  const VIEW='whirlpool-portal';
  try{ if(typeof navMap!=='undefined') navMap[VIEW]='WP / Seguradora'; }catch(_e){}

  const POLL_MS=4000;
  let pollTimer=null;
  function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

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
      .vx-wpp-panel{background:#fff;border:1px solid #cfd7e1;border-radius:8px;padding:16px 18px;margin-top:4px}
      .vx-wpp-status-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      .vx-wpp-badge{display:inline-block;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800;text-transform:uppercase}
      .vx-wpp-badge.ok{background:#e7f6ee;color:#0b6f3c}
      .vx-wpp-badge.warn{background:#fdf3e3;color:#a35b00}
      .vx-wpp-badge.crit{background:#fbeaea;color:#a63131}
      .vx-wpp-badge.running{background:#e9eff6;color:#2f6bab}
      .vx-wpp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px 16px;margin-bottom:12px}
      .vx-wpp-grid div{display:flex;flex-direction:column;gap:2px}
      .vx-wpp-grid span{font-size:10px;font-weight:800;color:#8494a6;text-transform:uppercase;letter-spacing:.3px}
      .vx-wpp-grid b{font-size:13px;color:#172033}
      .vx-wpp-error{background:#fbeaea;color:#a63131;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;margin-bottom:12px}
      .vx-wpp-locked{font-size:11.5px;font-weight:700;color:#8494a6;margin-left:8px}
    `;
    document.head.appendChild(s);
  }

  function isGestor(){return String(state?.profile?.role||'').toUpperCase()==='GESTOR';}
  const dtFull=v=>v?new Date(v).toLocaleString('pt-BR'):'—';

  async function loadStatus(){
    const cid=state?.profile?.active_company_id;
    if(!cid)return null;
    const rows=await api(`whirlpool_sync_status?company_id=eq.${cid}&select=*`).catch(()=>null);
    return rows?.[0]||null;
  }

  function statusBadge(row){
    if(row.is_running)return `<span class="vx-wpp-badge running">Sincronizando agora</span>`;
    if(String(row.status||'').toUpperCase()==='CREDENCIAIS_INVALIDAS')return `<span class="vx-wpp-badge crit">${esc(row.status)}</span>`;
    if(row.status)return `<span class="vx-wpp-badge warn">${esc(row.status)}</span>`;
    return `<span class="vx-wpp-badge ok">Sem status ainda</span>`;
  }

  function renderConnectedPanel(row){
    const total=Number(row.queue_pending_count||0)+Number(row.queue_completed_count||0);
    const credenciaisInvalidas=String(row.status||'').toUpperCase()==='CREDENCIAIS_INVALIDAS';
    const bloqueado=row.is_running||credenciaisInvalidas;
    const motivoBloqueio=row.is_running?'Sincronização já em andamento.':(credenciaisInvalidas?'Credenciais da Whirlpool inválidas -- atualize antes de sincronizar.':'');
    return `<div class="module-summary">
        <button type="button" class="module-summary-card" style="--accent:#2674d9" disabled><span>TOTAL NA FILA</span><b>${total}</b></button>
        <button type="button" class="module-summary-card" style="--accent:#e87a00" disabled><span>AGUARDANDO CONEXÃO</span><b>${Number(row.queue_pending_count||0)}</b></button>
        <button type="button" class="module-summary-card" style="--accent:#13904b" disabled><span>JÁ IMPORTADAS</span><b>${Number(row.queue_completed_count||0)}</b></button>
        <button type="button" class="module-summary-card" style="--accent:#7650d6" disabled><span>ÚLTIMA EXECUÇÃO</span><b>${Number(row.last_imported_count||0)} importada(s)</b></button>
      </div>
      <div class="vx-wpp-panel">
        <div class="vx-wpp-status-row">
          ${statusBadge(row)}
          ${isGestor()?`<button type="button" class="primary" id="vxWpSyncNow" ${bloqueado?'disabled':''}>↻ SINCRONIZAR AGORA</button>${bloqueado?`<span class="vx-wpp-locked">${esc(motivoBloqueio)}</span>`:''}`:''}
        </div>
        ${row.last_error?`<div class="vx-wpp-error">Último erro: ${esc(row.last_error)}</div>`:''}
        <div class="vx-wpp-grid">
          <div><span>Motivo</span><b>${esc(row.reason||'—')}</b></div>
          <div><span>Próxima tentativa automática</span><b>${dtFull(row.next_retry_at)}</b></div>
          <div><span>Última execução</span><b>${dtFull(row.last_run_at)}</b></div>
          <div><span>Resultado da última execução</span><b>${esc(row.last_result||'—')}</b></div>
        </div>
      </div>`;
  }

  async function renderHome(){
    const app=document.querySelector('#app');if(!app)return;
    const row=await loadStatus();
    app.innerHTML=`<div class="module-home">
      <div class="module-home-head">
        <div><h2>WP / Seguradora</h2><p>ORDENS WHIRLPOOL E SEGURADORA IMPORTADAS</p></div>
        <div class="module-head-actions"><button class="secondary" id="vxWpPortalBack">← Voltar</button></div>
      </div>
      ${row?renderConnectedPanel(row):`
        <div class="module-summary">
          <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>TOTAL NA FILA</span><b>—</b></button>
          <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>AGUARDANDO CONEXÃO</span><b>—</b></button>
          <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>JÁ IMPORTADAS</span><b>—</b></button>
          <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>ÚLTIMA EXECUÇÃO</span><b>—</b></button>
        </div>
        <div class="vx-wpp-empty">
          <span class="vx-wpp-empty-icon">◷</span>
          <h3>Executor Whirlpool ainda não conectado a esta empresa</h3>
          <p>Este painel já está pronto pra mostrar status, fila e permitir sincronização manual assim que o executor externo gravar a primeira linha em whirlpool_sync_status pra esta empresa. Nenhum número acima é inventado enquanto isso.</p>
        </div>`}
    </div>`;
    document.getElementById('vxWpPortalBack').onclick=()=>{stopPoll();const v=state.__vxWpPrevView||'dashboard';state.__vxWpPrevView=null;window.render(v)};
    const syncBtn=document.getElementById('vxWpSyncNow');
    if(syncBtn){
      syncBtn.onclick=async()=>{
        if(syncBtn.disabled)return;
        syncBtn.disabled=true;
        try{
          await api('rpc/request_whirlpool_manual_sync',{method:'POST',body:JSON.stringify({p_company_id:state.profile.active_company_id})});
          toast?.('Sincronização solicitada -- o executor deve iniciar em instantes.');
          await renderHome();
          startPollIfRunning();
        }catch(e){toast?.(e.message,'err');syncBtn.disabled=false;}
      };
    }
    startPollIfRunning(row);
  }

  // Enquanto is_running=true, atualiza sozinho a cada poucos segundos --
  // sem isso o GESTOR só veria o resultado dando F5 na mão.
  function startPollIfRunning(row){
    stopPoll();
    if(row?.is_running){
      pollTimer=setInterval(()=>{renderHome().catch(()=>{});},POLL_MS);
    }
  }

  async function renderPage(){
    // Achado do usuário (2026-09-15): setar state.view aqui é necessário
    // pro botão/gesto de voltar do Android funcionar (mobile-back-nav-
    // v1.js só registra uma entrada de histórico quando state.view muda
    // de verdade dentro de um window.render) -- só NÃO pode ser lido de
    // volta pelo botão "← Voltar" em tela (por isso o botão usa
    // state.__vxWpPrevView, guardado ANTES de sobrescrever, nunca
    // state.view em si).
    installStyle();
    if(!state.__vxWpPrevView)state.__vxWpPrevView=state.view;
    state.view=VIEW;
    const title=document.querySelector('#title');if(title)title.textContent='WP / Seguradora';
    await renderHome();
  }

  const priorRender=window.render;
  window.render=function(view){
    if(view!==VIEW)stopPoll();
    if(view===VIEW)return renderPage();
    return priorRender.apply(this,arguments);
  };

  installStyle();
})();
