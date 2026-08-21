/* VoxAssist V0.8.13 — sincroniza proporções da ficha Whirlpool com parecer-fabrica */
(function(){
 const ID='vxWpFactoryCssSync';
 function apply(){
  if(document.getElementById(ID)) return;
  const s=document.createElement('style'); s.id=ID; s.textContent=`
  #vxWpForm .wp-exact-doc{
    box-sizing:border-box!important;
    width:210mm!important;
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
  #vxWpForm .wp-exact-table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;margin:0!important}
  #vxWpForm .wp-exact-table + .wp-exact-table{border-top:none!important}
  #vxWpForm .wp-exact-table th,#vxWpForm .wp-exact-table td{border:1px solid #000!important;padding:3px 5px!important;vertical-align:top!important;font-weight:normal!important;color:#000!important}
  #vxWpForm .wp-header td{padding:4px 6px!important;line-height:1.35!important}
  #vxWpForm .wp-exact-table.wp-noinner{border:1px solid #000!important}
  #vxWpForm .wp-exact-table.wp-noinner th,#vxWpForm .wp-exact-table.wp-noinner td{border:none!important;padding-top:1px!important;padding-bottom:1px!important}
  #vxWpForm .wp-exact-field{display:flex!important;align-items:baseline!important;gap:3px!important;margin:0!important;min-height:0!important;line-height:1.22!important}
  #vxWpForm .wp-exact-field>span{display:inline!important;flex:0 0 auto!important;font-size:7.9pt!important;font-weight:400!important;line-height:1.22!important;letter-spacing:0!important}
  #vxWpForm .wp-exact-field input,#vxWpForm .wp-exact-field textarea{display:inline!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;min-height:0!important;height:auto!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;color:#000!important;font:8.4pt Arial,Helvetica,sans-serif!important;line-height:1.22!important;resize:none!important;overflow:hidden!important}
  #vxWpForm .wp-exact-inline-group{display:flex!important;gap:8px!important;align-items:baseline!important;flex-wrap:nowrap!important}
  #vxWpForm .wp-exact-inline-group .wp-exact-field{display:inline-flex!important;flex:0 1 auto!important;white-space:nowrap!important}
  #vxWpForm .wp-exact-label-target{font-family:'Courier New',monospace!important;font-size:9pt!important;padding:18px 0!important;letter-spacing:.4px!important}
  #vxWpForm .wp-exact-table td b{font-weight:700!important;font-size:7.9pt!important;line-height:1.1!important}
  #vxWpForm .wpf-parts{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important}
  #vxWpForm .wpf-parts th,#vxWpForm .wpf-parts td{border:1px solid #000!important;padding:2px 4px!important;font-size:7.9pt!important;font-weight:400!important}
  #vxWpForm .wpf-parts td{height:15px!important}
  #vxWpForm .wp-exact-box{border:1px solid #000!important;border-top:0!important;padding:5px 6px!important;font-size:8.1pt!important;line-height:1.2!important}
  #vxWpForm .wp-exact-title{font-weight:700!important;letter-spacing:.5px!important;font-size:9.5pt!important;text-align:center!important}
  #vxWpForm .wp-exact-auth p{margin:3px 0!important;font-size:8.1pt!important;line-height:1.2!important}
  #vxWpForm .wp-auth-name{min-width:46mm!important}
  #vxWpForm .wp-auth-bottom{margin-top:12px!important}
  #vxWpForm .wp-auth-date{width:40%!important}
  #vxWpForm .wp-auth-sign{width:50%!important;margin-right:8mm!important}
  #vxWpForm .wp-auth-sign .sig-area{height:34px!important}
  #vxWpForm .wp-exact-term p{margin:3px 0!important;font-size:7.5pt!important;line-height:1.18!important;text-align:justify!important}
  #vxWpForm #wpfAddPart{display:none!important}
  @media(max-width:900px){#vxWpForm .wp-exact-doc{width:100%!important;max-width:100%!important;padding:10px!important;font-size:8pt!important}}
  `; document.head.appendChild(s);
 }
 const mo=new MutationObserver(apply); mo.observe(document.documentElement,{childList:true,subtree:true}); apply();
})();