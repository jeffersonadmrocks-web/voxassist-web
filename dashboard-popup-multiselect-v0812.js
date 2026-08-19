/* VoxAssist V0.8.12 — mantém consulta do Dashboard aberta ao preparar várias O.S. em abas */
(function(){
  const E=window.esc||((v='')=>String(v??''));

  function tabLabel(key){
    if(!key.startsWith('os:'))return key;
    const id=key.slice(3);
    const order=(state?.orders||[]).find(o=>String(o.id)===String(id));
    return 'OS '+(order?.os_number||id);
  }

  function refreshTabs(){
    if(typeof window.renderTabs==='function'){
      window.renderTabs();
      return;
    }
    const tabs=document.querySelector('#tabs');
    if(!tabs)return;
    tabs.innerHTML=(state?.openTabs||[]).map(v=>`<button class="tab ${state.view===v?'active':''}" data-tab="${E(v)}"><span>${E(tabLabel(v))}</span>${v!=='dashboard'?`<i data-close="${E(v)}">×</i>`:''}</button>`).join('')+`<button class="tab tab-plus" id="tabPlus">+</button>`;
  }

  function prepareOsTab(id,button){
    if(!id)return;
    const key='os:'+id;
    if(!Array.isArray(state.openTabs))state.openTabs=['dashboard'];
    const alreadyOpen=state.openTabs.includes(key);
    if(!alreadyOpen)state.openTabs.push(key);
    refreshTabs();

    if(button){
      button.dataset.vxPrepared='1';
      button.style.textDecoration='none';
      button.style.color='#16834b';
      button.title=alreadyOpen?'Esta O.S. já está aberta em uma aba':'O.S. preparada em nova aba';
      const row=button.closest('tr');
      if(row)row.style.background='#f1faf5';
    }
    if(typeof toast==='function')toast(alreadyOpen?'Esta O.S. já está aberta em uma aba.':'O.S. aberta em nova aba. A consulta permanece no Dashboard.');
  }

  /* Captura antes do listener antigo do modal, impedindo que ele feche ou troque a tela atual. */
  document.addEventListener('click',function(e){
    const modal=e.target.closest('#vxDashDataModal');
    if(!modal)return;
    const open=e.target.closest('[data-open-os]');
    if(!open)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    prepareOsTab(open.dataset.openOs,open);
  },true);
})();
