/* VoxAssist V0.8.12 — Produtividade do gestor: prontos x entregues, período e filtros */
(function(){
 const E=window.esc||((v='')=>String(v??''));
 const money=v=>(Number(v||0)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const norm=v=>String(v||'').toUpperCase();
 function gestor(){return norm(state?.profile?.role)==='GESTOR'}
 function val(o,keys){for(const k of keys){if(o&&o[k]!=null&&o[k]!=='')return o[k]}return null}
 function dateVal(o,keys){const v=val(o,keys);if(!v)return null;const d=new Date(v);return isNaN(d)?null:d}
 function amount(o){return Number(val(o,['total','total_amount','budget_total','valor_total','amount','value'])||0)}
 function start(period){const n=new Date();n.setHours(0,0,0,0);if(period==='dia')return n;if(period==='semana'){const x=new Date(n),w=(x.getDay()+6)%7;x.setDate(x.getDate()-w);return x}return new Date(n.getFullYear(),n.getMonth(),1)}
 async function data(){
   const qs='orders?select=*&order=created_at.desc&limit=1000';
   const orders=await api(qs).catch(()=>[]);
   const stores=await api('stores?select=id,name&active=eq.true&order=name').catch(()=>[]);
   let techs=[];try{techs=await api('profiles?select=id,full_name,name,role&order=full_name').catch(()=>[])}catch(_){ }
   const groups=[...new Set((orders||[]).map(o=>val(o,['product_group','group_name','grupo','equipment_group'])).filter(Boolean))].sort();
   return {orders:orders||[],stores:stores||[],techs:(techs||[]).filter(t=>norm(t.role)==='TECNICO'),groups};
 }
 function options(arr,idKey,labelKey){return arr.map(x=>`<option value="${E(typeof x==='string'?x:x[idKey])}">${E(typeof x==='string'?x:(x[labelKey]||x.name||x.full_name))}</option>`).join('')}
 function block(kind,title,d){return `<section class="vx-prod-sub" data-kind="${kind}"><div class="vx-prod-sub-head"><div><strong>${title}</strong><small>${kind==='ready'?'Aparelhos finalizados no período':'Aparelhos entregues ao cliente no período'}</small></div><div class="vx-period"><button data-period="mes" class="active">MÊS</button><button data-period="semana">SEMANA</button><button data-period="dia">DIA</button></div></div><div class="vx-prod-kpis"><div><span>APARELHOS</span><b data-count>0</b></div><div><span>VALOR</span><b data-value>R$ 0,00</b></div></div><div class="vx-prod-filters"><label>LOJA<select data-filter="store"><option value="">TODAS</option>${options(d.stores,'id','name')}</select></label><label>GRUPO<select data-filter="group"><option value="">TODOS</option>${options(d.groups)}</select></label><label>TÉCNICO<select data-filter="tech"><option value="">TODOS</option>${options(d.techs,'id','full_name')}</select></label></div></section>`}
 function recalc(sec,orders){
   const period=sec.querySelector('.vx-period .active')?.dataset.period||'mes', from=start(period);
   const store=sec.querySelector('[data-filter="store"]').value,group=sec.querySelector('[data-filter="group"]').value,tech=sec.querySelector('[data-filter="tech"]').value;
   const ready=sec.dataset.kind==='ready';
   const rows=orders.filter(o=>{
     const dt=ready?dateVal(o,['ready_at','completed_at','pronto_at','updated_at']):dateVal(o,['delivered_at','delivery_at','saida_at','closed_at']);
     if(!dt||dt<from)return false;
     const status=norm(val(o,['status','situation','situacao']));
     if(ready && !(status.includes('PRONTO')||status.includes('ENTREG')||val(o,['ready_at','completed_at','pronto_at'])))return false;
     if(!ready && !(status.includes('ENTREG')||status.includes('FINALIZ')||val(o,['delivered_at','delivery_at','saida_at'])))return false;
     if(store && String(val(o,['store_id','loja_id'])||'')!==store)return false;
     if(group && String(val(o,['product_group','group_name','grupo','equipment_group'])||'')!==group)return false;
     if(tech && String(val(o,['technician_id','tech_id','tecnico_id'])||'')!==tech)return false;
     return true;
   });
   sec.querySelector('[data-count]').textContent=rows.length;sec.querySelector('[data-value]').textContent=money(rows.reduce((s,o)=>s+amount(o),0));
 }
 async function mount(){
   if(!gestor()||!document.querySelector('.dashboard'))return;
   const cards=[...document.querySelectorAll('.dashboard section,.dashboard .card,.dashboard [class*="card"]')];
   let host=cards.find(x=>/PRODUTIVIDADE/i.test(x.textContent||''));
   if(!host)return;
   if(host.dataset.vxProd==='1')return;host.dataset.vxProd='1';
   const d=await data();
   host.classList.add('vx-productivity');host.innerHTML=`<div class="vx-prod-title"><div><h3>PRODUTIVIDADE</h3><small>Visão gerencial de aparelhos prontos e entregues</small></div></div><div class="vx-prod-grid">${block('ready','APARELHOS PRONTOS',d)}${block('delivered','APARELHOS ENTREGUES',d)}</div>`;
   host.querySelectorAll('.vx-prod-sub').forEach(sec=>{recalc(sec,d.orders);sec.querySelectorAll('select').forEach(s=>s.onchange=()=>recalc(sec,d.orders));sec.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{sec.querySelectorAll('[data-period]').forEach(x=>x.classList.remove('active'));b.classList.add('active');recalc(sec,d.orders)})});
 }
 const css=document.createElement('style');css.textContent=`.vx-productivity{grid-column:span 2!important;padding:14px!important}.vx-prod-title h3{margin:0;color:#102d49;font-size:14px}.vx-prod-title small,.vx-prod-sub-head small{display:block;color:#6c8196;font-size:9px;margin-top:3px}.vx-prod-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:11px}.vx-prod-sub{border:1px solid #d8e1e9;border-radius:10px;background:#fff;padding:12px}.vx-prod-sub-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;color:#17344f;font-size:11px}.vx-period{display:flex;gap:3px}.vx-period button{border:1px solid #ccd8e3;background:#f4f7fa;color:#466078;font-size:8px;padding:4px 7px;border-radius:5px;cursor:pointer}.vx-period button.active{background:#173e62;color:#fff;border-color:#173e62}.vx-prod-kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:11px 0}.vx-prod-kpis>div{background:#f5f8fb;border-radius:8px;padding:9px}.vx-prod-kpis span{display:block;font-size:8px;color:#667f95}.vx-prod-kpis b{font-size:18px;color:#102d49}.vx-prod-filters{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.vx-prod-filters label{font-size:8px;color:#667f95;font-weight:700}.vx-prod-filters select{width:100%;margin-top:3px;border:1px solid #ccd8e3;border-radius:5px;padding:6px;background:#fff;color:#18364f;font-size:9px}@media(max-width:900px){.vx-prod-grid{grid-template-columns:1fr}.vx-productivity{grid-column:1/-1!important}}`;document.head.appendChild(css);
 const mo=new MutationObserver(()=>setTimeout(mount,0));mo.observe(document.documentElement,{childList:true,subtree:true});setTimeout(mount,300);
})();