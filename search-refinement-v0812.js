/* VoxAssist Web V0.8.12 — buscas refinadas conforme padrão homologado */
(function(){
  const oldRender=window.render;
  const searchState=window.VoxSearchState||(window.VoxSearchState={q:'',status:'',brand:'',group:'',tech:'',service:''});
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,' ').trim().toUpperCase();
  const uniq=a=>[...new Set(a.filter(Boolean).map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const clientOf=o=>state.clients.find(c=>c.id===o.client_id)||o.clients||{};
  const hayOrder=o=>norm([o.os_number,o.manufacturer_os_number,o.manufacturer,o.status,o.service_type,o.product_location,o.priority,clientOf(o).name,clientOf(o).document,clientOf(o).phone_primary,clientOf(o).phone_secondary,clientOf(o).email,o.equipments?.product_type,o.equipments?.brand,o.equipments?.model,o.equipments?.serial_number,o.profiles?.full_name].join(' '));
  const hayClient=c=>norm([c.name,c.document,c.phone_primary,c.phone_secondary,c.email,c.zip_code,c.address,c.neighborhood,c.city,c.state].join(' '));

  function groupFor(o){const p=norm(o.equipments?.product_type);if(/REFRIG|FREEZER|GELADEIRA|AR COND|BEBEDOURO/.test(p))return 'REFRIGERAÇÃO';if(/TV|TELEVIS/.test(p))return 'TV';if(/AUDIO|SOM/.test(p))return 'ÁUDIO';return o.equipments?.product_type||'OUTROS'}

  function optionList(values,selected){return '<option value="">TODOS</option>'+values.map(v=>`<option ${String(v)===String(selected)?'selected':''}>${esc(v)}</option>`).join('')}
  function filteredOrders(){const q=norm(searchState.q);return state.orders.filter(o=>{
    if(q&&!hayOrder(o).includes(q))return false;
    if(searchState.status&&o.status!==searchState.status)return false;
    if(searchState.brand&&o.equipments?.brand!==searchState.brand)return false;
    if(searchState.group&&groupFor(o)!==searchState.group)return false;
    if(searchState.tech&&(o.profiles?.full_name||'')!==searchState.tech)return false;
    if(searchState.service&&(o.service_type||'')!==searchState.service)return false;
    return true;
  })}

  function enhanceOrders(){const input=document.querySelector('#osSearch');if(!input||input.dataset.refined)return;input.dataset.refined='1';input.placeholder='Pesquisar OS, cliente, CPF/CNPJ, telefone, marca, modelo, série, técnico ou situação';input.value=searchState.q;
    const toolbar=input.closest('.toolbar')||input.parentElement;const filter=document.createElement('div');filter.className='vx-search-filters';
    const statuses=uniq(state.orders.map(o=>o.status)),brands=uniq(state.orders.map(o=>o.equipments?.brand)),groups=uniq(state.orders.map(groupFor)),techs=uniq(state.orders.map(o=>o.profiles?.full_name)),services=uniq(state.orders.map(o=>o.service_type));
    filter.innerHTML=`<label>SITUAÇÃO<select data-sf="status">${optionList(statuses,searchState.status)}</select></label><label>MARCA<select data-sf="brand">${optionList(brands,searchState.brand)}</select></label><label>GRUPO<select data-sf="group">${optionList(groups,searchState.group)}</select></label><label>TÉCNICO<select data-sf="tech">${optionList(techs,searchState.tech)}</select></label><label>ATENDIMENTO<select data-sf="service">${optionList(services,searchState.service)}</select></label><button type="button" id="clearSearchFilters">LIMPAR</button><span id="searchCount"></span>`;
    toolbar.insertAdjacentElement('afterend',filter);
    const apply=()=>{searchState.q=input.value;const rows=filteredOrders();const tw=document.querySelector('.table-wrap');if(tw&&typeof ordersTable==='function')tw.outerHTML=ordersTable(rows);const count=document.querySelector('#searchCount');if(count)count.textContent=`${rows.length} resultado(s)`;};
    input.addEventListener('input',apply);filter.querySelectorAll('[data-sf]').forEach(s=>s.onchange=()=>{searchState[s.dataset.sf]=s.value;apply()});
    filter.querySelector('#clearSearchFilters').onclick=()=>{Object.assign(searchState,{q:'',status:'',brand:'',group:'',tech:'',service:''});input.value='';filter.querySelectorAll('select').forEach(s=>s.value='');apply()};apply();
  }

  function datalist(id,values){let d=document.getElementById(id);if(!d){d=document.createElement('datalist');d.id=id;document.body.appendChild(d)}d.innerHTML=uniq(values).map(v=>`<option value="${esc(v)}"></option>`).join('')}
  function enhanceAutocompletes(){
    const map=[['productType','vx-types',state.orders.map(o=>o.equipments?.product_type)],['brand','vx-brands',state.orders.map(o=>o.equipments?.brand)],['model','vx-models',state.orders.map(o=>o.equipments?.model)],['condition','vx-condition',state.orders.map(o=>o.device_condition)],['reported','vx-reported',state.orders.map(o=>o.reported_defect)],['diagnosed','vx-diagnosed',state.orders.map(o=>o.diagnosed_defect)],['techService','vx-service',state.orders.map(o=>o.technical_service)]];
    map.forEach(([field,list,values])=>{const el=document.getElementById(field);if(el){datalist(list,values);el.setAttribute('list',list)}});
    const brand=document.getElementById('brand'),model=document.getElementById('model');if(brand&&model&&!brand.dataset.modelFilter){brand.dataset.modelFilter='1';brand.addEventListener('input',()=>{const b=norm(brand.value);datalist('vx-models',state.orders.filter(o=>!b||norm(o.equipments?.brand)===b).map(o=>o.equipments?.model))})}
  }

  function globalResults(q){q=norm(q);if(q.length<2)return[];const out=[];state.orders.forEach(o=>{if(hayOrder(o).includes(q))out.push({kind:'OS',title:o.os_number,sub:[clientOf(o).name,o.equipments?.product_type,o.equipments?.brand,o.equipments?.model,o.status].filter(Boolean).join(' • '),action:()=>render('os:'+o.id)})});state.clients.forEach(c=>{if(hayClient(c).includes(q))out.push({kind:'CLIENTE',title:c.name,sub:[c.document,c.phone_primary,c.city].filter(Boolean).join(' • '),action:()=>typeof renderClient360==='function'?renderClient360(c.id):render('clientes')})});return out.slice(0,12)}
  function hideSuggest(){document.querySelector('.vx-global-suggest')?.remove()}
  function showSuggest(input){hideSuggest();const rows=globalResults(input.value);if(!rows.length)return;const box=document.createElement('div');box.className='vx-global-suggest';box.innerHTML=rows.map((r,i)=>`<button type="button" data-ri="${i}"><b>${esc(r.kind)} • ${esc(r.title)}</b><small>${esc(r.sub)}</small></button>`).join('');input.closest('.global-search')?.appendChild(box);box.querySelectorAll('[data-ri]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.ri)];hideSuggest();r.action()})}
  document.addEventListener('input',e=>{if(e.target?.id==='globalSearch')showSuggest(e.target)},true);
  document.addEventListener('keydown',e=>{if(e.target?.id==='globalSearch'&&e.key==='Escape')hideSuggest();if(e.target?.id==='globalSearch'&&e.key==='Enter'){const r=globalResults(e.target.value);if(r[0]){e.preventDefault();hideSuggest();r[0].action()}}},true);
  document.addEventListener('click',e=>{if(!e.target.closest('.global-search'))hideSuggest()},true);

  window.render=async function(view){const out=await oldRender(view);setTimeout(()=>{enhanceOrders();enhanceAutocompletes()},0);return out};
  const obs=new MutationObserver(()=>{enhanceOrders();enhanceAutocompletes()});obs.observe(document.documentElement,{subtree:true,childList:true});
})();
