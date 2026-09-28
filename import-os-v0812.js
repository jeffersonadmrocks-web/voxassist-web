/* VoxAssist Web V0.8.13 — Importação real de OS por PDF (leitura genérica por posição)
   Achado do usuário em 2026-09-27: a tela existia desde V0.8.12, mas nunca lia o PDF de
   verdade -- o usuário tinha que digitar tudo manualmente. Pedido explícito: nenhum modelo
   específico por fabricante, só leitura genérica de um PDF de OS com texto selecionável.
   Achado do usuário em 2026-09-28, testando com um PDF real de verdade (a validação
   anterior tinha sido feita só com um texto digitado à mão simulando o que a extração
   deveria encontrar -- nunca contra o pdf.js de verdade): o pressuposto "rótulo logo antes
   do valor" estava ERRADO pra esse documento real -- o padrão é o de uma tabela HTML
   comum (uma LINHA inteira de rótulos, depois uma LINHA inteira de valores logo abaixo,
   cada valor alinhado na mesma posição X do seu rótulo). Isso embolava tudo: "Número"
   do cabeçalho da assistência (sem relação com o cliente) virava o número do endereço,
   "Cliente" (substring de "APRESENTADO PELO CLIENTE", rótulo do defeito) virava o nome
   do cliente, e o e-mail do PRÓPRIO POSTO (no cabeçalho) vinha antes do e-mail real do
   cliente numa busca "primeiro e-mail do documento inteiro". Corrigido reconstruindo
   linhas por coordenada Y e casando cada valor com o rótulo mais próximo pela mesma
   coordenada X (buildLabelGrid) -- imune a célula vazia (ela só produz um valor vazio
   pro rótulo, não desalinha os outros, diferente de casar por ÍNDICE sequencial). A
   busca antiga por rótulo-imediatamente-antes-do-valor continua como PLANO B pra
   documentos que não seguem esse formato de tabela. A extração é só um PRIMEIRO
   PREENCHIMENTO: a tela de conferência (e depois o formulário de Nova O.S.) continua
   100% editável antes de qualquer gravação -- imprecisão da leitura nunca vira OS errada
   sem revisão humana. Mantém o número de OS do fabricante (nunca gera um novo) e pede
   confirmação da empresa (Vox Serra/Vox Vitória) antes de criar. */
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  let selectedFile=null;
  let extracted=null; // {fields, companies, guessedCompanyId, rawText}

  function renderImport(){
    state.view='importar-os';
    try{addTab('importar-os','Importar O.S.');renderTabs('Importar O.S.');}catch(e){}
    const title=document.querySelector('#title');if(title)title.textContent='Importar O.S.';
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML=`<div class="vx-import-page">
      <div class="vx-import-head"><div><h2>Importar O.S.</h2><p>Importe uma ordem de serviço recebida de fabricante ou seguradora em arquivo PDF.</p></div><button class="vx-secondary" id="vxImportBack">← Voltar</button></div>
      <div class="vx-import-card">
        <div id="vxDropPdf" class="vx-drop-pdf" tabindex="0">
          <div class="vx-drop-icon">⇧</div><strong>Arraste o arquivo PDF aqui</strong><span>ou clique para buscar o arquivo em uma pasta</span>
          <input id="vxPdfInput" type="file" accept="application/pdf,.pdf" hidden>
        </div>
        <div id="vxPdfInfo" class="vx-pdf-info" hidden></div>
        <div class="vx-import-actions"><button id="vxChoosePdf" class="vx-secondary">Buscar PDF</button><button id="vxReadPdf" class="vx-primary" disabled>Ler PDF e conferir dados</button></div>
      </div>
      <div class="vx-import-note"><strong>Fluxo de importação</strong><span>1. Selecionar PDF → 2. Ler dados automaticamente → 3. Conferir/corrigir informações → 4. Confirmar empresa → 5. Criar O.S. preservando o número do fabricante.</span></div>
    </div>`;
    bind();
  }
  function bind(){
    const drop=document.querySelector('#vxDropPdf'),input=document.querySelector('#vxPdfInput'),choose=document.querySelector('#vxChoosePdf'),read=document.querySelector('#vxReadPdf');
    if(!drop||!input)return;
    const pick=()=>input.click();drop.onclick=pick;drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')pick()};choose.onclick=pick;
    input.onchange=()=>setFile(input.files?.[0]);
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
    drop.addEventListener('drop',e=>setFile(e.dataTransfer?.files?.[0]));
    read.onclick=async()=>{
      read.disabled=true;read.textContent='Lendo PDF…';
      try{
        const {text,items}=await extractPdfData(selectedFile);
        extracted=await buildExtraction(text,items);
        renderReview();
      }catch(err){
        toast('Não foi possível ler o PDF automaticamente: '+(err?.message||err)+'. Você pode preencher manualmente na próxima tela.','err');
        extracted={fields:{},companies:[],guessedCompanyId:null,rawText:''};
        renderReview();
      }
    };
    document.querySelector('#vxImportBack').onclick=()=>window.render('os');
  }
  function setFile(file){
    if(!file)return;
    if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name)){toast('Selecione um arquivo PDF válido.','err');return;}
    selectedFile=file;const info=document.querySelector('#vxPdfInfo'),read=document.querySelector('#vxReadPdf');
    info.hidden=false;info.innerHTML=`<strong>${esc(file.name)}</strong><span>${(file.size/1024).toFixed(1)} KB</span><small>PDF selecionado. Clique em "Ler PDF e conferir dados".</small>`;read.disabled=false;read.textContent='Ler PDF e conferir dados';
  }

  /* ---------- Leitura do PDF (genérica, sem modelo por fabricante) ---------- */

  // Lê o texto E a posição (x,y) de cada item do PDF -- a posição é o que
  // permite reconstruir a tabela "linha de rótulos / linha de valores" (ver
  // comentário no topo do arquivo). `text` continua sendo o texto corrido
  // (ordem natural do documento), usado pra tudo que é indiferente à
  // posição: palpite de marca/tipo de produto, palpite de empresa, e o
  // plano B de leitura por rótulo-imediatamente-antes-do-valor.
  async function extractPdfData(file){
    if(typeof pdfjsLib==='undefined')throw new Error('Biblioteca de leitura de PDF não carregou.');
    if(!pdfjsLib.GlobalWorkerOptions.workerSrc){
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    const parts=[];
    const items=[];
    for(let p=1;p<=Math.min(pdf.numPages,3);p++){
      const page=await pdf.getPage(p);
      const content=await page.getTextContent();
      // Deslocamento grande em Y por página -- mantém cada página no seu
      // próprio "andar" de coordenadas, pra nunca misturar uma linha da
      // página 1 com uma linha da página 2 que caia na mesma altura.
      const pageOffset=(p-1)*100000;
      for(const it of content.items){
        const str=it.str&&it.str.trim();
        if(!str)continue;
        parts.push(str);
        items.push({str,x:it.transform[4],y:pageOffset-it.transform[5]});
      }
    }
    return {text:parts.join(' ').replace(/\s+/g,' ').trim(),items};
  }

  // Rótulos conhecidos (genéricos -- termos comuns em OS de qualquer
  // fabricante/seguradora/revenda) -- usado tanto como "parede" pra um
  // campo de texto livre não vazar pro valor do PRÓXIMO campo (plano B),
  // quanto pra reconhecer uma linha inteira como "linha de rótulos" na
  // reconstrução por posição (plano A).
  const KNOWN_LABELS=/\b(Informa[çc][õo]es sobre a (Ordem de Servi[çc]o|Revenda)|Fabricante|OS Fabricante|N[úu]mero (da )?O\.?S\.?|Ordem de Servi[çc]o|DATA DE ENTRADA[^,.;]*|DATA EMISS[ÃA]O|N[ÚU]MERO|Refer[êe]ncia|Descri[çc][ãa]o|N[úu]m\.?\s*de\s*S[ée]rie|N[ºo°]\s*de\s*S[ée]rie|Nome do Consumidor|Cliente|Cidade|Estado|UF|Fone|CELULAR|Celular|TELEFONE CELULAR|Telefone Comercial|TELEFONE COMERCIAL|Telefone[^,.;]*|E-?Mail|EMAIL|Endere[çc]o|N[úu]mero|Complemento|Bairro|CEP|CPF\s*\/?\s*CNPJ|CNPJ\s*\/?\s*CPF|IE\s*\/\s*RG|CPF|CNPJ|DEFEITO APRESENTADO PELO CLIENTE|Defeito|Reclama[çc][ãa]o|APAR[ÊE]NCIA GERAL DO PRODUTO|ACESS[óÓ]RIOS DEIXADOS PELO CLIENTE|ACESS[óÓ]RIOS|Quantidade|Servi[çc]o|Atendimento|Nome do T[ée]cnico|DESLOCAMENTO|Diagn[óo]stico|NF\s*N[º°.]?|Data\s*NF)\b/i;

  // ---- Plano A: reconstrução por posição (linha de rótulos -> linha de
  // valores, casando pela coordenada X) ----
  function groupRows(items){
    const byY=new Map();
    for(const it of items){
      const y=Math.round(it.y);
      if(!byY.has(y))byY.set(y,[]);
      byY.get(y).push(it);
    }
    return [...byY.keys()].sort((a,b)=>a-b).map(y=>({y,items:byY.get(y).slice().sort((a,b)=>a.x-b.x)}));
  }
  // Uma linha só conta como "linha de rótulos" se ela inteira for composta
  // por rótulos conhecidos (nada de texto solto misturado) -- é isso que
  // evita, por exemplo, tratar a linha do cabeçalho da assistência (nome
  // da empresa + endereço dela + a palavra solta "NÚMERO") como se fosse
  // uma linha de rótulos de verdade.
  function isLabelRow(row){
    const text=row.items.map(i=>i.str).join(' ');
    const stripped=text.replace(new RegExp(KNOWN_LABELS.source,'gi'),' ').replace(/[\s,.:;]+/g,'');
    return stripped.length===0&&row.items.some(i=>KNOWN_LABELS.test(i.str));
  }
  function buildLabelGrid(items){
    const rows=groupRows(items);
    const map={};
    for(let i=0;i<rows.length;i++){
      if(!isLabelRow(rows[i]))continue;
      const labelRow=rows[i];
      const valueRows=[];
      let j=i+1;
      while(j<rows.length&&!isLabelRow(rows[j])){valueRows.push(rows[j]);j++;}
      if(!valueRows.length)continue;
      const labels=labelRow.items;
      for(let k=0;k<labels.length;k++){
        const xStart=labels[k].x,xEnd=k+1<labels.length?labels[k+1].x:Infinity;
        const key=norm(labels[k].str);
        const parts=[];
        for(const vr of valueRows){
          const inBucket=vr.items.filter(v=>v.x>=xStart-5&&v.x<xEnd-2);
          if(inBucket.length)parts.push(inBucket.map(v=>v.str).join(' '));
        }
        const val=parts.join(' ').trim();
        if(val&&!map[key])map[key]=val; // primeira ocorrência vence (evita 2ª via/cópia sobrescrever)
      }
    }
    return map;
  }
  function gridGet(grid,...aliases){
    for(const a of aliases){const v=grid[norm(a)];if(v)return v;}
    return '';
  }
  // Refina um valor já isolado pelo grid (ex.: extrai só os dígitos do
  // tamanho esperado, ou só o trecho no formato de telefone/e-mail) --
  // continua funcionando mesmo se o valor vier "sujo" com texto ao redor.
  function digitsOfLength(str,length){
    if(!str)return '';
    const runs=str.match(/\d[\d.\-\/]{3,}/g)||[];
    for(const run of runs){const d=run.replace(/\D/g,'');if(d.length===length)return d;}
    const glued=str.match(new RegExp(`\\d{${length}}`));
    return glued?glued[0]:'';
  }
  function pickShape(str,re){const m=String(str||'').match(re);return m?m[0]:'';}

  function afterLabel(text,labelRe,windowChars=120){
    const m=text.match(labelRe);
    if(!m)return null;
    return {index:m.index,win:text.slice(m.index+m[0].length,m.index+m[0].length+windowChars)};
  }
  // Campo de texto livre: pega o trecho logo após o rótulo até o próximo
  // rótulo conhecido (ou até o limite da janela) -- nunca até o fim do
  // documento, pra não engolir o resto do PDF quando o rótulo não é achado.
  function textAfterLabel(text,labelRe,windowChars=90){
    const found=afterLabel(text,labelRe,windowChars);
    if(!found)return '';
    const cleaned=found.win.replace(/^[:\s]+/,'');
    const stop=cleaned.search(KNOWN_LABELS);
    return (stop>=0?cleaned.slice(0,stop):cleaned).trim();
  }
  // Campo numérico de tamanho fixo (CEP=8, CPF=11, CNPJ=14): procura, na
  // janela após o rótulo, uma sequência de dígitos com ou sem pontuação que
  // dê exatamente esse tamanho -- imune a desalinhamento de coluna, já que
  // não depende de posição nenhuma, só do texto e do formato esperado.
  function digitsAfterLabel(text,labelRe,length,windowChars=60){
    const found=afterLabel(text,labelRe,windowChars);
    if(!found)return '';
    const runs=found.win.match(/\d[\d.\-\/]{3,}/g)||[];
    for(const run of runs){const d=run.replace(/\D/g,'');if(d.length===length)return d;}
    const glued=found.win.match(new RegExp(`\\d{${length}}`));
    return glued?glued[0]:'';
  }
  function firstMatch(text,re){const m=text.match(re);return m?m[0]:'';}

  const PRODUCT_TYPE_HINTS=[
    ['REFRIGERADOR','REFRIGERADOR'],['GELADEIRA','REFRIGERADOR'],['FREEZER','FREEZER'],
    ['LAVA-LOUÇA','LAVA-LOUÇAS'],['LAVA LOUÇA','LAVA-LOUÇAS'],['LOUÇAS','LAVA-LOUÇAS'],
    ['LAVADORA','LAVADORA'],['SECADORA','SECADORA'],['FOGÃO','FOGÃO'],['FOGAO','FOGÃO'],
    ['MICRO-ONDAS','MICRO-ONDAS'],['MICROONDAS','MICRO-ONDAS'],['M. ONDAS','MICRO-ONDAS'],
    ['AR-CONDICIONADO','AR-CONDICIONADO'],['AR CONDICIONADO','AR-CONDICIONADO'],['SPLIT','AR-CONDICIONADO'],
    ['ADEGA','ADEGA'],['COIFA','COIFA'],[' TV ',' TV '],['TELEVISOR','TV'],[' TV',' TV'],
    ['ASPIRADOR','ASPIRADOR DE PÓ'],['LIQUIDIFICADOR','LIQUIDIFICADOR'],['BATEDEIRA','BATEDEIRA'],
    ['CAFETEIRA','CAFETEIRA'],['FERRO DE PASSAR','FERRO DE PASSAR'],['VENTILADOR','VENTILADOR'],
  ];
  const BRAND_HINTS=['BRASTEMP','CONSUL','ELECTROLUX','WHIRLPOOL','BRITÂNIA','BRITANIA','PHILCO','LG','SAMSUNG','SONY','PANASONIC','MIDEA','PHILIPS','GE','DAKO','FISCHER','ESMALTEC','VENAX','MONDIAL'];

  function guessFromText(fullText,hints){
    const t=norm(fullText);
    for(const h of Array.isArray(hints[0])?hints:hints.map(x=>[x,x])){
      const [needle,label]=Array.isArray(h)?h:[h,h];
      if(t.includes(norm(needle)))return label.trim();
    }
    return '';
  }

  async function memberships(){
    const uid=state?.session?.user?.id;
    if(!uid)return [];
    try{
      const rows=await api(`user_companies?user_id=eq.${uid}&active=eq.true&select=company_id,companies(id,legal_name,trade_name)&order=is_default.desc`);
      return (rows||[]).map(r=>({id:r.company_id,name:r.companies?.trade_name||r.companies?.legal_name||'EMPRESA'}));
    }catch{return [];}
  }

  async function buildExtraction(text,items){
    const grid=buildLabelGrid(items||[]);
    const externalOs=
      gridGet(grid,'OS Fabricante','Número da OS','Número O.S.','Numero da OS')||
      firstMatch(afterLabel(text,/\bOS\s*Fabricante\b/i,30)?.win||'',/[0-9A-Za-z-]{5,}/)||
      firstMatch(afterLabel(text,/\bN[úu]mero\s*(da\s*)?O\.?S\.?\b/i,30)?.win||'',/[0-9A-Za-z-]{5,}/)||
      firstMatch(afterLabel(text,/\bOrdem\s*de\s*Servi[çc]o\s*N[ºo°]?\b/i,30)?.win||'',/[0-9A-Za-z-]{5,}/)||'';
    const description=gridGet(grid,'Descrição','Descricao')||textAfterLabel(text,/\bDescri[çc][ãa]o\b/i);
    let serial=gridGet(grid,'Núm. de Série','Num. de Serie','N° de Série','Nº de Série')||textAfterLabel(text,/\bN[úu]m\.?\s*de\s*S[ée]rie\b/i)||textAfterLabel(text,/\bN[ºo°]\s*de\s*S[ée]rie\b/i);
    let model=description||gridGet(grid,'Modelo')||textAfterLabel(text,/\bModelo\b/i);
    // Quando a linha de rótulos não tinha uma coluna própria pra "Núm. de
    // Série" (acontece na 1ª via de alguns documentos, que repete os dados
    // sem esse rótulo), o valor do número de série cola no final da
    // Descrição -- corta fora se sobrou grudado.
    if(serial&&model&&model!==serial&&model.endsWith(serial)){
      model=model.slice(0,model.length-serial.length).trim();
    }
    const emailRaw=gridGet(grid,'E-Mail','Email');
    const phoneRaw=gridGet(grid,'Celular','CELULAR','Telefone Celular','TELEFONE CELULAR','Fone','Telefone Comercial','TELEFONE COMERCIAL');
    const fields={
      external_os:externalOs,
      client_name:gridGet(grid,'Nome do Consumidor')||textAfterLabel(text,/\bNome\s*do\s*Consumidor\b/i),
      document:digitsOfLength(gridGet(grid,'CPF/CNPJ','CNPJ/CPF','CPF'),11)||digitsOfLength(gridGet(grid,'CPF/CNPJ','CNPJ/CPF','CNPJ'),14)||digitsAfterLabel(text,/\bCPF\s*\/?\s*CNPJ\b/i,11)||digitsAfterLabel(text,/\bCPF\b/i,11)||digitsAfterLabel(text,/\bCNPJ\b/i,14),
      // Telefone/e-mail têm formato distintivo -- ancorados na coluna certa
      // do grid (evita pegar o telefone/e-mail do CABEÇALHO da assistência,
      // que também aparecem no documento, antes dos dados do cliente).
      phone:pickShape(phoneRaw,/\(\d{2}\)\s?9?\d{3,5}-?\d{4}/)||firstMatch(text,/\(\d{2}\)\s?9?\d{3,5}-?\d{4}/),
      email:pickShape(emailRaw,/[\w.+-]+@[\w-]+\.[\w.-]+/)||firstMatch(text,/[\w.+-]+@[\w-]+\.[\w.-]+/),
      zip:digitsOfLength(gridGet(grid,'CEP'),8)||digitsAfterLabel(text,/\bCEP\b/i,8),
      address:gridGet(grid,'Endereço','Endereco')||textAfterLabel(text,/\bEndere[çc]o\b/i),
      address_number:gridGet(grid,'Número','Numero')||textAfterLabel(text,/\bN[úu]mero\b/i,20),
      neighborhood:gridGet(grid,'Bairro')||textAfterLabel(text,/\bBairro\b/i),
      city:gridGet(grid,'Cidade')||textAfterLabel(text,/\bCidade\b/i,40),
      state:(gridGet(grid,'Estado','UF')||textAfterLabel(text,/\bEstado\b/i,10)||textAfterLabel(text,/\bUF\b/i,10)||'').slice(0,2),
      defect:gridGet(grid,'DEFEITO APRESENTADO PELO CLIENTE','Defeito','Reclamação')||textAfterLabel(text,/\bDEFEITO\s*APRESENTADO\s*PELO\s*CLIENTE\b/i,200)||textAfterLabel(text,/\bDefeito\b/i,200)||textAfterLabel(text,/\bReclama[çc][ãa]o\b/i,200),
      model,
      serial,
      product_type:guessFromText(description+' '+text,PRODUCT_TYPE_HINTS),
      brand:guessFromText(text,BRAND_HINTS),
    };
    const companies=await memberships();
    const guess=companies.find(c=>{
      const key=norm(c.name).replace(/^VOX\s*/,'');
      return key&&(norm(text).includes(key)||norm(fields.city).includes(key)||norm(key).includes(norm(fields.city||'')));
    });
    return {fields,companies,guessedCompanyId:guess?.id||companies[0]?.id||null,rawText:text};
  }

  /* ---------- Conferência (sempre editável antes de criar a OS) ---------- */

  function renderReview(){
    if(!selectedFile||!extracted)return;
    const f=extracted.fields,companies=extracted.companies;
    const app=document.querySelector('#app');
    app.innerHTML=`<div class="vx-import-page"><div class="vx-import-head"><div><h2>Conferir dados da O.S.</h2><p>Dados lidos automaticamente do PDF -- revise e corrija antes de criar a ordem no VoxAssist.</p></div><button class="vx-secondary" id="vxReviewBack">← Trocar PDF</button></div>
    <div class="vx-import-card"><div class="vx-review-banner"><strong>Arquivo:</strong> ${esc(selectedFile.name)}<span>${f.external_os||f.client_name?'Leitura automática aplicada -- confira cada campo antes de continuar.':'Não foi possível reconhecer os campos automaticamente neste PDF -- preencha manualmente.'}</span></div>
    <div class="vx-review-grid">
      <label>Empresa (confirme antes de criar) *<select id="vxImportCompany">${companies.length?companies.map(c=>`<option value="${esc(c.id)}" ${c.id===extracted.guessedCompanyId?'selected':''}>${esc(c.name)}</option>`).join(''):'<option value="">Nenhuma empresa vinculada</option>'}</select></label>
      <label>Origem<select id="vxOrigin"><option>FABRICANTE</option><option>SEGURADORA</option><option>OUTROS</option></select></label>
      <label>Nº O.S. do fabricante (mantido ao criar)<input id="vxExternalOs" value="${esc(f.external_os)}"></label>
      <label>Cliente<input id="vxClientName" value="${esc(f.client_name)}"></label>
      <label>CPF/CNPJ<input id="vxClientDoc" value="${esc(f.document)}"></label>
      <label>Telefone<input id="vxClientPhone" value="${esc(f.phone)}"></label>
      <label>E-mail<input id="vxClientEmail" value="${esc(f.email)}"></label>
      <label>CEP<input id="vxClientZip" value="${esc(f.zip)}"></label>
      <label>Endereço<input id="vxClientAddress" value="${esc(f.address)}"></label>
      <label>Número<input id="vxClientNumber" value="${esc(f.address_number)}"></label>
      <label>Bairro<input id="vxClientNeighborhood" value="${esc(f.neighborhood)}"></label>
      <label>Cidade<input id="vxClientCity" value="${esc(f.city)}"></label>
      <label>Estado<input id="vxClientState" value="${esc(f.state)}" maxlength="2"></label>
      <label>Tipo de produto<input id="vxProductType" value="${esc(f.product_type)}"></label>
      <label>Marca<input id="vxBrand" value="${esc(f.brand)}"></label>
      <label>Modelo<input id="vxModel" value="${esc(f.model)}"></label>
      <label>Nº de série<input id="vxSerial" value="${esc(f.serial)}"></label>
      <label class="wide">Defeito relatado<textarea id="vxDefect">${esc(f.defect)}</textarea></label>
    </div>
    <div class="vx-import-actions"><button id="vxCreateImportedOs" class="vx-primary">Continuar para Nova O.S.</button></div></div></div>`;
    document.querySelector('#vxReviewBack').onclick=renderImport;
    document.querySelector('#vxCreateImportedOs').onclick=()=>{
      const companyId=document.querySelector('#vxImportCompany').value;
      if(!companyId){toast('Selecione a empresa (Vox Serra ou Vox Vitória) antes de continuar.','err');return;}
      window.__vxImportedOsDraft={
        company_id:companyId,
        external_os:document.querySelector('#vxExternalOs').value.trim(),
        source:document.querySelector('#vxOrigin').value,
        client_name:document.querySelector('#vxClientName').value,
        client_document:document.querySelector('#vxClientDoc').value,
        phone:document.querySelector('#vxClientPhone').value,
        email:document.querySelector('#vxClientEmail').value,
        zip:document.querySelector('#vxClientZip').value,
        address:document.querySelector('#vxClientAddress').value,
        address_number:document.querySelector('#vxClientNumber').value,
        neighborhood:document.querySelector('#vxClientNeighborhood').value,
        city:document.querySelector('#vxClientCity').value,
        state:document.querySelector('#vxClientState').value,
        product_type:document.querySelector('#vxProductType').value,
        brand:document.querySelector('#vxBrand').value,
        model:document.querySelector('#vxModel').value,
        serial:document.querySelector('#vxSerial').value,
        reported_defect:document.querySelector('#vxDefect').value,
        file_name:selectedFile.name,
      };
      toast('Dados preparados. Abrindo cadastro da O.S. para conferência final.');window.render('nova-os');
    };
  }
  window.renderImportOs=renderImport;
})();
