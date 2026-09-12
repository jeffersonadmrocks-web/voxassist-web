/* VoxAssist V0.8.13 — dados fixos do cabeçalho Whirlpool */
(function(){
  const FIXED={
    autorizada:'VOX SERRA LTDA',
    enderecoAutorizada:'AVENIDA DESEMBARGADOR MARIO DA SILVA NUNES - 611 - JARDIM LIMOEIRO - SERRA - ES',
    cnpjAutorizada:'61.422.882/0001-78',
    foneAutorizada:'(27) 3227-1288',
    inscEstadualAutorizada:'084.574.55-0'
  };
  // Achado em 2026-09-12 (comparação com PDF oficial de uma OS CONSUL real):
  // a Central de Atendimento tem telefones próprios por marca -- CONSUL usa
  // 4004 0021 / 0800 722 7799, confirmado no formulário físico oficial.
  // Os números antigos (3003 0777 / 0800 970 0777) ficam como fallback para
  // BRASTEMP, que não tivemos como conferir contra um formulário oficial
  // ainda nesta sessão.
  const CENTRAL={
    CONSUL:['4004 0021','0800 722 7799'],
    BRASTEMP:['3003 0777','0800 970 0777']
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
    const b=brand(),[c1,c2]=CENTRAL[b]||CENTRAL.CONSUL;
    set('centralAtendimento',b,true);set('foneCentral1',c1,true);set('foneCentral2',c2,true);
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(apply));
  mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(apply,200);setTimeout(apply,800);setTimeout(apply,1600);
})();