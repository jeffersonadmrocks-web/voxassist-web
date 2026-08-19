/* VoxAssist Web V0.8.12 — salvar global + modo ALTERAR da OS */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  let dirty=false,saving=false,editing=false;

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
      const name=el.dataset.name;
      if(name)body[name]=valueOf(el);
    });
    return body;
  }
  function saveButton(){return q('#vxGlobalSave');}
  function editButton(){return q('#vxGlobalEdit');}

  function editableControls(){
    return qa('.vx-os-panel [data-entity][data-name]').filter(el=>!el.hasAttribute('data-vx-never-edit'));
  }

  function applyEditMode(){
    if(!isOsOpen())return;
    editableControls().forEach(el=>{
      if(el.dataset.vxOriginalReadonly===undefined)el.dataset.vxOriginalReadonly=el.readOnly?'1':'0';
      if(el.dataset.vxOriginalDisabled===undefined)el.dataset.vxOriginalDisabled=el.disabled?'1':'0';
      if(editing){
        if(el.dataset.vxOriginalReadonly!=='1')el.readOnly=false;
        if(el.dataset.vxOriginalDisabled!=='1')el.disabled=false;
      }else{
        if(el.tagName==='SELECT')el.disabled=true;
        else el.readOnly=true;
      }
    });
    const e=editButton();
    if(e){
      e.textContent=editing?'CANCELAR ALTERAÇÃO':'ALTERAR';
      e.title=editing?'Cancelar modo de edição':'Liberar campos cadastrados para alteração';
      e.style.background=editing?'#f2f5f8':'#fff';
      e.style.color='#40566e';
      e.style.border='1px solid #c8d3dd';
    }
    const s=saveButton();
    if(s){
      s.disabled=!editing || saving;
      s.style.opacity=editing?'1':'.72';
    }
  }

  function setDirty(v=true){
    dirty=v;
    const b=saveButton();if(!b)return;
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

  function toggleEdit(){
    if(!isOsOpen())return;
    if(editing && dirty){
      const ok=window.confirm('Existem alterações não salvas. Deseja cancelar a edição e descartar essas alterações?');
      if(!ok)return;
      render(`os:${state.activeOs.id}`);
      editing=false;dirty=false;
      return;
    }
    editing=!editing;
    applyEditMode();
    if(editing){
      const first=activePanel()?.querySelector('[data-entity][data-name]:not([readonly]):not([disabled])');
      setTimeout(()=>first?.focus(),20);
    }
  }

  function ensureButton(){
    if(!isOsOpen()){
      q('#vxGlobalSaveRow')?.remove();
      editing=false;dirty=false;
      return;
    }
    removeRedundantSaveButtons();
    let row=q('#vxGlobalSaveRow');
    if(!row){
      row=document.createElement('div');
      row.id='vxGlobalSaveRow';
      row.style.cssText='display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;padding-top:10px;';
      row.innerHTML='<button type="button" id="vxGlobalEdit" class="vx-action" aria-label="Alterar dados cadastrados da ordem de serviço" style="background:#fff;color:#40566e;border:1px solid #c8d3dd;">ALTERAR</button><button type="button" id="vxGlobalSave" class="vx-action parts" aria-label="Salvar todas as alterações da ordem de serviço">SALVAR ALTERAÇÕES</button>';
      row.querySelector('#vxGlobalEdit').onclick=toggleEdit;
      row.querySelector('#vxGlobalSave').onclick=saveAll;
    }
    const panel=activePanel();
    if(panel && row.parentElement!==panel) panel.appendChild(row);
    setDirty(dirty);
    applyEditMode();
  }

  async function saveAll(){
    const o=state?.activeOs;if(!o?.id||saving||!editing)return;
    const b=saveButton();saving=true;if(b)b.disabled=true;setDirty(dirty);
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
      editing=false;
      applyEditMode();
      toast('Alterações da OS salvas com sucesso.');
    }catch(err){
      setDirty(true);
      toast('Falha ao salvar alterações da OS: '+err.message,'err');
    }finally{
      saving=false;setDirty(dirty);applyEditMode();
    }
  }
  window.vxSaveAllOs=saveAll;

  document.addEventListener('input',e=>{
    if(editing&&isOsOpen()&&e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea'))setDirty(true);
  },true);
  document.addEventListener('change',e=>{
    if(editing&&isOsOpen()&&e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea'))setDirty(true);
  },true);
  document.addEventListener('click',e=>{
    if(e.target.closest('.vx-os-tabs'))setTimeout(ensureButton,0);
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='w'&&isOsOpen()){
      e.preventDefault();e.stopImmediatePropagation();
      if(editing)saveAll();else toast('Clique em ALTERAR para liberar a edição da OS.');
    }
  },true);
  const obs=new MutationObserver(()=>ensureButton());
  obs.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(ensureButton,0);
})();
