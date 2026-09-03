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
  const JSPDF_CDN='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
  let jspdfPromise=null;
  function ensureJsPdf(){
    if(window.jspdf?.jsPDF)return Promise.resolve();
    if(jspdfPromise)return jspdfPromise;
    jspdfPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=JSPDF_CDN;
      s.onload=()=>resolve();
      s.onerror=()=>{jspdfPromise=null;reject(new Error('Falha ao carregar a biblioteca de PDF.'))};
      document.head.appendChild(s);
    });
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

  async function buildOsPdfBlob(o){
    await ensureJsPdf();
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const c=o.clients||{},e=o.equipments||{};
    const [parts,finRows,branding]=await Promise.all([
      api(`os_parts?service_order_id=eq.${o.id}&select=*&order=created_at`).catch(()=>[]),
      api(`os_financial?service_order_id=eq.${o.id}&select=*&limit=1`).catch(()=>[]),
      typeof window.getActiveCompanyBranding==='function'?window.getActiveCompanyBranding().catch(()=>null):Promise.resolve(null),
    ]);
    const fin=finRows?.[0]||{};
    const partsTotal=(parts||[]).reduce((s,p)=>s+Number(p.quantity||0)*Number(p.unit_value||0),0);
    const total=partsTotal+Number(fin.labor_value||0)+Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0)-Number(fin.discount_value||0);

    const left=14,pageWidth=210,maxWidth=pageWidth-left*2;
    let y=20;
    const line=(text,opts={})=>{
      const size=opts.size||10,bold=!!opts.bold,gap=opts.gap??6;
      doc.setFontSize(size);doc.setFont(undefined,bold?'bold':'normal');
      const wrapped=doc.splitTextToSize(String(text||''),maxWidth);
      doc.text(wrapped,left,y);
      y+=gap*wrapped.length;
    };
    const spacer=(h=3)=>{y+=h};

    line(branding?.trade_name||branding?.legal_name||'VoxAssist',{size:15,bold:true,gap:7});
    if(branding?.phone||branding?.mobile)line([branding.phone,branding.mobile].filter(Boolean).join(' • '),{size:9,gap:5});
    spacer(2);
    line('ORDEM DE SERVIÇO '+String(o.os_number||''),{size:13,bold:true,gap:7});
    line('Situação: '+String(o.status||'').replaceAll('_',' '),{size:9,gap:6});
    spacer(2);

    line('CLIENTE',{size:11,bold:true,gap:6});
    line('Nome: '+String(c.name||'—'),{gap:5});
    if(c.phone_primary)line('Telefone: '+String(c.phone_primary),{gap:5});
    spacer(2);

    line('EQUIPAMENTO',{size:11,bold:true,gap:6});
    line('Produto: '+[e.product_type,e.brand,e.model].filter(Boolean).join(' — '),{gap:5});
    if(o.reported_defect)line('Defeito relatado: '+o.reported_defect,{gap:5});
    if(o.diagnosed_defect)line('Defeito constatado: '+o.diagnosed_defect,{gap:5});
    if(o.technical_service)line('Serviço / laudo: '+o.technical_service,{gap:5});
    spacer(2);

    line('ORÇAMENTO',{size:11,bold:true,gap:6});
    (parts||[]).forEach(p=>{
      const lineTotal=Number(p.quantity||0)*Number(p.unit_value||0);
      line(`${p.description||'Peça'}  x${p.quantity||1}  —  ${money(lineTotal)}`,{gap:5});
    });
    if(Number(fin.labor_value||0)>0)line('Mão de obra: '+money(fin.labor_value),{gap:5});
    if(Number(fin.freight_value||0)>0)line('Frete: '+money(fin.freight_value),{gap:5});
    if(Number(fin.auxiliary_material_value||0)>0)line('Material auxiliar: '+money(fin.auxiliary_material_value),{gap:5});
    if(Number(fin.technical_report_value||0)>0)line('Laudo técnico: '+money(fin.technical_report_value),{gap:5});
    if(Number(fin.discount_value||0)>0)line('Desconto: -'+money(fin.discount_value),{gap:5});
    spacer(2);
    line('TOTAL: '+money(total),{size:13,bold:true,gap:8});

    doc.setFontSize(8);doc.setFont(undefined,'normal');
    doc.text('Documento gerado pelo VoxAssist em '+new Date().toLocaleString('pt-BR')+'.',left,290);

    return doc.output('blob');
  }

  async function fetchOsForDoc(id){
    const rows=await api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`).catch(()=>[]);
    return rows?.[0]||null;
  }

  // Achado do usuário em 2026-09-03: mesmos campos já usados no
  // documento impresso da Whirlpool (printWhirlpool,
  // os-whirlpool-extension-v0813.js) -- nunca inventa um layout novo,
  // só reconstrói o MESMO conteúdo real como PDF de verdade (aquele
  // documento só existe como janela de impressão, sem arquivo real
  // pra anexar). O documento impresso em si continua intocado.
  async function buildWhirlpoolPdfBlob(id){
    await ensureJsPdf();
    const {jsPDF}=window.jspdf;
    const [osRows,impRows,appRows,parts,branding]=await Promise.all([
      api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`).catch(()=>[]),
      api(`manufacturer_imports?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`appointments?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`).catch(()=>[]),
      typeof window.getActiveCompanyBranding==='function'?window.getActiveCompanyBranding().catch(()=>null):Promise.resolve(null),
    ]);
    const o=osRows?.[0]||{};
    const p=impRows?.[0]?.extracted_data||{};
    const a=appRows?.[0]||{};
    const c=o.clients||{},e=o.equipments||{};
    const brand=branding||{};

    const doc=new jsPDF({unit:'mm',format:'a4'});
    const left=14,pageWidth=210,maxWidth=pageWidth-left*2;
    let y=20;
    const line=(text,opts={})=>{
      const size=opts.size||10,bold=!!opts.bold,gap=opts.gap??6;
      doc.setFontSize(size);doc.setFont(undefined,bold?'bold':'normal');
      const wrapped=doc.splitTextToSize(String(text||''),maxWidth);
      doc.text(wrapped,left,y);
      y+=gap*wrapped.length;
    };
    const spacer=(h=3)=>{y+=h};

    line('CENTRAL DE ATENDIMENTO WHIRLPOOL',{size:12,bold:true,gap:6});
    line('Autorizada: '+(brand.trade_name||brand.legal_name||'VoxAssist'),{gap:5});
    if(brand.phone||brand.mobile)line('Fone: '+[brand.phone,brand.mobile].filter(Boolean).join(' • '),{gap:5});
    spacer(2);
    line('Nº DA OS: '+String(p.numeroOS||o.manufacturer_os_number||o.os_number||''),{size:13,bold:true,gap:7});
    line('Técnico: '+String(o.profiles?.full_name||''),{gap:5});
    line('Data agenda: '+brDate(a.appointment_date||p.dataAgenda)+'   Período: '+String(a.period||p.periodo||''),{gap:6});
    spacer(2);

    line('CONSUMIDOR',{size:11,bold:true,gap:6});
    line('Nome: '+String(p.cliente||c.name||'—'),{gap:5});
    line('CPF/CNPJ: '+String(p.documento||c.document||'—'),{gap:5});
    line('Endereço: '+String(p.endereco||c.address||'—'),{gap:5});
    line('Bairro: '+String(p.bairro||c.neighborhood||'—')+'   Cidade/UF: '+String((p.cidade||c.city||'')+' / '+(p.uf||c.state||'')),{gap:5});
    line('Telefone: '+String(p.telefone||c.phone_primary||'—'),{gap:6});
    spacer(2);

    line('PRODUTO',{size:11,bold:true,gap:6});
    line('Produto: '+String(p.productLine||e.product_type||'—')+'   Marca: '+String(p.manufacturer||e.brand||'—'),{gap:5});
    line('Série: '+String(p.serie||e.serial_number||'—'),{gap:6});
    spacer(2);

    line('DEFEITO RECLAMADO: '+String(p.defeitoReclamado||o.reported_defect||'—'),{gap:5});
    line('DEFEITO CONSTATADO: '+String(p.defeitoConstatado||o.diagnosed_defect||'—'),{gap:5});
    if(p.reclamacaoAtendimento||p.reclamacao)line('RECLAMAÇÃO/ATENDIMENTO: '+String(p.reclamacaoAtendimento||p.reclamacao),{gap:5});
    if(p.laudoTecnico||o.technical_service)line('LAUDO TÉCNICO: '+String(p.laudoTecnico||o.technical_service),{gap:5});
    spacer(2);

    if((parts||[]).length){
      line('PEÇAS',{size:11,bold:true,gap:6});
      parts.forEach(x=>{
        line(`${x.description||'Peça'}  x${x.quantity||1}${x.unit_value?'  —  '+money(x.unit_value):''}`,{gap:5});
      });
      spacer(2);
    }
    if(p.observacao)line('OBSERVAÇÃO: '+String(p.observacao),{gap:5});

    doc.setFontSize(8);doc.setFont(undefined,'normal');
    doc.text('Documento gerado pelo VoxAssist em '+new Date().toLocaleString('pt-BR')+'.',left,290);

    return doc.output('blob');
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

  async function sendOsDocumentViaChat(){
    const o=state?.activeOs;
    if(!o?.id)return window.toast?.('Nenhuma O.S. aberta.','err');
    const clientName=o.clients?.name||'este cliente';
    if(!confirm(`Enviar o resumo da O.S. ${o.os_number||''} (com orçamento) por WhatsApp pra ${clientName}?`))return;
    const btn=document.querySelector('[data-act="send-doc"]');
    if(btn){btn.disabled=true;btn.textContent='Enviando…';}
    try{
      const {conversationId}=await window.vxResolveOsChatTarget(o);
      const blob=await buildOsPdfBlob(o);
      await sendDocumentBlobViaChat(conversationId,blob,`OS-${o.os_number||o.id}.pdf`);
      window.toast?.('O.S./Orçamento enviado por WhatsApp com sucesso.');
      if(typeof window.vxOpenChatWithDraft==='function')await window.vxOpenChatWithDraft(conversationId,'');
    }catch(e){
      window.toast?.(e?.message||'Não foi possível enviar o documento.','err');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='📄 Enviar O.S./Orçamento por WhatsApp';}
    }
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
  window.vxSendOsDocumentViaChat=sendOsDocumentViaChat;
})();
