/* VoxAssist V0.8.13 — extensão Whirlpool dentro da OS + impressão revisada */
(function(){
  const E=window.esc||((v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const norm=v=>String(v||'').toUpperCase().trim();
  const isWhirlpool=o=>['WHIRLPOOL','BRASTEMP','CONSUL'].includes(norm(o?.manufacturer))||['WHIRLPOOL','BRASTEMP','CONSUL'].includes(norm(o?.equipments?.brand))||norm(o?.equipments?.document_model)==='WHIRLPOOL';
  const brDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'';
  const val=(obj,key,fallback='')=>obj?.[key]??fallback;

  async function loadBundle(id){
    const [osRows,impRows,appRows,parts,finRows,brand]=await Promise.all([
      api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`),
      api(`manufacturer_imports?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`appointments?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`).catch(()=>[]),
      api(`os_financial?service_order_id=eq.${id}&select=*&limit=1`).catch(()=>[]),
      typeof window.getActiveCompanyBranding==='function'?window.getActiveCompanyBranding():Promise.resolve(null)
    ]);
    return {o:osRows?.[0],imp:impRows?.[0],appt:appRows?.[0],parts:parts||[],fin:finRows?.[0]||{},brand:brand||{}};
  }

  function input(label,name,value,wide=false){return `<label class="${wide?'wide':''}"><span>${label}</span><input name="${name}" value="${E(value||'')}"></label>`}
  function text(label,name,value,wide=true){return `<label class="${wide?'wide':''}"><span>${label}</span><textarea name="${name}">${E(value||'')}</textarea></label>`}

  async function injectWhirlpoolTab(){
    const o=state?.activeOs;if(!o||!isWhirlpool(o))return;
    const tabs=document.querySelector('.vx-os-tabs');if(!tabs||tabs.querySelector('[data-section="whirlpool"]'))return;
    const b=document.createElement('button');b.dataset.section='whirlpool';b.textContent='WHIRLPOOL';b.className='vx-whirlpool-tab';
    b.onclick=()=>showWhirlpoolPanel(o.id);tabs.appendChild(b);
    const head=document.querySelector('.vx-os-head-left');if(head&&!head.querySelector('.vx-whirlpool-badge')){const badge=document.createElement('span');badge.className='vx-whirlpool-badge';badge.textContent=`${norm(o.manufacturer)||norm(o.equipments?.brand)||'WHIRLPOOL'} • OS FABRICANTE`;head.appendChild(badge)}
  }

  async function showWhirlpoolPanel(id){
    document.querySelectorAll('.vx-os-panel').forEach(p=>p.classList.add('hidden'));
    document.querySelectorAll('.vx-os-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.section==='whirlpool'));
    let panel=document.querySelector('#vx-whirlpool');if(!panel){panel=document.createElement('section');panel.id='vx-whirlpool';panel.className='vx-os-panel';document.querySelector('#app')?.appendChild(panel)}panel.classList.remove('hidden');panel.innerHTML='<div class="vx-screen-box">Carregando modo Whirlpool...</div>';
    const d=await loadBundle(id),o=d.o,p=d.imp?.extracted_data||{},c=o?.clients||{},e=o?.equipments||{},a=d.appt||{};
    panel.innerHTML=`<div class="vx-screen-box"><div class="vx-wp-head"><div><h3>MODO WHIRLPOOL • BRASTEMP / CONSUL</h3><small>Extensão da OS VoxAssist. Dashboard, Agenda, Financeiro e Histórico continuam usando a mesma OS.</small></div><button class="vx-action" id="vxWpPrint">IMPRIMIR DOCUMENTO WHIRLPOOL</button></div>
      <form id="vxWpForm" class="vx-wp-grid">
        ${input('Nº OS FABRICANTE','numeroOS',o.manufacturer_os_number||o.os_number)}${input('MARCA','marca',p.manufacturer||e.brand)}${input('TÉCNICO','tecnico',o.profiles?.full_name||'')}
        ${input('DATA AGENDA','dataAgenda',a.appointment_date||p.dataAgenda)}${input('PERÍODO','periodo',a.period||p.periodo)}${input('TIPO AGENDA','tipoAgenda',p.tipoAgenda)}
        ${input('CONSUMIDOR','consumidor',p.cliente||c.name,true)}${input('CPF/CNPJ','cnpjCpf',p.documento||c.document)}${input('TELEFONE','foneResidencia',p.telefone||c.phone_primary)}
        ${input('ENDEREÇO','endereco',p.endereco||c.address,true)}${input('COMPLEMENTO','complemento',p.complemento||c.complement)}${input('BAIRRO','bairro',p.bairro||c.neighborhood)}${input('CIDADE','cidade',p.cidade||c.city)}${input('UF','uf',p.uf||c.state)}${input('CEP','cep',p.cep||c.zip_code)}
        ${input('PRODUTO','produto',p.productLine||e.product_type,true)}${input('LINHA','linha',p.linha||e.product_type)}${input('SÉRIE','serie',p.serie||e.serial_number)}${input('TIPO DE OS','tipoOS',p.tipoOS||o.order_type)}${input('NOTA FISCAL','nrNotaFiscal',p.notaFiscal||e.invoice_number)}${input('DATA COMPRA','dataCompra',p.dataCompra||e.purchase_date)}
        ${text('DEFEITO RECLAMADO','defeitoReclamado',p.defeitoReclamado||o.reported_defect)}${text('DEFEITO CONSTATADO','defeitoConstatado',p.defeitoConstatado||o.diagnosed_defect)}${text('RECLAMAÇÃO / ATENDIMENTO','reclamacaoAtendimento',p.reclamacao||o.technical_service)}${text('LAUDO TÉCNICO','laudoTecnico',p.laudoTecnico||o.technical_service)}${text('OBSERVAÇÃO DO DOCUMENTO WHIRLPOOL','observacao',p.observacao||'')}
        <div class="wide vx-wp-note">Os dados acima pertencem ao documento Whirlpool. Alterações salvas aqui também atualizam os campos equivalentes da OS principal quando aplicável.</div>
        <div class="wide vx-wp-actions"><button type="button" class="vx-action parts" id="vxWpSave">SALVAR MODO WHIRLPOOL</button><button type="button" class="vx-action" id="vxWpOpenOriginal" ${d.imp?.original_file_data?'':'disabled'}>ABRIR PDF ORIGINAL</button></div>
      </form></div>`;
    document.querySelector('#vxWpSave').onclick=()=>saveWhirlpool(id,d.imp?.id);
    document.querySelector('#vxWpPrint').onclick=()=>window.vxPrintOsDocument('whirlpool');
    document.querySelector('#vxWpOpenOriginal').onclick=()=>{if(d.imp?.original_file_data)window.open(d.imp.original_file_data,'_blank')};
  }

  async function saveWhirlpool(id,importId){
    const f=document.querySelector('#vxWpForm');if(!f)return;const fd=new FormData(f),data=Object.fromEntries(fd.entries());
    try{
      const o=state.activeOs;
      await api(`service_orders?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({reported_defect:data.defeitoReclamado||null,diagnosed_defect:data.defeitoConstatado||null,technical_service:data.laudoTecnico||data.reclamacaoAtendimento||null,manufacturer_os_number:data.numeroOS||o.manufacturer_os_number,updated_at:new Date().toISOString()})});
      if(importId)await api(`manufacturer_imports?id=eq.${importId}`,{method:'PATCH',body:JSON.stringify({extracted_data:{...(await api(`manufacturer_imports?id=eq.${importId}&select=extracted_data`))?.[0]?.extracted_data,...data},updated_at:new Date().toISOString()})});
      else await api('manufacturer_imports',{method:'POST',body:JSON.stringify({company_id:o.company_id,manufacturer:norm(o.manufacturer)||'WHIRLPOOL',service_order_id:id,extracted_data:data,import_status:'MANUAL',created_by:state.session?.user?.id})});
      toast('Modo Whirlpool salvo. A OS principal continua vinculada ao Dashboard e à Agenda.');state.activeOs={...state.activeOs,reported_defect:data.defeitoReclamado,diagnosed_defect:data.defeitoConstatado,technical_service:data.laudoTecnico};
    }catch(e){toast('Falha ao salvar modo Whirlpool: '+e.message,'err')}
  }

  function printShell(title,body){
    const w=window.open('','_blank','width=1000,height=800');if(!w)return toast('O navegador bloqueou a janela de impressão.','err');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${E(title)}</title><style>@page{size:A4;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10px}.doc{width:100%}.head{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border-bottom:2px solid #163754;padding-bottom:8px;margin-bottom:8px}.head img{max-width:130px;max-height:60px}.osno{font-size:21px;font-weight:800;color:#163754}.muted{color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.box{border:1px solid #9aa9b8;border-radius:4px;padding:7px;margin-bottom:7px}.box h3{font-size:10px;margin:0 0 5px;color:#163754}.row{display:grid;grid-template-columns:130px 1fr;border-bottom:1px solid #e3e8ed;padding:3px 0}.row:last-child{border:0}.row b{font-size:8px}.wp table{width:100%;border-collapse:collapse;margin:0 0 3px}.wp td,.wp th{border:1px solid #111;padding:3px;font-size:8px;vertical-align:top}.wp th{background:#f2f2f2}.wp .title{font-weight:800;text-align:center}.sign{height:52px;border-top:1px solid #777;margin-top:24px;text-align:center;padding-top:4px}.footer{font-size:8px;text-align:center;margin-top:8px;color:#5d6b78}@media print{button{display:none!important}}</style></head><body>${body}<script>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close();
  }

  async function printVox(id){const d=await loadBundle(id),o=d.o,c=o.clients||{},e=o.equipments||{},b=d.brand||{},parts=d.parts||[],fin=d.fin||{};const partsTotal=parts.reduce((s,p)=>s+Number(p.quantity||0)*Number(p.unit_value||0),0),total=partsTotal+Number(fin.labor_value||0)+Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0)-Number(fin.discount_value||0);const body=`<div class="doc"><div class="head"><div>${b.logo_url?`<img src="${E(b.logo_url)}">`:''}<div><b>${E(b.trade_name||b.legal_name||'VOXASSIST')}</b></div><div class="muted">${E([b.address,b.address_number,b.city,b.state].filter(Boolean).join(' • '))}</div><div class="muted">${E([b.phone,b.mobile,b.email].filter(Boolean).join(' • '))}</div></div><div><div class="muted">ORDEM DE SERVIÇO</div><div class="osno">${E(o.os_number)}</div><div>${E(String(o.status||'').replaceAll('_',' '))}</div></div></div><div class="grid"><div class="box"><h3>CLIENTE</h3><div class="row"><b>NOME</b><span>${E(c.name)}</span></div><div class="row"><b>CPF/CNPJ</b><span>${E(c.document)}</span></div><div class="row"><b>TELEFONE</b><span>${E(c.phone_primary)}</span></div><div class="row"><b>ENDEREÇO</b><span>${E([c.address,c.address_number,c.complement,c.neighborhood,c.city,c.state].filter(Boolean).join(', '))}</span></div></div><div class="box"><h3>EQUIPAMENTO</h3><div class="row"><b>PRODUTO</b><span>${E(e.product_type)}</span></div><div class="row"><b>MARCA / MODELO</b><span>${E([e.brand,e.model].filter(Boolean).join(' • '))}</span></div><div class="row"><b>SÉRIE</b><span>${E(e.serial_number)}</span></div><div class="row"><b>ATENDIMENTO</b><span>${E(o.service_type)}</span></div></div></div><div class="box"><h3>ATENDIMENTO TÉCNICO</h3><div class="row"><b>DEFEITO RELATADO</b><span>${E(o.reported_defect)}</span></div><div class="row"><b>DEFEITO CONSTATADO</b><span>${E(o.diagnosed_defect)}</span></div><div class="row"><b>SERVIÇO / LAUDO</b><span>${E(o.technical_service)}</span></div></div><div class="box"><h3>ORÇAMENTO</h3><div class="row"><b>PEÇAS</b><span>${money(partsTotal)}</span></div><div class="row"><b>MÃO DE OBRA</b><span>${money(fin.labor_value||0)}</span></div><div class="row"><b>TOTAL</b><span><strong>${money(total)}</strong></span></div></div><div class="grid"><div class="sign">ASSINATURA DO CLIENTE</div><div class="sign">ASSINATURA DO TÉCNICO</div></div><div class="footer">${E(b.document_footer||b.document_header_note||'')}</div></div>`;printShell('OS '+o.os_number,body)}

  async function printWhirlpool(id){const d=await loadBundle(id),o=d.o,p=d.imp?.extracted_data||{},c=o.clients||{},e=o.equipments||{},a=d.appt||{},parts=d.parts||[];const body=`<div class="doc wp"><table><tr><td style="width:70%"><b>AUTORIZADA:</b> ${E(d.brand.trade_name||d.brand.legal_name||'VOX')}<br>${E([d.brand.address,d.brand.address_number,d.brand.city,d.brand.state].filter(Boolean).join(' • '))}<br>FONE: ${E(d.brand.phone||d.brand.mobile)}</td><td><b>CENTRAL DE ATENDIMENTO WHIRLPOOL</b></td></tr></table><table><tr><td class="title">NÚMERO DA OS<br><b style="font-size:14px">${E(o.manufacturer_os_number||o.os_number)}</b></td><td>TÉCNICO<br>${E(o.profiles?.full_name||'')}</td><td>DATA AGENDA: ${E(brDate(a.appointment_date||p.dataAgenda))}<br>PERÍODO: ${E(a.period||p.periodo||'')}</td></tr></table><table><tr><td>CONSUMIDOR: ${E(p.cliente||c.name)}</td><td>CPF/CNPJ: ${E(p.documento||c.document)}</td></tr><tr><td>ENDEREÇO: ${E(p.endereco||c.address)}</td><td>CEP: ${E(p.cep||c.zip_code)}</td></tr><tr><td>BAIRRO: ${E(p.bairro||c.neighborhood)}</td><td>CIDADE/UF: ${E((p.cidade||c.city)+' / '+(p.uf||c.state||''))}</td></tr><tr><td colspan="2">TELEFONE: ${E(p.telefone||c.phone_primary)}</td></tr></table><table><tr><td>PRODUTO: ${E(p.productLine||e.product_type)}</td><td>MARCA: ${E(p.manufacturer||e.brand)}</td></tr><tr><td>SÉRIE: ${E(p.serie||e.serial_number)}</td><td>TIPO DE OS: ${E(p.tipoOS||o.order_type)}</td></tr></table><table><tr><th>DEFEITO RECLAMADO</th><td>${E(p.defeitoReclamado||o.reported_defect)}</td><th>DEFEITO CONSTATADO</th><td>${E(p.defeitoConstatado||o.diagnosed_defect)}</td></tr><tr><th>RECLAMAÇÃO / ATENDIMENTO</th><td colspan="3">${E(p.reclamacaoAtendimento||p.reclamacao||'')}</td></tr><tr><th>LAUDO TÉCNICO</th><td colspan="3" style="height:55px">${E(p.laudoTecnico||o.technical_service||'')}</td></tr></table><table><thead><tr><th>QTD</th><th>CÓDIGO</th><th>DESCRIÇÃO DA PEÇA</th><th>VALOR</th></tr></thead><tbody>${Array.from({length:Math.max(8,parts.length)}).map((_,i)=>{const x=parts[i]||{};return `<tr><td>${E(x.quantity||'')}</td><td>${E(x.part_code||x.code||'')}</td><td>${E(x.description||'')}</td><td>${x.unit_value?money(x.unit_value):''}</td></tr>`}).join('')}</tbody></table><table><tr><td style="height:48px"><b>OBSERVAÇÃO</b><br>${E(p.observacao||'')}</td></tr></table><div class="grid"><div class="sign">ASSINATURA DO CONSUMIDOR</div><div class="sign">ASSINATURA DO TÉCNICO</div></div></div>`;printShell('Whirlpool OS '+(o.manufacturer_os_number||o.os_number),body)}

  window.vxPrintOsDocument=async function(kind='auto'){
    const o=state?.activeOs;if(!o)return toast('Abra uma OS antes de imprimir.','err');
    if(kind==='whirlpool')return printWhirlpool(o.id);
    if(kind==='vox')return printVox(o.id);
    if(isWhirlpool(o)){
      const useWp=confirm('Esta é uma OS Whirlpool (Brastemp/Consul).\n\nOK = imprimir documento Whirlpool\nCancelar = imprimir modelo padrão VoxAssist');
      return useWp?printWhirlpool(o.id):printVox(o.id);
    }
    return printVox(o.id);
  };
  window.printOs=()=>window.vxPrintOsDocument('auto');

  const base=window.renderOsDetail;
  if(typeof base==='function')window.renderOsDetail=async function(){const r=await base.apply(this,arguments);setTimeout(injectWhirlpoolTab,100);return r};
  setTimeout(injectWhirlpoolTab,500);

  const st=document.createElement('style');st.textContent=`.vx-whirlpool-badge{font-size:9px;font-weight:800;color:#7a4a00;background:#fff4d6;border:1px solid #f1c86b;border-radius:12px;padding:5px 9px}.vx-whirlpool-tab{color:#8a5200!important}.vx-wp-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.vx-wp-head h3{margin:0;color:#17324e}.vx-wp-head small{font-size:9px;color:#718397}.vx-wp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.vx-wp-grid label{display:grid;gap:4px;font-size:9px;font-weight:700;color:#5f7183}.vx-wp-grid input,.vx-wp-grid textarea{border:1px solid #ccd7e2;border-radius:5px;padding:7px;font-size:10px}.vx-wp-grid textarea{min-height:70px;resize:vertical}.vx-wp-grid .wide{grid-column:1/-1}.vx-wp-note{background:#fff8e6;border:1px solid #eed39a;padding:9px;border-radius:6px;font-size:9px;color:#715416}.vx-wp-actions{display:flex;gap:8px}@media(max-width:900px){.vx-wp-grid{grid-template-columns:1fr}}`;document.head.appendChild(st);
})();