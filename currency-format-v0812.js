/* VoxAssist Web V0.8.12 — formatação monetária BRL automática */
(function(){
  const nf=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});
  function parse(v){
    if(v==null||v==='')return 0;
    if(typeof v==='number')return Number.isFinite(v)?v:0;
    let s=String(v).trim().replace(/\s/g,'').replace(/^R\$/i,'');
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/[^0-9.-]/g,'');
    const n=Number(s);return Number.isFinite(n)?n:0;
  }
  function rawBRL(v){return parse(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function isCurrency(el){
    if(!el||!el.matches?.('input'))return false;
    const id=String(el.id||'').toLowerCase(),name=String(el.name||'').toLowerCase(),dn=String(el.dataset?.name||'').toLowerCase();
    const label=String(el.closest('.vx-field,.field')?.querySelector('label')?.textContent||'').toUpperCase();
    return /(_value|value|amount|price|valor|total|desconto|frete|material)/.test(id+' '+name+' '+dn)||/VALOR|PREÇO|TOTAL|DESCONTO|FRETE|MÃO DE OBRA|PARECER/.test(label);
  }
  function prepare(el){
    if(!isCurrency(el)||el.dataset.vxCurrency==='1')return;
    el.dataset.vxCurrency='1';
    el.dataset.vxCurrencyType=el.type||'text';
    try{el.type='text';}catch{}
    el.inputMode='decimal';
    if(el.value!=='')el.value=nf.format(parse(el.value));
  }
  function prepareAll(root=document){root.querySelectorAll?.('input').forEach(prepare);}
  window.vxParseCurrency=parse;
  window.vxFormatCurrency=v=>nf.format(parse(v));
  window.vxNormalizeCurrencyFields=function(root=document){root.querySelectorAll?.('input[data-vx-currency="1"]').forEach(el=>{el.value=String(parse(el.value));});};

  document.addEventListener('focusin',e=>{const el=e.target;if(el?.dataset?.vxCurrency==='1'){el.value=rawBRL(el.value);setTimeout(()=>el.select?.(),0);}},true);
  document.addEventListener('focusout',e=>{const el=e.target;if(el?.dataset?.vxCurrency==='1')el.value=nf.format(parse(el.value));},true);
  document.addEventListener('input',e=>{const el=e.target;if(el?.dataset?.vxCurrency==='1'){let v=el.value.replace(/[^0-9,.-]/g,'');const parts=v.split(',');if(parts.length>2)v=parts.shift()+','+parts.join('');el.value=v;}},true);
  document.addEventListener('submit',()=>window.vxNormalizeCurrencyFields(document),true);

  const baseRender=window.render;
  if(typeof baseRender==='function')window.render=async function(){const r=await baseRender.apply(this,arguments);prepareAll(document);setTimeout(()=>prepareAll(document),0);return r;};
  const baseDetail=window.renderOsDetail;
  if(typeof baseDetail==='function')window.renderOsDetail=async function(){const r=await baseDetail.apply(this,arguments);prepareAll(document);return r;};
  setTimeout(()=>prepareAll(document),0);
})();