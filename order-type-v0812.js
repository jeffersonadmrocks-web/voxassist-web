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

  function ensureTypeStyle(){
    if(document.querySelector('#vxOrderTypeStyle'))return;
    const s=document.createElement('style');
    s.id='vxOrderTypeStyle';
    s.textContent=`
      .vx-order-type-badge{display:block;width:max-content;max-width:100%;margin:3px 0 7px;padding:4px 9px;border:1px solid #a8b5c4;background:#eef3f8;color:#17324f;font-size:11px;font-weight:700;letter-spacing:.2px;text-transform:uppercase}
      .vx-order-type-badge[data-type="GARANTIA"]{background:#e7f5ec;border-color:#91c8a3;color:#176a38}
      .vx-order-type-badge[data-type="SEGURADORA"]{background:#eee9fb;border-color:#b6a4e4;color:#5d42a6}
      .vx-order-type-badge[data-type="REINGRESSO"]{background:#fff1df;border-color:#e6b875;color:#8b5200}
      .vx-order-type-badge[data-type="OUTROS"]{background:#f1f3f5;border-color:#c7cdd3;color:#4c5661}
    `;
    document.head.appendChild(s);
  }

  const baseNew=window.renderNewOs;
  if(typeof baseNew==='function'){
    window.renderNewOs=async function(){
      await baseNew.apply(this,arguments);
      const service=document.querySelector('#serviceType')?.closest('.vx-newos-field');
      if(!service || document.querySelector('#orderType')) return;
      const wrap=document.createElement('div');
      wrap.className='vx-newos-field';
      wrap.innerHTML='<label>TIPO DE ORDEM DE SERVIÇO *</label><select id="orderType" required>'+TYPES.map(x=>`<option value="${x}">${x}</option>`).join('')+`</select><div id="reentryBox" style="display:none;margin-top:8px"><label>O.S. ANTERIOR / REINGRESSO</label><select id="previousServiceOrderId"><option value="">SELECIONE A O.S. ANTERIOR...</option>${(state.orders||[]).map(o=>`<option value="${o.id}">${esc(o.os_number)} • ${esc(o.clients?.name||'')}</option>`).join('')}</select></div>`;
      service.parentElement.insertBefore(wrap,service);
      const sel=wrap.querySelector('#orderType'),box=wrap.querySelector('#reentryBox');
      sel.onchange=()=>{box.style.display=sel.value==='REINGRESSO'?'block':'none'};
    };
  }

  // Achado do usuário em 2026-09-03 (refinamento do cabeçalho, 4ª
  // rodada): o selo ".vx-order-type-badge" injetado aqui duplicava a
  // mesma informação que o cabeçalho novo (os-detail-v0812.js) já
  // mostra inline, ao lado do número da OS ("Tipo: Fora de garantia").
  // Removido -- a informação continua vindo de o.order_type, só que
  // renderizada uma vez só, dentro do próprio header(). ensureTypeStyle
  // fica (não usada mais aqui, mas outros arquivos não dependem dela
  // sumir) e o override de api() no topo deste arquivo (grava
  // order_type na criação da OS) continua intocado.
})();
