/* VoxAssist V0.8.13 — ponte Electrolux → Agenda.
   NÃO edita field-agenda-complete-v0813.js. Só observa o DOM depois que a
   agenda nativa termina de renderizar e acrescenta cards adicionais nos
   mesmos períodos/faixa "em aberto" já existentes. Se qualquer parte disso
   falhar, a agenda nativa continua funcionando exatamente como hoje — o
   bridge nunca escreve em appointments/service_orders, só em
   external_appointments (via PostgREST, mesmo helper api() do resto do app). */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const STATUS_LABEL={ABERTO:'Em aberto',AGENDADO:'Agendado',CONCLUIDO:'Concluído',CANCELADO:'Cancelado'};
  const FILTER_KEY='voxassist_agenda_filter';
  let injecting=false;

  function role(){return state.profile?.role||'GESTOR'}
  function isTechnician(){return role()==='TECNICO'}

  async function fetchExternalAppointments(date){
    const filter=`or=(appointment_date.eq.${date},appointment_date.is.null)`;
    return api(`external_appointments?select=*&${filter}&status=neq.CANCELADO&order=updated_at.desc`).catch(()=>[]);
  }

  async function fetchTechnicians(){
    return api('profiles?select=id,full_name&active=eq.true&or=(role.eq.TECNICO,external_schedule_enabled.eq.true)&order=full_name').catch(()=>[]);
  }

  function statusLabel(s){return STATUS_LABEL[s]||s}

  function externalCard(a){
    const order=E(a.external_order_number||a.external_id);
    const addr=[a.address_neighborhood,a.address_city].filter(Boolean).join(' · ');
    return `<article class="vx-appt vx-appt-external" data-electrolux-appt="${E(a.id)}" data-status="${E(a.status)}">
      <div class="vx-appt-top"><span class="vx-elx-badge"><span class="vx-elx-badge-dot" aria-hidden="true"></span>Electrolux</span><span class="vx-appt-os">OS ${order}</span></div>
      <div class="vx-appt-name">${E(a.client_name||'Cliente não informado')}</div>
      <small>${addr?E(addr):'Endereço não sincronizado ainda'}</small>
      <div class="vx-card-foot"><span class="vx-state-text">${E(statusLabel(a.status))}</span></div>
    </article>`;
  }

  function openLaneCard(a){
    const order=E(a.external_order_number||a.external_id);
    return `<article class="vx-appt vx-appt-external" data-electrolux-appt="${E(a.id)}" data-status="${E(a.status)}">
      <div class="vx-appt-top"><span class="vx-elx-badge"><span class="vx-elx-badge-dot" aria-hidden="true"></span>Electrolux</span><span class="vx-appt-os">OS ${order}</span></div>
      <div class="vx-appt-name">${E(a.client_name||'Cliente não informado')}</div>
      <small>${a.appointment_date?`${E(a.appointment_date)} ${a.period?'· '+E(a.period):''}`:'Sem data definida'}</small>
      <div class="vx-card-actions"><button data-elx-assign="${E(a.id)}">Atribuir técnico</button></div>
    </article>`;
  }

  function addCountToPeriodTitle(periodEl,extraCount){
    // A Electrolux não informa duração do atendimento, então não dá pra
    // somar aos minutos nativos sem inventar um número. Em vez disso soma
    // uma contagem honesta ao lado, só pra sinalizar ocupação extra real.
    if(!extraCount)return;
    const spans=periodEl.querySelectorAll('.vx-period-title span');
    const capSpan=spans[1];
    if(!capSpan)return;
    capSpan.textContent+=` · +${extraCount} Electrolux`;
  }

  function injectIntoPeriods(root,appointments){
    const scheduled=appointments.filter(a=>a.technician_id&&a.appointment_date&&a.period);
    root.querySelectorAll('.vx-period[data-tech][data-period][data-date]').forEach(periodEl=>{
      const tech=periodEl.dataset.tech,period=periodEl.dataset.period,date=periodEl.dataset.date;
      const items=scheduled.filter(a=>String(a.technician_id)===String(tech)&&a.period===period&&a.appointment_date===date);
      if(!items.length)return;
      const emptySlot=periodEl.querySelector('.vx-empty-slot');
      const html=items.map(externalCard).join('');
      if(emptySlot)emptySlot.insertAdjacentHTML('beforebegin',html),emptySlot.remove();
      else periodEl.insertAdjacentHTML('beforeend',html);
      addCountToPeriodTitle(periodEl,items.length);
    });
  }

  function injectIntoOpenLane(root,appointments){
    const openItems=root.querySelector('.vx-open-items');
    if(!openItems)return; // ausente pra TECNICO — nada a fazer, e correto assim.
    const unassigned=appointments.filter(a=>!a.technician_id);
    if(!unassigned.length)return;
    const empty=openItems.querySelector('small');
    if(empty&&openItems.children.length===1)empty.remove();
    openItems.insertAdjacentHTML('beforeend',unassigned.map(openLaneCard).join(''));
    const counter=root.querySelector('.vx-open-head span');
    if(counter)counter.textContent=String(Number(counter.textContent||0)+unassigned.length);
  }

  function injectIntoListView(root,appointments,techNameById){
    const tbody=root.querySelector('.vx-agenda-list tbody');
    if(!tbody)return;
    const rows=appointments.filter(a=>a.appointment_date).map(a=>`<tr data-electrolux-appt="${E(a.id)}"><td>${E(a.period||'—')}</td><td>—</td><td>${E(a.technician_id?(techNameById[a.technician_id]||'Técnico não encontrado'):'Não atribuído')}</td><td><span class="vx-elx-badge"><span class="vx-elx-badge-dot" aria-hidden="true"></span>Electrolux</span> ${E(a.external_order_number||a.external_id)}</td><td>${E(a.client_name||'—')}</td><td>${E([a.address_neighborhood,a.address_city].filter(Boolean).join(', ')||'—')}</td><td>${E(statusLabel(a.status))}</td></tr>`).join('');
    if(rows)tbody.insertAdjacentHTML('beforeend',rows);
  }

  function bindCardClicks(root,appointments){
    root.querySelectorAll('[data-electrolux-appt]').forEach(el=>{
      el.addEventListener('click',e=>{
        if(e.target.closest('[data-elx-assign]'))return;
        const a=appointments.find(x=>String(x.id)===el.dataset.electroluxAppt);
        if(a)openDetailModal(a);
      });
    });
    root.querySelectorAll('[data-elx-assign]').forEach(btn=>{
      btn.addEventListener('click',async e=>{
        e.stopPropagation();
        if(isTechnician())return;
        await openAssignModal(btn.dataset.elxAssign);
      });
    });
  }

  function modal(html){
    const bg=document.createElement('div');
    bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal">${html}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});
    return bg;
  }

  async function openDetailModal(a){
    const bg=modal(`<h3>Atendimento Electrolux</h3><div class="vx-modal-grid">
      <label class="wide">OS Electrolux<input value="${E(a.external_order_number||a.external_id)}" readonly></label>
      <label class="wide">Cliente<input value="${E(a.client_name||'—')}" readonly></label>
      <label>Data<input value="${E(a.appointment_date||'—')}" readonly></label>
      <label>Período<input value="${E(a.period||'—')}" readonly></label>
      <label class="wide">Observação<input value="${E(a.notes||'—')}" readonly></label>
      <label>Situação<input value="${E(statusLabel(a.status))}" readonly></label>
      <label>Última sincronização<input value="${a.last_synced_at?new Date(a.last_synced_at).toLocaleString('pt-BR'):'—'}" readonly></label>
      <label class="wide" id="elxAddrRow">Endereço<input id="elxAddr" value="Carregando…" readonly></label>
    </div><div class="vx-modal-actions"><button data-cancel>Fechar</button></div>`);
    bg.querySelector('[data-cancel]').onclick=()=>bg.remove();
    try{
      const detail=await fetchElectroluxDetail(a.external_id);
      const addrInput=bg.querySelector('#elxAddr');
      if(addrInput&&detail?.address){
        const addr=detail.address;
        addrInput.value=[addr.street,addr.neighborhood,addr.city,addr.state].filter(Boolean).join(', ')||'Não informado';
      }else if(addrInput){
        addrInput.value='Não foi possível carregar agora.';
      }
    }catch{
      const addrInput=bg.querySelector('#elxAddr');
      if(addrInput)addrInput.value='Não foi possível carregar agora.';
    }
  }

  async function fetchElectroluxDetail(externalId){
    if(!window.CFG||!state.session?.access_token)return null;
    const res=await fetch(`${CFG.url}/functions/v1/get-electrolux-appointment-detail`,{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${state.session.access_token}`,apikey:CFG.key},
      body:JSON.stringify({externalId})
    });
    if(!res.ok)return null;
    return res.json();
  }

  async function openAssignModal(appointmentId){
    const techs=await fetchTechnicians();
    if(!techs.length){toast('Nenhum técnico disponível para atribuir.','err');return}
    const bg=modal(`<h3>Atribuir técnico</h3><div class="vx-modal-grid"><label class="wide">Técnico<select id="elxTech"><option value="">Selecione…</option>${techs.map(t=>`<option value="${E(t.id)}">${E(t.full_name)}</option>`).join('')}</select></label></div><div class="vx-modal-actions"><button data-cancel>Cancelar</button><button class="primary" data-save>Atribuir</button></div>`);
    bg.querySelector('[data-cancel]').onclick=()=>bg.remove();
    bg.querySelector('[data-save]').onclick=async()=>{
      const techId=bg.querySelector('#elxTech').value;
      if(!techId){toast('Selecione um técnico.','err');return}
      const {error}=await patchExternalAppointment(appointmentId,{technician_id:techId});
      if(error){toast('Não foi possível atribuir o técnico.','err');return}
      bg.remove();
      toast('Técnico atribuído ao atendimento Electrolux.');
      window.render('agenda');
    };
  }

  async function patchExternalAppointment(id,body){
    try{
      await api(`external_appointments?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({...body,updated_at:new Date().toISOString()})});
      return {error:null};
    }catch(e){return {error:e}}
  }

  function ensureFilterControl(headEl){
    if(headEl.querySelector('[data-elx-filter]'))return;
    const wrap=document.createElement('div');
    wrap.className='vx-elx-filter-wrap';
    const saved=localStorage.getItem(FILTER_KEY)||'TODOS';
    wrap.innerHTML=`<select data-elx-filter>
      <option value="TODOS" ${saved==='TODOS'?'selected':''}>Todos</option>
      <option value="VOXASSIST" ${saved==='VOXASSIST'?'selected':''}>VoxAssist</option>
      <option value="ELECTROLUX" ${saved==='ELECTROLUX'?'selected':''}>Electrolux</option>
    </select>`;
    headEl.appendChild(wrap);
    applyFilter(saved);
    wrap.querySelector('select').addEventListener('change',e=>{
      localStorage.setItem(FILTER_KEY,e.target.value);
      applyFilter(e.target.value);
    });
  }

  function applyFilter(value){
    const root=document.querySelector('.vx-agenda');
    if(!root)return;
    root.classList.remove('vx-elx-filter-voxassist','vx-elx-filter-electrolux');
    if(value==='VOXASSIST')root.classList.add('vx-elx-filter-voxassist');
    if(value==='ELECTROLUX')root.classList.add('vx-elx-filter-electrolux');
  }

  async function injectElectrolux(){
    const root=document.querySelector('.vx-agenda');
    if(!root)return;
    if(root.dataset.electroluxInjected==='1')return;
    root.dataset.electroluxInjected='1';

    const head=root.querySelector('.vx-agenda-head');
    if(head)ensureFilterControl(head);

    const date=window.__vxAgendaDate||new Date().toISOString().slice(0,10);
    let appointments=[];
    try{
      appointments=await fetchExternalAppointments(date);
    }catch{
      appointments=[];
    }
    if(!appointments||!appointments.length)return;

    try{
      const needsListView=!!root.querySelector('.vx-agenda-list');
      const techNameById={};
      if(needsListView){
        const techs=await fetchTechnicians().catch(()=>[]);
        techs.forEach(t=>{techNameById[t.id]=t.full_name});
      }
      injectIntoPeriods(root,appointments);
      injectIntoOpenLane(root,appointments);
      injectIntoListView(root,appointments,techNameById);
      bindCardClicks(root,appointments);
      const saved=localStorage.getItem(FILTER_KEY)||'TODOS';
      applyFilter(saved);
    }catch(e){
      console.error('[electrolux-agenda-bridge] falha ao injetar cards Electrolux:',e);
    }
  }

  function scheduleInject(){
    if(injecting)return;
    injecting=true;
    setTimeout(()=>{injecting=false;injectElectrolux()},30);
  }

  // agenda-drag-persistence-v0813.js liga draggable="true" em qualquer
  // .vx-appt (não só nas nativas) — o próprio handler de dragstart dela já
  // ignora cartões sem data-appt (que é o nosso caso, de propósito), então
  // soltar um card Electrolux já não faz nada. Isso aqui só evita o cursor
  // "grab" enganoso: cancela o gesto de arrastar antes de começar.
  document.addEventListener('dragstart',e=>{
    if(e.target.closest?.('.vx-appt-external'))e.preventDefault();
  },true);

  const observer=new MutationObserver(()=>{
    if(state.view!=='agenda')return;
    const root=document.querySelector('.vx-agenda');
    if(!root||root.dataset.electroluxInjected==='1')return;
    if(!root.querySelector('.vx-agenda-board, .vx-agenda-list'))return;
    scheduleInject();
  });
  const appEl=document.querySelector('#app')||document.body;
  observer.observe(appEl,{childList:true,subtree:true});
})();
