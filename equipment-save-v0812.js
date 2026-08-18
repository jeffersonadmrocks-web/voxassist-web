/* VoxAssist Web V0.8.12 — salvar dados complementares do Equipamento */
(function(){
  const baseDetail=window.renderOsDetail;
  if(typeof baseDetail!=='function') return;

  function values(entity){
    const body={};
    document.querySelectorAll(`#vx-equip [data-entity="${entity}"]`).forEach(el=>{
      const name=el.dataset.name;
      if(!name) return;
      let v=el.value;
      if(v==='') v=null;
      body[name]=v;
    });
    return body;
  }

  async function saveEquipmentComplementary(){
    const o=state.activeOs;
    if(!o?.id) return toast('Nenhuma OS aberta para salvar.','err');
    const btn=document.querySelector('#vxSaveEquipment');
    if(btn){btn.disabled=true;btn.textContent='SALVANDO...';}
    try{
      const equipmentBody=values('equipment');
      const orderBody=values('order');
      if(o.equipment_id && Object.keys(equipmentBody).length){
        await api(`equipments?id=eq.${encodeURIComponent(o.equipment_id)}`,{
          method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(equipmentBody)
        });
      }
      if(Object.keys(orderBody).length){
        await api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{
          method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(orderBody)
        });
      }
      Object.assign(o,orderBody);
      if(o.equipments && typeof o.equipments==='object') Object.assign(o.equipments,equipmentBody);
      toast('Dados complementares do equipamento salvos com sucesso.');
    }catch(err){
      toast('Falha ao salvar dados do equipamento: '+err.message,'err');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='SALVAR DADOS COMPLEMENTARES';}
    }
  }
  window.vxSaveEquipment=saveEquipmentComplementary;

  function inject(){
    const panel=document.querySelector('#vx-equip');
    if(!panel || document.querySelector('#vxSaveEquipment')) return;
    const firstBox=panel.querySelector('.vx-screen-box');
    if(!firstBox) return;
    const actions=document.createElement('div');
    actions.className='vx-client-actions vx-equipment-actions';
    actions.innerHTML='<button type="button" id="vxSaveEquipment" class="vx-action parts">SALVAR DADOS COMPLEMENTARES</button>';
    firstBox.appendChild(actions);
    actions.querySelector('#vxSaveEquipment').onclick=saveEquipmentComplementary;
  }

  window.renderOsDetail=async function(){
    const r=await baseDetail.apply(this,arguments);
    inject();
    return r;
  };
})();
