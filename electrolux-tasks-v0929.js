/* VoxAssist Web — Electrolux: Tarefas (tasks) do backend Vox Analytics.
   Módulo isolado (nunca edita electrolux-reports-v0813.js além do botão
   de entrada) -- mesmo padrão já usado por electrolux-nps-v0826.js
   (window.vxOpenNpsScreen): expõe window.vxOpenElectroluxTasks() e troca
   #app diretamente, "Voltar" chama window.render('electrolux') que já
   reconstrói a Home do módulo Electrolux.

   Duas rotas novas do backend (Vox Analytics), atrás do MESMO proxy já
   existente (supabase/functions/electrolux-proxy) -- o navegador nunca
   fala com o backend Electrolux direto, e a allowlist de paths ali
   precisa ser atualizada (ver comentário no proprio index.ts) senão toda
   chamada daqui volta 400 path_not_allowed:
     GET /api/dashboard/tasks/pending     -- "Não iniciado", tipo "Serviço
                                              Autorizado", da nossa assistência
     GET /api/dashboard/tasks/assistance  -- criadas por e atribuídas à
                                              nossa assistência

   Formato dos dados (2026-09-29): NÃO documentado, e sem acesso de rede
   pra chamar o backend real a partir deste ambiente de desenvolvimento
   pra confirmar. Os nomes de campo abaixo (svoNumber/clientName/
   productName/claimedDefect/orderType/status/createdDate) são os MESMOS
   já confirmados de verdade em GET /api/dashboard/service-orders (ver
   fetchServiceOrders() em electrolux-reports-v0813.js, cujo retorno é
   usado sem nenhuma camada de tradução -- elx.orders=await
   fetchServiceOrders() direto) -- mesma origem/backend, e uma "tarefa"
   tipo Serviço Autorizado É, na prática, uma SVO. NUNCA finja certeza:
   cada linha tem "Ver JSON" mostrando o objeto bruto inteiro, então
   nenhum campo real fica escondido mesmo se a suposição abaixo errar
   algum nome -- só ajustar TASK_FIELDS depois de confirmar com uma
   chamada real (ex.: abrir esta tela em produção e olhar "Ver JSON"). */
