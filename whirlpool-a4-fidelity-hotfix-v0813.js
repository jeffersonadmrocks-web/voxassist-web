/* VoxAssist V0.8.13 — fidelidade final A4 Whirlpool: proporções, textos e blocos */
(function(){
  const STYLE_ID='vxWpA4FidelityHotfix';
  function addStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
/* A folha deve reproduzir o WhirlpoolPreview: 210x297mm, uma página */
#vxWpForm .wp-exact-doc{
  box-sizing:border-box!important;
  width:210mm!important;
  min-width:210mm!important;
  max-width:210mm!important;
  min-height:297mm!important;
  margin:0 auto!important;
  padding:8mm 10mm!important;
  background:#fff!important;
  color:#000!important;
  font-family:Arial,Helvetica,sans-serif!important;
  font-size:8.4pt!important;
  line-height:1.22!important;
  overflow:visible!important;
}
#vxWpForm .wp-exact-table{
  width:100%!important;
  border-collapse:collapse!important;
  table-layout:fixed!important;
  margin:0!important;
}
#vxWpForm .wp-exact-table + .wp-exact-table{border-top:none!important}
#vxWpForm .wp-exact-table th,
#vxWpForm .wp-exact-table td{
  box-sizing:border-box!important;
  border:1px solid #000!important;
  padding:3px 5px!important;
  vertical-align:top!important;
  font-weight:400!important;
  color:#000!important;
  overflow:visible!important;
  white-space:normal!important;
  word-break:normal!important;
}
#vxWpForm .wp-header td{padding:4px 6px!important;line-height:1.35!important}
/* blocos consumidor/produto: somente contorno externo, igual ao original */
#vxWpForm .wp-noinner{border:1px solid #000!important}
#vxWpForm .wp-noinner td,#vxWpForm .wp-noinner th{
  border:none!important;
  padding-top:1px!important;
  padding-bottom:1px!important;
}
/* campos em linha: nunca cortar o rótulo nem empurrar valor */
#vxWpForm .wp-exact-field{
  display:block!important;
  min-height:0!important;
  margin:0!important;
  padding:0!important;
  overflow:visible!important;
  white-space:normal!important;
}
#vxWpForm .wp-exact-field>span{
  display:inline!important;
  font:700 7.9pt Arial,Helvetica,sans-serif!important;
  line-height:1.22!important;
  white-space:nowrap!important;
  margin:0 3px 0 0!important;
}
#vxWpForm .wp-exact-field input,
#vxWpForm .wp-exact-field textarea{
  display:inline!important;
  width:auto!important;
  max-width:calc(100% - 2px)!important;
  min-width:0!important;
  height:auto!important;
  min-height:0!important;
  padding:0!important;
  margin:0!important;
  border:0!important;
  outline:0!important;
  background:transparent!important;
  color:#000!important;
  font:400 8.4pt Arial,Helvetica,sans-serif!important;
  line-height:1.22!important;
  vertical-align:baseline!important;
  resize:none!important;
  overflow:visible!important;
  text-overflow:clip!important;
  white-space:normal!important;
}
#vxWpForm .wp-exact-inline-group{display:block!important}
#vxWpForm .wp-exact-inline-group .wp-exact-field{display:inline-block!important;margin-right:10px!important}
#vxWpForm .wp-exact-label-target{font:400 9pt 'Courier New',monospace!important;padding:20px 0!important}
/* Defeitos / reclamação / laudo */
#vxWpForm .wp-exact-table td b{font-size:9pt!important;line-height:1.15!important}
#vxWpForm .wp-exact-table textarea[name="reclamacaoAtendimento"]{min-height:26px!important}
#vxWpForm .wp-exact-table textarea[name="laudoTecnico"]{min-height:56px!important}
/* Peças: dimensões do arquivo de fábrica */
#vxWpForm .wpf-parts th{font-size:7.9pt!important;padding:2px 4px!important;height:auto!important}
#vxWpForm .wpf-parts td{height:15px!important;min-height:15px!important;padding:1px 3px!important}
/* Observação + totais compactos */
#vxWpForm .wp-obs{min-height:34px!important}
/* Autorização: mesma altura/densidade do original */
#vxWpForm .wp-exact-box{box-sizing:border-box!important;border:1px solid #000!important;border-top:0!important;padding:5px 6px!important;font-size:8.1pt!important;line-height:1.2!important}
#vxWpForm .wp-exact-title{font-weight:700!important;font-size:9.5pt!important;line-height:1.15!important;text-align:center!important}
#vxWpForm .wp-exact-auth p{margin:3px 0!important;font-size:8.1pt!important;line-height:1.2!important}
#vxWpForm .wp-auth-name{display:inline-block!important;min-width:58mm!important;max-width:70mm!important;border-bottom:1px solid #000!important;vertical-align:baseline!important}
#vxWpForm .wp-auth-name input{width:100%!important;text-align:center!important}
#vxWpForm .wp-auth-bottom{display:flex!important;justify-content:space-between!important;align-items:flex-end!important;margin-top:18px!important;min-height:22px!important}
#vxWpForm .wp-auth-date{width:40%!important}
#vxWpForm .wp-auth-sign{width:48%!important;text-align:right!important;margin-right:20mm!important}
#vxWpForm .wp-auth-sign .sig-area{height:34px!important;min-height:34px!important;border-bottom:1px solid #000!important}
/* Termo: impedir o bloco gigante e manter o texto inteiro dentro de uma A4 */
#vxWpForm .wp-exact-term{
  padding:5px 6px!important;
  min-height:0!important;
  height:auto!important;
  font-weight:700!important;
  overflow:visible!important;
}
#vxWpForm .wp-exact-term .wp-exact-title,
#vxWpForm .wp-exact-term .wp-title-inline{font-size:9.5pt!important;line-height:1.15!important;text-align:center!important}
#vxWpForm .wp-exact-term p{
  margin:4px 0!important;
  padding:0!important;
  font-size:7.5pt!important;
  line-height:1.2!important;
  text-align:justify!important;
  min-height:0!important;
  height:auto!important;
}
/* Não exibir blocos duplicados ou auxiliares dentro da folha */
#vxWpForm .wp-exact-doc .vx-wp-tech-sign,
#vxWpForm .wp-exact-doc .wpf-attachments,
#vxWpForm .wp-exact-doc #wpfAddPart{display:none!important}
/* Tela: reduzir a folha proporcionalmente apenas quando não couber, sem alterar geometria */
@media screen and (max-width:1050px){
  #vxWpForm .wp-exact-doc{transform-origin:top left!important}
}
@media print{
  @page{size:A4 portrait;margin:0!important}
  html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important}
  #vxWpForm .wp-exact-doc{
    width:210mm!important;
    min-width:210mm!important;
    max-width:210mm!important;
    height:297mm!important;
    min-height:297mm!important;
    max-height:297mm!important;
    padding:5mm 7mm!important;
    margin:0!important;
    overflow:hidden!important;
    break-after:avoid-page!important;
    page-break-after:avoid!important;
    font-size:8.4pt!important;
    line-height:1.22!important;
  }
  #vxWpForm .wp-exact-table th,#vxWpForm .wp-exact-table td{padding:2.6px 4px!important}
  #vxWpForm .wp-header td{padding:3px 5px!important;line-height:1.24!important}
  #vxWpForm .wp-exact-field>span{font-size:7.9pt!important}
  #vxWpForm .wp-exact-field input,#vxWpForm .wp-exact-field textarea{font-size:8.4pt!important}
  #vxWpForm .wp-exact-label-target{font-size:9pt!important}
  #vxWpForm .wp-exact-box{padding:5px 6px!important;font-size:8.1pt!important}
  #vxWpForm .wp-exact-term p{font-size:7.5pt!important;line-height:1.2!important}
}
`;
    document.head.appendChild(s);
  }
  function normalize(){
    addStyle();
    const form=document.querySelector('#vxWpForm');
    const doc=form?.querySelector('.wp-exact-doc');
    if(!doc) return;
    // Campos com conteúdo longo devem crescer verticalmente e nunca cortar texto.
    form.querySelectorAll('.wp-exact-field textarea').forEach(el=>{
      el.style.height='auto';
      el.style.height=Math.max(el.scrollHeight,12)+'px';
    });
    // Remove alturas herdadas da montagem antiga que distorciam o termo/autorização.
    form.querySelectorAll('.wp-exact-term,.wp-exact-auth,.wp-exact-box').forEach(el=>{
      el.style.maxHeight='none';
      el.style.overflow='visible';
    });
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(normalize));
  mo.observe(document.documentElement,{childList:true,subtree:true});
  addStyle();
  setTimeout(normalize,300);
  setTimeout(normalize,1000);
})();