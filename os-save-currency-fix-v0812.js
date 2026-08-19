/* VoxAssist V0.8.12 — corrige campos monetários formatados (ex.: R$ 0,00) antes do save global */
(function(){
  const moneyNames=new Set(['labor_value','freight_value','auxiliary_material_value','technical_report_value','discount_value']);
  function parseBR(v){
    if(v==null||v==='')return null;
    let s=String(v).trim();
    if(!s)return null;
    s=s.replace(/\s/g,'').replace(/R\$/gi,'');
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/[^0-9.-]/g,'');
    const n=Number(s);
    return Number.isFinite(n)?n:0;
  }
  function sanitize(){
    document.querySelectorAll('.vx-os-panel [data-entity="financial"][data-name]').forEach(el=>{
      if(!moneyNames.has(el.dataset.name))return;
      const n=parseBR(el.value);
      if(n!=null)el.value=String(n);
    });
  }
  document.addEventListener('click',e=>{if(e.target.closest('#vxGlobalSave'))sanitize();},true);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='w')sanitize();},true);
})();