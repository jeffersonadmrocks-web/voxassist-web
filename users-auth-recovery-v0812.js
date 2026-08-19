/* VoxAssist V0.8.12 — bloco Usuários/Auth: e-mail, acesso por lojas e recuperação de senha */
(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');

  function hardenUserForm(){
    const form=q('#vxUserForm'); if(!form || form.dataset.vxAuthPatched==='1') return;
    form.dataset.vxAuthPatched='1';
    const email=q('input[name="email"]',form), pass=q('input[name="password"]',form), store=q('select[name="store"]',form);
    if(email){ email.disabled=false; email.readOnly=false; email.removeAttribute('readonly'); email.removeAttribute('disabled'); email.autocomplete='off'; email.value=''; email.placeholder='usuario@empresa.com.br'; email.style.background='#fff'; email.setAttribute('data-lpignore','true'); email.setAttribute('data-1p-ignore','true'); }
    if(pass){ pass.autocomplete='new-password'; pass.setAttribute('data-lpignore','true'); pass.setAttribute('data-1p-ignore','true'); }
    if(store){
      const stores=[...store.options].filter(o=>o.value).map(o=>({id:o.value,name:o.textContent.trim()}));
      const wrap=document.createElement('div');wrap.className='vx-store-access';
      wrap.innerHTML=`<label>LOJAS COM ACESSO *</label><div class="vx-store-checks">${stores.map(s=>`<label><input type="checkbox" name="store_ids" value="${E(s.id)}"> <span>${E(s.name)}</span></label>`).join('')}</div><small>Selecione uma ou mais lojas. Não existe acesso genérico a “todas as lojas”.</small>`;
      store.closest('label')?.replaceWith(wrap) || store.replaceWith(wrap);
    }

    form.addEventListener('submit',async e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const f=new FormData(form), btn=e.submitter||q('button.primary',form); if(btn)btn.disabled=true;
      const storeIds=qa('input[name="store_ids"]:checked',form).map(x=>x.value);
      try{
        if(!storeIds.length)throw new Error('Selecione pelo menos uma loja para o usuário.');
        const emailValue=String(f.get('email')||'').trim().toLowerCase();
        if(!emailValue)throw new Error('Informe o e-mail do usuário.');
        const r=await fetch(CFG.url+'/functions/v1/voxassist-manage-user',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({full_name:f.get('name'),email:emailValue,password:f.get('password'),role:f.get('role'),store_ids:storeIds,company_id:state.profile.active_company_id})});
        const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Falha ao criar usuário');
        q('#vxAdminModal')?.remove();toast('Usuário cadastrado com acesso apenas às lojas selecionadas.');
        if(typeof render==='function')await render('usuarios');
      }catch(err){toast('Falha ao cadastrar usuário: '+err.message,'err');if(btn)btn.disabled=false;}
    },true);
  }

  async function sendRecovery(email){
    email=String(email||'').trim().toLowerCase(); if(!email)throw new Error('Informe o e-mail do usuário.');
    const redirectTo=location.origin+location.pathname;
    const r=await fetch(CFG.url+'/auth/v1/recover?redirect_to='+encodeURIComponent(redirectTo),{method:'POST',headers:{apikey:CFG.key,'Content-Type':'application/json'},body:JSON.stringify({email})});
    let d={};try{d=await r.json()}catch{} if(!r.ok)throw new Error(d.msg||d.message||'Não foi possível enviar a recuperação.'); return true;
  }
  window.vxSendPasswordRecovery=sendRecovery;

  function addForgotPassword(){
    const login=q('form'); if(!login || q('#vxForgotPassword') || !q('input[type="password"]',login))return;
    const b=document.createElement('button');b.type='button';b.id='vxForgotPassword';b.textContent='Esqueci minha senha';b.style.cssText='margin-top:8px;border:0;background:none;color:#0b5fa5;text-decoration:underline;cursor:pointer;font-size:11px';
    login.appendChild(b);b.onclick=async()=>{const current=q('input[type="email"]',login)?.value||'';const email=prompt('Informe seu e-mail para receber o link de recuperação:',current);if(email===null)return;try{await sendRecovery(email);toast('Link de recuperação enviado para o e-mail informado.');}catch(e){toast(e.message,'err')}};
  }

  function addAdminRecovery(){
    const page=q('.vx-admin-page'); if(!page || page.dataset.vxRecoveryActions==='1')return; page.dataset.vxRecoveryActions='1';
    qa('table tbody tr',page).forEach(tr=>{const cells=qa('td',tr);if(cells.length<5)return;const email=cells[1]?.textContent.trim();if(!email||email==='—')return;const b=document.createElement('button');b.type='button';b.textContent='RECUPERAR SENHA';b.className='vx-user-recovery';b.onclick=async()=>{if(!confirm('Enviar link de recuperação para '+email+'?'))return;try{await sendRecovery(email);toast('Recuperação enviada para '+email+'.');}catch(e){toast(e.message,'err')}};cells[4].appendChild(b);});
  }

  const style=document.createElement('style');style.textContent=`.vx-store-access>label{display:block;font-size:9px;font-weight:800;color:#5e7489;margin-bottom:6px}.vx-store-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;border:1px solid #ccd8e3;border-radius:6px;padding:9px;background:#f8fafc}.vx-store-checks label{display:flex;align-items:center;gap:6px;font-size:10px;color:#18364f}.vx-store-access small{display:block;margin-top:5px;font-size:8px;color:#72869a}.vx-user-recovery{margin-left:8px;border:1px solid #b9cad8;background:#eef5fb;color:#174f7a;padding:4px 7px;border-radius:4px;font-size:8px;font-weight:800;cursor:pointer}`;document.head.appendChild(style);
  const obs=new MutationObserver(()=>{setTimeout(hardenUserForm,0);setTimeout(addForgotPassword,0);setTimeout(addAdminRecovery,0)});obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{hardenUserForm();addForgotPassword();addAdminRecovery()},300);
})();