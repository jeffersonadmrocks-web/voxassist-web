/* VoxAssist Web V0.9.08 — Configurações > Sistema & Segurança > Logs
   técnicos. Matriz Mestra, Área 09 -- CRIAR confirmado: nenhuma
   captura de erro de JS existia (grep completo, zero window.onerror/
   unhandledrejection no repo antes desta migration).
   Captura só erro de FRONTEND não tratado (mensagem+stack+URL),
   grava com o usuário logado (insert-only, migration 20260908170000),
   visível só pro gestor em settings-security-v0908.js. Limite de 20
   registros por carregamento de página (evita loop de erro
   alimentando erro), nunca lança exceção própria (try/catch mudo em
   volta do envio). Não altera nenhum fluxo existente -- só observa. */
(function(){
  let count=0;
  const MAX=20;

  function send(message, stack, url){
    if(count>=MAX)return;
    const cid=state?.profile?.active_company_id;
    if(!cid)return;
    count++;
    try{
      api('technical_logs',{method:'POST',body:JSON.stringify({
        company_id:cid,
        user_id:state?.profile?.id||state?.session?.user?.id||null,
        message:String(message||'').slice(0,500),
        stack:String(stack||'').slice(0,4000),
        source_url:String(url||location.href).slice(0,500)
      })}).catch(()=>{});
    }catch(e){}
  }

  window.addEventListener('error',e=>{
    send(e.message, e.error?.stack, e.filename);
  });
  window.addEventListener('unhandledrejection',e=>{
    const reason=e.reason;
    send('unhandledrejection: '+(reason?.message||String(reason)), reason?.stack, location.href);
  });
})();
