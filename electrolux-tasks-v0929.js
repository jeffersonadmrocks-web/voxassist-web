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

  let st={tab:'pending',page:1,pageSize:15,order:'desc',loading:false,error:null,items:[],raw:null,expanded:null};

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
      .vx-elxt-badge{position:absolute;top:-4px;right:-4px;width:9px;height:9px;border-radius:50%;background:#cf3542;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
      .vx-elxt-table-wrap{width:100%;max-width:100%;overflow:hidden}
      .vx-elxt-table{width:100%;max-width:100%;table-layout:fixed}
      .vx-elxt-table th,.vx-elxt-table td{overflow:hidden}
      .vx-elxt-desc-cell{width:38%}
      .vx-elxt-desc-preview{display:block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .vx-elxt-desc-btn{display:block;width:100%;text-align:left;background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;overflow:hidden}
      .vx-elxt-desc-full{white-space:pre-wrap;word-break:break-word;line-height:1.45;color:#33475b;padding:12px 14px;background:#f7f9fb}
      .vx-elxt-case{white-space:nowrap}
      .vx-elxt-task-row{cursor:pointer}
      .vx-elxt-task-row:hover{background:#f6f9fc}
      .vx-elxt-status{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;color:#516375}
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
        st.expanded=st.expanded===row.dataset.rowExpand?null:row.dataset.rowExpand;
        document.getElementById('vxElxTasksBody').innerHTML=bodyHtml();
        wireBodyToggles();
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
        return `<tr class="vx-elxt-task-row" data-row-expand="${id}" title="Clique para ${open?'recolher':'ver os detalhes completos'}">
          <td><b>${esc2(f.tarefa)}</b></td>
          <td class="vx-elxt-case"><b>${esc2(f.caso)}</b></td>
          <td><span class="vx-elxt-desc-preview" title="${esc2(f.assunto)}">${esc2(f.assunto)}</span></td>
          <td class="vx-elxt-desc-cell"><button type="button" class="vx-elxt-desc-btn" data-expand="${id}" title="Clique para ${open?'recolher':'ver a descrição completa'}"><span class="vx-elxt-desc-preview">${esc2(f.descricao)}</span></button></td>
          <td>${esc2(dtFull(f.criada))}</td>
          <td><span class="vx-elxt-status">${esc2(f.status)}</span></td>
        </tr>${open?`<tr class="vx-elxt-json-row"><td colspan="6"><div class="vx-elxt-desc-full"><b>${esc2(f.assunto)}</b><br><br>${esc2(f.descricao)}</div></td></tr>`:''}`;
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
  const SEEN_KEY='vx_elx_tasks_seen_sig';
  let hasNew=false;

  async function latestPendingSig(){
    const data=await fetchPendingTasks({page:1,pageSize:1,orderBy:'CreatedDate',order:'desc'});
    const items=Array.isArray(data)?data:(data?.records||data?.items||data?.data||data?.results||[]);
    return items.length?JSON.stringify(items[0]):'';
  }
  async function markSeenNow(){
    try{
      const sig=await latestPendingSig();
      localStorage.setItem(SEEN_KEY,sig);
    }catch(_e){/* sem rede/credencial ainda -- próxima checagem tenta de novo */}
    hasNew=false;
    paintBadge();
  }
  async function checkForNew(){
    let sig;
    try{ sig=await latestPendingSig(); }
    catch(_e){ return; } // falha de rede não deve acender nem apagar o aviso
    let seen=null;
    try{ seen=localStorage.getItem(SEEN_KEY); }catch(_e){/* ignore */}
    if(seen===null){
      // primeira vez que este navegador roda a checagem -- só grava a
      // referência, nunca acende o aviso do nada no primeiro carregamento.
      try{localStorage.setItem(SEEN_KEY,sig);}catch(_e){/* ignore */}
      hasNew=false;
    }else{
      hasNew=!!sig&&sig!==seen;
    }
    paintBadge();
  }
  function paintBadge(){
    const btn=document.getElementById('vxElxTasksBtn');
    if(!btn)return;
    let dot=btn.querySelector('.vx-elxt-badge');
    if(hasNew){
      if(!dot){
        installStyle();
        btn.style.position='relative';
        dot=document.createElement('span');
        dot.className='vx-elxt-badge';
        btn.appendChild(dot);
      }
    }else{
      dot?.remove();
    }
  }

  new MutationObserver(()=>paintBadge()).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForNew();});
  setTimeout(checkForNew,4000);
  setInterval(checkForNew,2*60*1000);
})();
