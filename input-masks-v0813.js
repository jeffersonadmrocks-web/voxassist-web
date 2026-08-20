/* VoxAssist V0.8.13 — máscaras automáticas globais de documentos e contatos */
(function(){
  const onlyDigits=(v,max)=>String(v||'').replace(/\D/g,'').slice(0,max);
  function formatCpfCnpj(v){
    const d=onlyDigits(v,14);
    if(d.length<=11){
      if(d.length<=3)return d;
      if(d.length<=6)return `${d.slice(0,3)}.${d.slice(3)}`;
      if(d.length<=9)return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
      return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
    }
    if(d.length<=2)return d;
    if(d.length<=5)return `${d.slice(0,2)}.${d.slice(2)}`;
    if(d.length<=8)return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
    if(d.length<=12)return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
  }
  function formatPhone(v){
    const d=onlyDigits(v,11);
    if(!d)return '';
    if(d.length<=2)return `(${d}`;
    const ddd=d.slice(0,2), rest=d.slice(2);
    if(rest.length<=4)return `(${ddd}) ${rest}`;
    if(rest.length<=8)return `(${ddd}) ${rest.slice(0,4)}-${rest.slice(4)}`;
    return `(${ddd}) ${rest.slice(0,5)}-${rest.slice(5,9)}`;
  }
  function bindMask(el,type){
    const key='vxMask'+type;if(el.dataset[key]==='1')return;el.dataset[key]='1';el.inputMode='numeric';
    const fmt=type==='Doc'?formatCpfCnpj:formatPhone;el.maxLength=type==='Doc'?18:15;el.value=fmt(el.value);
    el.addEventListener('input',()=>{el.value=fmt(el.value);try{el.setSelectionRange(el.value.length,el.value.length)}catch{}});
    el.addEventListener('blur',()=>{el.value=fmt(el.value)});
  }
  function bind(root=document){
    root.querySelectorAll('input[name="doc"],input[data-name="document"],#newClientDocument,#rDoc,input[id*="Cpf" i],input[id*="Cnpj" i]').forEach(el=>bindMask(el,'Doc'));
    root.querySelectorAll('input[name="phone"],input[name="mobile"],input[data-name="phone_primary"],input[data-name="phone_secondary"],#newClientPhone,#newClientPhone2,#rPhone,input[id*="Phone" i],input[id*="Telefone" i],input[id*="Celular" i]').forEach(el=>bindMask(el,'Phone'));
  }
  window.vxFormatCpfCnpj=formatCpfCnpj;window.vxFormatPhone=formatPhone;window.vxBindInputMasks=bind;
  document.addEventListener('DOMContentLoaded',()=>bind());
  const mo=new MutationObserver(ms=>{for(const m of ms){for(const n of m.addedNodes){if(n.nodeType===1)bind(n.matches?.('input')?(n.parentElement||document):n)}}});
  mo.observe(document.documentElement,{childList:true,subtree:true});
})();
