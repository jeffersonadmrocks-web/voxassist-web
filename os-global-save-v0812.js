/* VoxAssist Web V0.8.12 — salvar global + fluxo inteligente da OS */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  let dirty=false,saving=false;
  const norm=s=>String(s||'').toUpperCase().replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const today=()=>new Date().toISOString().slice(0,10);
  const dtLocal=v=>v?String(v).slice(0,16):'';

  function valueOf(el){if(!el)return null;if(el.type==='checkbox')return !!el.checked;let v=el.value;if(v==='')return null;if(el.type==='number')return Number(String(v).replace(',','.'))||0;return v;}
  function collect(entity){const body={};qa(`.vx-os-panel [data-entity="${entity}"][data-name]`).forEach(el=>{if(el.disabled||el.readOnly)return;const name=el.dataset.name;if(name)body[name]=valueOf(el);});return body;}
  function btn(){return q('#vxGlobalSave');}
  function setDirty(v=true){dirty=v;const b=btn();if(!b)return;b.textContent=saving?'SALVANDO...':'SALVAR';b.title=dirty?'Existem alterações não salvas nesta OS':'Salvar alterações da OS';b.style.opacity=dirty?'1':'.9';}

  function injectSave(){
    const bar=q('.vx-os-head-actions');if(!bar||q('#vxGlobalSave'))return;
    const attention=[...bar.querySelectorAll('button')].find(b=>/CASO DE ATENÇÃO/i.test(b.textContent));
    const b=document.createElement('button');b.type='button';b.id='vxGlobalSave';b.className='vx-action parts';b.textContent='SALVAR';b.style.cssText='min-width:82px;';b.onclick=saveAll;
    if(attention)attention.insertAdjacentElement('afterend',b);else bar.prepend(b);setDirty(false);
  }

  function injectWorkflowFields(){
    const panel=q('#vx-orcamento');const o=state?.activeOs;if(!panel||!o||q('#vxWorkflowBox'))return;
    const host=q('.vx-screen-box',panel)||panel;
    const box=document.createElement('div');box.id='vxWorkflowBox';box.style.cssText='margin-top:14px;border:1px solid #cbd7e3;background:#f8fbfd;padding:12px 14px;';
    box.innerHTML=`<div style="font-weight:700;color:#0b6f3c;margin-bottom:10px">APROVAÇÃO E CRONOGRAMA DA O.S.</div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:10px">
        <label class="vx-field"><span>DECISÃO DO ORÇAMENTO</span><select class="vx-control" data-entity="order" data-name="approval_decision"><option value="">AGUARDANDO DECISÃO</option><option value="APROVADO" ${o.approval_decision==='APROVADO'?'selected':''}>APROVADO</option><option value="RECUSADO" ${o.approval_decision==='RECUSADO'?'selected':''}>RECUSADO</option></select></label>
        <label class="vx-field"><span>DATA DA DECISÃO</span><input class="vx-control" type="date" data-entity="order" data-name="approval_date" value="${o.approval_date||''}"></label>
        <label class="vx-field"><span>INÍCIO DO CONSERTO</span><input class="vx-control" type="datetime-local" data-entity="order" data-name="repair_started_at" value="${dtLocal(o.repair_started_at)}"></label>
        <label class="vx-field"><span>PRONTO</span><input class="vx-control" type="datetime-local" data-entity="order" data-name="ready_at" value="${dtLocal(o.ready_at)}"></label>
        <label class="vx-field"><span>ENTREGA / SAÍDA</span><input class="vx-control" type="datetime-local" data-entity="order" data-name="delivery_at" value="${dtLocal(o.delivery_at)}"></label>
        <label class="vx-field" id="vxRejectReasonWrap" style="grid-column:1/-1;${o.approval_decision==='RECUSADO'?'':'display:none'}"><span>MOTIVO DA RECUSA</span><textarea class="vx-control" data-entity="order" data-name="rejection_reason" style="min-height:64px">${String(o.rejection_reason||'').replace(/</g,'&lt;')}</textarea></label>
      </div><div style="font-size:10px;color:#687b8e;margin-top:8px">A recusa preserva análise, peças e valores da OS, mas não gera recebimento nem movimentação automática de caixa.</div>`;
    host.appendChild(box);
    const decision=q('[data-name="approval_decision"]',box),date=q('[data-name="approval_date"]',box),wrap=q('#vxRejectReasonWrap',box);
    decision.onchange=()=>{wrap.style.display=decision.value==='RECUSADO'?'block':'none';if(decision.value&&!date.value)date.value=today();setDirty(true);};
  }

  // Achado do usuário 2026-09-03: esta função decidia e GRAVAVA o avanço
  // de status sozinha (nextStatus()/advanceStatus() antigos), duplicando
  // em JS a mesma regra que agora vive só no banco
  // (advance_service_order_status, supabase/migrations/20260903010000_
  // service_order_status_automation.sql). Removido -- SALVAR agora só
  // salva os campos e chama o motor único (window.vxAdvanceOsStatus,
  // os-status-engine-v0903.js), igual a todo outro ponto que grava um
  // campo do fluxo. missingFor() continua existindo só como AJUDA
  // informativa (texto pro usuário), nunca decide nem grava nada.
  function missingFor(status,o,orderBody,financialBody){
    const s=norm(status),missing=[];
    const get=(name)=>orderBody[name]??o[name]??q(`[data-entity="order"][data-name="${name}"]`)?.value;
    const f=(name)=>financialBody[name]??q(`[data-entity="financial"][data-name="${name}"]`)?.value;
    if(s==='AGUARDANDO ANALISE'){
      if(!get('technician_id'))missing.push('Técnico responsável');
      if(!String(get('diagnosed_defect')||'').trim())missing.push('Defeito constatado');
      if(!String(get('technical_service')||'').trim())missing.push('Serviço');
      const money=['labor_value','freight_value','auxiliary_material_value','technical_report_value'].reduce((t,n)=>t+(Number(String(f(n)||0).replace(',','.'))||0),0);
      const hasParts=qa('#vx-orcamento table tbody tr').some(tr=>tr.querySelectorAll('td').length>1&&!/NENHUMA|INFORME/.test(tr.textContent.toUpperCase()));
      if(money<=0&&!hasParts)missing.push('Valor do orçamento / peças');
    }else if(s==='AGUARDANDO APROVACAO'){
      const d=String(get('approval_decision')||'').trim();
      if(!d)missing.push('Decisão do orçamento (Aprovado ou Recusado)');
      if(d==='APROVADO'&&!get('approval_date'))missing.push('Data da aprovação');
      if(d==='RECUSADO'&&!String(get('rejection_reason')||'').trim())missing.push('Motivo da recusa');
    }else if(s==='AGUARDANDO CONSERTO'){
      if(!get('repair_started_at'))missing.push('Data/hora de início do conserto');
    }else if(s==='EM CONSERTO'){
      if(!get('ready_at'))missing.push('Data/hora de pronto');
    }else if(s==='PRONTO PARA ENTREGA'){
      if(!get('delivery_at'))missing.push('Data/hora de entrega/saída');
    }else if(s==='ORCAMENTO RECUSADO'){
      if(!get('ready_at'))missing.push('Equipamento preparado/remontado (pronto para retirada)');
    }else if(s==='ORCAMENTO RECUSADO DISPONIVEL PARA RETIRADA'){
      if(!get('delivery_at'))missing.push('Data/hora de retirada pelo cliente');
    }
    return missing;
  }

  async function saveAll(){
    const o=state?.activeOs;if(!o?.id||saving)return;const b=btn();saving=true;if(b)b.disabled=true;setDirty(dirty);
    try{
      const orderBody=collect('order'),equipmentBody=collect('equipment'),clientBody=collect('client'),financialBody=collect('financial');
      const jobs=[];
      if(Object.keys(orderBody).length){orderBody.updated_at=new Date().toISOString();jobs.push(api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(orderBody)}));}
      if(o.equipment_id&&Object.keys(equipmentBody).length)jobs.push(api(`equipments?id=eq.${encodeURIComponent(o.equipment_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(equipmentBody)}));
      if(o.client_id&&Object.keys(clientBody).length)jobs.push(api(`clients?id=eq.${encodeURIComponent(o.client_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(clientBody)}));
      if(Object.keys(financialBody).length){financialBody.service_order_id=o.id;financialBody.updated_at=new Date().toISOString();const existing=await api(`os_financial?service_order_id=eq.${encodeURIComponent(o.id)}&select=id&limit=1`).catch(()=>[]);if(existing?.[0]?.id)jobs.push(api(`os_financial?id=eq.${encodeURIComponent(existing[0].id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)}));else jobs.push(api('os_financial',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)}));}
      await Promise.all(jobs);Object.assign(o,orderBody);if(o.equipments&&typeof o.equipments==='object')Object.assign(o.equipments,equipmentBody);if(o.clients&&typeof o.clients==='object')Object.assign(o.clients,clientBody);
      if(typeof window.vxUpdateBudgetTotal==='function')window.vxUpdateBudgetTotal();
      setDirty(false);
      const statusBefore=o.status;
      const result=await window.vxAdvanceOsStatus?.(o.id);
      if(result?.changed){
        // vxAdvanceOsStatus já mostrou o toast de avanço -- nada a fazer.
      }else{
        const missing=missingFor(statusBefore,o,orderBody,financialBody);
        toast(missing.length?('Dados salvos. A OS não avançou. Falta: '+missing.join(' • ')):'Alterações da OS salvas com sucesso.');
      }
    }catch(err){setDirty(true);toast('Falha ao salvar alterações da OS: '+err.message,'err');}
    finally{saving=false;if(b)b.disabled=false;setDirty(dirty);}
  }
  window.vxSaveAllOs=saveAll;

  const baseDetail=window.renderOsDetail;if(typeof baseDetail==='function')window.renderOsDetail=async function(){const r=await baseDetail.apply(this,arguments);injectSave();injectWorkflowFields();return r;};
  document.addEventListener('input',e=>{if(e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea'))setDirty(true);},true);
  document.addEventListener('change',e=>{if(e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea'))setDirty(true);},true);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='w'&&state?.activeOs?.id){e.preventDefault();e.stopImmediatePropagation();saveAll();}},true);
})();
