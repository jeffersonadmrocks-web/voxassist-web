/* VoxAssist Web V0.9.09 — aba "Documentos" na OS. Plano "Arquitetura
   de Documentos da OS", Fase 1, item 4 (histórico de emissões) +
   parte do item 5 (emitir um documento de verdade), reaproveitando
   100% do que já existe:
   - Mesmo padrão de injeção não-invasiva já usado pela aba Whirlpool
     (os-whirlpool-extension-v0813.js, injectWhirlpoolTab) -- só
     ADICIONA um botão em .vx-os-tabs, nunca mexe nos existentes.
   - window.vxPrintShell (exposto por os-whirlpool-extension-v0813.js)
     -- mesmo visual azul-marinho já aprovado, sem duplicar CSS de
     impressão em outro lugar.
   - RPC create_os_document_emission (migration 20260909070000) --
     snapshot imutável, Termos vigentes no rodapé.

   Escopo desta etapa: um botão NOVO "Emitir documento" registra e
   imprime uma emissão de verdade -- os botões EXISTENTES "GERAR
   PDF"/"IMPRIMIR" do cabeçalho continuam exatamente como estão,
   migrar eles pra este fluxo único é o último passo da Fase 1,
   registrado como pendente na Matriz Mestra (mais arriscado --
   são os botões mais usados no dia a dia, merece sua própria rodada
   com mais cautela). */
