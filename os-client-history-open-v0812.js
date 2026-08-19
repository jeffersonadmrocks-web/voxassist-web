/* VoxAssist V0.8.12 — histórico do cliente abre O.S. relacionada em nova aba */
(function(){
  function findOrderByNumber(number){
    return (state?.orders||[]).find(o=>String(o.os_number||'').trim()===String(number||'').trim());
  }

  function openRelatedOs(number){
    const order=findOrderByNumber(number);
    if(!order?.id){if(typeof toast==='function')toast('Não foi possível localizar esta O.S. para abertura.','err');return;}
    const key='os:'+order.id;
    if(!Array.isArray(state.openTabs))state.openTabs=[];
    if(!state.openTabs.includes(key))state.openTabs.push(key);
    if(typeof window.renderTabs==='function')window.renderTabs();
    if(typeof window.render==='function')window.render(key);
  }

  document.addEventListener('click',function(e){
    const row=e.target.closest('#vx-cliente .vx-grid-table tbody tr');
    if(!row)return;
    const first=row.querySelector('td');
    const number=first?.textContent?.trim();
    if(!number||number==='—')return;
    e.preventDefault();
    e.stopPropagation();
    openRelatedOs(number);
  },true);

  const style=document.createElement('style');
  style.textContent='#vx-cliente .vx-grid-table tbody tr{cursor:pointer}#vx-cliente .vx-grid-table tbody tr:hover{background:#f3f8fd}#vx-cliente .vx-grid-table tbody tr td:first-child{font-weight:800;color:#0b63ce;text-decoration:underline}';
  document.head.appendChild(style);

  // Carrega por último a administração de Empresas/Usuários para preservar as demais correções de navegação.
  if(!document.querySelector('script[data-vx-company-admin]')){
    const s=document.createElement('script');s.src='company-users-admin-v0812.js?v=0812-20260819-COMPANY1';s.dataset.vxCompanyAdmin='1';document.body.appendChild(s);
  }
})();
