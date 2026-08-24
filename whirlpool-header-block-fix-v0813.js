/* VoxAssist V0.8.13 — ajuste fino do 1º bloco Whirlpool */
(function(){
  const ID='vxWpHeaderBlockFix';
  function style(){
    if(document.getElementById(ID)) return;
    const s=document.createElement('style'); s.id=ID; s.textContent=`
      #vxWpForm .wp-exact-doc .wp-header{font-size:8.8pt!important;line-height:1.28!important}
      #vxWpForm .wp-exact-doc .wp-header td{padding:3.4px 5px!important}
      #vxWpForm .wp-exact-doc .wp-header .wp-exact-field>span{font-size:8.2pt!important;line-height:1.28!important}
      #vxWpForm .wp-exact-doc .wp-header .wp-exact-field input{font-size:8.8pt!important;line-height:1.28!important}
      #vxWpForm .wp-exact-doc .wp-header [name="centralAtendimento"]{display:block!important;width:100%!important;margin-top:1px!important;font-weight:400!important}
      #vxWpForm .wp-exact-doc .wp-header [name="centralAtendimento"]::placeholder{color:#000!important}
      #vxWpForm .wp-exact-doc .wp-header .wp-central-field{display:block!important}
      #vxWpForm .wp-exact-doc .wp-header .wp-central-field>span{display:block!important;margin:0!important;font-weight:700!important}
      #vxWpForm .wp-exact-doc .wp-header .wp-central-field input{display:block!important;width:100%!important;margin:0!important}
      @media print{
        #vxWpForm .wp-exact-doc .wp-header{font-size:8.8pt!important}
        #vxWpForm .wp-exact-doc .wp-header .wp-exact-field>span{font-size:8.2pt!important}
        #vxWpForm .wp-exact-doc .wp-header .wp-exact-field input{font-size:8.8pt!important}
      }
    `;document.head.appendChild(s);
  }
  function apply(){
    style();
    const form=document.querySelector('#vxWpForm');
    const header=form?.querySelector('.wp-header'); if(!header) return;
    const central=header.querySelector('[name="centralAtendimento"]');
    if(central){
      const w=central.closest('.wp-exact-field');
      if(w){w.classList.add('wp-central-field'); const cap=w.querySelector(':scope>span'); if(cap) cap.textContent='CENTRAL DE ATENDIMENTO';}
      const brand=((form.querySelector('[name="marca"]')?.value)||central.value||'').toUpperCase();
      central.value=brand.includes('BRASTEMP')?'BRASTEMP':'CONSUL';
    }
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(apply));mo.observe(document.documentElement,{childList:true,subtree:true});
  apply();setTimeout(apply,300);setTimeout(apply,1000);

  /* Hotfix 23/08: carrega o refinamento que unifica Cliente/Aparelho e corrige o endereço superior. */
  if(!document.querySelector('script[data-wp-client-equipment-fix]')){
    const sc=document.createElement('script');
    sc.src='whirlpool-client-equipment-block-fix-v0813.js?v=0813-20260823-WPCLIENTEQ1';
    sc.dataset.wpClientEquipmentFix='1';
    document.head.appendChild(sc);
  }

  /* 24/08: carrega o módulo Electrolux isolado de relatórios. */
  if(!document.querySelector('script[data-electrolux-reports]')){
    const sc=document.createElement('script');
    sc.src='electrolux-reports-v0813.js?v=0813-20260824-ELX1';
    sc.dataset.electroluxReports='1';
    document.head.appendChild(sc);
  }
})();