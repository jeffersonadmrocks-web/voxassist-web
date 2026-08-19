/* VoxAssist Web V0.8.12 — correções de homologação da OS: alinhamento, tipo de OS e peças */
(function(){
  const TYPES=['FORA DE GARANTIA','GARANTIA','SEGURADORA','REINGRESSO','OUTROS'];
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const txt=v=>String(v??'');
  const safe=v=>typeof esc==='function'?esc(v):txt(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const brl=v=>typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  function labelField(label){
    return qa('.vx-field').find(f=>q('label',f)?.textContent.trim().toUpperCase()===label.toUpperCase());
  }

  async function patchOrderType(value){
    if(!state?.activeOs?.id)return;
    try{
      await api(`service_orders?id=eq.${state.activeOs.id}`,{method:'PATCH',body:JSON.stringify({order_type:value})});
      state.activeOs.order_type=value;
      toast('Tipo de O.S. atualizado.');
    }catch(e){toast('Não foi possível atualizar o tipo de O.S.: '+e.message,'err')}
  }

  function ensureOrderType(){
    const equipmentPanel=q('#vx-os .vx-os-summary-grid .vx-os-box:nth-child(2)');
    if(!equipmentPanel)return;
    const grid=q('.vx-field-grid',equipmentPanel);
    if(!grid)return;

    let host=q('[data-vx-order-type-summary]',grid);
    const current=(state?.activeOs?.order_type||'FORA DE GARANTIA').toUpperCase();
    if(!host){
      host=document.createElement('div');
      host.className='vx-field vx-order-type-summary';
      host.dataset.vxOrderTypeSummary='1';
      const service=labelField('TIPO DE ATENDIMENTO');
      if(service?.parentElement===grid)grid.insertBefore(host,service);else grid.appendChild(host);
    }
    host.innerHTML=`<label>TIPO DE ORDEM DE SERVIÇO *</label><select class="vx-control" id="vxSummaryOrderType">${TYPES.map(t=>`<option value="${t}" ${t===current?'selected':''}>${t}</option>`).join('')}</select>`;
    q('#vxSummaryOrderType',host).onchange=e=>patchOrderType(e.target.value);
  }

  function alignEquipmentFields(){
    const local=labelField('LOCAL DO PRODUTO');
    const service=labelField('TIPO DE ATENDIMENTO');
    if(local)local.classList.add('vx-summary-aligned-field');
    if(service)service.classList.add('vx-summary-aligned-field');
  }

  function partRows(parts,actions=true){
    if(!parts?.length)return '<tr><td colspan="8" class="vx-empty">Nenhuma peça lançada nesta O.S.</td></tr>';
    return parts.map(p=>`<tr data-part-id="${safe(p.id)}"><td>${safe(p.code||'—')}</td><td class="vx-part-desc"><b>${safe(p.description||'SEM DESCRIÇÃO')}</b></td><td>${safe(p.brand||'—')}</td><td>${Number(p.quantity||0)}</td><td>${brl(p.unit_value)}</td><td>${brl(Number(p.quantity||0)*Number(p.unit_value||0))}</td><td>${p.move_stock===false?'NÃO':'SIM'}</td>${actions?`<td class="vx-part-actions"><button type="button" class="vx-mini-edit" onclick="vxEditOsPart('${safe(p.id)}')">ALTERAR</button><button type="button" class="vx-mini-delete" onclick="vxDeleteOsPart('${safe(p.id)}')">EXCLUIR</button></td>`:''}</tr>`).join('');
  }

  function ensureSummaryParts(){
    const strip=q('#vx-os .vx-budget-strip');
    if(!strip || q('.vx-summary-parts',strip))return;
    const parts=window.__vxCurrentParts||[];
    const box=document.createElement('div');
    box.className='vx-summary-parts';
    box.innerHTML=`<div class="vx-summary-parts-title">PEÇAS LANÇADAS</div>${parts.length?`<div class="vx-summary-parts-list">${parts.map(p=>`<span><b>${safe(p.description||'SEM DESCRIÇÃO')}</b> • Qtd. ${Number(p.quantity||0)} • ${brl(Number(p.quantity||0)*Number(p.unit_value||0))}</span>`).join('')}</div>`:'<div class="vx-summary-parts-empty">Nenhuma peça lançada.</div>'}`;
    strip.appendChild(box);
  }

  function ensureBudgetParts(){
    const panel=q('#vx-orcamento');
    if(!panel)return;
    const parts=window.__vxCurrentParts||[];
    let box=q('#vxPartsLaunchedBox',panel);
    if(!box){
      box=document.createElement('div');
      box.id='vxPartsLaunchedBox';
      box.className='vx-screen-box vx-parts-launched';
      const searchArea=qa('fieldset, .vx-screen-box',panel).find(x=>/PEÇAS DO ORÇAMENTO/i.test(x.textContent||''));
      if(searchArea)searchArea.insertAdjacentElement('beforebegin',box);else panel.appendChild(box);
    }
    box.innerHTML=`<h3 class="vx-title green">PEÇAS LANÇADAS NESTA O.S.</h3><div class="vx-table-scroll"><table class="vx-grid-table"><thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO / PEÇA</th><th>MARCA</th><th>QTD.</th><th>UNITÁRIO</th><th>TOTAL</th><th>MOV. ESTOQUE</th><th>AÇÕES</th></tr></thead><tbody>${partRows(parts,true)}</tbody></table></div>`;
  }

  window.vxEditOsPart=async function(id){
    const p=(window.__vxCurrentParts||[]).find(x=>String(x.id)===String(id));
    if(!p)return toast('Peça não encontrada.','err');
    const description=prompt('Descrição / peça:',p.description||'');if(description===null)return;
    const code=prompt('Código:',p.code||'');if(code===null)return;
    const brand=prompt('Marca:',p.brand||'');if(brand===null)return;
    const quantity=prompt('Quantidade:',String(p.quantity||1));if(quantity===null)return;
    const unit=prompt('Valor unitário (R$):',String(p.unit_value||0));if(unit===null)return;
    const qty=Number(String(quantity).replace(',','.')),unitValue=Number(String(unit).replace(',','.'));
    if(!(qty>0)||Number.isNaN(unitValue)||unitValue<0)return toast('Quantidade ou valor inválido.','err');
    try{
      await api(`os_parts?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({description:up(description),code:up(code),brand:up(brand),quantity:qty,unit_value:unitValue})});
      toast('Peça alterada com sucesso.');
      await window.renderOsDetail(state.activeOs.id,'orcamento');
    }catch(e){toast('Erro ao alterar peça: '+e.message,'err')}
  };

  window.vxDeleteOsPart=async function(id){
    const p=(window.__vxCurrentParts||[]).find(x=>String(x.id)===String(id));
    if(!confirm(`Excluir a peça "${p?.description||''}" desta O.S.?`))return;
    try{
      await api(`os_parts?id=eq.${id}`,{method:'DELETE'});
      toast('Peça excluída da O.S.');
      await window.renderOsDetail(state.activeOs.id,'orcamento');
    }catch(e){toast('Erro ao excluir peça: '+e.message,'err')}
  };

  const base=window.renderOsDetail;
  if(typeof base==='function'){
    window.renderOsDetail=async function(id,preferredTab){
      const r=await base.apply(this,arguments);
      try{
        const parts=await api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`);
        window.__vxCurrentParts=parts||[];
        ensureOrderType();
        alignEquipmentFields();
        ensureSummaryParts();
        ensureBudgetParts();
        if(preferredTab==='orcamento' && typeof showVxOsSection==='function')showVxOsSection('orcamento');
      }catch(e){console.warn('Correções da OS:',e)}
      return r;
    };
  }
})();
