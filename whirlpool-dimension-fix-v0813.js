/* VoxAssist V0.8.13 — correção fina das dimensões da OS Whirlpool conforme WhirlpoolPreview original */
(function(){
 const ID='vxWpDimensionFix';
 function apply(){
  if(document.getElementById(ID)) return;
  const s=document.createElement('style'); s.id=ID; s.textContent=`
  /* A4 canônico — mesma geometria do parecer-fabrica */
  #vxWpForm .wp-exact-doc{width:210mm!important;max-width:210mm!important;min-height:297mm!important;padding:8mm 10mm!important;box-sizing:border-box!important;overflow:visible!important}

  /* OS / Técnico: no original o rótulo fica acima e o valor abaixo; evita cortar nomes/números */
  #vxWpForm .wp-exact-doc>table:nth-of-type(2) td:nth-child(1) .wp-exact-field,
  #vxWpForm .wp-exact-doc>table:nth-of-type(2) td:nth-child(2) .wp-exact-field{display:block!important;text-align:center!important}
  #vxWpForm .wp-exact-doc>table:nth-of-type(2) td:nth-child(1) .wp-exact-field>span,
  #vxWpForm .wp-exact-doc>table:nth-of-type(2) td:nth-child(2) .wp-exact-field>span{display:block!important;font-size:7.4pt!important;font-weight:700!important;white-space:normal!important;margin-bottom:2px!important}
  #vxWpForm .wp-exact-doc>table:nth-of-type(2) td:nth-child(1) input,
  #vxWpForm .wp-exact-doc>table:nth-of-type(2) td:nth-child(2) input{display:block!important;width:100%!important;max-width:100%!important;font-size:8pt!important;font-weight:700!important;text-align:center!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}
  #vxWpForm .wp-exact-doc>table:nth-of-type(2) td{height:17mm!important;vertical-align:middle!important}
  #vxWpForm .wp-exact-label-target{padding:0!important;line-height:17mm!important;white-space:nowrap!important}

  /* Tabela de peças: proporções exatas do WhirlpoolPreview: 14 / 12 / 46 / 8 / 7 / 13 */
  #vxWpForm .wpf-parts th:nth-child(1),#vxWpForm .wpf-parts td:nth-child(1){width:14%!important}
  #vxWpForm .wpf-parts th:nth-child(2),#vxWpForm .wpf-parts td:nth-child(2){width:12%!important}
  #vxWpForm .wpf-parts th:nth-child(3),#vxWpForm .wpf-parts td:nth-child(3){width:46%!important}
  #vxWpForm .wpf-parts th:nth-child(4),#vxWpForm .wpf-parts td:nth-child(4){width:8%!important}
  #vxWpForm .wpf-parts th:nth-child(5),#vxWpForm .wpf-parts td:nth-child(5){width:7%!important}
  #vxWpForm .wpf-parts th:nth-child(6),#vxWpForm .wpf-parts td:nth-child(6){width:13%!important}
  #vxWpForm .wpf-parts th{height:16px!important;text-align:center!important;white-space:nowrap!important}
  #vxWpForm .wpf-parts td{height:15px!important;box-sizing:border-box!important}

  /* Observação + totais: 72 / 16 / 12 como no documento original */
  #vxWpForm table:has(#wpfTotalParts){table-layout:fixed!important;width:100%!important}
  #vxWpForm table:has(#wpfTotalParts) tr:first-child td:first-child{width:72%!important}
  #vxWpForm table:has(#wpfTotalParts) tr:first-child td:nth-child(2){width:16%!important;white-space:nowrap!important}
  #vxWpForm table:has(#wpfTotalParts) tr:first-child td:nth-child(3){width:12%!important;white-space:nowrap!important;text-align:right!important}
  #vxWpForm table:has(#wpfTotalParts) td{padding:2px 4px!important;height:18px!important;box-sizing:border-box!important}
  #vxWpForm table:has(#wpfTotalParts) td[rowspan]{height:54px!important;vertical-align:top!important}
  #vxWpForm #wpfLabor{width:100%!important;height:15px!important;min-height:15px!important;padding:0 2px!important;border:0!important;background:transparent!important;font-size:8pt!important;box-sizing:border-box!important}
  #vxWpForm #wpfTotalParts,#vxWpForm #wpfGrandTotal{white-space:nowrap!important}

  /* Orçamento: 40 / 12 / 14 / 12 / 22, fiel ao componente original */
  #vxWpForm table:has(#wpfBudgetValue){table-layout:fixed!important;width:100%!important}
  #vxWpForm table:has(#wpfBudgetValue) tr:first-child td:nth-child(1){width:40%!important}
  #vxWpForm table:has(#wpfBudgetValue) tr:first-child td:nth-child(2){width:12%!important}
  #vxWpForm table:has(#wpfBudgetValue) tr:first-child td:nth-child(3){width:14%!important}
  #vxWpForm table:has(#wpfBudgetValue) tr:first-child td:nth-child(4){width:12%!important}
  #vxWpForm table:has(#wpfBudgetValue) tr:first-child td:nth-child(5){width:22%!important}
  #vxWpForm table:has(#wpfBudgetValue) td{height:18px!important;padding:2px 4px!important;box-sizing:border-box!important}
  #vxWpForm table:has(#wpfBudgetValue) tr:first-child td:not(:first-child){text-align:center!important;white-space:nowrap!important}

  /* Campos editáveis não podem 'comer' o texto da ficha */
  #vxWpForm .wp-exact-field input,#vxWpForm .wp-exact-field textarea{box-sizing:border-box!important;max-width:100%!important;text-overflow:clip!important}
  #vxWpForm .wp-exact-field textarea{white-space:pre-wrap!important;overflow-wrap:anywhere!important}

  /* Impressão sempre uma única A4 em retrato */
  @page{size:A4 portrait;margin:0}
  @media print{
   #vxWpForm .wp-exact-doc{width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;padding:5mm 7mm!important;overflow:hidden!important;page-break-inside:avoid!important;break-inside:avoid-page!important}
   #vxWpForm .wp-exact-doc>table:nth-of-type(2) td{height:15mm!important}
   #vxWpForm .wp-exact-label-target{line-height:15mm!important}
  }
  `; document.head.appendChild(s);
 }
 const mo=new MutationObserver(apply);mo.observe(document.documentElement,{childList:true,subtree:true});apply();
})();