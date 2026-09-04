/* VoxAssist Web V0.8.12 — ações seguras de Equipamento e Orçamento sem envolver renderOsDetail */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];

  function valueOf(el){
    if(!el) return null;
    let v=el.value;
    if(v==='') return null;
    if(el.type==='number') return Number(String(v).replace(',','.'))||0;
    return v;
  }

  function collect(panel,entity){
    const body={};
    qa(`[data-entity="${entity}"][data-name]`,panel).forEach(el=>{
      const name=el.dataset.name;
      if(name) body[name]=valueOf(el);
    });
    return body;
  }

  function parseMoney(v){
    if(typeof v==='number') return v;
    let s=String(v??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
    if(!s) return 0;
    if(s.includes(',') && s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(',')) s=s.replace(',','.');
    return Number(s)||0;
  }

  function fieldByLabel(panel,needle){
    const n=String(needle).toUpperCase();
    const field=qa('.vx-field',panel).find(f=>String(q('label',f)?.textContent||'').toUpperCase().includes(n));
    return field ? q('input,select,textarea',field) : null;
  }

  function budgetNumbers(){
    const panel=q('#vx-orcamento');
    if(!panel) return {parts:0,labor:0,freight:0,aux:0,opinion:0,discount:0,total:0};
    const read=label=>parseMoney(fieldByLabel(panel,label)?.value);
    const parts=read('VALOR DAS PEÇAS');
    const labor=read('MÃO DE OBRA');
    const freight=read('FRETE');
    const aux=read('MATERIAL AUXILIAR');
    const opinion=read('PARECER TÉCNICO');
    const discount=read('DESCONTO');
    return {parts,labor,freight,aux,opinion,discount,total:parts+labor+freight+aux+opinion-discount};
  }

  function brl(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

  function updateBudgetTotal(){
    const box=q('#vxBudgetTotal');
    if(!box) return;
    const n=budgetNumbers();
    q('[data-vx="parts"]',box).textContent=brl(n.parts);
    q('[data-vx="labor"]',box).textContent=brl(n.labor);
    q('[data-vx="extras"]',box).textContent=brl(n.freight+n.aux+n.opinion);
    q('[data-vx="discount"]',box).textContent=brl(n.discount);
    q('[data-vx="total"]',box).textContent=brl(n.total);
  }
  window.vxUpdateBudgetTotal=updateBudgetTotal;

  async function saveEquipmentComplementary(){
    const o=state.activeOs;
    const panel=q('#vx-equip');
    if(!o?.id || !panel) return toast('Nenhuma OS aberta para salvar.','err');
    const btn=q('#vxSaveEquipment');
    if(btn){btn.disabled=true;btn.textContent='SALVANDO...';}
    try{
      const equipmentBody=collect(panel,'equipment');
      const orderBody=collect(panel,'order');
      if(o.equipment_id && Object.keys(equipmentBody).length){
        await api(`equipments?id=eq.${encodeURIComponent(o.equipment_id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(equipmentBody)});
      }
      if(Object.keys(orderBody).length){
        orderBody.updated_at=new Date().toISOString();
        await api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(orderBody)});
      }
      Object.assign(o,orderBody);
      if(o.equipments&&typeof o.equipments==='object') Object.assign(o.equipments,equipmentBody);
      toast('Dados complementares do equipamento salvos.');
    }catch(err){toast('Falha ao salvar equipamento: '+err.message,'err');}
    finally{if(btn){btn.disabled=false;btn.textContent='SALVAR DADOS COMPLEMENTARES';}}
  }
  window.vxSaveEquipment=saveEquipmentComplementary;

  // Achado do usuário em 2026-09-02: erro ao salvar aparecia num toast
  // genérico que some sozinho em poucos segundos, sempre com a MESMA
  // frase ("cadastro incompleto"), mesmo quando a causa real era outra
  // (RLS, sessão, empresa ativa). Auditoria isolada (cada condição
  // testada em separado, formulário totalmente vazio incluso)
  // confirmou que HOJE NENHUM campo deste formulário é validado --
  // técnico, defeito constatado, serviço, valores financeiros, todos
  // opcionais, salvamento sempre aceito. Por instrução explícita do
  // usuário, esta correção NÃO cria nenhum campo obrigatório novo --
  // só troca a APRESENTAÇÃO: erro técnico agora usa
  // vxShowTechnicalError (caixa persistente, nunca some sozinha, log
  // completo só no console -- ver form-error-display-v1.js), e a única
  // condição que já bloqueava (nenhuma OS carregada) ganha a mesma
  // caixa em vez de um toast passageiro.
  async function saveBudget(){
    const o=state.activeOs;
    const panel=q('#vx-orcamento');
    window.vxClearFormErrors?.(panel);
    if(!o?.id || !panel){
      const msg='Nenhuma OS aberta para salvar.';
      if(panel && window.vxShowTechnicalError)window.vxShowTechnicalError(panel,msg);
      else toast(msg,'err');
      return;
    }
    const btn=q('#vxSaveBudget');
    if(btn){btn.disabled=true;btn.textContent='SALVANDO...';}
    try{
      // Achado do usuário em 2026-09-02: currency-format-v0812.js
      // transforma estes campos de type="number" pra type="text" e
      // mostra "R$ 0,00" formatado enquanto o usuário edita --
      // desformatar de volta pra número puro só acontecia no evento
      // "submit" de um <form> (este botão não está dentro de um
      // <form>) ou no clique do OUTRO botão "SALVAR" do cabeçalho
      // (os-save-currency-fix-v0812.js, nunca cobriu este botão). O
      // valor formatado ("R$ 0,00") ia direto pro Postgres, que
      // rejeita com "invalid input syntax for type numeric" -- a raiz
      // real por trás do erro genérico relatado. Mesma correção já
      // usada em os-save-currency-fix-v0812.js, só que aplicada aqui
      // também.
      window.vxNormalizeCurrencyFields?.(panel);
      const orderBody=collect(panel,'order');
      const financialBody=collect(panel,'financial');
      if(Object.keys(orderBody).length){
        orderBody.updated_at=new Date().toISOString();
        await api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(orderBody)});
        Object.assign(o,orderBody);
      }
      if(Object.keys(financialBody).length){
        financialBody.service_order_id=o.id;
        financialBody.updated_at=new Date().toISOString();
        const existing=await api(`os_financial?service_order_id=eq.${encodeURIComponent(o.id)}&select=id&limit=1`).catch(()=>[]);
        if(existing?.[0]?.id){
          await api(`os_financial?id=eq.${encodeURIComponent(existing[0].id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)});
        }else{
          await api('os_financial',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(financialBody)});
        }
      }
      updateBudgetTotal();
      // Achado do usuário em 2026-09-04: OS 02I26O35 tinha "Decisão do
      // orçamento: APROVADO" + "Data da decisão" preenchidos e salvos
      // de verdade no banco (confirmado), mas a situação continuava
      // "Aguardando Aprovação" -- este é o botão "SALVAR ORÇAMENTO /
      // ANÁLISE TÉCNICA" (o mais usado no fluxo normal de orçamento),
      // e ele nunca chamava o motor de avanço de status. Mesma classe
      // de bug já corrigida nos dois salvamentos Whirlpool -- corrigida
      // aqui também, provavelmente a causa raiz de vários relatos
      // anteriores de "status não avançou sozinho".
      const advanceResult=await window.vxAdvanceOsStatus?.(o.id);
      if(!advanceResult?.changed&&!(advanceResult?.missing?.length))toast('Orçamento / análise técnica salvos.');
    }catch(err){
      // vxHumanMessage() (security-whirlpool-hardening-v0813.js) já
      // traduz a causa técnica pra uma frase honesta e loga o erro
      // original completo no console -- aqui só decide ONDE mostrar
      // (caixa persistente, não toast passageiro).
      const translated=typeof window.vxHumanMessage==='function'?window.vxHumanMessage(err.message):err.message;
      if(window.vxShowTechnicalError)window.vxShowTechnicalError(panel,translated,err);
      else toast('Falha ao salvar orçamento: '+err.message,'err');
    }
    finally{if(btn){btn.disabled=false;btn.textContent='SALVAR ORÇAMENTO / ANÁLISE TÉCNICA';}}
  }
  window.vxSaveBudget=saveBudget;

  function ensureEquipment(){
    const panel=q('#vx-equip');
    if(!panel || q('#vxSaveEquipment',panel)) return;
    const firstBox=q('.vx-screen-box',panel);
    if(!firstBox) return;
    const actions=document.createElement('div');
    actions.className='vx-client-actions vx-equipment-actions';
    actions.style.cssText='display:flex;justify-content:flex-end;margin-top:14px;';
    actions.innerHTML='<button type="button" id="vxSaveEquipment" class="vx-action parts">SALVAR DADOS COMPLEMENTARES</button>';
    firstBox.appendChild(actions);
    q('#vxSaveEquipment',actions).onclick=saveEquipmentComplementary;
  }

  function ensureBudget(){
    const panel=q('#vx-orcamento');
    if(!panel) return;
    if(!q('#vxBudgetTotal',panel)){
      const form=q('.vx-form-3.budget',panel)||q('.vx-form-3',panel);
      if(form){
        const total=document.createElement('div');
        total.id='vxBudgetTotal';
        total.style.cssText='margin:14px 0 8px;border:1px solid #cbd7e3;background:#f7fafc;padding:12px 14px;display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;align-items:center;';
        total.innerHTML='<div><small>PEÇAS</small><b data-vx="parts" style="display:block;margin-top:5px"></b></div><div><small>MÃO DE OBRA</small><b data-vx="labor" style="display:block;margin-top:5px"></b></div><div><small>FRETE + AUXILIAR + PARECER</small><b data-vx="extras" style="display:block;margin-top:5px"></b></div><div><small>DESCONTO</small><b data-vx="discount" style="display:block;margin-top:5px;color:#d56b00"></b></div><div style="border-left:3px solid #078f46;padding-left:12px"><small>TOTAL DO ORÇAMENTO</small><b data-vx="total" style="display:block;margin-top:4px;font-size:20px;color:#078f46"></b></div>';
        form.insertAdjacentElement('afterend',total);
        updateBudgetTotal();
      }
    }
    if(!q('#vxSaveBudget',panel)){
      const btn=document.createElement('button');
      btn.type='button';btn.id='vxSaveBudget';btn.className='vx-action parts';btn.textContent='SALVAR ORÇAMENTO / ANÁLISE TÉCNICA';
      btn.style.cssText='margin:12px 0 4px;';
      const firstBox=q('.vx-screen-box',panel)||panel;
      firstBox.appendChild(btn);
      btn.onclick=saveBudget;
    }
    if(!panel.dataset.vxTotalBound){
      panel.dataset.vxTotalBound='1';
      panel.addEventListener('input',updateBudgetTotal);
      panel.addEventListener('change',updateBudgetTotal);
    }
  }

  function ensure(){ensureEquipment();ensureBudget();}
  const root=document.documentElement;
  const observer=new MutationObserver(()=>ensure());
  observer.observe(root,{subtree:true,childList:true});
  document.addEventListener('click',e=>{if(e.target.closest('.vx-os-tabs'))setTimeout(ensure,0);});
  setTimeout(ensure,0);
})();
