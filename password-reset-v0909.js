/* VoxAssist Web V0.9.09 — Redefinir senha (gestor → usuário).
   Matriz Mestra, Área 01 -- decisão do usuário (2026-09-09), opção B:
   "gestor solicita redefinição e o usuário recebe o fluxo seguro pra
   definir nova senha -- gestor nunca conhece/digita/define a senha
   definitiva de outro usuário."

   Confirmado ANTES de escrever (fonte: código-fonte oficial de
   @supabase/auth-js, GoTrueClient.ts, via `gh api`, não por memória):
   - resetPasswordForEmail() = POST {url}/recover com {email} -- é o
     MESMO endpoint público já usado pra "esqueci minha senha", sem
     precisar saber a senha atual nem logar como o usuário-alvo.
     Reaproveita o helper auth() já existente em app.js (mesmo padrão
     de auth('token?grant_type=password',...)/auth('logout',{})) --
     ZERO Edge Function nova, zero service_role.
   - Definir a nova senha = PUT {url}/user com Authorization: Bearer
     <access_token do link de recuperação> e {password}.

   Nota de risco (registrada, não resolvida por falta de acesso ao
   painel do Supabase Auth): se o projeto usa o fluxo PKCE pra
   e-mails (em vez do clássico por fragmento #access_token), o link
   viria com ?code= em vez de #access_token=, e a troca exigiria um
   code_verifier que só existe no navegador que INICIOU o pedido (o
   do gestor, não o do usuário-alvo) -- inerente ao PKCE, não dá pra
   contornar por código. Tratado com mensagem clara em vez de travar
   silenciosamente; precisa de teste manual ponta a ponta pra
   confirmar qual fluxo este projeto usa. */
(function(){
  function parseHashParams(){
    const h=location.hash.startsWith('#')?location.hash.slice(1):'';
    return Object.fromEntries(new URLSearchParams(h));
  }
  const hashParams=parseHashParams();
  const isRecovery=hashParams.type==='recovery'&&hashParams.access_token;
  const isPkceLink=!!new URLSearchParams(location.search).get('code')&&String(new URLSearchParams(location.search).get('type')||'')==='recovery';

  function clearRecoveryHash(){
    try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
  }

  function renderRecoveryForm(){
    document.body.innerHTML=`<div class="vx-recovery-wrap"><form id="vxRecoveryForm" class="vx-recovery-card">
      <h2>Definir nova senha</h2>
      <p>Escolha uma nova senha para acessar o VoxAssist.</p>
      <label>NOVA SENHA *</label><input id="vxRecPass" type="password" minlength="10" required autocomplete="new-password">
      <small>Mínimo de 10 caracteres.</small>
      <label>CONFIRMAR SENHA *</label><input id="vxRecPass2" type="password" minlength="10" required autocomplete="new-password">
      <div id="vxRecErr" class="vx-recovery-err" hidden></div>
      <button class="primary" type="submit">SALVAR NOVA SENHA</button>
    </form></div>`;
    const style=document.createElement('style');
    style.textContent=`.vx-recovery-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f6fa;padding:20px}.vx-recovery-card{width:min(380px,92vw);background:#fff;border:1px solid #dfe7ef;border-radius:12px;padding:26px;display:grid;gap:8px;box-shadow:0 10px 30px rgba(0,0,0,.08)}.vx-recovery-card h2{margin:0 0 2px;font-size:19px;color:#17324e}.vx-recovery-card p{margin:0 0 10px;font-size:12px;color:#6d7f91}.vx-recovery-card label{font-size:10px;font-weight:800;color:#29445e;margin-top:6px}.vx-recovery-card input{height:38px;border:1px solid #cfd9e3;border-radius:7px;padding:0 10px;font-size:13px}.vx-recovery-card small{font-size:10px;color:#8a96a3}.vx-recovery-card button{margin-top:14px;height:42px;border:0;border-radius:8px;background:#0c2340;color:#fff;font-weight:800;cursor:pointer}.vx-recovery-err{background:#fdecea;border:1px solid #f3c3bd;color:#a12a1f;border-radius:7px;padding:8px 10px;font-size:11.5px}`;
    document.head.appendChild(style);
    document.getElementById('vxRecoveryForm').onsubmit=async e=>{
      e.preventDefault();
      const p1=document.getElementById('vxRecPass').value,p2=document.getElementById('vxRecPass2').value;
      const err=document.getElementById('vxRecErr');err.hidden=true;
      if(p1!==p2){err.textContent='As senhas não coincidem.';err.hidden=false;return;}
      const btn=e.submitter;btn.disabled=true;btn.textContent='SALVANDO...';
      try{
        const r=await fetch(CFG.url+'/auth/v1/user',{method:'PUT',headers:{apikey:CFG.key,Authorization:'Bearer '+hashParams.access_token,'Content-Type':'application/json'},body:JSON.stringify({password:p1})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d.msg||d.error_description||d.message||'Não foi possível salvar a nova senha.');
        clearRecoveryHash();
        document.body.innerHTML=`<div class="vx-recovery-wrap"><div class="vx-recovery-card"><h2>Senha atualizada</h2><p>Sua senha foi redefinida com sucesso. Entre novamente com a nova senha.</p><button class="primary" id="vxRecoveryGoLogin" type="button">IR PARA O LOGIN</button></div></div>`;
        document.getElementById('vxRecoveryGoLogin').onclick=()=>location.reload();
      }catch(err){
        const box=document.getElementById('vxRecErr');
        if(box){box.textContent=err.message;box.hidden=false;}
        btn.disabled=false;btn.textContent='SALVAR NOVA SENHA';
      }
    };
  }

  function renderPkceNotice(){
    document.body.innerHTML=`<div class="vx-recovery-wrap"><div class="vx-recovery-card"><h2>Não foi possível abrir este link aqui</h2><p>Este link de redefinição precisa ser aberto no mesmo navegador onde foi solicitado. Peça ao gestor pra solicitar a redefinição de novo, ou use "esqueci minha senha" na tela de login a partir do seu próprio navegador.</p><button class="primary" id="vxRecoveryGoLogin" type="button">IR PARA O LOGIN</button></div></div>`;
    const style=document.createElement('style');
    style.textContent=`.vx-recovery-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f6fa;padding:20px}.vx-recovery-card{width:min(420px,92vw);background:#fff;border:1px solid #dfe7ef;border-radius:12px;padding:26px;text-align:center}.vx-recovery-card h2{margin:0 0 8px;font-size:18px;color:#17324e}.vx-recovery-card p{margin:0 0 16px;font-size:12.5px;color:#6d7f91;line-height:1.5}.vx-recovery-card button{height:42px;padding:0 18px;border:0;border-radius:8px;background:#0c2340;color:#fff;font-weight:800;cursor:pointer}`;
    document.head.appendChild(style);
    document.getElementById('vxRecoveryGoLogin').onclick=()=>{location.href=location.pathname;};
  }

  if(isRecovery){
    window.loginScreen=function(){renderRecoveryForm();};
    window.boot=function(){renderRecoveryForm();};
  } else if(isPkceLink){
    window.loginScreen=function(){renderPkceNotice();};
    window.boot=function(){renderPkceNotice();};
  }

  // Botão "REDEFINIR SENHA" no modal de Alterar Usuário
  // (user-access-management-v0813.js) -- reaproveita auth('recover',...)
  // já existente, mesmo padrão de auth('token?grant_type=password',...).
  window.vxRequestPasswordReset=async function(email){
    if(!email)throw new Error('E-mail do usuário não disponível.');
    await auth('recover',{email,gotrue_meta_security:{}});
  };
})();
