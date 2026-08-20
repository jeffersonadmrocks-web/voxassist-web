/* VoxAssist V0.8.13 — gestão multiempresa final */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const uid=()=>state?.session?.user?.id||null;
  async function memberships(){
    if(!uid()) return [];
    return await api(`user_companies?user_id=eq.${uid()}&active=eq.true&select=company_id,role,store_id,companies(id,legal_name,trade_name,document,code,active)&order=created_at.asc`).catch(()=>[]);
  }
  async function populateTopCompanySelector(){
    const sel=document.querySelector('#activeStore'); if(!sel) return;
    const label=sel.closest('label'); const small=label?.querySelector('small'); if(small) small.textContent='EMPRESA ATIVA';
    const rows=(await memberships()).filter(r=>r.companies&&r.companies.active!==false);
    sel.innerHTML=rows.map(r=>`<option value="${E(r.company_id)}" ${String(r.company_id)===String(state.profile?.active_company_id)?'selected':''}>${E(r.companies.trade_name||r.companies.legal_name||'EMPRESA')}</option>`).join('')||'<option value="">NENHUMA EMPRESA ATIVA</option>';
    sel.disabled=rows.length<2;
    sel.onchange=async()=>{
      if(!sel.value||sel.value===state.profile?.active_company_id)return;
      const keep=state.view||'dashboard'; sel.disabled=true;
      try{
        await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:sel.value})});
        await loadProfile(); await loadCore(); shell(); await render(keep==='usuarios'?'usuarios':'dashboard'); toast('Empresa ativa alterada.');
      }catch(e){toast('Falha ao trocar de empresa: '+e.message,'err'); sel.disabled=false;}
    };
  }
  function modal(title,body){
    document.querySelector('#vxCompanyManageModal')?.remove();
    const ov=document.createElement('div');ov.id='vxCompanyManageModal';ov.className='vx-admin-overlay';ov.innerHTML=`<div class="vx-admin-modal vx-company-full-modal"><div class="vx-admin-modal-head"><h3>${E(title)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">${body}</div></div>`;document.body.appendChild(ov);ov.querySelector('[data-close]').onclick=()=>ov.remove();return ov;
  }
  const toDataUrl=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)});
  async function editCompany(id){
    const c=(await api(`companies?id=eq.${id}&select=*`))?.[0]; if(!c)return toast('Empresa não encontrada.','err');
    const m=modal('Alterar empresa / CNPJ',`<form id="vxCompanyManageForm" class="vx-admin-form">
      <div class="vx-company-section"><h4>DADOS GERAIS</h4><div class="vx-form-2"><div><label>RAZÃO SOCIAL *</label><input name="legal" required value="${E(c.legal_name||'')}"></div><div><label>NOME FANTASIA</label><input name="trade" value="${E(c.trade_name||'')}"></div></div><div class="vx-form-3"><div><label>CNPJ / CPF</label><input name="doc" value="${E(c.document||'')}"></div><div><label>INSCRIÇÃO ESTADUAL</label><input name="ie" value="${E(c.state_registration||'')}"></div><div><label>INSCRIÇÃO MUNICIPAL</label><input name="im" value="${E(c.municipal_registration||'')}"></div></div></div>
      <div class="vx-company-section"><h4>CONTATO</h4><div class="vx-form-3"><div><label>TELEFONE</label><input name="phone" value="${E(c.phone||'')}"></div><div><label>CELULAR / WHATSAPP</label><input name="mobile" value="${E(c.mobile||'')}"></div><div><label>E-MAIL</label><input type="email" name="email" value="${E(c.email||'')}"></div></div></div>
      <div class="vx-company-section"><h4>ENDEREÇO</h4><div class="vx-form-3"><div><label>CEP</label><input name="zip" value="${E(c.zip_code||'')}"></div><div><label>LOGRADOURO</label><input name="address" value="${E(c.address||'')}"></div><div><label>NÚMERO</label><input name="number" value="${E(c.address_number||'')}"></div></div><div class="vx-form-3"><div><label>BAIRRO</label><input name="neighborhood" value="${E(c.neighborhood||'')}"></div><div><label>CIDADE</label><input name="city" value="${E(c.city||'')}"></div><div><label>UF</label><input name="uf" maxlength="2" value="${E(c.state||'')}"></div></div></div>
      <div class="vx-company-section"><h4>IDENTIDADE VISUAL</h4><div class="vx-logo-row"><div class="vx-logo-preview">${c.logo_url?`<img id="vxEditLogoPreview" src="${E(c.logo_url)}" alt="Logo">`:'<span id="vxEditLogoEmpty">SEM LOGO</span>'}</div><div><label>LOGO DA EMPRESA</label><input type="file" name="logo" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG ou WEBP. A prévia aparece antes de salvar.</small></div></div></div>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR ALTERAÇÕES</button></div></form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();
    const fi=m.querySelector('input[name=logo]'); fi.onchange=()=>{const f=fi.files?.[0];if(!f)return;if(!/^image\/(png|jpeg|webp)$/.test(f.type))return toast('Formato de logo inválido.','err');const url=URL.createObjectURL(f);const box=m.querySelector('.vx-logo-preview');box.innerHTML=`<img src="${url}" alt="Prévia da logo" style="max-width:150px;max-height:100px;object-fit:contain">`;};
    m.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;try{let logo=c.logo_url||null;const lf=f.get('logo');if(lf&&lf.size)logo=await toDataUrl(lf);await api(`companies?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({legal_name:String(f.get('legal')).trim().toUpperCase(),trade_name:String(f.get('trade')||'').trim().toUpperCase()||null,document:f.get('doc')||null,state_registration:f.get('ie')||null,municipal_registration:f.get('im')||null,phone:f.get('phone')||null,mobile:f.get('mobile')||null,email:f.get('email')||null,zip_code:f.get('zip')||null,address:String(f.get('address')||'').trim().toUpperCase()||null,address_number:f.get('number')||null,neighborhood:String(f.get('neighborhood')||'').trim().toUpperCase()||null,city:String(f.get('city')||'').trim().toUpperCase()||null,state:String(f.get('uf')||'').trim().toUpperCase()||null,logo_url:logo,updated_at:new Date().toISOString()})});m.remove();toast('Empresa atualizada.');await render('usuarios');}catch(err){toast('Falha ao alterar empresa: '+err.message,'err');btn.disabled=false;}};
  }
  async function rebuildCompanyCard(){
    if(state?.view!=='usuarios')return; const page=document.querySelector('.vx-admin-page');if(!page)return;
    const rows=await memberships(); const card=page.querySelector('.vx-admin-grid .vx-admin-card:first-child');if(!card)return;
    const title=card.querySelector('.vx-admin-title h3');if(title)title.textContent='EMPRESAS / CNPJ';const badge=card.querySelector('.vx-admin-title span');if(badge)badge.textContent=String(rows.length);
    [...card.children].forEach(ch=>{if(!ch.classList.contains('vx-admin-title'))ch.remove()});
    rows.forEach(r=>{const c=r.companies||{},selected=String(r.company_id)===String(state.profile?.active_company_id),active=c.active!==false,row=document.createElement('div');row.className='vx-company-row '+(selected?'active':'');row.innerHTML=`<div><b>${E(c.trade_name||c.legal_name||'EMPRESA')}</b><small>${E(c.legal_name||'')}${c.document?' • CNPJ/CPF '+E(c.document):''}</small></div><div class="vx-company-actions-inline"><span class="${active?'vx-ok':'vx-off'}">${active?'ATIVA':'INATIVA'}</span>${selected?'<em>EM USO</em>':active?`<button type="button" data-use="${E(r.company_id)}">USAR ESTA EMPRESA</button>`:''}<button type="button" data-edit2="${E(r.company_id)}">ALTERAR</button><button type="button" data-toggle="${E(r.company_id)}" data-active="${active?'1':'0'}">${active?'DESATIVAR':'ATIVAR'}</button></div>`;card.appendChild(row)});
    card.querySelectorAll('[data-use]').forEach(b=>b.onclick=async()=>{await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:b.dataset.use})});await loadProfile();await loadCore();shell();await render('usuarios')});
    card.querySelectorAll('[data-edit2]').forEach(b=>b.onclick=()=>editCompany(b.dataset.edit2));
    card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const id=b.dataset.toggle,on=b.dataset.active==='1';if(on&&String(id)===String(state.profile?.active_company_id))return toast('Troque para outra empresa antes de desativar a empresa em uso.','err');if(!confirm(`${on?'Desativar':'Ativar'} esta empresa?`))return;try{await api(`companies?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({active:!on,updated_at:new Date().toISOString()})});toast(`Empresa ${on?'desativada':'ativada'}.`);await render('usuarios')}catch(e){toast('Falha ao alterar situação da empresa: '+e.message,'err')}});
    populateTopCompanySelector();
  }
  const mo=new MutationObserver(()=>{setTimeout(()=>{populateTopCompanySelector();rebuildCompanyCard()},20)});mo.observe(document.documentElement,{subtree:true,childList:true});
  const prior=window.render;window.render=async function(view){const r=await prior(view);setTimeout(()=>{populateTopCompanySelector();if(view==='usuarios')rebuildCompanyCard()},40);return r};
  const st=document.createElement('style');st.textContent='.vx-company-actions-inline{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.vx-company-actions-inline em{font-style:normal;font-size:8px;font-weight:800;color:#176a43;background:#edf8f2;padding:3px 6px;border-radius:10px}.vx-company-actions-inline button{min-height:28px;padding:3px 8px;font-size:8px;border:1px solid #b8c9da;background:#fff;color:#164f80;cursor:pointer}';document.head.appendChild(st);
})();