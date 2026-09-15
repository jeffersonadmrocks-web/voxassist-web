/* VoxAssist — Administração segura do robô Whirlpool.
   A senha é write-only: segue por TLS direto ao RPC protegido, nunca é relida,
   renderizada, persistida no navegador ou escrita em logs. */
(function(){
  const E=window.esc||((v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const companyId=()=>window.state?.profile?.active_company_id;
  const isGestor=()=>String(window.state?.profile?.role||'').toUpperCase()==='GESTOR';
  const labels={
    NAO_CONFIGURADO:'NÃO CONFIGURADO',PRONTO:'PRONTO PARA CONECTAR',
    CONECTADO:'CONECTADO',CREDENCIAIS_INVALIDAS:'CREDENCIAIS INVÁLIDAS',
    AGUARDANDO_CONEXAO_WHIRLPOOL:'AGUARDANDO WHIRLPOOL',PAUSADO:'PAUSADO'
  };
  const ok=s=>['PRONTO','CONECTADO'].includes(s);

  async function rpc(name,body){
    return api('rpc/'+name,{method:'POST',body:JSON.stringify(body)});
  }
  async function status(){
    const rows=await rpc('whirlpool_connection_admin_status',{p_company_id:companyId()});
    return Array.isArray(rows)?rows[0]:rows;
  }
  function fmt(v){return v?new Date(v).toLocaleString('pt-BR'):'Nunca';}

  async function inject(){
    if(window.state?.view!=='config-integracoes'||!isGestor())return;
    const card=document.querySelector('#vxIntegrationsCard');
    if(!card||card.querySelector('#vxIntWhirlpool'))return;
    const row=document.createElement('div');
    row.className='vx-int-row';row.id='vxIntWhirlpool';
    row.innerHTML='<div class="vx-int-label"><b>Whirlpool</b><small>Consultando o robô...</small></div><span class="vx-int-badge off">AGUARDE</span><button type="button" class="secondary">Administrar</button>';
    card.appendChild(row);
    row.querySelector('button').onclick=open;
    try{
      const s=await status();
      const st=s?.connection_status||'NAO_CONFIGURADO';
      row.querySelector('small').textContent=s?(s.worker_online?'Executor online':'Executor offline')+' · '+(s.pending_imports||0)+' importação(ões) pendente(s)':'Conexão não cadastrada';
      const badge=row.querySelector('.vx-int-badge');
      badge.textContent=labels[st]||st;badge.className='vx-int-badge '+(ok(st)?'ok':'off');
    }catch(e){row.querySelector('small').textContent='Não foi possível consultar a integração';}
  }

  async function open(){
    let s;
    try{s=await status();}catch(e){return alert('Não foi possível consultar a integração Whirlpool.');}
    if(!s)return alert('A conexão Whirlpool da empresa ainda não foi criada.');
    const overlay=document.createElement('div');overlay.className='vx-wp-overlay';
    overlay.innerHTML='<section class="vx-wp-modal" role="dialog" aria-modal="true">'+
      '<header><div><h3>INTEGRAÇÃO WHIRLPOOL</h3><small>Filial '+E(s.filial||'')+' · parceiro '+E(s.external_partner_id||'—')+'</small></div><button type="button" data-close aria-label="Fechar">×</button></header>'+
      '<div class="vx-wp-status"><span class="vx-int-badge '+(ok(s.connection_status)?'ok':'off')+'">'+E(labels[s.connection_status]||s.connection_status)+'</span><b>'+(s.worker_online?'Executor online':'Executor offline')+'</b></div>'+
      (s.connection_status==='CREDENCIAIS_INVALIDAS'?'<div class="vx-wp-warning">A senha foi rejeitada. O robô está pausado e não fará outra tentativa até um gestor salvar novas credenciais.</div>':'')+
      '<div class="vx-wp-grid"><div><small>Última autenticação</small><b>'+E(fmt(s.last_auth_at))+'</b></div><div><small>Último sinal do executor</small><b>'+E(fmt(s.worker_heartbeat_at))+'</b></div><div><small>Importações pendentes</small><b>'+E(s.pending_imports||0)+'</b></div><div><small>Aguardando conexão</small><b>'+E(s.waiting_connection_imports||0)+'</b></div></div>'+
      '<form id="vxWpCredentials" autocomplete="off"><h4>Atualizar credenciais</h4><label>Usuário Whirlpool<input name="username" maxlength="200" autocomplete="off" required></label><label>Nova senha<input name="password" type="password" maxlength="500" autocomplete="new-password" required></label><p>A senha atual nunca é exibida. Salvar cria uma nova versão e autoriza somente uma tentativa de login.</p><div class="vx-wp-actions"><button type="submit" class="primary">Salvar e liberar tentativa</button><button type="button" class="secondary" data-pause>'+(s.connection_status==='PAUSADO'?'Retomar robô':'Pausar robô')+'</button></div></form>'+
      '<div id="vxWpMessage" aria-live="polite"></div></section>';
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();overlay.querySelector('[data-close]').onclick=close;
    overlay.onclick=e=>{if(e.target===overlay)close()};
    const msg=overlay.querySelector('#vxWpMessage');
    overlay.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]');
      button.disabled=true;msg.textContent='Salvando com segurança...';
      const username=form.username.value.trim(),password=form.password.value;
      try{
        await rpc('whirlpool_save_credentials',{p_connection_id:s.id,p_username:username,p_password:password});
        form.password.value='';msg.className='ok';msg.textContent='Credenciais atualizadas. Uma nova tentativa foi liberada e a fila será retomada automaticamente.';
        setTimeout(()=>{close();refresh()},1800);
      }catch(err){
        form.password.value='';msg.className='error';msg.textContent=String(err?.message||err||'Falha ao salvar credenciais.');
      }finally{button.disabled=false}
    };
    overlay.querySelector('[data-pause]').onclick=async e=>{
      e.currentTarget.disabled=true;
      try{await rpc('whirlpool_set_paused',{p_connection_id:s.id,p_paused:s.connection_status!=='PAUSADO'});close();refresh();}
      catch(err){msg.className='error';msg.textContent=String(err?.message||err);}
      finally{e.currentTarget.disabled=false}
    };
  }
  function refresh(){document.querySelector('#vxIntWhirlpool')?.remove();setTimeout(inject,50)}
  window.addEventListener('vx:integrations-ready',inject);
  let timer;
  new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(inject,120)}).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
  const style=document.createElement('style');
  style.textContent='.vx-wp-overlay{position:fixed;inset:0;z-index:10050;background:#071b2f99;display:grid;place-items:center;padding:18px}.vx-wp-modal{width:min(680px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 24px 70px #071b2f55;padding:20px;color:#183247}.vx-wp-modal header{display:flex;justify-content:space-between;align-items:start;border-bottom:1px solid #e5edf3;padding-bottom:12px}.vx-wp-modal h3,.vx-wp-modal h4{margin:0}.vx-wp-modal header button{border:0;background:none;font-size:25px}.vx-wp-status{display:flex;align-items:center;gap:12px;padding:15px 0}.vx-wp-warning{background:#fff4e5;color:#8b4b00;border:1px solid #ffd39a;border-radius:8px;padding:10px;margin-bottom:12px}.vx-wp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.vx-wp-grid div{background:#f5f8fb;border-radius:8px;padding:10px;display:flex;flex-direction:column}.vx-wp-modal form{margin-top:16px;border-top:1px solid #e5edf3;padding-top:14px}.vx-wp-modal label{display:flex;flex-direction:column;gap:5px;margin-top:10px;font-size:12px;font-weight:700}.vx-wp-modal input{padding:10px;border:1px solid #cbd8e2;border-radius:7px}.vx-wp-modal form p{font-size:11px;color:#687987}.vx-wp-actions{display:flex;gap:8px;flex-wrap:wrap}.vx-wp-actions button{padding:9px 12px}.vx-wp-modal #vxWpMessage{margin-top:12px;font-weight:700}.vx-wp-modal #vxWpMessage.ok{color:#18733a}.vx-wp-modal #vxWpMessage.error{color:#b42318}@media(max-width:600px){.vx-wp-grid{grid-template-columns:1fr}}';
  document.head.appendChild(style);
})();