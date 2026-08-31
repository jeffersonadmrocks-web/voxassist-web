/* VoxAssist V0.8.12 — segurança visual multiempresa, confirmação de troca e edição pelo gestor */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const previousRender=window.render;
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';

  function guardConfig(){
    document.querySelectorAll('[data-view="usuarios"], [data-target="usuarios-operacional"]').forEach(el=>{
      if(!isGestor()) el.style.display='none'; else el.style.removeProperty('display');
    });
  }

  window.render=async function(view){
    if(String(view)==='usuarios'&&!isGestor()){
      if(typeof toast==='function')toast('Configurações disponíveis somente para o Gestor.','err');
      return previousRender('dashboard');
    }
    const out=await previousRender.apply(this,arguments);
    setTimeout(()=>{guardConfig();enhanceAdmin();},0);
    return out;
  };

  function confirmBox(companyName,onYes,onNo){
    document.querySelector('#vxCompanyConfirm')?.remove();
    const ov=document.createElement('div');
    ov.id='vxCompanyConfirm';ov.className='vx-company-confirm-overlay';
    ov.innerHTML=`<div class="vx-company-confirm-box"><div class="vx-store-icon">▰</div><h3>CONFIRMAR TROCA DE EMPRESA</h3><p>Deseja operar na empresa <strong>${E(companyName)}</strong>?</p><div class="vx-company-warning">Todos os dados exibidos a seguir serão da empresa selecionada.</div><div class="vx-company-confirm-actions"><button type="button" class="secondary" data-no>NÃO</button><button type="button" class="primary" data-yes>SIM, TROCAR</button></div></div>`;
    document.body.appendChild(ov);
    const closeNo=()=>{ov.remove();onNo&&onNo()};
    ov.querySelector('[data-no]').onclick=closeNo;
    ov.querySelector('[data-yes]').onclick=()=>{ov.remove();onYes&&onYes()};
    ov.onclick=e=>{if(e.target===ov)closeNo()};
  }

  document.addEventListener('change',function(e){
    // #vxCanonicalCompanySelect (company-selector-singleton-v0813.js) é o
    // seletor de empresa realmente visível em produção — ele esconde
    // agressivamente o antigo #vxCompanySelect. Sem incluir os dois aqui,
    // esse listener (capture-phase, roda antes do próprio onchange do
    // select) nunca interceptava a troca real, e a confirmação abaixo
    // ficava morta na prática: a troca de empresa acontecia direto pela
    // rpc/switch_company do seletor novo, sem nenhuma confirmação.
    const select=e.target.closest?.('#vxCompanySelect,#vxCanonicalCompanySelect');
    if(!select)return;
    const next=select.value,current=state?.profile?.active_company_id;
    if(!next||next===current)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const option=select.options[select.selectedIndex];
    const name=option?.textContent?.trim()||'selecionada';
    select.disabled=true;
    confirmBox(name,async()=>{
      try{
        await api('rpc/switch_company',{method:'POST',body:JSON.stringify({target_company:next})});
        await loadProfile();await loadCore();
        shell();
        await window.render('dashboard');
        if(typeof toast==='function')toast('Empresa alterada para '+name+'.');
      }catch(err){
        if(typeof toast==='function')toast('Não foi possível trocar de empresa: '+err.message,'err');
        select.disabled=false;select.value=current||'';
      }
    },()=>{select.disabled=false;select.value=current||'';});
  },true);

  function adminModal(title,body){
    document.querySelector('#vxEditCompanyModal')?.remove();
    const ov=document.createElement('div');ov.id='vxEditCompanyModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${E(title)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">${body}</div></div>`;
    document.body.appendChild(ov);ov.querySelector('[data-close]').onclick=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)ov.remove()};return ov;
  }

  async function editCompany(id,done){
    if(!isGestor())return;
    const rows=await api(`companies?id=eq.${id}&select=*`);const c=rows?.[0];if(!c)return;
    const m=adminModal('Alterar dados da empresa',`<form id="vxEditCompanyForm" class="vx-admin-form"><label>RAZÃO SOCIAL *</label><input name="legal" required value="${E(c.legal_name||'')}"><label>NOME FANTASIA</label><input name="trade" value="${E(c.trade_name||'')}"><div class="vx-form-2"><div><label>CNPJ / CPF</label><input name="doc" value="${E(c.document||'')}"></div><div><label>CÓDIGO</label><input name="code" value="${E(c.code||'')}"></div></div><div class="vx-form-2"><div><label>TELEFONE</label><input name="phone" value="${E(c.phone||'')}"></div><div><label>E-MAIL</label><input type="email" name="email" value="${E(c.email||'')}"></div></div><div class="vx-form-2"><div><label>CEP</label><input name="zip" value="${E(c.zip_code||'')}"></div><div><label>ENDEREÇO</label><input name="address" value="${E(c.address||'')}"></div></div><div class="vx-form-2"><div><label>NÚMERO</label><input name="number" value="${E(c.address_number||'')}"></div><div><label>BAIRRO</label><input name="neighborhood" value="${E(c.neighborhood||'')}"></div></div><div class="vx-form-2"><div><label>CIDADE</label><input name="city" value="${E(c.city||'')}"></div><div><label>UF</label><input maxlength="2" name="uf" value="${E(c.state||'')}"></div></div><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR ALTERAÇÕES</button></div></form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();
    m.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const btn=e.submitter;btn.disabled=true;try{await api(`companies?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({legal_name:String(f.get('legal')).toUpperCase(),trade_name:String(f.get('trade')||'').toUpperCase()||null,document:f.get('doc')||null,code:String(f.get('code')||'').toUpperCase()||null,phone:f.get('phone')||null,email:f.get('email')||null,zip_code:f.get('zip')||null,address:String(f.get('address')||'').toUpperCase()||null,address_number:f.get('number')||null,neighborhood:String(f.get('neighborhood')||'').toUpperCase()||null,city:String(f.get('city')||'').toUpperCase()||null,state:String(f.get('uf')||'').toUpperCase()||null})});m.remove();toast('Dados da empresa atualizados.');done&&await done();}catch(err){toast('Falha ao alterar empresa: '+err.message,'err');btn.disabled=false;}};
  }

  async function editStore(id,done){
    if(!isGestor())return;
    const rows=await api(`stores?id=eq.${id}&select=*`);const s=rows?.[0];if(!s)return;
    const m=adminModal('Alterar loja / unidade',`<form class="vx-admin-form"><label>NOME DA LOJA *</label><input name="name" required value="${E(s.name||'')}"><label>CÓDIGO</label><input name="code" value="${E(s.code||'')}"><label><input type="checkbox" name="active" ${s.active?'checked':''}> LOJA ATIVA</label><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR ALTERAÇÕES</button></div></form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();m.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const btn=e.submitter;btn.disabled=true;try{await api(`stores?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({name:String(f.get('name')).toUpperCase(),code:String(f.get('code')||'').toUpperCase()||null,active:f.get('active')==='on'})});m.remove();toast('Dados da loja atualizados.');done&&await done();}catch(err){toast('Falha ao alterar loja: '+err.message,'err');btn.disabled=false;}};
  }

  let enhancing=false;
  async function enhanceAdmin(){
    guardConfig();
    if(!isGestor()||enhancing||!document.querySelector('.vx-admin-page'))return;
    const companyCard=[...document.querySelectorAll('.vx-admin-card')].find(x=>x.querySelector('.vx-admin-title h3')?.textContent.includes('EMPRESAS'));
    const storeCard=[...document.querySelectorAll('.vx-admin-card')].find(x=>x.querySelector('.vx-admin-title h3')?.textContent.includes('LOJAS'));
    if(!companyCard&&!storeCard)return;
    enhancing=true;
    try{
      const [companies,stores]=await Promise.all([api('companies?select=*&order=trade_name.nullslast,legal_name').catch(()=>[]),api('stores?select=*&order=name').catch(()=>[])]);
      companyCard?.querySelectorAll('.vx-company-row').forEach((row,i)=>{if(row.querySelector('.vx-edit-company'))return;const c=companies?.[i];if(!c)return;const b=document.createElement('button');b.type='button';b.className='secondary vx-edit-company';b.textContent='ALTERAR';b.onclick=()=>editCompany(c.id,async()=>window.render('usuarios'));row.appendChild(b);});
      storeCard?.querySelectorAll('.vx-company-row').forEach((row,i)=>{if(row.querySelector('.vx-edit-store'))return;const s=stores?.[i];if(!s)return;const b=document.createElement('button');b.type='button';b.className='secondary vx-edit-store';b.textContent='ALTERAR';b.onclick=()=>editStore(s.id,async()=>window.render('usuarios'));row.appendChild(b);});
    }finally{enhancing=false;}
  }

  const style=document.createElement('style');style.textContent=`
    .vx-company-confirm-overlay{position:fixed;inset:0;z-index:60000;background:rgba(9,27,49,.45);display:flex;align-items:center;justify-content:center;padding:20px}.vx-company-confirm-box{width:min(500px,94vw);background:#fff;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.24);padding:24px;text-align:center}.vx-store-icon{font-size:36px;color:#0e2235;margin-bottom:8px}.vx-company-confirm-box h3{margin:0 0 12px;font-size:16px;color:#17324e}.vx-company-confirm-box p{font-size:15px;color:#263b4f}.vx-company-warning{margin:14px 0;background:#fff7e8;border:1px solid #f0d7a4;border-radius:8px;padding:10px;font-size:11px;color:#73531b}.vx-company-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.vx-edit-company,.vx-edit-store{margin-left:8px;font-size:9px!important;padding:5px 8px!important;height:auto!important}
  `;document.head.appendChild(style);

  const mo=new MutationObserver(()=>{guardConfig();enhanceAdmin();});mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>{guardConfig();enhanceAdmin();},0);
})();
