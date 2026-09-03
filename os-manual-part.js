/* VoxAssist Web V0.8.12 — inclusão manual de peça: formulário único + catálogo com saldo zero */
(function(){
  function closeModal(){document.querySelector('#vxManualPartModal')?.remove()}
  function modalHtml(){return `<div id="vxManualPartModal" class="vx-modal-backdrop"><div class="vx-modal-card" role="dialog" aria-modal="true" aria-labelledby="vxManualPartTitle"><div class="vx-modal-head"><h3 id="vxManualPartTitle">INCLUIR PEÇA MANUAL</h3><button type="button" onclick="vxCloseManualPart()">×</button></div><div class="vx-manual-grid"><label>CÓDIGO<input id="vxMpCode"></label><label>DESCRIÇÃO / PEÇA *<input id="vxMpDescription" autofocus></label><label>MARCA<input id="vxMpBrand"></label><label>QUANTIDADE *<input id="vxMpQty" type="number" min="0.01" step="0.01" value="1"></label><label>VALOR UNITÁRIO (R$) *<input id="vxMpUnit" type="number" min="0" step="0.01" value="0"></label><label class="vx-check"><input id="vxMpMoveStock" type="checkbox"> MOVIMENTA ESTOQUE</label></div><div class="vx-modal-note">Ao incluir manualmente, a peça também será cadastrada no catálogo/estoque para futuras pesquisas. Se for nova, será criada com saldo fiscal 0 e saldo disponível 0.</div><div class="vx-modal-actions"><button type="button" class="vx-action" onclick="vxCloseManualPart()">CANCELAR</button><button type="button" class="vx-green-btn" id="vxMpSave" onclick="vxSaveManualPart()">SALVAR E INCLUIR</button></div></div></div>`}

  window.vxCloseManualPart=closeModal;
  window.addManualPart=function(){closeModal();document.body.insertAdjacentHTML('beforeend',modalHtml());setTimeout(()=>document.querySelector('#vxMpDescription')?.focus(),30)};

  async function findOrCreateStockItem(code,description,brand){
    const uc=s=>String(s||'').trim().toUpperCase();
    let item=(state.stock||[]).find(x=>code&&uc(x.code)===uc(code));
    if(!item)item=(state.stock||[]).find(x=>uc(x.description)===uc(description)&&uc(x.manufacturer)===uc(brand));
    if(item)return item;
    const stockCode=code||`MAN-${Date.now().toString(36).toUpperCase()}`;
    const created=await api('stock_items',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({code:stockCode,description,manufacturer:brand||null,fiscal_quantity:0,available_quantity:0,storage_location:'CADASTRO MANUAL / SEM SALDO'})});
    const x=created?.[0];if(x){state.stock.push(x);return x}throw new Error('Não foi possível cadastrar a peça no catálogo.');
  }

  window.vxSaveManualPart=async function(){
    const btn=document.querySelector('#vxMpSave');
    const code=up(document.querySelector('#vxMpCode')?.value||'').trim();
    const description=up(document.querySelector('#vxMpDescription')?.value||'').trim();
    const brand=up(document.querySelector('#vxMpBrand')?.value||'').trim();
    const quantity=Number(document.querySelector('#vxMpQty')?.value||0);
    const unit_value=Number(document.querySelector('#vxMpUnit')?.value||0);
    const move_stock=!!document.querySelector('#vxMpMoveStock')?.checked;
    if(!description)return toast('Informe a descrição da peça.','err');
    if(!(quantity>0))return toast('Informe uma quantidade maior que zero.','err');
    if(unit_value<0||Number.isNaN(unit_value))return toast('Informe um valor unitário válido.','err');
    try{
      if(btn){btn.disabled=true;btn.textContent='SALVANDO...'}
      const stock=await findOrCreateStockItem(code,description,brand);
      await api('os_parts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({service_order_id:state.activeOs.id,stock_item_id:stock.id,code:code||stock.code,description,brand:brand||stock.manufacturer||null,quantity,unit_value,is_manual:true,move_stock})});
      await window.vxAdvanceOsStatus?.(state.activeOs.id);
      toast('Peça incluída na OS e cadastrada no catálogo com saldo zero.');
      closeModal();
      await loadCore();
      if(typeof window.renderOsDetail==='function')await window.renderOsDetail(state.activeOs.id,'orcamento');else render(`os:${state.activeOs.id}`);
    }catch(e){toast('Erro ao incluir peça: '+e.message,'err');if(btn){btn.disabled=false;btn.textContent='SALVAR E INCLUIR'}}
  };
})();
