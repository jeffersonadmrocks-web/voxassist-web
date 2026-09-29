/* VoxAssist Web — módulo Whirlpool (V2, 2026-09-29): painel de gestão com
   duas abas.

   Achado do usuário (2026-09-29): a v1 deste arquivo só mostrava status do
   robô/importação (catálogo + fila) -- nunca mostrava a situação REAL da
   OS Whirlpool já dentro do VoxAssist (aprovação, conserto, peça, entrega,
   finalizada), que é o que o gestor realmente acompanha no dia a dia.
   V2 reorganiza em duas abas:
     - "Ordens de Serviço" (aba padrão ao abrir): 9 situações, misturando
       o status do PORTAL (Agendar/Em processo AT/Agendado -- só existe
       pra quem o robô já catalogou) com o status INTERNO da OS (mesmo
       motor único de toda OS do sistema, os-status-engine-v0903.js) pra
       quem já foi importado ou aberto manualmente. Pega TODA OS
       Whirlpool/Brastemp/Consul, venha de onde vier -- filtro por
       equipments.brand (regex, único jeito confiável hoje: document_model
       só existe no equipamento importado pelo robô, brand é o campo que
       toda OS, manual ou importada, sempre tem).
     - "Robô e Importação" (uso GESTOR): só os 5 pontos de atenção do
       robô que HOJE não têm nenhuma ação na tela (aguardando operador,
       aguardando conexão, agendamento pendente manual, erro com 5+
       tentativas, suspeita de exclusão) -- о gap real que motivou este
       módulo (achado 2026-09-28: os campos last_error_code/
       manual_completed_by/at já existiam no banco desde a fundação
       (whirlpool_robot_foundation) mas nunca tinham UI nenhuma).

   Mesma disciplina de módulo isolado da v1 (nunca edita app.js, só
   embrulha window.render) -- ver header original preservado abaixo. */
