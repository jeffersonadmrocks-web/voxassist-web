/* VoxAssist Web V0.8.12 — serviço executado no resumo + mapa na OS */
(function(){
  const escLocal=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function primaryAddress(c={}){
    return [c.address,c.address_number,c.complement,c.neighborhood,c.city,c.state,c.zip_code].filter(Boolean).join(', ');
  }

  function addressText(a={}){
    return [a.address,a.address_number,a.complement,a.neighborhood,a.city,a.state,a.zip_code].filter(Boolean).join(', ');
  }

  function openGoogleMaps(address){
    if(!address)return toast('Endereço do cliente não cadastrado.','err');
    window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(address),'_blank','noopener,noreferrer');
  }

  function openWaze(address){
    if(!address)return toast('Endereço do cliente não cadastrado.','err');
    window.open('https://www.waze.com/ul?q='+encodeURIComponent(address)+'&navigate=yes','_blank','noopener,noreferrer');
  }

  async function chooseAddress(){
    const o=window.state?.activeOs || state?.activeOs;
    const c=o?.clients||{};
    const primary=primaryAddress(c);
    let list=[];
    try{
      if(o?.client_id && typeof api==='function'){
        list=await api(`client_addresses?client_id=eq.${o.client_id}&select=*&order=created_at`)||[];
      }
    }catch(e){ list=[]; }
    const addresses=[];
    if(primary)addresses.push({label:'PRINCIPAL',text:primary});
    list.forEach(a=>{const text=addressText(a);if(text && !addresses.some(x=>x.text===text))addresses.push({label:a.label||'ENDEREÇO',text});});
    if(!addresses.length){toast('Endereço do cliente não cadastrado.','err');return null;}
    if(addresses.length===1)return addresses[0].text;
    const menu=addresses.map((a,i)=>`${i+1} - ${a.label}: ${a.text}`).join('\n');
    const picked=prompt(`Escolha o endereço para abrir no mapa:\n\n${menu}`, '1');
    const idx=Number(picked)-1;
    return Number.isInteger(idx)&&addresses[idx]?addresses[idx].text:null;
  }

  window.vxOpenMap=async function(provider='google'){
    const address=await chooseAddress();
    if(!address)return;
    provider==='waze'?openWaze(address):openGoogleMaps(address);
  };

  function enhance(){
    const o=window.state?.activeOs || state?.activeOs;
    if(!o)return;

    const strip=document.querySelector('.vx-budget-strip');
    if(strip && !strip.querySelector('.vx-budget-service')){
      const service=String(o.technical_service||'').trim();
      const box=document.createElement('div');
      box.className='vx-budget-service';
      box.innerHTML=`<span>SERVIÇO EXECUTADO</span><b>${escLocal(service||'—')}</b>`;
      const values=strip.querySelector('.vx-budget-values');
      if(values)strip.insertBefore(box,values);else strip.appendChild(box);
    }

    const clientBox=[...document.querySelectorAll('.vx-os-box')].find(x=>x.querySelector('h3')?.textContent.includes('RESUMO DO CLIENTE'));
    if(clientBox && !clientBox.querySelector('.vx-map-actions')){
      const actions=document.createElement('div');
      actions.className='vx-map-actions';
      actions.innerHTML='<button type="button" class="vx-action" onclick="vxOpenMap(\'google\')">📍 ABRIR NO MAPA</button><button type="button" class="vx-action" onclick="vxOpenMap(\'waze\')">WAZE</button>';
      clientBox.appendChild(actions);
    }

    // Achado do usuário em 2026-09-03 (3ª rodada, refinamento do
    // cabeçalho): botão "MAPA" solto no cabeçalho removido -- já
    // duplicado logo acima (📍 ABRIR NO MAPA/WAZE no card RESUMO DO
    // CLIENTE) e agora também dentro do menu ⋮ Ações
    // (os-actions-menu-v0812.js, grupo OPERAÇÃO, "Ver no mapa").
  }

  const observer=new MutationObserver(()=>enhance());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',enhance);
  setTimeout(enhance,0);
})();