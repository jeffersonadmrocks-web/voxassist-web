/* VoxAssist V0.8.12 — resumo financeiro do gestor baseado em pagamentos reais */
(function(){
  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const M=window.money||((v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
  const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const startOfWeek=d=>{const x=startOfDay(d);const off=(x.getDay()+6)%7;x.setDate(x.getDate()-off);return x};
  const startOfMonth=d=>new Date(d.getFullYear(),d.getMonth(),1);
  const budget=(f={})=>Number(f.labor_value||0)+Number(f.freight_value||0)+Number(f.auxiliary_material_value||0)+Number(f.technical_report_value||0)-Number(f.discount_value||0);
  const paid=p=>!!p.paid_at && !['CANCELADO','CANCELADA','ESTORNADO','ESTORNADA'].includes(norm(p.status));

  async function enhance(){
    const root=document.querySelector('.vx-approved');
    if(!root)return;
    const card=[...root.querySelectorAll('.vx-a-card')].find(c=>/RESUMO FINANCEIRO/i.test(c.querySelector('h3')?.textContent||''));
    if(!card||card.dataset.vxFinancial==='1')return;
    card.dataset.vxFinancial='1';
    try{
      const [orders,fin,payments]=await Promise.all([
        api('service_orders?select=id,status,ready_at,delivery_at&limit=1000').catch(()=>[]),
        api('os_financial?select=service_order_id,labor_value,freight_value,auxiliary_material_value,technical_report_value,discount_value&limit=1000').catch(()=>[]),
        api('payments?select=service_order_id,amount,method,status,paid_at&order=paid_at.desc.nullslast&limit=2000').catch(()=>[])
      ]);
      const now=new Date(),day0=startOfDay(now),week0=startOfWeek(now),month0=startOfMonth(now);
      const finMap=new Map((fin||[]).map(f=>[f.service_order_id,f]));
      const ready=(orders||[]).filter(o=>norm(o.status)==='PRONTO PARA ENTREGA');
      const readyValue=ready.reduce((s,o)=>s+budget(finMap.get(o.id)||{}),0);
      const valid=(payments||[]).filter(p=>paid(p));
      const today=valid.filter(p=>new Date(p.paid_at)>=day0);
      const week=valid.filter(p=>new Date(p.paid_at)>=week0);
      const month=valid.filter(p=>new Date(p.paid_at)>=month0);
      const sum=a=>a.reduce((s,p)=>s+Number(p.amount||0),0);
      const monthDeliveredIds=new Set(month.map(p=>p.service_order_id).filter(id=>{
        const o=(orders||[]).find(x=>x.id===id);return !!o?.delivery_at;
      }));
      const monthDeliveredReceipts=month.filter(p=>monthDeliveredIds.has(p.service_order_id));
      const ticketBase=sum(monthDeliveredReceipts);
      const ticket=monthDeliveredIds.size?ticketBase/monthDeliveredIds.size:0;
      const byMethod={};month.forEach(p=>{const k=norm(p.method)||'OUTROS';byMethod[k]=(byMethod[k]||0)+Number(p.amount||0)});
      const totalMonth=sum(month)||1;
      const methodRows=[['PIX','PIX'],['Cartão','CART'],['Dinheiro','DINHEIRO'],['Outros','OUTROS']].map(([label,key])=>{
        let v=0;if(key==='CART')Object.entries(byMethod).forEach(([k,n])=>{if(k.includes('CART'))v+=n});else if(key==='OUTROS')Object.entries(byMethod).forEach(([k,n])=>{if(!k.includes('PIX')&&!k.includes('CART')&&!k.includes('DINHEIRO'))v+=n});else Object.entries(byMethod).forEach(([k,n])=>{if(k.includes(key))v+=n});
        return [label,totalMonth?Math.round(v*100/totalMonth):0];
      });
      card.innerHTML=`<div class="vx-a-title"><h3>RESUMO FINANCEIRO</h3><span>Ver financeiro completo</span></div>
        <div class="vx-fin-top"><div class="vx-a-fin vx-fin-primary"><span>Recebido hoje</span><b>${M(sum(today))}</b></div><div class="vx-a-fin vx-fin-primary"><span>Pronto para entrega</span><b>${M(readyValue)}</b><small>${ready.length} aparelho${ready.length===1?'':'s'} pronto${ready.length===1?'':'s'}</small></div></div>
        <div class="vx-fin-secondary"><div><span>Recebimentos do mês</span><b>${M(sum(month))}</b></div><div><span>Recebimentos da semana</span><b>${M(sum(week))}</b></div><div><span>Ticket médio</span><b>${M(ticket)}</b><small>Recebimentos do mês ÷ aparelhos entregues</small></div></div>
        <div class="vx-fin-methods">${methodRows.map(([t,p])=>`<div class="vx-a-row"><span>${t}</span><span style="width:55%"><div class="vx-a-meter"><i style="width:${p}%"></i></div></span><span>${p}%</span></div>`).join('')}</div>`;
    }catch(e){card.dataset.vxFinancial='';}
  }
  const css=document.createElement('style');css.textContent=`.vx-fin-top{display:grid;grid-template-columns:1fr 1fr;gap:8px}.vx-fin-primary{min-height:60px}.vx-fin-primary small{display:block;margin-top:3px;font-size:8px;color:#718399}.vx-fin-secondary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px;padding-top:8px;border-top:1px solid #e5edf4}.vx-fin-secondary>div{padding:7px 8px;background:#f7f9fb;border-radius:7px}.vx-fin-secondary span,.vx-fin-secondary small{display:block;font-size:8px;color:#718399}.vx-fin-secondary b{display:block;margin-top:3px;font-size:12px;color:#17344f}.vx-fin-secondary small{margin-top:2px;font-size:7px}.vx-fin-methods{margin-top:9px}@media(max-width:900px){.vx-fin-secondary{grid-template-columns:1fr}.vx-fin-top{grid-template-columns:1fr}}`;document.head.appendChild(css);
  const mo=new MutationObserver(()=>setTimeout(enhance,0));mo.observe(document.documentElement,{childList:true,subtree:true});setTimeout(enhance,300);
})();