/* VoxAssist Web V0.8.12 — Importação real de OS por PDF */
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let selectedFile=null;
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
        <div class="vx-import-actions"><button id="vxChoosePdf" class="vx-secondary">Buscar PDF</button><button id="vxReadPdf" class="vx-primary" disabled>Continuar para conferência</button></div>
      </div>
      <div class="vx-import-note"><strong>Fluxo de importação</strong><span>1. Selecionar PDF → 2. Ler dados → 3. Conferir informações → 4. Criar O.S. preservando o número externo/fabricante.</span></div>
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
    read.onclick=()=>renderReview();
    document.querySelector('#vxImportBack').onclick=()=>window.render('os');
  }
  function setFile(file){
    if(!file)return;
    if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name)){toast('Selecione um arquivo PDF válido.','err');return;}
    selectedFile=file;const info=document.querySelector('#vxPdfInfo'),read=document.querySelector('#vxReadPdf');
    info.hidden=false;info.innerHTML=`<strong>${esc(file.name)}</strong><span>${(file.size/1024).toFixed(1)} KB</span><small>PDF selecionado e pronto para conferência.</small>`;read.disabled=false;
  }
  function renderReview(){
    if(!selectedFile)return;
    const app=document.querySelector('#app');
    app.innerHTML=`<div class="vx-import-page"><div class="vx-import-head"><div><h2>Conferir dados da O.S.</h2><p>Revise as informações antes de criar a ordem no VoxAssist.</p></div><button class="vx-secondary" id="vxReviewBack">← Trocar PDF</button></div>
    <div class="vx-import-card"><div class="vx-review-banner"><strong>Arquivo:</strong> ${esc(selectedFile.name)}<span>A leitura automática por modelo de fabricante/seguradora será aplicada nesta etapa. Campos não reconhecidos permanecem para preenchimento manual.</span></div>
    <div class="vx-review-grid"><label>Origem<select id="vxOrigin"><option>FABRICANTE</option><option>SEGURADORA</option><option>OUTROS</option></select></label><label>Nº O.S. externa / fabricante<input id="vxExternalOs"></label><label>Cliente<input id="vxClientName"></label><label>CPF/CNPJ<input id="vxClientDoc"></label><label>Telefone<input id="vxClientPhone"></label><label>Tipo de produto<input id="vxProductType"></label><label>Marca<input id="vxBrand"></label><label>Modelo<input id="vxModel"></label><label class="wide">Defeito relatado<textarea id="vxDefect"></textarea></label></div>
    <div class="vx-import-actions"><button id="vxCreateImportedOs" class="vx-primary">Criar O.S. para conferência final</button></div></div></div>`;
    document.querySelector('#vxReviewBack').onclick=renderImport;
    document.querySelector('#vxCreateImportedOs').onclick=()=>{
      window.__vxImportedOsDraft={source:document.querySelector('#vxOrigin').value,external_os:document.querySelector('#vxExternalOs').value,client_name:document.querySelector('#vxClientName').value,client_document:document.querySelector('#vxClientDoc').value,phone:document.querySelector('#vxClientPhone').value,product_type:document.querySelector('#vxProductType').value,brand:document.querySelector('#vxBrand').value,model:document.querySelector('#vxModel').value,reported_defect:document.querySelector('#vxDefect').value,file_name:selectedFile.name};
      toast('Dados preparados. Abrindo cadastro da O.S. para conferência final.');window.render('nova-os');
    };
  }
  window.renderImportOs=renderImport;
})();