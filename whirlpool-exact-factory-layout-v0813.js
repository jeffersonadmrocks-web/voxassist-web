/* VoxAssist V0.8.13 — estrutura exata da OS Whirlpool baseada no WhirlpoolPreview do parecer-fabrica */
(function(){
 const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
 const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 function field(form,name,label){
   let el=form.querySelector(`[name="${name}"]`); if(!el)return null;
   const w=el.closest('.wpf-field')||el.parentElement; if(!w)return null;
   w.classList.add('wp-exact-field'); w.dataset.wpExactLabel=label||'';
   const cap=w.querySelector(':scope>span'); if(cap)cap.textContent=label||'';
   return w;
 }
 function td(children,attrs={}){const x=document.createElement('td');Object.entries(attrs).forEach(([k,v])=>{if(k==='colSpan')x.colSpan=v;else if(k==='rowSpan')x.rowSpan=v;else x.style[k]=v});(Array.isArray(children)?children:[children]).filter(Boolean).forEach(c=>typeof c==='string'?x.insertAdjacentHTML('beforeend',c):x.appendChild(c));return x}
 function tr(...cells){const r=document.createElement('tr');cells.forEach(c=>r.appendChild(c));return r}
 function tbl(cls='wp-exact-table'){const t=document.createElement('table');t.className=cls;return t}
 function ensureAuthName(form){let el=form.querySelector('[name="responsavelAutorizacao"]');if(!el){const l=document.createElement('label');l.style.display='none';l.innerHTML='<span>RESPONSÁVEL PELA AUTORIZAÇÃO</span><input name="responsavelAutorizacao">';form.appendChild(l);el=l.querySelector('input');const consumidor=form.querySelector('[name="consumidor"]');if(consumidor&&!el.value)el.value=consumidor.value||''}return field(form,'responsavelAutorizacao','')}
 function build(form){
   const old=$('.wpf-doc',form); if(!old||old.dataset.exactFactory==='1')return;
   const doc=document.createElement('div');doc.className='wpf-doc wp-exact-doc';doc.dataset.exactFactory='1';
   let t=tbl('wp-exact-table wp-header');
   t.appendChild(tr(td([field(form,'autorizada','AUTORIZADA:'),field(form,'enderecoAutorizada',''),field(form,'cnpjAutorizada','CNPJ:'),field(form,'foneAutorizada','FONE:'),field(form,'inscEstadualAutorizada','INSC. ESTADUAL:')],{width:'70%'}),td([field(form,'centralAtendimento','CENTRAL DE ATENDIMENTO'),field(form,'foneCentral1','FONE:'),field(form,'foneCentral2','FONE:')],{width:'30%'})));doc.appendChild(t);
   t=tbl();t.appendChild(tr(td(field(form,'numeroOS','NÚMERO DA OS'),{width:'14%',textAlign:'center',verticalAlign:'middle'}),td(field(form,'tecnico','TÉCNICO'),{width:'12%',textAlign:'center',verticalAlign:'middle'}),td('<div class="wp-exact-label-target">COLE AQUI A ETIQUETA DO PRODUTO</div>',{width:'44%',textAlign:'center',verticalAlign:'middle'}),td([field(form,'dataAgenda','DATA AGENDA:'),field(form,'dataChamado','DATA CHAMADO:'),field(form,'periodo','PERÍODO:'),field(form,'tipoAgenda','TIPO AGENDA:')],{width:'30%',verticalAlign:'middle'})));doc.appendChild(t);
   t=tbl('wp-exact-table wp-noinner');t.appendChild(tr(td(field(form,'consumidor','CONSUMIDOR:'),{colSpan:2}),td(field(form,'cep','CEP:')),td(field(form,'regiao','REGIÃO:'))));t.appendChild(tr(td(field(form,'endereco','ENDEREÇO:'),{colSpan:2}),td(field(form,'bairro','BAIRRO:'),{colSpan:2})));t.appendChild(tr(td(field(form,'complemento','COMPLEMENTO:'),{colSpan:2}),td(field(form,'cidade','CIDADE:')),td(field(form,'uf','UF:'))));t.appendChild(tr(td(field(form,'cnpjCpf','CNPJ/CPF:'),{colSpan:2}),td(field(form,'enderecoEletronico','ENDEREÇO ELETRÔNICO:'),{colSpan:2})));const ph=td([field(form,'foneResidencia','FONE RESIDÊNCIA:'),field(form,'foneComercial','FONE COMERCIAL:'),field(form,'foneOutros','FONE (OUTROS):')],{colSpan:4});ph.classList.add('wp-exact-inline-group');t.appendChild(tr(ph));t.appendChild(tr(td(field(form,'localizacao','LOCALIZAÇÃO:'),{colSpan:4})));doc.appendChild(t);
   t=tbl('wp-exact-table wp-noinner');t.appendChild(tr(td(field(form,'produto','PRODUTO:'),{colSpan:2}),td(field(form,'marca','MARCA:'),{colSpan:2})));t.appendChild(tr(td(field(form,'produtoConsumidor','PRODUTO CONSUMIDOR:'),{colSpan:2}),td(field(form,'linha','LINHA:'),{colSpan:2})));t.appendChild(tr(td(field(form,'serie','SÉRIE:')),td(field(form,'nomeComercial','NOME COMERCIAL:')),td(field(form,'tempoUso','TEMPO DE USO:'),{colSpan:2})));t.appendChild(tr(td(field(form,'tipoOS','TIPO DE OS:'),{colSpan:4})));const fiscal=td([field(form,'nrNotaFiscal','NR NOTA FISCAL:'),field(form,'dataCompra','DATA COMPRA:'),field(form,'cor','COR:'),field(form,'voltagem','VOLTAGEM:'),field(form,'capacidade','CAPACIDADE:')],{colSpan:4});fiscal.classList.add('wp-exact-inline-group');t.appendChild(tr(fiscal));doc.appendChild(t);
   t=tbl();t.appendChild(tr(td('<b>DEFEITO<br>RECLAMADO</b>',{width:'14%',textAlign:'center',verticalAlign:'middle'}),td([field(form,'defeitoReclamado','1'),field(form,'defeitoReclamado2','2')],{width:'36%'}),td('<b>DEFEITO<br>CONSTATADO</b>',{width:'14%',textAlign:'center',verticalAlign:'middle'}),td([field(form,'defeitoConstatado','1'),field(form,'defeitoConstatado2','2')],{width:'36%'})));t.appendChild(tr(td('<b>RECLAMAÇÃO<br>ATENDIMENTO</b>',{textAlign:'center',verticalAlign:'middle'}),td(field(form,'reclamacaoAtendimento',''),{colSpan:3})));t.appendChild(tr(td('<b>LAUDO<br>TÉCNICO</b>',{textAlign:'center',verticalAlign:'middle'}),td(field(form,'laudoTecnico',''),{colSpan:3,height:'60px'})));doc.appendChild(t);
   const parts=$('.wpf-parts',old)||$('.wpf-parts',form); if(parts){parts.classList.add('wp-exact-table');doc.appendChild(parts)}
   const add=$('#wpfAddPart',form); if(add)doc.appendChild(add);
   const totals=$('#wpfTotalParts',form)?.closest('table');if(totals)doc.appendChild(totals);
   const budget=$('#wpfBudgetValue',form)?.closest('table');if(budget)doc.appendChild(budget);
   const auth=document.createElement('div');auth.className='wp-exact-box wp-exact-auth';auth.innerHTML='<div class="wp-exact-title">AUTORIZAÇÃO</div><p>EU <span class="wp-auth-name"></span> AUTORIZO A REALIZAÇÃO DO SERVIÇO, BEM COMO A TROCA DE PEÇAS, CONFORME O PRESENTE DIAGNÓSTICO E/OU ORÇAMENTO TÉCNICO, TENDO RECEBIDO ORIENTAÇÕES NECESSÁRIAS.</p><div class="wp-auth-bottom"><div class="wp-auth-date"></div><div class="wp-auth-sign"></div></div>';
   const authName=ensureAuthName(form); if(authName)auth.querySelector('.wp-auth-name').appendChild(authName); const appr=field(form,'dataAprovacao','DATA DA APROVAÇÃO'); if(appr)auth.querySelector('.wp-auth-date').appendChild(appr); const sig=$('.wpf-signatures-final',old)||$('.wpf-signatures-final',form); if(sig)auth.querySelector('.wp-auth-sign').appendChild(sig); doc.appendChild(auth);
   const term=[...$$('.wpf-box',old)].find(x=>/TERMO DE GARANTIA DO SERVIÇO AUTORIZADO/i.test(x.textContent||''));if(term){term.classList.add('wp-exact-box','wp-exact-term');doc.appendChild(term)}
   const techSig=$('.vx-wp-tech-sign',form);if(techSig&& !auth.contains(techSig))techSig.remove();
   old.replaceWith(doc);
 }
 function style(){if($('#wpExactFactoryStyle'))return;const s=document.createElement('style');s.id='wpExactFactoryStyle';s.textContent=`
 #vxWpForm .wp-exact-doc{width:100%;max-width:1220px;margin:0 auto;background:#fff;color:#000;font:8.4px Arial,sans-serif;line-height:1.18}
 #vxWpForm .wp-exact-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0}
 #vxWpForm .wp-exact-table td,#vxWpForm .wp-exact-table th{border:1px solid #000;padding:2.6px 4px;vertical-align:top}
 #vxWpForm .wp-exact-field{display:flex!important;align-items:baseline;gap:3px;margin:0!important;min-height:12px}
 #vxWpForm .wp-exact-field>span{display:inline!important;flex:0 0 auto;font-size:7.9px!important;font-weight:700!important;line-height:1.18}
 #vxWpForm .wp-exact-field input,#vxWpForm .wp-exact-field textarea{display:inline!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;min-height:12px!important;height:auto!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;font:8.4px Arial!important;line-height:1.18!important;resize:none!important;overflow:hidden!important}
 #vxWpForm .wp-exact-inline-group{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
 #vxWpForm .wp-exact-inline-group .wp-exact-field{display:inline-flex!important;flex:0 1 auto}
 #vxWpForm .wp-exact-label-target{font-family:'Courier New',monospace;font-size:10px;padding:23px 0}
 #vxWpForm .wp-exact-box{border:1px solid #000;border-top:0;padding:5px 6px;font-size:8.2px}
 #vxWpForm .wp-exact-title{text-align:center;font-weight:700;font-size:9.5px}
 #vxWpForm .wp-exact-auth p{margin:4px 0}
 #vxWpForm .wp-auth-name{display:inline-block;min-width:250px;border-bottom:1px solid #000;vertical-align:bottom}
 #vxWpForm .wp-auth-name .wp-exact-field>span{display:none!important}
 #vxWpForm .wp-auth-bottom{display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px}
 #vxWpForm .wp-auth-date{width:35%}.wp-auth-sign{width:55%}
 #vxWpForm .wp-auth-sign .wpf-signatures-final{display:grid!important;grid-template-columns:1fr!important;margin:0!important;gap:0!important}
 #vxWpForm .wp-auth-sign .wpf-signatures-final>div:first-child{display:block!important}
 #vxWpForm .wp-auth-sign .wpf-signatures-final>div:nth-child(2){display:none!important}
 #vxWpForm .wp-auth-sign .sig-area{height:48px!important}
 #vxWpForm .wp-exact-term{font-weight:700}
 #vxWpForm .wp-exact-term p{margin:4px 0!important;font-size:7.5px!important;line-height:1.18!important}
 #vxWpForm .wpf-parts td{height:15px!important;padding:1px 3px!important}.wpf-parts th{font-size:7.9px!important;padding:2px!important}
 #vxWpForm #wpfAddPart{margin:4px 0!important}
 @media print{#vxWpForm .wp-exact-doc{font-size:8.4pt!important;width:196mm!important}.wp-exact-table td,.wp-exact-table th{padding:2.6px 4px!important}.wp-exact-field>span{font-size:7.9pt!important}.wp-exact-field input,.wp-exact-field textarea{font-size:8.4pt!important}.wp-exact-label-target{font-size:9pt!important}.wp-exact-box{font-size:8.1pt!important}.wp-exact-title{font-size:9.5pt!important}.wp-exact-term p{font-size:7.5pt!important}}
 `;document.head.appendChild(s)}
 function run(){const form=$('#vxWpForm');if(!form||!$('.wpf-doc',form))return;style();build(form)}
 const mo=new MutationObserver(()=>setTimeout(run,80));mo.observe(document.documentElement,{childList:true,subtree:true});setTimeout(run,1000);
})();