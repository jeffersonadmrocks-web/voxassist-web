/* VoxAssist Web V0.8.12 — abre a O.S. selecionada diretamente a partir dos modais do Dashboard */
(function(){
  async function resolveOrderId(osNumber){
    const local=(state?.orders||[]).find(o=>String(o.os_number||'').trim()===String(osNumber||'').trim());
    if(local?.id)return local.id;
    try{
      const rows=await api(`service_orders?os_number=eq.${encodeURIComponent(String(osNumber||'').trim())}&select=id,os_number&limit=1`);
      return rows?.[0]?.id||null;
    }catch{return null}
  }

  document.addEventListener('click',async function(e){
    const modal=e.target.closest('#vxDashDataModal');
    if(!modal)return;
    const row=e.target.closest('tbody tr');
    if(!row)return;
    const first=row.querySelector('td');
    const osNumber=first?.textContent?.trim();
    if(!osNumber)return;
    if(!/^[0-9A-Z-]{5,}$/i.test(osNumber))return;

    row.style.cursor='wait';
    const id=await resolveOrderId(osNumber);
    if(!id){
      row.style.cursor='';
      if(typeof toast==='function')toast('Não foi possível localizar esta O.S.','err');
      return;
    }

    modal.remove();
    if(typeof render==='function')render(`os:${id}`);
  },true);

  const style=document.createElement('style');
  style.textContent=`#vxDashDataModal tbody tr{cursor:pointer}#vxDashDataModal tbody tr:hover{background:#f3f8fc}`;
  document.head.appendChild(style);
})();
