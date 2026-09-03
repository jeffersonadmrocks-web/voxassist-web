/* VoxAssist Web V0.8.13 — enviar O.S./Orçamento em PDF direto pro
   WhatsApp do cliente, sem o caminho manual de "imprimir -> salvar como
   PDF -> procurar o arquivo -> anexar no Chat" (achado do usuário
   2026-09-03). Gera um PDF de verdade (jsPDF, carregado sob demanda --
   nenhuma outra tela deste app paga o custo dessa lib à toa), envia via
   chat-send-message (mesmo único ponto de despacho real já usado por
   todo o resto do Chat -- nunca fala com o gateway direto), e só marca
   como enviado depois que o WhatsApp confirmar de verdade. Documento
   pensado pro CLIENTE (resumo do orçamento), não é o mesmo modelo do
   "Gerar PDF da O.S." interno (que tem linha de assinatura pra
   impressão física, fora de escopo aqui). */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  // Achado do usuário em 2026-09-03: a versão 2.5.2 não existe mais no
  // cdnjs (404 real, confirmado) -- 4.2.1 é a versão publicada de
  // verdade lá agora (api.cdnjs.com/libraries/jspdf), confirmada
  // acessível antes de trocar.
  const JSPDF_CDN='https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js';
  const HTML2CANVAS_CDN='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  function loadScriptOnce(src){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src;
      s.onload=()=>resolve();
      s.onerror=()=>reject(new Error('Falha ao carregar biblioteca ('+src+').'));
      document.head.appendChild(s);
    });
  }
  let jspdfPromise=null;
  function ensureJsPdf(){
    if(window.jspdf?.jsPDF&&window.html2canvas)return Promise.resolve();
    if(jspdfPromise)return jspdfPromise;
    // Achado do usuário em 2026-09-03: "todos os modelos enviados por
    // WhatsApp ou impressos devem ser idênticos" -- em vez de desenhar
    // um layout novo com a API de texto do jsPDF (visual mais pobre,
    // divergente do documento já aprovado), reaproveita o MESMO
    // HTML/CSS que "Gerar PDF"/impressão já usa (printShell/printVox/
    // printWhirlpool, os-whirlpool-extension-v0813.js -- nunca
    // alterado) e renderiza via jsPDF.html() (que depende do
    // html2canvas pra rasterizar o HTML real) -- garante paridade
    // visual de verdade, não uma aproximação.
    jspdfPromise=Promise.all([
      window.jspdf?.jsPDF?Promise.resolve():loadScriptOnce(JSPDF_CDN),
      window.html2canvas?Promise.resolve():loadScriptOnce(HTML2CANVAS_CDN),
    ]).catch(e=>{jspdfPromise=null;throw e});
    return jspdfPromise;
  }

  function blobToBase64(blob){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
      reader.onerror=()=>reject(new Error('Falha ao converter o PDF gerado.'));
      reader.readAsDataURL(blob);
    });
  }

  const WHIRLPOOL_BRANDS=['WHIRLPOOL','BRASTEMP','CONSUL'];
  const normUp=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  function isWhirlpoolOs(o){
    return WHIRLPOOL_BRANDS.includes(normUp(o?.manufacturer))||WHIRLPOOL_BRANDS.includes(normUp(o?.equipments?.brand))||normUp(o?.equipments?.document_model)==='WHIRLPOOL';
  }
  const brDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'';

  // Achado do usuário em 2026-09-03: "todos os modelos enviados por
  // WhatsApp ou impressos devem ser idênticos" -- este CSS é uma
  // cópia EXATA do embutido em printShell (os-whirlpool-extension-
  // v0813.js), nunca reescrito à parte. Se aquele mudar, este também
  // precisa mudar junto -- é o preço de reaproveitar via cópia (o
  // original só existe dentro de uma função privada de outro
  // arquivo, sem exportar a string de CSS pra importar de verdade).
  const DOC_CSS=`*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10px}.doc{width:100%}.head{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border-bottom:2px solid #163754;padding-bottom:8px;margin-bottom:8px}.head img{max-width:130px;max-height:60px}.osno{font-size:21px;font-weight:800;color:#163754}.muted{color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.box{border:1px solid #9aa9b8;border-radius:4px;padding:7px;margin-bottom:7px}.box h3{font-size:10px;margin:0 0 5px;color:#163754}.row{display:grid;grid-template-columns:130px 1fr;border-bottom:1px solid #e3e8ed;padding:3px 0}.row:last-child{border:0}.row b{font-size:8px}.wp table{width:100%;border-collapse:collapse;margin:0 0 3px}.wp td,.wp th{border:1px solid #111;padding:3px;font-size:8px;vertical-align:top}.wp th{background:#f2f2f2}.wp .title{font-weight:800;text-align:center}.sign{height:52px;border-top:1px solid #777;margin-top:24px;text-align:center;padding-top:4px}.footer{font-size:8px;text-align:center;margin-top:8px;color:#5d6b78}.vox .head{background:linear-gradient(135deg,#0b2b4a,#123a61);color:#fff;border-radius:10px;padding:12px 14px;border-bottom:0}.vox .head .muted{color:#9fc1e6}.vox .osno{color:#fff}.vox .box{border:1px solid #e1e8ef;border-radius:10px;box-shadow:0 1px 2px rgba(15,42,68,.08);padding:9px 11px}.vox .box h3{color:#1976d2;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}.vox .row{border-bottom:1px solid #eef2f6}.vox .row b{color:#5e7188}.vox .sign{border-top:1px solid #c7d0d9;color:#5e7188}.vox .footer{color:#5e7188}`;

  // Renderiza o MESMO HTML/CSS do documento impresso como PDF de
  // verdade. Achado do usuário em 2026-09-03: a primeira versão usava
  // jsPDF.html() (paginação automática embutida) -- saía em branco,
  // com 4 páginas vazias. Duas causas reais, corrigidas juntas:
  // 1) o container ficava em left:-99999px -- deslocamento extremo
  //    faz alguns navegadores nunca PINTAREM esse conteúdo de verdade
  //    (otimização de composição fora da viewport), então o
  //    html2canvas capturava uma área em branco. Agora fica em
  //    top:0/left:0 (sempre pintado de verdade), só invisível por
  //    ficar atrás do resto da UI (z-index negativo).
  // 2) jsPDF.html() faz a própria paginação, com histórico de bugs
  //    conhecidos de altura/escala errada. Troca pelo padrão mais
  //    usado e confiável: captura UMA imagem de verdade com
  //    html2canvas direto, depois fatiada manualmente em páginas via
  //    addImage -- sem depender da paginação automática do jsPDF.
  async function renderHtmlToPdfBlob(bodyHtml){
    await ensureJsPdf();
    const {jsPDF}=window.jspdf;
    const container=document.createElement('div');
    container.style.cssText='position:fixed;left:0;top:0;width:794px;background:#fff;padding:16px;z-index:-1;pointer-events:none;';
    container.innerHTML=`<style>${DOC_CSS}</style>${bodyHtml}`;
    document.body.appendChild(container);
    try{
      const canvas=await window.html2canvas(container,{scale:2,useCORS:true,backgroundColor:'#ffffff',windowWidth:794});
      if(!canvas.width||!canvas.height)throw new Error('Falha ao capturar o conteúdo do documento.');
      const imgData=canvas.toDataURL('image/jpeg',0.92);
      const doc=new jsPDF({unit:'mm',format:'a4'});
      const margin=8,pageWidth=210,pageHeight=297;
      const imgWidthMm=pageWidth-margin*2;
      const imgHeightMm=(canvas.height*imgWidthMm)/canvas.width;
      const usableHeight=pageHeight-margin*2;
      let heightLeft=imgHeightMm,offsetMm=0;
      doc.addImage(imgData,'JPEG',margin,margin,imgWidthMm,imgHeightMm);
      heightLeft-=usableHeight;
      while(heightLeft>0){
        offsetMm+=usableHeight;
        doc.addPage();
        doc.addImage(imgData,'JPEG',margin,margin-offsetMm,imgWidthMm,imgHeightMm);
        heightLeft-=usableHeight;
      }
      return doc.output('blob');
    }finally{
      container.remove();
    }
  }

  async function buildOsPdfBlob(o){
    const c=o.clients||{},e=o.equipments||{};
    const [parts,finRows,branding]=await Promise.all([
      api(`os_parts?service_order_id=eq.${o.id}&select=*&order=created_at`).catch(()=>[]),
      api(`os_financial?service_order_id=eq.${o.id}&select=*&limit=1`).catch(()=>[]),
      typeof window.getActiveCompanyBranding==='function'?window.getActiveCompanyBranding().catch(()=>null):Promise.resolve(null),
    ]);
    const b=branding||{};
    const fin=finRows?.[0]||{};
    const partsTotal=(parts||[]).reduce((s,p)=>s+Number(p.quantity||0)*Number(p.unit_value||0),0);
    const total=partsTotal+Number(fin.labor_value||0)+Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0)-Number(fin.discount_value||0);
    // Cópia EXATA de printVox (os-whirlpool-extension-v0813.js) --
    // mesmo HTML, só troca a função que o renderiza em PDF por baixo.
    const body=`<div class="doc vox"><div class="head"><div>${b.logo_url?`<img src="${E(b.logo_url)}">`:''}<div><b>${E(b.trade_name||b.legal_name||'VOXASSIST')}</b></div><div class="muted">${E([b.address,b.address_number,b.city,b.state].filter(Boolean).join(' • '))}</div><div class="muted">${E([b.phone,b.mobile,b.email].filter(Boolean).join(' • '))}</div></div><div><div class="muted">ORDEM DE SERVIÇO</div><div class="osno">${E(o.os_number)}</div><div>${E(String(o.status||'').replaceAll('_',' '))}</div></div></div><div class="grid"><div class="box"><h3>👤 CLIENTE</h3><div class="row"><b>NOME</b><span>${E(c.name)}</span></div><div class="row"><b>CPF/CNPJ</b><span>${E(c.document)}</span></div><div class="row"><b>TELEFONE</b><span>${E(c.phone_primary)}</span></div><div class="row"><b>ENDEREÇO</b><span>${E([c.address,c.address_number,c.complement,c.neighborhood,c.city,c.state].filter(Boolean).join(', '))}</span></div></div><div class="box"><h3>📦 EQUIPAMENTO</h3><div class="row"><b>PRODUTO</b><span>${E(e.product_type)}</span></div><div class="row"><b>MARCA / MODELO</b><span>${E([e.brand,e.model].filter(Boolean).join(' • '))}</span></div><div class="row"><b>SÉRIE</b><span>${E(e.serial_number)}</span></div><div class="row"><b>ATENDIMENTO</b><span>${E(o.service_type)}</span></div></div></div><div class="box"><h3>🔧 ATENDIMENTO TÉCNICO</h3><div class="row"><b>DEFEITO RELATADO</b><span>${E(o.reported_defect)}</span></div><div class="row"><b>DEFEITO CONSTATADO</b><span>${E(o.diagnosed_defect)}</span></div><div class="row"><b>SERVIÇO / LAUDO</b><span>${E(o.technical_service)}</span></div></div><div class="box"><h3>💰 ORÇAMENTO</h3><div class="row"><b>PEÇAS</b><span>${money(partsTotal)}</span></div><div class="row"><b>MÃO DE OBRA</b><span>${money(fin.labor_value||0)}</span></div><div class="row"><b>TOTAL</b><span><strong>${money(total)}</strong></span></div></div><div class="grid"><div class="sign">ASSINATURA DO CLIENTE</div><div class="sign">ASSINATURA DO TÉCNICO</div></div><div class="footer">${E(b.document_footer||b.document_header_note||'')}</div></div>`;
    return renderHtmlToPdfBlob(body);
  }

  async function fetchOsForDoc(id){
    const rows=await api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`).catch(()=>[]);
    return rows?.[0]||null;
  }

  // Cópia EXATA de printWhirlpool (os-whirlpool-extension-v0813.js) --
  // mesmo HTML, mesmo CSS (.wp), só vira PDF de verdade em vez de só
  // janela de impressão. O documento impresso em si continua intocado.
  async function buildWhirlpoolPdfBlob(id){
    const [osRows,impRows,appRows,parts,branding]=await Promise.all([
      api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`).catch(()=>[]),
      api(`manufacturer_imports?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`appointments?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`).catch(()=>[]),
      typeof window.getActiveCompanyBranding==='function'?window.getActiveCompanyBranding().catch(()=>null):Promise.resolve(null),
    ]);
    const o=osRows?.[0]||{};
    const p=impRows?.[0]?.extracted_data||{};
    const c=o.clients||{},e=o.equipments||{};
    const a=appRows?.[0]||{};
    const d={brand:branding||{}};
    const body=`<div class="doc wp"><table><tr><td style="width:70%"><b>AUTORIZADA:</b> ${E(d.brand.trade_name||d.brand.legal_name||'VOX')}<br>${E([d.brand.address,d.brand.address_number,d.brand.city,d.brand.state].filter(Boolean).join(' • '))}<br>FONE: ${E(d.brand.phone||d.brand.mobile)}</td><td><b>CENTRAL DE ATENDIMENTO WHIRLPOOL</b></td></tr></table><table><tr><td class="title">NÚMERO DA OS<br><b style="font-size:14px">${E(o.manufacturer_os_number||o.os_number)}</b></td><td>TÉCNICO<br>${E(o.profiles?.full_name||'')}</td><td>DATA AGENDA: ${E(brDate(a.appointment_date||p.dataAgenda))}<br>PERÍODO: ${E(a.period||p.periodo||'')}</td></tr></table><table><tr><td>CONSUMIDOR: ${E(p.cliente||c.name)}</td><td>CPF/CNPJ: ${E(p.documento||c.document)}</td></tr><tr><td>ENDEREÇO: ${E(p.endereco||c.address)}</td><td>CEP: ${E(p.cep||c.zip_code)}</td></tr><tr><td>BAIRRO: ${E(p.bairro||c.neighborhood)}</td><td>CIDADE/UF: ${E((p.cidade||c.city)+' / '+(p.uf||c.state||''))}</td></tr><tr><td colspan="2">TELEFONE: ${E(p.telefone||c.phone_primary)}</td></tr></table><table><tr><td>PRODUTO: ${E(p.productLine||e.product_type)}</td><td>MARCA: ${E(p.manufacturer||e.brand)}</td></tr><tr><td>SÉRIE: ${E(p.serie||e.serial_number)}</td><td>TIPO DE OS: ${E(p.tipoOS||o.order_type)}</td></tr></table><table><tr><th>DEFEITO RECLAMADO</th><td>${E(p.defeitoReclamado||o.reported_defect)}</td><th>DEFEITO CONSTATADO</th><td>${E(p.defeitoConstatado||o.diagnosed_defect)}</td></tr><tr><th>RECLAMAÇÃO / ATENDIMENTO</th><td colspan="3">${E(p.reclamacaoAtendimento||p.reclamacao||'')}</td></tr><tr><th>LAUDO TÉCNICO</th><td colspan="3" style="height:55px">${E(p.laudoTecnico||o.technical_service||'')}</td></tr></table><table><thead><tr><th>QTD</th><th>CÓDIGO</th><th>DESCRIÇÃO DA PEÇA</th><th>VALOR</th></tr></thead><tbody>${Array.from({length:Math.max(8,(parts||[]).length)}).map((_,i)=>{const x=(parts||[])[i]||{};return `<tr><td>${E(x.quantity||'')}</td><td>${E(x.part_code||x.code||'')}</td><td>${E(x.description||'')}</td><td>${x.unit_value?money(x.unit_value):''}</td></tr>`}).join('')}</tbody></table><table><tr><td style="height:48px"><b>OBSERVAÇÃO</b><br>${E(p.observacao||'')}</td></tr></table><div class="grid"><div class="sign">ASSINATURA DO CONSUMIDOR</div><div class="sign">ASSINATURA DO TÉCNICO</div></div></div>`;
    return renderHtmlToPdfBlob(body);
  }

  async function sendDocumentBlobViaChat(conversationId,blob,fileName){
    const base64=await blobToBase64(blob);
    const res=await fetch(CFG.url+'/functions/v1/chat-send-message',{
      method:'POST',headers:authHeaders(),
      body:JSON.stringify({conversationId,body:'',document:{base64,mimeType:'application/pdf',fileName}}),
    });
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data?.ok)throw new Error(data?.message||data?.error||'Falha ao enviar pelo WhatsApp.');
  }

  // Achado do usuário em 2026-09-03: pedir pra sair da conversa e ir na
  // OS achar o botão certo é um caminho longo -- o fluxo natural é
  // Chat -> Contexto VoxAssist -> "Enviar arquivo do VoxAssist", ali
  // mesmo escolhendo a OS (lista já carregada no card "Ordem de
  // Serviço") e o tipo de documento, com PRÉVIA real do PDF (mesmo
  // arquivo que vai ser enviado, num <iframe>, não uma descrição à
  // parte) antes de confirmar -- nunca envia sem essa confirmação
  // explícita.
  function modalShell(innerHtml,opts={}){
    const bg=document.createElement('div');
    bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal"${opts.wide?' style="width:min(640px,100%)"':''}>${innerHtml}</div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.addEventListener('click',e=>{if(e.target===bg)close()});
    return {bg,close};
  }

  async function openSendDocumentFlow(clientOrders,conversationId){
    if(!clientOrders||!clientOrders.length){window.toast?.('Nenhuma O.S. vinculada a este cliente.','err');return}
    openOsPickerModal(clientOrders,conversationId);
  }

  function openOsPickerModal(clientOrders,conversationId){
    const {bg,close}=modalShell(`
      <h3>Enviar arquivo do VoxAssist</h3>
      <p class="vx-chatbeta-sub">Escolha a Ordem de Serviço.</p>
      <div class="vx-send-doc-list">${clientOrders.map(o=>`<button type="button" class="vx-send-doc-btn" data-os="${o.id}">${E(o.os_number)} <small>${E(String(o.status||'').replaceAll('_',' '))}</small></button>`).join('')}</div>
      <div class="vx-modal-actions"><button type="button" data-cancel>Cancelar</button></div>
    `);
    bg.querySelector('[data-cancel]').onclick=close;
    bg.querySelectorAll('[data-os]').forEach(btn=>btn.onclick=async()=>{
      const osId=btn.dataset.os;
      close();
      await openDocTypeModal(osId,conversationId);
    });
  }

  async function openDocTypeModal(osId,conversationId){
    const o=await fetchOsForDoc(osId);
    if(!o){window.toast?.('Não foi possível carregar essa O.S.','err');return}
    const whirlpool=isWhirlpoolOs(o);
    const {bg,close}=modalShell(`
      <h3>Tipo de arquivo</h3>
      <p class="vx-chatbeta-sub">OS ${E(o.os_number)}</p>
      <div class="vx-send-doc-list">
        <button type="button" class="vx-send-doc-btn" data-kind="os">Ordem de Serviço / Orçamento</button>
        ${whirlpool?'<button type="button" class="vx-send-doc-btn" data-kind="whirlpool">OS Whirlpool</button>':''}
        <button type="button" class="vx-send-doc-btn" disabled title="Indisponível — modelo ainda não definido">Parecer Técnico <small>(indisponível)</small></button>
      </div>
      <div class="vx-modal-actions"><button type="button" data-cancel>Cancelar</button></div>
    `);
    bg.querySelector('[data-cancel]').onclick=close;
    bg.querySelectorAll('[data-kind]').forEach(btn=>btn.onclick=async()=>{
      const kind=btn.dataset.kind;
      close();
      await openPreviewModal(o,kind,conversationId);
    });
  }

  async function openPreviewModal(o,kind,conversationId){
    const loading=modalShell('<h3>Gerando documento…</h3><p class="vx-chatbeta-sub">Só um instante.</p>');
    let blob,fileName;
    try{
      if(kind==='whirlpool'){
        blob=await buildWhirlpoolPdfBlob(o.id);
        fileName=`OS-Whirlpool-${o.manufacturer_os_number||o.os_number||o.id}.pdf`;
      }else{
        blob=await buildOsPdfBlob(o);
        fileName=`OS-${o.os_number||o.id}.pdf`;
      }
    }catch(e){
      loading.close();
      window.toast?.(e?.message||'Falha ao gerar o documento.','err');
      return;
    }
    loading.close();
    const url=URL.createObjectURL(blob);
    const {bg,close}=modalShell(`
      <h3>Confira antes de enviar</h3>
      <p class="vx-chatbeta-sub">${E(fileName)}</p>
      <iframe src="${url}" class="vx-send-doc-preview" title="Prévia do documento"></iframe>
      <div class="vx-modal-actions"><button type="button" data-cancel>Cancelar</button><button type="button" class="primary" data-confirm>Confirmar envio</button></div>
    `,{wide:true});
    const cleanup=()=>URL.revokeObjectURL(url);
    bg.querySelector('[data-cancel]').onclick=()=>{cleanup();close()};
    const confirmBtn=bg.querySelector('[data-confirm]');
    confirmBtn.onclick=async()=>{
      confirmBtn.disabled=true;confirmBtn.textContent='Enviando…';
      try{
        await sendDocumentBlobViaChat(conversationId,blob,fileName);
        window.toast?.('Documento enviado por WhatsApp com sucesso.');
        cleanup();close();
        if(typeof window.vxOpenChatWithDraft==='function')await window.vxOpenChatWithDraft(conversationId,'');
      }catch(e){
        confirmBtn.disabled=false;confirmBtn.textContent='Confirmar envio';
        window.toast?.(e?.message||'Não foi possível enviar o documento.','err');
      }
    };
  }
  window.vxOpenSendDocumentFlow=openSendDocumentFlow;
})();
