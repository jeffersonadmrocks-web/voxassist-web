/* VoxAssist V0.8.13 — dados fixos do cabeçalho Whirlpool */
(function(){
  const FIXED={
    autorizada:'VOX SERRA LTDA',
    enderecoAutorizada:'AVENIDA DESEMBARGADOR MARIO DA SILVA NUNES - 611 - JARDIM LIMOEIRO - SERRA - ES',
    cnpjAutorizada:'61.422.882/0001-78',
    foneAutorizada:'(27) 3227-1288',
    inscEstadualAutorizada:'084.574.550',
    foneCentral1:'3003 0777',
    foneCentral2:'0800 970 0777'
  };
  function brand(){
    const form=document.querySelector('#vxWpForm');
    const raw=(form?.querySelector('[name="marca"]')?.value||form?.querySelector('[name="centralAtendimento"]')?.value||'').toUpperCase();
    return raw.includes('BRASTEMP')?'BRASTEMP':'CONSUL';
  }
  function set(name,value,lock=true){
    const form=document.querySelector('#vxWpForm');
    const el=form?.querySelector(`[name="${name}"]`);if(!el)return;
    el.value=value;
    if(lock){el.readOnly=true;el.dataset.wpFixed='1';}
  }
  function apply(){
    const form=document.querySelector('#vxWpForm');if(!form)return;
    Object.entries(FIXED).forEach(([k,v])=>set(k,v,true));
    set('centralAtendimento',brand(),true);
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(apply));
  mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(apply,200);setTimeout(apply,800);setTimeout(apply,1600);
})();