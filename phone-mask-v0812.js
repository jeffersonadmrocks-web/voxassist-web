/* VoxAssist Web V0.8.12 — máscara de telefone BR com DDD */
(function(){
  function digits(v){return String(v||'').replace(/\D/g,'').slice(0,11)}
  function formatPhone(v){
    const d=digits(v);
    if(!d)return '';
    if(d.length<=2)return `(${d}`;
    const ddd=d.slice(0,2), rest=d.slice(2);
    if(rest.length<=4)return `(${ddd}) ${rest}`;
    if(rest.length<=8)return `(${ddd}) ${rest.slice(0,4)}-${rest.slice(4)}`;
    return `(${ddd}) ${rest.slice(0,5)}-${rest.slice(5,9)}`;
  }
  window.vxPhoneDigits=digits;
  window.vxFormatPhone=formatPhone;

  function bind(root=document){
    const selectors=['#newClientPhone','#newClientPhone2','input[data-name="phone_primary"]','input[data-name="phone_secondary"]','input[id*="Phone"]','input[name*="phone"]'];
    root.querySelectorAll(selectors.join(',')).forEach(el=>{
      if(el.dataset.vxPhoneMask==='1')return;
      el.dataset.vxPhoneMask='1';
      el.inputMode='numeric';
      el.maxLength=15;
      el.value=formatPhone(el.value);
      el.addEventListener('input',()=>{const pos=el.selectionStart;el.value=formatPhone(el.value);try{el.setSelectionRange(el.value.length,el.value.length)}catch(e){}});
      el.addEventListener('blur',()=>{el.value=formatPhone(el.value)});
    });
  }
  window.vxBindPhoneMasks=bind;
  document.addEventListener('DOMContentLoaded',()=>bind());
  const mo=new MutationObserver(muts=>{for(const m of muts){for(const n of m.addedNodes){if(n.nodeType===1){if(n.matches?.('input'))bind(n.parentElement||document);else bind(n)}}}});
  mo.observe(document.documentElement,{childList:true,subtree:true});
})();
