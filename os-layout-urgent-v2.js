/* Completa a apresentação das abas internas da OS sem alterar a camada de dados */
(function(){
  const base=window.renderOsDetail;
  if(typeof base!=='function') return;
  const names={equip:'EQUIPAMENTO',cliente:'CLIENTE / CLIENTE 360',orcamento:'ORÇAMENTO / ANÁLISE TÉCNICA',anexos:'FOTOS / ANEXOS',financeiro:'FINANCEIRO DA O.S.',historico:'HISTÓRICO DA O.S.'};
  window.renderOsDetail=async function(id){
    const r=await base(id);
    Object.entries(names).forEach(([key,title])=>{
      const panel=document.querySelector('#vx-'+key);
      if(!panel)return;
      panel.dataset.desktopSection=title;
    });
    const tabs=document.querySelector('.vx-os-tabs');
    if(tabs){tabs.setAttribute('role','tablist');tabs.querySelectorAll('button').forEach(b=>{b.setAttribute('role','tab');b.setAttribute('aria-selected',b.classList.contains('active')?'true':'false');});}
    const original=window.showVxOsSection;
    if(typeof original==='function'&&!window.__vxSectionWrapped){
      window.showVxOsSection=function(key){
        original(key);
        document.querySelectorAll('.vx-os-tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.section===key?'true':'false'));
      };
      window.__vxSectionWrapped=true;
    }
    return r;
  };
})();
