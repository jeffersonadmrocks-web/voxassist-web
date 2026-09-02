/* VoxAssist — Heartbeat de presença (achado do usuário em 2026-09-02:
   Monitor de atividades precisava de indicador online/offline por
   atendente, e não existia nenhum mecanismo de presença no sistema).
   Não edita nenhum arquivo existente. Grava/atualiza a própria linha
   em user_presence a cada 30s, enquanto a aba estiver visível ou logo
   que voltar a ficar visível -- nunca escreve a presença de outro
   usuário (RLS já trava isso, mas o código também nunca tenta). */
(function(){
  const HEARTBEAT_MS=30000;
  let timer=null;
  async function ping(){
    try{
      const uid=window.state?.session?.user?.id;
      const cid=window.state?.profile?.active_company_id;
      if(!uid||!cid||typeof window.api!=='function')return;
      // logged_out_at:null -- achado do usuário em 2026-09-02: qualquer
      // atividade nova precisa voltar pra ONLINE imediatamente, mesmo
      // que a sessão tenha um logout explícito anterior registrado
      // (ver user-logoff-v0813.js) -- sem isso, um login novo ficaria
      // preso em OFFLINE até o campo antigo "vencer" sozinho.
      await window.api('user_presence',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:uid,company_id:cid,last_seen_at:new Date().toISOString(),logged_out_at:null})});
    }catch(_e){/* heartbeat nunca pode travar nada da tela -- silencioso */}
  }
  function start(){
    if(timer)return;
    ping();
    timer=setInterval(ping,HEARTBEAT_MS);
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')ping()});
  start();
})();
