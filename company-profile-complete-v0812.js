/* VoxAssist V0.8.12 — cadastro completo da empresa, identidade visual e horário */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';

  function modal(title,body){
    document.querySelector('#vxCompanyFullModal')?.remove();
    const ov=document.createElement('div');ov.id='vxCompanyFullModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal vx-company-full-modal"><div class="vx-admin-modal-head"><h3>${E(title)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">${body}</div></div>`;
    document.body.appendChild(ov);ov.querySelector('[data-close]').onclick=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)ov.remove()};return ov;
  }

  function hoursFrom(c){const h=c?.business_hours||{};return ['seg','ter','qua','qui','sex','sab','dom'].map(k=>({k,...(h[k]||{})}));}
  async function fileToDataUrl(file){return await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}

  async function editCompanyFull(id,done){
    if(!isGestor())return;
    const rows=await api(`companies?id=eq.${id}&select=*`);const c=rows?.[0];if(!c)return;
    const hs=hoursFrom(c), dayLabel={seg:'SEGUNDA',ter:'TERÇA',qua:'QUARTA',qui:'QUINTA',sex:'SEXTA',sab:'SÁBADO',dom:'DOMINGO'};
    const m=modal('Cadastro completo da empresa',`<form id="vxCompanyFullForm" class="vx-admin-form">
      <div class="vx-company-section"><h4>DADOS GERAIS</h4><div class="vx-form-2"><div><label>RAZÃO SOCIAL *</label><input name="legal" required value="${E(c.legal_name||'')}"></div><div><label>NOME FANTASIA</label><input name="trade" value="${E(c.trade_name||'')}"></div></div><div class="vx-form-3"><div><label>CNPJ / CPF</label><input name="doc" value="${E(c.document||'')}"></div><div><label>INSCRIÇÃO ESTADUAL</label><input name="ie" value="${E(c.state_registration||'')}"></div><div><label>INSCRIÇÃO MUNICIPAL</label><input name="im" value="${E(c.municipal_registration||'')}"></div></div><div class="vx-form-3"><div><label>CNAE PRINCIPAL</label><input name="cnae" value="${E(c.cnae_main||'')}"></div><div><label>REGIME TRIBUTÁRIO</label><input name="tax" value="${E(c.tax_regime||'')}"></div><div><label>REGIME ESPECIAL</label><input name="special" value="${E(c.special_tax_regime||'')}"></div></div></div>
      <div class="vx-company-section"><h4>CONTATO</h4><div class="vx-form-3"><div><label>TELEFONE</label><input name="phone" value="${E(c.phone||'')}"></div><div><label>CELULAR / WHATSAPP</label><input name="mobile" value="${E(c.mobile||'')}"></div><div><label>E-MAIL</label><input type="email" name="email" value="${E(c.email||'')}"></div></div><label>SITE</label><input name="website" value="${E(c.website||'')}"></div>
      <div class="vx-company-section"><h4>ENDEREÇO</h4><div class="vx-form-3"><div><label>CEP</label><input name="zip" value="${E(c.zip_code||'')}"></div><div><label>LOGRADOURO</label><input name="address" value="${E(c.address||'')}"></div><div><label>NÚMERO</label><input name="number" value="${E(c.address_number||'')}"></div></div><div class="vx-form-3"><div><label>BAIRRO</label><input name="neighborhood" value="${E(c.neighborhood||'')}"></div><div><label>CIDADE</label><input name="city" value="${E(c.city||'')}"></div><div><label>UF</label><input maxlength="2" name="uf" value="${E(c.state||'')}"></div></div></div>
      <div class="vx-company-section"><h4>IDENTIDADE VISUAL DOS DOCUMENTOS</h4><div class="vx-logo-row"><div class="vx-logo-preview">${c.logo_url?`<img src="${E(c.logo_url)}" alt="Logo">`:'<span>SEM LOGO</span>'}</div><div><label>LOGO DA EMPRESA</label><input type="file" name="logo" accept="image/png,image/jpeg,image/webp"><small>Usada em O.S., recibos e documentos próprios do VoxAssist. Não substitui modelos espelho de fabricante.</small><label>OBSERVAÇÃO DE CABEÇALHO</label><input name="header_note" value="${E(c.document_header_note||'')}"><label>RODAPÉ PADRÃO DOS DOCUMENTOS</label><textarea name="footer">${E(c.document_footer||'')}</textarea></div></div></div>
      <div class="vx-company-section"><h4>HORÁRIO DE FUNCIONAMENTO</h4><div class="vx-hours-grid">${hs.map(d=>`<div class="vx-hour-row"><label><input type="checkbox" name="${d.k}_open" ${d.open!==false?'checked':''}> ${dayLabel[d.k]}</label><input type="time" name="${d.k}_start" value="${E(d.start||'08:00')}"><span>até</span><input type="time" name="${d.k}_end" value="${E(d.end||'18:00')}"></div>`).join('')}</div></div>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR CADASTRO COMPLETO</button></div>
    </form>`);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();
    m.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;try{
      let logo=c.logo_url||null;const file=f.get('logo');if(file&&file.size)logo=await fileToDataUrl(file);
      const business_hours={};['seg','ter','qua','qui','sex','sab','dom'].forEach(k=>business_hours[k]={open:f.get(k+'_open')==='on',start:f.get(k+'_start')||null,end:f.get(k+'_end')||null});
      await api(`companies?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({legal_name:String(f.get('legal')).toUpperCase(),trade_name:String(f.get('trade')||'').toUpperCase()||null,document:f.get('doc')||null,state_registration:f.get('ie')||null,municipal_registration:f.get('im')||null,cnae_main:f.get('cnae')||null,tax_regime:f.get('tax')||null,special_tax_regime:f.get('special')||null,phone:f.get('phone')||null,mobile:f.get('mobile')||null,email:f.get('email')||null,website:f.get('website')||null,zip_code:f.get('zip')||null,address:String(f.get('address')||'').toUpperCase()||null,address_number:f.get('number')||null,neighborhood:String(f.get('neighborhood')||'').toUpperCase()||null,city:String(f.get('city')||'').toUpperCase()||null,state:String(f.get('uf')||'').toUpperCase()||null,logo_url:logo,business_hours,document_header_note:f.get('header_note')||null,document_footer:f.get('footer')||null})});
      m.remove();toast('Cadastro completo da empresa atualizado.');done&&await done();
    }catch(err){toast('Falha ao salvar dados da empresa: '+err.message,'err');btn.disabled=false;}};
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('.vx-edit-company');if(!b||!isGestor())return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const rows=[...document.querySelectorAll('.vx-admin-card .vx-company-row')];const row=b.closest('.vx-company-row');const idx=rows.indexOf(row);
    api('companies?select=id&order=trade_name.nullslast,legal_name').then(cs=>{const c=cs?.[idx];if(c)editCompanyFull(c.id,async()=>window.render('usuarios'));});
  },true);

  window.getActiveCompanyBranding=async function(){try{const id=state?.profile?.active_company_id;if(!id)return null;const r=await api(`companies?id=eq.${id}&select=id,legal_name,trade_name,document,phone,mobile,email,website,address,address_number,neighborhood,city,state,logo_url,business_hours,document_header_note,document_footer`);return r?.[0]||null;}catch{return null;}};

  const style=document.createElement('style');style.textContent=`.vx-company-full-modal{width:min(980px,97vw)}.vx-company-section{border:1px solid #dfe7ef;border-radius:9px;padding:12px;margin-bottom:10px}.vx-company-section h4{margin:0 0 10px;color:#17324e;font-size:12px}.vx-form-3{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.vx-logo-row{display:grid;grid-template-columns:170px 1fr;gap:14px}.vx-logo-preview{height:120px;border:1px dashed #b9c7d5;border-radius:8px;display:grid;place-items:center;background:#f8fafc}.vx-logo-preview img{max-width:150px;max-height:100px;object-fit:contain}.vx-logo-preview span{font-size:10px;color:#7a8a9a}.vx-hours-grid{display:grid;gap:6px}.vx-hour-row{display:grid;grid-template-columns:150px 130px 30px 130px;gap:8px;align-items:center}.vx-hour-row label{font-size:10px;font-weight:700}.vx-hour-row span{text-align:center;font-size:10px;color:#68798a}@media(max-width:800px){.vx-form-3{grid-template-columns:1fr}.vx-logo-row{grid-template-columns:1fr}.vx-hour-row{grid-template-columns:1fr 1fr 20px 1fr}}`;
  document.head.appendChild(style);
})();