(function(){
  const VIEW='whirlpool-portal';
  try{ if(typeof navMap!=='undefined') navMap[VIEW]='WP / Seguradora'; }catch(_e){}

  const BRAND_RE=/whirlpool|brastemp|consul/i;
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const dtFull=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const dtShort=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
  const myId=()=>state?.session?.user?.id||null;
  const daysSince=d=>d?Math.max(0,Math.floor((Date.now()-new Date(d).getTime())/86400000)):0;

  const LABELS={
    NAO_CONFIGURADO:'NÃO CONFIGURADO',PRONTO:'PRONTO',
    CONECTADO:'CONECTADO',CREDENCIAIS_INVALIDAS:'CREDENCIAIS INVÁLIDAS',
    AGUARDANDO_CONEXAO_WHIRLPOOL:'AGUARDANDO WHIRLPOOL',PAUSADO:'PAUSADO'
  };
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
      .vx-wpp-status-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:0}
      .vx-wpp-badge{display:inline-block;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800;text-transform:uppercase}
      .vx-wpp-badge.ok{background:#e7f6ee;color:#0b6f3c}
      .vx-wpp-badge.warn{background:#fdf3e3;color:#a35b00}
      .vx-wpp-badge.crit{background:#fbeaea;color:#a63131}
      .vx-wpp-error{background:#fbeaea;color:#a63131;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;margin-top:10px}
      .vx-wpp-locked{font-size:11.5px;font-weight:700;color:#8494a6}
      .vx-wpp2-tabs{display:flex;gap:4px;background:#eef1f5;border-radius:9px;padding:4px;margin:2px 0 14px;width:fit-content}
      .vx-wpp2-tabs button{border:0;border-radius:6px;padding:8px 16px;font-size:12.5px;font-weight:800;background:transparent;color:#58708d;cursor:pointer}
      .vx-wpp2-tabs button.active{background:#0c2340;color:#fff}
      .vx-wpp2-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:8px 0 4px}
      .vx-wpp2-grid.robot{grid-template-columns:repeat(5,minmax(0,1fr))}
      .vx-wpp2-grid .module-summary-card{min-height:92px;display:flex;flex-direction:column;align-items:flex-start}
      .vx-wpp2-grid .module-summary-card small{display:block;color:#7c8ba0;font-size:11px;margin-top:6px;line-height:1.35;font-weight:400;text-transform:none;white-space:normal}
      .vx-wpp2-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
      .vx-wpp2-filters input{flex:1;min-width:220px;border:1px solid #cfd7e1;border-radius:8px;padding:8px 10px;font-size:12.5px}
      .vx-wpp2-chip{border:1px solid #cfd7e1;border-radius:7px;padding:7px 12px;font-size:12px;font-weight:700;background:#fff;color:#58708d;cursor:pointer}
      .vx-wpp2-chip.active{background:#0c2340;color:#fff;border-color:#0c2340}
      .vx-wpp2-list-table{width:100%;border-collapse:collapse;background:#fff}
      .vx-wpp2-list-table th{text-align:left;font-size:10.5px;color:#7c8ba0;text-transform:uppercase;padding:9px 10px;border-bottom:1px solid #e3e8ee}
      .vx-wpp2-list-table td{font-size:12.5px;color:#172033;padding:9px 10px;border-bottom:1px solid #eef1f5;vertical-align:middle}
      .vx-wpp2-list-table tr:last-child td{border-bottom:0}
      .vx-wpp2-list-table button{border:1px solid #cfd7e1;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:700;background:#f7f9fb;color:#0c2340;cursor:pointer;white-space:nowrap}
      .vx-wpp2-list-table button.danger{border-color:#e0a8a8;color:#a13c3c}
      .vx-wpp2-list-table button.warn{border-color:#cdae55;color:#7a5c0f}
      .vx-wpp2-empty2{padding:28px;text-align:center;color:#7c8ba0;font-size:13px}
      .vx-wpp2-viewtoggle{display:flex;border:1px solid #cfd7e1;border-radius:9px;overflow:hidden;margin-left:auto}
      .vx-wpp2-view-btn{border:0;padding:8px 14px;font-size:11.5px;font-weight:800;background:#fff;color:#58708d;cursor:pointer}
      .vx-wpp2-view-btn.active{background:#0c2340;color:#fff}
      .vx-wpp2-situ-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
      .vx-wpp2-situ-chips .vx-wpp2-chip{padding:5px 10px;font-size:11px}
      .vx-wpp2-list-table tr[data-item]{cursor:pointer}
      .vx-wpp2-list-table tr[data-item]:hover td{background:#f7f9fb}
      .vx-wpp2-pill{display:inline-block;border:1px solid #cfd7e1;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;color:#172033;white-space:nowrap}
      .vx-wpp2-type{display:inline-block;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;background:#eef1f5;color:#58708d;white-space:nowrap}
      .vx-wpp2-sla{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700}
      .vx-wpp2-sla i{width:8px;height:8px;border-radius:50%;display:inline-block}
      .vx-wpp2-sla.green i{background:#0b6f3c}.vx-wpp2-sla.green{color:#0b6f3c}
      .vx-wpp2-sla.yellow i{background:#a35b00}.vx-wpp2-sla.yellow{color:#a35b00}
      .vx-wpp2-sla.red i{background:#a63131}.vx-wpp2-sla.red{color:#a63131}
      .vx-wpp2-kanban{display:flex;gap:10px;overflow-x:auto;align-items:flex-start;padding-bottom:6px}
      .vx-wpp2-kcol{min-width:250px;max-width:250px;background:#f7f9fb;border:1px solid #e3e8ee;border-radius:10px;padding:8px}
      .vx-wpp2-kcol-head{display:flex;justify-content:space-between;align-items:center;border-top:3px solid #8494a6;padding:4px 4px 8px;font-size:11px;font-weight:800;color:#172033}
      .vx-wpp2-kcard{background:#fff;border:1px solid #e3e8ee;border-radius:8px;padding:9px 10px;margin-bottom:8px}
      .vx-wpp2-kcard-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
      .vx-wpp2-kcard-top b{font-size:12.5px;color:#172033}
      .vx-wpp2-kcard-client{font-size:12px;font-weight:700;color:#172033;margin-top:4px}
      .vx-wpp2-kcard small{display:block;color:#7c8ba0;font-size:11px;margin-top:3px;line-height:1.3}
    `;
    document.head.appendChild(s);
  }

  const OS_BUCKETS=[
    {key:'AGENDAR',label:'AGENDAR',accent:'#8494a6',desc:'Ainda não agendado no portal, ou não se enquadra em nenhuma outra situação.'},
    {key:'EM_PROCESSO_AT',label:'EM PROCESSO AT',accent:'#2674d9',desc:'Assistência técnica em curso, segundo o portal Whirlpool.'},
    {key:'AGENDADO',label:'AGENDADO',accent:'#1f7a8c',desc:'Visita marcada — aguardando o atendimento acontecer.'},
    {key:'AG_APROVACAO',label:'AG APROVAÇÃO',accent:'#8a5cc9',desc:'Orçamento enviado, aguardando aprovação do consumidor/seguradora.'},
    {key:'AG_CONSERTO',label:'AG CONSERTO',accent:'#c9740f',desc:'Aprovado — pronto pra iniciar ou já em execução pelo técnico.'},
    {key:'CANCELADA',label:'CANCELADA (30 DIAS)',accent:'#e5b325',desc:'Cancelada há pouco no portal — confirme antes de arquivar de vez.'},
    {key:'AG_PECAS',label:'AG PEÇAS',accent:'#2f6bab',desc:'Conserto travado esperando peça chegar no Estoque.'},
    {key:'PRONTOS',label:'PRONTOS P/ ENTREGA',accent:'#2f9e61',desc:'Aguardando cliente retirar ou reagendar devolução.'},
    {key:'FINALIZADOS',label:'FINALIZADOS',accent:'#1f8a5f',desc:'Atendimento concluído e entregue.'},
  ];
  const ROBOT_BUCKETS=[
    {key:'AG_OPERADOR',label:'AG. OPERADOR',accent:'#c0392b',desc:'Precisa de decisão humana — motivo real + vincular/concluir manual.'},
    {key:'AG_CONEXAO',label:'AG. CONEXÃO',accent:'#c9740f',desc:'Portal Whirlpool indisponível — o robô retoma sozinho quando voltar.'},
    {key:'AG_PENDENTE',label:'AG. PENDENTE',accent:'#c9740f',desc:'Agendamento feito no VoxAssist, mas falhou ao confirmar no portal.'},
    {key:'ERRO',label:'ERRO (5+ TENTATIVAS)',accent:'#c0392b',desc:'O robô desistiu — mostra o motivo real da última falha.'},
    {key:'SUSPEITA',label:'SUSPEITA DE EXCLUSÃO',accent:'#8494a6',desc:'Sumiu de um scan do portal — aguardando reconfirmação antes de arquivar.'},
  ];
  const ORDER_TYPE_CHIPS=[['TODAS','Todas'],['GARANTIA','Garantia'],['FORA_GARANTIA','Fora de Garantia'],['SEGURADORA','Seguradora']];

  let wp={tab:'os',screen:'home',activeBucket:null,osFilter:'',osTypeChip:'TODAS',
    viewMode:(function(){try{return localStorage.getItem('vx_wpp_view_mode')||'list';}catch(_e){return'list';}})(),
    loading:false,error:null,
    orders:[],external:[],queue:[],parts:new Set(),apptQueue:[],connStatus:null};

  function matchesWhirlpool(o){return BRAND_RE.test(o?.equipments?.brand||'');}
  function orderTypeCategoryFor(o){
    const t=String(o?.order_type||'');
    if(/segurad/i.test(t))return'SEGURADORA';
    if(/fora de garantia/i.test(t))return'FORA_GARANTIA';
    if(/garantia/i.test(t))return'GARANTIA';
    return'OUTROS';
  }
  function isOpenOrder(o){return !['FINALIZADA','CANCELADA','ORCAMENTO RECUSADO ENCERRADO'].includes(String(o.status||'').toUpperCase());}

  async function loadAll(){
    wp.loading=true;wp.error=null;
    try{
      const [external,queue,parts,apptQueue,connRows]=await Promise.all([
        api('whirlpool_external_orders?select=id,external_order_id,service_status,entry_date,service_order_id,deletion_state&order=entry_date.desc&limit=1500').catch(()=>[]),
        api('whirlpool_import_queue?select=id,external_order_id,queue_reason,state,attempts,last_error_code,last_error_message,service_order_id,created_at&state=in.(PENDENTE,PROCESSANDO,AGUARDANDO_OPERADOR,AGUARDANDO_CONEXAO_WHIRLPOOL,ERRO)&order=created_at.desc&limit=500').catch(()=>[]),
        api('parts_requests?select=service_order_id,status&status=not.in.(RECEBIDO,CANCELADO)&limit=2000').catch(()=>[]),
        api('whirlpool_appointment_sync_queue?select=id,service_order_id,state,last_error_code,last_error_message,desired_date,desired_period,desired_technician_name,created_at&state=eq.PENDENTE_MANUAL_WHIRLPOOL&order=created_at.desc&limit=200').catch(()=>[]),
        api('rpc/whirlpool_connection_admin_status',{method:'POST',body:JSON.stringify({p_company_id:state?.profile?.active_company_id})}).catch(()=>null),
      ]);
      wp.external=external||[];
      wp.queue=queue||[];
      wp.parts=new Set((parts||[]).filter(p=>p.service_order_id).map(p=>String(p.service_order_id)));
      wp.apptQueue=apptQueue||[];
      wp.connStatus=Array.isArray(connRows)&&connRows.length?connRows[0]:null;
      wp.orders=(state.orders||[]).filter(matchesWhirlpool);
    }catch(e){wp.error=e.message||'Falha ao carregar dados.';}
    wp.loading=false;
  }

  const externalById=id=>wp.external.find(x=>String(x.id)===String(id));
  const externalByServiceOrder=soId=>wp.external.find(x=>String(x.service_order_id)===String(soId));

  function bucketForOrder(o){
    const st=String(o.status||'').toUpperCase();
    if(st==='AGUARDANDO APROVACAO')return'AG_APROVACAO';
    if(st==='AGUARDANDO CONSERTO')return wp.parts.has(String(o.id))?'AG_PECAS':'AG_CONSERTO';
    if(st==='EM CONSERTO')return'AG_CONSERTO';
    if(st==='PRONTO PARA ENTREGA')return'PRONTOS';
    if(st==='FINALIZADA')return'FINALIZADOS';
    if(st==='AGUARDANDO ANALISE'){
      const es=externalByServiceOrder(o.id)?.service_status;
      if(es==='Agendar')return'AGENDAR';
      if(es==='Em processo AT')return'EM_PROCESSO_AT';
      if(es==='Agendado')return'AGENDADO';
      return'AGENDAR';
    }
    return'AGENDAR'; // catch-all: orçamento recusado (e variações) e cancelada interna
  }

  function catalogOnlyItems(){
    const cancelExtIds=new Map();
    wp.queue.filter(q=>q.queue_reason==='CANCELADA_30_DIAS').forEach(q=>cancelExtIds.set(String(q.external_order_id),q));
    const items=[];
    wp.external.forEach(ext=>{
      if(ext.service_order_id)return;
      const q=cancelExtIds.get(String(ext.id));
      if(q){items.push({kind:'cancel',ext,queue:q});return;}
      if(ext.service_status==='Agendar')items.push({kind:'AGENDAR',ext});
      else if(ext.service_status==='Em processo AT')items.push({kind:'EM_PROCESSO_AT',ext});
      else if(ext.service_status==='Agendado')items.push({kind:'AGENDADO',ext});
    });
    return items;
  }

  function computeBuckets(){
    const groups={AGENDAR:[],EM_PROCESSO_AT:[],AGENDADO:[],AG_APROVACAO:[],AG_CONSERTO:[],CANCELADA:[],AG_PECAS:[],PRONTOS:[],FINALIZADOS:[]};
    wp.orders.forEach(o=>groups[bucketForOrder(o)].push({kind:'order',order:o}));
    catalogOnlyItems().forEach(it=>groups[it.kind==='cancel'?'CANCELADA':it.kind].push(it));
    return groups;
  }
  function computeRobotBuckets(){
    return {
      AG_OPERADOR:wp.queue.filter(q=>q.state==='AGUARDANDO_OPERADOR'),
      AG_CONEXAO:wp.queue.filter(q=>q.state==='AGUARDANDO_CONEXAO_WHIRLPOOL'),
      AG_PENDENTE:wp.apptQueue,
      ERRO:wp.queue.filter(q=>q.state==='ERRO'),
      SUSPEITA:wp.external.filter(e=>e.deletion_state==='SUSPEITA_DE_EXCLUSAO'),
    };
  }
  function passesFilters(item){
    const q=wp.osFilter.trim().toLowerCase();
    if(q){
      const hay=[item.order?.os_number,item.order?.manufacturer_os_number,item.order?.clients?.name,item.ext?.external_order_id].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    if(wp.osTypeChip!=='TODAS'){
      if(!item.order)return false;
      if(orderTypeCategoryFor(item.order)!==wp.osTypeChip)return false;
    }
    return true;
  }
  function filteredGroups(){
    const groups=computeBuckets();
    const out={};
    Object.keys(groups).forEach(k=>out[k]=groups[k].filter(passesFilters));
    return out;
  }
  function computeKpis(){
    const open=wp.orders.filter(isOpenOrder);
    return {
      total:open.length,
      stale:open.filter(o=>daysSince(o.updated_at)>=2).length,
      veryOld:open.filter(o=>daysSince(o.opened_at)>=15).length,
      garantia:open.filter(o=>orderTypeCategoryFor(o)==='GARANTIA').length,
    };
  }

  function modalWrap(html){
    document.querySelector('#vxWppModal')?.remove();
    const bg=document.createElement('div');
    bg.id='vxWppModal';bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal" style="width:min(820px,100%);max-height:82vh;overflow:auto">${html}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click',e=>{if(e.target===bg)bg.remove();});
    return bg;
  }
  function modalHeader(label){
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><h3 style="margin:0">${esc(label)}</h3><button type="button" data-close style="margin-left:auto;border:0;background:transparent;font-size:20px;cursor:pointer;color:#7c8ba0">×</button></div>`;
  }

  function slaLevel(d){if(d>=5)return'red';if(d>=3)return'yellow';return'green';}

  // Cada item (OS já criada, catálogo ainda não importado, ou revisão de
  // cancelamento) vira um registro plano com os mesmos campos, pra
  // alimentar tanto a LISTA quanto o QUADRO sem duplicar lógica.
  function normalizeItem(bucketKey,it){
    if(it.kind==='order'){
      const o=it.order;
      return {id:'o-'+o.id,bucketKey,openId:o.id,openable:true,kind:'order',
        label:'#'+(o.os_number||'—'),
        whirlpoolNum:externalByServiceOrder(o.id)?.external_order_id||o.manufacturer_os_number||'—',
        cliente:o.clients?.name||'—',
        produtoDefeito:[o.equipments?.product_type,o.reported_defect].filter(Boolean).join(' — ')||'—',
        tipo:orderTypeCategoryFor(o),tipoRaw:o.order_type,
        agingDays:daysSince(o.opened_at),abertaEm:o.opened_at};
    }
    if(it.kind==='cancel'){
      return {id:'c-'+it.queue.id,bucketKey,openable:false,kind:'cancel',cancelQueueId:it.queue.id,
        label:'—',whirlpoolNum:it.ext.external_order_id,cliente:'—',
        produtoDefeito:'Cancelada no portal — revisar antes de arquivar',
        tipo:'OUTROS',tipoRaw:'—',agingDays:daysSince(it.ext.entry_date),abertaEm:it.ext.entry_date};
    }
    return {id:'e-'+it.ext.id,bucketKey,openable:false,kind:'catalog',
      label:'—',whirlpoolNum:it.ext.external_order_id,cliente:'—',
      produtoDefeito:'Ainda não importado — aguardando o robô',
      tipo:'OUTROS',tipoRaw:'—',agingDays:daysSince(it.ext.entry_date),abertaEm:it.ext.entry_date};
  }
  function boardItems(){
    const groups=filteredGroups();
    const keys=wp.activeBucket?[wp.activeBucket]:OS_BUCKETS.map(b=>b.key);
    const out=[];
    keys.forEach(k=>(groups[k]||[]).forEach(it=>out.push(normalizeItem(k,it))));
    out.sort((a,b)=>new Date(b.abertaEm||0)-new Date(a.abertaEm||0));
    return out;
  }

  function renderListView(){
    const items=boardItems();
    if(!items.length)return '<div class="vx-wpp2-empty2">Nenhuma OS corresponde aos filtros atuais.</div>';
    return `<table class="vx-wpp2-list-table"><thead><tr>
      <th>OS</th><th>Nº WHIRLPOOL</th><th>CLIENTE</th><th>PRODUTO / DEFEITO</th><th>SITUAÇÃO</th><th>TIPO</th><th>SLA</th><th>ABERTA EM</th><th></th>
      </tr></thead><tbody>${items.map(it=>{
        const bdef=OS_BUCKETS.find(b=>b.key===it.bucketKey);
        const level=slaLevel(it.agingDays);
        return `<tr ${it.openable?`data-item="${esc(it.id)}"`:''}>
          <td><b>${esc(it.label)}</b></td>
          <td>${esc(it.whirlpoolNum)}</td>
          <td>${esc(it.cliente)}</td>
          <td>${esc(it.produtoDefeito)}</td>
          <td><span class="vx-wpp2-pill" style="border-color:${bdef.accent};color:${bdef.accent}">${esc(bdef.label)}</span></td>
          <td>${it.tipo==='OUTROS'?'—':`<span class="vx-wpp2-type">${esc(it.tipo==='FORA_GARANTIA'?'Fora de Garantia':it.tipo==='SEGURADORA'?'Seguradora':'Garantia')}</span>`}</td>
          <td><span class="vx-wpp2-sla ${level}"><i></i>${it.agingDays}d</span></td>
          <td>${dtFull(it.abertaEm)}</td>
          <td>${it.kind==='cancel'&&isGestor()?`<div style="display:flex;gap:6px"><button type="button" data-cancel-id="${esc(it.cancelQueueId)}" data-action="import" class="warn">Importar</button><button type="button" data-cancel-id="${esc(it.cancelQueueId)}" data-action="delete" class="danger">Excluir</button></div>`:''}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }
  function kanbanCard(it){
    const level=slaLevel(it.agingDays);
    return `<div class="vx-wpp2-kcard" ${it.openable?`data-item="${esc(it.id)}" style="cursor:pointer"`:''}>
      <div class="vx-wpp2-kcard-top"><b>${esc(it.label!=='—'?it.label:it.whirlpoolNum)}</b><span class="vx-wpp2-sla ${level}"><i></i>${it.agingDays}d</span></div>
      <div class="vx-wpp2-kcard-client">${esc(it.cliente)}</div>
      <small>${esc(it.produtoDefeito)}</small>
      ${it.kind==='cancel'&&isGestor()?`<div style="display:flex;gap:6px;margin-top:8px"><button type="button" data-cancel-id="${esc(it.cancelQueueId)}" data-action="import" class="warn">Importar</button><button type="button" data-cancel-id="${esc(it.cancelQueueId)}" data-action="delete" class="danger">Excluir</button></div>`:''}
    </div>`;
  }
  function renderKanbanView(){
    const groups=filteredGroups();
    const keys=wp.activeBucket?[wp.activeBucket]:OS_BUCKETS.map(b=>b.key);
    const sections=keys.map(k=>{
      const bdef=OS_BUCKETS.find(b=>b.key===k);
      const items=(groups[k]||[]).map(it=>normalizeItem(k,it));
      if(!items.length)return'';
      return `<div class="vx-wpp2-kcol">
        <div class="vx-wpp2-kcol-head" style="border-top-color:${bdef.accent}"><span>${esc(bdef.label)}</span><b>${items.length}</b></div>
        <div>${items.map(kanbanCard).join('')}</div>
      </div>`;
    }).join('');
    return sections||'<div class="vx-wpp2-empty2">Nenhuma OS corresponde aos filtros atuais.</div>';
  }

  function wireBoardActions(container){
    container.querySelectorAll('[data-item]').forEach(el=>el.onclick=()=>{
      const it=boardItems().find(x=>String(x.id)===el.dataset.item);
      if(it?.openable)window.render('os:'+it.openId);
    });
    container.querySelectorAll('[data-action="import"]').forEach(b=>b.onclick=async(e)=>{
      e.stopPropagation();
      const qid=b.dataset.cancelId;if(!qid)return;
      if(!confirm('Reabrir esta SVO para importação? Ela volta pra fila do robô e vira uma OS normal (Aguardando Análise) assim que for processada.'))return;
      try{
        await api(`whirlpool_import_queue?id=eq.${qid}`,{method:'PATCH',body:JSON.stringify({queue_reason:'ATIVA_NOVA',state:'PENDENTE',attempts:0,next_attempt_at:null,last_error_code:null,last_error_message:null})});
        toast?.('Reaberta para importação.');
        await refreshAndRender();
      }catch(err){toast?.('Falha ao reabrir: '+err.message,'err');}
    });
    container.querySelectorAll('[data-action="delete"]').forEach(b=>b.onclick=async(e)=>{
      e.stopPropagation();
      const qid=b.dataset.cancelId;if(!qid)return;
      if(!confirm('Excluir definitivamente esta revisão de cancelamento? Ela some desta lista (o histórico no catálogo Whirlpool continua existindo).'))return;
      try{
        await api(`whirlpool_import_queue?id=eq.${qid}`,{method:'PATCH',body:JSON.stringify({state:'IGNORADO'})});
        toast?.('Removida da lista de revisão.');
        await refreshAndRender();
      }catch(err){toast?.('Falha ao excluir: '+err.message,'err');}
    });
  }

  function rowsHtmlForRobotBucket(key,items){
    if(key==='AG_OPERADOR'||key==='ERRO'){
      return `<table class="vx-wpp2-list-table"><thead><tr><th>Nº WHIRLPOOL</th><th>MOTIVO</th><th>TENTATIVAS</th><th>ENTROU NA FILA</th><th></th></tr></thead><tbody>${items.map(q=>{
        const ext=externalById(q.external_order_id);
        return `<tr data-qid="${esc(q.id)}">
          <td>${esc(ext?.external_order_id||'—')}</td>
          <td>${esc(q.last_error_message||q.last_error_code||'—')}</td>
          <td>${Number(q.attempts||0)}</td>
          <td>${dtShort(q.created_at)}</td>
          <td style="display:flex;gap:6px">${isGestor()?`
            <button type="button" data-action="link">Vincular OS</button>
            <button type="button" data-action="complete">Concluir manual</button>`:'<span style="color:#94a3b8">Só GESTOR pode agir</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
    }
    if(key==='AG_CONEXAO'){
      return `<table class="vx-wpp2-list-table"><thead><tr><th>Nº WHIRLPOOL</th><th>ENTROU NA FILA</th></tr></thead><tbody>${items.map(q=>{
        const ext=externalById(q.external_order_id);
        return `<tr><td>${esc(ext?.external_order_id||'—')}</td><td>${dtShort(q.created_at)}</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    if(key==='AG_PENDENTE'){
      return `<table class="vx-wpp2-list-table"><thead><tr><th>OS</th><th>DATA DESEJADA</th><th>TÉCNICO</th><th>MOTIVO</th></tr></thead><tbody>${items.map(q=>{
        const o=(state.orders||[]).find(x=>String(x.id)===String(q.service_order_id));
        return `<tr><td>#${esc(o?.os_number||'—')}</td><td>${dtShort(q.desired_date)} (${esc(q.desired_period||'—')})</td><td>${esc(q.desired_technician_name||'—')}</td><td>${esc(q.last_error_message||q.last_error_code||'—')}</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    if(key==='SUSPEITA'){
      return `<table class="vx-wpp2-list-table"><thead><tr><th>Nº WHIRLPOOL</th><th>ÚLTIMA VEZ VISTO</th></tr></thead><tbody>${items.map(ext=>`<tr><td>${esc(ext.external_order_id)}</td><td>${dtShort(ext.entry_date)}</td></tr>`).join('')}</tbody></table>`;
    }
    return '';
  }

  async function refreshAndRender(){await loadAll();await renderHome();}

  function wireRobotBucketActions(bg){
    bg.querySelectorAll('[data-action="link"]').forEach(b=>b.onclick=async()=>{
      const qid=b.closest('tr').dataset.qid;
      const num=prompt('Número da OS VoxAssist já criada pra vincular (ex.: 0091):');
      if(!num)return;
      try{
        const rows=await api(`service_orders?os_number=eq.${encodeURIComponent(num.trim())}&select=id`).catch(()=>[]);
        if(!rows?.[0]?.id){toast?.('OS não encontrada com esse número.','err');return;}
        await api(`whirlpool_import_queue?id=eq.${qid}`,{method:'PATCH',body:JSON.stringify({state:'CONCLUIDO',service_order_id:rows[0].id,manual_completed_by:myId(),manual_completed_at:new Date().toISOString()})});
        toast?.('Vinculada com sucesso.');
        bg.remove();await refreshAndRender();
      }catch(e){toast?.('Falha ao vincular: '+e.message,'err');}
    });
    bg.querySelectorAll('[data-action="complete"]').forEach(b=>b.onclick=async()=>{
      const qid=b.closest('tr').dataset.qid;
      if(!confirm('Marcar como concluída manualmente, sem vincular nenhuma OS? Use isto quando a pendência já foi resolvida fora do fluxo normal (ex.: duplicada ou já tratada manualmente).'))return;
      try{
        await api(`whirlpool_import_queue?id=eq.${qid}`,{method:'PATCH',body:JSON.stringify({state:'CONCLUIDO',manual_completed_by:myId(),manual_completed_at:new Date().toISOString()})});
        toast?.('Marcada como concluída.');
        bg.remove();await refreshAndRender();
      }catch(e){toast?.('Falha ao concluir: '+e.message,'err');}
    });
  }

  function openOsBucket(key){wp.activeBucket=key;wp.screen='board';renderHome();}
  function openRobotBucket(key){
    const def=ROBOT_BUCKETS.find(b=>b.key===key);
    const items=computeRobotBuckets()[key]||[];
    const bg=modalWrap(modalHeader(def.label)+(items.length?rowsHtmlForRobotBucket(key,items):'<div class="vx-wpp2-empty2">Nenhum item nesta situação.</div>'));
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    wireRobotBucketActions(bg);
  }

  function renderOsTabBody(kpis,groups){
    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:6px">
        <button type="button" class="secondary" id="vxWpSeeAll">Ver todas as OS</button>
      </div>
      <div class="vx-wpp2-filters">
        <input id="vxWpSearch" placeholder="Buscar por nº OS, nº Whirlpool ou cliente" value="${esc(wp.osFilter)}">
        ${ORDER_TYPE_CHIPS.map(([k,l])=>`<button type="button" class="vx-wpp2-chip ${wp.osTypeChip===k?'active':''}" data-chip="${k}">${esc(l)}</button>`).join('')}
      </div>
      <div class="module-summary">
        <button type="button" class="module-summary-card" style="--accent:#0c2340" disabled><span>OS ABERTAS</span><b>${kpis.total}</b></button>
        <button type="button" class="module-summary-card" style="--accent:#c9740f" disabled><span>SEM ALTERAÇÃO +2 DIAS</span><b>${kpis.stale}</b></button>
        <button type="button" class="module-summary-card" style="--accent:#c0392b" disabled><span>ABERTAS HÁ +15 DIAS</span><b>${kpis.veryOld}</b></button>
        <button type="button" class="module-summary-card" style="--accent:#2674d9" disabled><span>GARANTIA</span><b>${kpis.garantia}</b></button>
      </div>
      <div class="vx-wpp2-grid">
        ${OS_BUCKETS.map(b=>`<button type="button" class="module-summary-card module-summary-card-btn" data-bucket="${b.key}" style="--accent:${b.accent}">
          <span>${esc(b.label)}</span><b>${(groups[b.key]||[]).length}</b>
          <small>${esc(b.desc)}</small>
        </button>`).join('')}
      </div>`;
  }
  function wireOsTabBody(){
    const inp=document.getElementById('vxWpSearch');
    inp.oninput=e=>{
      wp.osFilter=e.target.value;
      const pos=e.target.selectionStart;
      renderHome();
      const inp2=document.getElementById('vxWpSearch');
      if(inp2){inp2.focus();inp2.setSelectionRange(pos,pos);}
    };
    document.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{wp.osTypeChip=b.dataset.chip;renderHome();});
    document.querySelectorAll('[data-bucket]').forEach(b=>b.onclick=()=>openOsBucket(b.dataset.bucket));
    document.getElementById('vxWpSeeAll').onclick=()=>{wp.activeBucket=null;wp.screen='board';renderHome();};
  }

  function renderBoardScreen(){
    const app=document.querySelector('#app');if(!app)return;
    const activeDef=wp.activeBucket?OS_BUCKETS.find(b=>b.key===wp.activeBucket):null;
    app.innerHTML=`<div class="module-home">
      <div class="module-home-head">
        <div><h2>Ordens de Serviço Whirlpool</h2><p>${activeDef?esc(activeDef.label):'TODAS AS SITUAÇÕES'}</p></div>
        <div class="module-head-actions"><button class="secondary" id="vxWpBoardBack">← Voltar</button></div>
      </div>
      <div class="vx-wpp2-filters">
        <input id="vxWpSearch" placeholder="Buscar por nº OS, nº Whirlpool ou cliente" value="${esc(wp.osFilter)}">
        ${ORDER_TYPE_CHIPS.map(([k,l])=>`<button type="button" class="vx-wpp2-chip ${wp.osTypeChip===k?'active':''}" data-chip="${k}">${esc(l)}</button>`).join('')}
        <div class="vx-wpp2-viewtoggle">
          <button type="button" class="vx-wpp2-view-btn ${wp.viewMode==='kanban'?'active':''}" data-mode="kanban">▦ QUADRO</button>
          <button type="button" class="vx-wpp2-view-btn ${wp.viewMode==='list'?'active':''}" data-mode="list">☰ LISTA</button>
        </div>
      </div>
      <div class="vx-wpp2-situ-chips">
        <button type="button" class="vx-wpp2-chip ${!wp.activeBucket?'active':''}" data-situ="">Todas</button>
        ${OS_BUCKETS.map(b=>`<button type="button" class="vx-wpp2-chip ${wp.activeBucket===b.key?'active':''}" data-situ="${b.key}">${esc(b.label)}</button>`).join('')}
      </div>
      <div id="vxWpBoardBody" class="${wp.viewMode==='kanban'?'vx-wpp2-kanban':''}">${wp.viewMode==='list'?renderListView():renderKanbanView()}</div>
    </div>`;
    document.getElementById('vxWpBoardBack').onclick=()=>{wp.screen='home';renderHome();};
    const inp=document.getElementById('vxWpSearch');
    inp.oninput=e=>{
      wp.osFilter=e.target.value;
      const pos=e.target.selectionStart;
      renderBoardScreen();
      const inp2=document.getElementById('vxWpSearch');
      if(inp2){inp2.focus();inp2.setSelectionRange(pos,pos);}
    };
    document.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{wp.osTypeChip=b.dataset.chip;renderBoardScreen();});
    document.querySelectorAll('[data-situ]').forEach(b=>b.onclick=()=>{wp.activeBucket=b.dataset.situ||null;renderBoardScreen();});
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{wp.viewMode=b.dataset.mode;try{localStorage.setItem('vx_wpp_view_mode',wp.viewMode);}catch(_e){}renderBoardScreen();});
    wireBoardActions(document.getElementById('vxWpBoardBody'));
  }

  function renderRobotTabBody(robotGroups){
    const row=wp.connStatus;
    const lastScan=row?[row.last_incremental_scan_at,row.last_full_scan_at].filter(Boolean).sort().pop():null;
    return `
      <div class="vx-wpp-panel" style="margin-bottom:14px">
        <div class="vx-wpp-status-row">
          ${row?statusBadge(row):'<span class="vx-wpp-badge warn">SEM CONEXÃO CADASTRADA</span>'}
          ${isGestor()&&row?`<button type="button" class="primary" id="vxWpSyncNow" ${blockReason(row)?'disabled':''}>↻ SINCRONIZAR AGORA</button>${blockReason(row)?`<span class="vx-wpp-locked">${esc(blockReason(row))}</span>`:''}`:''}
          <span style="margin-left:auto;font-size:11.5px;color:#8494a6">Última varredura: ${dtFull(lastScan)}</span>
        </div>
        ${row?.last_error_code?`<div class="vx-wpp-error">Último erro: ${esc(row.last_error_code)} (${dtFull(row.last_error_at)})</div>`:''}
      </div>
      <div class="vx-wpp2-grid robot">
        ${ROBOT_BUCKETS.map(b=>`<button type="button" class="module-summary-card module-summary-card-btn" data-rbucket="${b.key}" style="--accent:${b.accent}">
          <span>${esc(b.label)}</span><b>${(robotGroups[b.key]||[]).length}</b>
          <small>${esc(b.desc)}</small>
        </button>`).join('')}
      </div>`;
  }
  function wireRobotTabBody(){
    document.querySelectorAll('[data-rbucket]').forEach(b=>b.onclick=()=>openRobotBucket(b.dataset.rbucket));
    const syncBtn=document.getElementById('vxWpSyncNow');
    if(syncBtn){
      syncBtn.onclick=async()=>{
        if(syncBtn.disabled)return;
        syncBtn.disabled=true;
        try{
          const r=await fetch(CFG.url+'/functions/v1/whirlpool-manual-sync',{method:'POST',headers:authHeaders(),body:JSON.stringify({connection_id:wp.connStatus.id})});
          const res=await r.json().catch(()=>({}));
          if(!r.ok||res?.ok===false)throw new Error(res?.error||'Falha ao disparar a sincronização.');
          if(res.already_running)toast?.('Uma sincronização já está em andamento.');
          else if(res.dispatched)toast?.('Execução disparada agora no GitHub Actions.');
          else toast?.('Próxima tentativa liberada, mas o disparo imediato falhou ('+(res.dispatch_error||'motivo desconhecido')+').','err');
          await refreshAndRender();
        }catch(e){toast?.(e.message,'err');syncBtn.disabled=false;}
      };
    }
  }

  async function renderHome(){
    const app=document.querySelector('#app');if(!app)return;
    if(wp.screen==='board')return renderBoardScreen();
    const kpis=computeKpis();
    const groups=filteredGroups();
    const robotGroups=computeRobotBuckets();
    app.innerHTML=`<div class="module-home">
      <div class="module-home-head">
        <div><h2>WP / Seguradora</h2><p>${wp.tab==='os'?'ORDENS DE SERVIÇO WHIRLPOOL, BRASTEMP E CONSUL':'ROBÔ E IMPORTAÇÃO — USO GESTOR'}</p></div>
        <div class="module-head-actions"><button class="secondary" id="vxWpPortalBack">← Voltar</button></div>
      </div>
      ${wp.error?`<div class="vx-wpp-error">${esc(wp.error)}</div>`:''}
      <div class="vx-wpp2-tabs">
        <button type="button" data-tab="os" class="${wp.tab==='os'?'active':''}">Ordens de Serviço</button>
        <button type="button" data-tab="robot" class="${wp.tab==='robot'?'active':''}">Robô e Importação</button>
      </div>
      ${wp.tab==='os'?renderOsTabBody(kpis,groups):renderRobotTabBody(robotGroups)}
    </div>`;
    document.getElementById('vxWpPortalBack').onclick=()=>{const v=state.__vxWpPrevView||'dashboard';state.__vxWpPrevView=null;window.render(v)};
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{wp.tab=b.dataset.tab;renderHome();});
    if(wp.tab==='os')wireOsTabBody();else wireRobotTabBody();
  }

  async function renderPage(){
    // Achado do usuário (2026-09-15, preservado da v1): setar state.view
    // aqui é necessário pro botão/gesto de voltar do Android funcionar
    // (mobile-back-nav-v1.js só registra uma entrada de histórico quando
    // state.view muda de verdade dentro de um window.render) -- só NÃO
    // pode ser lido de volta pelo botão "← Voltar" em tela (por isso o
    // botão usa state.__vxWpPrevView, guardado ANTES de sobrescrever).
    installStyle();
    // Achado do usuário (2026-09-29): abrir o menu WP/Seguradora tem que
    // sempre cair em "Ordens de Serviço" -- reseta aba/tela/filtro de
    // situação toda vez que ENTRA no módulo vindo de fora (hub/menu),
    // nunca quando é uma navegação interna (voltar do quadro pra home
    // já passa por wp.screen='home'+renderHome() direto, sem passar
    // por aqui de novo).
    wp.tab='os';wp.screen='home';wp.activeBucket=null;
    if(!state.__vxWpPrevView)state.__vxWpPrevView=state.view;
    state.view=VIEW;
    const title=document.querySelector('#title');if(title)title.textContent='WP / Seguradora';
    const app=document.querySelector('#app');
    if(app)app.innerHTML='<div class="module-home"><div class="vx-wpp-empty">Carregando…</div></div>';
    await loadAll();
    await renderHome();
  }

  const priorRender=window.render;
  window.render=function(view){
    if(view===VIEW)return renderPage();
    return priorRender.apply(this,arguments);
  };

  installStyle();
})();
