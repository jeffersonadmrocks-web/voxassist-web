/* VoxAssist Web V0.8.12 — salvar global + fluxo inteligente da OS */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  let dirty=false,saving=false;
  const editedFields=new Map(),pendingFields=new Set();
  const fieldKey=el=>el.dataset.entity&&el.dataset.name?el.dataset.entity+'.'+el.dataset.name:null;
  const summaryFields={
    'NOME / RAZÃO SOCIAL *':['client','name'],'CPF / CNPJ':['client','document'],
    'TELEFONE PRINCIPAL *':['client','phone_primary'],'+ OUTRO TELEFONE':['client','phone_secondary'],
    'E-MAIL':['client','email'],'CEP':['client','zip_code'],'ENDEREÇO':['client','address'],
    'NÚMERO':['client','address_number'],'COMPLEMENTO':['client','complement'],
    'BAIRRO':['client','neighborhood'],'CIDADE':['client','city'],'ESTADO':['client','state'],
    'TIPO DE PRODUTO *':['equipment','product_type'],'MARCA':['equipment','brand'],
    'MODELO':['equipment','model'],'Nº DE SÉRIE':['equipment','serial_number'],
    'ACESSÓRIOS':['equipment','accessories'],'ESTADO DO APARELHO':['order','device_condition'],
    'TIPO DE ATENDIMENTO':['order','service_type'],'LOCAL DO PRODUTO':['order','product_location'],
    'DEFEITO RELATADO *':['order','reported_defect']
  };
  function bindSummaryFields(){
    qa('#vx-os .vx-field').forEach(field=>{
      const cfg=summaryFields[q('label',field)?.textContent?.trim()];
      const el=q('input,select,textarea',field);
      if(cfg&&el){el.dataset.entity=cfg[0];el.dataset.name=cfg[1];}
    });
    window.vxBindPhoneMasks?.();window.vxBindInputMasks?.();
  }
  function syncField(source){
    const key=fieldKey(source);if(!key)return;
    editedFields.set(key,source);pendingFields.add(key);
    qa('.vx-os-panel [data-entity][data-name]').forEach(el=>{
      if(el===source||fieldKey(el)!==key)return;
      if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===source.value)){
        el.add(new Option(source.value,source.value));
      }
      el.value=source.value;if(el.type==='checkbox')el.checked=source.checked;
    });
  }
  window.vxMarkOsFieldSaved=(entity,name)=>{pendingFields.delete(entity+'.'+name);setDirty(pendingFields.size>0);};
  window.vxMarkOsPanelSaved=panel=>{qa('[data-entity][data-name]',panel).forEach(el=>pendingFields.delete(fieldKey(el)));setDirty(pendingFields.size>0);};
  window.vxHasUnsavedBudget=()=>[...pendingFields].some(key=>editedFields.get(key)?.closest('#vx-orcamento'));
  const norm=s=>String(s||'').toUpperCase().replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const today=()=>new Date().toISOString().slice(0,10);
  const dtLocal=v=>v?String(v).slice(0,16):'';

  function valueOf(el){if(!el)return null;if(el.type==='checkbox')return !!el.checked;let v=el.value;if(v==='')return null;if(el.type==='number')return Number(String(v).replace(',','.'))||0;return v;}
  function collect(entity){const body={};qa(`.vx-os-panel [data-entity="${entity}"][data-name]`).forEach(el=>{if(el.disabled||el.readOnly)return;const name=el.dataset.name;const latest=editedFields.get(fieldKey(el));if(name)body[name]=valueOf(latest?.isConnected?latest:el);});return body;}
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
        <label class="vx-field"><span>APROVADO/RECUSADO POR</span><input class="vx-control" data-entity="order" data-name="approval_by" value="${String(o.approval_by||'').replace(/</g,'&lt;')}"></label>
        <label class="vx-field"><span>PRONTO</span><input class="vx-control" type="datetime-local" data-entity="order" data-name="ready_at" value="${dtLocal(o.ready_at)}"></label>
        <label class="vx-field" id="vxRejectReasonWrap" style="grid-column:1/-1;${o.approval_decision==='RECUSADO'?'':'display:none'}"><span>MOTIVO DA RECUSA</span><textarea class="vx-control" data-entity="order" data-name="rejection_reason" style="min-height:64px">${String(o.rejection_reason||'').replace(/</g,'&lt;')}</textarea></label>
      </div><div style="font-size:10px;color:#687b8e;margin-top:8px">A recusa preserva análise, peças e valores da OS, mas não gera recebimento nem movimentação automática de caixa. Data de entrega/saída e financeiro agora ficam na guia FINALIZAR OS.</div>`;
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
  // campo do fluxo. missingFor() (a versão client-side de "o que
  // falta") foi removida em 2026-09-03: o próprio RPC agora devolve
  // "missing" (migration 20260903050000) -- duplicar essa lista aqui
  // de novo é exatamente o que a migration anterior já pedia pra nunca
  // fazer.

  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';

  async function saveAll(){
    const o=state?.activeOs;if(!o?.id||saving)return;
    // Achado do usuário em 2026-09-07: OS FINALIZADA só pode ser
    // alterada pelo GESTOR (segurança -- migration 20260907060000).
    // Aviso claro aqui em vez de deixar o SALVAR falhar com erro cru
    // de RLS pra quem tentar salvar peças/pagamento/cronograma numa OS
    // já finalizada sem ser gestor.
    if(String(o.status||'').toUpperCase()==='FINALIZADA'&&!isGestor())return toast('OS finalizada só pode ser alterada pelo GESTOR.','err');
    const b=btn();saving=true;if(b)b.disabled=true;setDirty(dirty);
    try{
      // Achado do usuário em 2026-09-12 (erro "invalid input syntax for
      // type numeric: \"R$ 0,00\"" ao clicar FINALIZAR): currency-format-
      // v0812.js mascara os campos monetários como texto formatado
      // ("R$ 0,00") enquanto o operador edita, e só desfaz isso (volta
      // pro número puro) em quem explicitamente chama
      // vxNormalizeCurrencyFields -- até agora só o clique no botão
      // SALVAR do cabeçalho (#vxGlobalSave, via os-save-currency-fix-
      // v0812.js, e só pra 5 nomes de campo). O botão FINALIZAR (aba
      // FINALIZAR OS) chama esta mesma função por um caminho diferente
      // (não passa pelo listener de #vxGlobalSave) e nunca normalizava
      // -- o valor mascarado ia direto pro Postgres. Corrigido na fonte
      // única: normaliza aqui dentro, cobrindo QUALQUER chamador desta
      // função (SALVAR, FINALIZAR, Ctrl+W), em vez de depender de cada
      // botão novo lembrar de repetir o patch.
      window.vxNormalizeCurrencyFields?.(document);
      const orderBody=collect('order'),equipmentBody=collect('equipment'),clientBody=collect('client'),financialBody=collect('financial');
      const jobs=[];
      if(Object.keys(orderBody).length){orderBody.updated_at=new Date().toISOString();jobs.push(api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(orderBody)}));}
      if(o.equipment_id&&Object.keys(equipmentBody).length)jobs.push(api(`equipments?id=eq.${encodeURIComponent(o.equipment_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(equipmentBody)}));
      if(o.client_id&&Object.keys(clientBody).length)jobs.push(api(`clients?id=eq.${encodeURIComponent(o.client_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(clientBody)}));
      if(Object.keys(financialBody).length){financialBody.service_order_id=o.id;financialBody.updated_at=new Date().toISOString();const existing=await api(`os_financial?service_order_id=eq.${encodeURIComponent(o.id)}&select=id&limit=1`).catch(()=>[]);if(existing?.[0]?.id)jobs.push(api(`os_financial?id=eq.${encodeURIComponent(existing[0].id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)}));else jobs.push(api('os_financial',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)}));}
      await Promise.all(jobs);Object.assign(o,orderBody);if(o.equipments&&typeof o.equipments==='object')Object.assign(o.equipments,equipmentBody);if(o.clients&&typeof o.clients==='object')Object.assign(o.clients,clientBody);
      if(typeof window.vxUpdateBudgetTotal==='function')window.vxUpdateBudgetTotal();
      // Achado do usuário em 2026-09-29: ALTERAR > EDITAR DADOS DA O.S.
      // destravava os campos do resumo e nunca travava de volta -- SALVAR
      // salva de verdade (PATCH acima) mas nunca chamava a trava
      // (os-edit-data-fix-v0812.js só sabia destravar). Trava de novo
      // aqui, só depois do PATCH ter dado certo.
      window.vxLockOsDataEdit?.();
      window.vxApplySavedFinancial?.(financialBody,o.id);
      pendingFields.clear();setDirty(false);
      const result=await window.vxAdvanceOsStatus?.(o.id);
      // Achado do usuário em 2026-09-03: vxAdvanceOsStatus agora mostra
      // seu próprio aviso (avançou, ou "falta: ...") pra QUALQUER
      // chamador -- mostrar de novo aqui duplicaria o toast. Só fala
      // "salvo com sucesso" quando não há nada pendente pro status
      // avançar (ex.: OS já numa etapa sem mais exigência do operador).
      if(!result?.changed&&!(result?.missing?.length))toast('Alterações da OS salvas com sucesso.');
    }catch(err){setDirty(true);toast('Falha ao salvar alterações da OS: '+err.message,'err');}
    finally{saving=false;if(b)b.disabled=false;setDirty(dirty);}
  }
  window.vxSaveAllOs=saveAll;

  const baseDetail=window.renderOsDetail;if(typeof baseDetail==='function')window.renderOsDetail=async function(){const previousId=state?.activeOs?.id;const drafts=[...pendingFields].map(key=>{const el=editedFields.get(key);return el?{key,entity:el.dataset.entity,name:el.dataset.name,value:el.value,checked:el.checked}:null;}).filter(Boolean);const r=await baseDetail.apply(this,arguments);editedFields.clear();pendingFields.clear();dirty=false;bindSummaryFields();injectSave();injectWorkflowFields();if(previousId===state?.activeOs?.id)drafts.forEach(d=>{const el=q(`.vx-os-panel [data-entity="${d.entity}"][data-name="${d.name}"]`);if(el){el.value=d.value;el.checked=d.checked;syncField(el);}});setDirty(pendingFields.size>0);return r;};
  const track=e=>{if(e.target.closest('.vx-os-panel')&&e.target.matches('input,select,textarea')){syncField(e.target);setDirty(true);}};
  document.addEventListener('input',track,true);
  document.addEventListener('change',track,true);
  document.addEventListener('click',e=>{
    if(!dirty||saving||!String(state?.view||'').startsWith('os:'))return;
    if(!e.target.closest('.nav,.tab[data-tab],[data-close],.vx-back'))return;
    if(!window.confirm('Existem alterações não salvas nesta OS. Deseja sair sem salvar?')){
      e.preventDefault();e.stopImmediatePropagation();return;
    }
    pendingFields.clear();setDirty(false);
  },true);
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='w'&&state?.activeOs?.id){e.preventDefault();e.stopImmediatePropagation();saveAll();}},true);
})();
