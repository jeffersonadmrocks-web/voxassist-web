/* VoxAssist Web V0.8.12 — correções de homologação da OS: alinhamento, tipo de OS e peças */
(function(){
  const TYPES=['FORA DE GARANTIA','GARANTIA','SEGURADORA','REINGRESSO','OUTROS'];
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const txt=v=>String(v??'');
  const safe=v=>typeof esc==='function'?esc(v):txt(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
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
    // Achado do usuário em 2026-09-02: o divisor "Atendimento" era um
    // ::before posicionado com top negativo -- mesmo escopado pelo
    // label certo, continuava sobrepondo a linha anterior do grid (a
    // margem do campo não faz a track do grid crescer do jeito que um
    // ::before absoluto pressupõe). Trocado por um elemento de verdade,
    // inserido como filho do grid (mesma técnica já comprovada em
    // ensureOrderType(), logo acima) -- span de linha inteira,
    // participa do fluxo normal do grid, não tem como sobrepor nada.
    if(service&&service.parentElement&&!q('[data-vx-attendance-divider]',service.parentElement)){
      const divider=document.createElement('div');
      divider.className='vx-field vx-attendance-divider';
      divider.dataset.vxAttendanceDivider='1';
      divider.textContent='Atendimento';
      service.parentElement.insertBefore(divider,service);
    }
  }

  // Achado do usuário em 2026-09-04: "ALTERAR" perguntava campo por
  // campo com prompt() (5 caixas sequenciais) -- em vez disso, a
  // própria linha da tabela vira editável (inputs no lugar do texto),
  // com SALVAR/CANCELAR substituindo ALTERAR/EXCLUIR só nessa linha.
  // Só uma linha editável por vez (editingPartId); trocar de linha
  // simplesmente descarta a edição em andamento, sem perguntar.
  let editingPartId=null;

  function partRow(p,actions){
    const id=safe(p.id);
    if(actions&&editingPartId===String(p.id)){
      const qty=Number(p.quantity||0),unit=Number(p.unit_value||0);
      return `<tr data-part-id="${id}" class="vx-part-editing">
        <td><input class="vx-mini-input" id="vxPartEditCode" value="${safe(p.code||'')}"></td>
        <td class="vx-part-desc"><input class="vx-mini-input" id="vxPartEditDesc" value="${safe(p.description||'')}"></td>
        <td><input class="vx-mini-input" id="vxPartEditBrand" value="${safe(p.brand||'')}"></td>
        <td><input class="vx-mini-input vx-mini-input-num" id="vxPartEditQty" type="number" min="0.01" step="0.01" value="${qty}"></td>
        <td><input class="vx-mini-input vx-mini-input-num" id="vxPartEditUnit" type="number" min="0" step="0.01" value="${unit}"></td>
        <td>${brl(qty*unit)}</td>
        <td>${p.move_stock===false?'NÃO':'SIM'}</td>
        <td class="vx-part-actions"><button type="button" class="vx-mini-save" onclick="vxSaveOsPart('${id}')">SALVAR</button><button type="button" class="vx-mini-cancel" onclick="vxCancelEditOsPart()">CANCELAR</button></td>
      </tr>`;
    }
    return `<tr data-part-id="${id}"><td>${safe(p.code||'—')}</td><td class="vx-part-desc"><b>${safe(p.description||'SEM DESCRIÇÃO')}</b></td><td>${safe(p.brand||'—')}</td><td>${Number(p.quantity||0)}</td><td>${brl(p.unit_value)}</td><td>${brl(Number(p.quantity||0)*Number(p.unit_value||0))}</td>${actions?`<td>${p.move_stock===false?'NÃO':'SIM'}</td><td class="vx-part-actions"><button type="button" class="vx-mini-edit" onclick="vxEditOsPart('${id}')">ALTERAR</button><button type="button" class="vx-mini-delete" onclick="vxDeleteOsPart('${id}')">EXCLUIR</button></td>`:''}</tr>`;
  }

  function partRows(parts,actions=true){
    if(!parts?.length)return `<tr><td colspan="${actions?8:6}" class="vx-empty">Nenhuma peça lançada nesta O.S.</td></tr>`;
    return parts.map(p=>partRow(p,actions)).join('');
  }

  function ensureSummaryParts(){
    const strip=q('#vx-os .vx-budget-strip');
    if(!strip)return;
    const parts=window.__vxCurrentParts||[];
    let box=q('.vx-summary-parts',strip);
    if(!box){
      box=document.createElement('div');
      box.className='vx-summary-parts';
      strip.appendChild(box);
    }
    box.innerHTML=`<div class="vx-summary-parts-title">PEÇAS LANÇADAS NESTA O.S.</div><div class="vx-table-scroll"><table class="vx-grid-table vx-summary-parts-table"><thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO / PEÇA</th><th>MARCA</th><th>QTD.</th><th>UNITÁRIO</th><th>TOTAL</th></tr></thead><tbody>${partRows(parts,false)}</tbody></table></div>`;
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

  window.vxEditOsPart=function(id){
    editingPartId=String(id);
    ensureBudgetParts();
  };

  window.vxCancelEditOsPart=function(){
    editingPartId=null;
    ensureBudgetParts();
  };

  window.vxSaveOsPart=async function(id){
    const p=(window.__vxCurrentParts||[]).find(x=>String(x.id)===String(id));
    if(!p)return toast('Peça não encontrada.','err');
    const description=q('#vxPartEditDesc')?.value||'';
    const code=q('#vxPartEditCode')?.value||'';
    const brand=q('#vxPartEditBrand')?.value||'';
    const qty=Number(String(q('#vxPartEditQty')?.value||'').replace(',','.'));
    const unitValue=Number(String(q('#vxPartEditUnit')?.value||'').replace(',','.'));
    if(!description.trim())return toast('Informe a descrição da peça.','err');
    if(!(qty>0))return toast('Informe uma quantidade maior que zero.','err');
    if(Number.isNaN(unitValue)||unitValue<0)return toast('Informe um valor unitário válido.','err');
    try{
      await api(`os_parts?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({description:up(description),code:up(code),brand:up(brand),quantity:qty,unit_value:unitValue})});
      toast('Peça alterada com sucesso.');
      editingPartId=null;
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
