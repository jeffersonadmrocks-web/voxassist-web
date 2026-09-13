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
 async function estoque(){
  const app=document.querySelector('#app'); if(!app)return;
  const [items,techs,held,moves,locations]=await Promise.all([
   api('stock_items?select=*&order=description&limit=300').catch(()=>[]),
   api('profiles?role=eq.TECNICO&active=eq.true&select=id,full_name&order=full_name').catch(()=>[]),
   api('technician_stock?select=*&limit=300').catch(()=>[]),
   api('stock_movements?select=*&order=created_at.desc&limit=100').catch(()=>[]),
   api(`stock_locations?company_id=eq.${state.profile?.active_company_id}&active=eq.true&select=id,name&order=name`).catch(()=>[])
  ]);
  app.innerHTML=`<div class="vx-op"><div class="vx-op-head"><div><h2>Estoque e Cadastro de Peças</h2><p>Cadastro, saldos fiscal/operacional, estoque em poder do técnico e rastreabilidade por OS.</p></div><button class="vx-primary" id="vxNewPart">+ Cadastrar peça</button></div><div class="vx-kpis"><div><b>${items.length}</b><span>Itens cadastrados</span></div><div><b>${items.reduce((s,i)=>s+Number(i.available_quantity||0),0)}</b><span>Saldo operacional</span></div><div><b>${held.reduce((s,i)=>s+Number(i.quantity||0),0)}</b><span>Em poder de técnicos</span></div><div><b>${moves.filter(m=>m.fiscal_pending).length}</b><span>Pendências fiscais</span></div></div><input id="vxPartSearch" class="vx-search" placeholder="Buscar por código, descrição, fabricante ou modelo"><div id="vxPartsList"></div>
  <div class="vx-op-modal-bg" id="vxPartModal" hidden><div class="vx-modal-box"><button class="vx-close">×</button><h3>Cadastrar peça</h3>
    <p class="vx-op-hint">O cadastro só define a IDENTIDADE da peça -- saldo nasce zero. Para ter saldo, use "+ Entrada" depois de cadastrar (EST-2A: o Motor de Estoque é a única fonte de saldo).</p>
    <div class="vx-form-grid"><label>Código<input id="pCode"></label><label>Descrição<input id="pDesc"></label><label>Fabricante<input id="pMaker"></label><label>Grupo<input id="pGroup"></label><label>Fornecedor<input id="pSupplier"></label><label>Localização (legado/exibição)<input id="pLoc"></label><label>Qtd. fiscal<input id="pFiscal" type="number" step="0.01" value="0"></label><label>Custo<input id="pCost" data-currency value="0"></label><label>Preço referência<input id="pPrice" data-currency value="0"></label><label class="full">Modelos compatíveis<input id="pModels"></label></div>
    <button class="vx-primary" id="vxSavePart">Salvar peça</button>
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
  </div>`;
  function draw(){const q=(document.querySelector('#vxPartSearch').value||'').toUpperCase();const list=items.filter(i=>[i.code,i.description,i.manufacturer,i.compatible_models].join(' ').toUpperCase().includes(q));document.querySelector('#vxPartsList').innerHTML=`<div class="vx-table"><div class="vx-tr vx-tr-stock vx-th"><span>Código</span><span>Descrição</span><span>Fabricante</span><span>Disponível</span><span>Fiscal</span><span></span></div>${list.map(i=>`<div class="vx-tr vx-tr-stock"><span>${E(i.code||'—')}</span><span>${E(i.description||'')}</span><span>${E(i.manufacturer||'')}</span><span>${E(i.available_quantity||0)}</span><span>${E(i.fiscal_quantity||0)}</span><span><button type="button" class="vx-mini-btn" data-entry="${i.id}">+ Entrada</button></span></div>`).join('')}</div>`;
   document.querySelectorAll('[data-entry]').forEach(b=>b.onclick=()=>openEntryModal(items.find(i=>i.id===b.dataset.entry)));}
  draw();document.querySelector('#vxPartSearch').oninput=draw;const modal=document.querySelector('#vxPartModal');document.querySelector('#vxNewPart').onclick=()=>modal.hidden=false;modal.querySelector('.vx-close').onclick=()=>modal.hidden=true;document.querySelector('#vxSavePart').onclick=async()=>{const body={code:document.querySelector('#pCode').value.trim(),description:document.querySelector('#pDesc').value.trim(),manufacturer:document.querySelector('#pMaker').value.trim(),product_group:document.querySelector('#pGroup').value.trim(),supplier:document.querySelector('#pSupplier').value.trim(),storage_location:document.querySelector('#pLoc').value.trim(),fiscal_quantity:Number(document.querySelector('#pFiscal').value||0),available_quantity:0,unit_cost:Number(String(document.querySelector('#pCost').value).replace(/[^\d,.-]/g,'').replace('.','').replace(',','.'))||0,reference_price:Number(String(document.querySelector('#pPrice').value).replace(/[^\d,.-]/g,'').replace('.','').replace(',','.'))||0,compatible_models:document.querySelector('#pModels').value.trim()};if(!body.code||!body.description)return toast('Código e descrição são obrigatórios.','err');try{const saved=await api('stock_items',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});items.push(saved?.[0]||body);modal.hidden=true;draw();toast('Peça cadastrada com saldo zero.');}catch(e){toast('Erro ao cadastrar peça: '+e.message,'err')}};

  // ---- EST-2A: Registrar entrada (única forma de gerar saldo) ----
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
   // trava de duplo-clique -- o backend (stock_operations + FOR UPDATE)
   // já garante que a mesma idempotency_key nunca duplica o movimento,
   // mas desabilitar aqui evita uma segunda chamada de rede inútil,
   // mesmo padrão já usado no Financeiro (register_payment/reverse_payment).
   const idempotencyKey=(crypto.randomUUID?crypto.randomUUID():'idem-'+Date.now()+'-'+Math.random().toString(36).slice(2));
   confirmEntryBtn.disabled=true;
   try{
    const result=await api('rpc/stock_register_entry',{method:'POST',body:JSON.stringify({
     p_stock_item_id:itemId,p_location_id:locationId,p_position_code:position,
     p_quantity:quantity,p_notes:notes||null,p_idempotency_key:idempotencyKey
    })});
    const newQty=result?.[0]?.out_new_quantity;
    toast(`Entrada registrada. Quantidade resultante na posição: ${newQty ?? '—'}.`);
    entryModal.hidden=true;
    // Só o agregado do item mudou (stock_items.available_quantity,
    // mantido pelo trigger do EST-2A) -- busca só esse item e atualiza
    // no array em memória, sem substituir a lista inteira (evita
    // qualquer risco de recarregar tudo e desalinhar filtro/estado).
    const [fresh]=await api(`stock_items?id=eq.${itemId}&select=*`).catch(()=>[]);
    if(fresh){const idx=items.findIndex(i=>i.id===itemId);if(idx>=0)items[idx]=fresh;}
    draw();
   }catch(e){toast('Erro ao registrar entrada: '+e.message,'err');}
   finally{confirmEntryBtn.disabled=false;}
  };
 }
 window.renderExternalAgenda=agenda;window.renderStockWorkbench=estoque;
 document.addEventListener('click',e=>{const b=e.target.closest('[data-target]');if(!b)return;if(b.dataset.target==='agenda-operacional'){e.preventDefault();e.stopImmediatePropagation();agenda();}if(b.dataset.target==='estoque-operacional'){e.preventDefault();e.stopImmediatePropagation();estoque();}},true);
 const prev=window.render;window.render=async function(view){if(view==='agenda')return agenda();if(view==='estoque')return estoque();return prev.apply(this,arguments)};
})();