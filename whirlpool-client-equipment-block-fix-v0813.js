/* VoxAssist V0.8.13 — unifica blocos Cliente/Aparelho e corrige endereço superior Whirlpool */
(function(){
  const STYLE_ID='vxWpClientEquipmentBlockFixStyle';
  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      /* Cabeçalho: endereço completo da Vox Serra sem corte */
      #vxWpForm .wp-exact-doc .wp-header-left .wp-address-field{
        display:flex!important;align-items:flex-start!important;gap:4px!important;width:100%!important;
      }
      #vxWpForm .wp-exact-doc .wp-header-left .wp-address-field>span{
        display:inline!important;font-weight:700!important;flex:0 0 auto!important;
      }
      #vxWpForm .wp-exact-doc .wp-header-left .wp-address-field input[name="enderecoAutorizada"]{
        display:block!important;flex:1 1 auto!important;min-width:0!important;width:100%!important;
        white-space:normal!important;overflow:visible!important;text-overflow:clip!important;
        font-size:7.7pt!important;letter-spacing:-.08px!important;
      }
      #vxWpForm .wp-exact-doc .wp-header td:first-child{width:72%!important}
      #vxWpForm .wp-exact-doc .wp-header td:last-child{width:28%!important}

      /* Cliente e Aparelho: um bloco externo cada, sem grade interna fragmentada */
      #vxWpForm .wp-exact-doc .wp-client-unified,
      #vxWpForm .wp-exact-doc .wp-equipment-unified{border:1px solid #000!important;border-collapse:separate!important;border-spacing:0!important;padding:0!important}
      #vxWpForm .wp-exact-doc .wp-client-unified td,
      #vxWpForm .wp-exact-doc .wp-equipment-unified td{border:0!important;padding:2px 5px!important;vertical-align:top!important}
      #vxWpForm .wp-exact-doc .wp-client-unified tr+tr td,
      #vxWpForm .wp-exact-doc .wp-equipment-unified tr+tr td{border-top:0!important}
      #vxWpForm .wp-exact-doc .wp-client-unified .wp-exact-inline-group,
      #vxWpForm .wp-exact-doc .wp-equipment-unified .wp-exact-inline-group{gap:14px!important}
      #vxWpForm .wp-exact-doc .wp-client-unified .wp-exact-field,
      #vxWpForm .wp-exact-doc .wp-equipment-unified .wp-exact-field{min-height:14px!important}
      @media print{
        #vxWpForm .wp-exact-doc .wp-header-left .wp-address-field input[name="enderecoAutorizada"]{font-size:7.7pt!important}
        #vxWpForm .wp-exact-doc .wp-client-unified,#vxWpForm .wp-exact-doc .wp-equipment-unified{border:1px solid #000!important}
        #vxWpForm .wp-exact-doc .wp-client-unified td,#vxWpForm .wp-exact-doc .wp-equipment-unified td{border:0!important;padding:1.8px 4px!important}
      }
    `;
    document.head.appendChild(s);
  }
  function closestTableByField(form,name){return form.querySelector(`[name="${name}"]`)?.closest('table.wp-exact-table')||null}
  function apply(){
    ensureStyle();const form=document.querySelector('#vxWpForm');if(!form)return;
    const address=form.querySelector('[name="enderecoAutorizada"]');
    if(address){const wrap=address.closest('.wp-exact-field');if(wrap){wrap.classList.add('wp-address-field');const cap=wrap.querySelector(':scope>span');if(cap)cap.textContent='ENDEREÇO:'}}
    const clientTable=closestTableByField(form,'consumidor');if(clientTable)clientTable.classList.add('wp-client-unified');
    const equipmentTable=closestTableByField(form,'produto');if(equipmentTable)equipmentTable.classList.add('wp-equipment-unified');
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(apply));mo.observe(document.documentElement,{childList:true,subtree:true});apply();setTimeout(apply,250);setTimeout(apply,900);setTimeout(apply,1800);
})();