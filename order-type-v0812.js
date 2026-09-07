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
    // Achado do usuário em 2026-09-07: ao abrir OS como GARANTIA, o
    // sistema deve pedir NF/Data da Compra/Revendedor/Prazo (meses) do
    // equipamento -- equipments já tinha invoice_number/purchase_date/
    // purchase_store (reaproveitados), só faltava warranty_months
    // (migration 20260907030000). Só grava quando o tipo é GARANTIA
    // (não força esses campos em nenhum outro tipo de OS).
    if(path==='equipments' && String(opt.method||'GET').toUpperCase()==='POST' && opt.body){
      try{
        const body=JSON.parse(opt.body);
        if(document.querySelector('#orderType')?.value==='GARANTIA'){
          const nf=document.querySelector('#warrantyInvoice')?.value?.trim();
          const pd=document.querySelector('#warrantyPurchaseDate')?.value;
          const rv=document.querySelector('#warrantyReseller')?.value?.trim();
          const wm=document.querySelector('#warrantyMonths')?.value;
          if(nf)body.invoice_number=nf;
          if(pd)body.purchase_date=pd;
          if(rv)body.purchase_store=rv;
          if(wm)body.warranty_months=Number(wm);
          opt={...opt,body:JSON.stringify(body)};
        }
      }catch{}
    }
    return baseApi(path,opt);
  };
  window.api=api;

  function warrantyStatus(purchaseDateStr,months){
    if(!purchaseDateStr||!months)return '';
    const d=new Date(purchaseDateStr+'T12:00:00');if(isNaN(d))return '';
    const deadline=new Date(d);deadline.setMonth(deadline.getMonth()+Number(months));
    const today=new Date();today.setHours(12,0,0,0);
    const dentro=today<=deadline;
    const fmt=deadline.toLocaleDateString('pt-BR');
    return dentro?`<span class="vx-warranty-ok">DENTRO DA GARANTIA — vence em ${fmt}</span>`:`<span class="vx-warranty-off">FORA DA GARANTIA — venceu em ${fmt}</span>`;
  }

  const wst=document.createElement('style');
  wst.textContent=`.vx-warranty-box{border:1px dashed #cbd7e2;border-radius:8px;padding:10px 12px 4px;margin-top:2px;background:#f8fbfd}.vx-warranty-result{margin:8px 0 6px;font-size:11px}.vx-warranty-ok{color:#0b6b34;font-weight:700}.vx-warranty-off{color:#a32121;font-weight:700}`;
  document.head.appendChild(wst);

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
      wrap.innerHTML='<label>TIPO DE ORDEM DE SERVIÇO *</label><select id="orderType" required>'+TYPES.map(x=>`<option value="${x}">${x}</option>`).join('')+`</select><div id="reentryBox" style="display:none;margin-top:8px"><label>O.S. ANTERIOR / REINGRESSO</label><select id="previousServiceOrderId"><option value="">SELECIONE A O.S. ANTERIOR...</option>${(state.orders||[]).map(o=>`<option value="${o.id}">${esc(o.os_number)} • ${esc(o.clients?.name||'')}</option>`).join('')}</select></div><div id="warrantyBox" class="vx-warranty-box" style="display:none"><div class="vx-newos-field-grid two"><div class="vx-newos-field"><label>Nº DA NOTA FISCAL *</label><input id="warrantyInvoice"></div><div class="vx-newos-field"><label>DATA DA COMPRA *</label><input id="warrantyPurchaseDate" type="date"></div><div class="vx-newos-field"><label>REVENDEDOR *</label><input id="warrantyReseller"></div><div class="vx-newos-field"><label>PRAZO DE GARANTIA (MESES) *</label><input id="warrantyMonths" type="number" min="1"></div></div><div id="warrantyResult" class="vx-warranty-result"></div></div>`;
      service.parentElement.insertBefore(wrap,service);
      const sel=wrap.querySelector('#orderType'),box=wrap.querySelector('#reentryBox'),wbox=wrap.querySelector('#warrantyBox'),result=wrap.querySelector('#warrantyResult');
      const pd=wrap.querySelector('#warrantyPurchaseDate'),wm=wrap.querySelector('#warrantyMonths');
      const recalc=()=>{result.innerHTML=warrantyStatus(pd.value,wm.value)};
      pd.addEventListener('input',recalc);wm.addEventListener('input',recalc);
      sel.onchange=()=>{
        box.style.display=sel.value==='REINGRESSO'?'block':'none';
        wbox.style.display=sel.value==='GARANTIA'?'block':'none';
        ['warrantyInvoice','warrantyPurchaseDate','warrantyReseller','warrantyMonths'].forEach(id=>wrap.querySelector('#'+id).required=sel.value==='GARANTIA');
      };
      // Achado do usuário em 2026-09-07: os campos de garantia precisam
      // ser realmente exigidos ao salvar, não só marcados com "*"
      // visual -- #saveAdvance é type="button" (não dispara validação
      // nativa de formulário), então intercepta o clique aqui mesmo,
      // antes de chamar o saveNewUnified original.
      const saveBtn=document.querySelector('#saveAdvance');
      if(saveBtn){
        const baseClick=saveBtn.onclick;
        saveBtn.onclick=e=>{
          if(sel.value==='GARANTIA'){
            const nf=wrap.querySelector('#warrantyInvoice').value.trim();
            const rv=wrap.querySelector('#warrantyReseller').value.trim();
            if(!nf||!pd.value||!rv||!wm.value){toast('Para OS de GARANTIA, informe Nº da NF, Data da Compra, Revendedor e Prazo de garantia (meses).','err');return;}
          }
          return baseClick?.(e);
        };
      }
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
