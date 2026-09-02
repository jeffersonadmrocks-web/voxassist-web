/* VoxAssist V0.8.13 — validação de fidelidade Whirlpool */
(function(){
 const $=(s,r=document)=>r.querySelector(s);
 const $$=(s,r=document)=>[...r.querySelectorAll(s)];
 const stateRef=()=>typeof state!=='undefined'?state:null;
 const esc=v=>String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const wrap=(form,name)=>form.querySelector(`[name="${name}"]`)?.closest('.wpf-field');
 function cell(children=[],attrs={}){const td=document.createElement('td');Object.entries(attrs).forEach(([k,v])=>k==='colSpan'?td.colSpan=v:td.style[k]=v);children.filter(Boolean).forEach(x=>td.appendChild(x));return td}
 function row(...cells){const tr=document.createElement('tr');cells.forEach(c=>tr.appendChild(c));return tr}
 function exactConsumer(form){const w=wrap(form,'consumidor');if(!w)return;const old=w.closest('table');if(!old||old.dataset.fidelity==='consumer')return;const t=document.createElement('table');t.className='wpf-table';t.dataset.fidelity='consumer';
 t.appendChild(row(cell([wrap(form,'consumidor')],{width:'50%'}),cell([wrap(form,'cep'),wrap(form,'regiao')],{width:'50%'})));
 t.appendChild(row(cell([wrap(form,'endereco')],{width:'50%'}),cell([wrap(form,'bairro')],{width:'50%'})));
 t.appendChild(row(cell([wrap(form,'complemento')],{width:'50%'}),cell([wrap(form,'cidade'),wrap(form,'uf')],{width:'50%'})));
 t.appendChild(row(cell([wrap(form,'cnpjCpf')],{width:'50%'}),cell([wrap(form,'enderecoEletronico')],{width:'50%'})));
 const phones=cell([wrap(form,'foneResidencia'),wrap(form,'foneComercial'),wrap(form,'foneOutros')]);phones.colSpan=2;t.appendChild(row(phones));
 const loc=cell([wrap(form,'localizacao')]);loc.colSpan=2;t.appendChild(row(loc));old.replaceWith(t)}
 function exactProduct(form){const w=wrap(form,'produto');if(!w)return;const old=w.closest('table');if(!old||old.dataset.fidelity==='product')return;const t=document.createElement('table');t.className='wpf-table';t.dataset.fidelity='product';
 t.appendChild(row(cell([wrap(form,'produto')],{width:'50%'}),cell([wrap(form,'marca')],{width:'50%'})));
 t.appendChild(row(cell([wrap(form,'produtoConsumidor')],{width:'50%'}),cell([wrap(form,'linha')],{width:'50%'})));
 t.appendChild(row(cell([wrap(form,'serie'),wrap(form,'nomeComercial')],{width:'50%'}),cell([wrap(form,'tempoUso')],{width:'50%'})));
 const tipo=cell([wrap(form,'tipoOS')]);tipo.colSpan=2;t.appendChild(row(tipo));
 const fiscal=cell([wrap(form,'nrNotaFiscal'),wrap(form,'dataCompra'),wrap(form,'cor'),wrap(form,'voltagem'),wrap(form,'capacidade')]);fiscal.colSpan=2;t.appendChild(row(fiscal));old.replaceWith(t)}
 function validate(form){const keys=[['numeroOS','Nº OS'],['tecnico','Técnico'],['dataAgenda','Data agenda'],['consumidor','Consumidor'],['cnpjCpf','CPF/CNPJ'],['endereco','Endereço'],['produto','Produto'],['marca','Marca'],['tipoOS','Tipo OS'],['defeitoReclamado','Defeito reclamado']];const missing=keys.filter(([k])=>!String(form.querySelector(`[name="${k}"]`)?.value||'').trim()).map(x=>x[1]);let bar=$('#wpfValidation');if(!bar){bar=document.createElement('div');bar.id='wpfValidation';bar.className='wpf-validation';form.parentElement?.insertBefore(bar,form)}bar.className='wpf-validation '+(missing.length?'warn':'ok');bar.innerHTML=missing.length?`<b>VALIDAÇÃO WHIRLPOOL:</b> ${missing.length} campo(s) essencial(is) pendente(s): ${esc(missing.join(', '))}.`:'<b>VALIDAÇÃO WHIRLPOOL:</b> dados essenciais preenchidos.'}
 async function integrateSignatures(form){const auth=$$('.wpf-box',form).find(x=>/AUTORIZAÇÃO/.test(x.textContent||''));if(!auth||auth.querySelector('.wpf-signatures-final'))return;const st=stateRef(),o=st?.activeOs;if(!o)return;let appt={},tech={};try{const a=await api(`appointments?service_order_id=eq.${o.id}&select=customer_signature,customer_signed_at&order=created_at.desc&limit=1`);appt=a?.[0]||{}}catch{}try{if(o.technician_id){const r=await api(`profiles?id=eq.${o.technician_id}&select=full_name,signature_data`);tech=r?.[0]||{}}}catch{}
 const row=document.createElement('div');row.className='wpf-signatures-final';row.innerHTML=`<div><div class="sig-area">${appt.customer_signature?`<img src="${appt.customer_signature}">`:''}</div><b>ASSINATURA DO CONSUMIDOR</b></div><div><div class="sig-area">${tech.signature_data?`<img src="${tech.signature_data}">`:'<span>ASSINATURA NÃO CADASTRADA</span>'}</div><b>ASSINATURA DO TÉCNICO</b><small>${esc(tech.full_name||o.profiles?.full_name||'')}</small></div>`;auth.appendChild(row)}
 // Achado do usuário em 2026-09-02 (comparação com o modelo físico
 // real): existia uma função bindPrint() aqui que reatribuía
 // #vxWpPrint.onclick diretamente (propriedade, não addEventListener) --
 // isso sequestrava o clique do botão "IMPRIMIR DOCUMENTO WHIRLPOOL" e
 // desviava do pipeline correto (window.vxPrintOsDocument ->
 // printFaithful, em whirlpool-faithful-mode-v0813.js, que já produz o
 // formato compacto de 1 página, fiel ao modelo físico). No lugar,
 // clonava o formulário EDITÁVEL em tela (com seu CSS próprio, nunca
 // atualizado, campo em 2 linhas) direto pra uma janela de impressão.
 // Removida -- o botão volta a chamar o pipeline real
 // (os-whirlpool-extension-v0813.js liga #vxWpPrint a
 // window.vxPrintOsDocument, que a Fase whirlpool-faithful-mode já
 // encadeia corretamente). Nada mais nesta função tocava o botão de
 // imprimir -- exactConsumer/exactProduct/validate/integrateSignatures
 // (chamadas por run(), abaixo) continuam intactas, são só o layout em
 // tela do formulário editável, nunca a impressão.
 function style(){if($('#wpfFidelityStyle'))return;const s=document.createElement('style');s.id='wpfFidelityStyle';s.textContent=`.wpf-validation{max-width:1220px;margin:0 auto 7px;padding:7px 9px;border:1px solid;font-size:11px}.wpf-validation.ok{background:#edf9f1;border-color:#61a979;color:#176536}.wpf-validation.warn{background:#fff7df;border-color:#d5a72f;color:#75520a}.wpf-signatures-final{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:10px;text-align:center}.wpf-signatures-final .sig-area{height:58px;border-bottom:1px solid #222;display:flex;align-items:flex-end;justify-content:center}.wpf-signatures-final img{max-height:54px;max-width:260px;object-fit:contain}.wpf-signatures-final span{font-size:9px;color:#78838e;align-self:center}.wpf-signatures-final small{display:block;font-size:8px;margin-top:2px}.wpf-doc [data-fidelity] .wpf-field{margin-bottom:1px}`;document.head.appendChild(s)}
 async function run(){const form=$('#vxWpForm');if(!form||!$('.wpf-doc',form))return;style();exactConsumer(form);exactProduct(form);validate(form);await integrateSignatures(form);form.querySelectorAll('input,textarea').forEach(el=>{if(!el.dataset.fidelityWatch){el.dataset.fidelityWatch='1';el.addEventListener('input',()=>validate(form))}})}
 const mo=new MutationObserver(()=>{if($('#vxWpForm .wpf-doc'))setTimeout(run,100)});mo.observe(document.documentElement,{childList:true,subtree:true});setTimeout(run,800);
})();