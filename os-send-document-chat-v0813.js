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
      const base64=await blobToBase64(blob);
      const res=await fetch(CFG.url+'/functions/v1/chat-send-message',{
        method:'POST',headers:authHeaders(),
        body:JSON.stringify({conversationId,body:'',document:{base64,mimeType:'application/pdf',fileName:`OS-${o.os_number||o.id}.pdf`}}),
      });
      const data=await res.json().catch(()=>null);
      if(!res.ok||!data?.ok)throw new Error(data?.message||data?.error||'Falha ao enviar pelo WhatsApp.');
      window.toast?.('O.S./Orçamento enviado por WhatsApp com sucesso.');
      if(typeof window.vxOpenChatWithDraft==='function')await window.vxOpenChatWithDraft(conversationId,'');
    }catch(e){
      window.toast?.(e?.message||'Não foi possível enviar o documento.','err');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='📄 Enviar O.S./Orçamento por WhatsApp';}
    }
  }
  window.vxSendOsDocumentViaChat=sendOsDocumentViaChat;
})();
