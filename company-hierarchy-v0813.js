/* VoxAssist V0.8.13 — hierarquia Empresa/CNPJ -> Lojas/Unidades */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  async function enhanceAdmin(){
    if(state?.view!=='usuarios')return;
    const page=document.querySelector('.vx-admin-page');if(!page||page.dataset.vxHierarchy==='1')return;
    // Sem .vx-admin-grid (ex.: tela do company-only-mode-v0813.js) o
    // recurso de "Lojas/Unidades" abaixo não tem onde se anexar — mas
    // antes disso a linha do hero já era sobrescrita mesmo assim,
    // contradizendo a mensagem real daquela tela. Achado real de
    // auditoria: dois arquivos brigando pelo mesmo parágrafo.
    if(!page.querySelector('.vx-admin-grid'))return;
    page.dataset.vxHierarchy='1';
    const newCompany=document.querySelector('#vxNewCompany');if(newCompany)newCompany.textContent='+ CADASTRAR EMPRESA / CNPJ';
    const newStore=document.querySelector('#vxNewStore');if(newStore)newStore.remove();
    const hero=page.querySelector('.vx-admin-hero p');if(hero)hero.textContent='Empresa é o cadastro jurídico/CNPJ. Lojas e unidades ficam vinculadas dentro de cada empresa.';
    const activeId=state?.profile?.active_company_id;
    const [companies,stores]=await Promise.all([
      api('companies?select=id,legal_name,trade_name,document&order=trade_name.nullslast,legal_name').catch(()=>[]),
      api('stores?select=id,name,code,company_id,active&order=name').catch(()=>[])
    ]);
    const companyCard=page.querySelector('.vx-admin-grid .vx-admin-card:first-child');
    if(companyCard){
      companyCard.querySelector('.vx-admin-title h3')&&(companyCard.querySelector('.vx-admin-title h3').textContent='EMPRESAS / CNPJ');
      const rows=[...companyCard.querySelectorAll('.vx-company-row')];
      rows.forEach((row,i)=>{
        const c=companies?.[i];if(!c)return;
        const oldSmall=row.querySelector('small');if(oldSmall)oldSmall.textContent=(c.legal_name||'')+(c.document?' • CNPJ/CPF '+c.document:'');
        let unit=document.createElement('div');unit.className='vx-company-units-inline';
        const cs=(stores||[]).filter(s=>String(s.company_id)===String(c.id));
        unit.innerHTML=`<div class="vx-units-head"><b>LOJAS / UNIDADES</b><button type="button" class="vx-add-unit" data-company="${E(c.id)}">+ ADICIONAR UNIDADE</button></div>${cs.length?cs.map((s,idx)=>`<div class="vx-unit-row"><span>${idx===0?'★ ':''}${E(s.name)}</span><small>${idx===0?'UNIDADE PRINCIPAL':'UNIDADE'}${s.code?' • '+E(s.code):''} • ${s.active?'ATIVA':'INATIVA'}</small></div>`).join(''):'<div class="vx-unit-empty">Nenhuma unidade cadastrada.</div>'}`;
        row.insertAdjacentElement('afterend',unit);
      });
      companyCard.querySelectorAll('.vx-add-unit').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openUnitModal(b.dataset.company,enhanceAfterRefresh)});
    }
  }
  async function enhanceAfterRefresh(){await window.render('usuarios')}
  function openUnitModal(companyId,done){
    document.querySelector('#vxUnitModal')?.remove();
    const ov=document.createElement('div');ov.id='vxUnitModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>Adicionar Loja / Unidade</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxUnitForm" class="vx-admin-form"><p class="vx-unit-help">Esta unidade pertence à empresa selecionada. Os dados jurídicos/CNPJ permanecem no cadastro da empresa.</p><label>NOME DA LOJA / UNIDADE *</label><input name="name" required placeholder="EX.: VOX SERRA"><label>CÓDIGO CURTO</label><input name="code" placeholder="EX.: SERRA"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR UNIDADE</button></div></form></div></div>`;
    document.body.appendChild(ov);ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;try{await api('stores',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({company_id:companyId,name:String(f.get('name')).trim().toUpperCase(),code:String(f.get('code')||'').trim().toUpperCase()||null,active:true})});ov.remove();toast('Loja / unidade cadastrada dentro da empresa.');done&&await done()}catch(err){toast('Falha ao cadastrar unidade: '+err.message,'err');btn.disabled=false}};
  }
  function augmentNewCompanyModal(){
    const m=document.querySelector('#vxAdminModal');if(!m||m.dataset.vxCompanyExplained==='1')return;
    const form=m.querySelector('#vxCompanyForm');if(!form)return;m.dataset.vxCompanyExplained='1';
    const title=m.querySelector('.vx-admin-modal-head h3');if(title)title.textContent='Cadastrar Empresa / CNPJ';
    const note=document.createElement('div');note.className='vx-company-explain';note.innerHTML='<b>EMPRESA = ENTIDADE JURÍDICA / CNPJ</b><span>Ao salvar, o VoxAssist cria automaticamente uma unidade principal com o nome fantasia (ou razão social, se não houver nome fantasia). Outras lojas são cadastradas depois dentro desta empresa.</span>';
    form.prepend(note);
  }
  const mo=new MutationObserver(()=>{augmentNewCompanyModal();if(state?.view==='usuarios')setTimeout(enhanceAdmin,0)});mo.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('#vxNewCompany'))setTimeout(augmentNewCompanyModal,0)});
  const baseRender=window.render;window.render=async function(view){const r=await baseRender(view);if(view==='usuarios')setTimeout(enhanceAdmin,20);return r};
  const style=document.createElement('style');style.textContent=`.vx-company-units-inline{margin:-2px 7px 9px 7px;padding:9px 10px;background:#f8fafc;border:1px solid #e0e8f0;border-radius:7px}.vx-units-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.vx-units-head>b{font-size:9px;color:#496176}.vx-add-unit{font-size:9px!important;min-height:28px!important;padding:3px 8px!important}.vx-unit-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid #edf2f6}.vx-unit-row span{font-size:10px;font-weight:700}.vx-unit-row small{font-size:8px;color:#6c7e90}.vx-unit-empty{font-size:9px;color:#7a8997}.vx-company-explain{display:grid;gap:4px;background:#eef6ff;border:1px solid #cfe1f5;border-left:4px solid #1b67a5;border-radius:7px;padding:10px;margin-bottom:10px}.vx-company-explain b{font-size:10px;color:#184a76}.vx-company-explain span,.vx-unit-help{font-size:10px;color:#607588}`;document.head.appendChild(style);
})();