/* VoxAssist Web V0.8.12 — busca automática de endereço por CEP na Nova OS */
(function(){
  const digits=v=>String(v||'').replace(/\D/g,'');
  const upper=v=>String(v||'').toUpperCase();
  const set=(id,v)=>{const el=document.querySelector('#'+id);if(el&&v!==undefined&&v!==null)el.value=upper(v)};
  async function lookupCep(cep){
    const clean=digits(cep);
    if(clean.length!==8)return;
    const zip=document.querySelector('#newClientZip');
    if(zip){zip.dataset.cepLoading='1';zip.setAttribute('aria-busy','true')}
    try{
      let data=null;
      try{
        const r=await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        if(r.ok){const d=await r.json();if(!d.erro)data=d}
      }catch{}
      if(!data){
        try{
          const r=await fetch(`https://brasilapi.com.br/api/cep/v1/${clean}`);
          if(r.ok){const d=await r.json();data={logradouro:d.street,bairro:d.neighborhood,localidade:d.city,uf:d.state}}
        }catch{}
      }
      if(!data)return toast('CEP não localizado. Preencha o endereço manualmente.','err');
      set('newClientAddress',data.logradouro||'');
      set('newClientNeighborhood',data.bairro||'');
      set('newClientCity',data.localidade||data.cidade||'');
      set('newClientState',data.uf||data.estado||'');
      const num=document.querySelector('#newClientNumber');if(num)num.focus();
      toast('Endereço preenchido automaticamente pelo CEP.');
    }finally{
      if(zip){delete zip.dataset.cepLoading;zip.removeAttribute('aria-busy')}
    }
  }
  function bindCep(){
    const zip=document.querySelector('#newClientZip');if(!zip||zip.dataset.cepBound==='1')return;
    zip.dataset.cepBound='1';
    let timer=null;
    zip.addEventListener('input',()=>{
      const clean=digits(zip.value).slice(0,8);
      zip.value=clean.length>5?clean.slice(0,5)+'-'+clean.slice(5):clean;
      clearTimeout(timer);
      if(clean.length===8)timer=setTimeout(()=>lookupCep(clean),250);
    });
    zip.addEventListener('blur',()=>{const clean=digits(zip.value);if(clean.length===8)lookupCep(clean)});
  }
  const original=window.renderNewOs;
  if(typeof original==='function'){
    window.renderNewOs=async function(){const r=await original.apply(this,arguments);setTimeout(bindCep,0);return r};
  }
  document.addEventListener('focusin',e=>{if(e.target?.id==='newClientZip')bindCep()});
})();
