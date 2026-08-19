/* VoxAssist V0.8.12 — Dashboard fixo + itens consultados em abas independentes */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const baseRender=window.render;

  function labelFor(v){
    if(v==='dashboard')return 'Início';
    if(v.startsWith('os:')){
      const id=v.split(':')[1];
      const o=(state?.orders||[]).find(x=>String(x.id)===String(id));
      return 'OS '+(o?.os_number||id);
    }
    const map={os:'Atendimento',clientes:'Clientes',oficina:'Oficina',agenda:'Atividades',estoque:'Loja Virtual',financeiro:'Financeiro',testes:'Relatórios',usuarios:'Configurações','nova-os':'Nova O.S.'};
    return map[v]||String(v||'').replace('feature:','');
  }

  window.renderTabs=function(){
    const tabs=document.querySelector('#tabs');if(!tabs)return;
    if(!Array.isArray(state.openTabs))state.openTabs=['dashboard'];
    if(!state.openTabs.includes('dashboard'))state.openTabs.unshift('dashboard');
    tabs.innerHTML=state.openTabs.map(v=>`<button class="tab ${state.view===v?'active':''}" data-tab="${E(v)}"><span>${E(labelFor(v))}</span>${v!=='dashboard'?`<i data-close="${E(v)}" title="Fechar guia">×</i>`:''}</button>`).join('')+`<button class="tab tab-plus" id="tabPlus" title="Nova guia">+</button>`;
    tabs.querySelectorAll('.tab[data-tab]').forEach(t=>t.addEventListener('click',e=>{if(e.target.closest('[data-close]'))return;window.render(t.dataset.tab);}));
    tabs.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(typeof closeTab==='function')closeTab(x.dataset.close);}));
    const plus=document.querySelector('#tabPlus');if(plus)plus.onclick=()=>window.render('dashboard');
  };

  window.render=async function(view){
    const out=await baseRender(view);
    if(!Array.isArray(state.openTabs))state.openTabs=[];
    if(!state.openTabs.includes('dashboard'))state.openTabs.unshift('dashboard');
    if(String(view||'').startsWith('os:')&&!state.openTabs.includes(String(view)))state.openTabs.push(String(view));
    window.renderTabs();
    return out;
  };
})();
