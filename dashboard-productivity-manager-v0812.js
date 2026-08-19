/* VoxAssist V0.8.12 — Produtividade do gestor: Prontos x Entregues, com Loja/Grupo/Técnico */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const norm=v=>String(v||'').toUpperCase().trim();
  const val=(o,keys)=>{for(const k of keys){if(o&&o[k]!=null&&o[k]!=='')return o[k]}return null};
  const dateVal=(o,keys)=>{const v=val(o,keys);if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d};
  const isManager=()=>norm(state?.profile?.role)==='GESTOR';
  const startOf=p=>{const n=new Date();n.setHours(0,0,0,0);if(p==='dia')return n;if(p==='semana'){const d=new Date(n),offset=(d.getDay()+6)%7;d.setDate(d.getDate()-offset);return d}return new Date(n.getFullYear(),n.getMonth(),1)};

  function findProductivityHost(){
    const app=document.querySelector('#app');if(!app)return null;
    const nodes=[...app.querySelectorAll('h1,h2,h3,h4,strong,b,div,span')];
    const title=nodes.find(n=>/PRODUTIVIDADE DO M[ÊE]S/i.test(n.textContent||''));
    if(!title)return null;
    return title.closest('.dash-card,.dashboard-card,.card,[class*="card"],section')||title.parentElement;
  }

  async function loadData(){
    const [orders,stores,techs,fin]=await Promise.all([
      api('service_orders?select=*,equipments(product_type,brand,model),profiles!service_orders_technician_id_fkey(id,full_name)&order=opened_at.desc&limit=1000').catch(()=>state?.orders||[]),
      api('stores?select=id,name&active=eq.true&order=name').catch(()=>[]),
      api('profiles?select=id,full_name,role,store_id&active=eq.true&order=full_name').catch(()=>[]),
      api('os_financial?select=*&order=updated_at.desc&limit=1000').catch(()=>[])
    ]);
    const finMap=new Map((fin||[]).map(f=>[String(f.service_order_id),f]));
    const enriched=(orders||[]).map(o=>({...o,__fin:finMap.get(String(o.id))||null,__group:inferGroup(o.equipments?.product_type)}));
    const groups=[...new Set(enriched.map(o=>o.__group).filter(Boolean))].sort();
    return {orders:enriched,stores:stores||[],techs:(techs||[]).filter(t=>norm(t.role)==='TECNICO'),groups};
  }

  function inferGroup(t){t=norm(t);if(t.includes('TV'))return 'TV';if(/REFRIG|FREEZER|AR-COND|GELADEIRA/.test(t))return 'REFRIGERAÇÃO';if(/MICRO|FOG|LAVA|BEBED/.test(t))return 'LINHA BRANCA';if(/AUDIO|ÁUDIO|SOM|RADIO|RÁDIO/.test(t))return 'ÁUDIO';return t?'GERAL':''}
  function optionRows(arr,id='id',label='name'){return arr.map(x=>`<option value="${E(typeof x==='string'?x:x[id])}">${E(typeof x==='string'?x:(x[label]||x.full_name||x.name))}</option>`).join('')}
  function orderValue(o){const f=o.__fin||{};const direct=Number(val(o,['total_amount','budget_total','valor_total','total','amount'])||0);if(direct)return direct;const labor=Number(f.labor_value||0),freight=Number(f.freight_value||0),aux=Number(f.auxiliary_material_value||0),report=Number(f.technical_report_value||0),disc=Number(f.discount_value||0);return Math.max(0,labor+freight+aux+report-disc)}

  function subBlock(kind,title,d){return `<div class="vx-prod-sub" data-kind="${kind}"><div class="vx-prod-sub-head"><div><strong>${title}</strong><small>${kind==='ready'?'Aparelhos que ficaram prontos':'Aparelhos entregues aos clientes'}</small></div><div class="vx-prod-period"><button type="button" data-period="mes" class="active">MÊS</button><button type="button" data-period="semana">SEMANA</button><button type="button" data-period="dia">DIA</button></div></div><div class="vx-prod-metrics"><div><span>APARELHOS</span><b data-count>0</b></div><div><span>VALOR</span><b data-value>R$ 0,00</b></div></div><div class="vx-prod-filters"><label>LOJA<select data-filter="store"><option value="">TODAS</option>${optionRows(d.stores,'id','name')}</select></label><label>GRUPO<select data-filter="group"><option value="">TODOS</option>${optionRows(d.groups)}</select></label><label>TÉCNICO<select data-filter="tech"><option value="">TODOS</option>${optionRows(d.techs,'id','full_name')}</select></label></div></div>`}

  function recalc(sec,orders){
    const from=startOf(sec.querySelector('.vx-prod-period .active')?.dataset.period||'mes');
    const store=sec.querySelector('[data-filter="store"]')?.value||'',group=sec.querySelector('[data-filter="group"]')?.value||'',tech=sec.querySelector('[data-filter="tech"]')?.value||'';
    const ready=sec.dataset.kind==='ready';
    const rows=orders.filter(o=>{
      const dt=ready?dateVal(o,['ready_at','completed_at','pronto_at']):dateVal(o,['delivery_at','delivered_at','saida_at','closed_at']);
      if(!dt||dt<from)return false;
      if(store&&String(o.store_id||'')!==store)return false;
      if(group&&String(o.__group||'')!==group)return false;
      const tid=String(o.technician_id||o.profiles?.id||'');if(tech&&tid!==tech)return false;
      return true;
    });
    sec.querySelector('[data-count]').textContent=rows.length;
    sec.querySelector('[data-value]').textContent=brl(rows.reduce((s,o)=>s+orderValue(o),0));
  }

  async function mount(){
    if(!isManager())return;
    const host=findProductivityHost();if(!host||host.dataset.vxProdApplied==='1')return;
    host.dataset.vxProdApplied='1';
    const d=await loadData();
    host.classList.add('vx-productivity-card');
    host.innerHTML=`<div class="vx-prod-main-head"><div><h3>PRODUTIVIDADE</h3><small>Acompanhamento gerencial por período</small></div></div><div class="vx-prod-grid">${subBlock('ready','APARELHOS PRONTOS',d)}${subBlock('delivered','APARELHOS ENTREGUES',d)}</div>`;
    host.querySelectorAll('.vx-prod-sub').forEach(sec=>{recalc(sec,d.orders);sec.querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>recalc(sec,d.orders)));sec.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{sec.querySelectorAll('[data-period]').forEach(x=>x.classList.remove('active'));b.classList.add('active');recalc(sec,d.orders)}))});
  }

  const style=document.createElement('style');style.id='vxProdManagerStyle';style.textContent=`
  .vx-productivity-card{padding:12px!important;min-height:auto!important;height:auto!important;overflow:visible!important}
  .vx-prod-main-head h3{margin:0;font-size:13px;color:#102d49}.vx-prod-main-head small,.vx-prod-sub-head small{display:block;margin-top:2px;font-size:9px;color:#71869a}
  .vx-prod-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}.vx-prod-sub{border:1px solid #d5e0ea;border-radius:8px;background:#fff;padding:10px;min-width:0}
  .vx-prod-sub-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.vx-prod-sub-head strong{font-size:11px;color:#163754}
  .vx-prod-period{display:flex;gap:3px}.vx-prod-period button{border:1px solid #ccd7e0;background:#f6f8fa;color:#516a80;padding:3px 7px;border-radius:4px;font-size:8px;cursor:pointer}.vx-prod-period button.active{background:#173e62;color:white;border-color:#173e62}
  .vx-prod-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:9px 0}.vx-prod-metrics>div{border:1px solid #e1e7ed;background:#f7f9fb;border-radius:6px;padding:8px}.vx-prod-metrics span{display:block;font-size:8px;color:#6d8295}.vx-prod-metrics b{display:block;margin-top:2px;font-size:17px;color:#102d49}
  .vx-prod-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.vx-prod-filters label{font-size:8px;font-weight:700;color:#657b8e}.vx-prod-filters select{width:100%;margin-top:3px;border:1px solid #cbd7e2;background:#fff;padding:5px 6px;border-radius:4px;font-size:9px;color:#18364f}
  @media(max-width:950px){.vx-prod-grid{grid-template-columns:1fr}.vx-prod-filters{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
  const obs=new MutationObserver(()=>setTimeout(mount,40));obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(mount,250);
})();