/* VoxAssist Web V0.8.12 — busca de cliente nos próprios campos da OS aberta */
(function(){
  const U=v=>String(v||'').toUpperCase();
  const N=v=>String(v||'').replace(/\D/g,'');
  const V=v=>typeof esc==='function'?esc(v??''):String(v??'');

  function labelInput(box,label){
    const field=[...box.querySelectorAll('.vx-field')].find(f=>U(f.querySelector('label')?.textContent).startsWith(U(label)));
    return field?.querySelector('input,select,textarea')||null;
  }

  function installStyle(){
    if(document.querySelector('#vx-inline-client-style'))return;
    const s=document.createElement('style');s.id='vx-inline-client-style';
    s.textContent=`.vx-inline-client-matches{grid-column:1/-1;border:1px solid #cbd6e2;background:#fff;display:none;margin:-2px 0 8px;max-height:190px;overflow:auto;z-index:20}.vx-inline-client-matches.show{display:block}.vx-inline-client-matches button{display:flex;width:100%;border:0;border-bottom:1px solid #e5ebf1;background:#fff;padding:8px 10px;cursor:pointer;text-align:left;gap:12px}.vx-inline-client-matches button:hover{background:#eef5ff}.vx-inline-client-matches b{min-width:240px}.vx-inline-client-matches span{color:#607185}.vx-client-search-field{background:#fff!important}`;
    document.head.appendChild(s);
  }

  function patch(){
    const panel=document.querySelector('#vx-os');if(!panel||panel.dataset.inlineClientSearch==='1')return;
    const box=panel.querySelector('.vx-os-box');if(!box)return;
    panel.dataset.inlineClientSearch='1';installStyle();

    const legacy=[...box.querySelectorAll('.vx-field')].find(f=>U(f.querySelector('label')?.textContent).includes('LOCALIZAR CLIENTE'));
    if(legacy)legacy.remove();

    const name=labelInput(box,'NOME / RAZÃO SOCIAL');
    const doc=labelInput(box,'CPF / CNPJ');
    const phone=labelInput(box,'TELEFONE PRINCIPAL');
    if(!name||!doc||!phone)return;

    const originals={name:name.value,doc:doc.value,phone:phone.value};
    [name,doc,phone].forEach(el=>{el.removeAttribute('readonly');el.classList.add('vx-client-search-field');el.autocomplete='off';el.title='Digite para localizar um cliente já cadastrado';});

    const grid=name.closest('.vx-field-grid');
    const matches=document.createElement('div');matches.className='vx-inline-client-matches';grid.appendChild(matches);

    function restore(){name.value=originals.name;doc.value=originals.doc;phone.value=originals.phone;matches.classList.remove('show')}
    function rowsFor(el){
      const q=el===name?U(el.value):N(el.value);if(!q||((el===name)&&q.length<3))return[];
      return (state.clients||[]).filter(c=>{
        if(el===name)return U(c.name).includes(q);
        if(el===doc)return N(c.document)===q||N(c.document).startsWith(q);
        return N(c.phone_primary).includes(q)||N(c.phone_secondary).includes(q);
      }).slice(0,8);
    }
    function fillClient(c){
      const map=[['NOME / RAZÃO SOCIAL',c.name],['CPF / CNPJ',c.document],['TELEFONE PRINCIPAL',c.phone_primary],['+ OUTRO TELEFONE',c.phone_secondary],['E-MAIL',c.email],['CEP',c.zip_code],['ENDEREÇO',c.address],['NÚMERO',c.address_number],['COMPLEMENTO',c.complement],['BAIRRO',c.neighborhood],['CIDADE',c.city],['ESTADO',c.state]];
      map.forEach(([l,v])=>{const el=labelInput(box,l);if(el)el.value=v||''});
      originals.name=c.name||'';originals.doc=c.document||'';originals.phone=c.phone_primary||'';
      matches.classList.remove('show');
    }
    async function choose(c){
      try{
        fillClient(c);
        const osId=state.activeOs?.id;
        if(osId&&state.activeOs?.client_id!==c.id){
          await api(`service_orders?id=eq.${osId}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({client_id:c.id})});
          state.activeOs.client_id=c.id;
          if(typeof toast==='function')toast('Cliente vinculado à OS e dados atualizados.');
        }
      }catch(err){if(typeof toast==='function')toast('Não foi possível vincular o cliente: '+err.message,'err')}
    }
    function search(el){
      const rows=rowsFor(el);
      if(!rows.length){matches.innerHTML='<div style="padding:8px 10px;color:#607185">Nenhum cadastro localizado.</div>';matches.classList.add('show');return}
      matches.innerHTML=rows.map(c=>`<button type="button" data-id="${c.id}"><b>${V(c.name)}</b><span>${V(c.document||'')} • ${V(c.phone_primary||'')}</span></button>`).join('');
      matches.classList.add('show');
      matches.querySelectorAll('button').forEach(b=>b.onclick=()=>{const c=(state.clients||[]).find(x=>x.id===b.dataset.id);if(c)choose(c)});
    }
    [name,doc,phone].forEach(el=>{
      el.addEventListener('focus',()=>el.select());
      el.addEventListener('input',()=>search(el));
      el.addEventListener('keydown',e=>{if(e.key==='Escape'){restore();el.blur()}});
    });
    document.addEventListener('mousedown',e=>{if(!box.contains(e.target))matches.classList.remove('show')},{once:false});
  }

  const mo=new MutationObserver(()=>patch());mo.observe(document.documentElement,{childList:true,subtree:true});
  patch();
})();
