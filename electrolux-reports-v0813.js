/* VoxAssist Web V0.8.13 — módulo Electrolux (Painel de Triagem de SVOs)
   Réplica nativa do layout do voxassist/electrolux-voxanalytics, usando o
   design system Desktop já existente no VoxAssist (.daily-hero,
   .desktop-metrics, .desktop-filterbar, .desktop-panel). Módulo isolado:
   os dados vêm exclusivamente da API própria do Electrolux (configurável
   abaixo), nunca do Supabase operacional do VoxAssist. */
(function(){
  const VIEW='electrolux';
  const VIEW_MODE_KEY='voxassist_electrolux_view_mode';
  const SOURCE_REPO='https://github.com/jeffersonadmrocks-web/electrolux-voxanalytics';
  const POLL_MS=15000;

  try{ if(typeof navMap!=='undefined') navMap[VIEW]='Electrolux'; }catch(_e){}

  /* ---------- Regras de negócio (portadas 1:1 de dashboard/src/lib/types.ts) ---------- */
  const SAE_STATUSES=['Open','Aguardando aceite do Técnico','Agendamento rejeitado pelo Técnico','Despachada para o Técnico','Aguardando atendimento','Aguardando reagendamento','Consumidor ausente','Endereço não localizado','Sem contato consumidor','Técnico em deslocamento','Em atendimento','Enviado para Diagnostico remoto','Aguardando adequação do local','Aguardando aprovação','Aguardando aprovação ADM','Aguardando aprovação orçamento','Orçamento aprovado Aguardando pagamento','Orçamento Aprovado. Pagamento Selecionado','Erro no pagamento','Orçamento não aprovado 15 dias','Orçamento reprovado','Consumidor não aceita reparo','Aguardando correção','Devolvido pelo Técnico','Aguardando retorno do suporte (técnico/administrativo)','Aguardando retorno Engenharia','Retorno do suporte – concluído','Aguardando análise SAC','Aguardando peça','Peça entregue','Pedido faturado','Produto liberado','Produto na oficina','Produto S.O.S','Coletar produto','Aguardando Consumidor Entregar Produto','Atendimento concluído'];
  const OUTROS_STATUS='Outros';
  const KANBAN_COLUMNS=[...SAE_STATUSES,OUTROS_STATUS];
  function kanbanColumnFor(status){return SAE_STATUSES.includes(status)?status:OUTROS_STATUS}

  const RESCHEDULE_TRIGGER_STATUSES=new Set(['Aguardando atendimento','Aguardando reagendamento','Coletar produto','Consumidor ausente','Em atendimento','Endereço não localizado','Open','Peça entregue','Produto liberado','Sem contato consumidor','Técnico em deslocamento']);
  function needsRescheduleAlert(so){if(!RESCHEDULE_TRIGGER_STATUSES.has(so.status))return false;if(!so.firstQueuedDateTime)return true;return new Date(so.firstQueuedDateTime).getTime()<Date.now();}
  function needsPhoneAlert(so){return !so.clientPhone;}

  function normalizeSearchText(v){return String(v||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();}
  function matchesSearch(so,query){
    const trimmed=(query||'').trim();if(!trimmed)return true;
    const digitsQuery=trimmed.replace(/\D/g,'');
    if(digitsQuery.length>=4 && so.clientPhone && String(so.clientPhone).includes(digitsQuery))return true;
    const normalizedQuery=normalizeSearchText(trimmed);
    const haystack=normalizeSearchText([so.svoNumber,so.clientName,so.productName,so.claimedDefect].filter(Boolean).join(' '));
    return haystack.includes(normalizedQuery);
  }
  const DATE_FILTER_OPTIONS=[{value:'all',label:'TODOS OS PERÍODOS'},{value:'7',label:'ÚLTIMOS 7 DIAS'},{value:'15',label:'ÚLTIMOS 15 DIAS'},{value:'30',label:'ÚLTIMOS 30 DIAS'},{value:'60',label:'ÚLTIMOS 60 DIAS'}];
  function matchesDateFilter(so,filter){if(filter==='all')return true;const cutoff=Date.now()-Number(filter)*86400000;return new Date(so.createdDate).getTime()>=cutoff;}
  function matchesStatusFilter(so,selected){if(selected.size===0)return true;return selected.has(so.status);}
  const ORDER_TYPES=['Garantia','Fora de Garantia','Fora de Garantia c/ Autorização','Atendimento Seguradora'];
  const OUTROS_ORDER_TYPE='Outros';
  function orderTypeCategoryFor(orderType){
    const t=orderType||'';
    if(/seguradora/i.test(t))return 'Atendimento Seguradora';
    if(/fora de garantia/i.test(t) && /autoriza/i.test(t))return 'Fora de Garantia c/ Autorização';
    if(/fora de garantia/i.test(t))return 'Fora de Garantia';
    if(/garantia/i.test(t))return 'Garantia';
    return OUTROS_ORDER_TYPE;
  }
  function matchesOrderTypeFilter(so,selected){if(selected.size===0)return true;return selected.has(orderTypeCategoryFor(so.orderType));}
  function slaLevel(agingDays){if(agingDays>=5)return 'red';if(agingDays>=3)return 'yellow';return 'green';}

  /* Os 9 menus definidos pelo usuário — cada situação real da SAE entra em exatamente um.
     Usado tanto para os cards do hub (module-action-card) quanto para as seções do quadro
     Kanban: o card de cada SVO sempre mostra o status real individual (svoCard), só a seção
     que agrupa várias situações próximas. */
  const GROUPS=[
    {key:'ag_agendamento',label:'AG AGENDAMENTO',icon:'◷',color:'purple',desc:'Depende de contato com o consumidor ou retorno de peça/reparo para agendar.',statuses:['Open','Aguardando atendimento','Aguardando reagendamento','Consumidor ausente','Endereço não localizado','Sem contato consumidor','Aguardando adequação do local','Devolvido pelo Técnico','Coletar produto','Aguardando Consumidor Entregar Produto','Orçamento aprovado Aguardando pagamento','Orçamento Aprovado. Pagamento Selecionado','Retorno do suporte – concluído']},
    {key:'ag_pecas',label:'AG PEÇAS',icon:'▦',color:'cyan',desc:'Aguardando chegada da peça para o reparo.',statuses:['Aguardando peça']},
    {key:'peca_entregue',label:'PEÇA ENTREGUE',icon:'▣',color:'blue',desc:'Peça entregue ou pedido já faturado.',statuses:['Peça entregue','Pedido faturado']},
    {key:'ag_aprovacao',label:'AG APROVAÇÃO',icon:'$',color:'green',desc:'Orçamento enviado, aguardando aprovação do consumidor.',statuses:['Aguardando aprovação','Aguardando aprovação orçamento']},
    {key:'concluido',label:'CONCLUÍDO',icon:'✓',color:'teal',desc:'Atendimentos finalizados, sem aprovação ou encerrados por outro motivo.',statuses:['Erro no pagamento','Orçamento não aprovado 15 dias','Orçamento reprovado','Consumidor não aceita reparo','Produto liberado','Atendimento concluído']},
    {key:'em_atendimento',label:'EM ATENDIMENTO',icon:'⚒',color:'orange',desc:'Técnico a caminho, atendimento em andamento ou produto na oficina.',statuses:['Técnico em deslocamento','Em atendimento','Produto na oficina']},
    {key:'ag_electrolux',label:'AG ELECTROLUX',icon:'↻',color:'red',desc:'Pendência de retorno da própria Electrolux (SAC, engenharia, suporte, diagnóstico).',statuses:['Enviado para Diagnostico remoto','Aguardando aprovação ADM','Aguardando retorno do suporte (técnico/administrativo)','Aguardando retorno Engenharia','Aguardando análise SAC']},
    {key:'correcao',label:'CORREÇÃO',icon:'⚙',color:'brown',desc:'Aguardando correção técnica do atendimento.',statuses:['Aguardando correção']},
  ];
  // Achado do usuário em 2026-09-02: "OUTROS ATENDIMENTOS" (grupo fixo
  // com 4 situações específicas) e "OUTROS STATUS" (o catch-all logo
  // abaixo, pra qualquer situação não mapeada em nenhum grupo) tinham o
  // mesmo ícone/cor/nome parecido e pareciam duplicados. Removido o
  // grupo fixo -- suas 4 situações (Aguardando aceite do Técnico,
  // Agendamento rejeitado pelo Técnico, Produto S.O.S, Despachada para
  // o Técnico) agora caem naturalmente no catch-all "OUTROS STATUS"
  // (groupFor() já retorna 'outros' pra qualquer status fora de
  // GROUP_STATUS_MAP), sem precisar de nenhuma outra mudança.
  const GROUP_STATUS_MAP=new Map();
  GROUPS.forEach(g=>g.statuses.forEach(s=>GROUP_STATUS_MAP.set(s,g.key)));
  function groupFor(status){return GROUP_STATUS_MAP.get(status)||'outros';}

  /* Dias corridos desde a última alteração real de um campo "de fábrica" (status incluído) —
     backend só grava updatedAt quando algo muda de fato (ver syncService.hasChanges). */
  function daysSinceUpdate(so){if(!so.updatedAt)return 0;return Math.max(0,Math.floor((Date.now()-new Date(so.updatedAt).getTime())/86400000));}

  /* ---------- Estado local do módulo ---------- */
  const elx={orders:[],error:null,selected:null,detail:null,detailLoading:false,
    screen:'home',activeGroupKey:null,staleFilter:false,agingFilter:null,homeFilter:null,
    viewMode:localStorage.getItem(VIEW_MODE_KEY)||'kanban',
    search:'',dateFilter:'all',statusFilter:new Set(),orderTypeFilter:new Set(),
    syncing:false,lastSyncAt:null,loading:false,pollTimer:null,
    // Achado do usuário 2026-09-03: endereço do painel Electrolux (Vox
    // Analytics) era config por NAVEGADOR (localStorage) -- todo
    // dispositivo novo pedia pra configurar de novo, mesmo endereço
    // pra empresa toda. Agora vem de electrolux_panel_settings
    // (migration 20260903030000), uma linha por empresa, visível pra
    // todo mundo, editável só por GESTOR.
    apiUrl:null,apiUrlLoaded:false};

  /* Filtro ativado pelos 5 cards de resumo do hub — fica na tela inicial (não navega pro
     board) e recalcula a contagem dos 9 cards de menu abaixo. */
  function matchesHomeFilter(so){
    if(!elx.homeFilter)return true;
    if(elx.homeFilter.type==='stale')return daysSinceUpdate(so)>=2;
    if(elx.homeFilter.type==='aging')return so.agingDays>elx.homeFilter.over;
    if(elx.homeFilter.type==='orderType')return orderTypeCategoryFor(so.orderType)===elx.homeFilter.value;
    return true;
  }
  function homeFilterToBoardOpts(){
    if(!elx.homeFilter)return {};
    if(elx.homeFilter.type==='stale')return {stale:true};
    if(elx.homeFilter.type==='aging')return {agingOver:elx.homeFilter.over};
    if(elx.homeFilter.type==='orderType')return {orderTypes:[elx.homeFilter.value]};
    return {};
  }

  function apiBase(){return (elx.apiUrl||'').trim().replace(/\/+$/,'');}
  async function loadApiUrlSetting(){
    try{
      const rows=await api('electrolux_panel_settings?select=api_url&limit=1');
      elx.apiUrl=rows?.[0]?.api_url||'';
    }catch{
      elx.apiUrl='';
    }
    elx.apiUrlLoaded=true;
  }
  async function saveApiUrlSetting(value){
    const companyId=state.profile.active_company_id;
    const existing=await api(`electrolux_panel_settings?company_id=eq.${companyId}&select=company_id&limit=1`).catch(()=>[]);
    const body=JSON.stringify({company_id:companyId,api_url:value,updated_at:new Date().toISOString(),updated_by:state.session?.user?.id||null});
    if(existing?.length)await api(`electrolux_panel_settings?company_id=eq.${companyId}`,{method:'PATCH',body});
    else await api('electrolux_panel_settings',{method:'POST',body});
    elx.apiUrl=value;
  }
  async function clearApiUrlSetting(){
    const companyId=state.profile.active_company_id;
    await api(`electrolux_panel_settings?company_id=eq.${companyId}`,{method:'DELETE'});
    elx.apiUrl='';
  }
  async function getJson(path){
    const base=apiBase(); if(!base) throw new Error('Configure o endereço da API do Electrolux abaixo.');
    let r;
    try{ r=await fetch(base+path,{cache:'no-store',credentials:'include'}); }
    catch(_e){ throw new Error('Não foi possível conectar em '+base+' (provável bloqueio de CORS ou servidor fora do ar).'); }
    if(!r.ok) throw new Error('HTTP '+r.status+' em '+path);
    return r.json();
  }
  async function postJson(path){
    const base=apiBase(); if(!base) throw new Error('Configure o endereço da API do Electrolux abaixo.');
    let r;
    try{ r=await fetch(base+path,{method:'POST',cache:'no-store',credentials:'include'}); }
    catch(_e){ throw new Error('Não foi possível conectar em '+base+' (provável bloqueio de CORS ou servidor fora do ar).'); }
    if(!r.ok) throw new Error('HTTP '+r.status+' em '+path);
    return r.json();
  }
  const fetchServiceOrders=()=>getJson('/api/dashboard/service-orders');
  const fetchServiceOrder=id=>getJson('/api/dashboard/service-orders/'+encodeURIComponent(id));
  const fetchSyncStatus=()=>getJson('/api/dashboard/sync-status');
  const triggerSyncNow=()=>postJson('/api/admin/sync-now');

  function installStyle(){
    if(document.getElementById('vxElectroluxReportsStyle')) return;
    const s=document.createElement('style');
    s.id='vxElectroluxReportsStyle';
    s.textContent=`
      .nav[data-view="electrolux"]{border-left:3px solid #1b5fa7}
      .vx-elx-page{display:grid;gap:11px}
      .vx-elx-config{background:#fff;border:1px solid #cad3dc;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:#516375}
      .vx-elx-config input{flex:1;min-width:240px;font:inherit;border:1px solid #aeb5bc;padding:6px 8px}
      .vx-elx-config button{font:inherit;border:1px solid #174f86;background:#174f86;color:#fff;padding:7px 11px;cursor:pointer}
      .vx-elx-config button.secondary{background:#fff;color:#174f86}
      .vx-elx-error{background:#fde8e8;border:1px solid #f3b9b9;color:#8a1f1f;padding:10px 12px;font-size:12px}
      .vx-elx-filterbar{grid-template-columns:1fr 150px 190px 190px auto!important}
      .vx-elx-msel{position:relative}
      .vx-elx-msel-btn{width:100%;height:23px;border:1px solid #aeb5bc;background:#e8e5e0;font-size:10px;text-align:left;padding:0 6px;cursor:pointer}
      .vx-elx-msel-panel{display:none;position:absolute;top:calc(100% + 3px);left:0;min-width:230px;max-height:260px;overflow:auto;background:#fff;border:1px solid #aeb5bc;box-shadow:0 8px 18px rgba(15,42,68,.14);z-index:40;padding:6px}
      .vx-elx-msel.open .vx-elx-msel-panel{display:block}
      .vx-elx-msel-panel label{display:flex;align-items:center;gap:6px;font-size:11px;padding:4px 5px;cursor:pointer}
      .vx-elx-msel-panel label:hover{background:#f4f7fa}
      .vx-elx-filtercount{align-self:center;font-size:10px;color:#73869a;white-space:nowrap}
      .vx-elx-board{display:flex;flex-direction:column;gap:14px}
      .vx-elx-section{background:#fff;border:1px solid #cad3dc}
      .vx-elx-section-head{padding:10px 12px;border-bottom:1px solid #e3e8ed;display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:#17324d;letter-spacing:.02em}
      .vx-elx-section-body{padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
      .vx-elx-col-count{background:#eef2f6;border-radius:999px;padding:2px 8px;font-size:10px;color:#516375;font-weight:700}
      .vx-elx-empty-board{background:#fff;border:1px solid #cad3dc;padding:34px 20px;text-align:center;color:#66798c;font-size:12px}
      .vx-elx-svo-card{background:#fff;border:1px solid #dfe7ef;border-left:3px solid #cad3dc;padding:8px 9px;cursor:pointer;transition:box-shadow .12s ease}
      .vx-elx-svo-card:hover{box-shadow:0 3px 10px rgba(15,42,68,.12)}
      .vx-elx-svo-card.green{border-left-color:#13904b}.vx-elx-svo-card.yellow{border-left-color:#ef8500}.vx-elx-svo-card.red{border-left-color:#cf3542}
      .vx-elx-svo-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
      .vx-elx-svo-num{font-family:Consolas,monospace;font-size:10.5px;font-weight:700;color:#516375}
      .vx-elx-sla{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 7px;font-size:9.5px;font-weight:700;white-space:nowrap}
      .vx-elx-sla.green{background:#e7f5ec;color:#176a38}.vx-elx-sla.yellow{background:#fff1df;color:#8b5200}.vx-elx-sla.red{background:#fde8e8;color:#b3261e}
      .vx-elx-sla i{width:6px;height:6px;border-radius:50%;display:inline-block}
      .vx-elx-sla.green i{background:#13904b}.vx-elx-sla.yellow i{background:#ef8500}.vx-elx-sla.red i{background:#cf3542;animation:vxElxPing 1.3s ease-in-out infinite}
      @keyframes vxElxPing{0%{box-shadow:0 0 0 0 rgba(207,53,66,.55)}70%{box-shadow:0 0 0 5px rgba(207,53,66,0)}100%{box-shadow:0 0 0 0 rgba(207,53,66,0)}}
      .vx-elx-svo-client{margin:5px 0 1px;font-size:12px;font-weight:700;color:#17324d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .vx-elx-svo-product{margin:0;font-size:10.5px;color:#65788b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .vx-elx-type{display:inline-flex;border-radius:999px;padding:2px 8px;margin-top:6px;font-size:9px;font-weight:700;border:1px solid transparent}
      .vx-elx-type.garantia{background:#e7f0fb;color:#1671d8;border-color:#c7dcf5}
      .vx-elx-type.foradegarantia{background:#eef1f3;color:#516375;border-color:#dbe1e6}
      .vx-elx-type.foradegarantiacautorizacao{background:#f1ebfc;color:#7650d6;border-color:#ddccf5}
      .vx-elx-type.atendimentoseguradora{background:#fff1df;color:#8b5200;border-color:#f5dcb0}
      .vx-elx-type.outros{background:#eef2f6;color:#516375;border-color:#dbe1e6}
      .vx-elx-alert{display:flex;align-items:center;gap:5px;margin-top:6px;padding:4px 7px;border-radius:5px;font-size:9.5px;font-weight:700}
      .vx-elx-alert.phone{background:#fde8e8;color:#b3261e}.vx-elx-alert.reschedule{background:#fff1df;color:#8b5200}
      .vx-elx-modal-wrap{position:fixed;inset:0;background:rgba(10,25,40,.45);display:flex;justify-content:flex-end;z-index:80}
      .vx-elx-modal{background:#fff;width:420px;max-width:94vw;height:100%;overflow-y:auto;box-shadow:-8px 0 24px rgba(0,0,0,.18)}
      .vx-elx-modal-head{position:sticky;top:0;background:#0d3153;color:#fff;padding:16px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      .vx-elx-modal-head h3{margin:0 0 3px;font-size:16px}.vx-elx-modal-head small{opacity:.85}
      .vx-elx-modal-close{background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1}
      .vx-elx-modal-body{padding:16px 18px;display:grid;gap:12px}
      .vx-elx-kv{display:grid;grid-template-columns:120px 1fr;gap:4px 10px;font-size:12px}
      .vx-elx-kv b{color:#73869a;font-weight:600;font-size:10.5px;text-transform:uppercase}
      .vx-elx-kv span{color:#17324d}
      .vx-elx-modal-section{border-top:1px solid #e3e8ed;padding-top:10px}
      .vx-elx-modal-section h4{margin:0 0 6px;font-size:11px;color:#516375;text-transform:uppercase;letter-spacing:.03em}
      .vx-elx-part{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dashed #e3e8ed}
      .vx-elx-msg{padding:7px 9px;border-radius:8px;font-size:11.5px;margin-bottom:6px;max-width:88%}
      .vx-elx-msg.OUTBOUND{background:#e7f0fb;margin-left:auto}.vx-elx-msg.INBOUND{background:#f1f3f5}
      .vx-elx-group-count{position:absolute;top:16px;right:18px;font-size:22px;font-weight:700;color:var(--accent,#1f73d0)}
      .module-summary-card[data-summary]{font:inherit;cursor:pointer;width:100%}
      .module-summary-card[data-summary]:hover{background:#f9fbfd}
      .module-summary-card.vx-elx-summary-active{background:var(--accent,#2674d9);border-color:var(--accent,#2674d9)}
      .module-summary-card.vx-elx-summary-active span{color:rgba(255,255,255,.85)}
      .module-summary-card.vx-elx-summary-active b{color:#fff}
      .vx-elx-summary-5{grid-template-columns:repeat(5,minmax(0,1fr))}
      @media(max-width:1200px){.vx-elx-summary-5{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:720px){.vx-elx-summary-5{grid-template-columns:1fr 1fr}}
      .vx-elx-view-toggle{display:flex;gap:0;margin-bottom:8px}
      .vx-elx-view-btn{border:1px solid #aeb5bc;background:#e8e5e0;font-size:10px;padding:7px 14px;cursor:pointer;color:#3c4c5c}
      .vx-elx-view-btn:first-child{border-right:0}
      .vx-elx-view-btn.active{background:#174f86;color:#fff;border-color:#174f86}
      .vx-elx-status-pill{display:inline-block;background:#e7f0fb;color:#174f86;border-radius:5px;padding:3px 9px;font-size:10px;font-weight:700;white-space:nowrap}
      .desktop-table tbody tr[data-svo]{cursor:pointer}
      .vx-elx-board-head{background:#fff;border:1px solid #cfd7e1;padding:14px 16px;margin-bottom:0;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .vx-elx-board-head h2{font-size:19px;margin:8px 0 0;color:#101b2b}
      .vx-elx-back{border:1px solid #bac4cf;background:#eef1f4;color:#23364e;padding:6px 12px;font-size:11px;cursor:pointer}
      @media(max-width:900px){.vx-elx-filterbar{grid-template-columns:1fr 1fr!important}}
      .vx-elx-nps-mini{display:inline-block;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;background:#eef2f6;color:#516375}
      .vx-elx-nps-mini.ok{background:#e7f5ec;color:#176a38}
      .vx-elx-nps-mini.warn{background:#fde8e8;color:#b3261e}
      .vx-elx-nps-mini.muted{background:#eef2f6;color:#8fa3b6}
      .vx-elx-search-row{padding:9px 10px;border:1px solid #e3e8ed;border-radius:7px;margin-bottom:7px;cursor:pointer;transition:background .12s ease}
      .vx-elx-search-row:hover{background:#f4f7fa}
      .vx-elx-search-row small{color:#65788b}
      .vx-elx-search-group-label{font-size:10px;font-weight:700;color:#73869a;text-transform:uppercase;letter-spacing:.03em;margin:10px 0 6px}
      .vx-elx-search-group-label:first-child{margin-top:0}
      .vx-elx-home-search-bar{grid-template-columns:1fr!important}
      .vx-elx-home-search-bar label{position:relative}
      .vx-elx-search-dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:360px;overflow:auto;background:#fff;border:1px solid #aeb5bc;box-shadow:0 10px 22px rgba(15,42,68,.16);z-index:40;padding:8px;font-weight:400}
      .vx-elx-search-dropdown[hidden]{display:none}
      #vxElxMetrics .desk-metric{cursor:pointer;transition:box-shadow .12s ease,transform .12s ease}
      #vxElxMetrics .desk-metric:hover{box-shadow:0 3px 10px rgba(15,42,68,.12)}
      #vxElxMetrics .desk-metric.vx-elx-metric-active{background:var(--metric);box-shadow:inset 0 0 0 2px rgba(0,0,0,.06)}
      #vxElxMetrics .desk-metric.vx-elx-metric-active span,#vxElxMetrics .desk-metric.vx-elx-metric-active b,#vxElxMetrics .desk-metric.vx-elx-metric-active small{color:#fff}
    `;
    document.head.appendChild(s);
  }

  function ensureNav(){
    const side=document.querySelector('.sidebar');
    if(!side || side.querySelector('.nav[data-view="electrolux"]')) return;
    const btn=document.createElement('button');
    btn.className='nav';btn.dataset.view=VIEW;btn.innerHTML='▥ <span>ELECTROLUX</span>';
    const configBtn=side.querySelector('.nav[data-view="usuarios"]');
    if(configBtn && configBtn.parentElement){
      configBtn.parentElement.insertBefore(btn,configBtn);
    } else {
      (side.querySelector('.desktop-menu')||side).appendChild(btn);
    }
    btn.onclick=()=>window.render(VIEW);
  }

  function metricCard(label,value,color,opts){
    opts=opts||{};
    const active=opts.active?' vx-elx-metric-active':'';
    const attr=opts.key?` data-metric="${opts.key}"`:'';
    return `<button class="desk-metric${active}" style="--metric:${color}"${attr}><span>${label}</span><b>${value==null?'—':value}</b></button>`;
  }

  function svoBadgeClass(name){return String(name||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');}

  function svoCard(so){
    const level=slaLevel(so.agingDays);
    const category=orderTypeCategoryFor(so.orderType);
    return `<div class="vx-elx-svo-card ${level}" data-svo="${esc(so.id)}">
      <div class="vx-elx-svo-top"><span class="vx-elx-svo-num">${esc(so.svoNumber)}</span><span class="vx-elx-sla ${level}"><i></i>${so.agingDays}d</span></div>
      <p class="vx-elx-svo-client">${esc(so.clientName||'—')}</p>
      <p class="vx-elx-svo-product">⚒ ${esc(so.productName||'—')} — ${esc(so.claimedDefect||'—')}</p>
      <span class="vx-elx-type ${svoBadgeClass(category)}">${esc(category==='Outros'?so.orderType:category)}</span>
      ${needsPhoneAlert(so)?`<div class="vx-elx-alert phone">☎ Sem telefone cadastrado</div>`:''}
      ${needsRescheduleAlert(so)?`<div class="vx-elx-alert reschedule">◷ Contatar consumidor p/ agendar</div>`:''}
    </div>`;
  }

  function filteredOrders(){
    return elx.orders.filter(so=>matchesSearch(so,elx.search)&&matchesDateFilter(so,elx.dateFilter)&&matchesStatusFilter(so,elx.statusFilter)&&matchesOrderTypeFilter(so,elx.orderTypeFilter)
      &&(!elx.activeGroupKey||groupFor(so.status)===elx.activeGroupKey)
      &&(!elx.staleFilter||daysSinceUpdate(so)>=2)
      &&(!elx.agingFilter||so.agingDays>elx.agingFilter));
  }

  const METRIC_AGING_THRESHOLD=7;
  function renderMetrics(){
    const box=document.getElementById('vxElxMetrics');if(!box)return;
    // Cada card conta em cima do filtro dos OUTROS dois (busca/período/status/tipo/grupo
    // seguem valendo), nunca em cima do próprio -- senão o card mostra sempre 100% do que
    // já está filtrado por ele mesmo, e o número deixa de significar algo clicável. Achado
    // do usuário 2026-09-03: os cards mostravam um número mas clicar neles não fazia nada.
    const baseList=elx.orders.filter(so=>matchesSearch(so,elx.search)&&matchesDateFilter(so,elx.dateFilter)&&matchesStatusFilter(so,elx.statusFilter)&&matchesOrderTypeFilter(so,elx.orderTypeFilter)&&(!elx.activeGroupKey||groupFor(so.status)===elx.activeGroupKey));
    const total=elx.orders.length?filteredOrders().length:null;
    const acima7=elx.orders.length?baseList.filter(so=>so.agingDays>METRIC_AGING_THRESHOLD).length:null;
    const stale=elx.orders.length?baseList.filter(so=>daysSinceUpdate(so)>=2).length:null;
    const atrasadaAtiva=elx.agingFilter===METRIC_AGING_THRESHOLD;
    box.innerHTML=metricCard('SVOs NESTA VISÃO',total,'#1876d2',{key:'total',active:!atrasadaAtiva&&!elx.staleFilter})
      +metricCard('ATRASADAS (>7 DIAS)',acima7,acima7?'#cf3542':'#8fa3b6',{key:'atrasadas',active:atrasadaAtiva})
      +metricCard('SEM ALTERAÇÃO HÁ +2 DIAS',stale,stale?'#ef8500':'#8fa3b6',{key:'stale',active:!!elx.staleFilter});
    box.querySelectorAll('[data-metric]').forEach(btn=>btn.onclick=()=>{
      const key=btn.dataset.metric;
      if(key==='total'){elx.agingFilter=null;elx.staleFilter=false;}
      else if(key==='atrasadas'){elx.agingFilter=atrasadaAtiva?null:METRIC_AGING_THRESHOLD;}
      else if(key==='stale'){elx.staleFilter=!elx.staleFilter;}
      renderDynamic();
    });
  }

  function renderBoard(){
    const box=document.getElementById('vxElxBoard');if(!box)return;
    if(!apiBase()){box.innerHTML=`<div class="vx-elx-empty-board">Configure o endereço da API do Electrolux abaixo para carregar as SVOs.</div>`;return;}
    if(elx.loading){box.innerHTML=`<div class="vx-elx-empty-board">Carregando SVOs…</div>`;return;}
    if(!elx.orders.length){box.innerHTML=`<div class="vx-elx-empty-board">Nenhuma SVO carregada ainda.</div>`;return;}
    if(elx.viewMode==='list')return renderListView(box);
    return renderKanbanView(box);
  }

  function renderKanbanView(box){
    const list=filteredOrders();
    const byStatus=new Map();KANBAN_COLUMNS.forEach(c=>byStatus.set(c,[]));
    list.forEach(so=>byStatus.get(kanbanColumnFor(so.status)).push(so));
    const sections=KANBAN_COLUMNS.map(status=>{
      const items=byStatus.get(status)||[];
      if(!items.length)return '';
      return `<div class="vx-elx-section"><div class="vx-elx-section-head"><span>${esc(status)}</span><span class="vx-elx-col-count">${items.length}</span></div><div class="vx-elx-section-body">${items.map(svoCard).join('')}</div></div>`;
    }).join('');
    box.innerHTML=sections||`<div class="vx-elx-empty-board">Nenhuma SVO corresponde aos filtros atuais.</div>`;
    box.querySelectorAll('[data-svo]').forEach(el=>el.onclick=()=>openDetail(el.dataset.svo));
  }

  function renderListView(box){
    const list=filteredOrders();
    if(!list.length){box.innerHTML=`<div class="vx-elx-empty-board">Nenhuma SVO corresponde aos filtros atuais.</div>`;return;}
    box.innerHTML=`<div class="desktop-table-wrap"><table class="desktop-table"><thead><tr>
      <th>SVO</th><th>CLIENTE</th><th>PRODUTO / DEFEITO</th><th>SITUAÇÃO</th><th>TIPO</th><th>SLA</th><th>ABERTA EM</th>
      </tr></thead><tbody>${list.map(so=>{
        const level=slaLevel(so.agingDays);
        const category=orderTypeCategoryFor(so.orderType);
        return `<tr data-svo="${esc(so.id)}">
          <td><b>${esc(so.svoNumber)}</b></td>
          <td>${esc(so.clientName||'—')}${needsPhoneAlert(so)?` <span title="Sem telefone cadastrado" style="color:#cf3542">☎</span>`:''}${needsRescheduleAlert(so)?` <span title="Contatar consumidor p/ agendar" style="color:#ef8500">◷</span>`:''}</td>
          <td>${esc(so.productName||'—')} — ${esc(so.claimedDefect||'—')}</td>
          <td><span class="vx-elx-status-pill">${esc(so.status)}</span></td>
          <td><span class="vx-elx-type ${svoBadgeClass(category)}">${esc(category==='Outros'?so.orderType:category)}</span></td>
          <td><span class="vx-elx-sla ${level}"><i></i>${so.agingDays}d</span></td>
          <td>${so.createdDate?new Date(so.createdDate).toLocaleString('pt-BR'):'—'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-svo]').forEach(el=>el.onclick=()=>openDetail(el.dataset.svo));
  }

  function renderFilterCount(){
    const el=document.getElementById('vxElxFilterCount');if(!el)return;
    const active=elx.search||elx.dateFilter!=='all'||elx.statusFilter.size||elx.orderTypeFilter.size;
    el.textContent=active?`${filteredOrders().length} de ${elx.orders.length} SVO(s)`:'';
  }

  function renderDynamic(){renderMetrics();renderBoard();renderFilterCount();}

  function multiSelectPanel(group,options,selected){
    return options.map(opt=>`<label><input type="checkbox" data-msel-group="${group}" value="${esc(opt)}" ${selected.has(opt)?'checked':''}>${esc(opt)}</label>`).join('');
  }

  function bindMultiSelect(id,group,selectedSet){
    const wrap=document.getElementById(id);if(!wrap)return;
    const btn=wrap.querySelector('.vx-elx-msel-btn');
    btn.onclick=e=>{e.stopPropagation();document.querySelectorAll('.vx-elx-msel.open').forEach(o=>{if(o!==wrap)o.classList.remove('open')});wrap.classList.toggle('open');};
    wrap.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.onchange=()=>{
      if(cb.checked)selectedSet.add(cb.value);else selectedSet.delete(cb.value);
      btn.textContent=(selectedSet.size?selectedSet.size+' selecionado(s)':'Selecionar')+' ▾';
      renderDynamic();
    });
  }

  function closeDetail(){elx.selected=null;elx.detail=null;const m=document.getElementById('vxElxModalWrap');if(m)m.remove();}

  function detailKv(label,value){return `<div class="vx-elx-kv"><b>${esc(label)}</b><span>${value?esc(value):'—'}</span></div>`;}

  function renderModal(){
    let wrap=document.getElementById('vxElxModalWrap');
    if(!wrap){
      wrap=document.createElement('div');wrap.id='vxElxModalWrap';wrap.className='vx-elx-modal-wrap';
      wrap.onclick=e=>{if(e.target===wrap)closeDetail();};
      document.body.appendChild(wrap);
    }
    const so=elx.selected,d=elx.detail;
    const level=slaLevel(so.agingDays);
    wrap.innerHTML=`<div class="vx-elx-modal">
      <div class="vx-elx-modal-head"><div><h3>${esc(so.svoNumber)}</h3><small>${esc(so.status)}</small></div><button class="vx-elx-modal-close" id="vxElxModalClose">✕</button></div>
      <div class="vx-elx-modal-body">
        <div class="vx-elx-kv"><b>SLA</b><span class="vx-elx-sla ${level}"><i></i>${so.agingDays} dia(s) em aberto</span></div>
        ${detailKv('Cliente',so.clientName)}
        ${detailKv('Telefone',d?.cellPhone||d?.phone||so.clientPhone)}
        ${detailKv('Produto',so.productName)}
        ${detailKv('Defeito relatado',so.claimedDefect)}
        ${detailKv('Tipo de SVO',so.orderType)}
        ${detailKv('Aberta em',so.createdDate?new Date(so.createdDate).toLocaleString('pt-BR'):'')}
        ${detailKv('Agendamento',so.appointmentDate?new Date(so.appointmentDate).toLocaleString('pt-BR'):'')}
        ${d?.address?detailKv('Endereço',[d.address.street,d.address.neighborhood,d.address.city,d.address.state].filter(Boolean).join(', ')):''}
        ${d?`<div class="vx-elx-modal-section"><h4>Peças (${d.parts?.length||0})</h4>${(d.parts||[]).map(p=>`<div class="vx-elx-part"><span>${esc(p.codigo)} ${esc(p.descricao||'')}</span><span>${p.disponivel===true?'Disponível':p.disponivel===false?'Indisponível':'—'}</span></div>`).join('')||'<small>Nenhuma peça vinculada.</small>'}</div>
        <div class="vx-elx-modal-section"><h4>Mensagens (${d.messages?.length||0})</h4>${(d.messages||[]).map(m=>`<div class="vx-elx-msg ${esc(m.direction)}">${esc(m.content)}</div>`).join('')||'<small>Sem mensagens registradas.</small>'}</div>`
        :`<div class="vx-elx-modal-section"><button class="secondary" id="vxElxLoadDetail" ${elx.detailLoading?'disabled':''}>${elx.detailLoading?'Carregando…':'Carregar detalhes completos'}</button></div>`}
      </div>
    </div>`;
    document.getElementById('vxElxModalClose').onclick=closeDetail;
    const loadBtn=document.getElementById('vxElxLoadDetail');
    if(loadBtn)loadBtn.onclick=async()=>{
      elx.detailLoading=true;renderModal();
      try{elx.detail=await fetchServiceOrder(so.id);}catch(e){toast?.(e.message,'err');}
      elx.detailLoading=false;renderModal();
    };
  }

  function openDetail(id){
    const so=elx.orders.find(o=>String(o.id)===String(id));if(!so)return;
    elx.selected=so;elx.detail=null;renderModal();
  }

  // 'closed' fica de fora de propósito -- não usa elx.orders (fonte é
  // Supabase, não o poll da Electrolux), então um tick do poll não pode
  // arrancar o usuário da tela de Encerradas de volta pro Início.
  // Achado do usuário em 2026-09-04: mesma causa raiz já corrigida uma
  // vez pro NPS (ver comentário de vxElxStopPoll abaixo) -- o poll de
  // 15s chamava renderHome() por baixo do usuário e reconstruía a
  // barra de busca inteira do zero, apagando o resultado (e o campo
  // digitado) mesmo sem o usuário clicar em nada. Agora renderHome()
  // é pulado enquanto a busca está em uso (campo com foco ou resultado
  // aberto na tela) -- só atualiza métricas/lista quando o usuário sai
  // da busca.
  function searchInUse(){
    const input=document.getElementById('vxElxHomeSearch');
    const box=document.getElementById('vxElxHomeSearchResults');
    return !!(input&&document.activeElement===input)||!!(box&&!box.hidden);
  }
  function rerender(){if(elx.screen==='board')renderDynamic();else if(elx.screen!=='closed'&&!searchInUse())renderHome();}

  async function refresh(){
    elx.loading=elx.orders.length===0;rerender();
    try{
      elx.orders=await fetchServiceOrders();
      elx.error=null;
    }catch(e){elx.error=e.message;}
    elx.loading=false;
    rerender();
    const errBox=document.getElementById('vxElxError');
    if(errBox)errBox.textContent=elx.error||'';
    if(errBox)errBox.style.display=elx.error?'block':'none';
    try{const s=await fetchSyncStatus();elx.lastSyncAt=s.lastSyncAt;}catch(_e){}
    const syncLabel=document.getElementById('vxElxLastSync');
    if(syncLabel)syncLabel.textContent=elx.lastSyncAt?('Última sincronização às '+new Date(elx.lastSyncAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})):'';
  }

  function stopPoll(){if(elx.pollTimer){clearInterval(elx.pollTimer);elx.pollTimer=null;}}
  // Achado do usuário 2026-09-03: NPS Electrolux (electrolux-nps-v0826.js,
  // window.vxOpenNpsScreen) troca #app SEM passar por window.render(), então
  // state.view continua 'electrolux' -- o poll deste módulo (15s) seguia
  // rodando e, a cada tick, chamava renderHome() por baixo do usuário,
  // chutando ele de volta pro Início do Electrolux enquanto olhava o NPS.
  // Exposto pra NPS parar o poll ao entrar; "Voltar" já chama
  // window.render('electrolux') -> renderPage() -> startPoll() de novo.
  window.vxElxStopPoll=stopPoll;
  function startPoll(){
    stopPoll();
    elx.pollTimer=setInterval(()=>{if(state.view!==VIEW){stopPoll();return;}refresh();},POLL_MS);
  }

  // Achado do usuário 2026-09-03: só GESTOR pode configurar (RLS de
  // electrolux_panel_settings já bloqueia escrita pra outros perfis --
  // esconder o formulário pra eles é só clareza de UI, não a proteção
  // real, que já está no banco).
  function apiConfigBlock(){
    const base=apiBase();
    if(String(state?.profile?.role||'').toUpperCase()!=='GESTOR'){
      return `<div class="vx-elx-config"><span>API Electrolux:</span><span style="color:#516375">${base?esc(base):'Nenhum endereço configurado ainda -- peça a um Gestor pra configurar.'}</span><a href="${SOURCE_REPO}" target="_blank" rel="noopener" style="margin-left:auto;color:#174f86;font-size:10.5px">Projeto no GitHub ↗</a></div>`;
    }
    return `<div class="vx-elx-config">
      <span>API Electrolux (empresa toda):</span>
      <input type="url" id="vxElxApiInput" placeholder="https://endereco-do-backend-electrolux" value="${esc(base)}">
      <button id="vxElxApiSave">Salvar</button>
      ${base?`<button class="secondary" id="vxElxApiClear">Remover</button>`:''}
      <a href="${SOURCE_REPO}" target="_blank" rel="noopener" style="margin-left:auto;color:#174f86;font-size:10.5px">Projeto no GitHub ↗</a>
    </div>`;
  }
  function bindApiConfig(){
    const input=document.getElementById('vxElxApiInput');
    if(!input)return; // não-GESTOR: bloco é só leitura, nada pra ligar
    input.onclick=e=>e.stopPropagation();
    document.getElementById('vxElxApiSave').onclick=async()=>{
      const value=(input.value||'').trim().replace(/\/+$/,'');
      if(!/^https?:\/\//.test(value)){toast?.('Informe um endereço http(s) válido.','err');return;}
      try{
        await saveApiUrlSetting(value);
        toast?.('Endereço salvo -- vale pra empresa toda, em qualquer dispositivo.');
        elx.orders=[];elx.error=null;renderHome();refresh();startPoll();
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');}
    };
    const clearBtn=document.getElementById('vxElxApiClear');
    if(clearBtn)clearBtn.onclick=async()=>{
      try{await clearApiUrlSetting();stopPoll();elx.orders=[];renderHome();}
      catch(err){toast?.('Não foi possível remover: '+err.message,'err');}
    };
  }

  /* ---------- Card de entrada do NPS Electrolux ----------
     Achado do usuário em 2026-09-02: o NPS Electrolux é uma função
     nativa da operação Electrolux e não deve aparecer como item
     separado fora deste módulo (antes vivia como botão avulso na
     Agenda Externa, ver electrolux-nps-v0826.js). Só ponto de entrada
     visual/navegação -- a tela, os dados, o backend, a sincronização,
     elegibilidade, histórico e permissões do NPS continuam 100%
     intactos em electrolux-nps-v0826.js, chamados aqui via
     window.vxOpenNpsScreen(). Estilo isolado (módulo isolado, mesma
     filosofia do cabeçalho deste arquivo) -- não toca
     all-menus-layout.css. */
  function ensureNpsEntryStyle(){
    if(document.getElementById('vxElxNpsEntryStyle'))return;
    const s=document.createElement('style');
    s.id='vxElxNpsEntryStyle';
    s.textContent=`.vx-elx-nps-entry{display:flex;align-items:center;gap:14px;background:#f6f2fc;border:1px solid #c9b8ec;border-radius:10px;padding:14px 18px;margin:2px 0}
.vx-elx-nps-icon{flex:none;width:44px;height:44px;border-radius:10px;background:#7c4fd1;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:.03em;line-height:1.1}
.vx-elx-nps-icon span{font-size:15px;line-height:1}
.vx-elx-nps-text{flex:1;min-width:0}
.vx-elx-nps-text strong{display:block;font-size:14px;color:#4a2e8a;letter-spacing:.02em}
.vx-elx-nps-text p{margin:2px 0 0;font-size:12px;color:#6a5a94}
.vx-elx-nps-btn{flex:none;border:0;background:#7c4fd1;color:#fff;font-weight:700;font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer;white-space:nowrap}
.vx-elx-nps-btn:hover{background:#6a3fc0}
@media(max-width:640px){.vx-elx-nps-entry{flex-direction:column;align-items:flex-start}}`;
    document.head.appendChild(s);
  }
  function npsEntryCard(){
    ensureNpsEntryStyle();
    return `<div class="vx-elx-nps-entry">
      <div class="vx-elx-nps-icon">NPS<span>🙂</span></div>
      <div class="vx-elx-nps-text"><strong>NPS ELECTROLUX</strong><p>Acompanhe, envie e gerencie as pesquisas de satisfação NPS dos atendimentos Electrolux.</p></div>
      <button type="button" class="vx-elx-nps-btn" id="vxElxNpsEntryBtn">ACESSAR NPS →</button>
    </div>`;
  }

  /* ---------- Encerradas + Consulta geral de OS (achado do usuário 2026-09-03) ----------
     fetchServiceOrders() (GET /api/dashboard/service-orders) exclui
     Encerrada/Cancelada da listagem viva -- confirmado na auditoria de NPS
     desta sessão (sync-electrolux-agenda, mesmo comentário). Pra OS já
     encerrada, a fonte é a cópia local já sincronizada em
     external_appointments (Supabase, origin=ELECTROLUX) -- nunca inventa
     endpoint novo. "Encerradas" mostra só o que ainda está dentro da
     janela em que a Electrolux mantém a SVO disponível (~60 dias,
     mesma janela usada em sync-electrolux-nps) -- passado isso a origem
     já não tem mais o registro, então não faz sentido listar como "ainda
     disponível na busca". A consulta geral une abertas (em memória) e
     encerradas (Supabase) numa busca só, porque o usuário pode não saber
     ainda em qual das duas a OS está. */
  const CLOSED_WINDOW_DAYS=60;
  const CLOSED_STATUS_LABEL={CONCLUIDO:'Concluído',CANCELADO:'Cancelado'};
  const NPS_SIT_LABEL_MINI={
    AGUARDANDO_ENCERRAMENTO:'NPS: aguardando',AGUARDANDO_PRAZO_NPS:'NPS: em carência',AGUARDANDO_CONTATO:'NPS: aguardando contato',
    PRIMEIRO_CONTATO_ENVIADO:'NPS: contatado',AGUARDANDO_RESPOSTA:'NPS: aguardando resposta',LEMBRETE_ENVIADO:'NPS: lembrete enviado',
    CLIENTE_CONFIRMOU_RESPOSTA:'NPS: cliente confirmou',CLIENTE_NAO_RECEBEU:'NPS: não recebeu',CLIENTE_NAO_RESPONDEU:'NPS: não respondeu',
    CLIENTE_NAO_DESEJA_CONTATO:'NPS: sem contato',CASO_DE_ATENCAO:'NPS: caso de atenção',FINALIZADO:'NPS: não elegível',RESPONDIDO:'NPS respondido',
  };
  let closedCache=null; // {rows, filialById, npsByAppointmentId}

  async function fetchFilialMap(){
    const rows=await api('electrolux_connections?select=id,filial').catch(()=>[]);
    return Object.fromEntries(rows.map(c=>[c.id,c.filial]));
  }

  async function fetchClosedAppointments(){
    const windowStart=new Date(Date.now()-CLOSED_WINDOW_DAYS*86400000).toISOString();
    const [rows,filialById]=await Promise.all([
      api(`external_appointments?select=id,external_id,external_order_number,client_name,client_phone,status,concluded_at,notes,connection_id&origin=eq.ELECTROLUX&status=in.(CONCLUIDO,CANCELADO)&concluded_at=gte.${windowStart}&order=concluded_at.desc.nullslast&limit=300`).catch(()=>[]),
      fetchFilialMap(),
    ]);
    const ids=rows.map(r=>r.id);
    let npsByAppointmentId={};
    if(ids.length){
      const cases=await api(`nps_cases?select=external_appointment_id,situacao,nps_score&external_appointment_id=in.(${ids.join(',')})`).catch(()=>[]);
      npsByAppointmentId=Object.fromEntries(cases.map(c=>[c.external_appointment_id,c]));
    }
    return {rows,filialById,npsByAppointmentId};
  }

  async function ensureClosedCache(force){
    if(closedCache&&!force)return closedCache;
    closedCache=await fetchClosedAppointments();
    return closedCache;
  }

  function npsBadge(npsCase){
    if(!npsCase)return '<span class="vx-elx-nps-mini muted">Sem NPS</span>';
    const cls=npsCase.situacao==='RESPONDIDO'?'ok':(npsCase.situacao==='CASO_DE_ATENCAO'?'warn':'');
    const label=(npsCase.situacao==='RESPONDIDO'&&npsCase.nps_score!=null)?`NPS ${npsCase.nps_score}/10`:(NPS_SIT_LABEL_MINI[npsCase.situacao]||npsCase.situacao);
    return `<span class="vx-elx-nps-mini ${cls}">${esc(label)}</span>`;
  }

  function filialLabel(f){return f==='SERRA'?'Serra':(f==='VITORIA'?'Vitória':'—');}

  async function fetchClosedDetail(externalId){
    if(!window.CFG||!state.session?.access_token)return null;
    try{
      const res=await fetch(`${CFG.url}/functions/v1/get-electrolux-appointment-detail`,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${state.session.access_token}`,apikey:CFG.key},
        body:JSON.stringify({externalId})
      });
      if(!res.ok)return null;
      return res.json();
    }catch{return null;}
  }

  function closedDetailModal(row,filial,npsCase){
    const wrap=document.createElement('div');
    wrap.className='vx-elx-modal-wrap';
    wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
    wrap.innerHTML=`<div class="vx-elx-modal">
      <div class="vx-elx-modal-head"><div><h3>${esc(row.external_order_number||row.external_id)}</h3><small>${esc(CLOSED_STATUS_LABEL[row.status]||row.status)}${filial?' · '+esc(filialLabel(filial)):''}</small></div><button class="vx-elx-modal-close">✕</button></div>
      <div class="vx-elx-modal-body">
        <div class="vx-elx-kv"><b>NPS</b><span>${npsBadge(npsCase)}</span></div>
        ${detailKv('Cliente',row.client_name)}
        ${detailKv('Telefone',row.client_phone)}
        ${detailKv('Encerrada em',row.concluded_at?new Date(row.concluded_at).toLocaleString('pt-BR'):'—')}
        ${detailKv('Observação',row.notes)}
        <div class="vx-elx-modal-section" id="vxElxClosedExtra"><small>Carregando endereço…</small></div>
      </div>
    </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('.vx-elx-modal-close').onclick=()=>wrap.remove();
    fetchClosedDetail(row.external_id).then(detail=>{
      const box=wrap.querySelector('#vxElxClosedExtra');
      if(!box)return;
      box.innerHTML=detail?.address
        ?`<h4>Endereço</h4><p style="margin:0;font-size:12px;color:#17324d">${esc([detail.address.street,detail.address.neighborhood,detail.address.city,detail.address.state].filter(Boolean).join(', ')||'Não informado')}</p>`
        :`<small>Não foi possível carregar o endereço agora (SVO pode já ter saído da janela de ~${CLOSED_WINDOW_DAYS} dias na origem).</small>`;
    });
  }

  function matchesClosedSearch(row,query){
    const trimmed=(query||'').trim();if(!trimmed)return true;
    const digitsQuery=trimmed.replace(/\D/g,'');
    if(digitsQuery.length>=4&&row.client_phone&&String(row.client_phone).includes(digitsQuery))return true;
    return normalizeSearchText([row.external_order_number,row.client_name].filter(Boolean).join(' ')).includes(normalizeSearchText(trimmed));
  }

  function renderClosedScreen(){
    elx.screen='closed';
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML=`<div class="vx-elx-page">
      <div class="vx-elx-board-head">
        <div><button type="button" class="vx-elx-back" id="vxElxClosedBack">← VOLTAR</button><h2>OS Encerradas</h2></div>
        <span style="color:#60728a;font-size:11px">Ainda disponíveis na origem (~${CLOSED_WINDOW_DAYS} dias após o encerramento)</span>
      </div>
      <div class="vx-elx-error" id="vxElxClosedError" style="display:none"></div>
      <div class="desktop-filterbar vx-elx-filterbar" style="grid-template-columns:1fr auto!important">
        <label>BUSCAR<input id="vxElxClosedSearch" placeholder="SVO, cliente ou telefone..."></label>
        <span class="vx-elx-filtercount" id="vxElxClosedCount"></span>
      </div>
      <div id="vxElxClosedBody"><div class="vx-elx-empty-board">Carregando OS encerradas…</div></div>
    </div>`;
    document.getElementById('vxElxClosedBack').onclick=()=>renderHome();
    let query='';
    const renderRows=()=>{
      const body=document.getElementById('vxElxClosedBody');
      const countEl=document.getElementById('vxElxClosedCount');
      if(!body)return;
      if(!closedCache){body.innerHTML=`<div class="vx-elx-empty-board">Carregando OS encerradas…</div>`;return;}
      const {rows,filialById,npsByAppointmentId}=closedCache;
      const filtered=rows.filter(r=>matchesClosedSearch(r,query));
      if(countEl)countEl.textContent=`${filtered.length} de ${rows.length} OS encerrada(s)`;
      if(!filtered.length){body.innerHTML=`<div class="vx-elx-empty-board">Nenhuma OS encerrada encontrada nessa janela.</div>`;return;}
      body.innerHTML=`<div class="desktop-table-wrap"><table class="desktop-table"><thead><tr>
        <th>SVO</th><th>CLIENTE</th><th>TELEFONE</th><th>FILIAL</th><th>SITUAÇÃO</th><th>ENCERRADA EM</th><th>NPS</th>
        </tr></thead><tbody>${filtered.map(r=>{
          const filial=r.connection_id?filialById[r.connection_id]:null;
          return `<tr data-closed="${esc(r.id)}">
            <td><b>${esc(r.external_order_number||r.external_id)}</b></td>
            <td>${esc(r.client_name||'—')}</td>
            <td>${esc(r.client_phone||'—')}</td>
            <td>${esc(filialLabel(filial))}</td>
            <td><span class="vx-elx-status-pill">${esc(CLOSED_STATUS_LABEL[r.status]||r.status)}</span></td>
            <td>${r.concluded_at?new Date(r.concluded_at).toLocaleString('pt-BR'):'—'}</td>
            <td>${npsBadge(npsByAppointmentId[r.id])}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
      body.querySelectorAll('[data-closed]').forEach(tr=>tr.onclick=()=>{
        const row=rows.find(r=>String(r.id)===tr.dataset.closed);
        if(row)closedDetailModal(row,row.connection_id?filialById[row.connection_id]:null,npsByAppointmentId[row.id]);
      });
    };
    document.getElementById('vxElxClosedSearch').oninput=e=>{query=e.target.value;renderRows();};
    ensureClosedCache().then(renderRows).catch(()=>{
      const err=document.getElementById('vxElxClosedError');
      if(err){err.textContent='Não foi possível carregar as OS encerradas.';err.style.display='block';}
    });
  }

  // Achado do usuário 2026-09-03: a ideia não é um botão que abre um campo
  // pra digitar -- é o campo já estar ali, digitável direto, igual ao
  // BUSCAR do quadro (renderBoardScreen). Substituído o modal por uma
  // barra de busca fixa no topo do Início, com resultado em dropdown.
  function bindHomeSearch(){
    const input=document.getElementById('vxElxHomeSearch');
    const box=document.getElementById('vxElxHomeSearchResults');
    if(!input||!box)return;
    let debounceTimer=null,cache=null;
    const hide=()=>{box.hidden=true;box.innerHTML='';};
    const runSearch=async()=>{
      const q=input.value.trim();
      if(q.length<2){hide();return;}
      box.hidden=false;box.innerHTML=`<small style="padding:6px 4px;display:block">Buscando…</small>`;
      const openMatches=elx.orders.filter(so=>matchesSearch(so,q));
      try{cache=await ensureClosedCache();}catch{}
      const closedMatches=cache?cache.rows.filter(r=>matchesClosedSearch(r,q)):[];
      if(!openMatches.length&&!closedMatches.length){box.innerHTML=`<small style="padding:6px 4px;display:block">Nenhuma OS encontrada, aberta ou encerrada.</small>`;return;}
      const openHtml=openMatches.length?`<div class="vx-elx-search-group-label">Em aberto (${openMatches.length})</div>${openMatches.map(so=>`<div class="vx-elx-search-row" data-open="${esc(so.id)}"><b>${esc(so.svoNumber)}</b> <span class="vx-elx-status-pill">${esc(so.status)}</span><br><small>${esc(so.clientName||'—')}</small></div>`).join('')}`:'';
      const closedHtml=closedMatches.length?`<div class="vx-elx-search-group-label">Encerradas (${closedMatches.length})</div>${closedMatches.map(r=>`<div class="vx-elx-search-row" data-closed="${esc(r.id)}"><b>${esc(r.external_order_number||r.external_id)}</b> <span class="vx-elx-status-pill">${esc(CLOSED_STATUS_LABEL[r.status]||r.status)}</span><br><small>${esc(r.client_name||'—')}</small></div>`).join('')}`:'';
      box.innerHTML=openHtml+closedHtml;
      box.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>{hide();input.value='';openDetail(el.dataset.open);});
      box.querySelectorAll('[data-closed]').forEach(el=>el.onclick=()=>{
        if(!cache)return;
        const row=cache.rows.find(r=>String(r.id)===el.dataset.closed);
        if(row){hide();input.value='';closedDetailModal(row,row.connection_id?cache.filialById[row.connection_id]:null,cache.npsByAppointmentId[row.id]);}
      });
    };
    input.oninput=()=>{clearTimeout(debounceTimer);debounceTimer=setTimeout(runSearch,250);};
    input.onfocus=()=>{if(input.value.trim().length>=2)runSearch();};
    document.addEventListener('click',e=>{if(!e.target.closest('#vxElxHomeSearchBar'))hide();});
  }

  /* ---------- Tela inicial: hub no padrão dos demais módulos (module-summary-card +
     module-action-card, ver all-menus-layout.js / atendimento(), oficina() etc.) ---------- */
  function renderHome(){
    elx.screen='home';elx.activeGroupKey=null;elx.staleFilter=false;elx.agingFilter=null;
    const app=document.querySelector('#app');if(!app)return;
    const all=elx.orders;
    const stale=all.filter(so=>daysSinceUpdate(so)>=2).length;
    const garantia=all.filter(so=>orderTypeCategoryFor(so.orderType)==='Garantia').length;
    const foraGarantia=all.filter(so=>orderTypeCategoryFor(so.orderType)==='Fora de Garantia').length;
    const atrasadas15=all.filter(so=>so.agingDays>15).length;
    const active=key=>elx.homeFilter&&elx.homeFilter.key===key;
    const filtered=all.filter(matchesHomeFilter);
    const groupCards=GROUPS.map(g=>{
      const n=filtered.filter(so=>groupFor(so.status)===g.key).length;
      return `<button type="button" class="module-action-card ${g.color}" data-group="${g.key}"><span class="icon">${g.icon}</span><span><strong>${esc(g.label)}</strong><small>${esc(g.desc)}</small></span><b class="vx-elx-group-count">${n}</b></button>`;
    }).join('');
    const outrosCount=filtered.length-GROUPS.reduce((acc,g)=>acc+filtered.filter(so=>groupFor(so.status)===g.key).length,0);
    // Achado do usuário em 2026-09-02: "Outros Status" era condicional
    // (só aparecia com contagem > 0), diferente dos outros 8 grupos
    // (sempre visíveis, mesmo em 0) -- depois de unificar com "Outros
    // Atendimentos" (removido do GROUPS acima), isso fazia parecer que
    // os DOIS cards tinham sumido sempre que a contagem zerava.
    // Agora sempre visível, igual aos demais 8.
    const outrosCard=`<button type="button" class="module-action-card gray" data-group="outros"><span class="icon">⚑</span><span><strong>OUTROS STATUS</strong><small>Situações da SAE ainda não mapeadas nos grupos acima.</small></span><b class="vx-elx-group-count">${outrosCount}</b></button>`;

    app.innerHTML=`<div class="module-home">
      <div class="module-home-head">
        <div><h2>Electrolux</h2><p>PAINEL DE TRIAGEM • SVOs SAE ELECTROLUX</p></div>
        <div class="module-head-actions">
          <span id="vxElxLastSync" style="align-self:center;color:#60728a;font-size:11px;margin-right:2px"></span>
          <button class="blue" id="vxElxSync">↻ SINCRONIZAR AGORA</button>
          <button class="gray" id="vxElxViewAll">VER TODAS AS SVOs</button>
          <button class="gray" id="vxElxClosedBtn">✔ ENCERRADAS</button>
        </div>
      </div>
      <div class="desktop-filterbar vx-elx-home-search-bar" id="vxElxHomeSearchBar">
        <label>BUSCAR OS (ABERTAS E ENCERRADAS)<input id="vxElxHomeSearch" placeholder="SVO, cliente ou telefone..." autocomplete="off"><div class="vx-elx-search-dropdown" id="vxElxHomeSearchResults" hidden></div></label>
      </div>
      <div class="vx-elx-error" id="vxElxError" style="display:none"></div>
      <div class="module-summary vx-elx-summary-5">
        <button type="button" class="module-summary-card ${active('abertas')?'vx-elx-summary-active':''}" style="--accent:#2674d9" data-summary="abertas"><span>SVOs ABERTAS</span><b>${all.length}</b></button>
        <button type="button" class="module-summary-card ${active('stale')?'vx-elx-summary-active':''}" style="--accent:${stale?'#e87a00':'#2674d9'}" data-summary="stale"><span>SEM ALTERAÇÃO HÁ +2 DIAS</span><b>${stale}</b></button>
        <button type="button" class="module-summary-card ${active('atrasadas15')?'vx-elx-summary-active':''}" style="--accent:${atrasadas15?'#cf3542':'#2674d9'}" data-summary="atrasadas15"><span>ABERTAS HÁ MAIS DE 15 DIAS</span><b>${atrasadas15}</b></button>
        <button type="button" class="module-summary-card ${active('garantia')?'vx-elx-summary-active':''}" style="--accent:#2674d9" data-summary="garantia"><span>GARANTIA</span><b>${garantia}</b></button>
        <button type="button" class="module-summary-card ${active('foradegarantia')?'vx-elx-summary-active':''}" style="--accent:#60728a" data-summary="foradegarantia"><span>FORA DE GARANTIA</span><b>${foraGarantia}</b></button>
      </div>
      ${npsEntryCard()}
      ${elx.homeFilter?`<div class="vx-elx-filtercount" style="padding:0 2px">Mostrando os 9 menus filtrados por: <b>${esc(elx.homeFilter.label)}</b> (${filtered.length} de ${all.length} SVO(s)) — clique novamente no card pra limpar.</div>`:''}
      <div class="module-action-grid">${groupCards}${outrosCard}</div>
      ${apiConfigBlock()}
    </div>`;

    document.getElementById('vxElxNpsEntryBtn')?.addEventListener('click',()=>window.vxOpenNpsScreen?.());
    app.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{
      const g=GROUPS.find(x=>x.key===b.dataset.group);
      renderBoardScreen({label:g?g.label:'OUTROS STATUS',groupKey:b.dataset.group,...homeFilterToBoardOpts()});
    });
    app.querySelectorAll('[data-summary]').forEach(b=>b.onclick=()=>{
      const key=b.dataset.summary;
      const defs={
        stale:{key:'stale',type:'stale',label:'Sem alteração há mais de 2 dias'},
        atrasadas15:{key:'atrasadas15',type:'aging',over:15,label:'Abertas há mais de 15 dias'},
        garantia:{key:'garantia',type:'orderType',value:'Garantia',label:'Garantia'},
        foradegarantia:{key:'foradegarantia',type:'orderType',value:'Fora de Garantia',label:'Fora de Garantia'},
      };
      const next=defs[key]||null; // 'abertas' não tem def -> limpa o filtro
      elx.homeFilter=(elx.homeFilter&&elx.homeFilter.key===key)?null:next;
      renderHome();
    });
    document.getElementById('vxElxViewAll').onclick=()=>renderBoardScreen({label:'Todas as SVOs',...homeFilterToBoardOpts()});
    document.getElementById('vxElxClosedBtn').onclick=()=>renderClosedScreen();
    bindHomeSearch();
    document.getElementById('vxElxSync').onclick=async()=>{
      const btn=document.getElementById('vxElxSync');if(btn){btn.disabled=true;btn.textContent='SINCRONIZANDO…';}
      try{await triggerSyncNow();await refresh();}catch(e){toast?.(e.message,'err');}
      if(btn){btn.disabled=false;btn.textContent='↻ SINCRONIZAR AGORA';}
    };
    bindApiConfig();
    if(!elx.orders.length && !elx.loading && apiBase()){refresh();}
  }

  /* ---------- Tela de board: Kanban filtrado (por grupo, tipo ou atraso), com busca. ---------- */
  function renderBoardScreen(opts){
    opts=opts||{};
    elx.screen='board';elx.activeGroupKey=opts.groupKey||null;
    elx.staleFilter=!!opts.stale;
    elx.agingFilter=opts.agingOver||null;
    elx.statusFilter=new Set();
    elx.orderTypeFilter=new Set(opts.orderTypes||[]);
    elx.search='';elx.dateFilter='all';
    const app=document.querySelector('#app');if(!app)return;
    const label=opts.label||'Todas as SVOs';
    app.innerHTML=`<div class="vx-elx-page">
      <div class="vx-elx-board-head">
        <div><button type="button" class="vx-elx-back" id="vxElxBack">← VOLTAR</button><h2>${esc(label)}</h2></div>
        <span id="vxElxLastSync" style="color:#60728a;font-size:11px"></span>
      </div>
      <div class="vx-elx-error" id="vxElxError" style="display:none"></div>
      <div class="desktop-metrics" id="vxElxMetrics" style="grid-template-columns:repeat(3,1fr)"></div>
      <div class="desktop-filterbar vx-elx-filterbar">
        <label>BUSCAR<input id="vxElxSearch" placeholder="SVO, cliente, telefone, modelo..." value="${esc(elx.search)}"></label>
        <label>PERÍODO<select id="vxElxDateFilter">${DATE_FILTER_OPTIONS.map(o=>`<option value="${o.value}" ${o.value===elx.dateFilter?'selected':''}>${o.label}</option>`).join('')}</select></label>
        <label>STATUS DA SVO<div class="vx-elx-msel" id="vxElxStatusMsel"><button type="button" class="vx-elx-msel-btn">${elx.statusFilter.size?elx.statusFilter.size+' selecionado(s)':'Selecionar'} ▾</button><div class="vx-elx-msel-panel">${multiSelectPanel('status',SAE_STATUSES,elx.statusFilter)}</div></div></label>
        <label>TIPO DA SVO<div class="vx-elx-msel" id="vxElxTypeMsel"><button type="button" class="vx-elx-msel-btn">${elx.orderTypeFilter.size?elx.orderTypeFilter.size+' selecionado(s)':'Selecionar'} ▾</button><div class="vx-elx-msel-panel">${multiSelectPanel('type',ORDER_TYPES,elx.orderTypeFilter)}</div></div></label>
        <span class="vx-elx-filtercount" id="vxElxFilterCount"></span>
      </div>
      <div class="vx-elx-view-toggle">
        <button type="button" class="vx-elx-view-btn ${elx.viewMode==='kanban'?'active':''}" data-mode="kanban">▦ QUADRO</button>
        <button type="button" class="vx-elx-view-btn ${elx.viewMode==='list'?'active':''}" data-mode="list">☰ LISTA</button>
      </div>
      <div class="vx-elx-board" id="vxElxBoard"></div>
    </div>`;

    document.getElementById('vxElxBack').onclick=()=>renderHome();
    document.getElementById('vxElxSearch').oninput=e=>{elx.search=e.target.value;renderDynamic();};
    document.getElementById('vxElxDateFilter').onchange=e=>{elx.dateFilter=e.target.value;renderDynamic();};
    bindMultiSelect('vxElxStatusMsel','status',elx.statusFilter);
    bindMultiSelect('vxElxTypeMsel','type',elx.orderTypeFilter);
    app.querySelectorAll('.vx-elx-view-btn').forEach(b=>b.onclick=()=>{
      elx.viewMode=b.dataset.mode;localStorage.setItem(VIEW_MODE_KEY,elx.viewMode);
      app.querySelectorAll('.vx-elx-view-btn').forEach(x=>x.classList.toggle('active',x===b));
      renderDynamic();
    });

    renderDynamic();
    const syncLabel=document.getElementById('vxElxLastSync');
    if(syncLabel)syncLabel.textContent=elx.lastSyncAt?('Última sincronização às '+new Date(elx.lastSyncAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})):'';
    if(!elx.orders.length && !elx.loading && apiBase()){refresh();}
  }

  async function renderPage(){
    installStyle();ensureNav();
    try{state.view=VIEW;if(typeof addTab==='function')addTab(VIEW,'Electrolux');}catch(_e){}
    const title=document.querySelector('#title');if(title)title.textContent='Electrolux';
    document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===VIEW));
    try{if(typeof renderTabs==='function')renderTabs('Electrolux');}catch(_e){}
    // Achado do usuário 2026-09-03: endereço vem do banco agora (config
    // do sistema, não do navegador) -- carrega antes do primeiro render
    // pra não piscar "configure abaixo" indevidamente pra quem já tem
    // endereço salvo por outro dispositivo/usuário.
    await loadApiUrlSetting();
    renderHome();
    if(apiBase()){startPoll();}
  }

  const priorRender=window.render;
  window.render=function(view){
    if(view!==VIEW)stopPoll();
    if(view===VIEW)return renderPage();
    return priorRender.apply(this,arguments);
  };

  document.addEventListener('click',()=>{document.querySelectorAll('.vx-elx-msel.open').forEach(o=>o.classList.remove('open'));});

  const mo=new MutationObserver(()=>ensureNav());
  mo.observe(document.documentElement,{childList:true,subtree:true});
  installStyle();ensureNav();setTimeout(ensureNav,250);setTimeout(ensureNav,1000);
})();
