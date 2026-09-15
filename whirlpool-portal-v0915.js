/* VoxAssist Web — módulo Whirlpool (painel de status + sincronização
   manual). Réplica do padrão isolado já comprovado em
   electrolux-reports-v0813.js (NUNCA tocado por este arquivo -- mesma
   disciplina de módulo isolado): view própria, wrap de window.render
   (nunca edita app.js).

   Achado do usuário (2026-09-15): diferente do Electrolux (item de
   menu próprio no sidebar), este módulo é acessado como CARD "WP / SEG"
   dentro do hub Atendimento (all-menus-layout.js -- data-target=
   "whirlpool-portal", ver openTarget()).

   Reconciliação (2026-09-15): este arquivo antes criava uma tabela e
   RPC próprias (whirlpool_sync_status/request_whirlpool_manual_sync)
   sem saber que já existia, em origin/main, um executor Whirlpool real
   e muito mais completo (whirlpool_connections/import_queue, RPCs
   whirlpool_connection_admin_status/worker_claim/worker_report, robô
   Playwright em workers/whirlpool/, cron via GitHub Actions). Depois de
   mesclar main, este painel foi reconstruído consumindo esse schema
   real -- mesma RPC de leitura já usada por settings-whirlpool-v1.js
   (tela de administração/credenciais em Configurações > Integrações,
   que este arquivo nunca duplica nem substitui).

   "Sincronizar agora" chama whirlpool_request_manual_sync, que só zera
   next_retry_at (nunca ignora CREDENCIAIS_INVALIDAS/PAUSADO/worker em
   lock) -- não existe forma de disparar o worker instantaneamente
   (ele só roda via cron do GitHub Actions a cada ~15min), então a
   cópia da tela é honesta sobre isso: "libera a próxima tentativa",
   nunca "sincronizando agora". */
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
      .vx-wpp-panel{background:#fff;border:1px solid #cfd7e1;border-radius:8px;padding:16px 18px;margin-top:4px}
      .vx-wpp-status-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      .vx-wpp-badge{display:inline-block;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800;text-transform:uppercase}
      .vx-wpp-badge.ok{background:#e7f6ee;color:#0b6f3c}
      .vx-wpp-badge.warn{background:#fdf3e3;color:#a35b00}
      .vx-wpp-badge.crit{background:#fbeaea;color:#a63131}
      .vx-wpp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px 16px;margin-bottom:12px}
      .vx-wpp-grid div{display:flex;flex-direction:column;gap:2px}
      .vx-wpp-grid span{font-size:10px;font-weight:800;color:#8494a6;text-transform:uppercase;letter-spacing:.3px}
      .vx-wpp-grid b{font-size:13px;color:#172033}
      .vx-wpp-error{background:#fbeaea;color:#a63131;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;margin-bottom:12px}
      .vx-wpp-locked{font-size:11.5px;font-weight:700;color:#8494a6;margin-left:8px}
      .vx-wpp-hint{font-size:11.5px;color:#8494a6;margin-top:10px}
    `;
    document.head.appendChild(s);
  }

  function isGestor(){return String(state?.profile?.role||'').toUpperCase()==='GESTOR';}
  const dtFull=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const LABELS={
    NAO_CONFIGURADO:'NÃO CONFIGURADO',PRONTO:'PRONTO',
    CONECTADO:'CONECTADO',CREDENCIAIS_INVALIDAS:'CREDENCIAIS INVÁLIDAS',
    AGUARDANDO_CONEXAO_WHIRLPOOL:'AGUARDANDO WHIRLPOOL',PAUSADO:'PAUSADO'
  };

  async function loadStatus(){
    const cid=state?.profile?.active_company_id;
    if(!cid)return null;
    const rows=await api('rpc/whirlpool_connection_admin_status',{method:'POST',body:JSON.stringify({p_company_id:cid})}).catch(()=>null);
    return Array.isArray(rows)&&rows.length?rows[0]:null;
  }

  function statusBadge(row){
    const st=String(row.connection_status||'');
    if(st==='CREDENCIAIS_INVALIDAS')return `<span class="vx-wpp-badge crit">${esc(LABELS[st]||st)}</span>`;
    if(st==='PAUSADO'||st==='NAO_CONFIGURADO'||st==='AGUARDANDO_CONEXAO_WHIRLPOOL')return `<span class="vx-wpp-badge warn">${esc(LABELS[st]||st)}</span>`;
    return `<span class="vx-wpp-badge ok">${esc(LABELS[st]||st)}</span>`;
  }

  function blockReason(row){
    const st=String(row.connection_status||'');
    if(st==='NAO_CONFIGURADO')return 'Conexão ainda não configurada -- cadastre as credenciais em Configurações > Integrações.';
    if(st==='CREDENCIAIS_INVALIDAS')return 'Credenciais inválidas -- atualize a senha em Configurações > Integrações antes de sincronizar.';
    if(st==='PAUSADO')return 'Robô pausado -- retome em Configurações > Integrações antes de sincronizar.';
    return '';
  }

  function renderConnectedPanel(row){
    const blocked=blockReason(row);
    const lastScan=[row.last_incremental_scan_at,row.last_full_scan_at].filter(Boolean).sort().pop();
    return `<div class="module-summary">
        <button type="button" class="module-summary-card" style="--accent:#e87a00" disabled><span>AGUARDANDO IMPORTAÇÃO</span><b>${Number(row.pending_imports||0)}</b></button>
        <button type="button" class="module-summary-card" style="--accent:#a63131" disabled><span>AGUARDANDO CONEXÃO</span><b>${Number(row.waiting_connection_imports||0)}</b></button>
        <button type="button" class="module-summary-card" style="--accent:${row.worker_online?'#13904b':'#8494a6'}" disabled><span>EXECUTOR</span><b>${row.worker_online?'Ativo':'Offline'}</b></button>
        <button type="button" class="module-summary-card" style="--accent:#7650d6" disabled><span>ÚLTIMA VARREDURA</span><b>${dtFull(lastScan)}</b></button>
      </div>
      <div class="vx-wpp-panel">
        <div class="vx-wpp-status-row">
          ${statusBadge(row)}
          ${isGestor()?`<button type="button" class="primary" id="vxWpSyncNow" ${blocked?'disabled':''}>↻ SINCRONIZAR AGORA</button>${blocked?`<span class="vx-wpp-locked">${esc(blocked)}</span>`:''}`:''}
        </div>
        ${row.last_error_code?`<div class="vx-wpp-error">Último erro: ${esc(row.last_error_code)} (${dtFull(row.last_error_at)})</div>`:''}
        <div class="vx-wpp-grid">
          <div><span>Filial</span><b>${esc(row.filial||'—')}</b></div>
          <div><span>Última autenticação</span><b>${dtFull(row.last_auth_at)}</b></div>
          <div><span>Tentativas de reconexão</span><b>${Number(row.portal_retry_count||0)}</b></div>
          <div><span>Próxima tentativa automática</span><b>${dtFull(row.next_retry_at)}</b></div>
        </div>
        <div class="vx-wpp-hint">O robô roda pelo cron do GitHub Actions a cada ~15 minutos. "Sincronizar agora" libera essa janela imediatamente em vez de esperar o intervalo de nova tentativa -- não força uma execução instantânea.</div>
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
          <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>AGUARDANDO IMPORTAÇÃO</span><b>—</b></button>
          <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>AGUARDANDO CONEXÃO</span><b>—</b></button>
          <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>EXECUTOR</span><b>—</b></button>
          <button type="button" class="module-summary-card" style="--accent:#8494a6" disabled><span>ÚLTIMA VARREDURA</span><b>—</b></button>
        </div>
        <div class="vx-wpp-empty">
          <span class="vx-wpp-empty-icon">◷</span>
          <h3>Nenhuma conexão Whirlpool cadastrada para esta empresa</h3>
          <p>Este painel mostra status, fila e permite sincronização manual assim que houver uma conexão Whirlpool configurada.${isGestor()?' Cadastre em Configurações > Integrações.':''}</p>
        </div>`}
    </div>`;
    document.getElementById('vxWpPortalBack').onclick=()=>{const v=state.__vxWpPrevView||'dashboard';state.__vxWpPrevView=null;window.render(v)};
    const syncBtn=document.getElementById('vxWpSyncNow');
    if(syncBtn&&row){
      syncBtn.onclick=async()=>{
        if(syncBtn.disabled)return;
        syncBtn.disabled=true;
        try{
          const res=await api('rpc/whirlpool_request_manual_sync',{method:'POST',body:JSON.stringify({p_connection_id:row.id})});
          toast?.(res?.already_running?'Uma sincronização já está em andamento.':'Solicitação registrada -- a próxima tentativa automática deve ocorrer em minutos.');
          await renderHome();
        }catch(e){toast?.(e.message,'err');syncBtn.disabled=false;}
      };
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
    if(view===VIEW)return renderPage();
    return priorRender.apply(this,arguments);
  };

  installStyle();
})();
