/* VoxAssist V0.8.13 — hardening de usuários + mensagens humanas Whirlpool */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  let lastUserId=null;

  function humanMessage(raw){
    const s=String(raw||'');
    if(/row-level security|violates row-level security|42501/i.test(s)) return 'A ação foi bloqueada por segurança. Confira se a Empresa Ativa corresponde ao cadastro e se seu usuário possui acesso a esta empresa.';
    if(/invalid input syntax for type uuid|22P02/i.test(s)) return 'Não foi possível concluir a ação porque o cadastro está incompleto ou a empresa ativa não foi definida corretamente.';
    if(/duplicate key|23505|already exists|already registered/i.test(s)) return 'Já existe um cadastro com estes dados.';
    if(/jwt|session|sessão|token.*expired|expired.*token/i.test(s)) return 'Sua sessão expirou. Entre novamente no VoxAssist para continuar.';
    if(/Failed to fetch|NetworkError|network request failed/i.test(s)) return 'Não foi possível comunicar com o servidor. Verifique a conexão e tente novamente.';
    if(/permission|permissão|not allowed|forbidden/i.test(s)) return 'Seu usuário não possui permissão para realizar esta ação.';
    if(/Falha ao criar OS\/agenda/i.test(s)) return 'Não foi possível importar esta OS na Empresa Ativa. Confira a empresa selecionada e as permissões do seu usuário.';
    return s.replace(/^\{.*"message"\s*:\s*"([^"]+)".*\}$/,'$1');
  }

  // Mantém detalhes técnicos fora da interface e mensagens claras para o usuário.
  if(typeof window.toast==='function'&&!window.__vxHumanToast){
    const base=window.toast;
    window.toast=function(msg,type){return base(humanMessage(msg),type)};
    window.__vxHumanToast=true;
  }

  // Guarda o usuário escolhido antes do listener legado interceptar o clique.
  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest?.('[data-user-manage]');
    if(b?.dataset?.userManage) lastUserId=b.dataset.userManage;
  },true);

  async function addCredentialPanel(page){
    if(!page||page.dataset.vxCredentials==='1'||!lastUserId)return;
    page.dataset.vxCredentials='1';
    let currentEmail='';
    try{
      const rows=await api(`profiles?id=eq.${encodeURIComponent(lastUserId)}&select=email`);
      currentEmail=rows?.[0]?.email||'';
    }catch{}
    const summary=page.querySelector('.vx-user-summary');
    if(!summary)return;
    const box=document.createElement('section');
    box.className='vx-security-access';
    box.innerHTML=`<div class="vx-sec-title"><div><h3>Segurança de acesso</h3><p>Altere o e-mail de login ou defina uma nova senha. A senha atual nunca é exibida.</p></div><span>GESTÃO RESTRITA</span></div>
      <div class="vx-sec-grid">
        <label>E-mail de login<input type="email" name="vxemail" value="${E(currentEmail)}" autocomplete="off"></label>
        <label>Nova senha<input type="password" name="vxpassword" minlength="10" placeholder="Mínimo de 10 caracteres" autocomplete="new-password"></label>
        <label>Confirmar nova senha<input type="password" name="vxpassword2" minlength="10" placeholder="Repita a nova senha" autocomplete="new-password"></label>
        <button type="button" class="primary" data-save-credentials>ATUALIZAR ACESSO</button>
      </div>
      <div class="vx-sec-note">Alterações de e-mail e senha afetam o login do usuário. O usuário deve receber a nova credencial por um canal seguro.</div>`;
    summary.insertAdjacentElement('afterend',box);
    box.querySelector('[data-save-credentials]').onclick=async()=>{
      const email=box.querySelector('[name=vxemail]').value.trim().toLowerCase();
      const p1=box.querySelector('[name=vxpassword]').value;
      const p2=box.querySelector('[name=vxpassword2]').value;
      if(!email&&!p1)return toast('Informe um novo e-mail ou uma nova senha.','err');
      if(p1&&p1.length<10)return toast('A nova senha deve ter no mínimo 10 caracteres.','err');
      if(p1!==p2)return toast('A confirmação da nova senha não confere.','err');
      const btn=box.querySelector('[data-save-credentials]');btn.disabled=true;btn.textContent='ATUALIZANDO...';
      try{
        const r=await fetch(CFG.url+'/functions/v1/voxassist-manage-user',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({action:'update_credentials',user_id:lastUserId,company_id:state?.profile?.active_company_id,email,password:p1})});
        const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Não foi possível atualizar o acesso');
        box.querySelector('[name=vxpassword]').value='';box.querySelector('[name=vxpassword2]').value='';
        toast('E-mail/senha do usuário atualizados com segurança.');
      }catch(err){toast(humanMessage(err.message),'err')}finally{btn.disabled=false;btn.textContent='ATUALIZAR ACESSO'}
    };
  }

  function renameScheduleButtons(root=document){
    root.querySelectorAll('button,a').forEach(el=>{
      const t=(el.textContent||'').trim().toUpperCase();
      if(t==='ATENDIMENTO EXTERNO'||t.includes('ATENDIMENTO EXTERNO')){
        el.textContent='AGENDAR';
        el.title='Agendar atendimento externo';
      }
    });
  }

  function makeOpenAgendaDraggable(root=document){
    if(String(state?.profile?.role||'').toUpperCase()==='TECNICO')return;
    root.querySelectorAll('.vx-open-lane .vx-appt[data-appt]').forEach(card=>{
      if(String(card.dataset.appt||'').startsWith('new:'))return;
      card.setAttribute('draggable','true');
    });
  }

  const st=document.createElement('style');
  st.textContent='.vx-security-access{background:#fff;border:1px solid #dbe4ec;border-radius:10px;padding:14px;margin:0 0 12px}.vx-sec-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}.vx-sec-title h3{margin:0 0 3px;font-size:14px}.vx-sec-title p{margin:0;color:#718397;font-size:10px}.vx-sec-title span{font-size:8px;font-weight:800;background:#fff3cd;color:#765b00;border-radius:4px;padding:5px 7px}.vx-sec-grid{display:grid;grid-template-columns:1.5fr 1fr 1fr auto;gap:10px;align-items:end}.vx-sec-grid label{display:grid;gap:5px;font-size:10px;font-weight:800;color:#496175}.vx-sec-grid input{height:38px;border:1px solid #cbd7e2;border-radius:6px;padding:0 9px}.vx-sec-grid button{height:38px}.vx-sec-note{margin-top:8px;font-size:9px;color:#6d7f90}@media(max-width:900px){.vx-sec-grid{grid-template-columns:1fr 1fr}.vx-sec-grid button{width:100%}}';
  document.head.appendChild(st);

  const obs=new MutationObserver(()=>{
    const p=document.querySelector('#vxPermPage');if(p)addCredentialPanel(p);
    renameScheduleButtons();makeOpenAgendaDraggable();
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>{renameScheduleButtons();makeOpenAgendaDraggable();},500);
})();
