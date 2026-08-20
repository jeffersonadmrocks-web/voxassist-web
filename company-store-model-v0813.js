/* VoxAssist V0.8.13 — modelo definitivo Empresa > Matriz/Filiais */
(function(){
 const E=window.esc||((v='')=>String(v??''));
 const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
 async function refreshCompanyStoreModel(){
  if(state?.view!=='usuarios'||!isGestor()) return;
  const page=document.querySelector('.vx-admin-page'); if(!page)return;
  try{
   const companies=await api('companies?select=id,trade_name,legal_name,active&order=trade_name');
   const stores=await api('stores?select=id,name,code,company_id,active&order=name');
   const activeCompanyId=state?.profile?.company_id||null;
   const activeStoreId=state?.profile?.store_id||null;
   const company=companies.find(c=>String(c.id)===String(activeCompanyId))||companies[0]||null;
   const companyStores=company?(stores||[]).filter(s=>String(s.company_id)===String(company.id)):[];
   const card=page.querySelector('.vx-admin-grid .vx-admin-card:nth-child(2)');
   if(card){
    const title=card.querySelector('.vx-admin-title h3'); if(title)title.textContent='LOJAS / UNIDADES DA EMPRESA SELECIONADA';
    const count=card.querySelector('.vx-admin-title span'); if(count)count.textContent=String(companyStores.length);
    [...card.children].forEach(ch=>{if(!ch.classList.contains('vx-admin-title'))ch.remove()});
    companyStores.forEach((s,i)=>{
      const r=document.createElement('div');r.className='vx-company-row';
      const principal=String(s.id)===String(activeStoreId)||i===0;
      r.innerHTML=`<div><b>${E(s.code||s.name)}</b><small>${principal?'MATRIZ / UNIDADE PRINCIPAL':'FILIAL'} • ${E(company?.trade_name||company?.legal_name||'EMPRESA')}</small></div><span class="${s.active?'vx-ok':'vx-off'}">${s.active?'ATIVA':'INATIVA'}</span>`;
      card.appendChild(r);
    });
    if(!companyStores.length){const r=document.createElement('div');r.className='vx-company-row';r.innerHTML='<div><b>NENHUMA UNIDADE</b><small>Esta empresa ainda não possui unidade principal.</small></div>';card.appendChild(r)}
   }
   const hero=page.querySelector('.vx-admin-hero p');
   if(hero)hero.textContent='Empresas/CNPJ mantêm operações isoladas. Cada empresa possui uma Matriz criada no cadastro; filiais só são adicionadas dentro da própria empresa.';
  }catch(err){console.error('Modelo Empresa > Loja:',err)}
 }
 const prior=window.render;
 window.render=async function(view){const r=await prior(view);if(view==='usuarios')setTimeout(refreshCompanyStoreModel,260);return r};
 document.addEventListener('click',e=>{if(e.target.closest('[data-company],.vx-company-row'))setTimeout(refreshCompanyStoreModel,180)});
 setTimeout(refreshCompanyStoreModel,900);
})();