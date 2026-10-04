/* VoxAssist V0.8.13 — extensão Whirlpool dentro da OS + impressão revisada
   Correção de arquitetura em 2026-09-12 (achado do usuário: "não deve
   existir uma segunda OS, e sim uma visão especializada da mesma OS,
   com fonte única de dados"): este arquivo antes montava seu PRÓPRIO
   formulário simples (campos duplicados com o mesmo `name` dos campos
   do documento fiel) e seu PRÓPRIO saveWhirlpool(), amarrado ao botão
   #vxWpSave via `.onclick=`. whirlpool-complete-factory-v0813.js (que
   carrega depois) já é a implementação canônica completa -- formulário
   fiel, permissão por campo (setMode), fotos/anexos (tabela
   `attachments` genérica), assinatura do consumidor (`appointments.
   customer_signature`) e salvamento único (saveAll) -- e prende no
   MESMO botão um listener em fase de captura. Isso fazia os DOIS
   handlers dispararem no mesmo clique (.onclick primeiro, o listener de
   captura depois), cada um gravando no banco de forma independente e
   assíncrona -- uma corrida de escrita real, não só um problema visual.
   Este arquivo agora só cria a aba/painel/casca (que
   whirlpool-complete-factory-v0813.js enriquece) e cuida da impressão,
   que não é duplicada em nenhum outro lugar. */
