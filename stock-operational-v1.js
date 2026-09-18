/* VoxAssist — Estoque Operacional V1 (2026-09-16)
   Liga a tela de Estoque ao motor canônico já existente: stock_balances,
   stock_movements e RPCs stock_register_entry/stock_withdraw/stock_return.
   Não altera saldo direto em stock_items. */
(function(){
  const E=v=>window.esc?esc(v):String(v??'');
  const N=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
  const uid=()=>state?.session?.user?.id;
  const cid=()=>state?.profile?.active_company_id;
  const key=p=>`${p}-${uid()||'u'}-${Date.now()}-${crypto?.randomUUID?.()||Math.random().toString(36).slice(2)}`;
  async function rpc(name,body){return api(`rpc/${name}`,{method:'POST',body:JSON.stringify(body)});}
  async function reload(){
    const [items,locs,bals,movs,techs,orders]=await Promise.all([
      api('stock_items?select=*&order=description').catch(()=>[]),
      api('stock_locations?active=eq.true&select=*&order=sort_order,name').catch(()=>[]),
      api('stock_balances?select=*,stock_items(code,description),stock_locations(name),stock_positions(code)&order=updated_at.desc').catch(()=>[]),
      api('stock_movements?select=*&order=created_at.desc&limit=100').catch(()=>[]),
      api('profiles?active=eq.true&role=eq.TECNICO&select=id,full_name&order=full_name').catch(()=>[]),
      api('service_orders?select=id,os_number,status&order=opened_at.desc&limit=150').catch(()=>[])
    ]);
    return {items,locs,bals,movs,techs,orders};
  }
  function opts(rows,label){return rows.map(x=>`<option value="${E(x.id)}">${E(label(x))}</option>`).join('');}
  function modal(title,html,onSubmit){
    document.querySelector('#vxStockOpModal')?.remove();
    const o=document.createElement('div');o.id='vxStockOpModal';o.className='vx-stock-overlay';
    o.innerHTML=`<div class="vx-stock-modal"><div class="vx-stock-modal-head"><h3>${E(title)}</h3><button type="button" data-close>×</button></div><form>${html}<div class="vx-stock-actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary">Confirmar</button></div></form></div>`;
    document.body.appendChild(o);o.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>o.remove());
    o.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await onSubmit(new FormData(e.target));o.remove();toast('Movimentação registrada.');await window.renderStock();}catch(err){toast(err.message,'err');b.disabled=false;}};
  }
  window.renderStock=async function(){
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML='<div class="card"><p>Carregando estoque...</p></div>';
    const d=await reload();state.stock=d.items;
    const available=d.bals.filter(b=>b.state==='DISPONIVEL').reduce((s,b)=>s+Number(b.quantity||0),0);
    const quarantine=d.bals.filter(b=>b.state==='QUARENTENA').reduce((s,b)=>s+Number(b.quantity||0),0);
    app.innerHTML=`<div class="vx-stock-head"><div><h2>Estoque</h2><p>Saldo físico por local e posição, com rastreabilidade de cada movimentação.</p></div><button class="secondary" id="vxStockRefresh">↻ Atualizar</button></div>
    <div class="vx-stock-metrics"><div><span>Peças cadastradas</span><b>${d.items.length}</b></div><div><span>Disponível</span><b>${N(available)}</b></div><div><span>Quarentena</span><b>${N(quarantine)}</b></div><div><span>Movimentos recentes</span><b>${d.movs.length}</b></div></div>
    <div class="vx-stock-ops"><button class="primary" data-op="entry">+ Entrada</button><button class="secondary" data-op="withdraw">− Saída</button><button class="secondary" data-op="return">↩ Devolução</button><button class="secondary" data-op="apply">✓ Aplicar em OS</button><button class="secondary" data-op="tech">👤 Estoque dos técnicos</button><button class="secondary" data-op="moves">☷ Movimentações</button></div>
    <div class="card"><div class="section-title"><h3>Saldo por posição</h3><input id="vxStockSearch" placeholder="Buscar código, peça, local ou posição"></div><div class="table-wrap"><table><thead><tr><th>Código</th><th>Descrição</th><th>Local</th><th>Posição</th><th>Estado</th><th>Quantidade</th></tr></thead><tbody id="vxStockRows">${d.bals.map(b=>`<tr><td><b>${E(b.stock_items?.code||'—')}</b></td><td>${E(b.stock_items?.description||'—')}</td><td>${E(b.stock_locations?.name||'—')}</td><td>${E(b.stock_positions?.code||'—')}</td><td>${E(b.state)}</td><td><b>${N(b.quantity)}</b></td></tr>`).join('')||'<tr><td colspan="6">Nenhum saldo físico registrado.</td></tr>'}</tbody></table></div></div>`;
    document.querySelector('#vxStockRefresh').onclick=()=>window.renderStock();
    document.querySelector('#vxStockSearch').oninput=e=>{const q=String(e.target.value).toUpperCase();document.querySelectorAll('#vxStockRows tr').forEach(r=>r.style.display=r.innerText.toUpperCase().includes(q)?'':'none');};
    document.querySelectorAll('[data-op]').forEach(b=>b.onclick=()=>openOp(b.dataset.op,d));
  };
  function common(d){return `<label>PEÇA *</label><select name="item" required><option value="">Selecione...</option>${opts(d.items,x=>`${x.code} — ${x.description}`)}</select><label>LOCAL *</label><select name="location" required><option value="">Selecione...</option>${opts(d.locs,x=>x.name)}</select><label>POSIÇÃO *</label><input name="position" required placeholder="EX.: A-01"><label>QUANTIDADE *</label><input name="qty" type="number" min="0.01" step="0.01" value="1" required><label>OBSERVAÇÃO</label><textarea name="notes" rows="2"></textarea>`;}
  function openOp(op,d){
    if(op==='entry')return modal('Entrada de estoque',common(d),async f=>rpc('stock_register_entry',{p_stock_item_id:f.get('item'),p_location_id:f.get('location'),p_position_code:String(f.get('position')).trim(),p_quantity:Number(f.get('qty')),p_notes:String(f.get('notes')||''),p_idempotency_key:key('entry')}));
    if(op==='withdraw')return modal('Saída de estoque',common(d)+`<label>DESTINO *</label><select name="dest" required><option value="OS">Ordem de Serviço</option><option value="TECNICO">Técnico</option></select><label>OS</label><select name="os"><option value="">—</option>${opts(d.orders,x=>`${x.os_number} — ${x.status}`)}</select><label>TÉCNICO</label><select name="tech"><option value="">—</option>${opts(d.techs,x=>x.full_name)}</select>`,async f=>{const dest=f.get('dest');return rpc('stock_withdraw',{p_stock_item_id:f.get('item'),p_location_id:f.get('location'),p_position_code:String(f.get('position')).trim(),p_quantity:Number(f.get('qty')),p_destination:dest,p_service_order_id:dest==='OS'?(f.get('os')||null):null,p_os_part_id:null,p_technician_id:dest==='TECNICO'?(f.get('tech')||null):null,p_notes:String(f.get('notes')||''),p_idempotency_key:key('withdraw')});});
    if(op==='return'){const withdrawals=d.movs.filter(x=>x.movement_type==='WITHDRAWAL');return modal('Devolução ao estoque',`<label>RETIRADA ORIGINAL *</label><select name="movement" required><option value="">Selecione...</option>${withdrawals.map(x=>`<option value="${E(x.id)}">${E(x.id.slice(0,8))} · Qtd ${N(x.quantity)}</option>`).join('')}</select><label>QUANTIDADE *</label><input name="qty" type="number" min="0.01" step="0.01" value="1" required><label>CONDIÇÃO *</label><select name="condition"><option value="DISPONIVEL">Disponível</option><option value="QUARENTENA">Quarentena</option></select><label>OBSERVAÇÃO</label><textarea name="notes"></textarea>`,async f=>rpc('stock_return',{p_movement_id:f.get('movement'),p_quantity:Number(f.get('qty')),p_condition:f.get('condition'),p_notes:String(f.get('notes')||''),p_idempotency_key:key('return')}));}
    if(op==='apply')return modal('Aplicar peça do técnico em OS',`<label>TÉCNICO *</label><select name="tech" required><option value="">Selecione...</option>${opts(d.techs,x=>x.full_name)}</select><label>PEÇA *</label><select name="item" required><option value="">Selecione...</option>${opts(d.items,x=>`${x.code} — ${x.description}`)}</select><label>QUANTIDADE *</label><input name="qty" type="number" min="0.01" step="0.01" value="1" required><label>OS *</label><select name="os" required><option value="">Selecione...</option>${opts(d.orders,x=>`${x.os_number} — ${x.status}`)}</select><label>OBSERVAÇÃO</label><textarea name="notes"></textarea>`,async f=>rpc('stock_apply',{p_technician_id:f.get('tech'),p_stock_item_id:f.get('item'),p_quantity:Number(f.get('qty')),p_service_order_id:f.get('os'),p_os_part_id:null,p_notes:String(f.get('notes')||''),p_idempotency_key:key('apply')}));
    if(op==='moves'){const rows=d.movs.slice(0,100);return modal('Movimentações recentes',`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Qtd.</th><th>Obs.</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${E(new Date(x.created_at).toLocaleString('pt-BR'))}</td><td>${E(x.movement_type)}</td><td>${N(x.quantity)}</td><td>${E(x.notes||'—')}</td></tr>`).join('')}</tbody></table></div>`,async()=>{});}
    if(op==='tech')return showTech();
  }
  async function showTech(){const rows=await api('technician_stock?select=*,profiles(full_name),stock_items(code,description)&quantity=gt.0&order=updated_at.desc').catch(()=>[]);modal('Estoque dos técnicos',`<div class="table-wrap"><table><thead><tr><th>Técnico</th><th>Peça</th><th>Quantidade</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${E(x.profiles?.full_name||'—')}</td><td>${E(x.stock_items?.code||'')} — ${E(x.stock_items?.description||'')}</td><td>${N(x.quantity)}</td></tr>`).join('')||'<tr><td colspan="3">Nenhuma peça em custódia.</td></tr>'}</tbody></table></div>`,async()=>{});}
})();