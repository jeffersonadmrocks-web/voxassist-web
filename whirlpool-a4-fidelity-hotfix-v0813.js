/* VoxAssist V0.8.13 — fidelidade A4 Whirlpool: dimensões sincronizadas com o modelo original */
(function(){
  const STYLE_ID='vxWpA4FidelityHotfix';
  function addStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
#vxWpForm .wp-exact-doc{box-sizing:border-box!important;width:210mm!important;min-width:210mm!important;max-width:210mm!important;min-height:297mm!important;margin:0 auto!important;padding:8mm 10mm!important;background:#fff!important;color:#000!important;font-family:Arial,Helvetica,sans-serif!important;font-size:8.4pt!important;line-height:1.22!important;overflow:visible!important}
#vxWpForm .wp-exact-table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;margin:0!important}
#vxWpForm .wp-exact-table + .wp-exact-table{border-top:none!important}
#vxWpForm .wp-exact-table th,#vxWpForm .wp-exact-table td{box-sizing:border-box!important;border:1px solid #000!important;padding:3px 5px!important;vertical-align:top!important;font-weight:400!important;color:#000!important;overflow:visible!important;white-space:normal!important;word-break:normal!important}
#vxWpForm .wp-header td{padding:4px 6px!important;line-height:1.35!important}
#vxWpForm .wp-noinner{border:1px solid #000!important}
#vxWpForm .wp-noinner td,#vxWpForm .wp-noinner th{border:none!important;padding-top:1px!important;padding-bottom:1px!important}
#vxWpForm .wp-exact-field{display:block!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;white-space:normal!important}
#vxWpForm .wp-exact-field>span{display:inline!important;font:700 7.9pt Arial,Helvetica,sans-serif!important;line-height:1.22!important;white-space:nowrap!important;margin:0 3px 0 0!important}
#vxWpForm .wp-exact-field input,#vxWpForm .wp-exact-field textarea{display:inline!important;width:auto!important;max-width:100%!important;min-width:0!important;height:auto!important;min-height:0!important;padding:0!important;margin:0!important;border:0!important;outline:0!important;background:transparent!important;color:#000!important;font:400 8.4pt Arial,Helvetica,sans-serif!important;line-height:1.22!important;vertical-align:baseline!important;resize:none!important;overflow:visible!important;text-overflow:clip!important;white-space:normal!important}
#vxWpForm .wp-exact-inline-group{display:block!important}
#vxWpForm .wp-exact-inline-group .wp-exact-field{display:inline-block!important;margin-right:10px!important}
#vxWpForm .wp-exact-label-target{font:400 9pt 'Courier New',monospace!important;padding:20px 0!important}
#vxWpForm .wp-exact-table td b{font-size:9pt!important;line-height:1.15!important}
#vxWpForm .wp-exact-table textarea[name="reclamacaoAtendimento"]{min-height:26px!important}
#vxWpForm .wp-exact-table textarea[name="laudoTecnico"]{min-height:56px!important}
/* tabela de peças: 14 / 12 / 46 / 8 / 7 / 13 */
#vxWpForm .wpf-parts th:nth-child(1),#vxWpForm .wpf-parts td:nth-child(1){width:14%!important}
#vxWpForm .wpf-parts th:nth-child(2),#vxWpForm .wpf-parts td:nth-child(2){width:12%!important}
#vxWpForm .wpf-parts th:nth-child(3),#vxWpForm .wpf-parts td:nth-child(3){width:46%!important}
#vxWpForm .wpf-parts th:nth-child(4),#vxWpForm .wpf-parts td:nth-child(4){width:8%!important}
#vxWpForm .wpf-parts th:nth-child(5),#vxWpForm .wpf-parts td:nth-child(5){width:7%!important}
#vxWpForm .wpf-parts th:nth-child(6),#vxWpForm .wpf-parts td:nth-child(6){width:13%!important}
#vxWpForm .wpf-parts th{font-size:7.9pt!important;padding:2px 4px!important;height:15px!important;line-height:1.1!important;text-align:center!important}
#vxWpForm .wpf-parts td{height:15px!important;min-height:15px!important;padding:1px 3px!important;line-height:1.1!important}
/* Observação + totais: 72 / 16 / 12 e três linhas compactas */
#vxWpForm .wp-exact-doc table.wp-totals td:first-child,#vxWpForm .wp-exact-doc table[data-wp-block="totals"] td:first-child{width:72%!important}
#vxWpForm .wp-exact-doc table.wp-totals td:nth-child(2),#vxWpForm .wp-exact-doc table[data-wp-block="totals"] td:nth-child(2){width:16%!important}
#vxWpForm .wp-exact-doc table.wp-totals td:nth-child(3),#vxWpForm .wp-exact-doc table[data-wp-block="totals"] td:nth-child(3){width:12%!important}
#vxWpForm .wp-obs{min-height:34px!important}
/* orçamento: 40 / 12 / 14 / 12 / 22 */
#vxWpForm .wp-exact-doc table.wp-budget td:nth-child(1),#vxWpForm .wp-exact-doc table[data-wp-block="budget"] tr:first-child td:nth-child(1){width:40%!important}
#vxWpForm .wp-exact-doc table.wp-budget td:nth-child(2),#vxWpForm .wp-exact-doc table[data-wp-block="budget"] tr:first-child td:nth-child(2){width:12%!important}
#vxWpForm .wp-exact-doc table.wp-budget td:nth-child(3),#vxWpForm .wp-exact-doc table[data-wp-block="budget"] tr:first-child td:nth-child(3){width:14%!important}
#vxWpForm .wp-exact-doc table.wp-budget td:nth-child(4),#vxWpForm .wp-exact-doc table[data-wp-block="budget"] tr:first-child td:nth-child(4){width:12%!important}
#vxWpForm .wp-exact-doc table.wp-budget td:nth-child(5),#vxWpForm .wp-exact-doc table[data-wp-block="budget"] tr:first-child td:nth-child(5){width:22%!important}
#vxWpForm .wp-exact-box{box-sizing:border-box!important;border:1px solid #000!important;border-top:0!important;padding:5px 6px!important;font-size:8.1pt!important;line-height:1.2!important}
#vxWpForm .wp-exact-title{font-weight:700!important;font-size:9.5pt!important;line-height:1.15!important;text-align:center!important}
#vxWpForm .wp-exact-auth p{margin:3px 0!important;font-size:8.1pt!important;line-height:1.2!important}
#vxWpForm .wp-auth-name{display:inline-block!important;min-width:58mm!important;max-width:70mm!important;border-bottom:1px solid #000!important;vertical-align:baseline!important}
#vxWpForm .wp-auth-name input{width:100%!important;text-align:center!important}
#vxWpForm .wp-auth-bottom{display:flex!important;justify-content:space-between!important;align-items:flex-end!important;margin-top:18px!important;min-height:22px!important}
#vxWpForm .wp-auth-date{width:40%!important}
#vxWpForm .wp-auth-sign{width:48%!important;text-align:right!important;margin-right:20mm!important}
#vxWpForm .wp-auth-sign .sig-area{height:34px!important;min-height:34px!important;border-bottom:1px solid #000!important}
#vxWpForm .wp-exact-term{padding:5px 6px!important;min-height:0!important;height:auto!important;font-weight:700!important;overflow:visible!important}
#vxWpForm .wp-exact-term .wp-exact-title,#vxWpForm .wp-exact-term .wp-title-inline{font-size:9.5pt!important;line-height:1.15!important;text-align:center!important}
#vxWpForm .wp-exact-term p{margin:4px 0!important;padding:0!important;font-size:7.5pt!important;line-height:1.2!important;text-align:justify!important;min-height:0!important;height:auto!important}
#vxWpForm .wp-exact-doc .vx-wp-tech-sign,#vxWpForm .wp-exact-doc .wpf-attachments,#vxWpForm .wp-exact-doc #wpfAddPart{display:none!important}
@media print{@page{size:A4 portrait;margin:0!important}html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important}#vxWpForm .wp-exact-doc{width:210mm!important;min-width:210mm!important;max-width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;padding:5mm 7mm!important;margin:0!important;overflow:hidden!important;break-after:avoid-page!important;page-break-after:avoid!important;font-size:8.4pt!important;line-height:1.22!important}#vxWpForm .wp-exact-table th,#vxWpForm .wp-exact-table td{padding:2.6px 4px!important}#vxWpForm .wp-header td{padding:3px 5px!important;line-height:1.24!important}#vxWpForm .wp-exact-field>span{font-size:7.9pt!important}#vxWpForm .wp-exact-field input,#vxWpForm .wp-exact-field textarea{font-size:8.4pt!important}#vxWpForm .wp-exact-label-target{font-size:9pt!important}#vxWpForm .wp-exact-box{padding:5px 6px!important;font-size:8.1pt!important}#vxWpForm .wp-exact-term p{font-size:7.5pt!important;line-height:1.2!important}}
`;
    document.head.appendChild(s);
  }
  function setWidths(table,widths){
    if(!table||table.dataset.wpWidthLocked==='1') return;
    const first=table.rows?.[0]; if(!first) return;
    [...first.cells].forEach((cell,i)=>{ if(widths[i]!=null){cell.style.width=widths[i]+'%';cell.style.maxWidth=widths[i]+'%';} });
    table.dataset.wpWidthLocked='1';
  }
  function markBlocks(doc){
    const tables=[...doc.querySelectorAll(':scope > table')];
    const parts=doc.querySelector('.wpf-parts');
    if(parts) setWidths(parts,[14,12,46,8,7,13]);
    const totals=tables.find(t=>/TOTAL DE PEÇAS/i.test(t.textContent||''));
    if(totals){totals.classList.add('wp-totals');totals.dataset.wpBlock='totals';setWidths(totals,[72,16,12]);}
    const budget=tables.find(t=>/CONDIÇÃO DE PAGAMENTO/i.test(t.textContent||''));
    if(budget){budget.classList.add('wp-budget');budget.dataset.wpBlock='budget';setWidths(budget,[40,12,14,12,22]);}
    const osTable=tables.find(t=>/NÚMERO DA OS/i.test(t.textContent||'')&&/TIPO AGENDA/i.test(t.textContent||''));
    if(osTable){setWidths(osTable,[14,12,44,30]);const r=osTable.rows?.[0];if(r)r.style.height='23mm';}
  }
  function normalize(){
    addStyle();
    const form=document.querySelector('#vxWpForm');
    const doc=form?.querySelector('.wp-exact-doc');
    if(!doc) return;
    markBlocks(doc);
    form.querySelectorAll('.wp-exact-field textarea').forEach(el=>{el.style.height='auto';el.style.height=Math.max(el.scrollHeight,12)+'px';});
    form.querySelectorAll('.wp-exact-field input').forEach(el=>{el.style.maxWidth='100%';el.style.overflow='visible';el.style.textOverflow='clip';});
    form.querySelectorAll('.wp-exact-term,.wp-exact-auth,.wp-exact-box').forEach(el=>{el.style.maxHeight='none';el.style.overflow='visible';});
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(normalize));
  mo.observe(document.documentElement,{childList:true,subtree:true});
  addStyle();setTimeout(normalize,200);setTimeout(normalize,800);setTimeout(normalize,1600);
})();