(function(){
  const E=window.esc||((v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  // Fase C (2026-09-12): Hisense/Gorenje e Assurant não são um novo tipo de
  // OS nem precisam de fidelidade a um PDF externo do fabricante (isso é
  // exclusividade do Whirlpool) -- são só mais dois tipos de PARECER
  // TÉCNICO que qualquer OS normal pode emitir, usando 100% desta mesma
  // infraestrutura (aba Documentos, os_document_emissions, vxPrintShell).
  const DOC_TYPE_LABELS={ENTRADA:'Entrada',ORCAMENTO:'Orçamento',ENTREGA:'Entrega',PARECER_VOX:'Parecer Técnico VOX',HISENSE:'Parecer Técnico Hisense/Gorenje',ASSURANT:'Parecer Técnico Assurant'};
  const CHANNEL_LABELS={IMPRESSO:'Impresso',PDF:'PDF',WHATSAPP:'WhatsApp'};
  const HISENSE_FOTO_LABELS=['FOTO 1 – Instalação do Produto','FOTO 2 – Instalação do Produto','FOTO 3 – Local onde o Produto está Instalado.','FOTO 4 – Instalação Elétrica','FOTO 5 – Nº de Série','FOTO 6 – Peça Avariada','FOTO 7','FOTO 8'];
  const fileToDataUrl=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)});
  function ensureExtraStyle(){
    if(document.getElementById('vxDocExtraStyle'))return;
    const s=document.createElement('style');s.id='vxDocExtraStyle';s.textContent=`
      .vx-doc-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:4px 0 12px}
      .vx-doc-photo-slot{display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:400}
      .vx-doc-photo-slot span{font-size:10px;color:#526579}
    `;document.head.appendChild(s);
  }

  async function injectDocumentsTab(){
    const o=state?.activeOs;if(!o)return;
    const tabs=document.querySelector('.vx-os-tabs');if(!tabs||tabs.querySelector('[data-section="documentos"]'))return;
    const b=document.createElement('button');b.dataset.section='documentos';b.textContent='DOCUMENTOS';b.className='vx-documents-tab';
    b.onclick=()=>showDocumentsPanel(o.id);tabs.appendChild(b);
  }

  async function showDocumentsPanel(id){
    document.querySelectorAll('.vx-os-panel').forEach(p=>p.classList.add('hidden'));
    document.querySelectorAll('.vx-os-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.section==='documentos'));
    let panel=document.querySelector('#vx-documentos');
    if(!panel){panel=document.createElement('section');panel.id='vx-documentos';panel.className='vx-os-panel';document.querySelector('#app')?.appendChild(panel);}
    panel.classList.remove('hidden');
    panel.innerHTML='<div class="vx-screen-box">Carregando documentos...</div>';
    await renderDocumentsList(id,panel);
  }

  async function renderDocumentsList(id,panel){
    const rows=await api(`os_document_emissions?service_order_id=eq.${id}&select=*&order=generated_at.desc`).catch(()=>[]);
    const userIds=[...new Set(rows.map(r=>r.generated_by).filter(Boolean))];
    const users=userIds.length?await api(`profiles?id=in.(${userIds.join(',')})&select=id,full_name`).catch(()=>[]):[];
    const userMap=Object.fromEntries(users.map(u=>[u.id,u.full_name]));
    panel.innerHTML=`<div class="vx-screen-box">
      <div class="vx-wp-head"><div><h3>DOCUMENTOS DESTA OS</h3><small>Cada emissão é um retrato imutável -- reabrir mostra exatamente os dados e os Termos vigentes na hora em que foi gerado.</small></div><button class="vx-action" id="vxDocNew">+ EMITIR DOCUMENTO</button></div>
      <div class="vx-sg-list">${rows.length?rows.map(r=>`<div class="vx-sg-row"><b>${DOC_TYPE_LABELS[r.document_type]||r.document_type} · v${r.document_version}</b><span>${new Date(r.generated_at).toLocaleString('pt-BR')} · ${CHANNEL_LABELS[r.channel]||r.channel} · ${E(userMap[r.generated_by]||'—')}</span><div class="vx-sg-row-actions"><button type="button" data-reopen="${E(r.id)}">Reabrir</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhum documento emitido ainda pra esta OS.</p>'}</div>
    </div>`;
    panel.querySelectorAll('[data-reopen]').forEach(b=>b.onclick=()=>{
      const r=rows.find(x=>String(x.id)===b.dataset.reopen);
      if(r)reopenEmission(r);
    });
    document.getElementById('vxDocNew').onclick=()=>openEmitModal(id);
  }

  function reopenEmission(r){
    const d=r.data_snapshot||{};
    let body;
    if(r.document_type==='PARECER_VOX')body=buildVoxReportBody(d);
    else if(r.document_type==='HISENSE')body=buildHisenseBody(d);
    else if(r.document_type==='ASSURANT')body=buildAssurantBody(d);
    else{
      const rowsHtml=Object.entries(d).map(([k,v])=>`<div class="row"><b>${E(k.toUpperCase())}</b><span>${E(typeof v==='object'?JSON.stringify(v):v)}</span></div>`).join('');
      body=`<div class="doc vox"><div class="head"><div><b>${DOC_TYPE_LABELS[r.document_type]||r.document_type} · v${r.document_version}</b></div><div class="muted">${new Date(r.generated_at).toLocaleString('pt-BR')} · ${CHANNEL_LABELS[r.channel]||r.channel}</div></div>
      <div class="box"><h3>DADOS DESTA EMISSÃO</h3>${rowsHtml||'<p>Sem dados registrados.</p>'}</div>
      ${r.terms_snapshot?`<div class="box"><h3>TERMOS E CONDIÇÕES (v${r.terms_version})</h3><p style="white-space:pre-wrap">${E(r.terms_snapshot)}</p></div>`:''}
      <div class="footer">Esta é uma cópia arquivada -- não reflete alterações feitas na OS depois desta emissão.</div></div>`;
    }
    if(typeof window.vxPrintShell==='function')window.vxPrintShell('Documento '+(DOC_TYPE_LABELS[r.document_type]||r.document_type)+' v'+r.document_version,body);
    else toast?.('Não foi possível abrir a visualização.','err');
  }

  // Visual inspirado nos modelos de referência (parecer-fabrica), sem a
  // exigência de fidelidade pixel-a-pixel a um PDF externo -- diferente do
  // Whirlpool, aqui não existe um formulário físico do fabricante pra
  // reproduzir, é um documento gerado pelo próprio VoxAssist.
  function photoGridHtml(fotos,cols=2,height=180){
    return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;margin-top:10px">${(fotos||[]).map(f=>`
      <div style="border:1px solid #000">
        <div style="background:#00A79D;color:#000;font-weight:700;font-style:italic;text-align:center;padding:5px 8px;font-size:11px">${E(f.legenda||'')}</div>
        <div style="height:${height}px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff">${f.dataUrl?`<img src="${f.dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain">`:'<span style="color:#bbb;font-size:10px">&nbsp;</span>'}</div>
      </div>`).join('')}</div>`;
  }

  function hisenseHeaderHtml(){
    return `<div data-avoid-break>
      <div style="margin:0 -15mm">
        <div style="padding:14px 24px 8px;background:#fff"><span style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:42px;letter-spacing:-1px;color:#00A79D;line-height:1">Hisense</span></div>
        <div style="height:10px;background:#00A79D"></div><div style="height:3px;background:#fff"></div><div style="height:3px;background:#008E86"></div>
      </div>
      <h1 style="font-size:22px;font-weight:700;margin:12px 0 10px;text-align:center;color:#008E86">Relatório de Atendimento ao Cliente</h1>
    </div>`;
  }
  function hisensePlugDiagramHtml(){
    return `<div style="width:130px;height:90px;border:1px solid #888;border-radius:10px;background:#e8e8e8;position:relative;flex-shrink:0" aria-hidden="true">
      <div style="position:absolute;top:24px;left:18px;font-size:11px;color:#c00;font-weight:700">F1</div>
      <div style="position:absolute;top:24px;right:18px;font-size:11px;color:#c00;font-weight:700">F2</div>
      <div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);width:10px;height:10px;border-radius:50%;background:#333"></div>
      <div style="position:absolute;top:30px;left:32px;width:8px;height:8px;border-radius:50%;background:#333"></div>
      <div style="position:absolute;top:30px;right:32px;width:8px;height:8px;border-radius:50%;background:#333"></div>
      <div style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);font-size:10px;color:#c00;font-weight:700">&#9650; Terra</div>
    </div>`;
  }
  function buildHisenseBody(d){
    const cell='border:1px solid #000;padding:6px 8px;font-size:11px;vertical-align:top;color:#000';
    const label=`${cell};font-weight:700;background:#00A79D`;
    const fotos=d.fotos||[];
    return `<div id="parecer-print" style="background:#fff;color:#000;font-family:'Calibri',Arial,sans-serif;padding:0 15mm 15mm;width:210mm;min-height:297mm;margin:0 auto">
      ${hisenseHeaderHtml()}
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="${label};width:18%">NÚMERO OS</td><td style="${cell}">${E(d.os_numero)}</td><td style="${label};width:20%">ASSISTÊNCIA TÉC.</td><td style="${cell}">${E(d.assistenciaTec)}</td></tr>
        <tr><td style="${label}">NOME DO CLIENTE</td><td style="${cell}" colspan="3">${E(d.cliente)}</td></tr>
        <tr><td style="${label}">MODELO DO PROD.</td><td style="${cell}">${E(d.modeloProduto)}</td><td style="${label}">Nº DE SÉRIE</td><td style="${cell}">${E(d.numeroSerie)}</td></tr>
        <tr><td style="${label}">ART ou Batch</td><td style="${cell}">${E(d.artBatch)}</td>
          <td style="${cell};text-align:center;font-weight:700">Produto Gorenje <span style="display:inline-block;width:28px;border-bottom:1px solid #000;text-align:center">${d.marcaProduto==='gorenje'?'X':' '}</span></td>
          <td style="${cell};text-align:center;font-weight:700">Produto Hisense <span style="display:inline-block;width:28px;border-bottom:1px solid #000;text-align:center">${d.marcaProduto==='hisense'?'X':' '}</span></td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-top:10px">
        <tr><td style="${label};width:28%;height:48px">DEFEITO RELATADO PELO CLIENTE</td><td style="${cell};white-space:pre-wrap">${E(d.defeitoRelatado)}</td></tr>
        <tr><td style="${label};height:48px">DIAGNÓSTICO TÉC.</td><td style="${cell};white-space:pre-wrap">${E(d.diagnosticoTec)}</td></tr>
        <tr><td style="${label};height:56px">INSTALAÇÃO CORRETA?<br><span style="font-weight:400;font-size:9px">(Relatar as irregularidades encontradas na instalação)</span></td><td style="${cell};white-space:pre-wrap">${E(d.instalacaoCorreta)}</td></tr>
        <tr><td style="${label};height:48px">PEÇAS NECESSÁRIAS<br><span style="font-weight:700;font-size:11px">PARA REPARO *</span></td><td style="${cell};white-space:pre-wrap">${E(d.pecasNecessarias)}</td></tr>
      </table>
      <p style="font-size:9px;font-style:italic;margin:4px 0 10px">*** Consultar a vista explodida no sistema para inserir o código correto da peça. ***</p>
      <div>${photoGridHtml(fotos.slice(0,4),2,220)}</div>
      <div>
        <div style="page-break-before:always;break-before:page;margin-top:0">${hisenseHeaderHtml()}</div>
        <div style="margin-top:10px">${photoGridHtml(fotos.slice(4,8),2,220)}</div>
      </div>
      <p style="font-size:11px;font-style:italic;margin-top:12px;margin-bottom:4px">Detalhamento da Tensão de Alimentação do Produto:</p>
      <div style="display:flex;align-items:flex-start;gap:16px">
        ${hisensePlugDiagramHtml()}
        <table style="border-collapse:collapse">
          <tr><th colspan="2" style="${cell};font-weight:700;text-align:center;background:#fff">Leitura de Tensão na Tomada</th></tr>
          <tr><td style="${cell};text-align:center;width:110px">F1 + F2</td><td style="${cell};width:90px">${E(d.tensaoF1F2)}</td></tr>
          <tr><td style="${cell};text-align:center">F1 + Terra</td><td style="${cell}">${E(d.tensaoF1Terra)}</td></tr>
          <tr><td style="${cell};text-align:center">F2 + Terra</td><td style="${cell}">${E(d.tensaoF2Terra)}</td></tr>
        </table>
      </div>
      <p style="font-size:11px;font-style:italic;font-weight:700;margin-top:12px;margin-bottom:4px">Anotações Técnicas:</p>
      <div style="border:1px solid #000;min-height:70px;padding:8px;font-size:11px;white-space:pre-wrap">${E(d.anotacoes)}</div>
      <div style="margin-top:24px;font-style:italic">
        <div style="font-size:11px">${E(d.cidade)}, ${E(d.dataParecer)||'___/___/______'}</div>
        ${signatureHtml(d.responsavel)}
      </div>
    </div>`;
  }

  function buildAssurantBody(d){
    const cells=(label,value)=>`<th>${E(label)}</th><td>${E(value)||'&nbsp;'}</td>`;
    const pair=(a,av,b,bv)=>`<table class="assurant-data"><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup><tbody><tr>${cells(a,av)}${cells(b,bv)}</tr></tbody></table>`;
    const heading=text=>`<h2>${E(text)}</h2>`;
    const textBox=(title,text)=>`<section class="assurant-section">${heading(title)}<div class="assurant-text">${E(text)||'&nbsp;'}</div></section>`;
    const photos=(items,title)=>{
      const filled=(items||[]).filter(f=>f?.dataUrl);
      if(!filled.length)return '';
      return `<section class="assurant-section assurant-photos">${heading(title)}<div class="assurant-photo-grid"${filled.length===1?' style="grid-template-columns:1fr"':''}>${filled.map(f=>`<figure><img src="${E(f.dataUrl)}" alt="${E(f.legenda||title)}"><figcaption>${E(f.legenda||title)}</figcaption></figure>`).join('')}</div></section>`;
    };
    return `<style>
      .assurant-report{width:100%;max-width:194mm;margin:0 auto;color:#172b40;font-family:Arial,sans-serif;font-size:10px;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      .assurant-report *{box-sizing:border-box}
      .assurant-report h1{font-size:19px;letter-spacing:1.2px;text-align:center;margin:0 0 9px;color:#172b40}
      .assurant-report h2{font-size:10px;letter-spacing:.35px;color:#172b40;background:#eaf0f5;border:1px solid #8899aa;padding:5px 8px;margin:0;font-weight:700;text-align:left}
      .assurant-report .assurant-section{margin-bottom:7px;break-inside:avoid;page-break-inside:avoid}
      .assurant-report .assurant-data{width:100%;table-layout:fixed;border-collapse:collapse;margin:0}
      .assurant-report td,.assurant-report th{border:1px solid #8899aa;padding:5px 7px;font-size:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
      .assurant-report th{background:#f5f7fa;font-weight:700;white-space:normal}
      .assurant-report .assurant-text{border:1px solid #8899aa;border-top:0;padding:7px 8px;min-height:26px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.4}
      .assurant-report .assurant-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:6px}
      .assurant-report figure{margin:0;border:1px solid #8899aa;padding:4px;break-inside:avoid}
      .assurant-report figure img{display:block;width:100%;height:26mm;object-fit:contain}
      .assurant-report figcaption{font-size:8px;text-align:center;line-height:1.3;margin-top:3px;color:#42556a}
      .assurant-report .assurant-signatures{display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:20px;margin-top:14px;break-inside:avoid;page-break-inside:avoid;text-align:center}
      .assurant-report .assurant-signature-mark{height:27px;display:flex;align-items:center;justify-content:center;font-family:'Segoe Script',cursive;font-style:italic;font-size:16px;color:#245184;overflow:hidden}
      .assurant-report .assurant-signature-mark span{max-width:100%;overflow-wrap:anywhere;line-height:1.1}
      .assurant-report .assurant-signature-name{border-top:1px solid #74889a;padding-top:5px;min-height:19px;font-size:10px;font-weight:700;overflow-wrap:anywhere}
      .assurant-report .assurant-signature-label{font-size:9px;margin-top:3px;color:#42556a}
    </style><div id="parecer-print" class="assurant-report">
      <h1>ANÁLISE TÉCNICA</h1>
      <section class="assurant-section">${heading('ASSISTÊNCIA TÉCNICA')}${pair('Assistência',d.assistenciaTec,'CNPJ',d.cnpj)}</section>
      <section class="assurant-section">${heading('CONSUMIDOR')}${d.cliente?`<table class="assurant-data"><tbody><tr><th style="width:18%">Cliente</th><td>${E(d.cliente)}</td></tr></tbody></table>`:''}${pair('Serial',d.numeroSerie,'Sinistro',d.sinistro)}</section>
      <section class="assurant-section">${heading('PRODUTO')}${pair('Marca',d.produtoMarca,'Modelo',d.modeloProduto)}</section>
      ${textBox('PARECER TÉCNICO APÓS ANÁLISE DO PRODUTO',d.parecerTecnico)}
      ${textBox('PEÇA QUE NECESSITA SER TROCADA E MOTIVO',d.pecaTrocar)}
      <section class="assurant-section"><table class="assurant-data"><colgroup><col style="width:44%"><col style="width:56%"></colgroup><tbody><tr>${cells('Motivo',d.motivo)}</tr><tr>${cells('Forma de atendimento',d.formaAtendimento)}</tr><tr>${cells('Produto foi coletado?',d.produtoColetado)}</tr></tbody></table></section>
      ${photos(d.fotos,'FOTOS DO DEFEITO ENCONTRADO')}
      ${photos((d.cotacaoImgs||[]).map((dataUrl,i)=>({dataUrl,legenda:'Cotação '+(i+1)+' - orçamento da peça até 30 dias'})),'COTAÇÕES DO ORÇAMENTO')}
      ${photos([{dataUrl:d.residenciaImg,legenda:'Residência do segurado'}],'RESIDÊNCIA DO SEGURADO')}
      <div class="assurant-signatures"><div><div class="assurant-signature-mark"><span style="font-size:${String(d.responsavel||'').length>30?'13':'16'}px">${E(d.responsavel)}</span></div><div class="assurant-signature-name">${E(d.responsavel)||'&nbsp;'}</div><div class="assurant-signature-label">Assinatura Técnico Responsável</div></div><div><div class="assurant-signature-name">${E(d.cidade)}${d.cidade?' - ':''}${E(d.dataParecer)||'___/___/______'}</div><div class="assurant-signature-label">Local e Data</div></div></div>
    </div>`;
  }

  function hisenseExtraFieldsHtml(){
    return `<div class="vx-doc-extra">
      <label>ART ou Batch</label><input name="artBatch">
      <label>MARCA DO PRODUTO</label><select name="marcaProduto"><option value="hisense">Hisense</option><option value="gorenje">Gorenje</option></select>
      <label>INSTALAÇÃO CORRETA? (irregularidades encontradas)</label><textarea name="instalacaoCorreta" rows="2"></textarea>
      <label>PEÇAS NECESSÁRIAS PARA REPARO</label><textarea name="pecasNecessarias" rows="2"></textarea>
      <label>TENSÃO F1+F2</label><input name="tensaoF1F2" placeholder="ex.: 220V">
      <label>TENSÃO F1+TERRA</label><input name="tensaoF1Terra" placeholder="ex.: 127V">
      <label>TENSÃO F2+TERRA</label><input name="tensaoF2Terra" placeholder="ex.: 127V">
      <label>ANOTAÇÕES TÉCNICAS</label><textarea name="anotacoes" rows="3"></textarea>
      <label>FOTOS (até 8)</label>
      <div class="vx-doc-photo-grid">${HISENSE_FOTO_LABELS.map((l,i)=>`<label class="vx-doc-photo-slot"><span>${E(l)}</span><input type="file" accept="image/*" capture="environment" data-foto="${i}" data-legenda="${E(l)}"></label>`).join('')}</div>
    </div>`;
  }
  function assurantExtraFieldsHtml(){
    return `<div class="vx-doc-extra">
      <label>SINISTRO</label><input name="sinistro">
      <label>PARECER TÉCNICO APÓS ANÁLISE DO PRODUTO</label><textarea name="parecerTecnico" rows="3"></textarea>
      <label>PEÇA QUE NECESSITA SER TROCADA E MOTIVO</label><textarea name="pecaTrocar" rows="2"></textarea>
      <label>MOTIVO</label><input name="motivo">
      <label>QUAL FOI A FORMA DE ATENDIMENTO?</label><input name="formaAtendimento">
      <label>PRODUTO FOI COLETADO?</label><select name="produtoColetado"><option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option></select>
      <label>FOTOS DO DEFEITO (até 4)</label>
      <div class="vx-doc-photo-grid">${[0,1,2,3].map(i=>`<label class="vx-doc-photo-slot"><span>FOTO DO DEFEITO ENCONTRADO</span><input type="file" accept="image/*" capture="environment" data-foto="${i}" data-legenda="FOTO DO DEFEITO ENCONTRADO"></label>`).join('')}</div>
      <label>COTAÇÃO DO ORÇAMENTO DA PEÇA (até 2)</label>
      <div class="vx-doc-photo-grid">${[0,1].map(i=>`<label class="vx-doc-photo-slot"><span>COTAÇÃO ${i+1}</span><input type="file" accept="image/*" capture="environment" data-cotacao="${i}"></label>`).join('')}</div>
      <label>FOTO RESIDÊNCIA DO SEGURADO</label>
      <div class="vx-doc-photo-grid"><label class="vx-doc-photo-slot"><span>RESIDÊNCIA</span><input type="file" accept="image/*" capture="environment" data-residencia="1"></label></div>
    </div>`;
  }
  function voxExtraFieldsHtml(){return `<div class="vx-doc-extra"><label>PARECER TÉCNICO / DIAGNÓSTICO</label><textarea name="parecerTecnico" rows="4"></textarea><label>CONCLUSÃO E RECOMENDAÇÕES</label><textarea name="conclusao" rows="3"></textarea><label>OBSERVAÇÕES</label><textarea name="observacoes" rows="2"></textarea><label>VALIDADE DO ORÇAMENTO</label><input name="validade" value="15 dias"><label>GARANTIA</label><textarea name="garantia" rows="2" placeholder="Informe as condições aplicáveis"></textarea></div>`}
  function signatureHtml(name){return name?`<div style="margin-top:24px;text-align:center"><div style="font-family:'Segoe Script',cursive;font-size:23px;color:#173b58">${E(name)}</div><div style="border-top:1px solid #a8b5c2;padding-top:5px">${E(name)} · Técnico responsável</div></div>`:''}
  function buildVoxReportBody(d){
    const row=(label,value)=>value?`<div class="row"><b>${E(label)}</b><span style="white-space:pre-wrap">${E(value)}</span></div>`:'';
    const box=(title,value)=>value?`<div class="box"><h3>${E(title)}</h3><p style="white-space:pre-wrap">${E(value)}</p></div>`:'';
    return `<div class="doc vox"><div class="head"><div><img alt="Logo" src="${E(d.logo_url||'icons/icon-192.png')}" style="max-height:48px;max-width:140px"><b>${E(d.assistenciaTec)}</b><div>${E(d.cnpj)}</div></div><div><h2>PARECER TÉCNICO</h2><b>OS ${E(d.os_numero)}</b><div>${E(d.dataParecer)}</div></div></div><div class="box"><h3>CLIENTE E EQUIPAMENTO</h3>${row('Cliente',d.cliente)}${row('CPF/CNPJ',d.cliente_documento)}${row('Telefone',d.telefone)}${row('Endereço',d.endereco)}${row('Produto',d.equipamento)}${row('Número de série',d.numeroSerie)}${row('Entrada',d.dataEntrada)}</div>${box('DEFEITO RELATADO',d.defeitoRelatado)}${box('PARECER TÉCNICO',d.parecerTecnico)}${box('CONCLUSÃO E RECOMENDAÇÕES',d.conclusao)}<div class="box"><h3>ORÇAMENTO</h3>${(d.pecas||[]).length?`<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th>Código</th><th>Peça</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${d.pecas.map(p=>`<tr><td>${E(p.part_code||p.code||'')}</td><td>${E(p.description||p.part_description||'Peça')}</td><td>${E(p.quantity)}</td><td>${money(p.unit_value)}</td><td>${money(Number(p.quantity||0)*Number(p.unit_value||0))}</td></tr>`).join('')}</tbody></table>`:''}${row('Mão de obra',money(d.maoDeObra))}${Number(d.adicionais)?row('Demais serviços / despesas',money(d.adicionais)):''}${Number(d.desconto)?row('Desconto',money(d.desconto)):''}${row('TOTAL',money(d.totalValor))}</div>${box('OBSERVAÇÕES',d.observacoes)}${row('Validade',d.validade)}${box('GARANTIA',d.garantia)}${row('Local e data',[d.cidade,d.dataParecer].filter(Boolean).join(' · '))}${signatureHtml(d.responsavel)}</div>`;
  }
  const EXTRA_FIELDS_HTML={PARECER_VOX:voxExtraFieldsHtml,HISENSE:hisenseExtraFieldsHtml,ASSURANT:assurantExtraFieldsHtml};

  async function collectReportExtra(form,type){
    const extra={};
    form.querySelectorAll('.vx-doc-extra [name]').forEach(el=>{extra[el.name]=el.value});
        if(type==='HISENSE'){
          const fotos=new Array(HISENSE_FOTO_LABELS.length).fill(null).map((_,i)=>({legenda:HISENSE_FOTO_LABELS[i],dataUrl:''}));
          for(const inp of form.querySelectorAll('[data-foto]')){const i=Number(inp.dataset.foto);if(inp.files?.[0])fotos[i].dataUrl=await fileToDataUrl(inp.files[0])}
          extra.fotos=fotos;
        }else if(type==='ASSURANT'){
          const fotos=[0,1,2,3].map(()=>({legenda:'FOTO DO DEFEITO ENCONTRADO',dataUrl:''}));
          for(const inp of form.querySelectorAll('[data-foto]')){const i=Number(inp.dataset.foto);if(inp.files?.[0])fotos[i].dataUrl=await fileToDataUrl(inp.files[0])}
          const cotacaoImgs=['',''];
          for(const inp of form.querySelectorAll('[data-cotacao]')){const i=Number(inp.dataset.cotacao);if(inp.files?.[0])cotacaoImgs[i]=await fileToDataUrl(inp.files[0])}
          const residInp=form.querySelector('[data-residencia]');
          extra.fotos=fotos;extra.cotacaoImgs=cotacaoImgs;extra.residenciaImg=residInp?.files?.[0]?await fileToDataUrl(residInp.files[0]):'';
        }
    return extra;
  }

  async function openEmitModal(id,reportOnly=false){
    ensureExtraStyle();
    let seed,technicians=[];
    try{seed=await buildDataSnapshot(id,'PARECER_VOX',{});const members=await api(`user_companies?company_id=eq.${seed.company_id}&active=eq.true&select=user_id`).catch(()=>[]);const ids=members.map(m=>m.user_id);technicians=ids.length?await api(`profiles?id=in.(${ids.join(',')})&role=eq.TECNICO&active=eq.true&select=id,full_name&order=full_name`).catch(()=>[]):[];}catch(err){toast?.('Não foi possível carregar os dados da OS: '+err.message,'err');return;}
    document.querySelector('#vxDocEmitModal')?.remove();
    const ov=document.createElement('div');ov.id='vxDocEmitModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${reportOnly?'Gerar Parecer Técnico':'Emitir documento'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form class="vx-admin-form">
      <label>TIPO *</label><select name="document_type" id="vxDocTypeSelect">${Object.entries(DOC_TYPE_LABELS).filter(([v])=>!reportOnly||['PARECER_VOX','HISENSE','ASSURANT'].includes(v)).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
      <div id="vxDocCommon" class="vx-doc-extra"><p class="vx-sg-help">OS ${E(seed.os_numero)} · ${E(seed.cliente)} · ${E(seed.equipamento)}<br>Dados preenchidos a partir da OS. Revise antes de emitir.</p><label>DEFEITO RELATADO</label><textarea name="defeitoRelatado" rows="2">${E(seed.defeitoRelatado)}</textarea><label>DIAGNÓSTICO (opcional)</label><textarea name="diagnosticoTec" rows="2">${E(seed.diagnosticoTec)}</textarea><label>TÉCNICO RESPONSÁVEL</label><select name="responsavel"><option value="${E(seed.responsavel)}">${E(seed.responsavel||'Selecione o técnico')}</option>${technicians.filter(t=>t.full_name!==seed.responsavel).map(t=>`<option value="${E(t.full_name)}">${E(t.full_name)}</option>`).join('')}</select><label>LOCAL</label><input name="cidade" value="${E(seed.cidade)}"><label>DATA</label><input name="dataParecer" value="${E(seed.dataParecer)}"></div><div id="vxDocExtraWrap"></div><div id="vxDocPreview"></div>
      <p class="vx-sg-help">Registra uma emissão nova e abre pra impressão/PDF.</p>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button type="button" data-preview>VISUALIZAR</button><button class="primary">EMITIR E IMPRIMIR</button></div>
    </form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    const typeSelect=ov.querySelector('#vxDocTypeSelect'),extraWrap=ov.querySelector('#vxDocExtraWrap'),help=ov.querySelector('.vx-sg-help');
    const draftNodes={};let previousType;
    function refreshExtra(){
      if(previousType){const fragment=document.createDocumentFragment();while(extraWrap.firstChild)fragment.appendChild(extraWrap.firstChild);draftNodes[previousType]=fragment;}
      const type=typeSelect.value;
      const builder=EXTRA_FIELDS_HTML[type];
      const restored=!!draftNodes[type];
      if(restored)extraWrap.appendChild(draftNodes[type]);else extraWrap.innerHTML=builder?builder():'';
      ov.querySelector('#vxDocCommon').hidden=!builder;
      const values={parecerTecnico:seed.diagnosticoTec,pecasNecessarias:(seed.pecas||[]).map(p=>[p.part_code,p.description||p.part_description].filter(Boolean).join(' · ')).join('\n'),marcaProduto:/gorenje/i.test(seed.produtoMarca)?'gorenje':'hisense'};
      if(!restored)extraWrap.querySelectorAll('[name]').forEach(el=>{if(values[el.name]!=null)el.value=values[el.name]});previousType=type;
      ov.querySelector('[data-preview]').hidden=!builder;
      ov.querySelector('#vxDocPreview').innerHTML='';
      help.textContent=builder
        ? 'Revise os dados, complete o parecer e visualize antes de emitir. A assinatura visual acompanha o técnico selecionado. Alterações aqui pertencem ao documento; os dados da OS são preservados.'
        : 'Registra uma emissão nova (com os dados atuais da OS e os Termos vigentes) e abre pra impressão/PDF.';
    }
    typeSelect.onchange=refreshExtra;refreshExtra();
    ov.querySelector('[data-preview]').onclick=async()=>{
      const type=typeSelect.value;
      if(!EXTRA_FIELDS_HTML[type]){toast?.('A prévia está disponível para pareceres técnicos.','err');return;}
      const extra=await collectReportExtra(ov.querySelector('form'),type);
      const d={...seed,...extra,os_numero:type==='PARECER_VOX'?seed.os_numero:seed.manufacturer_os_number};
      const body=type==='PARECER_VOX'?buildVoxReportBody(d):type==='HISENSE'?buildHisenseBody(d):buildAssurantBody(d);
      const wrap=ov.querySelector('#vxDocPreview');wrap.innerHTML='<iframe title="Prévia do parecer" sandbox style="width:100%;height:480px;border:1px solid #dce5ed;border-radius:8px"></iframe>';
      wrap.firstChild.srcdoc='<!doctype html><meta charset="utf-8"><style>body{margin:12px;font:12px Arial;color:#173451}.doc{max-width:190mm;margin:auto}.head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #173b58;padding-bottom:12px}.head img{display:block}.box{border:1px solid #dde4ea;padding:10px;margin:10px 0}h3{font-size:12px;margin:0 0 8px}.row{display:flex;gap:12px;padding:4px 0}.row b{min-width:110px}td,th{padding:5px;text-align:left;border-bottom:1px solid #eee}*{box-sizing:border-box}</style>'+body;
    };

    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const form=e.target,btn=e.submitter,type=typeSelect.value;btn.disabled=true;
      try{
        const extra=await collectReportExtra(form,type);
        const snapshot=EXTRA_FIELDS_HTML[type]?{...seed,...extra,os_numero:type==='PARECER_VOX'?seed.os_numero:seed.manufacturer_os_number}:await buildDataSnapshot(id,type,extra);
        if(EXTRA_FIELDS_HTML[type]&&(!snapshot.responsavel||!(type==='HISENSE'?snapshot.diagnosticoTec:snapshot.parecerTecnico))&&!confirm('Este parecer está sem responsável ou diagnóstico. Deseja emitir mesmo assim?')){btn.disabled=false;return;}
        const r=await api('rpc/create_os_document_emission',{method:'POST',body:JSON.stringify({p_service_order_id:id,p_document_type:type,p_data_snapshot:snapshot,p_channel:'IMPRESSO'})});
        ov.remove();
        toast?.('Documento emitido.');
        const row=Array.isArray(r)?r[0]:r;
        if(row)reopenEmission(row);
        await showDocumentsPanel(id);
      }catch(err){toast?.('Não foi possível emitir: '+err.message,'err');btn.disabled=false;}
    };
  }

  async function buildDataSnapshot(id,type,extra){
    const [osRows,parts,finRows,brand]=await Promise.all([
      api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`),
      api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`),
      api(`os_financial?service_order_id=eq.${id}&select=*&limit=1`),
      typeof window.getActiveCompanyBranding==='function'?window.getActiveCompanyBranding().catch(()=>({})):Promise.resolve({}),
    ]);
    const o=osRows?.[0]||{},c=o.clients||{},e=o.equipments||{},fin=finRows?.[0]||{},b=brand||{};
    if(!o.id)throw new Error('OS não encontrada ou sem acesso.');
    const partsTotal=(parts||[]).reduce((s,p)=>s+Number(p.quantity||0)*Number(p.unit_value||0),0);
    const total=partsTotal+Number(fin.labor_value||0)+Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0)-Number(fin.discount_value||0);
    // Achado Fase C: campos comuns (cliente/equipamento/defeito/técnico) vêm
    // SEMPRE da mesma fonte canônica já usada pelo Whirlpool -- nunca
    // reperguntados ao usuário. Só os campos exclusivos de cada parecer
    // (recebidos em `extra`, preenchidos no modal) entram além disso.
    if(type==='PARECER_VOX'||type==='HISENSE'||type==='ASSURANT'){
      const base={
        os_numero:type==='PARECER_VOX'?o.os_number||'':o.manufacturer_os_number||o.os_number||'',
        manufacturer_os_number:o.manufacturer_os_number||o.os_number||'',company_id:o.company_id,
        logo_url:b.logo_url||new URL('icons/icon-192.png',location.href).href,
        cliente_documento:c.document||'',telefone:c.phone_primary||c.phone||c.mobile||'',
        endereco:[c.address,c.address_number,c.neighborhood,c.city,c.state].filter(Boolean).join(', '),
        equipamento:[e.product_type,e.brand,e.model].filter(Boolean).join(' · '),
        dataEntrada:(o.opened_at||o.created_at)?new Date(o.opened_at||o.created_at).toLocaleDateString('pt-BR'):'',
        pecas:parts||[],maoDeObra:Number(fin.labor_value||0),adicionais:Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0),desconto:Number(fin.discount_value||0),totalValor:total,
        assistenciaTec:b.trade_name||b.legal_name||'VOX ELETRÔNICA',
        cnpj:b.document||'',
        cliente:c.name||'',
        modeloProduto:e.model||'',
        numeroSerie:e.serial_number||'',
        produtoMarca:e.brand||'',
        defeitoRelatado:o.reported_defect||'',
        diagnosticoTec:o.diagnosed_defect||'',
        responsavel:o.profiles?.full_name||'',
        cidade:b.city||c.city||'',
        dataParecer:new Date().toLocaleDateString('pt-BR'),
      };
      return {...base,...extra};
    }
    return {
      os_numero:o.os_number||'',cliente:c.name||'',cliente_documento:c.document||'',
      equipamento:[e.product_type,e.brand,e.model].filter(Boolean).join(' • '),
      defeito_relatado:o.reported_defect||'',defeito_constatado:o.diagnosed_defect||'',servico:o.technical_service||'',
      pecas_total:money(partsTotal),mao_de_obra:money(fin.labor_value||0),total:money(total),
    };
  }

  window.vxOpenTechnicalReport=()=>state?.activeOs?.id?openEmitModal(state.activeOs.id,true):toast?.('Abra uma OS para gerar o parecer.','err');
  const baseRender=window.renderOsDetail;
  if(typeof baseRender==='function')window.renderOsDetail=async function(){const r=await baseRender.apply(this,arguments);setTimeout(injectDocumentsTab,120);return r};
  setTimeout(injectDocumentsTab,550);
})();
