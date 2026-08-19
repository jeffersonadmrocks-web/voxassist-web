/* VoxAssist V0.8.12 — renovação automática de sessão + recuperação de senha */
(function(){
  const baseApi=window.api;
  const baseAuth=window.auth;

  async function refreshAccessToken(){
    const s=state?.session;
    if(!s?.refresh_token) throw new Error('Sessão expirada. Faça login novamente.');
    const r=await fetch(CFG.url+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{apikey:CFG.key,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:s.refresh_token})
    });
    const d=await r.json();
    if(!r.ok) throw new Error(d?.msg||d?.error_description||d?.message||'Não foi possível renovar a sessão');
    d.expires_at=Math.floor(Date.now()/1000)+(d.expires_in||3600);
    saveSession(d);
    return d;
  }

  window.api=async function(path,opt={}){
    let r=await fetch(CFG.url+'/rest/v1/'+path,{...opt,headers:{...authHeaders(),...(opt.headers||{})}});
    if(r.status===401){
      try{await refreshAccessToken();r=await fetch(CFG.url+'/rest/v1/'+path,{...opt,headers:{...authHeaders(),...(opt.headers||{})}})}
      catch(e){clearSession();loginScreen();throw e}
    }
    if(!r.ok){const e=await r.text();throw new Error(e||r.statusText)}
    const t=await r.text();return t?JSON.parse(t):null;
  };

  async function sendRecovery(email){
    const redirectTo=window.location.origin+window.location.pathname;
    const r=await fetch(CFG.url+'/auth/v1/recover?redirect_to='+encodeURIComponent(redirectTo),{
      method:'POST',headers:{apikey:CFG.key,'Content-Type':'application/json'},body:JSON.stringify({email})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d?.msg||d?.message||'Não foi possível enviar o e-mail de recuperação');
  }

  async function updateRecoveredPassword(accessToken,password){
    const r=await fetch(CFG.url+'/auth/v1/user',{method:'PUT',headers:{apikey:CFG.key,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({password})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d?.msg||d?.message||'Não foi possível alterar a senha');
  }

  function parseRecovery(){
    const p=new URLSearchParams((location.hash||'').replace(/^#/,''));
    return p.get('type')==='recovery'&&p.get('access_token')?{token:p.get('access_token')}:null;
  }

  function recoveryScreen(token){
    document.body.innerHTML=`<div class="login-shell"><div class="login-card"><div class="login-brand">VOX<span>ASSIST</span></div><div class="version">RECUPERAÇÃO DE SENHA</div><h1>Criar nova senha</h1><p>Informe uma nova senha para concluir a recuperação do acesso.</p><form id="vxRecoveryForm"><label>NOVA SENHA</label><input id="vxNewPass1" type="password" minlength="6" required><label>CONFIRMAR SENHA</label><input id="vxNewPass2" type="password" minlength="6" required><button class="primary full">SALVAR NOVA SENHA</button></form></div></div>`;
    document.querySelector('#vxRecoveryForm').onsubmit=async e=>{e.preventDefault();const a=document.querySelector('#vxNewPass1').value,b=document.querySelector('#vxNewPass2').value;if(a!==b)return toast('As senhas não conferem.','err');try{await updateRecoveredPassword(token,a);history.replaceState(null,'',location.pathname+location.search);toast('Senha alterada com sucesso. Faça login novamente.');setTimeout(()=>loginScreen(),700)}catch(err){toast(err.message,'err')}};
  }

  function enhanceLogin(){
    const form=document.querySelector('#loginForm');if(!form||document.querySelector('#vxForgotPassword'))return;
    const b=document.createElement('button');b.type='button';b.id='vxForgotPassword';b.className='link-btn';b.textContent='Esqueci minha senha';form.insertAdjacentElement('afterend',b);
    b.onclick=async()=>{const email=(document.querySelector('#email')?.value||prompt('Informe o e-mail do usuário:')||'').trim().toLowerCase();if(!email)return;try{await sendRecovery(email);toast('Enviamos as instruções de recuperação para o e-mail informado.')}catch(err){toast(err.message,'err')}};
  }

  const recovery=parseRecovery();
  if(recovery){setTimeout(()=>recoveryScreen(recovery.token),0);return;}
  const obs=new MutationObserver(enhanceLogin);obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(enhanceLogin,200);

  setInterval(async()=>{
    const s=state?.session;if(!s?.expires_at||!s?.refresh_token)return;
    if(Date.now()/1000>s.expires_at-180){try{await refreshAccessToken()}catch(e){console.warn('Falha ao renovar sessão:',e)}}
  },60000);
})();