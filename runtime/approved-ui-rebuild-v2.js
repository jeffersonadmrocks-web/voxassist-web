/* VoxAssist — Approved UI Rebuild V2
 * Reconstrução estrutural dos componentes aprovados. Não é skin CSS.
 * 1) Caso de Atenção: substitui markup antigo mantendo IDs/handlers.
 * 2) Dashboard: torna os 3 estados de casos acionáveis e garante drill-down.
 */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function css(){if(document.getElementById('vxApprovedUiV2Css'))return;const s=document.createElement('style');s.id='vxApprovedUiV2Css';s.textContent=`
  #vxCasoAtencaoModal{position:fixed;inset:0;z-index:100000;background:rgba(8,25,43,.58);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:22px}
  #vxCasoAtencaoModal .vx-modal{width:min(760px,96vw)!important;max-height:92vh;overflow:auto!important;margin:0!important;padding:0!important;background:#fff!important;border:1px solid #d6e0e9!important;border-radius:16px!important;box-shadow:0 28px 80px rgba(5,27,48,.30)!important}
  #vxCasoAtencaoModal .vx-modal>h3{margin:0!important;padding:20px 24px 5px!important;background:#0b365b!important;color:#fff!important;font-size:19px!important;border:0!important}
  #vxCasoAtencaoModal .vx-modal>h3:after{content:'Registre o ponto de atenção, defina a prioridade e direcione para quem precisa agir.';display:block;font-size:11px;font-weight:400;color:#cfdeea;margin-top:6px;padding-bottom:15px;border-bottom:4px solid #ef8b17}
  #vxCasoAtencaoModal .vx-field{margin:0!important;padding:14px 24px 0!important}.vx-modal .vx-field label{display:block!important;font-size:10px!important;font-weight:900!important;letter-spacing:.45px!important;text-transform:uppercase!important;color:#536b81!important;margin:0 0 6px!important}
  #vxCasoAtencaoModal input,#vxCasoAtencaoModal select,#vxCasoAtencaoModal textarea{width:100%!important;border:1px solid #c7d3de!important;border-radius:9px!important;padding:10px 12px!important;background:#fbfcfe!important;font:inherit!important;color:#19334b!important;box-shadow:none!important}
  #vxCasoAtencaoModal textarea{min-height:88px!important;resize:vertical!important}#vxCasoAtencaoModal input:focus,#vxCasoAtencaoModal select:focus,#vxCasoAtencaoModal textarea:focus{outline:none!important;border-color:#1767d9!important;box-shadow:0 0 0 3px rgba(23,103,217,.09)!important;background:#fff!important}
  #vxCasoAtencaoModal .vx-caso-recipients{margin:7px 24px 2px!important;padding:0!important;border:1px solid #d8e1ea!important;border-radius:11px!important;background:#f7f9fc!important;display:grid!important;grid-template-columns:210px 1fr!important;overflow:hidden!important;max-height:230px!important}
  #vxCasoAtencaoModal .vx-caso-recipients-group{padding:13px 14px!important;border:0!important;background:transparent!important}#vxCasoAtencaoModal .vx-caso-recipients-group+ .vx-caso-recipients-group{border-left:1px solid #d8e1ea!important;background:#fff!important}
  #vxCasoAtencaoModal .vx-caso-recipients-group>strong{display:block!important;color:#0b365b!important;font-size:10px!important;text-transform:uppercase!important;letter-spacing:.5px!important;margin-bottom:7px!important}
  #vxCasoAtencaoModal .vx-caso-recipient-item{display:flex!important;align-items:center!important;gap:9px!important;padding:7px 5px!important;border-radius:7px!important;font-size:12px!important;color:#21384e!important;cursor:pointer!important}#vxCasoAtencaoModal .vx-caso-recipient-item:hover{background:#edf3f9!important}
  #vxCasoAtencaoModal .vx-caso-recipient-item input{appearance:auto!important;width:15px!important;height:15px!important;min-width:15px!important;margin:0!important;padding:0!important;box-shadow:none!important}
  #vxCasoAtencaoModal .vx-modal-actions{position:sticky!important;bottom:0!important;margin-top:17px!important;padding:14px 24px!important;background:#f7f9fb!important;border-top:1px solid #dde5ec!important;display:flex!important;justify-content:flex-end!important;gap:9px!important}
  #vxCasoAtencaoModal .vx-modal-actions button{min-width:112px!important;border-radius:8px!important;padding:10px 16px!important;font-weight:800!important}.vx-c-case-state{appearance:none;border:0;background:#fff;border-radius:11px;padding:14px 16px;text-align:left;cursor:pointer;min-width:0;box-shadow:0 1px 2px rgba(20,45,70,.04);transition:.15s}.vx-c-case-state:hover{transform:translateY(-1px);box-shadow:0 7px 18px rgba(20,45,70,.10)}.vx-c-case-state b{display:block;font-size:21px;color:#a21e19}.vx-c-case-state span{display:block;font-weight:800;color:#1d3043;margin-top:2px}.vx-c-case-state small{display:block;color:#6d7e8e;margin-top:2px}
  @media(max-width:620px){#vxCasoAtencaoModal{padding:7px}#vxCasoAtencaoModal .vx-caso-recipients{grid-template-columns:1fr!important}#vxCasoAtencaoModal .vx-caso-recipients-group+ .vx-caso-recipients-group{border-left:0!important;border-top:1px solid #d8e1ea!important}}
  `;document.head.appendChild(s)}
  css();

  function enhanceCases(){
    const card=document.querySelector('.vx-c-cases-card');if(!card||card.dataset.v2==='1')return;card.dataset.v2='1';
    const row=card.querySelector('.vx-c-cases-row');if(!row)return;
    const items=[...row.children];const keys=['cases:casesNovos','cases:casesAndamento','cases:casesResolvidos'];const titles=['Novos casos','Casos em andamento','Casos resolvidos'];
    items.forEach((old,i)=>{const b=document.createElement('button');b.type='button';b.className='vx-c-case-state';b.dataset.drill=keys[i];b.dataset.title=titles[i];b.innerHTML=old.innerHTML;old.replaceWith(b)});
    card.querySelectorAll('[data-drill]').forEach(el=>el.addEventListener('click',ev=>{
      // O dashboard canônico registra o handler antes deste rebuild. Para os
      // botões criados depois, reutilizamos o link original correspondente.
      if(el.tagName==='A')return;
      ev.preventDefault();const key=el.dataset.drill;const proxy=[...document.querySelectorAll('[data-drill]')].find(x=>x!==el&&x.dataset.drill===key);if(proxy)proxy.click();
    }));
  }
  const mo=new MutationObserver(()=>enhanceCases());mo.observe(document.documentElement,{childList:true,subtree:true});enhanceCases();
})();
