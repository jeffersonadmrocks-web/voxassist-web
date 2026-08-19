/* VoxAssist Web V0.8.12 — situação visível + ALTERAR no cabeçalho */
(function(){
  const FLOW=[['AGUARDANDO ANALISE','Aguardando Análise'],['AGUARDANDO APROVACAO','Aguardando Aprovação'],['AGUARDANDO CONSERTO','Aguardando Conserto'],['EM CONSERTO','Em Conserto'],['PRONTO PARA ENTREGA','Pronto para Entrega'],['FINALIZADA','Finalizada']];
  const labelOf=s=>FLOW.find(x=>x[0]===s)?.[1]||String(s||'').replaceAll('_',' ');
  const roleAllowed=()=>!['TECNICO','ESTOQUE'].includes(String(state?.profile?.role||'').toUpperCase());
  const closeModal=()=>document.querySelector('#vxStatusModal')?.remove();

  function injectStatus(){
    const o=state?.activeOs,head=document.querySelector('.vx-os-head-left'),bar=document.querySelector('.vx-os-head-actions');
    if(!o?.id||!head||!bar)return;
    const old=head.querySelector('.vx-status-btn');if(old)old.style.display='none';
    let box=head.querySelector('#vxStatusArea');
    if(!box){box=document.createElement('div');box.id='vxStatusArea';box.style.cssText='display:flex;align-items:center;gap:8px;margin:4px 0 6px;flex-wrap:wrap;';const number=head.querySelector('.vx-os-number');(number||head.firstElementChild)?.insertAdjacentElement('afterend',box);}
    box.innerHTML=`<div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:10px;color:#6a7d90;font-weight:700">SITUAÇÃO ATUAL</span><strong style="font-size:12px;color:#12324e">${labelOf(o.status)}</strong></div>`;
    if(!bar.querySelector('#vxChangeStatus')){
      const b=document.createElement('button');b.type='button';b.id='vxChangeStatus';b.className='vx-action';b.textContent='ALTERAR';b.style.cssText='min-width:78px;background:#fff;color:#40566e;border:1px solid #c8d3dd;';b.onclick=window.manualStatus;
      const save=bar.querySelector('#vxGlobalSave');if(save)save.insertAdjacentElement('afterend',b);else{const attention=[...bar.querySelectorAll('button')].find(x=>/CASO DE ATENÇÃO/i.test(x.textContent));if(attention)attention.insertAdjacentElement('afterend',b);else bar.prepend(b);}
    }
  }

  window.manualStatus=function(){
    const o=state?.activeOs;if(!o?.id)return toast('Nenhuma OS aberta.','err');if(!roleAllowed())return toast('Seu perfil não possui permissão para alterar a situação manualmente.','err');closeModal();
    const overlay=document.createElement('div');overlay.id='vxStatusModal';overlay.style.cssText='position:fixed;inset:0;background:rgba(8,30,50,.34);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;';
    const card=document.createElement('div');card.style.cssText='width:min(470px,100%);background:#fff;border:1px solid #cbd7e3;box-shadow:0 16px 42px rgba(0,0,0,.22);padding:18px;';
    card.innerHTML='<div style="font-size:15px;font-weight:700;color:#12324e;margin-bottom:5px">ALTERAR SITUAÇÃO DA O.S.</div><div id="vxStatusCurrent" style="font-size:12px;color:#65788b;margin-bottom:15px"></div><label style="display:block;font-size:11px;font-weight:700;color:#516579;margin-bottom:5px">NOVA SITUAÇÃO</label><select id="vxStatusSelect" style="width:100%;height:36px;border:1px solid #bdc9d5;background:#fff;padding:0 8px;margin-bottom:12px"></select><label style="display:block;font-size:11px;font-weight:700;color:#516579;margin-bottom:5px">MOTIVO</label><textarea id="vxStatusReason" placeholder="Obrigatório para regressão ou mudança fora do fluxo normal" style="width:100%;min-height:86px;resize:vertical;border:1px solid #bdc9d5;padding:8px;box-sizing:border-box"></textarea><div id="vxStatusHint" style="font-size:10px;color:#7a8c9d;margin-top:6px"></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" id="vxStatusCancel" style="height:34px;padding:0 14px;border:1px solid #c4ced8;background:#fff;color:#40566e;cursor:pointer">CANCELAR</button><button type="button" id="vxStatusConfirm" style="height:34px;padding:0 14px;border:0;background:#0b6f3c;color:#fff;font-weight:700;cursor:pointer">CONFIRMAR ALTERAÇÃO</button></div>';
    overlay.appendChild(card);document.body.appendChild(overlay);
    const current=o.status;card.querySelector('#vxStatusCurrent').textContent='Situação atual: '+labelOf(current);const select=card.querySelector('#vxStatusSelect');FLOW.forEach(([value,label])=>{const op=document.createElement('option');op.value=value;op.textContent=label;if(value===current)op.selected=true;select.appendChild(op);});
    const reason=card.querySelector('#vxStatusReason'),hint=card.querySelector('#vxStatusHint');const idx=s=>FLOW.findIndex(x=>x[0]===s);const needsReason=()=>{const a=idx(current),b=idx(select.value);return a<0||b<0||b<a||b>a+1;};const refreshHint=()=>{hint.textContent=needsReason()?'Esta mudança exige motivo para auditoria.':'Motivo opcional para esta mudança.';reason.style.borderColor=needsReason()?'#d79b46':'#bdc9d5';};select.onchange=refreshHint;refreshHint();card.querySelector('#vxStatusCancel').onclick=closeModal;overlay.onclick=e=>{if(e.target===overlay)closeModal();};
    card.querySelector('#vxStatusConfirm').onclick=async function(){const next=select.value,why=String(reason.value||'').trim();if(next===current)return toast('Selecione uma situação diferente da atual.','err');if(needsReason()&&!why){reason.focus();return toast('Informe o motivo desta alteração de situação.','err');}this.disabled=true;this.textContent='SALVANDO...';try{const now=new Date().toISOString();await api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:next,updated_at:now})});await api('os_status_history',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({service_order_id:o.id,previous_status:current,new_status:next,change_type:'MANUAL',reason:why||null,changed_by:state?.session?.user?.id||null,changed_at:now})});o.status=next;const core=state.orders?.find(x=>x.id===o.id);if(core)core.status=next;closeModal();toast('Situação da OS alterada para '+labelOf(next)+'.');await render('os:'+o.id);}catch(err){this.disabled=false;this.textContent='CONFIRMAR ALTERAÇÃO';toast('Falha ao alterar situação: '+err.message,'err');}};
  };

  const baseDetail=window.renderOsDetail;if(typeof baseDetail==='function')window.renderOsDetail=async function(){const r=await baseDetail.apply(this,arguments);injectStatus();return r;};
})();
