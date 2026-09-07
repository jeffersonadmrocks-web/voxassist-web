/* VoxAssist V0.8.12 — protege campos sensíveis do resumo e harmoniza Atendimento */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const norm=s=>String(s||'').toUpperCase().replace(/\s+/g,' ').trim();

  function fieldByLabel(label){
    return qa('#vx-os .vx-field').find(f=>norm(q('label',f)?.textContent)===norm(label));
  }

  function configureField(field,entity,name,editing){
    if(!field)return;
    const el=q('input,select,textarea',field);if(!el)return;
    el.dataset.entity=entity;el.dataset.name=name;
    field.classList.add('vx-protected-summary-field');
    if(editing){
      el.disabled=false;el.readOnly=false;el.removeAttribute('disabled');el.removeAttribute('readonly');
      field.classList.add('vx-editable-now');
    }else{
      /* select não respeita readonly: precisa disabled para impedir alteração acidental. */
      if(el.tagName==='SELECT')el.disabled=true;else el.readOnly=true;
      field.classList.remove('vx-editable-now');
    }
    /* Tipo de OS deve ser gravado pelo SALVAR global, nunca imediatamente no onchange. */
    if(name==='order_type')el.onchange=null;
  }

  function applyProtection(forceEditing){
    const panel=q('#vx-os');if(!panel)return;
    const editing=forceEditing===true || panel.classList.contains('vx-editing-os-data');
    const orderType=fieldByLabel('TIPO DE ORDEM DE SERVIÇO *')||fieldByLabel('TIPO DE ORDEM DE SERVIÇO');
    const serviceType=fieldByLabel('TIPO DE ATENDIMENTO');
    const local=fieldByLabel('LOCAL DO PRODUTO');
    configureField(orderType,'order','order_type',editing);
    configureField(serviceType,'order','service_type',editing);
    configureField(local,'order','product_location',editing);

    [orderType,serviceType,local].forEach(f=>f?.classList.add('vx-attendance-aligned'));
  }

  /* Depois que ALTERAR > EDITAR DADOS for acionado, libera os dois campos junto com os demais. */
  document.addEventListener('click',e=>{
    if(!e.target.closest('#vxEditData'))return;
    setTimeout(()=>applyProtection(true),20);
  },true);

  // Achado do usuário em 2026-09-07: "TIPO DE ORDEM DE SERVIÇO" ficava
  // permanentemente destravado (select sempre habilitado, mesmo sem
  // clicar ALTERAR) -- causa real: essa proteção só rodava UMA VEZ por
  // painel (guard panel.dataset.vxProtectedReady), na primeira mutação
  // que cria #vx-os -- exatamente quando os-corrections-v0812.js ainda
  // está com sua própria busca (`await api('os_parts?...')`) pendente,
  // ANTES de injetar o próprio campo (ensureOrderType(), select criado
  // depois). Quando esse select finalmente aparece, o guard já tinha
  // travado em "pronto", então a proteção nunca rodava de novo pra
  // travá-lo. Troca pra debounce (reage a QUALQUER mutação de #vx-os,
  // sempre, sem trava única) -- mesmo padrão já usado nos cards novos
  // de Configurações nesta sessão (scheduleEnhance).
  let protectDebounce=null;
  function scheduleProtection(){
    if(protectDebounce)clearTimeout(protectDebounce);
    protectDebounce=setTimeout(()=>applyProtection(false),120);
  }
  const mo=new MutationObserver(()=>{if(q('#vx-os'))scheduleProtection();});
  mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>applyProtection(false),300);

  const style=document.createElement('style');
  style.id='vxSummaryLockAlignmentStyle';
  style.textContent=`
    #vx-os .vx-attendance-aligned{align-self:start!important;margin:0!important;min-width:0}
    #vx-os .vx-attendance-aligned label{display:block;min-height:16px;margin:0 0 5px!important;line-height:16px}
    #vx-os .vx-attendance-aligned .vx-control{width:100%!important;min-height:31px!important;height:31px;box-sizing:border-box;margin:0!important}
    #vx-os .vx-protected-summary-field select:disabled{opacity:1!important;color:#24384d!important;background:#f3f5f7!important;cursor:not-allowed}
    #vx-os:not(.vx-editing-os-data) .vx-protected-summary-field input[readonly]{background:#f3f5f7!important;color:#24384d!important;cursor:default}
    #vx-os.vx-editing-os-data .vx-protected-summary-field .vx-control{background:#fffdf2!important;border-color:#d7a33e!important;cursor:auto}
    #vx-os .vx-field-grid.two{align-items:start!important;row-gap:10px!important;column-gap:16px!important}
  `;
  document.head.appendChild(style);
})();