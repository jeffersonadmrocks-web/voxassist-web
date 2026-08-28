/* VoxAssist V0.8.13 — Minha Jornada (Gestão Operacional, Fase 1 + Fase 2).
   NÃO edita all-menus-layout.js. Injeta um card no topo da grid do hub
   Atividades (ancorado no título "Atividades", único entre os 7 hubs —
   mesma técnica/correção de escopo do módulo de NPS) e, ao clicar,
   substitui #app pela própria tela. "Voltar" chama window.render('agenda').
   A fila e a próxima ação vêm de operational_tasks_view (motor de
   prioridades calculado no banco, sem job de recálculo). Alertas de
   inatividade são gerados pela edge function operational-alerts-scan —
   este arquivo só lê/mostra/reconhece/justifica, nunca decide escalonamento
   sozinho. */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let jornadaScreenActive=false;

  function uid(){return state.session?.user?.id||state.profile?.id||null}
  function isGestor(){return (state.profile?.role||'GESTOR')==='GESTOR'}

  const STATUS_LABEL={PENDENTE:'Pendente',EM_ANDAMENTO:'Em andamento',CONCLUIDA:'Concluída',REAGENDADA:'Reagendada',TRANSFERIDA:'Transferida',CANCELADA:'Cancelada'};
  const SEVERITY_LABEL={LEMBRETE:'Lembrete',ATENCAO:'Atenção',OCORRENCIA:'Ocorrência',CRITICO:'Crítico'};
  const REASON_LABEL={
    ATENDIMENTO_PRESENCIAL:'Atendimento presencial prolongado',
    LIGACAO_EXTENSA:'Ligação extensa',
    REUNIAO_TREINAMENTO:'Reunião ou treinamento',
    ATIVIDADE_EXTERNA:'Atividade externa',
    PAUSA_AUTORIZADA:'Pausa autorizada',
    INDISPONIBILIDADE_TECNICA:'Indisponibilidade técnica do sistema',
    OUTRO:'Outro motivo',
  };

  /* ---------- entrada na tela real de Atividades ----------
     Mesma correção aplicada em electrolux-nps-v0826.js: a tela real que
     aparece ao clicar "Atividades" é renderAgenda() de
     field-agenda-complete-v0813.js (o board "Agenda Externa"), não o hub
     de cards atividades() de all-menus-layout.js — esse é código morto,
     inalcançável (field-agenda-complete-v0813.js intercepta
     view==='agenda' e nunca delega pro hub). Âncora correta:
     .vx-agenda-controls, confirmado lendo renderAgenda() diretamente. */
  function ensureEntryCard(){
    const controls=document.querySelector('.vx-agenda-controls');
    if(!controls||controls.querySelector('[data-jornada-entry]'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.dataset.jornadaEntry='1';
    btn.className='primary';
    btn.textContent='Minha Jornada';
    btn.onclick=openJornadaScreen;
    controls.insertBefore(btn,controls.firstChild);
  }
  const observer=new MutationObserver(()=>{
    if(jornadaScreenActive)return;
    ensureEntryCard();
  });
  observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});

  /* ---------- dados ---------- */
  let cache={tasks:[],alerts:[],lastEventAt:null,concludedToday:0,pendingCount:0,overdueCount:0,punctualityPct:null};

  async function loadAll(){
    const me=uid();
    // Minha Jornada é pessoal (seção 3 do documento) — só tarefas
    // atribuídas a mim. Tarefas de fila de time sem responsável (NPS/
    // Agenda não atribuída) ficam só na tela de origem, não aparecem aqui.
    const [tasks,alerts,lastEventRaw,concludedTodayRaw]=await Promise.all([
      api(`operational_tasks_view?select=*&responsible_user_id=eq.${me}&status=neq.CANCELADA&order=priority_score.desc`).catch(()=>[]),
      api(`operational_alerts?select=*&user_id=eq.${me}&status=in.(ATIVO,RECONHECIDO)&order=created_at.desc`).catch(()=>[]),
      api(`operational_events?select=created_at&user_id=eq.${me}&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`operational_tasks?select=id,due_at,updated_at&responsible_user_id=eq.${me}&status=eq.CONCLUIDA&updated_at=gte.${startOfDayIso()}`).catch(()=>[]),
    ]);
    cache.tasks=tasks||[];
    cache.alerts=alerts||[];
    cache.lastEventAt=lastEventRaw?.[0]?.created_at||null;
    cache.pendingCount=cache.tasks.filter(t=>['PENDENTE','EM_ANDAMENTO'].includes(t.status)).length;
    cache.overdueCount=cache.tasks.filter(t=>t.due_at&&new Date(t.due_at)<new Date()&&!['CONCLUIDA','CANCELADA'].includes(t.status)).length;
    const concludedToday=concludedTodayRaw||[];
    cache.concludedToday=concludedToday.length;
    const withDue=concludedToday.filter(t=>t.due_at);
    cache.punctualityPct=withDue.length?Math.round(100*withDue.filter(t=>new Date(t.updated_at)<=new Date(t.due_at)).length/withDue.length):null;
  }
  function startOfDayIso(){const d=new Date();d.setHours(0,0,0,0);return d.toISOString()}

  async function writeEvent(eventType,taskId,metadata){
    await api('operational_events',{method:'POST',body:JSON.stringify({user_id:uid(),event_type:eventType,operational_task_id:taskId||null,metadata:metadata||{}})}).catch(()=>{});
  }
  async function patchTask(t,patch){
    await api(`operational_tasks?id=eq.${t.id}`,{method:'PATCH',body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
    Object.assign(t,patch);
  }

  /* ---------- navegação ---------- */
  async function openJornadaScreen(){
    jornadaScreenActive=true;
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="vx-jornada"><div class="vx-loading">Carregando Minha Jornada…</div></div>';
    try{
      await loadAll();
      renderJornadaScreen();
    }catch(e){
      app.innerHTML=`<div class="vx-jornada"><div class="card error-card"><h3>Falha ao carregar Minha Jornada</h3><p>${E(e.message||'Erro desconhecido.')}</p><button id="jornadaBackErr">← Voltar</button></div></div>`;
      document.getElementById('jornadaBackErr').onclick=goBack;
    }
  }
  function goBack(){jornadaScreenActive=false;window.render('agenda')}

  /* ---------- render ---------- */
  function myTasks(){return cache.tasks.filter(t=>!['CONCLUIDA','CANCELADA'].includes(t.status))}
  function nextAction(){return myTasks()[0]||null}

  function taskRow(t){
    return `<tr data-task="${E(t.id)}">
      <td>${E(t.title)}</td>
      <td>${E(STATUS_LABEL[t.status]||t.status)}</td>
      <td>${t.due_at?new Date(t.due_at).toLocaleString('pt-BR'):'—'}</td>
      <td>${E(t.priority_reason||'—')}</td>
      <td><button data-task-action="start" data-task-id="${E(t.id)}" ${t.status==='EM_ANDAMENTO'?'disabled':''}>Executar</button>
          <button data-task-action="complete" data-task-id="${E(t.id)}">Concluir</button>
          <button data-task-action="reschedule" data-task-id="${E(t.id)}">Reagendar</button></td>
    </tr>`;
  }

  function alertRow(a){
    return `<div class="vx-jornada-alert vx-jornada-alert-${E((a.severity||'').toLowerCase())}">
      <div><b>${E(SEVERITY_LABEL[a.severity]||a.severity)}</b><span>${E(a.message)}</span></div>
      <div class="vx-jornada-alert-actions">
        ${a.status==='ATIVO'?`<button data-ack="${E(a.id)}">Reconhecer</button>`:''}
        <button data-justify="${E(a.id)}">Justificar</button>
      </div>
    </div>`;
  }

  function renderJornadaScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    const next=nextAction();
    const list=myTasks();
    app.innerHTML=`<div class="vx-jornada">
      <div class="vx-jornada-head">
        <div><button id="jornadaBack">← Voltar</button><h2>Minha Jornada</h2><small>Fila do dia, prioridades e alertas</small></div>
      </div>
      <div class="vx-jornada-transparency">Acompanhamento da jornada — Ativo. O VoxAssist acompanha as atividades operacionais realizadas durante o expediente para auxiliar na organização das tarefas e fornecer indicadores de andamento e produtividade à gestão.</div>

      <h3 class="vx-jornada-section-title">Próxima ação</h3>
      ${next?`<div class="vx-jornada-next">
        <div><strong>${E(next.title)}</strong><small>${E(next.priority_reason||'')}${next.due_at?' · Prazo: '+new Date(next.due_at).toLocaleString('pt-BR'):''}</small></div>
        <button data-task-action="start" data-task-id="${E(next.id)}">Executar agora</button>
      </div>`:'<div class="vx-jornada-next vx-jornada-empty">Nenhuma pendência agora — fila em dia.</div>'}

      <h3 class="vx-jornada-section-title">Placar do dia</h3>
      <div class="vx-jornada-scoreboard">
        <div class="vx-jornada-score"><span>Concluídas hoje</span><b>${cache.concludedToday}</b></div>
        <div class="vx-jornada-score"><span>Pendentes</span><b>${cache.pendingCount}</b></div>
        <div class="vx-jornada-score vx-jornada-score-warn"><span>Atrasadas</span><b>${cache.overdueCount}</b></div>
        <div class="vx-jornada-score"><span>Pontualidade</span><b>${cache.punctualityPct===null?'—':cache.punctualityPct+'%'}</b></div>
        <div class="vx-jornada-score"><span>Última atividade</span><b>${cache.lastEventAt?new Date(cache.lastEventAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—'}</b></div>
      </div>

      ${cache.alerts.length?`<h3 class="vx-jornada-section-title vx-jornada-section-warn">Alertas</h3><div class="vx-jornada-alerts">${cache.alerts.map(alertRow).join('')}</div>`:''}

      <h3 class="vx-jornada-section-title">Fila pessoal</h3>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table"><thead><tr>
        <th>Tarefa</th><th>Situação</th><th>Prazo</th><th>Motivo da prioridade</th><th></th>
      </tr></thead><tbody>${list.map(taskRow).join('')||'<tr><td colspan="5">Nenhuma tarefa na fila.</td></tr>'}</tbody></table></div>
    </div>`;

    document.getElementById('jornadaBack').onclick=goBack;
    document.querySelectorAll('[data-task-action]').forEach(b=>b.onclick=()=>handleTaskAction(b.dataset.taskAction,b.dataset.taskId));
    document.querySelectorAll('[data-ack]').forEach(b=>b.onclick=()=>acknowledgeAlert(b.dataset.ack));
    document.querySelectorAll('[data-justify]').forEach(b=>b.onclick=()=>openJustifyModal(b.dataset.justify));
  }

  /* ---------- ações de tarefa ---------- */
  async function handleTaskAction(action,taskId){
    const t=cache.tasks.find(x=>String(x.id)===String(taskId));
    if(!t)return;
    if(action==='start'){
      await patchTask(t,{status:'EM_ANDAMENTO'});
      await writeEvent('TASK_STARTED',t.id,{});
      toast?.('Tarefa iniciada.');
    }else if(action==='complete'){
      await patchTask(t,{status:'CONCLUIDA'});
      await writeEvent('TASK_COMPLETED',t.id,{});
      toast?.('Tarefa concluída.');
    }else if(action==='reschedule'){
      const novo=prompt('Novo prazo (AAAA-MM-DD HH:MM):', t.due_at?new Date(t.due_at).toISOString().slice(0,16).replace('T',' '):'');
      if(!novo)return;
      const parsed=new Date(novo.replace(' ','T'));
      if(isNaN(parsed.getTime())){toast?.('Data inválida.','err');return}
      await patchTask(t,{due_at:parsed.toISOString(),status:'REAGENDADA',reschedule_count:(t.reschedule_count||0)+1});
      await writeEvent('TASK_RESCHEDULED',t.id,{due_at:parsed.toISOString()});
      toast?.('Tarefa reagendada.');
    }
    await loadAll();
    renderJornadaScreen();
  }

  /* ---------- alertas ---------- */
  async function acknowledgeAlert(alertId){
    await api(`operational_alerts?id=eq.${alertId}`,{method:'PATCH',body:JSON.stringify({status:'RECONHECIDO',acknowledged_at:new Date().toISOString(),acknowledged_by:uid()})}).catch(()=>{});
    await loadAll();
    renderJornadaScreen();
  }

  function modal(html){
    const bg=document.createElement('div');
    bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal vx-jornada-modal">${html}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});
    return bg;
  }

  function openJustifyModal(alertId){
    const bg=modal(`
      <h3>Justificar</h3>
      <div class="vx-modal-grid">
        <label>Motivo<select id="jornadaReason">${Object.entries(REASON_LABEL).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label>
        <label>Observação<textarea id="jornadaNote"></textarea></label>
        <label>Fim do período (opcional)<input id="jornadaPeriodEnd" type="datetime-local"></label>
      </div>
      <div class="vx-modal-actions"><button data-cancel>Cancelar</button><button id="jornadaSaveJustify" class="primary">Salvar</button></div>
    `);
    bg.querySelector('[data-cancel]').onclick=()=>bg.remove();
    bg.querySelector('#jornadaSaveJustify').onclick=async()=>{
      const reason_code=bg.querySelector('#jornadaReason').value;
      const note=bg.querySelector('#jornadaNote').value||null;
      const periodEndRaw=bg.querySelector('#jornadaPeriodEnd').value;
      const period_end=periodEndRaw?new Date(periodEndRaw).toISOString():null;
      try{
        await api('operational_justifications',{method:'POST',body:JSON.stringify({user_id:uid(),operational_alert_id:alertId||null,reason_code,note,period_end})});
        if(alertId)await api(`operational_alerts?id=eq.${alertId}`,{method:'PATCH',body:JSON.stringify({status:'JUSTIFICADO'})}).catch(()=>{});
        toast?.('Justificativa registrada.');
        bg.remove();
        await loadAll();
        renderJornadaScreen();
      }catch(e){toast?.('Erro ao registrar justificativa: '+e.message,'err')}
    };
  }
})();
