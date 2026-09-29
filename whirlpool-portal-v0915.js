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

  let wp={tab:'os',loading:false,error:null,osFilter:'',osTypeChip:'TODAS',
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

  function rowsHtmlForOsBucket(key,items){
    if(key==='CANCELADA'){
      return `<table class="vx-wpp2-list-table"><thead><tr><th>Nº WHIRLPOOL</th><th>ENTRADA</th><th></th></tr></thead><tbody>${items.map(it=>`
        <tr data-cancel-id="${esc(it.queue?.id||'')}">
          <td>${esc(it.ext?.external_order_id||'—')}</td>
          <td>${dtShort(it.ext?.entry_date)}</td>
          <td style="display:flex;gap:6px">${isGestor()?`
            <button type="button" data-action="import" class="warn">Importar</button>
            <button type="button" data-action="delete" class="danger">Excluir definitivamente</button>`:'<span style="color:#94a3b8">Só GESTOR pode agir</span>'}</td>
        </tr>`).join('')}</tbody></table>`;
    }
    if(key==='AGENDAR'||key==='EM_PROCESSO_AT'||key==='AGENDADO'){
      return `<table class="vx-wpp2-list-table"><thead><tr><th>OS</th><th>Nº WHIRLPOOL</th><th>CLIENTE</th><th>TÉCNICO</th><th></th></tr></thead><tbody>${items.map(it=>{
        if(it.kind==='order'){
          const o=it.order;
          return `<tr><td>#${esc(o.os_number||'—')}</td><td>${esc(externalByServiceOrder(o.id)?.external_order_id||o.manufacturer_os_number||'—')}</td><td>${esc(o.clients?.name||'—')}</td><td>${esc(o.profiles?.full_name||'—')}</td><td><button type="button" data-open-os="${esc(o.id)}">Abrir OS</button></td></tr>`;
        }
        return `<tr><td>—</td><td>${esc(it.ext.external_order_id)}</td><td colspan="2" style="color:#94a3b8">Ainda não importado — aguardando o robô</td><td></td></tr>`;
      }).join('')}</tbody></table>`;
    }
    return `<table class="vx-wpp2-list-table"><thead><tr><th>OS</th><th>CLIENTE</th><th>TÉCNICO</th><th>DIAS PARADO</th><th></th></tr></thead><tbody>${items.map(it=>{
      const o=it.order;
      return `<tr><td>#${esc(o.os_number||'—')}</td><td>${esc(o.clients?.name||'—')}</td><td>${esc(o.profiles?.full_name||'—')}</td><td>${daysSince(o.updated_at)} dia(s)</td><td><button type="button" data-open-os="${esc(o.id)}">Abrir OS</button></td></tr>`;
    }).join('')}</tbody></table>`;
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

  function wireOsBucketActions(bg,key){
    bg.querySelectorAll('[data-open-os]').forEach(b=>b.onclick=()=>{bg.remove();window.render('os:'+b.dataset.openOs);});
    if(key==='CANCELADA'){
      bg.querySelectorAll('[data-action="import"]').forEach(b=>b.onclick=async()=>{
        const qid=b.closest('tr').dataset.cancelId;if(!qid)return;
        if(!confirm('Reabrir esta SVO para importação? Ela volta pra fila do robô e vira uma OS normal (Aguardando Análise) assim que for processada.'))return;
        try{
          await api(`whirlpool_import_queue?id=eq.${qid}`,{method:'PATCH',body:JSON.stringify({queue_reason:'ATIVA_NOVA',state:'PENDENTE',attempts:0,next_attempt_at:null,last_error_code:null,last_error_message:null})});
          toast?.('Reaberta para importação.');
          bg.remove();await refreshAndRender();
        }catch(e){toast?.('Falha ao reabrir: '+e.message,'err');}
      });
      bg.querySelectorAll('[data-action="delete"]').forEach(b=>b.onclick=async()=>{
        const qid=b.closest('tr').dataset.cancelId;if(!qid)return;
        if(!confirm('Excluir definitivamente esta revisão de cancelamento? Ela some desta lista (o histórico no catálogo Whirlpool continua existindo).'))return;
        try{
          await api(`whirlpool_import_queue?id=eq.${qid}`,{method:'PATCH',body:JSON.stringify({state:'IGNORADO'})});
          toast?.('Removida da lista de revisão.');
          bg.remove();await refreshAndRender();
        }catch(e){toast?.('Falha ao excluir: '+e.message,'err');}
      });
    }
  }
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

  function openOsBucket(key){
    const def=OS_BUCKETS.find(b=>b.key===key);
    const items=filteredGroups()[key]||[];
    const bg=modalWrap(modalHeader(def.label)+(items.length?rowsHtmlForOsBucket(key,items):'<div class="vx-wpp2-empty2">Nenhum item nesta situação.</div>'));
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    wireOsBucketActions(bg,key);
  }
  function openRobotBucket(key){
    const def=ROBOT_BUCKETS.find(b=>b.key===key);
    const items=computeRobotBuckets()[key]||[];
    const bg=modalWrap(modalHeader(def.label)+(items.length?rowsHtmlForRobotBucket(key,items):'<div class="vx-wpp2-empty2">Nenhum item nesta situação.</div>'));
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    wireRobotBucketActions(bg);
  }

  function renderOsTabBody(kpis,groups){
    return `
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
