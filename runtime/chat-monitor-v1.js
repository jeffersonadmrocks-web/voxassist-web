/* VoxAssist — Monitor de atividades (Central de Conversas, Fase 6)
 * Achado do usuário em 2026-09-02 (mockup aprovado, artifact 42ebf5fb,
 * #screenMonitor): faltava a visão do gestor sobre a operação de chat
 * -- métricas, alertas, atendentes, SLA configurável. Segue a mesma
 * filosofia já validada nesta sessão em runtime/dashboard-canonical-v1.js:
 * todo número é clicável e leva às linhas reais por trás dele -- nunca
 * só a contagem.
 *
 * Métricas do mockup DELIBERADAMENTE fora deste lote (reportado, não
 * fingido): "1ª resposta média/mediana" (exigiria calcular o intervalo
 * entre a 1ª mensagem INBOUND e a 1ª OUTBOUND de cada conversa -- fica
 * pra quando isso for pedido de verdade) e "Taxa de reabertura" (não
 * existe hoje nenhum rastreio de quantas vezes uma conversa foi
 * reaberta). "Conflito de regras de roteamento" também não é um alerta
 * aqui porque já é IMPOSSÍVEL por construção -- o índice único parcial
 * de chat_bot_routing_rules (Fase 1 do Robô) impede duas regras ativas
 * com a mesma combinação exata.
 *
 * Segue o mesmo padrão de sobrescrita encadeada de window.render já
 * usado no resto do app -- nunca substitui o router.
 */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const isGestor=()=>norm(state?.profile?.role)==='GESTOR';
  const OPEN_STATUSES=['ABERTA','EM_ATENDIMENTO','AGUARDANDO_CLIENTE'];

  let mon={loaded:false,conversations:[],transferEvents:[],botStates:[],failedMessages:[],attendants:[],connections:[],presence:[],sla:null,period:'HOJE',selectedAttendantId:null,metricAttendantFilter:''};
  // Achado do usuário em 2026-09-02 (pacote fila/robô/presença):
  // presença binária (online/offline por 2min) não bastava -- agora 3
  // estados com limiares próprios: ONLINE (<10min de heartbeat),
  // AUSENTE (10-20min), OFFLINE (>20min OU logout explícito mais
  // recente que o último heartbeat -- ver user-logoff-v0813.js).
  // Qualquer heartbeat novo volta pra ONLINE na hora (presence-
  // heartbeat-v1.js zera logged_out_at a cada ping).
  const PRESENCE_ONLINE_MIN=10,PRESENCE_AUSENTE_MIN=20;
  function presenceStatus(userId){
    const p=mon.presence.find(x=>String(x.user_id)===String(userId));
    if(!p)return'OFFLINE';
    if(p.logged_out_at&&new Date(p.logged_out_at).getTime()>=new Date(p.last_seen_at).getTime())return'OFFLINE';
    const mins=(Date.now()-new Date(p.last_seen_at).getTime())/60000;
    if(mins<PRESENCE_ONLINE_MIN)return'ONLINE';
    if(mins<PRESENCE_AUSENTE_MIN)return'AUSENTE';
    return'OFFLINE';
  }
  const PRESENCE_LABEL={ONLINE:'Online',AUSENTE:'Ausente',OFFLINE:'Offline'};

  function periodCutoff(){
    const d=new Date();
    if(mon.period==='SEMANA'){d.setDate(d.getDate()-7);return d}
    if(mon.period==='MES'){d.setDate(d.getDate()-30);return d}
    d.setHours(0,0,0,0);return d;
  }
  function inPeriod(iso){return iso&&new Date(iso)>=periodCutoff()}

  async function loadAll(){
    const [conversations,transferEvents,botStates,failedMessages,attendants,connections,sla,presence]=await Promise.all([
      api('chat_conversations?select=id,customer_phone,customer_name,status,assigned_user_id,last_message_at,unread_count,next_callback_at,created_at,profiles!chat_conversations_assigned_user_id_fkey(full_name),clients!chat_conversations_client_id_fkey(name)').catch(()=>[]),
      api('chat_conversation_events?action=eq.TRANSFER&select=conversation_id,created_at&order=created_at.desc').catch(()=>[]),
      api('chat_conversation_bot_state?select=conversation_id,status').catch(()=>[]),
      api('chat_messages?status=eq.FALHOU&select=id,conversation_id,body,created_at&order=created_at.desc&limit=200').catch(()=>[]),
      api('profiles?select=id,full_name,role&active=eq.true&role=in.(GESTOR,ATENDENTE)&order=full_name').catch(()=>[]),
      api('chat_connections?select=id,name,status').catch(()=>[]),
      api('chat_sla_settings?select=*&limit=1').catch(()=>[]),
      api('user_presence?select=user_id,last_seen_at,logged_out_at').catch(()=>[]),
    ]);
    mon={loaded:true,conversations:conversations||[],transferEvents:transferEvents||[],botStates:botStates||[],failedMessages:failedMessages||[],attendants:attendants||[],connections:connections||[],presence:presence||[],sla:(sla&&sla[0])||null,period:mon.period,selectedAttendantId:mon.selectedAttendantId,metricAttendantFilter:mon.metricAttendantFilter};
  }

  function backToConversas(){
    if(typeof window.render==='function'&&document.querySelector('[data-chat-beta-entry]')){
      document.querySelector('[data-chat-beta-entry]').click();
    }else if(typeof window.render==='function'){
      window.render('dashboard');
    }
  }
  function openConversaReal(convId){
    if(!document.querySelector('[data-chat-beta-entry]'))return;
    document.querySelector('[data-chat-beta-entry]').click();
    // A Central recarrega a lista de conversas de forma assíncrona --
    // espera window.vxOpenChatConversation existir e a lista já ter
    // sido montada antes de selecionar, em vez de um tempo fixo
    // torcendo pra ter dado tempo.
    let tries=0;
    const tryOpen=()=>{
      tries++;
      if(typeof window.vxOpenChatConversation==='function'&&document.getElementById('chatConvList')){window.vxOpenChatConversation(convId);return}
      if(tries<40)setTimeout(tryOpen,100);
    };
    setTimeout(tryOpen,50);
  }

  function waitMinutes(c){
    if(!(Number(c.unread_count||0)>0)||!c.last_message_at)return null;
    return Math.floor((Date.now()-new Date(c.last_message_at).getTime())/60000);
  }
  function slaAttentionLimit(){return mon.sla?.wait_atencao_max_min||30}
  function slaAlertLimit(){return mon.sla?.alert_gestor_min||60}

  // Achado do usuário em 2026-09-02: "o relatório também pode ser
  // filtrado por atendente/operador, pra termos um comparativo" -- o
  // filtro escopa TODAS as métricas (não só a tabela de atendentes) às
  // conversas do atendente escolhido.
  function convsInPeriod(){
    let rows=mon.conversations.filter(c=>inPeriod(c.created_at)||inPeriod(c.last_message_at));
    if(mon.metricAttendantFilter)rows=rows.filter(c=>String(c.assigned_user_id||'')===String(mon.metricAttendantFilter));
    return rows;
  }
  function metricRows(){
    const rows=convsInPeriod();
    const rowIds=new Set(rows.map(c=>String(c.id)));
    const transferByConv={};
    mon.transferEvents.filter(e=>inPeriod(e.created_at)&&rowIds.has(String(e.conversation_id))).forEach(e=>{transferByConv[e.conversation_id]=(transferByConv[e.conversation_id]||0)+1});
    return {
      total:rows,
      abertas:rows.filter(c=>OPEN_STATUSES.includes(c.status)),
      encerradas:rows.filter(c=>c.status==='FINALIZADA'),
      naoAtribuidas:rows.filter(c=>!c.assigned_user_id&&c.status!=='FINALIZADA'),
      slaVencido:rows.filter(c=>{const m=waitMinutes(c);return m!=null&&m>=slaAttentionLimit()}),
      retornosVencidos:rows.filter(c=>c.next_callback_at&&new Date(c.next_callback_at)<new Date()),
      transferByConv,
      transferidas:Object.keys(transferByConv).map(id=>({conv:mon.conversations.find(c=>String(c.id)===String(id)),count:transferByConv[id]})).filter(x=>x.conv),
      fallback:mon.botStates.filter(b=>b.status==='LIMITE_TENTATIVAS'&&rowIds.has(String(b.conversation_id))),
      falhas:mon.failedMessages.filter(m=>inPeriod(m.created_at)&&rowIds.has(String(m.conversation_id))),
    };
  }

  /* ---------- modal genérico (mesma filosofia de dashboard-canonical-v1.js: todo número leva às linhas reais) ---------- */
  function convModal(title,rows){
    document.querySelector('#vxMonModal')?.remove();
    const bg=document.createElement('div');bg.id='vxMonModal';bg.className='vx-mon-modal-bg';
    bg.innerHTML=`<div class="vx-mon-modal"><div class="vx-mon-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-mon-modal-body">${rows.length?`<table><thead><tr><th>Cliente</th><th>Telefone</th><th>Status</th><th>Atendente</th></tr></thead><tbody>${rows.map(c=>`<tr data-conv="${E(c.id)}"><td><b>${E(c.customer_name||c.clients?.name||'Contato WhatsApp')}</b></td><td>${E(c.customer_phone||'—')}</td><td>${E(norm(c.status))}</td><td>${E(c.profiles?.full_name||'Não atribuída')}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-mon-empty">Nenhum registro no período.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove()};
    bg.querySelectorAll('[data-conv]').forEach(tr=>tr.onclick=()=>{const id=tr.dataset.conv;bg.remove();openConversaReal(id)});
  }
  function transferModal(rows){
    document.querySelector('#vxMonModal')?.remove();
    const bg=document.createElement('div');bg.id='vxMonModal';bg.className='vx-mon-modal-bg';
    bg.innerHTML=`<div class="vx-mon-modal"><div class="vx-mon-modal-head"><div><strong>Transferências</strong><small>${rows.length} conversa${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-mon-modal-body">${rows.length?`<table><thead><tr><th>Cliente</th><th>Nº de transferências</th></tr></thead><tbody>${rows.map(r=>`<tr data-conv="${E(r.conv.id)}"><td><b>${E(r.conv.customer_name||r.conv.clients?.name||'Contato WhatsApp')}</b></td><td>${r.count}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-mon-empty">Nenhuma transferência no período.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove()};
    bg.querySelectorAll('[data-conv]').forEach(tr=>tr.onclick=()=>{const id=tr.dataset.conv;bg.remove();openConversaReal(id)});
  }
  function failedModal(rows){
    document.querySelector('#vxMonModal')?.remove();
    const bg=document.createElement('div');bg.id='vxMonModal';bg.className='vx-mon-modal-bg';
    bg.innerHTML=`<div class="vx-mon-modal"><div class="vx-mon-modal-head"><div><strong>Falhas de envio</strong><small>${rows.length} mensagem${rows.length===1?'':'ns'}</small></div><button type="button" data-close>×</button></div><div class="vx-mon-modal-body">${rows.length?`<table><thead><tr><th>Mensagem</th><th>Quando</th></tr></thead><tbody>${rows.map(m=>`<tr data-conv="${E(m.conversation_id)}"><td>${E(m.body||'[sem texto]')}</td><td>${new Date(m.created_at).toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-mon-empty">Nenhuma falha no período.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove()};
    bg.querySelectorAll('[data-conv]').forEach(tr=>tr.onclick=()=>{const id=tr.dataset.conv;bg.remove();openConversaReal(id)});
  }

  /* ---------- alertas do gestor (regras simples sobre dados já carregados, nenhum dado fictício) ---------- */
  function gestorAlerts(){
    const m=metricRows();
    const alerts=[];
    const espera=m.slaVencido.filter(c=>{const w=waitMinutes(c);return w!=null&&w>=slaAlertLimit()});
    if(espera.length)alerts.push({text:`${espera.length} conversa${espera.length===1?'':'s'} esperando acima de ${slaAlertLimit()} min.`,rows:espera});
    const multi=m.transferidas.filter(t=>t.count>=2);
    if(multi.length)alerts.push({text:`${multi.length} conversa${multi.length===1?'':'s'} transferida${multi.length===1?'':'s'} 2 ou mais vezes.`,rows:multi.map(t=>t.conv)});
    if(m.naoAtribuidas.length>=5)alerts.push({text:`Fila de não atribuídas crescendo: ${m.naoAtribuidas.length} conversas.`,rows:m.naoAtribuidas});
    const desconectadas=mon.connections.filter(c=>c.status!=='CONECTADO');
    if(desconectadas.length)alerts.push({text:`${desconectadas.length} conexão(ões) WhatsApp desconectada(s): ${desconectadas.map(c=>c.name).join(', ')}.`,rows:null});
    return alerts;
  }

  /* ---------- render ---------- */
  function metricsRow(){
    const m=metricRows();
    const cards=[
      ['Total de atendimentos',m.total.length,()=>convModal('Total de atendimentos',m.total)],
      ['Em aberto',m.abertas.length,()=>convModal('Em aberto',m.abertas)],
      ['Encerradas',m.encerradas.length,()=>convModal('Encerradas',m.encerradas)],
      ['Não atribuídas',m.naoAtribuidas.length,()=>convModal('Não atribuídas',m.naoAtribuidas)],
      [`SLA vencido (≥${slaAttentionLimit()}min)`,m.slaVencido.length,()=>convModal('SLA vencido',m.slaVencido),true],
      ['Retornos vencidos',m.retornosVencidos.length,()=>convModal('Retornos vencidos',m.retornosVencidos),true],
      ['Transferências',m.transferidas.length,()=>transferModal(m.transferidas)],
      ['Caíram no fallback do robô',m.fallback.length,null],
      ['Falhas de envio',m.falhas.length,()=>failedModal(m.falhas),true],
    ];
    // Achado do usuário em 2026-09-02 (referência visual aprovada):
    // hierarquia dos KPIs -- os que sinalizam problema (marcados acima)
    // ganham destaque quando têm contagem > 0, mesmos números de
    // sempre, só apresentação diferente.
    return `<div class="vx-mon-metrics">${cards.map((c,i)=>`<button type="button" class="vx-mon-kpi ${c[3]&&c[1]>0?'vx-mon-kpi-warn':''}" data-kpi="${i}" ${c[2]?'':'disabled'}><span>${E(c[0])}</span><b>${c[1]}</b></button>`).join('')}</div>`;
  }
  function slaCard(){
    const s=mon.sla||{};
    return `<div class="vx-mon-card">
      <h3>Limites de tempo de espera do cliente</h3>
      <p class="vx-mon-sub">Mesmos valores usados no chip "Tempo excedido" da lista de conversas e no card de SLA acima -- editar aqui muda os dois lugares.</p>
      <div class="vx-mon-sla-fields">
        <label>Normal até (min)<input type="number" min="1" id="vxMonSlaNormal" value="${E(s.wait_normal_max_min??15)}"></label>
        <label>Atenção até (min)<input type="number" min="1" id="vxMonSlaAtencao" value="${E(s.wait_atencao_max_min??30)}"></label>
        <label>Alertar gestor a partir de (min)<input type="number" min="1" id="vxMonSlaAlerta" value="${E(s.alert_gestor_min??60)}"></label>
      </div>
      <button type="button" class="vx-mon-save-btn" id="vxMonSlaSave">Salvar limites</button>
    </div>`;
  }
  function alertsCard(){
    const alerts=gestorAlerts();
    return `<div class="vx-mon-card vx-mon-card-alert">
      <h3>⚠ Alertas do gestor</h3>
      ${alerts.length?`<ul class="vx-mon-alert-list">${alerts.map((a,i)=>`<li>${E(a.text)} ${a.rows?`<button type="button" data-alert="${i}">Ver conversas →</button>`:''}</li>`).join('')}</ul>`:'<p class="vx-mon-empty">Nenhum alerta no momento.</p>'}
    </div>`;
  }
  function attendantRows(){
    return mon.attendants.map(a=>{
      const mine=mon.conversations.filter(c=>String(c.assigned_user_id)===String(a.id));
      return {a,open:mine.filter(c=>OPEN_STATUSES.includes(c.status)),closed:mine.filter(c=>c.status==='FINALIZADA'),total:mine};
    });
  }
  function attendantsCard(){
    // Achado do usuário em 2026-09-02: esta tabela já mostra TODOS os
    // atendentes ativos cadastrados (nunca filtrou por online) -- só
    // faltava o indicador de presença por bolinha, agora via
    // user_presence/presence-heartbeat-v1.js.
    const rows=attendantRows();
    return `<div class="vx-mon-card">
      <h3>Atendentes</h3>
      <table class="vx-mon-table"><thead><tr><th></th><th>Atendente</th><th>Em aberto</th><th>Encerradas</th><th>Total</th></tr></thead>
      <tbody>${rows.length?rows.map(r=>{const st=presenceStatus(r.a.id);return `<tr data-attendant="${E(r.a.id)}" class="${String(mon.selectedAttendantId)===String(r.a.id)?'active':''}"><td><span class="vx-mon-presence-dot ${st.toLowerCase()}" title="${PRESENCE_LABEL[st]}"></span></td><td>${E(r.a.full_name)}</td><td>${r.open.length}</td><td>${r.closed.length}</td><td>${r.total.length}</td></tr>`;}).join(''):'<tr><td colspan="5" class="vx-mon-empty">Nenhum atendente ativo.</td></tr>'}</tbody></table>
    </div>`;
  }
  function attendantDetailCard(){
    if(!mon.selectedAttendantId)return'';
    const row=attendantRows().find(r=>String(r.a.id)===String(mon.selectedAttendantId));
    if(!row)return'';
    return `<div class="vx-mon-card">
      <h3>${E(row.a.full_name)} — detalhe</h3>
      <div class="vx-mon-detail-tabs">
        <button type="button" class="active" data-detail="abertas">Em aberto (${row.open.length})</button>
        <button type="button" data-detail="encerradas">Encerradas (${row.closed.length})</button>
      </div>
      <table class="vx-mon-table" id="vxMonDetailTable"><thead><tr><th>Cliente</th><th>Telefone</th><th>Status</th></tr></thead>
      <tbody>${row.open.length?row.open.map(c=>`<tr data-conv="${E(c.id)}"><td><b>${E(c.customer_name||c.clients?.name||'Contato WhatsApp')}</b></td><td>${E(c.customer_phone||'—')}</td><td>${E(norm(c.status))}</td></tr>`).join(''):'<tr><td colspan="3" class="vx-mon-empty">Nenhuma conversa em aberto.</td></tr>'}</tbody></table>
    </div>`;
  }
  function fallbackAbandonCard(){
    const totalStarted=mon.botStates.length;
    const abandoned=mon.botStates.filter(b=>b.status==='ABANDONADO');
    return `<div class="vx-mon-card">
      <h3>Abandono na triagem do robô</h3>
      ${totalStarted?`<p class="vx-mon-sub">${abandoned.length} de ${totalStarted} conversa(s) que passaram pela triagem foram abandonadas antes de terminar (${Math.round(abandoned.length/totalStarted*100)}%).</p>`:'<p class="vx-mon-empty">Nenhuma conversa passou pela triagem do robô ainda.</p>'}
    </div>`;
  }

  function render(){
    const app=document.querySelector('#app');
    if(!app)return;
    if(!isGestor()){
      app.innerHTML=`<div class="vx-mon-wrap"><div class="vx-mon-card"><h3>Monitor de atividades</h3><p class="vx-mon-sub">Este recurso é restrito a usuários GESTOR.</p><button type="button" id="vxMonBack">← Voltar</button></div></div>`;
      document.getElementById('vxMonBack').onclick=backToConversas;
      return;
    }
    app.innerHTML=`<div class="vx-mon-wrap">
      <div class="vx-mon-head">
        <button type="button" id="vxMonBack" class="vx-mon-back">← Voltar</button>
        <div class="vx-mon-head-title"><h1>Monitor de atividades</h1><p>Visão do gestor sobre a operação da Central de Conversas.</p></div>
        <div class="vx-mon-period-tabs">
          ${[['HOJE','Hoje'],['SEMANA','Semana'],['MES','Mês']].map(([k,l])=>`<button type="button" class="${mon.period===k?'active':''}" data-period="${k}">${l}</button>`).join('')}
        </div>
        <select id="vxMonAttendantFilter" title="Filtrar as métricas por atendente, pra comparar um a um">
          <option value="">Todos os atendentes</option>
          ${mon.attendants.map(a=>`<option value="${E(a.id)}" ${mon.metricAttendantFilter===String(a.id)?'selected':''}>${E(a.full_name)}</option>`).join('')}
        </select>
        <button type="button" id="vxMonRefresh">🔄 Atualizar</button>
      </div>
      ${mon.metricAttendantFilter?`<p class="vx-mon-filter-note">Mostrando só as métricas de <b>${E(mon.attendants.find(a=>String(a.id)===mon.metricAttendantFilter)?.full_name||'')}</b> -- escolha "Todos os atendentes" pra voltar à visão geral.</p>`:''}
      ${metricsRow()}
      ${slaCard()}
      ${alertsCard()}
      ${attendantsCard()}
      ${attendantDetailCard()}
      ${fallbackAbandonCard()}
    </div>`;
    document.getElementById('vxMonBack').onclick=backToConversas;
    document.getElementById('vxMonRefresh').onclick=async()=>{await loadAll();render()};
    document.querySelectorAll('[data-period]').forEach(b=>b.onclick=async()=>{mon.period=b.dataset.period;render()});
    document.getElementById('vxMonAttendantFilter').onchange=e=>{mon.metricAttendantFilter=e.target.value;render()};
    document.getElementById('vxMonSlaSave').onclick=async()=>{
      const fields={
        wait_normal_max_min:Number(document.getElementById('vxMonSlaNormal').value)||15,
        wait_atencao_max_min:Number(document.getElementById('vxMonSlaAtencao').value)||30,
        alert_gestor_min:Number(document.getElementById('vxMonSlaAlerta').value)||60,
      };
      try{
        await api('chat_sla_settings',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({company_id:state.profile.active_company_id,...fields,updated_by:state.session?.user?.id||null})});
        toast?.('Limites de SLA salvos.');
        await loadAll();render();
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err')}
    };
    document.querySelectorAll('[data-kpi]').forEach(btn=>{
      const idx=Number(btn.dataset.kpi);
      const m=metricRows();
      const actions=[
        ()=>convModal('Total de atendimentos',m.total),()=>convModal('Em aberto',m.abertas),()=>convModal('Encerradas',m.encerradas),
        ()=>convModal('Não atribuídas',m.naoAtribuidas),()=>convModal('SLA vencido',m.slaVencido),()=>convModal('Retornos vencidos',m.retornosVencidos),
        ()=>transferModal(m.transferidas),null,()=>failedModal(m.falhas),
      ];
      if(actions[idx])btn.onclick=actions[idx];
    });
    document.querySelectorAll('[data-alert]').forEach(btn=>{
      const idx=Number(btn.dataset.alert);
      const alerts=gestorAlerts();
      btn.onclick=()=>convModal('Alerta: '+alerts[idx].text,alerts[idx].rows);
    });
    document.querySelectorAll('[data-attendant]').forEach(tr=>tr.onclick=()=>{mon.selectedAttendantId=tr.dataset.attendant;render()});
    document.querySelectorAll('[data-detail]').forEach(btn=>btn.onclick=()=>{
      const row=attendantRows().find(r=>String(r.a.id)===String(mon.selectedAttendantId));
      if(!row)return;
      const list=btn.dataset.detail==='abertas'?row.open:row.closed;
      document.querySelectorAll('[data-detail]').forEach(b=>b.classList.toggle('active',b===btn));
      const tbody=document.querySelector('#vxMonDetailTable tbody');
      tbody.innerHTML=list.length?list.map(c=>`<tr data-conv="${E(c.id)}"><td><b>${E(c.customer_name||c.clients?.name||'Contato WhatsApp')}</b></td><td>${E(c.customer_phone||'—')}</td><td>${E(norm(c.status))}</td></tr>`).join(''):'<tr><td colspan="3" class="vx-mon-empty">Nenhuma conversa.</td></tr>';
      tbody.querySelectorAll('[data-conv]').forEach(tr=>tr.onclick=()=>openConversaReal(tr.dataset.conv));
    });
    document.querySelectorAll('#vxMonDetailTable [data-conv]').forEach(tr=>tr.onclick=()=>openConversaReal(tr.dataset.conv));
  }

  async function renderChatMonitor(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="card">Carregando Monitor de atividades...</div>';
    await loadAll();
    render();
  }
  window.renderChatMonitor=renderChatMonitor;

  const priorRender=window.render;
  window.render=async function(view){
    if(view==='chat-monitor')return renderChatMonitor();
    return priorRender(view);
  };
})();
