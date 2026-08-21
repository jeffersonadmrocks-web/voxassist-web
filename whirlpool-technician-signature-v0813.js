/* VoxAssist V0.8.13 — proteção contra duplicidade de assinaturas Whirlpool */
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let scheduled=false;
  function cleanup(){
    scheduled=false;
    const form=$('#vxWpForm'); if(!form)return;
    // O modelo canônico de assinaturas é o par consumidor/técnico dentro da AUTORIZAÇÃO.
    // Remove blocos legados independentes que eram reinjetados pelo MutationObserver.
    $$('.vx-wp-tech-sign',form).forEach(x=>x.remove());
    const pairs=$$('.wpf-signatures-final',form);
    if(pairs.length>1) pairs.slice(1).forEach(x=>x.remove());
    const pair=pairs[0];
    if(pair) pair.dataset.signatureCanonical='1';
  }
  function schedule(){if(scheduled)return;scheduled=true;setTimeout(cleanup,120)}
  const mo=new MutationObserver(schedule);
  mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(cleanup,700);
})();