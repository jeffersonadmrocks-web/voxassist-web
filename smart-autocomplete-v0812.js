/* VoxAssist Web V0.8.12 — autocomplete inteligente por frequência de uso */
(function(){
  const baseRenderNewOs=window.renderNewOs;
  if(typeof baseRenderNewOs!=='function') return;

  const defaults={
    condition:['USADO','NOVO','ARRANHADO','AVARIADO','COM MARCAS DE USO','SEM AVARIAS APARENTES'],
    accessories:['SEM ACESSÓRIOS','CONTROLE REMOTO','CABO DE FORÇA','BASE / PEDESTAL','SUPORTE','MANGUEIRA','BANDEJA'],
    reported:['NÃO LIGA','NÃO FUNCIONA','SEM IMAGEM','SEM SOM','DESLIGA SOZINHO','NÃO GELA','NÃO REFRIGERA','VAZANDO ÁGUA','FAZENDO BARULHO','NÃO AQUECE','NÃO CENTRIFUGA']
  };

  const norm=v=>String(v||'').trim().toUpperCase();
  const countValues=(arr,seed=[])=>{
    const map=new Map();
    [...seed,...arr].forEach(v=>{v=norm(v);if(!v)return;map.set(v,(map.get(v)||0)+1)});
    return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR')).map(([text,count])=>({text,count}));
  };

  async function loadUsage(){
    try{
      const rows=await api('service_orders?select=device_condition,reported_defect,equipments(accessories)&order=opened_at.desc&limit=500');
      return {
        condition:countValues((rows||[]).map(x=>x.device_condition),defaults.condition),
        accessories:countValues((rows||[]).map(x=>x.equipments?.accessories),defaults.accessories),
        reported:countValues((rows||[]).map(x=>x.reported_defect),defaults.reported)
      };
    }catch(e){
      return {
        condition:countValues([],defaults.condition),
        accessories:countValues([],defaults.accessories),
        reported:countValues([],defaults.reported)
      };
    }
  }

  function replaceConditionSelect(){
    const old=document.querySelector('#condition');
    if(!old||old.tagName!=='SELECT')return old;
    const input=document.createElement('input');
    input.id='condition';
    input.value=old.value||'';
    input.placeholder='DIGITE OU SELECIONE...';
    old.replaceWith(input);
    return input;
  }

  function attachSmart(el,items,label){
    if(!el||el.dataset.smartBound==='1')return;
    el.dataset.smartBound='1';
    const host=el.closest('.vx-newos-field')||el.parentElement;
    host.style.position='relative';
    const box=document.createElement('div');
    box.className='vx-smart-suggestions hidden';
    host.appendChild(box);

    const render=()=>{
      const q=norm(el.value);
      const rows=items.filter(x=>!q||x.text.includes(q)).slice(0,8);
      if(!rows.length){box.classList.add('hidden');box.innerHTML='';return}
      box.innerHTML=rows.map((x,i)=>`<button type="button" data-smart-index="${i}"><span>${esc(x.text)}</span>${x.count>1?`<small>${x.count} usos</small>`:''}</button>`).join('');
      box.classList.remove('hidden');
      box.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{el.value=rows[i].text;box.classList.add('hidden');el.dispatchEvent(new Event('input',{bubbles:true}));el.focus()});
    };

    el.addEventListener('focus',render);
    el.addEventListener('input',()=>{el.value=norm(el.value);render()});
    el.addEventListener('keydown',e=>{if(e.key==='Escape')box.classList.add('hidden')});
    document.addEventListener('click',e=>{if(!host.contains(e.target))box.classList.add('hidden')});

    const hint=document.createElement('small');
    hint.className='vx-smart-hint';
    hint.textContent=`Sugestões baseadas nos termos mais usados em ${label}. Você pode digitar um novo termo.`;
    host.appendChild(hint);
  }

  window.renderNewOs=async function(){
    await baseRenderNewOs.apply(this,arguments);
    const usage=await loadUsage();
    const condition=replaceConditionSelect();
    attachSmart(condition,usage.condition,'Estado do Aparelho');
    attachSmart(document.querySelector('#accessories'),usage.accessories,'Acessórios');
    attachSmart(document.querySelector('#reported'),usage.reported,'Defeito Relatado');
  };
})();
