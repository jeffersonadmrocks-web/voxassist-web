/* VoxAssist V0.8.12 — Agenda Externa + Estoque/Peças para homologação */
(function(){
 const E=window.esc||((v='')=>String(v??''));
 const today=()=>new Date().toISOString().slice(0,10);
 async function agenda(){
  const app=document.querySelector('#app'); if(!app)return;
  const [techs,rows,orders]=await Promise.all([
   api('profiles?role=eq.TECNICO&active=eq.true&select=id,full_name,external_schedule_enabled&order=full_name').catch(()=>[]),
   api('appointments?select=*&order=appointment_date.asc,start_time.asc&limit=200').catch(()=>[]),
   api('service_orders?select=id,os_number,service_type,technician_id,client_id&order=opened_at.desc&limit=200').catch(()=>[])
  ]);
  const t0=techs.find(t=>t.external_schedule_enabled)||techs[0]; const d=today();
  app.innerHTML=`<div class="vx-op"><div class="vx-op-head"><div><h2>Agenda de Técnicos Externos</h2><p>Agendamento de campo por técnico, horário, OS e observações importantes.</p></div><button class="vx-primary" id="vxNewVisit">+ Novo agendamento</button></div><div class="vx-op-filters"><label>Data<input id="vxAgendaDate" type="date" value="${d}"></label><label>Técnico<select id="vxAgendaTech"><option value="">Todos</option>${techs.map(t=>`<option value="${t.id}">${E(t.full_name)}</option>`).join('')}</select></label></div><div id="vxAgendaList"></div><div class="vx-op-modal-bg" id="vxAgendaModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Novo atendimento externo</h3><div class="vx-form-grid"><label>OS<select id="vxVisitOs"><option value="">Sem vínculo</option>${orders.map(o=>`<option value="${o.id}">${E(o.os_number||o.id)}</option>`).join('')}</select></label><label>Técnico<select id="vxVisitTech">${techs.map(t=>`<option value="${t.id}">${E(t.full_name)}</option>`).join('')}</select></label><label>Data<input id="vxVisitDate" type="date" value="${d}"></label><label>Início<input id="vxVisitStart" type="time" value="09:00"></label><label>Fim<input id="vxVisitEnd" type="time" value="10:00"></label><label>Período<select id="vxVisitPeriod"><option>MANHÃ</option><option>TARDE</option><option>NOITE</option></select></label><label class="full">Alerta importante<input id="vxVisitAlert" placeholder="Ex.: ligar 30 min antes"></label><label class="full">Observação do cliente<textarea id="vxVisitNote" rows="3"></textarea></label></div><button class="vx-primary" id="vxSaveVisit">Salvar agendamento</button></div></div></div>`;
  function draw(){const date=document.querySelector('#vxAgendaDate').value,tech=document.querySelector('#vxAgendaTech').value;const list=rows.filter(r=>(!date||r.appointment_date===date)&&(!tech||r.technician_id===tech));document.querySelector('#vxAgendaList').innerHTML=list.length?`<div class="vx-table"><div class="vx-tr vx-th"><span>Horário</span><span>Técnico</span><span>OS</span><span>Status</span><span>Observação</span></div>${list.map(r=>{const t=techs.find(x=>x.id===r.technician_id);const o=orders.find(x=>x.id===r.service_order_id);return `<div class="vx-tr"><span>${E((r.start_time||'').slice(0,5))}–${E((r.end_time||'').slice(0,5))}</span><span>${E(t?.full_name||'—')}</span><span>${E(o?.os_number||'—')}</span><span>${E(r.status||'AGENDADO')}</span><span>${E(r.important_alert||r.client_note||'')}</span></div>`}).join('')}</div>`:'<div class="vx-empty">Nenhum atendimento externo para o filtro selecionado.</div>'}
  draw();document.querySelector('#vxAgendaDate').onchange=draw;document.querySelector('#vxAgendaTech').onchange=draw;const modal=document.querySelector('#vxAgendaModal');document.querySelector('#vxNewVisit').onclick=()=>{modal.hidden=false;if(t0)document.querySelector('#vxVisitTech').value=t0.id};modal.querySelector('.vx-close').onclick=()=>modal.hidden=true;
  document.querySelector('#vxSaveVisit').onclick=async()=>{const tech=document.querySelector('#vxVisitTech').value,date=document.querySelector('#vxVisitDate').value,start=document.querySelector('#vxVisitStart').value,end=document.querySelector('#vxVisitEnd').value;if(!tech||!date||!start)return toast('Preencha técnico, data e horário.','err');const duplicate=rows.find(r=>r.technician_id===tech&&r.appointment_date===date&&r.start_time?.slice(0,5)===start);if(duplicate&&!confirm('Já existe agendamento para este técnico neste horário. Deseja continuar?'))return;const body={service_order_id:document.querySelector('#vxVisitOs').value||null,technician_id:tech,appointment_date:date,period:document.querySelector('#vxVisitPeriod').value,start_time:start,end_time:end||null,status:'AGENDADO',important_alert:document.querySelector('#vxVisitAlert').value||null,client_note:document.querySelector('#vxVisitNote').value||null,created_by:state?.session?.user?.id||null};try{const saved=await api('appointments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});rows.push(saved?.[0]||body);modal.hidden=true;draw();toast('Agendamento salvo.');}catch(e){toast('Erro ao salvar agendamento: '+e.message,'err')}};
 }

 // ---------- Estoque / Peças ----------
 const idem=()=>(crypto.randomUUID?crypto.randomUUID():'idem-'+Date.now()+'-'+Math.random().toString(36).slice(2));
 const myId=()=>state?.profile?.id||state?.session?.user?.id;
 const myRole=()=>String(state?.profile?.role||'').toUpperCase();
 const isTecnico=()=>myRole()==='TECNICO';

 async function estoque(){
  const app=document.querySelector('#app'); if(!app)return;
  const [items,techs,held,moves,locations,serviceOrders]=await Promise.all([
   api('stock_items?select=*&order=description&limit=300').catch(()=>[]),
   api('profiles?role=eq.TECNICO&active=eq.true&select=id,full_name&order=full_name').catch(()=>[]),
   api('technician_stock?select=*&limit=300').catch(()=>[]),
   api('stock_movements?select=*&order=created_at.desc&limit=300').catch(()=>[]),
   api(`stock_locations?company_id=eq.${state.profile?.active_company_id}&active=eq.true&select=id,name&order=name`).catch(()=>[]),
   api('service_orders?status=neq.FINALIZADA&select=id,os_number&order=opened_at.desc&limit=300').catch(()=>[])
  ]);
  const techName=id=>techs.find(t=>t.id===id)?.full_name||'—';
  const osNumber=id=>serviceOrders.find(o=>o.id===id)?.os_number||id?.slice(0,8)||'—';
  const myStock=isTecnico()?held.filter(h=>h.technician_id===myId()):[];

  app.innerHTML=`<div class="vx-op"><div class="vx-op-head"><div><h2>Estoque e Cadastro de Peças</h2><p>Cadastro, saldos por posição, retirada/entrega/devolução e rastreabilidade por OS.</p></div><button class="vx-primary" id="vxNewPart">+ Cadastrar peça</button></div><div class="vx-kpis"><div><b>${items.length}</b><span>Itens cadastrados</span></div><div><b>${items.reduce((s,i)=>s+Number(i.available_quantity||0),0)}</b><span>Saldo disponível</span></div><div><b>${held.reduce((s,i)=>s+Number(i.quantity||0),0)}</b><span>Com técnicos</span></div><div><b>${moves.filter(m=>m.fiscal_pending).length}</b><span>Pendências fiscais</span></div></div>
  ${isTecnico()&&myStock.length?`<div class="vx-op-hint" style="background:#fff6e6;color:#8b5200"><b>MINHAS PEÇAS (sob minha responsabilidade)</b></div><div class="vx-table" style="margin-bottom:14px"><div class="vx-tr vx-th" style="grid-template-columns:2fr 1fr auto"><span>Peça</span><span>Quantidade</span><span></span></div>${myStock.map(h=>{const it=items.find(i=>i.id===h.stock_item_id);return `<div class="vx-tr" style="grid-template-columns:2fr 1fr auto"><span>${E(it?.code||'—')} — ${E(it?.description||'')}</span><span>${E(h.quantity)}</span><span><button type="button" class="vx-mini-btn" data-apply="${h.stock_item_id}">Aplicar nesta OS</button></span></div>`}).join('')}</div>`:''}
  <input id="vxPartSearch" class="vx-search" placeholder="Buscar por código, descrição, fabricante ou modelo"><div id="vxPartsList"></div>
  <div class="vx-op-modal-bg" id="vxPartModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Cadastrar peça</h3>
    <p class="vx-op-hint">O cadastro só define a IDENTIDADE da peça -- saldo nasce zero. Para ter saldo, use "+ Entrada" depois de cadastrar.</p>
    <div class="vx-form-grid"><label>Código<input id="pCode"></label><label>Descrição<input id="pDesc"></label><label class="full">Fabricante (opcional -- pode confirmar depois)<input id="pMaker"></label></div>
    <details class="vx-op-details"><summary>+ Mais detalhes (opcional)</summary>
    <div class="vx-form-grid"><label>Grupo<input id="pGroup"></label><label>Fornecedor<input id="pSupplier"></label><label>Localização (legado/exibição)<input id="pLoc"></label><label>Qtd. fiscal<input id="pFiscal" type="number" step="0.01" value="0"></label><label>Custo<input id="pCost" data-currency value="0"></label><label>Preço referência<input id="pPrice" data-currency value="0"></label><label class="full">Modelos compatíveis<input id="pModels"></label></div>
    </details>
    <div class="vx-op-actions"><button type="button" class="vx-secondary-btn" id="vxCancelPart">Cancelar</button><button class="vx-primary" id="vxSavePart">Salvar peça</button></div>
  </div></div>
  <div class="vx-op-modal-bg" id="vxEntryModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Registrar entrada</h3>
    <div class="vx-form-grid">
      <label class="full">Peça<input id="eItemLabel" disabled></label>
      <label>Local<select id="eLocation">${locations.map(l=>`<option value="${l.id}">${E(l.name)}</option>`).join('')}</select></label>
      <label>Posição<input id="ePosition" placeholder="Ex.: A-03"></label>
      <label>Quantidade<input id="eQuantity" type="number" step="0.01" min="0.01"></label>
      <label class="full">Observação<input id="eNotes" placeholder="Opcional"></label>
    </div>
    <button class="vx-primary" id="vxConfirmEntry">Confirmar entrada</button>
  </div></div>
  <div class="vx-op-modal-bg" id="vxWithdrawModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Retirar peça</h3>
    <div class="vx-form-grid">
      <label class="full">Peça<input id="wItemLabel" disabled></label>
      <label class="full">Local / posição (saldo disponível)<select id="wBalance"></select></label>
      <label>Quantidade<input id="wQuantity" type="number" step="0.01" min="0.01"></label>
      <label>Destino<select id="wDestination"><option value="OS">Usar em uma OS</option><option value="TECNICO">Entregar ao técnico</option></select></label>
      <label class="full" id="wOsBox">OS<select id="wOs"><option value="">Selecione...</option>${serviceOrders.map(o=>`<option value="${o.id}">${E(o.os_number)}</option>`).join('')}</select></label>
      <label class="full" id="wTechBox" style="display:none">Técnico<select id="wTech">${techs.map(t=>`<option value="${t.id}">${E(t.full_name)}</option>`).join('')}</select></label>
      <label class="full">Observação<input id="wNotes" placeholder="Opcional"></label>
    </div>
    <button class="vx-primary" id="vxConfirmWithdraw">Confirmar retirada</button>
  </div></div>
  <div class="vx-op-modal-bg" id="vxReturnModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Devolver ao estoque</h3>
    <div class="vx-form-grid">
      <label class="full">Retirada a devolver<select id="rMovement"></select></label>
      <label>Quantidade<input id="rQuantity" type="number" step="0.01" min="0.01"></label>
      <label>Condição<select id="rCondition"><option value="DISPONIVEL">Normal (volta pro disponível)</option><option value="QUARENTENA">Avaria/dúvida (quarentena)</option></select></label>
      <label class="full">Observação<input id="rNotes" placeholder="Padrão: NÃO UTILIZADA"></label>
    </div>
    <button class="vx-primary" id="vxConfirmReturn">Confirmar devolução</button>
  </div></div>
  <div class="vx-op-modal-bg" id="vxHistoryModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Histórico de movimentações</h3><div id="vxHistoryList"></div></div></div>
  <div class="vx-op-modal-bg" id="vxQuarantineModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Quarentena</h3><div id="vxQuarantineList"></div></div></div>
  <div class="vx-op-modal-bg" id="vxApplyModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Aplicar peça nesta OS</h3>
    <div class="vx-form-grid">
      <label class="full">Peça<input id="aItemLabel" disabled></label>
      <label class="full">OS<select id="aOs"><option value="">Selecione...</option>${serviceOrders.map(o=>`<option value="${o.id}">${E(o.os_number)}</option>`).join('')}</select></label>
      <label>Quantidade<input id="aQuantity" type="number" step="0.01" min="0.01"></label>
      <label class="full">Observação<input id="aNotes" placeholder="Opcional"></label>
    </div>
    <button class="vx-primary" id="vxConfirmApply">Confirmar aplicação</button>
  </div></div>
  </div>`;

  function draw(){const q=(document.querySelector('#vxPartSearch').value||'').toUpperCase();const list=items.filter(i=>[i.code,i.description,i.manufacturer,i.compatible_models].join(' ').toUpperCase().includes(q));document.querySelector('#vxPartsList').innerHTML=`<div class="vx-table"><div class="vx-tr vx-tr-stock vx-th"><span>Código</span><span>Descrição</span><span>Fabricante</span><span>Disponível</span><span>Fiscal</span><span></span></div>${list.map(i=>`<div class="vx-tr vx-tr-stock"><span>${E(i.code||'—')}</span><span>${E(i.description||'')}</span><span>${E(i.manufacturer||'')}</span><span>${E(i.available_quantity||0)}</span><span>${E(i.fiscal_quantity||0)}</span><span class="vx-stock-row-actions"><button type="button" class="vx-mini-btn" data-entry="${i.id}">+ Entrada</button>${isGestorOrEstoque()?`<button type="button" class="vx-mini-btn" data-withdraw="${i.id}">Retirar</button><button type="button" class="vx-mini-btn" data-kebab="${i.id}">⋮</button>`:''}</span></div>`).join('')}</div>`;
   document.querySelectorAll('[data-entry]').forEach(b=>b.onclick=()=>openEntryModal(items.find(i=>i.id===b.dataset.entry)));
   document.querySelectorAll('[data-withdraw]').forEach(b=>b.onclick=()=>openWithdrawModal(items.find(i=>i.id===b.dataset.withdraw)));
   document.querySelectorAll('[data-kebab]').forEach(b=>b.onclick=()=>openItemMenu(items.find(i=>i.id===b.dataset.kebab)));
   document.querySelectorAll('[data-apply]').forEach(b=>b.onclick=()=>openApplyModal(items.find(i=>i.id===b.dataset.apply)));
  }
  function isGestorOrEstoque(){return ['GESTOR','ESTOQUE'].includes(myRole());}
  draw();document.querySelector('#vxPartSearch').oninput=draw;
  const partModal=document.querySelector('#vxPartModal');
  document.querySelector('#vxNewPart').onclick=()=>partModal.hidden=false;
  const closePart=()=>partModal.hidden=true;
  partModal.querySelector('.vx-close').onclick=closePart;
  document.querySelector('#vxCancelPart').onclick=closePart;
  document.querySelector('#vxSavePart').onclick=async()=>{const body={code:document.querySelector('#pCode').value.trim(),description:document.querySelector('#pDesc').value.trim(),manufacturer:document.querySelector('#pMaker').value.trim(),product_group:document.querySelector('#pGroup').value.trim(),supplier:document.querySelector('#pSupplier').value.trim(),storage_location:document.querySelector('#pLoc').value.trim(),fiscal_quantity:Number(document.querySelector('#pFiscal').value||0),available_quantity:0,unit_cost:Number(String(document.querySelector('#pCost').value).replace(/[^\d,.-]/g,'').replace('.','').replace(',','.'))||0,reference_price:Number(String(document.querySelector('#pPrice').value).replace(/[^\d,.-]/g,'').replace('.','').replace(',','.'))||0,compatible_models:document.querySelector('#pModels').value.trim()};if(!body.code||!body.description)return toast('Código e descrição são obrigatórios.','err');try{const saved=await api('stock_items',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});items.push(saved?.[0]||body);closePart();draw();toast('Peça cadastrada com saldo zero.');}catch(e){toast('Erro ao cadastrar peça: '+e.message,'err')}};

  // ---- Registrar entrada (única forma de gerar saldo) ----
  const entryModal=document.querySelector('#vxEntryModal');
  function openEntryModal(item){
   if(!item)return;
   entryModal.dataset.itemId=item.id;
   entryModal.querySelector('#eItemLabel').value=`${item.code||'—'} — ${item.description||''}`;
   entryModal.querySelector('#ePosition').value='';
   entryModal.querySelector('#eQuantity').value='';
   entryModal.querySelector('#eNotes').value='';
   entryModal.hidden=false;
  }
  entryModal.querySelector('.vx-close').onclick=()=>entryModal.hidden=true;
  const confirmEntryBtn=document.querySelector('#vxConfirmEntry');
  confirmEntryBtn.onclick=async()=>{
   if(confirmEntryBtn.disabled)return;
   const itemId=entryModal.dataset.itemId;
   const locationId=entryModal.querySelector('#eLocation').value;
   const position=entryModal.querySelector('#ePosition').value.trim();
   const quantity=Number(String(entryModal.querySelector('#eQuantity').value||'0').replace(',','.'));
   const notes=entryModal.querySelector('#eNotes').value.trim();
   if(!locationId)return toast('Selecione o local.','err');
   if(!position)return toast('Informe a posição.','err');
   if(!(quantity>0))return toast('Informe uma quantidade maior que zero.','err');
   confirmEntryBtn.disabled=true;
   try{
    const result=await api('rpc/stock_register_entry',{method:'POST',body:JSON.stringify({
     p_stock_item_id:itemId,p_location_id:locationId,p_position_code:position,
     p_quantity:quantity,p_notes:notes||null,p_idempotency_key:idem()
    })});
    const newQty=result?.[0]?.out_new_quantity;
    toast(`Entrada registrada. Quantidade resultante na posição: ${newQty ?? '—'}.`);
    entryModal.hidden=true;
    await refreshItem(itemId);
   }catch(e){toast('Erro ao registrar entrada: '+e.message,'err');}
   finally{confirmEntryBtn.disabled=false;}
  };

  async function refreshItem(itemId){
   const [fresh]=await api(`stock_items?id=eq.${itemId}&select=*`).catch(()=>[]);
   if(fresh){const idx=items.findIndex(i=>i.id===itemId);if(idx>=0)items[idx]=fresh;}
   draw();
  }

  // ---- Retirar (uso em OS ou entrega ao técnico) ----
  const withdrawModal=document.querySelector('#vxWithdrawModal');
  async function openWithdrawModal(item){
   if(!item)return;
   withdrawModal.dataset.itemId=item.id;
   withdrawModal.querySelector('#wItemLabel').value=`${item.code||'—'} — ${item.description||''}`;
   const sel=withdrawModal.querySelector('#wBalance');
   sel.innerHTML='<option>Carregando...</option>';
   withdrawModal.hidden=false;
   const balances=await api(`stock_balances?stock_item_id=eq.${item.id}&state=eq.DISPONIVEL&quantity=gt.0&select=id,quantity,location_id,position_id,stock_locations(name),stock_positions(code)`).catch(()=>[]);
   if(!balances.length){sel.innerHTML='<option value="">Nenhum saldo disponível pra retirar</option>';}
   else sel.innerHTML=balances.map(b=>`<option value="${b.location_id}|${b.stock_positions?.code||''}" data-max="${b.quantity}">${E(b.stock_locations?.name||'—')} — ${E(b.stock_positions?.code||'—')} (saldo: ${E(b.quantity)})</option>`).join('');
   withdrawModal.querySelector('#wQuantity').value='';
   withdrawModal.querySelector('#wNotes').value='';
   withdrawModal.querySelector('#wDestination').value='OS';
   withdrawModal.querySelector('#wOsBox').style.display='';
   withdrawModal.querySelector('#wTechBox').style.display='none';
  }
  withdrawModal.querySelector('.vx-close').onclick=()=>withdrawModal.hidden=true;
  withdrawModal.querySelector('#wDestination').onchange=e=>{
   const os=e.target.value==='OS';
   withdrawModal.querySelector('#wOsBox').style.display=os?'':'none';
   withdrawModal.querySelector('#wTechBox').style.display=os?'none':'';
  };
  const confirmWithdrawBtn=document.querySelector('#vxConfirmWithdraw');
  confirmWithdrawBtn.onclick=async()=>{
   if(confirmWithdrawBtn.disabled)return;
   const itemId=withdrawModal.dataset.itemId;
   const balOpt=withdrawModal.querySelector('#wBalance').selectedOptions[0];
   if(!balOpt||!balOpt.value)return toast('Não há saldo disponível pra retirar.','err');
   const [locationId,positionCode]=balOpt.value.split('|');
   const quantity=Number(String(withdrawModal.querySelector('#wQuantity').value||'0').replace(',','.'));
   const destination=withdrawModal.querySelector('#wDestination').value;
   const osId=withdrawModal.querySelector('#wOs').value;
   const techId=withdrawModal.querySelector('#wTech').value;
   const notes=withdrawModal.querySelector('#wNotes').value.trim();
   if(!(quantity>0))return toast('Informe uma quantidade maior que zero.','err');
   if(quantity>Number(balOpt.dataset.max))return toast('Quantidade maior que o saldo disponível nessa posição.','err');
   if(destination==='OS'&&!osId)return toast('Selecione a OS.','err');
   if(destination==='TECNICO'&&!techId)return toast('Selecione o técnico.','err');
   confirmWithdrawBtn.disabled=true;
   try{
    await api('rpc/stock_withdraw',{method:'POST',body:JSON.stringify({
     p_stock_item_id:itemId,p_location_id:locationId,p_position_code:positionCode,p_quantity:quantity,
     p_destination:destination,p_service_order_id:destination==='OS'?osId:null,p_technician_id:destination==='TECNICO'?techId:null,
     p_notes:notes||null,p_idempotency_key:idem()
    })});
    toast(destination==='OS'?'Retirada registrada para a OS.':'Peça entregue ao técnico.');
    withdrawModal.hidden=true;
    await refreshItem(itemId);
   }catch(e){toast('Erro ao retirar: '+e.message,'err');}
   finally{confirmWithdrawBtn.disabled=false;}
  };

  // ---- Menu ⋮ por peça: Devolver / Histórico / Quarentena ----
  function openItemMenu(item){
   if(!item)return;
   const choice=prompt(`${item.code||''} — ${item.description||''}\n\nDigite:\n1 = Devolver\n2 = Histórico\n3 = Quarentena`);
   if(choice==='1')openReturnModal(item);
   else if(choice==='2')openHistoryModal(item);
   else if(choice==='3')openQuarantineModal(item);
  }

  const returnModal=document.querySelector('#vxReturnModal');
  async function openReturnModal(item){
   returnModal.dataset.itemId=item.id;
   const sel=returnModal.querySelector('#rMovement');
   sel.innerHTML='<option>Carregando...</option>';
   returnModal.hidden=false;
   const withdrawals=moves.filter(m=>m.movement_type==='WITHDRAWAL'&&m.item_id===item.id);
   const returns=moves.filter(m=>m.movement_type==='TECH_RETURN'&&m.item_id===item.id);
   const options=withdrawals.map(w=>{
    const returned=returns.filter(r=>r.compensates_movement_id===w.id).reduce((s,r)=>s+Number(r.quantity||0),0);
    const remaining=Number(w.quantity||0)-returned;
    const dest=w.service_order_id?`OS ${osNumber(w.service_order_id)}`:`Técnico ${techName(w.technician_id)}`;
    return {id:w.id,remaining,label:`${new Date(w.created_at).toLocaleDateString('pt-BR')} — ${dest} — retirado ${w.quantity}, resta devolver ${remaining}`};
   }).filter(o=>o.remaining>0.004);
   sel.innerHTML=options.length?options.map(o=>`<option value="${o.id}" data-max="${o.remaining}">${E(o.label)}</option>`).join(''):'<option value="">Nenhuma retirada pendente de devolução</option>';
   returnModal.querySelector('#rQuantity').value='';
   returnModal.querySelector('#rNotes').value='';
   returnModal.querySelector('#rCondition').value='DISPONIVEL';
  }
  returnModal.querySelector('.vx-close').onclick=()=>returnModal.hidden=true;
  const confirmReturnBtn=document.querySelector('#vxConfirmReturn');
  confirmReturnBtn.onclick=async()=>{
   if(confirmReturnBtn.disabled)return;
   const itemId=returnModal.dataset.itemId;
   const movOpt=returnModal.querySelector('#rMovement').selectedOptions[0];
   if(!movOpt||!movOpt.value)return toast('Não há retirada pendente de devolução.','err');
   const quantity=Number(String(returnModal.querySelector('#rQuantity').value||'0').replace(',','.'));
   const condition=returnModal.querySelector('#rCondition').value;
   const notes=returnModal.querySelector('#rNotes').value.trim();
   if(!(quantity>0))return toast('Informe uma quantidade maior que zero.','err');
   if(quantity>Number(movOpt.dataset.max))return toast('Quantidade maior que o pendente de devolução.','err');
   confirmReturnBtn.disabled=true;
   try{
    await api('rpc/stock_return',{method:'POST',body:JSON.stringify({
     p_movement_id:movOpt.value,p_quantity:quantity,p_condition:condition,p_notes:notes||null,p_idempotency_key:idem()
    })});
    toast('Devolução registrada.');
    returnModal.hidden=true;
    await refreshItem(itemId);
   }catch(e){toast('Erro ao devolver: '+e.message,'err');}
   finally{confirmReturnBtn.disabled=false;}
  };

  const historyModal=document.querySelector('#vxHistoryModal');
  function openHistoryModal(item){
   const list=moves.filter(m=>m.item_id===item.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
   const label=m=>({ENTRY:'Entrada',WITHDRAWAL:'Retirada',TECH_RETURN:'Devolução',APPLICATION:'Aplicação/consumo',QUARANTINE_RELEASE:'Liberação de quarentena'}[m.movement_type]||m.movement_type);
   const dest=m=>m.service_order_id?`OS ${osNumber(m.service_order_id)}`:m.technician_id?`Técnico ${techName(m.technician_id)}`:'—';
   historyModal.querySelector('#vxHistoryList').innerHTML=list.length?`<div class="vx-table"><div class="vx-tr vx-th" style="grid-template-columns:1fr 1fr .8fr 1.2fr 1.5fr"><span>Data</span><span>Tipo</span><span>Qtd.</span><span>Destino/origem</span><span>Observação</span></div>${list.map(m=>`<div class="vx-tr" style="grid-template-columns:1fr 1fr .8fr 1.2fr 1.5fr"><span>${E(new Date(m.created_at).toLocaleString('pt-BR'))}</span><span>${E(label(m))}</span><span>${E(m.quantity)}</span><span>${E(dest(m))}</span><span>${E(m.notes||'—')}</span></div>`).join('')}</div>`:'<div class="vx-empty">Nenhuma movimentação registrada.</div>';
   historyModal.hidden=false;
  }
  historyModal.querySelector('.vx-close').onclick=()=>historyModal.hidden=true;

  const quarantineModal=document.querySelector('#vxQuarantineModal');
  async function openQuarantineModal(item){
   quarantineModal.hidden=false;
   const list=quarantineModal.querySelector('#vxQuarantineList');
   list.innerHTML='Carregando...';
   const balances=await api(`stock_balances?stock_item_id=eq.${item.id}&state=eq.QUARENTENA&quantity=gt.0&select=id,quantity,stock_locations(name),stock_positions(code)`).catch(()=>[]);
   if(!balances.length){list.innerHTML='<div class="vx-empty">Nenhum saldo em quarentena pra esta peça.</div>';return;}
   list.innerHTML=`<div class="vx-table">${balances.map(b=>`<div class="vx-tr" style="grid-template-columns:2fr 1fr auto"><span>${E(b.stock_locations?.name||'—')} — ${E(b.stock_positions?.code||'—')}</span><span>${E(b.quantity)}</span><span><button type="button" class="vx-mini-btn" data-release="${b.id}" data-max="${b.quantity}">Liberar</button></span></div>`).join('')}</div>`;
   list.querySelectorAll('[data-release]').forEach(btn=>btn.onclick=async()=>{
    const max=Number(btn.dataset.max);
    const raw=prompt(`Quantidade a liberar pra disponível (máx. ${max}):`,String(max));
    if(raw===null)return;
    const quantity=Number(String(raw).replace(',','.'));
    if(!(quantity>0)||quantity>max)return toast('Quantidade inválida.','err');
    try{
     await api('rpc/stock_release_quarantine',{method:'POST',body:JSON.stringify({p_balance_id:btn.dataset.release,p_quantity:quantity,p_idempotency_key:idem()})});
     toast('Quarentena liberada.');
     quarantineModal.hidden=true;
     await refreshItem(item.id);
    }catch(e){toast('Erro ao liberar quarentena: '+e.message,'err');}
   });
  }
  quarantineModal.querySelector('.vx-close').onclick=()=>quarantineModal.hidden=true;

  // ---- Aplicar (técnico consome peça sob a própria responsabilidade) ----
  const applyModal=document.querySelector('#vxApplyModal');
  function openApplyModal(item){
   if(!item)return;
   applyModal.dataset.itemId=item.id;
   applyModal.querySelector('#aItemLabel').value=`${item.code||'—'} — ${item.description||''}`;
   applyModal.querySelector('#aOs').value='';
   applyModal.querySelector('#aQuantity').value='';
   applyModal.querySelector('#aNotes').value='';
   applyModal.hidden=false;
  }
  applyModal.querySelector('.vx-close').onclick=()=>applyModal.hidden=true;
  const confirmApplyBtn=document.querySelector('#vxConfirmApply');
  confirmApplyBtn.onclick=async()=>{
   if(confirmApplyBtn.disabled)return;
   const itemId=applyModal.dataset.itemId;
   const osId=applyModal.querySelector('#aOs').value;
   const quantity=Number(String(applyModal.querySelector('#aQuantity').value||'0').replace(',','.'));
   const notes=applyModal.querySelector('#aNotes').value.trim();
   if(!osId)return toast('Selecione a OS.','err');
   if(!(quantity>0))return toast('Informe uma quantidade maior que zero.','err');
   confirmApplyBtn.disabled=true;
   try{
    await api('rpc/stock_apply',{method:'POST',body:JSON.stringify({
     p_technician_id:myId(),p_stock_item_id:itemId,p_quantity:quantity,p_service_order_id:osId,p_notes:notes||null,p_idempotency_key:idem()
    })});
    toast('Aplicação registrada.');
    applyModal.hidden=true;
    estoque();
   }catch(e){toast('Erro ao aplicar: '+e.message,'err');}
   finally{confirmApplyBtn.disabled=false;}
  };
 }
 window.renderExternalAgenda=agenda;window.renderStockWorkbench=estoque;
 document.addEventListener('click',e=>{const b=e.target.closest('[data-target]');if(!b)return;if(b.dataset.target==='agenda-operacional'){e.preventDefault();e.stopImmediatePropagation();agenda();}if(b.dataset.target==='estoque-operacional'){e.preventDefault();e.stopImmediatePropagation();estoque();}},true);
 const prev=window.render;window.render=async function(view){if(view==='agenda')return agenda();if(view==='estoque')return estoque();return prev.apply(this,arguments)};
})();
