/* VoxAssist Web V0.8.12 — habilita edição real dos dados pelo botão ALTERAR > EDITAR DADOS DA O.S. */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];

  const MAP={
    'NOME / RAZÃO SOCIAL *':['client','name'],
    'CPF / CNPJ':['client','document'],
    'TELEFONE PRINCIPAL *':['client','phone_primary'],
    '+ OUTRO TELEFONE':['client','phone_secondary'],
    'E-MAIL':['client','email'],
    'CEP':['client','zip_code'],
    'ENDEREÇO':['client','address'],
    'NÚMERO':['client','address_number'],
    'COMPLEMENTO':['client','complement'],
    'BAIRRO':['client','neighborhood'],
    'CIDADE':['client','city'],
    'ESTADO':['client','state'],
    'TIPO DE PRODUTO *':['equipment','product_type'],
    'MARCA':['equipment','brand'],
    'MODELO':['equipment','model'],
    'Nº DE SÉRIE':['equipment','serial_number'],
    'ESTADO DO APARELHO':['order','device_condition'],
    'ACESSÓRIOS':['equipment','accessories'],
    'TIPO DE ATENDIMENTO':['order','service_type'],
    'LOCAL DO PRODUTO':['order','product_location'],
    'DEFEITO RELATADO *':['order','reported_defect']
  };

  function enableSummaryEdit(){
    const panel=q('#vx-os');if(!panel)return;
    panel.classList.add('vx-editing-os-data');
    qa('.vx-field',panel).forEach(field=>{
      const label=q('label',field)?.textContent?.trim();
      const cfg=MAP[label];if(!cfg)return;
      const el=q('input,select,textarea',field);if(!el)return;
      el.dataset.entity=cfg[0];el.dataset.name=cfg[1];
      el.readOnly=false;el.disabled=false;
      el.removeAttribute('readonly');el.removeAttribute('disabled');
      field.classList.add('vx-editable-now');
    });
    if(typeof showVxOsSection==='function')showVxOsSection('os');
    const first=q('#vx-os .vx-editable-now input, #vx-os .vx-editable-now select, #vx-os .vx-editable-now textarea');
    setTimeout(()=>first?.focus(),30);
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('#vxEditData');
    if(!b)return;
    setTimeout(()=>{
      enableSummaryEdit();
      if(typeof toast==='function')toast('Modo de edição ativado. Os campos da O.S. agora podem ser alterados; clique SALVAR para gravar.');
    },0);
  },true);

  const style=document.createElement('style');
  style.textContent=`
    #vx-os.vx-editing-os-data .vx-editable-now input,
    #vx-os.vx-editing-os-data .vx-editable-now select,
    #vx-os.vx-editing-os-data .vx-editable-now textarea{background:#fffdf2!important;border-color:#d7a33e!important;box-shadow:inset 0 0 0 1px rgba(215,163,62,.12)}
    #vx-os.vx-editing-os-data .vx-editable-now label{color:#8a5b00!important;font-weight:700!important}
  `;
  document.head.appendChild(style);
})();
