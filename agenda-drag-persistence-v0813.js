/* VoxAssist V0.8.13 — Drag & Drop persistente da Agenda */
(function(){
  let drag=null;
  let busy=false;
  const role=()=>String(state?.profile?.role||'GESTOR').toUpperCase();
  const uid=()=>state?.session?.user?.id||state?.profile?.id||null;
  const friendly=(e)=>{
    const m=String(e?.message||e||'');
    if(/row-level security|rls|policy/i.test(m)) return 'A alteração foi bloqueada por segurança. Confira a Empresa Ativa e suas permissões.';
    if(/permission|permiss|forbidden|unauthorized|401|403/i.test(m)) return 'Seu usuário não possui permissão para alterar esta agenda.';
    if(/network|fetch|failed to fetch/i.test(m)) return 'Não foi possível comunicar com o servidor. Tente novamente.';
    return 'Não foi possível mover o atendimento. A posição anterior foi preservada.';
  };

  function enableCards(root=document){
    if(role()==='TECNICO')return;
    root.querySelectorAll?.('.vx-open-items .vx-appt,.vx-period .vx-appt').forEach(c=>{
      c.setAttribute('draggable','true');
      c.style.cursor='grab';
    });
  }

  function sourceSequence(sourceLane,movedId){
    if(!sourceLane)return [];
    return [...sourceLane.querySelectorAll('.vx-appt[data-appt]')]
      .map(c=>c.dataset.appt)
      .filter(id=>id && id!==movedId && !String(id).startsWith('new:'));
  }

  function targetSequence(lane,movedId,y,newId){
    const cards=[...lane.querySelectorAll('.vx-appt[data-appt]')].filter(c=>c.dataset.appt!==movedId);
    let index=cards.length;
    for(let i=0;i<cards.length;i++){
      const r=cards[i].getBoundingClientRect();
      if(y < r.top+r.height/2){index=i;break;}
    }
    const ids=cards.map(c=>c.dataset.appt).filter(id=>id&&!String(id).startsWith('new:'));
    ids.splice(index,0,newId||movedId);
    return [...new Set(ids)];
  }

  async function patch(id,body){
    await api(`appointments?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...body,updated_by:uid(),updated_at:new Date().toISOString()})});
  }

  async function appointmentById(id){
    const rows=await api(`appointments?id=eq.${encodeURIComponent(id)}&select=id,service_order_id,appointment_date,period,technician_id,status&limit=1`).catch(()=>[]);
    return rows?.[0]||null;
  }

  async function activeAppointmentsForOs(osId){
    return await api(`appointments?service_order_id=eq.${encodeURIComponent(osId)}&status=neq.CANCELADO&select=id,service_order_id,appointment_date,period,technician_id,status,route_order&order=appointment_date.asc.nullsfirst`).catch(()=>[]);
  }

  async function cancelOpenDuplicates(osId,keepId){
    const rows=await activeAppointmentsForOs(osId);
    const duplicates=rows.filter(a=>String(a.id)!==String(keepId)&&!a.appointment_date);
    for(const a of duplicates){
      await patch(a.id,{status:'CANCELADO',appointment_date:null,period:null,technician_id:null,route_order:999});
    }
  }

  async function renumber(ids){
    const unique=[...new Set(ids.filter(Boolean))];
    for(let i=0;i<unique.length;i++) await patch(unique[i],{route_order:i+1});
  }

  async function createForPending(osId,lane){
    const existing=await activeAppointmentsForOs(osId);
    const reusable=existing.find(a=>!a.appointment_date)||existing[0];
    if(reusable?.id){
      await patch(reusable.id,{
        technician_id:lane.dataset.tech,
        appointment_date:lane.dataset.date,
        period:lane.dataset.period,
        status:'AGENDADO',
        route_order:999
      });
      await cancelOpenDuplicates(osId,reusable.id);
      return String(reusable.id);
    }
    const rows=await api('appointments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({
      service_order_id:osId,
      technician_id:lane.dataset.tech,
      appointment_date:lane.dataset.date,
      period:lane.dataset.period,
      status:'AGENDADO',
      route_order:999,
      duration_minutes:50,
      created_by:uid(),
      updated_by:uid()
    })});
    const a=rows?.[0];
    if(!a?.id)throw new Error('Falha ao criar agendamento');
    await cancelOpenDuplicates(osId,a.id);
    return String(a.id);
  }

  async function moveToLane(lane,e){
    if(busy||!drag||role()==='TECNICO')return;
    busy=true;
    lane.classList.add('vx-drop-active');
    const oldId=drag.id;
    const source=drag.sourceLane;
    try{
      if(lane.classList.contains('vx-period-blocked')) throw new Error('Período bloqueado');
      let realId=oldId;
      let osId=null;
      if(String(oldId).startsWith('new:')){
        osId=String(oldId).slice(4);
        realId=await createForPending(osId,lane);
      }else{
        const current=await appointmentById(realId);
        osId=current?.service_order_id||null;
        await patch(realId,{appointment_date:lane.dataset.date,period:lane.dataset.period,technician_id:lane.dataset.tech,status:'AGENDADO',route_order:999});
        if(osId)await cancelOpenDuplicates(osId,realId);
      }
      const targetIds=targetSequence(lane,oldId,e.clientY,realId);
      await renumber(targetIds);
      if(source&&source!==lane) await renumber(sourceSequence(source,oldId));
      toast('Atendimento movido e salvo na agenda.');
      drag=null;
      setTimeout(()=>window.render?.('agenda'),0);
    }catch(err){
      toast(friendly(err),'err');
      setTimeout(()=>window.render?.('agenda'),0);
    }finally{
      lane.classList.remove('vx-drop-active');
      busy=false;
    }
  }

  async function moveToOpen(openLane){
    if(busy||!drag||role()==='TECNICO')return;
    if(String(drag.id).startsWith('new:'))return;
    busy=true;
    try{
      const current=await appointmentById(drag.id);
      await patch(drag.id,{appointment_date:null,period:null,technician_id:null,status:'ABERTO',route_order:999});
      if(current?.service_order_id)await cancelOpenDuplicates(current.service_order_id,drag.id);
      if(drag.sourceLane)await renumber(sourceSequence(drag.sourceLane,drag.id));
      toast('Atendimento devolvido para Agendamentos em aberto.');
      drag=null;
      setTimeout(()=>window.render?.('agenda'),0);
    }catch(err){toast(friendly(err),'err');setTimeout(()=>window.render?.('agenda'),0)}finally{busy=false}
  }

  document.addEventListener('dragstart',e=>{
    const card=e.target.closest?.('.vx-appt[data-appt]');
    if(!card||role()==='TECNICO')return;
    drag={id:String(card.dataset.appt||''),sourceLane:card.closest('.vx-period')};
    try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',drag.id)}catch{}
    card.classList.add('vx-dragging');
  },true);

  document.addEventListener('dragend',e=>{
    e.target.closest?.('.vx-appt')?.classList.remove('vx-dragging');
    document.querySelectorAll('.vx-drop-active').forEach(x=>x.classList.remove('vx-drop-active'));
  },true);

  document.addEventListener('dragover',e=>{
    const lane=e.target.closest?.('.vx-period,.vx-open-items');
    if(!lane||!drag||role()==='TECNICO')return;
    e.preventDefault();
    try{e.dataTransfer.dropEffect='move'}catch{}
    lane.classList.add('vx-drop-active');
  },true);

  document.addEventListener('dragleave',e=>{
    const lane=e.target.closest?.('.vx-period,.vx-open-items');
    if(lane&&!lane.contains(e.relatedTarget))lane.classList.remove('vx-drop-active');
  },true);

  document.addEventListener('drop',e=>{
    const lane=e.target.closest?.('.vx-period,.vx-open-items');
    if(!lane||!drag||role()==='TECNICO')return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    if(lane.classList.contains('vx-open-items')) moveToOpen(lane); else moveToLane(lane,e);
  },true);

  const style=document.createElement('style');
  style.textContent='.vx-appt[draggable="true"]{cursor:grab}.vx-appt.vx-dragging{opacity:.45}.vx-period.vx-drop-active,.vx-open-items.vx-drop-active{outline:2px dashed #2c7be5;outline-offset:-3px;background:#eef6ff!important}';
  document.head.appendChild(style);
  new MutationObserver(()=>enableCards()).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>enableCards(),200));
  setTimeout(()=>enableCards(),800);
})();
