/* VoxAssist Web V0.8.12 — refinamento final de fidelidade da OS */
(function(){
  const base=window.renderOsDetail;
  if(typeof base!=='function') return;
  const toSelect=(labelText)=>{
    document.querySelectorAll('.vx-field').forEach(f=>{
      const label=f.querySelector('label'); const input=f.querySelector('input[readonly]');
      if(!label||!input||label.textContent.trim()!==labelText)return;
      const s=document.createElement('select');s.disabled=true;s.innerHTML=`<option>${esc(input.value||'')}</option>`;input.replaceWith(s);
    });
  };
  window.renderOsDetail=async function(id){
    const out=await base(id);
    const placeholder=document.querySelector('.vx-client-search');
    if(placeholder){const i=document.createElement('input');i.className='vx-client-search-input';i.placeholder='';i.setAttribute('aria-label','Localizar cliente por nome, CPF ou telefone');i.readOnly=true;placeholder.replaceWith(i);}
    ['TIPO DE PRODUTO *','GRUPO DO PRODUTO','ESTADO DO APARELHO','TIPO DE ATENDIMENTO','LOCAL DO PRODUTO'].forEach(toSelect);
    return out;
  };
})();
