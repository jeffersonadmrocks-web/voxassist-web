/* VoxAssist — Impressão profissional da Ordem de Serviço v1
 * Camada visual isolada. Substitui apenas window.printOs e consulta os
 * mesmos dados da OS aberta. Não altera OS, financeiro, status ou histórico.
 */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const M=v=>typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const D=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
  const status=v=>String(v||'—').replaceAll('_',' ');
  const joinAddress=c=>[c?.address,c?.address_number,c?.complement,c?.neighborhood,c?.city,c?.state].filter(Boolean).join(', ');
  const row=(label,value)=>`<div class="vxpr-row"><span>${E(label)}</span><b>${E(value||'—')}</b></div>`;
  const textBlock=(label,value)=>`<div class="vxpr-text"><span>${E(label)}</span><p>${E(value||'—')}</p></div>`;

  async function hydrate(o){
    const id=o?.id;if(!id)return {o};
    const [orders,parts,fin,stores,profiles]=await Promise.all([
      api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)&limit=1`).catch(()=>[]),
      api(`os_parts?service_order_id=eq.${id}&select=*`).catch(()=>[]),
      api(`os_financial?service_order_id=eq.${id}&select=*&limit=1`).catch(()=>[]),
      api(`stores?select=*`).catch(()=>[]),
      api(`profiles?select=id,full_name`).catch(()=>[])
    ]);
    const full=orders?.[0]||o;
    return {o:full,c:full.clients||o.clients||{},e:full.equipments||o.equipments||{},parts:parts||[],fin:fin?.[0]||{},stores:stores||[],profiles:profiles||[]};
  }

  function partRows(parts){
    if(!parts.length)return `<tr><td colspan="5" class="vxpr-empty">Nenhuma peça lançada.</td></tr>`;
    return parts.map(p=>{const q=Number(p.quantity||1),u=Number(p.unit_value||0);return `<tr><td>${E(p.code||'—')}</td><td>${E(p.description||'—')}</td><td class="num">${q}</td><td class="num">${M(u)}</td><td class="num"><b>${M(q*u)}</b></td></tr>`}).join('');
  }

  function html(x){
    const {o,c,e,parts,fin,stores}=x;
    const store=stores.find(s=>String(s.id)===String(o.store_id))||{};
    const partsTotal=parts.reduce((s,p)=>s+Number(p.quantity||1)*Number(p.unit_value||0),0);
    const labor=Number(fin.labor_value||0),discount=Number(fin.discount_value||0),total=partsTotal+labor-discount;
    const companyName=store.name||state?.profile?.active_company_name||'VOX';
    const contact=[store.phone,store.email].filter(Boolean).join(' • ');
    const storeAddress=[store.address,store.address_number,store.neighborhood,store.city,store.state].filter(Boolean).join(', ');
    const opened=o.opened_at?D(o.opened_at):'—';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OS ${E(o.os_number)}</title><style>
      @page{size:A4;margin:10mm}
      *{box-sizing:border-box}body{margin:0;background:#eef2f6;color:#17283a;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .sheet{width:190mm;min-height:277mm;margin:12px auto;background:#fff;padding:0 0 10mm;box-shadow:0 5px 22px rgba(20,40,60,.12)}
      .top{display:grid;grid-template-columns:1fr 63mm;min-height:31mm;border-bottom:3px solid #ef8b17}
      .brand{background:#0b365b;color:#fff;padding:7mm 7mm 5mm}.brandmark{font-size:22px;font-weight:900;letter-spacing:-.6px}.brandmark em{font-style:normal;color:#f3a12b}.brand h2{font-size:11px;margin:2mm 0 1mm;text-transform:uppercase}.brand p{margin:.8mm 0;color:#d9e6f0;font-size:8.5px;line-height:1.35}
      .osid{padding:6mm 6mm 4mm;text-align:right;background:#f7f9fc}.osid span{display:block;font-size:8px;font-weight:800;letter-spacing:1.1px;color:#6a7887;text-transform:uppercase}.osid strong{display:block;color:#0b365b;font-size:25px;line-height:1.05;margin:1mm 0 2mm}.status{display:inline-block;border:1px solid #b9c8d7;background:#fff;border-radius:12px;padding:1.3mm 3mm;font-size:8px;font-weight:800;text-transform:uppercase;color:#0b365b}.opened{display:block;margin-top:2mm;color:#6b7885;font-size:8px}
      .content{padding:5mm 6mm 0}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:4mm}.card{border:1px solid #cdd8e3;border-radius:2.5mm;overflow:hidden;background:#fff}.card-title{background:#eef3f8;color:#0b365b;padding:2.2mm 3mm;font-size:8.5px;font-weight:900;letter-spacing:.35px;text-transform:uppercase;border-bottom:1px solid #d8e1ea}.card-body{padding:2.5mm 3mm}.vxpr-row{display:grid;grid-template-columns:29mm 1fr;gap:2mm;padding:1.35mm 0;border-bottom:1px solid #edf1f4;align-items:start}.vxpr-row:last-child{border-bottom:0}.vxpr-row span,.vxpr-text span{font-size:7.2px;font-weight:800;color:#68798a;text-transform:uppercase}.vxpr-row b{font-size:9px;line-height:1.3;color:#1a2e42}.vxpr-text{padding:2.5mm 3mm;border-bottom:1px solid #e5ebf0}.vxpr-text:last-child{border-bottom:0}.vxpr-text p{margin:1.3mm 0 0;font-size:10px;line-height:1.45;white-space:pre-wrap;min-height:7mm}.technical{margin-bottom:4mm}.technical .card-body{padding:0}.technical-grid{display:grid;grid-template-columns:1fr 1fr}.technical-grid .vxpr-text:nth-child(odd){border-right:1px solid #e5ebf0}.technical-grid .wide{grid-column:1/-1;border-right:0!important}
      .parts{margin-bottom:4mm}table{width:100%;border-collapse:collapse}th{background:#f6f8fb;color:#637486;font-size:7px;text-transform:uppercase;text-align:left;padding:2mm}td{padding:2mm;border-top:1px solid #e5ebf0;font-size:8.5px}th.num,td.num{text-align:right}.vxpr-empty{text-align:center;color:#7a8794;padding:4mm}
      .financial{display:grid;grid-template-columns:1fr 67mm;gap:4mm;margin-bottom:5mm}.notes{border:1px solid #d7e0e9;border-radius:2.5mm;padding:3mm;min-height:22mm}.notes span{font-size:7.5px;text-transform:uppercase;font-weight:800;color:#68798a}.notes p{margin:2mm 0 0;line-height:1.45;white-space:pre-wrap}.totals{border:1px solid #b8c8d7;border-radius:2.5mm;overflow:hidden}.total-row{display:flex;justify-content:space-between;padding:2.2mm 3mm;border-bottom:1px solid #e3e9ef}.total-row span{color:#66788a;font-size:8px;font-weight:700}.total-row b{font-size:9px}.total-row.grand{background:#0b365b;color:#fff;padding:3mm}.total-row.grand span,.total-row.grand b{color:#fff}.total-row.grand b{font-size:15px}
      .signatures{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:13mm}.sig{text-align:center;border-top:1px solid #526273;padding-top:2mm;color:#536476;font-size:8px}.sig b{display:block;color:#1c2e40;margin-bottom:.8mm}.footer{margin:8mm 6mm 0;padding-top:3mm;border-top:1px solid #dfe5eb;display:flex;justify-content:space-between;gap:8mm;color:#718090;font-size:7px;line-height:1.4}.footer strong{color:#0b365b}.toolbar{width:190mm;margin:12px auto 0;display:flex;justify-content:flex-end;gap:8px}.toolbar button{border:0;border-radius:7px;padding:9px 15px;font-weight:700;cursor:pointer}.toolbar .primary{background:#1767d9;color:#fff}.toolbar .secondary{background:#fff;color:#25394d;border:1px solid #cbd6e1}
      @media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;box-shadow:none;width:auto;min-height:auto}.content{padding-left:0;padding-right:0}.top{margin-left:0;margin-right:0}.footer{margin-left:0;margin-right:0}}
    </style></head><body><div class="toolbar"><button class="secondary" onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button></div><main class="sheet">
      <header class="top"><div class="brand"><div class="brandmark">VOX<span style="color:#f3a12b">ASSIST</span></div><h2>${E(companyName)}</h2><p>${E(storeAddress||'Assistência Técnica Especializada')}</p><p>${E(contact)}</p></div><div class="osid"><span>Ordem de Serviço</span><strong>${E(o.os_number)}</strong><div class="status">${E(status(o.status))}</div><small class="opened">Abertura: ${E(opened)}</small></div></header>
      <div class="content"><div class="grid2"><section class="card"><div class="card-title">Cliente</div><div class="card-body">${row('Nome',c.name)}${row('CPF / CNPJ',c.document)}${row('Telefone',c.phone_primary)}${row('Outro telefone',c.phone_secondary)}${row('Endereço',joinAddress(c))}</div></section><section class="card"><div class="card-title">Equipamento</div><div class="card-body">${row('Produto',e.product_type)}${row('Marca / Modelo',[e.brand,e.model].filter(Boolean).join(' • '))}${row('Nº de série',e.serial_number)}${row('Atendimento',o.service_type)}${row('Local',o.product_location)}</div></section></div>
      <section class="card technical"><div class="card-title">Atendimento técnico</div><div class="card-body"><div class="technical-grid">${textBlock('Defeito relatado',o.reported_defect)}${textBlock('Defeito constatado / diagnóstico',o.diagnosed_defect)}${textBlock('Serviço executado / laudo',o.technical_service)}${textBlock('Técnico responsável',o.profiles?.full_name||'—')}</div></div></section>
      <section class="card parts"><div class="card-title">Peças e materiais</div><table><thead><tr><th>Código</th><th>Descrição</th><th class="num">Qtd.</th><th class="num">Unitário</th><th class="num">Subtotal</th></tr></thead><tbody>${partRows(parts)}</tbody></table></section>
      <div class="financial"><div class="notes"><span>Observações ao cliente</span><p>${E(fin.notes||'Documento referente à ordem de serviço acima. Observações internas do sistema não são impressas.')}</p></div><div class="totals"><div class="total-row"><span>Peças</span><b>${M(partsTotal)}</b></div><div class="total-row"><span>Mão de obra</span><b>${M(labor)}</b></div>${discount?`<div class="total-row"><span>Desconto</span><b>− ${M(discount)}</b></div>`:''}<div class="total-row grand"><span>Total</span><b>${M(total)}</b></div></div></div>
      <div class="signatures"><div class="sig"><b>${E(c.name||'Cliente')}</b>Assinatura do cliente</div><div class="sig"><b>${E(o.profiles?.full_name||'Técnico responsável')}</b>Assinatura do técnico</div></div></div>
      <footer class="footer"><div><strong>VOXASSIST</strong><br>Ordem de Serviço ${E(o.os_number)} • emitida em ${E(new Date().toLocaleString('pt-BR'))}</div><div>Este documento não exibe observações internas/F11.</div></footer>
    </main></body></html>`;
  }

  window.printOs=async function(){
    const base=state?.activeOs;if(!base)return toast?.('Abra uma Ordem de Serviço antes de gerar o documento.','err');
    const w=window.open('','_blank');
    if(!w)return toast?.('O navegador bloqueou a janela de impressão. Libere pop-ups para o VoxAssist.','err');
    w.document.write('<!doctype html><title>Preparando OS...</title><body style="font-family:Arial;padding:30px">Preparando Ordem de Serviço...</body>');
    try{const x=await hydrate(base);w.document.open();w.document.write(html(x));w.document.close();w.focus()}catch(err){w.document.body.innerHTML='<h2>Não foi possível gerar a Ordem de Serviço</h2><p>'+E(err?.message||err)+'</p>'}
  };
})();
