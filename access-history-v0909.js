/* VoxAssist Web V0.9.09 — Histórico básico de acesso (login/logout) +
   aplica o parâmetro de tempo de inatividade por empresa.
   Matriz Mestra, Área 01 -- decisão do usuário (2026-09-09): registro
   simples agora, sem mexer no schema interno do Supabase Auth.
   Tabela access_history (migration 20260909020000). Grava:
   - LOGIN: só em autenticação real por senha (auth('token?grant_type=
     password',...), #loginForm em app.js) -- NÃO em restoreSession()
     (refresh_token de sessão existente ao recarregar a página), pra
     não inflar o histórico com todo F5.
   - LOGOUT: em qualquer auth('logout',{}) (existem 3 pontos de
     chamada -- app.js #logout, user-logoff-v0813.js doLogout(),
     user-permissions-ui-v0813.js doLogout() -- todos passam por
     auth(), único ponto de interceptação, sem precisar editar os 3).
   Nunca lança exceção própria (grava em segundo plano, sem travar
   login/logout se a escrita falhar).

   Achado do usuário em 2026-09-09 ao revisar Área 09 "Tempo de
   inatividade": JÁ EXISTIA um monitor real (app.js, resetIdle(),
   hardcoded 30 min) -- a Matriz dizia "nenhum monitor implementado
   ainda", corrigido. `companies.session_idle_timeout_minutes`
   (cadastro já existia, migration 20260908150000) agora é lido aqui
   e aplicado em `window.vxIdleTimeoutMs` (variável nova em app.js que
   resetIdle() já lê, no lugar do literal 30 min) -- fecha o cadastro
   com o uso real, sem duplicar o timer em outro lugar. */
(function(){
  let justLoggedIn=false;

  function record(event){
    try{
      const uidv=state?.session?.user?.id||state?.profile?.id;
      if(!uidv)return;
      const cid=state?.profile?.active_company_id||null;
      api('access_history',{method:'POST',body:JSON.stringify({
        user_id:uidv,company_id:cid,event,user_agent:String(navigator.userAgent||'').slice(0,300)
      })}).catch(()=>{});
    }catch(e){}
  }

  const baseAuth=window.auth;
  if(typeof baseAuth==='function'){
    window.auth=async function(path,body){
      const result=await baseAuth(path,body);
      try{
        const p=String(path||'');
        if(p.startsWith('token?grant_type=password'))justLoggedIn=true;
        else if(p==='logout')record('LOGOUT');
      }catch(e){}
      return result;
    };
  }

  async function applyIdleTimeout(){
    try{
      const cid=state?.profile?.active_company_id;
      if(!cid)return;
      const rows=await api(`companies?id=eq.${cid}&select=session_idle_timeout_minutes`).catch(()=>[]);
      const minutes=rows?.[0]?.session_idle_timeout_minutes;
      window.vxIdleTimeoutMs=(minutes&&minutes>0?minutes:30)*60*1000;
      if(typeof window.resetIdle==='function')window.resetIdle();
    }catch(e){}
  }

  const baseLoadProfile=window.loadProfile;
  if(typeof baseLoadProfile==='function'){
    window.loadProfile=async function(){
      const r=await baseLoadProfile.apply(this,arguments);
      if(justLoggedIn){justLoggedIn=false;record('LOGIN');}
      applyIdleTimeout();
      return r;
    };
  }
})();
