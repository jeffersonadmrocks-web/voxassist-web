/* VoxAssist V0.8.13 — loja real do banco + CEP automático */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const digits=v=>String(v||'').replace(/\D/g,'');
  const fmtCep=v=>{const d=digits(v).slice(0,8);return d.length>5?d.slice(0,5)+'-'+d.slice(5):d};

  async function storesForActiveCompany(){
    try{return await api('stores?select=id,name,code,active,company_id&active=eq.true&order=name')}catch{return []}
  }

  async function syncStoreSelectors(){
    const sels=[...document.querySelectorAll('#activeStore,#fStore')];
    if(!sels.length)return;
    const stores=await storesForActiveCompany();
    sels.forEach(sel=>{
      const isDash=sel.id==='fStore';
      const current=state?.profile?.store_id||'';
      sel.innerHTML=(isDash?'<option value="">TODAS</option>':'')+stores.map(s=>`<option value="${E(s.id)}" ${String(s.id)===String(current)?'selected':''}>${E(s.name)}</option>`).join('');
      if(!stores.length)sel.innerHTML='<option value="">NENHUMA LOJA CADASTRADA</option>';
      sel.disabled=!stores.length;
      if(sel.id==='activeStore'&&!sel.dataset.vxBound){
        sel.dataset.vxBound='1';
        sel.addEventListener('change',async()=>{
          const id=sel.value||null;
          try{
            // Mesma rpc/switch_store usada em company-management-final-
            // v0813.js — achado real de auditoria: este arquivo gravava
            // store_id direto via PATCH em profiles, pulando qualquer
            // validação/efeito colateral que a RPC do backend faça
            // (ex.: checar user_store_access, auditoria).
            await api('rpc/switch_store',{method:'POST',body:JSON.stringify({target_store:id})});
            await loadProfile();await loadCore();
            toast('Loja ativa alterada.');
          }catch(err){toast('Não foi possível alterar a loja: '+err.message,'err');}
        });
      }
    });
  }

  function setValue(root,selectors,value){
    if(value==null||value==='')return;
    for(const s of selectors){const el=root.querySelector(s);if(el){el.value=String(value).toUpperCase();el.dispatchEvent(new Event('input',{bubbles:true}));break;}}
  }

  async function lookupCep(input){
    const cep=digits(input.value).slice(0,8);
    input.value=fmtCep(cep);
    if(cep.length!==8||input.dataset.vxCepLoading==='1'||input.dataset.vxLastCep===cep)return;
    input.dataset.vxCepLoading='1';
    try{
      const r=await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if(!r.ok)throw new Error('CEP não localizado');
      const d=await r.json();
      if(d.erro)throw new Error('CEP não localizado');
      input.dataset.vxLastCep=cep;
      const root=input.closest('form')||input.closest('.vx-admin-modal')||input.closest('.vx-os-panel')||document;
      setValue(root,['input[name="address"]','input[data-name="address"]','#newClientAddress'],d.logradouro);
      setValue(root,['input[name="neighborhood"]','input[data-name="neighborhood"]','#newClientNeighborhood'],d.bairro);
      setValue(root,['input[name="city"]','input[data-name="city"]','#newClientCity'],d.localidade);
      setValue(root,['input[name="uf"]','input[data-name="state"]','#newClientState'],d.uf);
      const num=root.querySelector('input[name="number"],input[data-name="address_number"],#newClientNumber');
      if(num)num.focus();
      toast('Endereço preenchido pelo CEP.');
    }catch(err){toast(err.message||'Não foi possível consultar o CEP.','err');}
    finally{input.dataset.vxCepLoading='0';}
  }

  function bindCep(root=document){
    const candidates=[...root.querySelectorAll('input[name="zip"],input[name="zip_code"],input[data-name="zip_code"],#newClientZip,input[id*="Cep" i],input[id*="CEP" i]')];
    candidates.forEach(input=>{
      if(input.dataset.vxCepMask==='1')return;
      input.dataset.vxCepMask='1';input.inputMode='numeric';input.maxLength=9;input.value=fmtCep(input.value);
      input.addEventListener('input',()=>{input.value=fmtCep(input.value);if(digits(input.value).length===8)lookupCep(input)});
      input.addEventListener('blur',()=>lookupCep(input));
    });
  }

  const run=()=>{bindCep();syncStoreSelectors()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else setTimeout(run,0);
  const mo=new MutationObserver(ms=>{let needStore=false;for(const m of ms){for(const n of m.addedNodes){if(n.nodeType!==1)continue;bindCep(n);if(n.matches?.('#activeStore,#fStore')||n.querySelector?.('#activeStore,#fStore'))needStore=true;}}if(needStore)syncStoreSelectors()});
  mo.observe(document.documentElement,{childList:true,subtree:true});
  window.vxSyncStoreSelectors=syncStoreSelectors;
})();