(function(){
  const E=window.esc||((v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const norm=v=>String(v||'').toUpperCase().trim();
  const isWhirlpool=o=>['WHIRLPOOL','BRASTEMP','CONSUL'].includes(norm(o?.manufacturer))||['WHIRLPOOL','BRASTEMP','CONSUL'].includes(norm(o?.equipments?.brand))||norm(o?.equipments?.document_model)==='WHIRLPOOL';

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

  async function injectWhirlpoolTab(){
    const o=state?.activeOs;if(!o||!isWhirlpool(o))return;
    const tabs=document.querySelector('.vx-os-tabs');if(!tabs||tabs.querySelector('[data-section="whirlpool"]'))return;
    const b=document.createElement('button');b.dataset.section='whirlpool';b.textContent='WHIRLPOOL';b.className='vx-whirlpool-tab';
    b.onclick=()=>showWhirlpoolPanel(o.id);tabs.appendChild(b);
    const head=document.querySelector('.vx-os-head-left');if(head&&!head.querySelector('.vx-whirlpool-badge')){const badge=document.createElement('span');badge.className='vx-whirlpool-badge';badge.textContent=`${norm(o.manufacturer)||norm(o.equipments?.brand)||'WHIRLPOOL'} • OS FABRICANTE`;head.appendChild(badge)}
  }

  // Achado em 2026-09-12 (investigação do congelamento/EDITAR inoperante):
  // showWhirlpoolPanel() não tinha nenhuma proteção contra reentrância. Um
  // usuário clicando a aba WHIRLPOOL de novo (comum quando a tela "parece"
  // não responder) disparava uma SEGUNDA chamada, com seu próprio
  // loadBundle() concorrente -- e como nada cancelava a primeira, quem
  // escrevia por último no painel era a chamada cuja resposta de rede
  // chegasse depois, não necessariamente a do clique mais recente. wpPanelGen
  // marca qual é a chamada "atual"; uma chamada cuja resposta chega depois
  // de já ter sido substituída por uma mais nova simplesmente não escreve
  // mais nada no DOM.
  let wpPanelGen=0;
  async function showWhirlpoolPanel(id){
    const gen=++wpPanelGen;
    document.querySelectorAll('.vx-os-panel').forEach(p=>p.classList.add('hidden'));
    document.querySelectorAll('.vx-os-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.section==='whirlpool'));
    let panel=document.querySelector('#vx-whirlpool');if(!panel){panel=document.createElement('section');panel.id='vx-whirlpool';panel.className='vx-os-panel';document.querySelector('#app')?.appendChild(panel)}panel.classList.remove('hidden');panel.innerHTML='<div class="vx-screen-box">Carregando modo Whirlpool...</div>';
    const d=await loadBundle(id),o=d.o;
    if(gen!==wpPanelGen)return; // uma chamada mais nova (outro clique) já assumiu -- esta ficou obsoleta
    // O corpo do formulário (documento fiel Whirlpool, com todos os
    // campos) é injetado por whirlpool-complete-factory-v0813.js dentro
    // do <form id="vxWpForm"> -- este painel só monta a casca (cabeçalho,
    // ações, formulário vazio) e reage à mutação do DOM.
    panel.innerHTML=`<div class="vx-screen-box"><div class="vx-wp-head"><div><h3>OS ${E(o?.os_number||'')} • WHIRLPOOL / ${E(norm(o?.manufacturer)||norm(o?.equipments?.brand)||'')} ${typeof window.vxStatusBadge==='function'?window.vxStatusBadge('EM HOMOLOGAÇÃO','Salvar e imprimir já são reais; a consolidação visual dos ajustes de layout está em andamento.'):''}</h3><small>Visão especializada da mesma OS VoxAssist. Dashboard, Agenda, Financeiro e Histórico continuam usando a mesma OS.</small></div><button class="vx-action" id="vxWpPrint">IMPRIMIR</button></div>
      <form id="vxWpForm" class="vx-wp-grid">
        <div class="wide vx-wp-actions"><button type="button" class="vx-action" id="vxWpSave">SALVAR</button><button type="button" class="vx-action" id="vxWpOpenOriginal" ${d.imp?.original_file_data?'':'disabled'}>ABRIR PDF ORIGINAL</button></div>
      </form></div>`;
    document.querySelector('#vxWpPrint').onclick=()=>window.vxPrintOsDocument('whirlpool');
    document.querySelector('#vxWpOpenOriginal').onclick=()=>{if(d.imp?.original_file_data)window.open(d.imp.original_file_data,'_blank')};
  }

  // Exposto pra os-whirlpool-extension-v0813.js poder chamar o mesmo
  // documento oficial (printFaithful) também no caminho 'auto', sem
  // depender só desta interceptação de window.vxPrintOsDocument (que
  // só cobria kind==='whirlpool' explícito -- ver achado no outro
  // arquivo, plano "Arquitetura de Documentos da OS" Fase 1).
  window.vxPrintShell=(...args)=>printShell(...args);
  function printShell(title,body){
    const w=window.open('','_blank','width=1000,height=800');if(!w)return toast('O navegador bloqueou a janela de impressão.','err');
    // Achado do usuário em 2026-09-03: "todos os modelos enviados por
    // WhatsApp ou impressos devem ser idênticos" -- o modelo VOX
    // (printVox) ganhou o visual novo aprovado no mockup do início
    // desta sessão (cabeçalho azul-marinho, cards arredondados),
    // igual à tela de edição (os-detail-redesign-v0813.css) e ao PDF
    // enviado pelo Chat (que copia este HTML/CSS literalmente). TUDO
    // isolado dentro da classe .vox (só o wrapper de printVox tem
    // essa classe) -- as regras base (.head/.box/.grid/.row/.osno/
    // .sign/.footer) continuam EXATAMENTE como estavam, porque o
    // documento Whirlpool (printWhirlpool, classe .wp) não deve ser
    // alterado em nada.
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${E(title)}</title><style>@page{size:A4;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10px}.doc{width:100%}.head{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border-bottom:2px solid #163754;padding-bottom:8px;margin-bottom:8px}.head img{max-width:130px;max-height:60px}.osno{font-size:21px;font-weight:800;color:#163754}.muted{color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.box{border:1px solid #9aa9b8;border-radius:4px;padding:7px;margin-bottom:7px}.box h3{font-size:10px;margin:0 0 5px;color:#163754}.row{display:grid;grid-template-columns:130px 1fr;border-bottom:1px solid #e3e8ed;padding:3px 0}.row:last-child{border:0}.row b{font-size:8px}.wp table{width:100%;border-collapse:collapse;margin:0 0 3px}.wp td,.wp th{border:1px solid #111;padding:3px;font-size:8px;vertical-align:top}.wp th{background:#f2f2f2}.wp .title{font-weight:800;text-align:center}.sign{height:52px;border-top:1px solid #777;margin-top:24px;text-align:center;padding-top:4px}.footer{font-size:8px;text-align:center;margin-top:8px;color:#5d6b78}@media print{button{display:none!important}}.vox .head{background:linear-gradient(135deg,#0b2b4a,#123a61);color:#fff;border-radius:10px;padding:12px 14px;border-bottom:0}.vox .head .muted{color:#9fc1e6}.vox .osno{color:#fff}.vox .box{border:1px solid #e1e8ef;border-radius:10px;box-shadow:0 1px 2px rgba(15,42,68,.08);padding:9px 11px}.vox .box h3{color:#1976d2;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}.vox .row{border-bottom:1px solid #eef2f6}.vox .row b{color:#5e7188}.vox .sign{border-top:1px solid #c7d0d9;color:#5e7188}.vox .footer{color:#5e7188}</style></head><body>${body}<script>window.addEventListener("load",async()=>{await Promise.all(Array.from(document.images,img=>img.decode().catch(()=>{})));await document.fonts.ready;const doc=document.querySelector(".doc.vox,.assurant-report");if(doc){const fit=()=>{doc.style.zoom=1;const height=doc.getBoundingClientRect().height;const pageHeight=280*96/25.4;doc.style.zoom=Math.min(1,pageHeight/Math.max(1,height));};fit();window.addEventListener("beforeprint",fit);}window.print();})<\/script></body></html>`);w.document.close();
  }

  // Achado do usuário em 2026-09-27: "Imprimir O.S." de uma OS nativa
  // (não-Whirlpool) sempre gerava o MESMO documento único (cliente +
  // equipamento + defeito + orçamento + 2 assinaturas), sem separar por
  // etapa do atendimento -- só existia a escolha Whirlpool x VoxAssist.
  // Pedido explícito: ENTRADA (recibo de recebimento, sem valor nenhum --
  // o cliente confirmou que orçamento não deve aparecer aqui), ORÇAMENTO
  // (diagnóstico + valores, pra aprovação) e ENTREGA (laudo completo +
  // valores + confirmação de retirada, comprovante final).
  const DOC_LABELS={entrada:'ENTRADA',orcamento:'ORÇAMENTO',entrega:'ENTREGA'};
  function chooseVoxDocType(){
    return new Promise(resolve=>{
      document.querySelector('#vxDocTypeModal')?.remove();
      const ov=document.createElement('div');ov.id='vxDocTypeModal';ov.className='vx-admin-overlay';
      ov.innerHTML=`<div class="vx-admin-modal" style="width:min(420px,92vw)"><div class="vx-admin-modal-head"><h3>Qual documento imprimir?</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body" style="display:grid;gap:8px">
        <button type="button" class="secondary" data-doc="entrada" style="text-align:left;padding:12px;cursor:pointer">📥 <b>ENTRADA</b><br><small style="color:#5e7188">Recibo de recebimento do aparelho, sem valores.</small></button>
        <button type="button" class="secondary" data-doc="orcamento" style="text-align:left;padding:12px;cursor:pointer">💰 <b>ORÇAMENTO</b><br><small style="color:#5e7188">Diagnóstico e valores, para aprovação do cliente.</small></button>
        <button type="button" class="secondary" data-doc="entrega" style="text-align:left;padding:12px;cursor:pointer">✅ <b>ENTREGA</b><br><small style="color:#5e7188">Laudo completo, valores e confirmação de retirada.</small></button>
      </div></div>`;
      document.body.appendChild(ov);
      const close=()=>{ov.remove();resolve(null)};
      ov.querySelector('[data-close]').onclick=close;
      ov.addEventListener('click',e=>{if(e.target===ov)close()});
      ov.querySelectorAll('[data-doc]').forEach(btn=>btn.onclick=()=>{ov.remove();resolve(btn.dataset.doc)});
    });
  }
  async function printVox(id,docType){
    if(!docType)return; // usuário fechou a escolha do documento sem selecionar
    const d=await loadBundle(id),o=d.o,c=o.clients||{},e=o.equipments||{},b=d.brand||{},parts=d.parts||[],fin=d.fin||{};
    const partsTotal=parts.reduce((s,p)=>s+Number(p.quantity||0)*Number(p.unit_value||0),0);
    const total=partsTotal+Number(fin.labor_value||0)+Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0)-Number(fin.discount_value||0);
    const clienteBox=`<div class="box"><h3>👤 CLIENTE</h3><div class="row"><b>NOME</b><span>${E(c.name)}</span></div><div class="row"><b>CPF/CNPJ</b><span>${E(c.document)}</span></div><div class="row"><b>TELEFONE</b><span>${E(c.phone_primary)}</span></div><div class="row"><b>ENDEREÇO</b><span>${E([c.address,c.address_number,c.complement,c.neighborhood,c.city,c.state].filter(Boolean).join(', '))}</span></div></div>`;
    const equipBox=`<div class="box"><h3>📦 EQUIPAMENTO</h3><div class="row"><b>PRODUTO</b><span>${E(e.product_type)}</span></div><div class="row"><b>MARCA / MODELO</b><span>${E([e.brand,e.model].filter(Boolean).join(' • '))}</span></div><div class="row"><b>SÉRIE</b><span>${E(e.serial_number)}</span></div><div class="row"><b>ATENDIMENTO</b><span>${E(o.service_type)}</span></div></div>`;
    let middle='',signBox='';
    if(docType==='entrada'){
      // Só recebimento -- nenhum valor de orçamento (mesmo que já exista
      // um preenchido na OS), achado do usuário: documento de entrada
      // nunca deve mostrar preço, só o que foi recebido e o termo.
      middle=`<div class="box"><h3>🔧 DEFEITO RELATADO PELO CLIENTE</h3><div class="row"><b>DEFEITO</b><span>${E(o.reported_defect)}</span></div></div>
        <div class="box"><h3>📋 TERMO DE ENTRADA</h3><div style="font-size:8px;color:#5e7188;line-height:1.5">Declaro que entreguei o equipamento acima descrito para avaliação técnica nesta assistência. Estou ciente de que o orçamento será elaborado após o diagnóstico, e que a aprovação é necessária antes do início do reparo.</div></div>`;
      signBox=`<div class="grid"><div class="sign">ASSINATURA DO CLIENTE (ENTRADA)</div><div class="sign">ASSINATURA DO ATENDENTE</div></div>`;
    }else if(docType==='orcamento'){
      middle=`<div class="box"><h3>🔎 DIAGNÓSTICO TÉCNICO</h3><div class="row"><b>DEFEITO RELATADO</b><span>${E(o.reported_defect)}</span></div>${String(o.diagnosed_defect||'').trim()?'<div class="row"><b>DEFEITO CONSTATADO</b><span>'+E(o.diagnosed_defect)+'</span></div>':''}<div class="row"><b>SERVIÇO / LAUDO</b><span>${E(o.technical_service)}</span></div></div>
        <div class="box"><h3>💰 ORÇAMENTO</h3><div class="row"><b>PEÇAS</b><span>${money(partsTotal)}</span></div><div class="row"><b>MÃO DE OBRA</b><span>${money(fin.labor_value||0)}</span></div><div class="row"><b>TOTAL</b><span><strong>${money(total)}</strong></span></div></div>`;
      signBox=`<div class="grid"><div class="sign">ASSINATURA DO CLIENTE (APROVAÇÃO DO ORÇAMENTO)</div><div class="sign">ASSINATURA DO TÉCNICO</div></div>`;
    }else{
      // Achado do usuário: entrega leva o laudo completo (não só a
      // confirmação) -- comprovante final único que o cliente leva.
      middle=`<div class="box"><h3>🔧 SERVIÇO REALIZADO</h3><div class="row"><b>DEFEITO RELATADO</b><span>${E(o.reported_defect)}</span></div>${String(o.diagnosed_defect||'').trim()?'<div class="row"><b>DEFEITO CONSTATADO</b><span>'+E(o.diagnosed_defect)+'</span></div>':''}<div class="row"><b>SERVIÇO / LAUDO</b><span>${E(o.technical_service)}</span></div></div>
        <div class="box"><h3>💰 VALORES</h3><div class="row"><b>PEÇAS</b><span>${money(partsTotal)}</span></div><div class="row"><b>MÃO DE OBRA</b><span>${money(fin.labor_value||0)}</span></div><div class="row"><b>TOTAL</b><span><strong>${money(total)}</strong></span></div></div>`;
      signBox=`<div class="grid"><div class="sign">ASSINATURA DO CLIENTE (RETIRADA)</div><div class="sign">ASSINATURA DO TÉCNICO</div></div>`;
    }
    const body=`<div class="doc vox"><div class="head"><div>${b.logo_url?`<img src="${E(b.logo_url)}">`:''}<div><b>${E(b.trade_name||b.legal_name||'VOXASSIST')}</b></div><div class="muted">${E([b.address,b.address_number,b.city,b.state].filter(Boolean).join(' • '))}</div><div class="muted">${E([b.phone,b.mobile,b.email].filter(Boolean).join(' • '))}</div></div><div><div class="muted">ORDEM DE SERVIÇO • ${DOC_LABELS[docType]}</div><div class="osno">${E(o.os_number)}</div><div>${E(String(o.status||'').replaceAll('_',' '))}</div></div></div><div class="grid">${clienteBox}${equipBox}</div>${middle}${signBox}<div class="footer">${E(b.document_footer||b.document_header_note||'')}</div></div>`;
    printShell('OS '+o.os_number+' - '+DOC_LABELS[docType],await window.vxRefineOsDocument(body,o,parts,fin,b,docType));
  }

  // Achado do usuário (plano "Arquitetura de Documentos da OS", Fase 1
  // -- 2026-09-09): "GERAR PDF" do cabeçalho (kind='auto') e o botão da
  // aba Whirlpool chamavam 2 documentos DIFERENTES pra mesma OS
  // Whirlpool -- este arquivo tinha seu PRÓPRIO printWhirlpool (mais
  // antigo, removido em 2026-09-12 por não ser mais usado por nenhum
  // caminho), enquanto whirlpool-faithful-mode-v0813.js (que carrega
  // DEPOIS e embrulha window.vxPrintOsDocument) intercepta
  // kind==='whirlpool' explícito. printFaithful é o layout oficial.
  function printWhirlpoolOfficial(id){
    return typeof window.vxPrintWhirlpoolFaithful==='function'?window.vxPrintWhirlpoolFaithful(id):toast('Documento Whirlpool indisponível -- recarregue a página.','err');
  }
  window.vxPrintOsDocument=async function(kind='auto'){
    const o=state?.activeOs;if(!o)return toast('Abra uma OS antes de imprimir.','err');
    if(kind==='whirlpool')return printWhirlpoolOfficial(o.id);
    if(kind==='vox-entrada'||kind==='vox-orcamento'||kind==='vox-entrega')return printVox(o.id,kind.slice(4));
    if(kind==='vox')return printVox(o.id,await chooseVoxDocType());
    if(isWhirlpool(o)){
      const useWp=confirm('Esta é uma OS Whirlpool (Brastemp/Consul).\n\nOK = imprimir documento Whirlpool\nCancelar = imprimir modelo padrão VoxAssist');
      if(useWp)return printWhirlpoolOfficial(o.id);
      return printVox(o.id,await chooseVoxDocType());
    }
    return printVox(o.id,await chooseVoxDocType());
  };
  window.printOs=()=>window.vxPrintOsDocument('auto');

  async function technicianBadge(){const o=state?.activeOs;if(!o||!isWhirlpool(o))return;const role=norm(state?.profile?.role);if(role==='TECNICO'){const tab=document.querySelector('[data-section="whirlpool"]');if(tab){tab.title='Modo de atendimento Whirlpool do técnico';if(tab.textContent!=='WHIRLPOOL • ATENDIMENTO')tab.textContent='WHIRLPOOL • ATENDIMENTO'}const note=document.querySelector('.vx-wp-head small');const noteText='Fluxo Whirlpool de atendimento externo. Preencha e salve diretamente no VoxAssist.';if(note&&note.textContent!==noteText)note.textContent=noteText}}
  const obs=new MutationObserver(()=>setTimeout(technicianBadge,40));obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(technicianBadge,300);

  const base=window.renderOsDetail;
  if(typeof base==='function')window.renderOsDetail=async function(){const r=await base.apply(this,arguments);setTimeout(injectWhirlpoolTab,100);return r};
  setTimeout(injectWhirlpoolTab,500);

  const st=document.createElement('style');st.textContent=`.vx-whirlpool-badge{font-size:9px;font-weight:800;color:#7a4a00;background:#fff4d6;border:1px solid #f1c86b;border-radius:12px;padding:5px 9px}.vx-whirlpool-tab{color:#8a5200!important}.vx-wp-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.vx-wp-head h3{margin:0;color:#17324e}.vx-wp-head small{font-size:9px;color:#718397}.vx-wp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.vx-wp-grid label{display:grid;gap:4px;font-size:9px;font-weight:700;color:#5f7183}.vx-wp-grid input,.vx-wp-grid textarea{border:1px solid #ccd7e2;border-radius:5px;padding:7px;font-size:10px}.vx-wp-grid textarea{min-height:70px;resize:vertical}.vx-wp-grid .wide{grid-column:1/-1}.vx-wp-note{background:#fff8e6;border:1px solid #eed39a;padding:9px;border-radius:6px;font-size:9px;color:#715416}.vx-wp-actions{display:flex;gap:8px}@media(max-width:900px){.vx-wp-grid{grid-template-columns:minmax(0,1fr)}}`;document.head.appendChild(st);
  // Achado PWA-0 (2026-09-12): 1fr sozinho (sem minmax) tem mínimo implícito
  // igual ao min-content do item de grade -- como .wp-exact-doc é uma tabela
  // densa, essa coluna nunca encolhia de verdade abaixo de ~793px em tela
  // estreita, mesmo com a media query já existente. Bug pré-existente,
  // alheio à remoção do B5 (whirlpool-factory-css-sync-v0813.js) -- só
  // corrige a regra responsiva já declarada aqui pra ela cumprir o que já
  // dizia fazer, sem criar seletor/regra nova.

  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
})();
