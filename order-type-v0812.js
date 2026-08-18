/* VoxAssist Web V0.8.12 — Tipo de Ordem de Serviço */
(function(){
  const TYPES=['FORA DE GARANTIA','GARANTIA','SEGURADORA','REINGRESSO','OUTROS'];
  const baseApi=api;
  api=async function(path,opt={}){
    if(path==='service_orders' && String(opt.method||'GET').toUpperCase()==='POST' && opt.body){
      try{
        const body=JSON.parse(opt.body);
        const type=document.querySelector('#orderType')?.value;
        const prev=document.querySelector('#previousServiceOrderId')?.value;
        if(type) body.order_type=type;
        body.previous_service_order_id=(type==='REINGRESSO' && prev)?prev:null;
        opt={...opt,body:JSON.stringify(body)};
      }catch{}
    }
    return baseApi(path,opt);
  };
  window.api=api;

  const baseNew=window.renderNewOs;
  if(typeof baseNew==='function'){
    window.renderNewOs=async function(){
      await baseNew.apply(this,arguments);
      const service=document.querySelector('#serviceType')?.closest('.vx-newos-field');
      if(!service || document.querySelector('#orderType')) return;
      const wrap=document.createElement('div');
      wrap.className='vx-newos-field';
      wrap.innerHTML='<label>TIPO DE ORDEM DE SERVIÇO *</label><select id="orderType" required>'+TYPES.map(x=>`<option value="${x}">${x}</option>`).join('')+'</select><div id="reentryBox" style="display:none;margin-top:8px"><label>O.S. ANTERIOR / REINGRESSO</label><select id="previousServiceOrderId"><option value="">SELECIONE A O.S. ANTERIOR...</option>${(state.orders||[]).map(o=>`<option value="${o.id}">${esc(o.os_number)} • ${esc(o.clients?.name||'')}</option>`).join('')}</select></div>';
      service.parentElement.insertBefore(wrap,service);
      const sel=wrap.querySelector('#orderType'),box=wrap.querySelector('#reentryBox');
      sel.onchange=()=>{box.style.display=sel.value==='REINGRESSO'?'block':'none'};
    };
  }

  const baseDetail=window.renderOsDetail;
  if(typeof baseDetail==='function'){
    window.renderOsDetail=async function(id){
      const r=await baseDetail.apply(this,arguments);
      try{
        const o=state.activeOs;
        if(!o)return r;
        const service=[...document.querySelectorAll('.vx-field label')].find(x=>x.textContent.trim()==='TIPO DE ATENDIMENTO')?.closest('.vx-field');
        if(service && !document.querySelector('[data-vx-order-type]')){
          const field=document.createElement('div');field.className='vx-field';field.dataset.vxOrderType='1';
          field.innerHTML=`<label>TIPO DE ORDEM DE SERVIÇO</label><input class="vx-control" readonly value="${esc(o.order_type||'FORA DE GARANTIA')}">`;
          service.parentElement.insertBefore(field,service);
        }
      }catch{}
      return r;
    };
  }
})();
