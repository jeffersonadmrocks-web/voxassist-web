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
     GET /api/dashboard/tasks             -- aba "Recebidas": todos os status
                                              (ou ?status=X), tipo "Serviço Autorizado"
     GET /api/dashboard/tasks/pending     -- só p/ o badge de novas: "Não iniciado", tipo "Serviço
                                              Autorizado", da nossa assistência
     GET /api/dashboard/tasks/assistance  -- aba "Enviadas": criadas por e atribuídas à
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
  // Recebidas = /api/dashboard/tasks (todos os status por padrão; `status` opcional).
  const fetchReceivedTasks=params=>getJson('/api/dashboard/tasks'+qs(params));

  // POST via electrolux-proxy (a allowlist só aceita /api/dashboard/tasks/{id}/reply com { answer }).
  function replyToTask(taskId,answer){
    return fetch(CFG.url+'/functions/v1/electrolux-proxy?path='+encodeURIComponent('/api/dashboard/tasks/'+encodeURIComponent(taskId)+'/reply'),
      {method:'POST',cache:'no-store',headers:authHeaders(true),body:JSON.stringify({answer})})
      .catch(()=>{throw new Error('Não foi possível conectar ao Electrolux (proxy VoxAssist fora do ar).');})
      .then(async r=>{
        if(!r.ok){
          const body=await r.json().catch(()=>null);
          throw new Error(body?.error||('HTTP '+r.status));
        }
        return r.json().catch(()=>({ok:true}));
      });
  }
  const REPLY_MAX=4000;

  /* ---------- Resposta já registrada na tarefa ----------
     GET /api/dashboard/tasks/{id}/answers -> { answer: string|null } (campo `answer` do detalhe
     da tarefa na Electrolux). Carrega sob demanda ao expandir e fica em cache até nova resposta. */
  const answersCache={}; // taskId -> {loading,error,answer}
  async function loadAnswers(task){
    const id=task?.id;if(!id)return;
    answersCache[id]={loading:true,error:null,answer:null};
    refreshAnswersBox(task);
    try{
      const data=await getJson('/api/dashboard/tasks/'+encodeURIComponent(id)+'/answers');
      answersCache[id]={loading:false,error:null,answer:data?.answer||null};
    }catch(e){answersCache[id]={loading:false,error:e.message||'Falha ao carregar a resposta.',answer:null};}
    // Re-renderiza o corpo inteiro: o campo "Responder tarefa" depende do resultado.
    const body=document.getElementById('vxElxTasksBody');
    if(body&&st.expanded){body.innerHTML=bodyHtml();wireBodyToggles();}
  }
  // Só libera responder depois de confirmar que a tarefa ainda não tem resposta
  // (carregando ou erro na consulta = escondido, para não sobrescrever uma existente).
  function replyOpen(t){
    const c=answersCache[t?.id];
    return canReply(t)&&!!c&&!c.loading&&!c.error&&!c.answer;
  }
  // Seção "Resposta" só existe quando há resposta (ou erro ao consultar); sem resposta, só o "Responder tarefa".
  function answerShown(t){
    const c=answersCache[t?.id];
    return !!c&&!c.loading&&(!!c.answer||!!c.error);
  }
  function answersHtml(task){
    const c=answersCache[task?.id];
    if(!c||c.loading)return '<div class="vx-elxt-answers-empty">Carregando respostas…</div>';
    if(c.error)return `<div class="vx-elxt-answers-empty" style="color:#a63131">Não foi possível carregar a resposta (${esc2(c.error)}). Feche e reabra a tarefa para tentar de novo.</div>`;
    if(!c.answer)return '<div class="vx-elxt-answers-empty">Nenhuma resposta registrada nesta tarefa.</div>';
    return `<div class="vx-elxt-answer"><div class="vx-elxt-answer-text">${esc2(c.answer)}</div></div>`;
  }
  function refreshAnswersBox(task){
    const box=document.getElementById('vxElxAnswers'+task.id);
    if(box)box.innerHTML=answersHtml(task);
  }

  const TABS=[
    {key:'received',label:'Recebidas',fetch:fetchReceivedTasks,desc:'Tasks do tipo Serviço Autorizado atribuídas à nossa assistência (todas ou por status).'},
    {key:'sent',label:'Enviadas',fetch:fetchAssistanceTasks,desc:'Tasks criadas por e atribuídas à nossa assistência.'},
  ];
  // Filtro de status da aba Recebidas ('' = todos, que é o padrão).
  const STATUS_OPTIONS=['Não iniciado','Em andamento','Concluído','Aguardando outra pessoa','Adiado'];
  const NOT_STARTED='Não iniciado';

  let st={tab:'received',status:'',page:1,pageSize:15,order:'desc',loading:false,error:null,items:[],raw:null,expanded:null,tracking:{},search:'',searching:false,searchResults:null};

  function installStyle(){
    if(document.getElementById('vxElxTasksStyle'))return;
    const s=document.createElement('style');
    s.id='vxElxTasksStyle';
    s.textContent=`
      .vx-elxt-tabs{display:flex;gap:22px;background:transparent;border-radius:0;padding:0;margin:2px 0 16px;width:fit-content;border-bottom:1px solid #e3e9f0}
      .vx-elxt-tabs button{position:relative}
      .vx-elxt-tabs button{border:0;border-radius:0;padding:9px 2px 10px;font-size:12px;font-weight:750;background:transparent;color:#708196;cursor:pointer}
      .vx-elxt-tabs button.active{background:transparent;color:#0c2340}
      .vx-elxt-tabs button.active:after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#2f80ed;border-radius:2px 2px 0 0}
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
      .vx-elxt-table tbody td{border:0!important;border-bottom:1px solid #edf1f5!important;padding:14px 14px!important;vertical-align:middle;color:#27384a;font-size:12px}
      .vx-elxt-table tbody tr.vx-elxt-task-row:nth-child(4n+3){background:#fcfdff}
      .vx-elxt-table tbody tr:last-child td{border-bottom:0!important}
      .vx-elxt-table th,.vx-elxt-table td{overflow:hidden}
      .vx-elxt-desc-cell{width:32%}
      .vx-elxt-desc-preview{display:block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .vx-elxt-description{color:#66788a;font-weight:450}
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
      .vx-elxt-status{display:inline-flex;align-items:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:750;color:#7a5b12;background:#fffaf0;border:1px solid #f2e5c4;border-radius:999px;padding:5px 9px;font-size:10px}
      .vx-elxt-status:before{content:'';width:6px;height:6px;border-radius:50%;background:#d69e2e;margin-right:6px;flex:0 0 auto}
      .vx-elxt-status.done{color:#146c3a;background:#e8f7ee;border-color:#b7e4c7}
      .vx-elxt-status.done:before{background:#22a861}
      .vx-elxt-reply{margin-top:14px;padding-top:12px;border-top:1px solid #e5ebf1}
      .vx-elxt-reply textarea{width:100%;box-sizing:border-box;min-height:74px;resize:vertical;border:1px solid #dce4ed;border-radius:8px;padding:9px 11px;font:inherit;font-size:12px;color:#243b53;background:#fff;outline:none}
      .vx-elxt-reply textarea:focus{border-color:#7bb1ee;box-shadow:0 0 0 3px rgba(47,128,237,.09)}
      .vx-elxt-reply-msg{font-size:11px;margin-top:6px;color:#a63131}
      .vx-elxt-answers{margin-top:14px;padding-top:12px;border-top:1px solid #e5ebf1}
      .vx-elxt-answers-empty{font-size:12px;line-height:1.55;color:#7b8da1}
      .vx-elxt-answer{margin:0}
      .vx-elxt-answer-meta{display:flex;gap:10px;align-items:baseline;font-size:10px;color:#7b8da1;margin-bottom:4px}
      .vx-elxt-answer-meta b{color:#42566d}
      .vx-elxt-answer-text{font-size:12px;line-height:1.55;color:#52667a;white-space:pre-wrap;word-break:break-word}
      .vx-elxt-answer-text code{font-size:11px}
      .vx-elxt-ack{margin-top:10px;border:0;border-radius:6px;padding:7px 12px;background:#0c2340;color:#fff;font-size:11px;font-weight:800;cursor:pointer}
      .vx-elxt-ack:disabled{opacity:.5;cursor:default}
      .vx-elxt-new{display:inline-block;margin-left:7px;padding:3px 6px;border-radius:999px;background:#eaf3ff;color:#1769c2;font-size:8px;font-weight:900;letter-spacing:.04em}
      .vx-elxt-toolbar{background:transparent;border:0;border-radius:0;padding:0;margin-bottom:12px!important}
      .vx-elxt-toolbar label{display:flex;align-items:center;gap:7px}
      .vx-elxt-toolbar select{background:#fff;color:#334e68;min-width:62px}
      #vxElxTasksOrder{background:#fff;box-shadow:0 1px 2px rgba(12,35,64,.03)}
      .vx-elxt-pager{background:#fff;border:1px solid #e3e9f0;border-radius:9px;padding:3px}
      .vx-elxt-pager button{border:0!important;height:30px!important;padding:0 10px!important}
      .vx-elxt-pager span{padding:0 6px;white-space:nowrap}
      .vx-elxt-toolbar select,.vx-elxt-toolbar button{height:34px;border-color:#dce4ed!important;border-radius:8px!important}
      .vx-elxt-pager button{background:#fff!important}
      .vx-elxt-pager span{font-weight:700;color:#60728a}
      .vx-elxt-desc-full{border-top:0!important;background:#f8fafc!important;padding:18px 22px 20px!important;box-shadow:inset 3px 0 0 #2f80ed}
      .vx-elxt-detail-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:start}
      .vx-elxt-detail-meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #e5ebf1}
      .vx-elxt-detail-meta span{font-size:10px;color:#7b8da1}
      .vx-elxt-detail-meta b{color:#42566d;font-weight:800}
      .vx-elxt-detail-label{font-size:9px;font-weight:900;letter-spacing:.07em;color:#8a9aad;text-transform:uppercase;margin-bottom:4px}
      .vx-elxt-detail-subject{font-size:13px;font-weight:800;color:#243b53;margin-bottom:8px}
      .vx-elxt-detail-text{font-size:12px;line-height:1.55;color:#52667a}
      .vx-elxt-searchbar{display:flex;align-items:center;gap:8px;flex:1;max-width:560px}
      .vx-elxt-searchbox{position:relative;flex:1}
      .vx-elxt-searchbox input{width:100%;height:36px;box-sizing:border-box;border:1px solid #dce4ed;border-radius:9px;background:#fff;padding:0 38px 0 34px;font-size:12px;color:#243b53;outline:none;transition:border-color .15s,box-shadow .15s}
      .vx-elxt-searchbox input:focus{border-color:#7bb1ee;box-shadow:0 0 0 3px rgba(47,128,237,.09)}
      .vx-elxt-search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#8496aa;font-size:14px;pointer-events:none}
      .vx-elxt-search-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:0!important;background:transparent!important;height:26px!important;padding:0 7px!important;color:#7b8da1!important;cursor:pointer}
      .vx-elxt-search-btn{height:36px!important;background:#0c2340!important;color:#fff!important;border:1px solid #0c2340!important;padding:0 15px!important}
      .vx-elxt-search-summary{font-size:11px;color:#60728a;font-weight:700;margin:0 0 10px 2px}
      .vx-elxt-source{display:inline-flex;margin-left:6px;padding:2px 6px;border-radius:999px;background:#f0f4f8;color:#65788c;font-size:8px;font-weight:800}
    `;
    document.head.appendChild(s);
  }

  function esc2(v){return typeof esc==='function'?esc(v):String(v??'');}
  const dtDue=v=>{
    if(!v)return'—';
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    if(m)return `${m[3]}/${m[2]}/${m[1]}`; // só data: evita deslocar o dia por fuso
    const d=new Date(v);return isNaN(d)?String(v):d.toLocaleString('pt-BR');
  };
  const isDone=label=>/conclu[ií]d/i.test(String(label||''));
  const isNotStarted=t=>String(fieldsFor(t).status).toLocaleLowerCase('pt-BR')===NOT_STARTED.toLocaleLowerCase('pt-BR');
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
      vencimento:t.dueDate||t.activityDate||t.ActivityDate||t.dueDateTime||t.dueAt||null,
    };
  }

  function rpc(name,body={}){
    return fetch(CFG.url+'/rest/v1/rpc/'+name,{method:'POST',headers:authHeaders(),body:JSON.stringify(body)})
      .then(async r=>{if(!r.ok)throw new Error((await r.text())||('HTTP '+r.status));const t=await r.text();return t?JSON.parse(t):null;});
  }
  async function currentCompanyId(){
    return rpc('current_company_id');
  }
  function userId(){
    return state?.session?.user?.id||state?.profile?.id||null;
  }
  async function syncTracking(items){
    if(!items?.length)return;
    const companyId=await currentCompanyId();
    const rows=items.map(t=>({
      company_id:companyId,external_task_id:taskIdentity(t),task_number:t.taskNumber||null,
      case_number:t.what?.name||null,subject:t.subject||t.subjectToLabel||null,
      external_created_at:t.createdDate||null
    })).filter(x=>x.external_task_id);
    if(rows.length){
      await api('electrolux_task_tracking?on_conflict=company_id,external_task_id',{
        method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows)
      });
    }
    await refreshTracking();
  }
  async function refreshTracking(){
    const companyId=await currentCompanyId();
    const data=await api('electrolux_task_tracking?company_id=eq.'+encodeURIComponent(companyId)+'&select=id,external_task_id,acknowledged_at,acknowledged_by,first_seen_at');
    st.tracking=Object.fromEntries((data||[]).map(x=>[x.external_task_id,x]));
    return data||[];
  }
  async function markViewed(t){
    const track=st.tracking[taskIdentity(t)],uid=userId(); if(!track||!uid)return;
    const old=await api('electrolux_task_views?task_tracking_id=eq.'+encodeURIComponent(track.id)+'&user_id=eq.'+encodeURIComponent(uid)+'&select=id,view_count&limit=1');
    if(old?.[0]){
      await api('electrolux_task_views?id=eq.'+encodeURIComponent(old[0].id),{
        method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({last_viewed_at:new Date().toISOString(),view_count:(old[0].view_count||0)+1})
      });
    }else{
      await api('electrolux_task_views',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({task_tracking_id:track.id,user_id:uid})});
    }
  }
  async function acknowledgeTask(t){
    const track=st.tracking[taskIdentity(t)],uid=userId(); if(!track||!uid)return;
    await api('electrolux_task_tracking?id=eq.'+encodeURIComponent(track.id)+'&acknowledged_at=is.null',{
      method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({acknowledged_at:new Date().toISOString(),acknowledged_by:uid,updated_at:new Date().toISOString()})
    });
    await refreshTracking(); await refreshSharedBadge(); render();
  }

  function taskSearchText(t){
    return [t?.id,t?.taskNumber,t?.what?.name,t?.subject,t?.subjectToLabel,t?.description,t?.status,t?.statusToLabel,t?.assignedTo?.assistanceName,t?.recordType?.name]
      .filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
  }
  async function fetchAllFrom(fetcher){
    const first=await fetcher({page:1,pageSize:100,orderBy:'CreatedDate',order:'desc'});
    const records=Array.isArray(first)?first:(first?.records||first?.items||first?.data||first?.results||[]);
    const totalPages=Array.isArray(first)?1:(first?.totalPages||Math.max(1,Math.ceil((first?.totalItems||first?.totalRecords||first?.total||records.length)/100)));
    const all=[...records];
    for(let page=2;page<=totalPages;page++){
      const d=await fetcher({page,pageSize:100,orderBy:'CreatedDate',order:'desc'});
      all.push(...(Array.isArray(d)?d:(d?.records||d?.items||d?.data||d?.results||[])));
    }
    return all;
  }
  async function runGlobalSearch(term){
    const q=String(term||'').trim();
    if(!q){st.search='';st.searchResults=null;st.searching=false;render();return;}
    st.search=q;st.searching=true;st.error=null;render();
    try{
      const [received,sent]=await Promise.all([fetchAllFrom(fetchReceivedTasks),fetchAllFrom(fetchAssistanceTasks)]);
      const seen=new Set(),merged=[];
      [...received.map(t=>({...t,__source:'Recebida'})),...sent.map(t=>({...t,__source:'Enviada'}))].forEach(t=>{
        const key=taskIdentity(t);if(!key||seen.has(key))return;seen.add(key);merged.push(t);
      });
      const needle=q.toLocaleLowerCase('pt-BR');
      st.searchResults=merged.filter(t=>taskSearchText(t).includes(needle));
      await syncTracking(received.filter(isNotStarted));
    }catch(e){st.error=e.message||'Falha ao pesquisar tarefas.';st.searchResults=[];}
    st.searching=false;render();
  }

  async function load(){
    st.loading=true;st.error=null;
    render();
    const tabDef=TABS.find(x=>x.key===st.tab);
    try{
      const params={page:st.page,pageSize:st.pageSize,orderBy:'CreatedDate',order:st.order};
      if(st.tab==='received'&&st.status)params.status=st.status;
      let data;
      if(st.tab==='received'&&!st.status&&!st.showDone){
        // A API filtra por um status só e não tem "excluir": busca páginas do tamanho escolhido,
        // descarta as concluídas e só pede a próxima página da API quando ainda faltam itens para
        // preencher a página atual (+1, para saber se existe "Próxima"). Páginas já buscadas
        // ficam em cache (st.doneCache), então voltar é instantâneo.
        const key=st.order+'|'+st.pageSize;
        if(!st.doneCache||st.doneCache.key!==key)st.doneCache={key,nextRaw:1,buffer:[],exhausted:false};
        const c=st.doneCache,need=st.page*st.pageSize+1;
        while(c.buffer.length<need&&!c.exhausted){
          const d=await fetchReceivedTasks({page:c.nextRaw,pageSize:st.pageSize,orderBy:'CreatedDate',order:st.order});
          const rows=Array.isArray(d)?d:(d?.records||d?.items||d?.data||d?.results||[]);
          c.buffer.push(...rows.filter(t=>!isDone(fieldsFor(t).status)));
          const totalPages=Array.isArray(d)?1:d?.totalPages;
          c.exhausted=rows.length<st.pageSize||(totalPages!=null&&c.nextRaw>=totalPages);
          c.nextRaw++;
        }
        data={records:c.buffer.slice((st.page-1)*st.pageSize,st.page*st.pageSize),__hasMore:c.buffer.length>st.page*st.pageSize};
      }else data=await tabDef.fetch(params);
      st.raw=data;
      // Formato de paginação também não documentado -- aceita tanto um
      // array puro quanto {items:[...]}/{data:[...]}/{results:[...]},
      // sem exigir um formato só.
      st.items=Array.isArray(data)?data:(data?.records||data?.items||data?.data||data?.results||[]);
      // Só tarefas "Não iniciado" entram no controle de "NOVA"/ciência; as demais
      // (ex.: já concluídas) não podem aparecer como novas só por estarem em Recebidas.
      if(st.tab==='received')await syncTracking(st.items.filter(isNotStarted)); else await refreshTracking();
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
    const hasNext=st.raw?.__hasMore!==undefined?st.raw.__hasMore:total!=null?(st.page*st.pageSize)<total:st.items.length>=st.pageSize;
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
        <div class="vx-elxt-searchbar">
          <div class="vx-elxt-searchbox"><span class="vx-elxt-search-icon">⌕</span><input id="vxElxTasksSearch" type="search" placeholder="Pesquisar em todas as tarefas: nº, caso, assunto ou conteúdo…" value="${esc2(st.search)}" autocomplete="off">${st.search?'<button type="button" class="vx-elxt-search-clear" id="vxElxTasksSearchClear" title="Limpar pesquisa">×</button>':''}</div>
          <button type="button" class="vx-elxt-search-btn" id="vxElxTasksSearchBtn">${st.searching?'Pesquisando…':'Pesquisar'}</button>
        </div>
        ${st.tab==='received'?`<label style="font-size:12px;color:#516375">Status
          <select id="vxElxTasksStatus"><option value="">Todos</option>${STATUS_OPTIONS.map(o=>`<option value="${esc2(o)}" ${o===st.status?'selected':''}>${esc2(o)}</option>`).join('')}</select>
        </label>
        <label style="font-size:12px;color:#516375;display:inline-flex;align-items:center;gap:5px;${st.status?'opacity:.5':''}" title="${st.status?'Já filtrado por um status específico':'Mostrar também as tarefas concluídas'}">
          <input type="checkbox" id="vxElxTasksShowDone" ${st.showDone||st.status?'checked':''} ${st.status?'disabled':''}> Mostrar concluídas
        </label>`:''}
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
    const searchInput=document.getElementById('vxElxTasksSearch');
    document.getElementById('vxElxTasksSearchBtn').onclick=()=>runGlobalSearch(searchInput.value);
    searchInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runGlobalSearch(searchInput.value);}};
    document.getElementById('vxElxTasksSearchClear')?.addEventListener('click',()=>runGlobalSearch(''));
    document.getElementById('vxElxTasksStatus')?.addEventListener('change',e=>{st.status=e.target.value;st.page=1;st.expanded=null;load();});
    document.getElementById('vxElxTasksShowDone')?.addEventListener('change',e=>{st.showDone=e.target.checked;st.page=1;st.expanded=null;load();});
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
        if(st.expanded){const src=st.searchResults!==null?st.searchResults:st.items,it=src[Number(st.expanded.replace('row',''))];if(it&&(!answersCache[it.id]||answersCache[it.id].error))loadAnswers(it);}
      };
    });
    document.querySelectorAll('#vxElxTasksBody [data-row-expand]').forEach(row=>{
      row.onclick=()=>{
        const source=st.searchResults!==null?st.searchResults:st.items; const item=source[Number(row.dataset.itemIndex)]; if(item)markViewed(item).catch(()=>{});
        st.expanded=st.expanded===row.dataset.rowExpand?null:row.dataset.rowExpand;
        document.getElementById('vxElxTasksBody').innerHTML=bodyHtml();
        wireBodyToggles();
        if(st.expanded&&item&&(!answersCache[item.id]||answersCache[item.id].error))loadAnswers(item);
      };
    });
    document.querySelectorAll('#vxElxTasksBody [data-reply-index]').forEach(b=>{
      b.onclick=async(e)=>{
        e.preventDefault();e.stopPropagation();
        const i=Number(b.dataset.replyIndex);
        const source=st.searchResults!==null?st.searchResults:st.items;
        const task=source[i];
        const box=document.getElementById('vxElxReply'+i),msg=document.getElementById('vxElxReplyMsg'+i);
        const answer=(box?.value||'').trim();
        if(msg)msg.textContent='';
        if(!task||!box)return;
        if(!answer){if(msg)msg.textContent='Escreva a resposta antes de enviar.';return;}
        if(!confirm('Enviar esta resposta à Electrolux?\n\nEla será registrada na tarefa '+fieldsFor(task).tarefa+' e não pode ser desfeita por aqui.'))return;
        b.disabled=true;box.disabled=true;b.textContent='Enviando…';
        try{
          await replyToTask(task.id,answer);
          if(typeof toast==='function')toast('Resposta enviada à Electrolux.');
          delete answersCache[task.id];
          // Recarrega a lista (o status pode ter mudado) e reabre a mesma tarefa pelo id,
          // já que o índice da linha muda -- ou fecha, se ela saiu do filtro atual.
          st.doneCache=null;
          if(st.searchResults!==null)await runGlobalSearch(st.search); else await load();
          const src=st.searchResults!==null?st.searchResults:st.items;
          const idx=src.findIndex(x=>x.id===task.id);
          st.expanded=idx>=0?'row'+idx:null;
          render();
          if(idx>=0)loadAnswers(src[idx]);
        }catch(err){
          b.disabled=false;box.disabled=false;b.textContent='Enviar resposta';
          if(msg)msg.textContent='Não foi possível enviar: '+(err.message||err);
        }
      };
    });
    document.querySelectorAll('#vxElxTasksBody [data-ack-index]').forEach(b=>{
      b.onclick=async(e)=>{
        e.preventDefault();e.stopPropagation();
        b.disabled=true;
        try{const source=st.searchResults!==null?st.searchResults:st.items;await acknowledgeTask(source[Number(b.dataset.ackIndex)]);}
        catch(err){b.disabled=false;alert('Não foi possível marcar como ciente: '+(err.message||err));}
      };
    });
  }

  // Só tarefas recebidas (aba Recebidas ou origem "Recebida" na busca global) podem ser respondidas.
  const canReply=t=>t.__source?t.__source==='Recebida':st.tab==='received';

  function bodyHtml(){
    if(st.searching)return '<div class="vx-elx-empty-board">Pesquisando em todas as tarefas…</div>';
    if(st.loading)return '<div class="vx-elx-empty-board">Carregando tarefas…</div>';
    if(st.error)return '<div class="vx-elx-empty-board">Não foi possível carregar. Use "Tentar de novo" acima.</div>';
    const displayItems=st.searchResults!==null?st.searchResults:st.items;
    if(!displayItems.length){
      if(st.searchResults!==null)return '<div class="vx-elx-empty-board">Nenhuma tarefa encontrada para “'+esc2(st.search)+'”.</div>';

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
    const searchSummary=st.searchResults!==null?'<div class="vx-elxt-search-summary">'+displayItems.length+' resultado'+(displayItems.length===1?'':'s')+' em todas as tarefas para “'+esc2(st.search)+'”</div>':'';
    return searchSummary+`<div class="desktop-table-wrap vx-elxt-table-wrap"><table class="desktop-table vx-elxt-table"><thead><tr>
      <th style="width:11%">TAREFA</th><th style="width:8%">CASO</th><th style="width:15%">ASSUNTO</th><th class="vx-elxt-desc-cell">DESCRIÇÃO</th><th style="width:12%">CRIADA EM</th><th style="width:11%">DATA VENCIMENTO</th><th style="width:11%">STATUS</th>
      </tr></thead><tbody>${displayItems.map((t,i)=>{
        const f=fieldsFor(t);
        const id='row'+i;
        const open=st.expanded===id;
        const track=st.tracking[taskIdentity(t)];
        const isNew=isNotStarted(t)&&!!track&&!track.acknowledged_at;
        return `<tr class="vx-elxt-task-row" data-row-expand="${id}" data-item-index="${i}" title="Clique para ${open?'recolher':'ver os detalhes completos'}">
          <td><span class="vx-elxt-task-id">${esc2(f.tarefa)}</span>${t.__source?`<span class="vx-elxt-source">${esc2(t.__source)}</span>`:''}${isNew?'<span class="vx-elxt-new">NOVA</span>':''}</td>
          <td><span class="vx-elxt-case">${esc2(f.caso)}</span></td>
          <td><span class="vx-elxt-desc-preview vx-elxt-subject" title="${esc2(f.assunto)}">${esc2(f.assunto)}</span></td>
          <td class="vx-elxt-desc-cell"><button type="button" class="vx-elxt-desc-btn" data-expand="${id}" title="Clique para ${open?'recolher':'ver a descrição completa'}"><span class="vx-elxt-desc-preview vx-elxt-description">${esc2(f.descricao)}</span></button></td>
          <td><span class="vx-elxt-created">${esc2(dtFull(f.criada))}</span></td>
          <td><span class="vx-elxt-created">${esc2(dtDue(f.vencimento))}</span></td>
          <td><span class="vx-elxt-status${isDone(f.status)?' done':''}">${esc2(f.status)}</span></td>
        </tr>${open?`<tr class="vx-elxt-json-row"><td colspan="7"><div class="vx-elxt-desc-full"><div class="vx-elxt-detail-grid"><div><div class="vx-elxt-detail-label">Detalhes da tarefa</div><div class="vx-elxt-detail-subject">${esc2(f.assunto)}</div><div class="vx-elxt-detail-text">${esc2(f.descricao)}</div><div class="vx-elxt-detail-meta"><span>Tarefa <b>${esc2(f.tarefa)}</b></span><span>Caso <b>${esc2(f.caso)}</b></span><span>Criada em <b>${esc2(dtFull(f.criada))}</b></span><span>Vencimento <b>${esc2(dtDue(f.vencimento))}</b></span><span>Status <b>${esc2(f.status)}</b></span></div>${answerShown(t)?`<div class="vx-elxt-answers"><div class="vx-elxt-detail-label">Resposta</div><div id="vxElxAnswers${esc2(t.id)}">${answersHtml(t)}</div></div>`:''}${replyOpen(t)?`<div class="vx-elxt-reply"><div class="vx-elxt-detail-label">Responder tarefa</div><textarea id="vxElxReply${i}" maxlength="${REPLY_MAX}" placeholder="Escreva a resposta que será enviada à Electrolux…"></textarea><div class="vx-elxt-reply-msg" id="vxElxReplyMsg${i}"></div><button type="button" class="vx-elxt-ack" data-reply-index="${i}">Enviar resposta</button></div>`:''}</div>${isNew?`<button type="button" class="vx-elxt-ack" data-ack-index="${i}">✓ Marcar como ciente</button>`:''}</div></div></td></tr>`:''}`;
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
    st.tab='received';st.status='';st.showDone=false;st.page=1;st.pageSize=15;st.order='desc';st.expanded=null;st.search='';st.searchResults=null;
    load();
    markSeenNow();
  };

  /* Indicador compartilhado: pendentes na origem e ainda sem ciência. */
  let newCount=null;
  let badgeCompanyId=null;
  function taskIdentity(t){return String(t?.id||t?.taskNumber||t?.createdDate||'');}
  let badgeCheckRunning=false;
  async function refreshSharedBadge(){
    if(badgeCheckRunning||document.visibilityState==='hidden')return;
    badgeCheckRunning=true;
    try{
      const companyId=await currentCompanyId();
      if(!companyId)throw new Error('Empresa indisponível.');
      if(badgeCompanyId!==companyId){badgeCompanyId=companyId;newCount=null;paintBadge();}
      const items=await fetchAllFrom(fetchPendingTasks);
      await syncTracking(items);
      if(await currentCompanyId()!==companyId)return;
      const ids=new Set(items.map(taskIdentity).filter(Boolean));
      newCount=[...ids].filter(id=>!st.tracking[id]?.acknowledged_at).length;
      paintBadge();
    }catch(_e){/* preserva a última contagem em falha de rede */}
    finally{badgeCheckRunning=false;}
  }
  async function markSeenNow(){await refreshSharedBadge();}
  async function checkForNew(){await refreshSharedBadge();}
  function paintBadge(){
    const btn=document.getElementById('vxElxTasksBtn');if(!btn)return;
    let badge=btn.querySelector('.vx-elxt-badge');
    if(newCount!==null){
      installStyle();
      if(!badge){badge=document.createElement('span');badge.className='vx-elxt-badge';btn.appendChild(badge);}
      badge.textContent=String(newCount);
      badge.title=newCount===1?'1 tarefa pendente aguardando ciência':newCount+' tarefas pendentes aguardando ciência';
    }else badge?.remove();
  }
  // O painel recria o botão a cada poll; repinta o valor em memória imediatamente.
  window.vxElxPaintTasksBadge=paintBadge;
  window.vxElxRefreshTasksBadge=checkForNew;

  // Não observa o document.body: o VoxAssist altera o DOM com frequência e
  // isso fazia o callback do badge rodar centenas/milhares de vezes sem necessidade.
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForNew();});
  window.addEventListener('focus',()=>paintBadge(),{passive:true});
  setTimeout(checkForNew,8000);
  setInterval(checkForNew,5*60*1000);
})();
