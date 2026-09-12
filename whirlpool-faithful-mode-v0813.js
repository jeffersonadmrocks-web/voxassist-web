/* VoxAssist V0.8.13 — fidelidade Whirlpool baseada no parecer-fabrica */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const N=v=>String(v||'').toUpperCase().trim();
  const wp=o=>['WHIRLPOOL','BRASTEMP','CONSUL'].includes(N(o?.manufacturer))||['WHIRLPOOL','BRASTEMP','CONSUL'].includes(N(o?.equipments?.brand))||N(o?.equipments?.document_model)==='WHIRLPOOL';
  const br=v=>{if(!v)return'';const s=String(v).slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:s};
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  // Achado do usuário em 2026-09-02: um PDF real mostrou "R$ undefined"
  // impresso -- confirmado que nenhum código deste repositório constrói
  // esse texto hoje (busca em todo o projeto), então é um valor já
  // persistido em manufacturer_imports.extracted_data de uma importação
  // antiga. validMoney() nunca deixa um total corrompido tipo esse
  // vencer o valor recalculado agora (mesmo padrão "nunca confia cegamente
  // num valor salvo quando dá pra recalcular" -- money(...) sempre fica
  // como rede de segurança). cleanFreeText() faz o mesmo pros campos de
  // texto livre (reclamação/laudo) que não têm valor recalculável --
  // aqui só remove o trecho literal quebrado, preserva o resto do texto
  // real que a pessoa digitou.
  const validMoney=v=>{const s=String(v||'').trim();return s&&!/undefined|nan/i.test(s)?s:null};
  const cleanFreeText=v=>String(v||'').replace(/\s*\|?\s*(VISITA|DESLOCAMENTO)\s*R\$\s*undefined/gi,'').trim();
  // Achado em 2026-09-12: este arquivo gera o documento REALMENTE impresso
  // (window.vxPrintOsDocument -> printFaithful), num pipeline totalmente
  // separado da aba editável em tela (whirlpool-complete-factory-v0813.js +
  // whirlpool-exact-factory-layout-v0813.js). Correções feitas só na aba
  // em tela (ex.: whirlpool-fixed-header-data-v0813.js) nunca chegavam na
  // impressão real porque este arquivo nunca lia aqueles valores -- só
  // `p.inscEstadualAutorizada`/`p.foneCentral1/2`, que nunca existem em
  // manufacturer_imports.extracted_data (são dados fixos da loja/
  // fabricante, não do PDF importado). Fonte única desses valores agora é
  // window.vxWhirlpoolFixedData (definida em whirlpool-fixed-header-
  // data-v0813.js) -- nunca duplicar o valor aqui de novo.
  async function bundle(id){
    const [os,imp,appt,parts,fin,brand]=await Promise.all([
      api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`),
      api(`manufacturer_imports?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`appointments?service_order_id=eq.${id}&select=*&order=created_at.desc&limit=1`).catch(()=>[]),
      api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`).catch(()=>[]),
      api(`os_financial?service_order_id=eq.${id}&select=*&limit=1`).catch(()=>[]),
      typeof window.getActiveCompanyBranding==='function'?window.getActiveCompanyBranding():Promise.resolve(null)
    ]);return{o:os?.[0],p:imp?.[0]?.extracted_data||{},appt:appt?.[0]||{},parts:parts||[],fin:fin?.[0]||{},brand:brand||{}};
  }
  function partRows(parts,p){
    const src=(Array.isArray(p.pecas)&&p.pecas.length?p.pecas:parts.map(x=>({quantidade:x.quantity,codigo:x.part_code||x.code,descricao:x.description||x.part_description,fcta:x.fcta,ocor:x.ocor,valor:x.unit_value?money(x.unit_value):''})));let html='';for(let i=0;i<Math.max(8,src.length);i++){const x=src[i]||{};html+=`<tr><td>${E(x.quantidade)}</td><td>${E(x.codigo)}</td><td>${E(x.descricao)}</td><td>${E(x.fcta)}</td><td>${E(x.ocor)}</td><td>${E(x.valor)}</td></tr>`}return html;
  }
  async function printFaithful(id){
    const d=await bundle(id),o=d.o;if(!o)return;const p=d.p,c=o.clients||{},e=o.equipments||{},a=d.appt||{},b=d.brand||{};
    const totalPecas=d.parts.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.unit_value||0),0);const mao=Number(d.fin.labor_value||0);const total=totalPecas+mao;
    const fixed=window.vxWhirlpoolFixedData||{FIXED:{},CENTRAL:{}};
    const centralBrand=N(p.centralAtendimento||e.brand)==='BRASTEMP'?'BRASTEMP':'CONSUL';const[centralFone1,centralFone2]=fixed.CENTRAL[centralBrand]||fixed.CENTRAL.CONSUL||[];
    const data={
      autorizada:p.autorizada||b.legal_name||b.trade_name||fixed.FIXED.autorizada||'VOX', enderecoAutorizada:p.enderecoAutorizada||[b.address,b.address_number,b.city,b.state].filter(Boolean).join(' - ')||fixed.FIXED.enderecoAutorizada||'', cnpjAutorizada:p.cnpjAutorizada||b.document||fixed.FIXED.cnpjAutorizada||'', foneAutorizada:p.foneAutorizada||b.phone||b.mobile||fixed.FIXED.foneAutorizada||'', inscEstadualAutorizada:p.inscEstadualAutorizada||fixed.FIXED.inscEstadualAutorizada||'',
      centralAtendimento:centralBrand, foneCentral1:p.foneCentral1||centralFone1, foneCentral2:p.foneCentral2||centralFone2, numeroOS:o.manufacturer_os_number||o.os_number, tecnico:p.tecnico||o.profiles?.full_name||'', dataAgenda:br(a.appointment_date||p.dataAgenda), dataChamado:br(p.dataChamado||o.opened_at), periodo:a.period||p.periodo||'', tipoAgenda:p.tipoAgenda||'',
      consumidor:c.name||p.consumidor||p.cliente||'', cep:c.zip_code||p.cep||'', regiao:p.regiao||'', endereco:c.address||p.endereco||'', bairro:c.neighborhood||p.bairro||'', complemento:c.complement||p.complemento||'', cidade:c.city||p.cidade||'', uf:c.state||p.uf||'', cnpjCpf:c.document||p.cnpjCpf||p.documento||'', enderecoEletronico:c.email||p.enderecoEletronico||p.email||'', foneResidencia:c.phone_primary||p.foneResidencia||p.telefone||'', foneComercial:c.phone_secondary||p.foneComercial||'', foneOutros:p.foneOutros||'', localizacao:p.localizacao||'',
      produto:p.produto||p.productLine||e.product_type||'', marca:e.brand||p.marca||p.manufacturer||'', produtoConsumidor:p.produtoConsumidor||'', linha:e.product_type||p.linha||'', serie:e.serial_number||p.serie||'', nomeComercial:p.nomeComercial||'', tempoUso:p.tempoUso||'', tipoOS:o.order_type||p.tipoOS||'', nrNotaFiscal:e.invoice_number||p.nrNotaFiscal||p.notaFiscal||'', dataCompra:br(e.purchase_date||p.dataCompra), cor:p.cor||'', voltagem:p.voltagem||'', capacidade:p.capacidade||'',
      defeitoReclamado:o.reported_defect||p.defeitoReclamado||'', defeitoReclamado2:p.defeitoReclamado2||'', defeitoConstatado:o.diagnosed_defect||p.defeitoConstatado||'', defeitoConstatado2:p.defeitoConstatado2||'', reclamacaoAtendimento:cleanFreeText(p.reclamacaoAtendimento||p.reclamacao||''), laudoTecnico:cleanFreeText(o.technical_service||p.laudoTecnico||''), observacao:p.observacao||'', totalPecas:validMoney(p.totalPecas)||money(totalPecas), maoDeObra:validMoney(p.maoDeObra)||money(mao), totalOrcamento:validMoney(p.totalOrcamento)||money(total), validadeOrcamento:p.validadeOrcamento||'O ORÇAMENTO É VÁLIDO POR 10 DIAS, APÓS ESSE PRAZO O MESMO ESTARÁ SUJEITO A MODIFICAÇÕES.', parcelas:p.parcelas||'', vencimento:p.vencimento||'', valorOrcamento:validMoney(p.valorOrcamento)||money(total), condicaoPagamento:p.condicaoPagamento||'', dataAprovacao:br(o.approval_date)||p.dataAprovacao||'', assinaturaConsumidor:p.assinaturaConsumidor||'', garantiaServico:p.garantiaServico||'', garantiaPecas:p.garantiaPecas||'', dataConclusao:p.dataConclusao||''
    };
    const tel=[data.foneResidencia&&`FONE RESIDÊNCIA: ${data.foneResidencia}`,data.foneComercial&&`FONE COMERCIAL: ${data.foneComercial}`,data.foneOutros&&`FONE (OUTROS): ${data.foneOutros}`].filter(Boolean).join('   ');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Whirlpool ${E(data.numeroOS)}</title><style>@page{size:A4;margin:5mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#000;font-size:7.5pt}.a4{width:200mm;margin:auto}.t{width:100%;border-collapse:collapse;margin:0}.t td,.t th{border:1px solid #000;padding:1.5mm;vertical-align:top}.t th{font-weight:700;text-align:center}.lbl{font-size:6.5pt;text-align:center}.strong{font-weight:700}.multi{height:13mm}.parts td{height:6mm}.noinner{border:1px solid #000}.noinner td{border:none!important}.box{border:1px solid #000;padding:2mm;margin-top:0}.title{text-align:center;font-weight:700}.auth{min-height:31mm}.term{font-weight:700;font-size:6.5pt;text-align:justify}.sig{height:16mm;max-width:70mm;border-bottom:1px solid #000;object-fit:contain}.nowrap{white-space:nowrap}</style></head><body><div class="a4">
    <table class="t"><tr><td style="width:70%"><b>AUTORIZADA:</b><br>${E(data.autorizada)}<br>${E(data.enderecoAutorizada)} ${data.cnpjAutorizada?` CNPJ: ${E(data.cnpjAutorizada)}`:''}<br>FONE: <b>${E(data.foneAutorizada)}</b>${data.inscEstadualAutorizada?` <span style="margin-left:30mm">Insc.Estadual: ${E(data.inscEstadualAutorizada)}</span>`:''}</td><td style="width:30%"><div>Central de Atendimento</div><b>${E(data.centralAtendimento)}</b><div>FONE: ${E(data.foneCentral1)}</div><div>FONE: ${E(data.foneCentral2)}</div></td></tr></table>
    <table class="t"><tr><td style="width:14%;text-align:center"><div class="lbl">NÚMERO DA OS</div><div class="strong">${E(data.numeroOS)}</div></td><td style="width:12%;text-align:center"><div class="lbl">TÉCNICO</div><div class="strong">${E(data.tecnico)}</div></td><td style="width:44%;text-align:center;font-family:monospace">COLE AQUI A ETIQUETA DO PRODUTO</td><td style="width:30%">DATA AGENDA: ${E(data.dataAgenda)}<br>DATA CHAMADO: ${E(data.dataChamado)}<br>PERÍODO: ${E(data.periodo)}<br>TIPO AGENDA: ${E(data.tipoAgenda)}</td></tr></table>
    <table class="t noinner"><tr><td colspan="2">CONSUMIDOR: ${E(data.consumidor)}</td><td>CEP: ${E(data.cep)}</td><td>REGIÃO: ${E(data.regiao)}</td></tr><tr><td colspan="2">ENDEREÇO: ${E(data.endereco)}</td><td colspan="2">BAIRRO: ${E(data.bairro)}</td></tr><tr><td colspan="2">COMPLEMENTO: ${E(data.complemento)}</td><td>CIDADE: ${E(data.cidade)}</td><td>UF: ${E(data.uf)}</td></tr><tr><td colspan="2">CNPJ/CPF: ${E(data.cnpjCpf)}</td><td colspan="2">ENDEREÇO ELETRÔNICO: ${E(data.enderecoEletronico)}</td></tr><tr><td colspan="4">${E(tel)}</td></tr><tr><td colspan="4">LOCALIZAÇÃO: ${E(data.localizacao)}</td></tr></table>
    <table class="t noinner"><tr><td colspan="2">PRODUTO: ${E(data.produto)}</td><td colspan="2">MARCA: ${E(data.marca)}</td></tr><tr><td colspan="2">PRODUTO CONSUMIDOR: ${E(data.produtoConsumidor)}</td><td colspan="2">LINHA: ${E(data.linha)}</td></tr><tr><td>SÉRIE: ${E(data.serie)}</td><td>NOME COMERCIAL: ${E(data.nomeComercial)}</td><td colspan="2">TEMPO DE USO: ${E(data.tempoUso)}</td></tr><tr><td colspan="4">TIPO DE OS: ${E(data.tipoOS)}</td></tr><tr><td colspan="4">NR NOTA FISCAL: ${E(data.nrNotaFiscal)} &nbsp;&nbsp; DATA COMPRA: ${E(data.dataCompra)} &nbsp;&nbsp; COR: ${E(data.cor)} &nbsp;&nbsp; VOLTAGEM: ${E(data.voltagem)} &nbsp;&nbsp; CAPACIDADE: ${E(data.capacidade)}</td></tr></table>
    <table class="t"><tr><td class="lbl" style="width:14%">DEFEITO<br>RECLAMADO</td><td style="width:36%">1&nbsp;&nbsp;${E(data.defeitoReclamado)}<br>2&nbsp;&nbsp;${E(data.defeitoReclamado2)}</td><td class="lbl" style="width:14%">DEFEITO<br>CONSTATADO</td><td style="width:36%">1&nbsp;&nbsp;${E(data.defeitoConstatado)}<br>2&nbsp;&nbsp;${E(data.defeitoConstatado2)}</td></tr><tr><td class="lbl">RECLAMAÇÃO<br>ATENDIMENTO</td><td colspan="3" class="multi">${E(data.reclamacaoAtendimento)}</td></tr><tr><td class="lbl">LAUDO<br>TÉCNICO</td><td colspan="3" class="multi">${E(data.laudoTecnico)}</td></tr></table>
    <table class="t parts"><thead><tr><th style="width:14%">QUANTIDADE</th><th style="width:12%">CÓDIGO</th><th style="width:46%">DESCRIÇÃO DA PEÇA</th><th style="width:8%">FCTA</th><th style="width:7%">OCOR.</th><th style="width:13%">VALOR EM R$</th></tr></thead><tbody>${partRows(d.parts,p)}</tbody></table>
    <table class="t"><tr><td rowspan="3" style="width:72%"><b>OBSERVAÇÃO</b><div style="min-height:18mm">${E(data.observacao)}</div></td><td class="nowrap">TOTAL DE PEÇAS</td><td style="text-align:right">${E(data.totalPecas)}</td></tr><tr><td class="nowrap">MÃO DE OBRA</td><td style="text-align:right">${E(data.maoDeObra)}</td></tr><tr><td class="nowrap">TOTAL DE ORÇAMENTO</td><td style="text-align:right">${E(data.totalOrcamento)}</td></tr></table>
    <table class="t"><tr><td rowspan="4" style="width:40%;text-align:center"><b>ORÇAMENTO</b><div>${E(data.validadeOrcamento)}</div></td><td style="text-align:center">PARCELAS</td><td style="text-align:center">VENCIMENTO</td><td style="text-align:center">VALOR</td><td style="text-align:center">CONDIÇÃO DE PAGAMENTO</td></tr><tr><td>${E(data.parcelas)}</td><td>${E(data.vencimento)}</td><td>${E(data.valorOrcamento)}</td><td>${E(data.condicaoPagamento)}</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table>
    <div class="box auth"><div class="title">AUTORIZAÇÃO</div><p>EU ________________________________________________________________ AUTORIZO A REALIZAÇÃO DO SERVIÇO, BEM COMO A TROCA DE PEÇAS, CONFORME O PRESENTE DIAGNÓSTICO E/OU ORÇAMENTO TÉCNICO, TENDO RECEBIDO ORIENTAÇÕES NECESSÁRIAS.</p><div style="display:flex;justify-content:space-between;margin-top:7mm"><div>${E(data.dataAprovacao)||'____/____/__________'}<br><b>DATA DA APROVAÇÃO</b></div><div style="text-align:center">${data.assinaturaConsumidor?`<img class="sig" src="${E(data.assinaturaConsumidor)}">`:'_________________________________________'}<br><b>ASSINATURA DO CONSUMIDOR</b></div></div></div>
    <div class="box term"><div class="title">TERMO DE GARANTIA DO SERVIÇO AUTORIZADO</div><p>CONFORME DESCRITO NO ORÇAMENTO JÁ APROVADO, FIRMAMOS A GARANTIA DO SERVIÇO (MÃO DE OBRA) DE ASSISTÊNCIA TÉCNICA POR UM PERÍODO DE ${data.garantiaServico?E(data.garantiaServico):'_______'}(${data.garantiaServico?E(data.garantiaServico):'___'}) MESES E DAS PEÇAS APLICADAS POR UM PERÍODO DE ${data.garantiaPecas?E(data.garantiaPecas):'_______'}(${data.garantiaPecas?E(data.garantiaPecas):'___'}) MESES, A PARTIR DE ${data.dataConclusao?E(data.dataConclusao):'________________'} (DATA DE CONCLUSÃO), QUANDO O SERVIÇO FOI DEVIDAMENTE EXECUTADO, ESTANDO EM PERFEITAS CONDIÇÕES DE UTILIZAÇÃO, TENDO RECEBIDO AS ORIENTAÇÕES NECESSÁRIAS PARA A CORRETA UTILIZAÇÃO DO PRODUTO.</p><p>EXCLUEM-SE DA GARANTIA OS DEFEITOS CAUSADOS POR USO IMPRÓPRIO OU INADEQUADO DO PRODUTO E PROBLEMAS DECORRENTES DE ACIDENTES NATURAIS, COMO POR EXEMPLO: RAIO, INCÊNDIO, INUNDAÇÕES E ETC.</p><p>DENTRO DO PRAZO DE GARANTIA DO SERVIÇO E DAS PEÇAS SUBSTITUÍDAS, A TROCA DESSAS PEÇAS E COMPONENTES EVENTUALMENTE DEFEITUOSAS SERÁ GRATUITA, ASSIM COMO A MÃO DE OBRA APLICADA.</p><p>DE ACORDO.</p></div>
    </div><script>setTimeout(()=>window.print(),250)<\/script></body></html>`;
    const w=window.open('','_blank','width=1000,height=850');if(!w)return toast('O navegador bloqueou a janela de impressão.','err');w.document.write(html);w.document.close();
  }
  // Exposto pra os-whirlpool-extension-v0813.js poder chamar o mesmo
  // documento oficial (printFaithful) também no caminho 'auto', sem
  // depender só desta interceptação de window.vxPrintOsDocument (que
  // só cobria kind==='whirlpool' explícito -- ver achado no outro
  // arquivo, plano "Arquitetura de Documentos da OS" Fase 1).
  window.vxPrintWhirlpoolFaithful=printFaithful;
  const oldPrint=window.vxPrintOsDocument;
  window.vxPrintOsDocument=async function(type){const o=state?.activeOs;if(type==='whirlpool'&&o&&wp(o))return printFaithful(o.id);return oldPrint?oldPrint(type):null};
  // Achado em 2026-09-12 (P0 -- travamento do navegador): existia aqui
  // uma SEGUNDA copia inteira de technicianBadge() (a original e a
  // canonica ficam em os-whirlpool-extension-v0813.js), sem nenhuma
  // guarda contra reescrita redundante -- sozinha, ja bastava pra
  // travar a aba inteira num loop de mutacao infinito (seta
  // tab.textContent/note.textContent incondicionalmente a cada
  // mutacao, o que por si so dispara o proprio observer de novo, pra
  // sempre). Removida -- a versao de os-whirlpool-extension-v0813.js
  // ja cobre exatamente o mesmo efeito, com guarda.
})();