/* VoxAssist Web V0.8.12 — salvar global interno, sem flutuar e sem MutationObserver */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  let dirty=false,saving=false;

  function valueOf(el){
    if(!el)return null;
    if(el.type==='checkbox')return !!el.checked;
    let v=el.value;
    if(v==='')return null;
    if(el.type==='number')return Number(String(v).replace(',','.'))||0;
    return v;
  }
  function collect(entity){
    const body={};
    qa(`.vx-os-panel [data-entity="${entity}"][data-name]`).forEach(el=>{
      if(el.disabled||el.readOnly)return;
      const name=el.dataset.name;
      if(name)body[name]=valueOf(el);
    });
    return body;
  }
  function btn(){return q('#vxGlobalSave');}
  function setDirty(v=true){
    dirty=v;
    const b=btn(); if(!b)return;
    b.textContent=saving?'SALVANDO...':(dirty?'SALVAR ALTERAÇÕES •':'SALVAR ALTERAÇÕES');
    b.style.opacity=dirty?'1':'.88';
  }
  function injectSave(){
    const tabs=q('.vx-os-tabs');
    if(!tabs || q('#vxGlobalSaveRow'))return;
    const row=document.createElement('div');
    row.id='vxGlobalSaveRow';
    row.style.cssText='display:flex;justify-content:flex-end;align-items:center;margin:8px 0 12px;padding:0 2px;';
    row.innerHTML='<button type="button" id="vxGlobalSave" class="vx-action parts" style="min-width:160px">SALVAR ALTERAÇÕES</button>';
    tabs.insertAdjacentElement('afterend',row);
    row.querySelector('#vxGlobalSave').onclick=saveAll;
    setDirty(false);
  }
  async function saveAll(){
    const o=state?.activeOs;if(!o?.id||saving)return;
    const b=btn();saving=true;if(b)b.disabled=true;setDirty(dirty);
    try{
      const orderBody=collect('order'), equipmentBody=collect('equipment'), clientBody=collect('client'), financialBody=collect('financial');
      const jobs=[];
      if(Object.keys(orderBody).length){orderBody.updated_at=new Date().toISOString();jobs.push(api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(orderBody)}));}
      if(o.equipment_id&&Object.keys(equipmentBody).length)jobs.push(api(`equipments?id=eq.${encodeURIComponent(o.equipment_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(equipmentBody)}));
      if(o.client_id&&Object.keys(clientBody).length)jobs.push(api(`clients?id=eq.${encodeURIComponent(o.client_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(clientBody)}));
      if(Object.keys(financialBody).length){
        financialBody.service_order_id=o.id;financialBody.updated_at=new Date().toISOString();
        const existing=await api(`os_financial?service_order_id=eq.${encodeURIComponent(o.id)}&select=id&limit=1`).catch(()=>[]);
        if(existing?.[0]?.id)jobs.push(api(`os_financial?id=eq.${encodeURIComponent(existing[0].id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)}));
        else jobs.push(api('os_financial',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)}));
      }
      await Promise.all(jobs);
      Object.assign(o,orderBody);
      if(o.equipments&&typeof o.equipments==='object')Object.assign(o.equipments,equipmentBody);
      if(o.clients&&typeof o.clients==='object')Object.assign(o.clients,clientBody);
      if(typeof window.vxUpdateBudgetTotal==='function')window.vxUpdateBudgetTotal();
      setDirty(false);toast('Alterações da OS salvas com sucesso.');
    }catch(err){setDirty(true);toast('Falha ao salvar alterações da OS: '+err.message,'err');}
    finally{saving=false;if(b)b.disabled=false;setDirty(dirty);}
  }
  window.vxSaveAllOs=saveAll;

  const baseDetail=window.renderOsDetail;
  if(typeof baseDetail==='function'){
    window.renderOsDetail=async function(){
      const r=await baseDetail.apply(this,arguments);
      injectSave();
      return r;
    };
  }
  document.addEventListener('input',e=>{if(e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea'))setDirty(true);},true);
  document.addEventListener('change',e=>{if(e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea'))setDirty(true);},true);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='w'&&state?.activeOs?.id){e.preventDefault();e.stopImmediatePropagation();saveAll();}},true);
})();
