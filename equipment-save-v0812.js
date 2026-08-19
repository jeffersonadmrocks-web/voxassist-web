/* VoxAssist Web V0.8.12 — total do orçamento; salvamento centralizado no botão global da OS */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];

  function parseMoney(v){
    if(typeof v==='number') return v;
    let s=String(v??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
    if(!s) return 0;
    if(s.includes(',') && s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(',')) s=s.replace(',','.');
    return Number(s)||0;
  }

  function fieldByLabel(panel,needle){
    const n=String(needle).toUpperCase();
    const field=qa('.vx-field',panel).find(f=>String(q('label',f)?.textContent||'').toUpperCase().includes(n));
    return field ? q('input,select,textarea',field) : null;
  }

  function budgetNumbers(){
    const panel=q('#vx-orcamento');
    if(!panel) return {parts:0,labor:0,freight:0,aux:0,opinion:0,discount:0,total:0};
    const read=label=>parseMoney(fieldByLabel(panel,label)?.value);
    const parts=read('VALOR DAS PEÇAS');
    const labor=read('MÃO DE OBRA');
    const freight=read('FRETE');
    const aux=read('MATERIAL AUXILIAR');
    const opinion=read('PARECER TÉCNICO');
    const discount=read('DESCONTO');
    return {parts,labor,freight,aux,opinion,discount,total:parts+labor+freight+aux+opinion-discount};
  }

  function brl(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

  function updateBudgetTotal(){
    const box=q('#vxBudgetTotal');
    if(!box) return;
    const n=budgetNumbers();
    q('[data-vx="parts"]',box).textContent=brl(n.parts);
    q('[data-vx="labor"]',box).textContent=brl(n.labor);
    q('[data-vx="extras"]',box).textContent=brl(n.freight+n.aux+n.opinion);
    q('[data-vx="discount"]',box).textContent=brl(n.discount);
    q('[data-vx="total"]',box).textContent=brl(n.total);
  }
  window.vxUpdateBudgetTotal=updateBudgetTotal;

  function ensureBudget(){
    const panel=q('#vx-orcamento');
    if(!panel) return;
    if(!q('#vxBudgetTotal',panel)){
      const form=q('.vx-form-3.budget',panel)||q('.vx-form-3',panel);
      if(form){
        const total=document.createElement('div');
        total.id='vxBudgetTotal';
        total.style.cssText='margin:14px 0 8px;border:1px solid #cbd7e3;background:#f7fafc;padding:12px 14px;display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;align-items:center;';
        total.innerHTML='<div><small>PEÇAS</small><b data-vx="parts" style="display:block;margin-top:5px"></b></div><div><small>MÃO DE OBRA</small><b data-vx="labor" style="display:block;margin-top:5px"></b></div><div><small>FRETE + AUXILIAR + PARECER</small><b data-vx="extras" style="display:block;margin-top:5px"></b></div><div><small>DESCONTO</small><b data-vx="discount" style="display:block;margin-top:5px;color:#d56b00"></b></div><div style="border-left:3px solid #078f46;padding-left:12px"><small>TOTAL DO ORÇAMENTO</small><b data-vx="total" style="display:block;margin-top:4px;font-size:20px;color:#078f46"></b></div>';
        form.insertAdjacentElement('afterend',total);
        updateBudgetTotal();
      }
    }
    if(!panel.dataset.vxTotalBound){
      panel.dataset.vxTotalBound='1';
      panel.addEventListener('input',updateBudgetTotal);
      panel.addEventListener('change',updateBudgetTotal);
    }
  }

  const observer=new MutationObserver(()=>ensureBudget());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('click',e=>{if(e.target.closest('.vx-os-tabs'))setTimeout(ensureBudget,0);});
  setTimeout(ensureBudget,0);
})();
