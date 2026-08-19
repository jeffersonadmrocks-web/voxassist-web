/* VoxAssist Web V0.8.12 — salvar global da OS em posição fixa dentro da tela */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  let dirty=false,saving=false;

  function isOsOpen(){return !!(state?.activeOs?.id && q('.vx-os-tabs') && q('.vx-os-panel'));}
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
  function button(){return q('#vxGlobalSave');}
  function setDirty(v=true){
    dirty=v;
    const b=button();if(!b)return;
    b.classList.toggle('dirty',dirty);
    b.textContent=saving?'SALVANDO...':(dirty?'SALVAR ALTERAÇÕES •':'SALVAR ALTERAÇÕES');
    b.title=dirty?'Existem alterações não salvas nesta OS':'Salvar todos os dados editáveis desta OS';
  }

  function removeRedundantSaveButtons(){
    qa('.vx-os-panel button').forEach(b=>{
      const t=String(b.textContent||'').trim().toUpperCase();
      if(t==='SALVAR DADOS COMPLEMENTARES' || t==='SALVAR ORÇAMENTO / ANÁLISE TÉCNICA') b.remove();
    });
  }

  function activePanel(){return qa('.vx-os-panel').find(p=>!p.classList.contains('hidden'))||q('.vx-os-panel');}

  function ensureButton(){
    if(!isOsOpen()){
      q('#vxGlobalSaveRow')?.remove();
      return;
    }
    removeRedundantSaveButtons();
    let row=q('#vxGlobalSaveRow');
    if(!row){
      row=document.createElement('div');
      row.id='vxGlobalSaveRow';
      row.style.cssText='display:flex;justify-content:flex-end;align-items:center;margin-top:14px;padding-top:10px;';
      row.innerHTML='<button type="button" id="vxGlobalSave" class="vx-action parts" aria-label="Salvar todas as alterações da ordem de serviço">SALVAR ALTERAÇÕES</button>';
      row.querySelector('#vxGlobalSave').onclick=saveAll;
    }
    const panel=activePanel();
    if(panel && row.parentElement!==panel) panel.appendChild(row);
    setDirty(dirty);
  }

  async function saveAll(){
    const o=state?.activeOs;if(!o?.id||saving)return;
    const b=button();saving=true;if(b)b.disabled=true;setDirty(dirty);
    try{
      const orderBody=collect('order');
      const equipmentBody=collect('equipment');
      const clientBody=collect('client');
      const financialBody=collect('financial');
      const jobs=[];
      if(Object.keys(orderBody).length){
        orderBody.updated_at=new Date().toISOString();
        jobs.push(api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(orderBody)}));
      }
      if(o.equipment_id&&Object.keys(equipmentBody).length){
        jobs.push(api(`equipments?id=eq.${encodeURIComponent(o.equipment_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(equipmentBody)}));
      }
      if(o.client_id&&Object.keys(clientBody).length){
        jobs.push(api(`clients?id=eq.${encodeURIComponent(o.client_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(clientBody)}));
      }
      if(Object.keys(financialBody).length){
        financialBody.service_order_id=o.id;
        financialBody.updated_at=new Date().toISOString();
        const existing=await api(`os_financial?service_order_id=eq.${encodeURIComponent(o.id)}&select=id&limit=1`).catch(()=>[]);
        if(existing?.[0]?.id) jobs.push(api(`os_financial?id=eq.${encodeURIComponent(existing[0].id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)}));
        else jobs.push(api('os_financial',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)}));
      }
      await Promise.all(jobs);
      Object.assign(o,orderBody);
      if(o.equipments&&typeof o.equipments==='object')Object.assign(o.equipments,equipmentBody);
      if(o.clients&&typeof o.clients==='object')Object.assign(o.clients,clientBody);
      if(typeof window.vxUpdateBudgetTotal==='function')window.vxUpdateBudgetTotal();
      setDirty(false);
      toast('Alterações da OS salvas com sucesso.');
    }catch(err){
      setDirty(true);
      toast('Falha ao salvar alterações da OS: '+err.message,'err');
    }finally{
      saving=false;if(b)b.disabled=false;setDirty(dirty);
    }
  }
  window.vxSaveAllOs=saveAll;

  document.addEventListener('input',e=>{
    if(isOsOpen()&&e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea'))setDirty(true);
  },true);
  document.addEventListener('change',e=>{
    if(isOsOpen()&&e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea'))setDirty(true);
  },true);
  document.addEventListener('click',e=>{
    if(e.target.closest('.vx-os-tabs'))setTimeout(ensureButton,0);
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='w'&&isOsOpen()){
      e.preventDefault();e.stopImmediatePropagation();saveAll();
    }
  },true);
  const obs=new MutationObserver(()=>ensureButton());
  obs.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(ensureButton,0);
})();