(function(){
  function getJson(path){
    return fetch(CFG.url+'/functions/v1/electrolux-proxy?path='+encodeURIComponent(path),{cache:'no-store',headers:authHeaders(false)})
      .catch(()=>{throw new Error('Não foi possível conectar ao Electrolux (proxy VoxAssist fora do ar).');})
      .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status+' em '+path);return r.json();});
  }
  function qs(params){
    const entries=Object.entries(params||{}).filter(([,v])=>v!==null&&v!==undefined&&v!=='');
    if(!entries.length)return'';
    return '?'+entries.map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');
  }
  const fetchPendingTasks=params=>getJson('/api/dashboard/tasks/pending'+qs(params));
  const fetchAssistanceTasks=params=>getJson('/api/dashboard/tasks/assistance'+qs(params));

  const TABS=[
    {key:'pending',label:'Pendentes',fetch:fetchPendingTasks,desc:'Tasks "Não iniciado", tipo Serviço Autorizado, atribuídas à nossa assistência.'},
    {key:'assistance',label:'Da assistência',fetch:fetchAssistanceTasks,desc:'Tasks criadas por e atribuídas à nossa assistência.'},
  ];

  let st={tab:'pending',page:1,pageSize:15,order:'desc',loading:false,error:null,items:[],raw:null,expanded:null,tracking:{}};

  function installStyle(){
    if(document.getElementById('vxElxTasksStyle'))return;
    const s=document.createElement('style');
    s.id='vxElxTasksStyle';
    s.textContent=`
      .vx-elxt-tabs{display:flex;gap:4px;background:#eef1f5;border-radius:9px;padding:4px;margin-bottom:12px;width:fit-content}
      .vx-elxt-tabs button{border:0;border-radius:6px;padding:8px 16px;font-size:12.5px;font-weight:800;background:transparent;color:#58708d;cursor:pointer}
      .vx-elxt-tabs button.active{background:#0c2340;color:#fff}
      .vx-elxt-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      .vx-elxt-toolbar select{border:1px solid #cad3dc;border-radius:6px;padding:6px 8px;font-size:12px}
      .vx-elxt-toolbar button{border:1px solid #cad3dc;border-radius:6px;padding:7px 12px;font-size:12px;font-weight:700;background:#fff;color:#0c2340;cursor:pointer}
      .vx-elxt-toolbar button:disabled{opacity:.45;cursor:default}
      .vx-elxt-pager{display:flex;align-items:center;gap:8px;margin-left:auto;font-size:12px;color:#516375}
      .vx-elxt-json{background:#0c2340;color:#d6e4f5;font-size:11px;padding:10px;border-radius:8px;overflow:auto;max-height:320px;white-space:pre-wrap;word-break:break-word}
      .vx-elxt-json-row td{padding:0!important}
      .vx-elxt-json-wrap{padding:10px 14px}
      .vx-elxt-toggle{background:none;border:0;color:#1876d2;font-size:11.5px;font-weight:700;cursor:pointer;padding:0}
      .vx-elxt-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:7px;border-radius:10px;background:#cf3542;color:#fff;font-size:10px;font-weight:900;line-height:1;vertical-align:middle;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
      .vx-elxt-table-wrap{width:100%;max-width:100%;overflow:hidden;background:#fff;border:1px solid #dde5ee;border-radius:14px;box-shadow:0 3px 14px rgba(12,35,64,.05)}
      .vx-elxt-table-wrap .desktop-table{border-collapse:separate;border-spacing:0}
      .vx-elxt-table{width:100%;max-width:100%;table-layout:fixed;border:0!important}
      .vx-elxt-table thead th{background:#f7f9fc!important;color:#718096!important;border:0!important;border-bottom:1px solid #e4eaf1!important;padding:11px 14px!important;font-size:10px!important;font-weight:800!important;letter-spacing:.055em;text-align:left}
      .vx-elxt-table tbody td{border:0!important;border-bottom:1px solid #edf1f5!important;padding:13px 14px!important;vertical-align:middle;color:#27384a;font-size:12px}
      .vx-elxt-table tbody tr:last-child td{border-bottom:0!important}
      .vx-elxt-table th,.vx-elxt-table td{overflow:hidden}
      .vx-elxt-desc-cell{width:38%}
      .vx-elxt-desc-preview{display:block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .vx-elxt-desc-btn{display:block;width:100%;text-align:left;background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;overflow:hidden}
      .vx-elxt-desc-full{white-space:pre-wrap;word-break:break-word;line-height:1.45;color:#33475b;padding:12px 14px;background:#f7f9fb}
      .vx-elxt-case{white-space:nowrap}
      .vx-elxt-task-row{cursor:pointer;background:#fff;transition:background .15s ease,box-shadow .15s ease}
      .vx-elxt-task-row:hover{background:#f8fbff}
      .vx-elxt-task-row:hover td:first-child{box-shadow:inset 3px 0 0 #2f80ed}
      .vx-elxt-task-id{font-weight:850;color:#102a43;letter-spacing:.01em}
      .vx-elxt-case{font-weight:800;color:#2f80ed}
      .vx-elxt-subject{font-weight:750;color:#243b53}
      .vx-elxt-created{color:#718096;font-size:11px;white-space:nowrap}
      .vx-elxt-status{display:inline-flex;align-items:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800;color:#8a5a00;background:#fff6dc;border:1px solid #f4df9b;border-radius:999px;padding:5px 9px;font-size:10px}
      .vx-elxt-status:before{content:'';width:6px;height:6px;border-radius:50%;background:#e2a100;margin-right:6px;flex:0 0 auto}
      .vx-elxt-ack{margin-top:10px;border:0;border-radius:6px;padding:7px 12px;background:#0c2340;color:#fff;font-size:11px;font-weight:800;cursor:pointer}
      .vx-elxt-ack:disabled{opacity:.5;cursor:default}
      .vx-elxt-new{display:inline-block;margin-left:7px;padding:3px 6px;border-radius:999px;background:#eaf3ff;color:#1769c2;font-size:8px;font-weight:900;letter-spacing:.04em}
      .vx-elxt-toolbar{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:8px 10px;margin-bottom:12px!important}
      .vx-elxt-toolbar select,.vx-elxt-toolbar button{height:34px;border-color:#dce4ed!important;border-radius:8px!important}
      .vx-elxt-pager button{background:#fff!important}
      .vx-elxt-pager span{font-weight:700;color:#60728a}
      .vx-elxt-desc-full{border-top:0!important;background:#f8fafc!important;padding:16px 20px!important}
      .vx-elxt-detail-label{font-size:9px;font-weight:900;letter-spacing:.07em;color:#8a9aad;text-transform:uppercase;margin-bottom:4px}
      .vx-elxt-detail-subject{font-size:13px;font-weight:800;color:#243b53;margin-bottom:8px}
      .vx-elxt-detail-text{font-size:12px;line-height:1.55;color:#52667a}
    `;
    document.head.appendChild(s);
  }

  function esc2(v){return typeof esc==='function'?esc(v):String(v??'');}
  const dtFull=v=>{if(!v)return'—';const d=new Date(v);return isNaN(d)?String(v):d.toLocaleString('pt-BR');};

  // Melhor palpite pros campos, baseado no formato REAL já confirmado de
  // /api/dashboard/service-orders (mesmo backend). Sempre com fallback --
  // nunca deixa a linha em branco se o nome vier diferente, e "Ver JSON"
  // sempre mostra a verdade completa ao lado.
  function fieldsFor(t){
    return {
      tarefa:t.taskNumber||t.id||'—',
      caso:t.what?.name||'—',
      assunto:t.subject||t.subjectToLabel||'—',
      descricao:t.description||'—',
      status:t.statusToLabel||t.status||'—',
      tipo:t.recordType?.name||t.orderType||t.taskType||t.type||'—',
      criada:t.createdDate||t.createdAt||t.CreatedDate||null,
    };
  }

  async function currentCompanyId(){
    const {data,error}=await sb.rpc('current_company_id');
    if(error)throw error;
    return data;
  }
  async function syncTracking(items){
    if(!items?.length)return;
    const companyId=await currentCompanyId();
    const rows=items.map(t=>({
      company_id:companyId,
      external_task_id:taskIdentity(t),
      task_number:t.taskNumber||null,
      case_number:t.what?.name||null,
      subject:t.subject||t.subjectToLabel||null,
      external_created_at:t.createdDate||null
    })).filter(x=>x.external_task_id);
    if(rows.length){
      const {error}=await sb.from('electrolux_task_tracking').upsert(rows,{onConflict:'company_id,external_task_id',ignoreDuplicates:true});
      if(error)throw error;
    }
    await refreshTracking();
  }
  async function refreshTracking(){
    const companyId=await currentCompanyId();
    const {data,error}=await sb.from('electrolux_task_tracking').select('id,external_task_id,acknowledged_at,acknowledged_by,first_seen_at').eq('company_id',companyId);
    if(error)throw error;
    st.tracking=Object.fromEntries((data||[]).map(x=>[x.external_task_id,x]));
    return data||[];
  }
  async function markViewed(t){
    const track=st.tracking[taskIdentity(t)]; if(!track)return;
    const {data:{user}}=await sb.auth.getUser(); if(!user)return;
    const {data:old}=await sb.from('electrolux_task_views').select('id,view_count').eq('task_tracking_id',track.id).eq('user_id',user.id).maybeSingle();
    if(old){
      await sb.from('electrolux_task_views').update({last_viewed_at:new Date().toISOString(),view_count:(old.view_count||0)+1}).eq('id',old.id);
    }else{
      await sb.from('electrolux_task_views').insert({task_tracking_id:track.id,user_id:user.id});
    }
  }
  async function acknowledgeTask(t){
    const track=st.tracking[taskIdentity(t)]; if(!track)return;
    const {data:{user}}=await sb.auth.getUser(); if(!user)return;
    const {error}=await sb.from('electrolux_task_tracking').update({acknowledged_at:new Date().toISOString(),acknowledged_by:user.id,updated_at:new Date().toISOString()}).eq('id',track.id).is('acknowledged_at',null);
    if(error)throw error;
    await refreshTracking(); await refreshSharedBadge(); render();
  }

  async function load(){
    st.loading=true;st.error=null;
    render();
    const tabDef=TABS.find(x=>x.key===st.tab);
    try{
      const data=await tabDef.fetch({page:st.page,pageSize:st.pageSize,orderBy:'CreatedDate',order:st.order});
      st.raw=data;
      // Formato de paginação também não documentado -- aceita tanto um
      // array puro quanto {items:[...]}/{data:[...]}/{results:[...]},
      // sem exigir um formato só.
      st.items=Array.isArray(data)?data:(data?.records||data?.items||data?.data||data?.results||[]);
      if(st.tab==='pending')await syncTracking(st.items); else await refreshTracking();
      st.error=null;
    }catch(e){
      st.error=e.message||'Falha ao carregar tarefas.';
      st.items=[];
    }
    st.loading=false;
    render();
  }

  function totalHint(){
    const d=st.raw;
    if(!d||Array.isArray(d))return null;
    const n=d.total??d.totalCount??d.totalItems??d.count??null;
    return typeof n==='number'?n:null;
  }

  function render(){
    const app=document.querySelector('#app');if(!app)return;
    const tabDef=TABS.find(x=>x.key===st.tab);
    const total=totalHint();
    const hasNext=total!=null?(st.page*st.pageSize)<total:st.items.length>=st.pageSize;
    app.innerHTML=`<div class="vx-elx-page">
      <div class="vx-elx-board-head">
        <div><button type="button" class="vx-elx-back" id="vxElxTasksBack">← VOLTAR</button><h2>Tarefas Electrolux</h2></div>
        <span style="color:#60728a;font-size:11px">${esc2(tabDef.desc)}</span>
      </div>
      <div class="vx-elxt-tabs">
        ${TABS.map(t=>`<button type="button" data-tab="${t.key}" class="${st.tab===t.key?'active':''}">${esc2(t.label)}</button>`).join('')}
      </div>
      <div class="vx-elx-error" style="display:${st.error?'block':'none'}">${st.error?esc2(st.error)+' <button type="button" id="vxElxTasksRetry" class="vx-elxt-toggle" style="color:#a63131;text-decoration:underline">Tentar de novo</button>':''}</div>
      <div class="vx-elxt-toolbar">
        <label style="font-size:12px;color:#516375">Por página
          <select id="vxElxTasksPageSize">${[15,30,50,100].map(n=>`<option value="${n}" ${n===st.pageSize?'selected':''}>${n}</option>`).join('')}</select>
        </label>
        <button type="button" id="vxElxTasksOrder">Criação: ${st.order==='desc'?'mais recentes primeiro ▾':'mais antigas primeiro ▴'}</button>
        <div class="vx-elxt-pager">
          <button type="button" id="vxElxTasksPrev" ${st.page<=1?'disabled':''}>← Anterior</button>
          <span>Página ${st.page}${total!=null?' de '+Math.max(1,Math.ceil(total/st.pageSize)):''}</span>
          <button type="button" id="vxElxTasksNext" ${hasNext?'':'disabled'}>Próxima →</button>
        </div>
      </div>
      <div id="vxElxTasksBody">${bodyHtml()}</div>
    </div>`;

    document.getElementById('vxElxTasksBack').onclick=()=>window.render('electrolux');
    app.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
      if(st.tab===b.dataset.tab)return;
      st.tab=b.dataset.tab;st.page=1;st.expanded=null;load();
    });
    document.getElementById('vxElxTasksRetry')?.addEventListener('click',load);
    document.getElementById('vxElxTasksPageSize').onchange=e=>{st.pageSize=Number(e.target.value)||15;st.page=1;load();};
    document.getElementById('vxElxTasksOrder').onclick=()=>{st.order=st.order==='desc'?'asc':'desc';st.page=1;load();};
    document.getElementById('vxElxTasksPrev').onclick=()=>{if(st.page>1){st.page--;load();}};
    document.getElementById('vxElxTasksNext').onclick=()=>{if(hasNext){st.page++;load();}};
    wireBodyToggles();
  }

  function wireBodyToggles(){
    document.querySelectorAll('#vxElxTasksBody [data-expand]').forEach(b=>{
      b.onclick=(e)=>{
        e.preventDefault();e.stopPropagation();
        st.expanded=st.expanded===b.dataset.expand?null:b.dataset.expand;
        document.getElementById('vxElxTasksBody').innerHTML=bodyHtml();
        wireBodyToggles();
      };
    });
    document.querySelectorAll('#vxElxTasksBody [data-row-expand]').forEach(row=>{
      row.onclick=()=>{
        const item=st.items[Number(row.dataset.itemIndex)]; if(item)markViewed(item).catch(()=>{});
        st.expanded=st.expanded===row.dataset.rowExpand?null:row.dataset.rowExpand;
        document.getElementById('vxElxTasksBody').innerHTML=bodyHtml();
        wireBodyToggles();
      };
    });
    document.querySelectorAll('#vxElxTasksBody [data-ack-index]').forEach(b=>{
      b.onclick=async(e)=>{
        e.preventDefault();e.stopPropagation();
        b.disabled=true;
        try{await acknowledgeTask(st.items[Number(b.dataset.ackIndex)]);}
        catch(err){b.disabled=false;alert('Não foi possível marcar como ciente: '+(err.message||err));}
      };
    });
  }

  function bodyHtml(){
    if(st.loading)return '<div class="vx-elx-empty-board">Carregando tarefas…</div>';
    if(st.error)return '<div class="vx-elx-empty-board">Não foi possível carregar. Use "Tentar de novo" acima.</div>';
    if(!st.items.length){
      // Achado do usuário (2026-09-29): a chamada parou de dar erro (proxy
      // já publicado), mas continuou sem mostrar nenhuma tarefa -- sem
      // saber ainda se é porque não há tarefa mesmo ou porque a resposta
      // real usa um formato diferente do que Array.isArray/.items/.data/
      // .results cobrem. Em vez de adivinhar de novo, mostra a resposta
      // bruta aqui mesmo -- um print desta tela já mostra o formato real
      // pra eu corrigir fieldsFor()/o parsing de paginação sem chute.
      const rawInfo=st.raw!=null?`<div style="margin-top:14px;text-align:left;max-width:860px;margin-left:auto;margin-right:auto">
        <small style="color:#8494a6">Resposta bruta do backend (pra conferência caso devesse ter tarefa aqui):</small>
        <pre class="vx-elxt-json" style="margin-top:6px">${esc2(JSON.stringify(st.raw,null,2))}</pre>
      </div>`:'';
      return `<div class="vx-elx-empty-board">Nenhuma tarefa encontrada nesta situação.</div>${rawInfo}`;
    }
    return `<div class="desktop-table-wrap vx-elxt-table-wrap"><table class="desktop-table vx-elxt-table"><thead><tr>
      <th style="width:11%">TAREFA</th><th style="width:9%">CASO</th><th style="width:16%">ASSUNTO</th><th class="vx-elxt-desc-cell">DESCRIÇÃO</th><th style="width:12%">CRIADA EM</th><th style="width:11%">STATUS</th>
      </tr></thead><tbody>${st.items.map((t,i)=>{
        const f=fieldsFor(t);
        const id='row'+i;
        const open=st.expanded===id;
        const track=st.tracking[taskIdentity(t)];
        const isNew=!!track&&!track.acknowledged_at;
        return `<tr class="vx-elxt-task-row" data-row-expand="${id}" data-item-index="${i}" title="Clique para ${open?'recolher':'ver os detalhes completos'}">
          <td><span class="vx-elxt-task-id">${esc2(f.tarefa)}</span>${isNew?'<span class="vx-elxt-new">NOVA</span>':''}</td>
          <td><span class="vx-elxt-case">${esc2(f.caso)}</span></td>
          <td><span class="vx-elxt-desc-preview vx-elxt-subject" title="${esc2(f.assunto)}">${esc2(f.assunto)}</span></td>
          <td class="vx-elxt-desc-cell"><button type="button" class="vx-elxt-desc-btn" data-expand="${id}" title="Clique para ${open?'recolher':'ver a descrição completa'}"><span class="vx-elxt-desc-preview">${esc2(f.descricao)}</span></button></td>
          <td><span class="vx-elxt-created">${esc2(dtFull(f.criada))}</span></td>
          <td><span class="vx-elxt-status">${esc2(f.status)}</span></td>
        </tr>${open?`<tr class="vx-elxt-json-row"><td colspan="6"><div class="vx-elxt-desc-full"><div class="vx-elxt-detail-label">Detalhes da tarefa</div><div class="vx-elxt-detail-subject">${esc2(f.assunto)}</div><div class="vx-elxt-detail-text">${esc2(f.descricao)}</div>${isNew?`<br><button type="button" class="vx-elxt-ack" data-ack-index="${i}">✓ Ciente</button>`:''}</div></td></tr>`:''}`;
      }).join('')}</tbody></table></div>`;
  }

  // Achado do usuário (2026-09-29): a tela abria vazia e voltava sozinha
  // pra Home do Electrolux em segundos -- mesma causa raiz já documentada
  // pro NPS (electrolux-nps-v0826.js): o poll de 15s de
  // electrolux-reports-v0813.js (rerender -> renderHome quando
  // elx.screen não é 'board'/'closed') continuava rodando por baixo e
  // reconstruía #app com a Home de novo. "Voltar" já chama
  // window.render('electrolux') -> renderPage() -> startPoll() de novo,
  // então só precisa parar aqui na entrada, igual o NPS já faz.
  window.vxOpenElectroluxTasks=function(){
    window.vxElxStopPoll?.();
    installStyle();
    st.tab='pending';st.page=1;st.pageSize=15;st.order='desc';st.expanded=null;
    load();
    markSeenNow();
  };

  /* ---------- Indicador de "chegou tarefa nova" no botão TAREFAS ----------
     Só cobre a aba Pendentes (é a fila que realmente precisa de ação).
     Assinatura = JSON da tarefa mais recente (page 1, pageSize 1, ordenada
     por CreatedDate desc) -- não depende de acertar o nome exato de nenhum
     campo, só de ela ter mudado desde a última vez que o usuário abriu a
     tela. Guardado em localStorage (por navegador/dispositivo, não por
     empresa -- suficiente pro aviso visual, sem exigir uma tabela nova). */
  let newCount=0;
  function taskIdentity(t){return String(t?.id||t?.taskNumber||t?.createdDate||'');}
  async function latestPendingTasks(){
    const data=await fetchPendingTasks({page:1,pageSize:100,orderBy:'CreatedDate',order:'desc'});
    return Array.isArray(data)?data:(data?.records||data?.items||data?.data||data?.results||[]);
  }
  async function refreshSharedBadge(){
    try{
      const items=await latestPendingTasks();
      await syncTracking(items);
      newCount=Object.values(st.tracking).filter(x=>!x.acknowledged_at).length;
      paintBadge();
    }catch(_e){/* mantém badge anterior em falha de rede */}
  }
  async function markSeenNow(){await refreshSharedBadge();}
  async function checkForNew(){await refreshSharedBadge();}
  function paintBadge(){
    const btn=document.getElementById('vxElxTasksBtn');if(!btn)return;
    let badge=btn.querySelector('.vx-elxt-badge');
    if(newCount>0){
      installStyle();
      if(!badge){badge=document.createElement('span');badge.className='vx-elxt-badge';btn.appendChild(badge);}
      badge.textContent=newCount>99?'99+':String(newCount);
      badge.title=newCount===1?'1 tarefa nova aguardando ciência':newCount+' tarefas novas aguardando ciência';
    }else badge?.remove();
  }

  new MutationObserver(()=>paintBadge()).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForNew();});
  setTimeout(checkForNew,4000);
  setInterval(checkForNew,2*60*1000);
})();
