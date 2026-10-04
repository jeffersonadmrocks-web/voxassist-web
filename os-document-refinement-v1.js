/* Shared enrichment for printed and Chat VOX documents. */
(function(){
 const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const row=(label,value)=>String(value??'').trim()?'<div class="row"><b>'+E(label)+'</b><span>'+E(value)+'</span></div>':'';
 window.vxRefineOsDocument=async function(body,o,parts,fin,b,type){
  const cid=o.company_id||b.id||state?.profile?.active_company_id||state?.profile?.company_id;
  const terms=cid?await api('document_terms?company_id=eq.'+encodeURIComponent(cid)+'&document_type=eq.'+type.toUpperCase()+'&select=body,version&order=version.desc&limit=1'):[];
  const text=String(terms?.[0]?.body||'').trim();
  if(!text)throw Error('Cadastre os termos de '+type+' em Configurações → Ordens de Serviço antes de emitir este documento.');
  const logo=b.logo_url||'icons/icon-192.png';
  if(!b.logo_url)body=body.replace('<div class="head"><div>','<div class="head"><div><img alt="VOX" src="'+E(new URL(logo,location.href).href)+'">');
  const dates='<div class="box"><h3>IDENTIFICAÇÃO DO ATENDIMENTO</h3>'+row('ENTRADA',o.opened_at?new Date(o.opened_at).toLocaleString('pt-BR'):'')+row('TÉCNICO',o.profiles?.full_name)+row('TIPO DE OS',o.order_type)+row('CNPJ DA EMPRESA',b.document)+'</div>';
  const items=(parts||[]).length?'<div class="box"><h3>PEÇAS CADASTRADAS NA OS</h3><table class="vox-parts"><thead><tr><th>Código</th><th>Descrição</th><th>Qtd.</th>'+(type==='entrada'?'':'<th>Unitário</th><th>Total</th>')+'</tr></thead><tbody>'+parts.map(p=>'<tr><td>'+E(p.part_code||p.code||'—')+'</td><td>'+E(p.description||p.part_description||'Peça')+'</td><td>'+E(p.quantity??0)+'</td>'+(type==='entrada'?'':'<td>'+money(p.unit_value)+'</td><td>'+money(Number(p.quantity||0)*Number(p.unit_value||0))+'</td>')+'</tr>').join('')+'</tbody></table></div>':'';
  const charges=type==='entrada'?'':row('FRETE',Number(fin.freight_value)?money(fin.freight_value):'')+row('MATERIAL AUXILIAR',Number(fin.auxiliary_material_value)?money(fin.auxiliary_material_value):'')+row('PARECER TÉCNICO',Number(fin.technical_report_value)?money(fin.technical_report_value):'')+row('DESCONTO',Number(fin.discount_value)?money(fin.discount_value):'');
  body=body.replace('<div class="grid">',dates+'<div class="grid">');
  body=body.replace('<div class="row"><b>TOTAL</b>',charges+'<div class="row"><b>TOTAL</b>');
  const conditions='<div class="box"><h3>TERMOS E CONDIÇÕES</h3><div style="white-space:pre-wrap;line-height:1.55">'+E(text)+'</div></div>';
  body=body.replace(/<div class="grid"><div class="sign">/,items+conditions+'<div class="grid"><div class="sign">');
  return '<style>.vox .head{background:#fff!important;color:#163754!important;border:1px solid #cbd7e3!important;border-top:4px solid #163754!important}.vox .head .muted,.vox .osno{color:#163754!important}.vox .head img{background:#fff;object-fit:contain;max-height:64px}.vox .box{break-inside:avoid}.vox .row span{white-space:pre-wrap;overflow-wrap:anywhere}.vox-parts{width:100%;border-collapse:collapse;font-size:10px}.vox-parts th,.vox-parts td{padding:6px;border-bottom:1px solid #dce5ee;text-align:left}.vox-parts th{background:#f0f4f8}.vox .sign{break-inside:avoid}</style>'+body;
 };
})();
