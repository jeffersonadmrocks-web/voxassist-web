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
  const DOC_TYPE_LABELS={ENTRADA:'Entrada',ORCAMENTO:'Orçamento',ENTREGA:'Entrega',HISENSE:'Parecer Técnico Hisense/Gorenje',ASSURANT:'Parecer Técnico Assurant'};
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
    if(r.document_type==='HISENSE')body=buildHisenseBody(d);
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
        <div style="margin-top:20px;text-align:right;padding-right:40px"><div style="font-weight:700;text-decoration:underline;font-size:13px">${E(d.responsavel)}</div><div style="font-size:11px">Técnico Responsável</div></div>
      </div>
    </div>`;
  }

  function buildAssurantBody(d){
    const cell='border:1px solid #333;padding:6px 8px;font-size:11px;vertical-align:top;height:22px';
    const label=`${cell};font-weight:700;background:#dbeafe;white-space:nowrap;width:22%`;
    const bar='background:#1e3a8a;color:#fff;font-weight:700;font-size:12px;padding:6px 10px;text-align:center;letter-spacing:1px';
    const colgroup='<colgroup><col style="width:22%"><col style="width:28%"><col style="width:22%"><col style="width:28%"></colgroup>';
    const row=(l,v)=>`<tr><td style="${label}">${l}</td><td style="${cell}">${E(v)||'&nbsp;'}</td></tr>`;
    return `<div id="parecer-print" style="background:#fff;color:#000;font-family:'Calibri',Arial,sans-serif;padding:15mm;width:210mm;min-height:297mm;margin:0 auto">
      <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;letter-spacing:2px;text-align:center">ANÁLISE TÉCNICA</h1>
      <div style="${bar}">ASSISTÊNCIA TÉCNICA</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px;table-layout:fixed">${colgroup}<tr>${row('Assistência:',d.assistenciaTec)}${row('CNPJ:',d.cnpj)}</tr></table>
      <div style="${bar}">CONSUMIDOR</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px;table-layout:fixed">${colgroup}<tr>${row('Serial:',d.numeroSerie)}${row('Sinistro:',d.sinistro)}</tr></table>
      <div style="${bar}">PRODUTO</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px;table-layout:fixed">${colgroup}<tr>${row('Marca:',d.produtoMarca)}${row('Modelo:',d.modeloProduto)}</tr></table>
      <div style="${bar}">PARECER TÉCNICO APÓS ANÁLISE DO PRODUTO:</div>
      <div style="border:1px solid #333;border-top:none;padding:8px;font-size:11px;min-height:50px;white-space:pre-wrap">${E(d.parecerTecnico)}</div>
      <div style="${bar};margin-top:6px">PEÇA QUE NECESSITA SER TROCADA E MOTIVO?</div>
      <div style="border:1px solid #333;border-top:none;padding:8px;font-size:11px;min-height:40px;white-space:pre-wrap">${E(d.pecaTrocar)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed">
        <colgroup><col style="width:44%"><col style="width:56%"></colgroup>
        <tr><td style="${label};width:44%">MOTIVO:</td><td style="${cell}">${E(d.motivo)||'&nbsp;'}</td></tr>
        <tr><td style="${label};width:44%">QUAL FOI A FORMA DE ATENDIMENTO?</td><td style="${cell}">${E(d.formaAtendimento)||'&nbsp;'}</td></tr>
        <tr><td style="${label};width:44%">PRODUTO FOI COLETADO?</td><td style="${cell}">${E(d.produtoColetado)||'&nbsp;'}</td></tr>
      </table>
      ${photoGridHtml(d.fotos,2,150)}
      ${photoGridHtml([{legenda:'COTAÇÃO DO ORÇAMENTO DA PEÇA ATÉ 30 DIAS',dataUrl:(d.cotacaoImgs||[])[0]},{legenda:'COTAÇÃO DO ORÇAMENTO DA PEÇA ATÉ 30 DIAS',dataUrl:(d.cotacaoImgs||[])[1]}],2,150)}
      ${photoGridHtml([{legenda:'FOTO RESIDÊNCIA DO SEGURADO',dataUrl:d.residenciaImg}],1,150)}
      <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:30px">
        <div style="text-align:center">
          <div style="position:relative;border-top:1px solid #000;padding-top:4px;font-size:11px;font-weight:700">
            ${d.responsavel?`<span style="position:absolute;left:50%;bottom:100%;transform:translate(-50%,20%) rotate(-4deg);font-family:'Jennifer Lynne Bold','Jennifer Lynne','Kristabelle','Great Vibes','Segoe Script',cursive;font-size:20px;font-weight:400;color:#1d4ed8;white-space:nowrap;pointer-events:none">${E(d.responsavel)}</span>`:''}
            ${E(d.responsavel)}
          </div>
          <div style="font-size:10px">Assinatura Técnico Responsável</div>
        </div>
        <div style="text-align:center"><div style="border-top:1px solid #000;padding-top:4px;font-size:11px">${E(d.cidade)} - ${E(d.dataParecer)||'___/___/______'}</div><div style="font-size:10px">Local e Data</div></div>
      </div>
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
  const EXTRA_FIELDS_HTML={HISENSE:hisenseExtraFieldsHtml,ASSURANT:assurantExtraFieldsHtml};

  async function openEmitModal(id){
    ensureExtraStyle();
    document.querySelector('#vxDocEmitModal')?.remove();
    const ov=document.createElement('div');ov.id='vxDocEmitModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>Emitir documento</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form class="vx-admin-form">
      <label>TIPO *</label><select name="document_type" id="vxDocTypeSelect">${Object.entries(DOC_TYPE_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
      <div id="vxDocExtraWrap"></div>
      <p class="vx-sg-help">Registra uma emissão nova e abre pra impressão/PDF.</p>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">EMITIR</button></div>
    </form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    const typeSelect=ov.querySelector('#vxDocTypeSelect'),extraWrap=ov.querySelector('#vxDocExtraWrap'),help=ov.querySelector('.vx-sg-help');
    function refreshExtra(){
      const type=typeSelect.value;
      const builder=EXTRA_FIELDS_HTML[type];
      extraWrap.innerHTML=builder?builder():'';
      help.textContent=builder
        ? 'Parecer técnico gerado a partir dos dados desta OS -- não usa Termos e Condições (é um documento interno pro fabricante/seguradora, não um contrato com o cliente).'
        : 'Registra uma emissão nova (com os dados atuais da OS e os Termos vigentes) e abre pra impressão/PDF.';
    }
    typeSelect.onchange=refreshExtra;refreshExtra();
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const form=e.target,btn=e.submitter,type=typeSelect.value;btn.disabled=true;
      try{
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
        const snapshot=await buildDataSnapshot(id,type,extra);
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
      api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`).catch(()=>[]),
      api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`).catch(()=>[]),
      api(`os_financial?service_order_id=eq.${id}&select=*&limit=1`).catch(()=>[]),
      typeof window.getActiveCompanyBranding==='function'?window.getActiveCompanyBranding().catch(()=>({})):Promise.resolve({}),
    ]);
    const o=osRows?.[0]||{},c=o.clients||{},e=o.equipments||{},fin=finRows?.[0]||{},b=brand||{};
    const partsTotal=(parts||[]).reduce((s,p)=>s+Number(p.quantity||0)*Number(p.unit_value||0),0);
    const total=partsTotal+Number(fin.labor_value||0)+Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0)-Number(fin.discount_value||0);
    // Achado Fase C: campos comuns (cliente/equipamento/defeito/técnico) vêm
    // SEMPRE da mesma fonte canônica já usada pelo Whirlpool -- nunca
    // reperguntados ao usuário. Só os campos exclusivos de cada parecer
    // (recebidos em `extra`, preenchidos no modal) entram além disso.
    if(type==='HISENSE'||type==='ASSURANT'){
      const base={
        os_numero:o.manufacturer_os_number||o.os_number||'',
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

  const baseRender=window.renderOsDetail;
  if(typeof baseRender==='function')window.renderOsDetail=async function(){const r=await baseRender.apply(this,arguments);setTimeout(injectDocumentsTab,120);return r};
  setTimeout(injectDocumentsTab,550);
})();
