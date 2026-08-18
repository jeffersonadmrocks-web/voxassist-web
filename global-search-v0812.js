/* VoxAssist Web V0.8.12 — Pesquisa global superior */
(function(){
  const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const digits=s=>String(s||'').replace(/\D/g,'');
  let timer=null;

  function injectStyle(){
    if(document.querySelector('#vx-global-search-style')) return;
    const s=document.createElement('style');s.id='vx-global-search-style';s.textContent=`
      .global-search{position:relative}.vx-global-results{position:absolute;right:0;top:100%;z-index:9999;width:min(720px,80vw);max-height:430px;overflow:auto;background:#fff;border:1px solid #aebdcb;box-shadow:0 8px 22px rgba(20,42,65,.18);display:none;text-align:left}.vx-global-results.open{display:block}.vx-global-head{padding:8px 10px;background:#eef3f8;color:#52687d;font-size:10px;font-weight:700;border-bottom:1px solid #d5dee7}.vx-global-item{display:grid;grid-template-columns:88px 1fr;gap:10px;width:100%;border:0;border-bottom:1px solid #e3e8ed;background:#fff;padding:10px 12px;text-align:left;cursor:pointer}.vx-global-item:hover,.vx-global-item.active{background:#eaf3ff}.vx-global-kind{font-size:10px;font-weight:700;color:#176cd2}.vx-global-main{font-size:12px;font-weight:700;color:#16283a}.vx-global-sub{display:block;margin-top:3px;font-size:10px;color:#617385;font-weight:400}.vx-global-empty{padding:18px 12px;color:#6a7887;font-size:11px}`;
    document.head.appendChild(s);
  }

  function attach(){
    const input=document.querySelector('#globalSearch');
    if(!input || input.dataset.vxGlobalReady) return;
    input.dataset.vxGlobalReady='1'; injectStyle();
    const wrap=input.closest('.global-search')||input.parentElement;
    const box=document.createElement('div');box.className='vx-global-results';box.id='vxGlobalResults';wrap.appendChild(box);
    let items=[];let active=-1;

    const close=()=>{box.classList.remove('open');active=-1};
    const draw=rows=>{
      items=rows;active=-1;
      if(!rows.length){box.innerHTML='<div class="vx-global-empty">Nenhum cliente, OS ou equipamento localizado.</div>';box.classList.add('open');return;}
      box.innerHTML='<div class="vx-global-head">RESULTADOS DA PESQUISA GLOBAL</div>'+rows.slice(0,15).map((r,i)=>`<button type="button" class="vx-global-item" data-i="${i}"><span class="vx-global-kind">${esc(r.kind)}</span><span class="vx-global-main">${esc(r.title)}<small class="vx-global-sub">${esc(r.sub||'')}</small></span></button>`).join('');
      box.classList.add('open');box.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>openItem(rows[Number(b.dataset.i)]));
    };
    const mark=()=>box.querySelectorAll('.vx-global-item').forEach((b,i)=>b.classList.toggle('active',i===active));

    async function search(q){
      q=String(q||'').trim(); if(q.length<2){close();return;}
      const nq=norm(q),qd=digits(q),rows=[],seen=new Set();
      const add=r=>{const k=r.kind+':'+r.id;if(!seen.has(k)){seen.add(k);rows.push(r)}};
      (state.orders||[]).forEach(o=>{
        const c=o.clients||{},e=o.equipments||{};
        const hay=norm([o.os_number,c.name,c.phone_primary,e.product_type,e.brand,e.model].join(' '));
        if(hay.includes(nq)||(qd&&digits([c.phone_primary].join('')).includes(qd))) add({kind:'O.S.',id:o.id,title:o.os_number,sub:[c.name,e.product_type,e.brand,e.model,o.status].filter(Boolean).join(' • '),open:'os'});
      });
      (state.clients||[]).forEach(c=>{
        const hay=norm([c.name,c.document,c.phone_primary,c.phone_secondary,c.city].join(' '));
        const dhay=digits([c.document,c.phone_primary,c.phone_secondary].join(' '));
        if(hay.includes(nq)||(qd&&dhay.includes(qd))) add({kind:'CLIENTE',id:c.id,title:c.name,sub:[c.document,c.phone_primary,c.city].filter(Boolean).join(' • '),open:'client'});
      });
      try{
        if(q.length>=3){
          const eqs=await api(`equipments?or=(product_type.ilike.*${encodeURIComponent(q)}*,brand.ilike.*${encodeURIComponent(q)}*,model.ilike.*${encodeURIComponent(q)}*,serial_number.ilike.*${encodeURIComponent(q)}*)&select=id,product_type,brand,model,serial_number&limit=8`).catch(()=>[]);
          for(const e of (eqs||[])){
            const os=await api(`service_orders?equipment_id=eq.${e.id}&select=id,os_number,status,clients(name)&order=opened_at.desc&limit=1`).catch(()=>[]);
            const o=os?.[0];
            add({kind:'EQUIPAMENTO',id:o?.id||e.id,title:[e.product_type,e.brand,e.model].filter(Boolean).join(' '),sub:[e.serial_number,o?.os_number,o?.clients?.name,o?.status].filter(Boolean).join(' • '),open:o?'os':'equipment'});
          }
        }
      }catch{}
      draw(rows);
    }

    function openItem(r){
      close();input.value='';
      if(r.open==='os') return render(`os:${r.id}`);
      if(r.open==='client' && typeof window.renderClient360==='function') return window.renderClient360(r.id);
      if(r.open==='client'){render('clientes');setTimeout(()=>window.renderClient360?.(r.id),50);return;}
      toast('Equipamento localizado, mas ainda sem O.S. vinculada.');
    }

    input.oninput=e=>{clearTimeout(timer);timer=setTimeout(()=>search(e.target.value),180)};
    input.onkeydown=e=>{
      if(!box.classList.contains('open') && e.key==='Enter'){e.preventDefault();search(input.value);return;}
      if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(active+1,items.length-1);mark()}
      if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(active-1,0);mark()}
      if(e.key==='Enter'&&active>=0){e.preventDefault();openItem(items[active])}
      if(e.key==='Escape')close();
    };
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))close()});
  }

  const obs=new MutationObserver(attach);obs.observe(document.documentElement,{childList:true,subtree:true});attach();
})();
