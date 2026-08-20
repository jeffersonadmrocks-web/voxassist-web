/* VoxAssist V0.8.13 — primeiro acesso robusto após reset */
(function(){
  const priorRender=window.render;
  const E=window.esc||((v='')=>String(v??''));
  function noCompany(){return !state?.profile?.active_company_id;}
  function bindCep(root){
    const zip=root.querySelector('[name="zip"]'); if(!zip)return;
    const fmt=v=>String(v||'').replace(/\D/g,'').slice(0,8).replace(/^(\d{5})(\d{1,3})$/,'$1-$2');
    zip.inputMode='numeric'; zip.maxLength=9; zip.addEventListener('input',()=>zip.value=fmt(zip.value));
    zip.addEventListener('blur',async()=>{const d=zip.value.replace(/\D/g,'');if(d.length!==8)return;try{const r=await fetch('https://viacep.com.br/ws/'+d+'/json/');const x=await r.json();if(x.erro)return toast('CEP não localizado.','err');root.querySelector('[name="address"]').value=(x.logradouro||'').toUpperCase();root.querySelector('[name="neighborhood"]').value=(x.bairro||'').toUpperCase();root.querySelector('[name="city"]').value=(x.localidade||'').toUpperCase();root.querySelector('[name="uf"]').value=(x.uf||'').toUpperCase();}catch{toast('Não foi possível consultar o CEP agora.','err')}});
  }
  function renderFirstAccess(){
    state.view='usuarios';
    if(!state.openTabs.includes('usuarios'))state.openTabs.push('usuarios');
    document.querySelector('#title')&&(document.querySelector('#title').textContent='Configuração inicial');
    if(typeof window.renderTabs==='function')window.renderTabs('Configurações');
    const app=document.querySelector('#app'); if(!app)return;
    app.innerHTML=`<div class="vx-first-setup"><div class="vx-first-card"><div class="vx-first-icon">✓</div><h2>Configuração inicial do VoxAssist</h2><p>O banco está limpo. Cadastre a primeira empresa/CNPJ e a unidade principal para começar.</p><form id="vxFirstCompany"><div class="vx-form-2"><label>RAZÃO SOCIAL *<input name="legal" required></label><label>NOME FANTASIA<input name="trade"></label></div><div class="vx-form-2"><label>CNPJ / CPF<input name="doc"></label><label>NOME DA UNIDADE PRINCIPAL *<input name="unit" required placeholder="Ex.: VOX VITÓRIA"></label></div><div class="vx-form-2"><label>TELEFONE<input name="phone"></label><label>E-MAIL<input name="email" type="email"></label></div><div class="vx-form-3"><label>CEP<input name="zip"></label><label>ENDEREÇO<input name="address"></label><label>NÚMERO<input name="number"></label></div><div class="vx-form-3"><label>BAIRRO<input name="neighborhood"></label><label>CIDADE<input name="city"></label><label>UF<input name="uf" maxlength="2"></label></div><div class="vx-admin-form-actions"><button class="primary">CRIAR EMPRESA E UNIDADE PRINCIPAL</button></div></form></div></div>`;
    const f=app.querySelector('#vxFirstCompany'); bindCep(f); window.vxBindInputMasks?.(f);
    f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),btn=e.submitter;btn.disabled=true;btn.textContent='CRIANDO...';try{
      const payload={p_legal_name:fd.get('legal'),p_trade_name:fd.get('trade')||'',p_document:fd.get('doc')||'',p_code:'',p_phone:fd.get('phone')||'',p_email:fd.get('email')||'',p_zip_code:fd.get('zip')||'',p_address:fd.get('address')||'',p_address_number:fd.get('number')||'',p_neighborhood:fd.get('neighborhood')||'',p_city:fd.get('city')||'',p_state:fd.get('uf')||''};
      await api('rpc/create_company_full',{method:'POST',body:JSON.stringify(payload)});
      const links=await api(`user_companies?user_id=eq.${state.session.user.id}&active=eq.true&select=company_id,store_id&order=created_at.desc&limit=1`);const link=links?.[0];if(!link?.company_id)throw new Error('Empresa criada, mas o vínculo inicial não foi localizado.');
      if(link.store_id)await api(`stores?id=eq.${link.store_id}`,{method:'PATCH',body:JSON.stringify({name:String(fd.get('unit')).trim().toUpperCase()})});
      await api(`profiles?id=eq.${state.session.user.id}`,{method:'PATCH',body:JSON.stringify({active_company_id:link.company_id,store_id:link.store_id||null})});
      await loadProfile();await loadCore();shell();toast('Empresa e unidade principal criadas.');setTimeout(()=>window.render('usuarios'),0);
    }catch(err){toast('Falha na configuração inicial: '+err.message,'err');btn.disabled=false;btn.textContent='CRIAR EMPRESA E UNIDADE PRINCIPAL';}};
  }
  window.render=async function(view){if(view==='usuarios'&&noCompany())return renderFirstAccess();return priorRender(view)};
  const style=document.createElement('style');style.textContent=`.vx-first-setup{display:grid;place-items:start center;padding:28px}.vx-first-card{width:min(920px,100%);background:#fff;border:1px solid #dfe7ef;border-radius:12px;padding:22px;box-shadow:0 6px 20px rgba(18,52,86,.06)}.vx-first-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#eaf7ef;color:#138a48;font-size:22px;font-weight:800}.vx-first-card h2{margin:12px 0 4px;color:#17324e}.vx-first-card p{margin:0 0 18px;color:#6b7d90}.vx-first-card label{display:grid;gap:5px;font-size:10px;font-weight:800;color:#29445e}.vx-first-card input{height:38px;border:1px solid #cfd9e3;border-radius:6px;padding:0 10px}.vx-first-card .vx-form-2,.vx-first-card .vx-form-3{display:grid;gap:10px;margin-bottom:10px}.vx-first-card .vx-form-2{grid-template-columns:repeat(2,1fr)}.vx-first-card .vx-form-3{grid-template-columns:repeat(3,1fr)}@media(max-width:760px){.vx-first-card .vx-form-2,.vx-first-card .vx-form-3{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
})();