/* VoxAssist V0.8.13 — validação de fidelidade Whirlpool */
(function(){
 const $=(s,r=document)=>r.querySelector(s);
 const $$=(s,r=document)=>[...r.querySelectorAll(s)];
 const stateRef=()=>typeof state!=='undefined'?state:null;
 const esc=v=>String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const wrap=(form,name)=>form.querySelector(`[name="${name}"]`)?.closest('.wpf-field');
 // Achado em 2026-09-12 (investigação do problema "Cliente/Produto não
 // aparecem como bloco único" reportado pelo usuário na impressão
 // Whirlpool): exactConsumer()/exactProduct() (removidas) reconstruíam
 // as MESMAS tabelas de Cliente/Produto que whirlpool-exact-factory-
 // layout-v0813.js (carregado logo depois, "baseada no WhirlpoolPreview
 // do parecer-fábrica" -- a implementação definitiva) também reconstrói.
 // Como as duas reagem à mesma mutação do DOM (a criação de .wpf-doc)
 // via MutationObserver próprio, e cada uma tenta ser a versão final,
 // gerava uma condição de corrida: dependendo de qual rodava por último,
 // a tabela de Cliente/Produto ficava ora com a estrutura "exact factory"
 // (com wp-noinner/wp-client-unified, bloco único sem grade interna),
 // ora com esta estrutura mais simples (wpf-table, SEM wp-noinner --
 // volta a mostrar a grade interna fragmentada). Nunca determinístico,
 // por isso o comportamento "às vezes some, às vezes volta". Removida
 // -- exact-factory-layout já cobre esse mesmo objetivo por completo;
 // validate()/integrateSignatures() (únicas outras funções deste
 // arquivo) não mexem nessas tabelas e continuam intactas.
 function validate(form){const keys=[['numeroOS','Nº OS'],['tecnico','Técnico'],['dataAgenda','Data agenda'],['consumidor','Consumidor'],['cnpjCpf','CPF/CNPJ'],['endereco','Endereço'],['produto','Produto'],['marca','Marca'],['tipoOS','Tipo OS'],['defeitoReclamado','Defeito reclamado']];const missing=keys.filter(([k])=>!String(form.querySelector(`[name="${k}"]`)?.value||'').trim()).map(x=>x[1]);let bar=$('#wpfValidation');if(!bar){bar=document.createElement('div');bar.id='wpfValidation';bar.className='wpf-validation';form.parentElement?.insertBefore(bar,form)}const newCls='wpf-validation '+(missing.length?'warn':'ok');const newHtml=missing.length?`<b>VALIDAÇÃO WHIRLPOOL:</b> ${missing.length} campo(s) essencial(is) pendente(s): ${esc(missing.join(', '))}.`:'<b>VALIDAÇÃO WHIRLPOOL:</b> dados essenciais preenchidos.';if(bar.className!==newCls)bar.className=newCls;if(bar.innerHTML!==newHtml)bar.innerHTML=newHtml}
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
 async function run(){const form=$('#vxWpForm');if(!form||!$('.wpf-doc',form))return;style();validate(form);await integrateSignatures(form);form.querySelectorAll('input,textarea').forEach(el=>{if(!el.dataset.fidelityWatch){el.dataset.fidelityWatch='1';el.addEventListener('input',()=>validate(form))}})}
 const mo=new MutationObserver(()=>{if($('#vxWpForm .wpf-doc'))setTimeout(run,100)});mo.observe(document.documentElement,{childList:true,subtree:true});setTimeout(run,800);
})();