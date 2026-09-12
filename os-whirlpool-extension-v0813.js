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

  async function showWhirlpoolPanel(id){
    document.querySelectorAll('.vx-os-panel').forEach(p=>p.classList.add('hidden'));
    document.querySelectorAll('.vx-os-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.section==='whirlpool'));
    let panel=document.querySelector('#vx-whirlpool');if(!panel){panel=document.createElement('section');panel.id='vx-whirlpool';panel.className='vx-os-panel';document.querySelector('#app')?.appendChild(panel)}panel.classList.remove('hidden');panel.innerHTML='<div class="vx-screen-box">Carregando modo Whirlpool...</div>';
    const d=await loadBundle(id),o=d.o;
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
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${E(title)}</title><style>@page{size:A4;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10px}.doc{width:100%}.head{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border-bottom:2px solid #163754;padding-bottom:8px;margin-bottom:8px}.head img{max-width:130px;max-height:60px}.osno{font-size:21px;font-weight:800;color:#163754}.muted{color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.box{border:1px solid #9aa9b8;border-radius:4px;padding:7px;margin-bottom:7px}.box h3{font-size:10px;margin:0 0 5px;color:#163754}.row{display:grid;grid-template-columns:130px 1fr;border-bottom:1px solid #e3e8ed;padding:3px 0}.row:last-child{border:0}.row b{font-size:8px}.wp table{width:100%;border-collapse:collapse;margin:0 0 3px}.wp td,.wp th{border:1px solid #111;padding:3px;font-size:8px;vertical-align:top}.wp th{background:#f2f2f2}.wp .title{font-weight:800;text-align:center}.sign{height:52px;border-top:1px solid #777;margin-top:24px;text-align:center;padding-top:4px}.footer{font-size:8px;text-align:center;margin-top:8px;color:#5d6b78}@media print{button{display:none!important}}.vox .head{background:linear-gradient(135deg,#0b2b4a,#123a61);color:#fff;border-radius:10px;padding:12px 14px;border-bottom:0}.vox .head .muted{color:#9fc1e6}.vox .osno{color:#fff}.vox .box{border:1px solid #e1e8ef;border-radius:10px;box-shadow:0 1px 2px rgba(15,42,68,.08);padding:9px 11px}.vox .box h3{color:#1976d2;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}.vox .row{border-bottom:1px solid #eef2f6}.vox .row b{color:#5e7188}.vox .sign{border-top:1px solid #c7d0d9;color:#5e7188}.vox .footer{color:#5e7188}</style></head><body>${body}<script>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close();
  }

  async function printVox(id){const d=await loadBundle(id),o=d.o,c=o.clients||{},e=o.equipments||{},b=d.brand||{},parts=d.parts||[],fin=d.fin||{};const partsTotal=parts.reduce((s,p)=>s+Number(p.quantity||0)*Number(p.unit_value||0),0),total=partsTotal+Number(fin.labor_value||0)+Number(fin.freight_value||0)+Number(fin.auxiliary_material_value||0)+Number(fin.technical_report_value||0)-Number(fin.discount_value||0);const body=`<div class="doc vox"><div class="head"><div>${b.logo_url?`<img src="${E(b.logo_url)}">`:''}<div><b>${E(b.trade_name||b.legal_name||'VOXASSIST')}</b></div><div class="muted">${E([b.address,b.address_number,b.city,b.state].filter(Boolean).join(' • '))}</div><div class="muted">${E([b.phone,b.mobile,b.email].filter(Boolean).join(' • '))}</div></div><div><div class="muted">ORDEM DE SERVIÇO</div><div class="osno">${E(o.os_number)}</div><div>${E(String(o.status||'').replaceAll('_',' '))}</div></div></div><div class="grid"><div class="box"><h3>👤 CLIENTE</h3><div class="row"><b>NOME</b><span>${E(c.name)}</span></div><div class="row"><b>CPF/CNPJ</b><span>${E(c.document)}</span></div><div class="row"><b>TELEFONE</b><span>${E(c.phone_primary)}</span></div><div class="row"><b>ENDEREÇO</b><span>${E([c.address,c.address_number,c.complement,c.neighborhood,c.city,c.state].filter(Boolean).join(', '))}</span></div></div><div class="box"><h3>📦 EQUIPAMENTO</h3><div class="row"><b>PRODUTO</b><span>${E(e.product_type)}</span></div><div class="row"><b>MARCA / MODELO</b><span>${E([e.brand,e.model].filter(Boolean).join(' • '))}</span></div><div class="row"><b>SÉRIE</b><span>${E(e.serial_number)}</span></div><div class="row"><b>ATENDIMENTO</b><span>${E(o.service_type)}</span></div></div></div><div class="box"><h3>🔧 ATENDIMENTO TÉCNICO</h3><div class="row"><b>DEFEITO RELATADO</b><span>${E(o.reported_defect)}</span></div><div class="row"><b>DEFEITO CONSTATADO</b><span>${E(o.diagnosed_defect)}</span></div><div class="row"><b>SERVIÇO / LAUDO</b><span>${E(o.technical_service)}</span></div></div><div class="box"><h3>💰 ORÇAMENTO</h3><div class="row"><b>PEÇAS</b><span>${money(partsTotal)}</span></div><div class="row"><b>MÃO DE OBRA</b><span>${money(fin.labor_value||0)}</span></div><div class="row"><b>TOTAL</b><span><strong>${money(total)}</strong></span></div></div><div class="grid"><div class="sign">ASSINATURA DO CLIENTE</div><div class="sign">ASSINATURA DO TÉCNICO</div></div><div class="footer">${E(b.document_footer||b.document_header_note||'')}</div></div>`;printShell('OS '+o.os_number,body)}

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
    if(kind==='vox')return printVox(o.id);
    if(isWhirlpool(o)){
      const useWp=confirm('Esta é uma OS Whirlpool (Brastemp/Consul).\n\nOK = imprimir documento Whirlpool\nCancelar = imprimir modelo padrão VoxAssist');
      return useWp?printWhirlpoolOfficial(o.id):printVox(o.id);
    }
    return printVox(o.id);
  };
  window.printOs=()=>window.vxPrintOsDocument('auto');

  async function technicianBadge(){const o=state?.activeOs;if(!o||!isWhirlpool(o))return;const role=norm(state?.profile?.role);if(role==='TECNICO'){const tab=document.querySelector('[data-section="whirlpool"]');if(tab){tab.title='Modo de atendimento Whirlpool do técnico';tab.textContent='WHIRLPOOL • ATENDIMENTO'}const note=document.querySelector('.vx-wp-head small');if(note)note.textContent='Fluxo Whirlpool de atendimento externo. Preencha e salve diretamente no VoxAssist.'}}
  const obs=new MutationObserver(()=>setTimeout(technicianBadge,40));obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(technicianBadge,300);

  const base=window.renderOsDetail;
  if(typeof base==='function')window.renderOsDetail=async function(){const r=await base.apply(this,arguments);setTimeout(injectWhirlpoolTab,100);return r};
  setTimeout(injectWhirlpoolTab,500);

  const st=document.createElement('style');st.textContent=`.vx-whirlpool-badge{font-size:9px;font-weight:800;color:#7a4a00;background:#fff4d6;border:1px solid #f1c86b;border-radius:12px;padding:5px 9px}.vx-whirlpool-tab{color:#8a5200!important}.vx-wp-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.vx-wp-head h3{margin:0;color:#17324e}.vx-wp-head small{font-size:9px;color:#718397}.vx-wp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.vx-wp-grid label{display:grid;gap:4px;font-size:9px;font-weight:700;color:#5f7183}.vx-wp-grid input,.vx-wp-grid textarea{border:1px solid #ccd7e2;border-radius:5px;padding:7px;font-size:10px}.vx-wp-grid textarea{min-height:70px;resize:vertical}.vx-wp-grid .wide{grid-column:1/-1}.vx-wp-note{background:#fff8e6;border:1px solid #eed39a;padding:9px;border-radius:6px;font-size:9px;color:#715416}.vx-wp-actions{display:flex;gap:8px}@media(max-width:900px){.vx-wp-grid{grid-template-columns:1fr}}`;document.head.appendChild(st);

  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
})();
