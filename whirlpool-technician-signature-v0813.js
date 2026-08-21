/* VoxAssist V0.8.13 — assinatura visual do técnico no documento Whirlpool */
(function(){
 const $=(s,r=document)=>r.querySelector(s);
 const esc=v=>String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const stateRef=()=>typeof state!=='undefined'?state:null;
 async function loadSignature(){
   const o=stateRef()?.activeOs;if(!o)return null;
   const techId=o.technician_id;
   if(!techId)return {name:o.profiles?.full_name||'',signature:''};
   try{const rows=await api(`profiles?id=eq.${techId}&select=full_name,signature_data`);return {name:rows?.[0]?.full_name||o.profiles?.full_name||'',signature:rows?.[0]?.signature_data||''}}catch(e){return {name:o.profiles?.full_name||'',signature:''}}
 }
 function style(){if($('#vxWpTechSignStyle'))return;const s=document.createElement('style');s.id='vxWpTechSignStyle';s.textContent=`
 .vx-wp-tech-sign{border:1px solid #111;background:#fff;min-height:92px;padding:5px;text-align:center}.vx-wp-tech-sign .ttl{font-size:9px;font-weight:800;text-align:left}.vx-wp-tech-sign .area{height:52px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #333;margin:0 18px 3px}.vx-wp-tech-sign img{max-height:48px;max-width:230px;object-fit:contain}.vx-wp-tech-sign .name{font-size:9px;font-weight:700}.vx-wp-tech-sign .missing{font-size:9px;color:#7b8794;align-self:center}.vx-wp-tech-sign .hint{font-size:8px;color:#667788;margin-top:2px}
 @media print{.vx-wp-tech-sign .hint{display:none}}
 `;document.head.appendChild(s)}
 async function inject(){const form=$('#vxWpForm');if(!form||form.querySelector('.vx-wp-tech-sign'))return;style();const t=await loadSignature();if(!t)return;const box=document.createElement('div');box.className='vx-wp-tech-sign';box.innerHTML=`<div class="ttl">ASSINATURA DO TÉCNICO</div><div class="area">${t.signature?`<img src="${esc(t.signature)}" alt="Assinatura do técnico">`:`<span class="missing">ASSINATURA NÃO CADASTRADA NO PERFIL DO TÉCNICO</span>`}</div><div class="name">${esc(t.name)}</div>${t.signature?'':'<div class="hint">Cadastre a assinatura no perfil do técnico para inserção automática.</div>'}`;const actions=form.querySelector('.vx-wp-actions');form.insertBefore(box,actions||null)}
 const mo=new MutationObserver(()=>{if($('#vxWpForm'))setTimeout(inject,80)});mo.observe(document.documentElement,{childList:true,subtree:true});setTimeout(inject,600);
 if(!document.querySelector('script[data-wpfidelity]')){const s=document.createElement('script');s.src='whirlpool-fidelity-validation-v0813.js?v=0813-20260821-WPFIDELITY1';s.dataset.wpfidelity='1';document.head.appendChild(s)}
})();