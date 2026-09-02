/* VoxAssist — Usuários / WhatsApp interno (Central de Conversas, Fase 6)
 * Achado do usuário em 2026-09-02 (mockup aprovado, artifact 42ebf5fb,
 * #screenUsers): reconhece que uma mensagem chegou do WhatsApp PESSOAL
 * de um colaborador pro número da empresa, e permite desviar essa
 * conversa do robô de triagem, roteando pro destino configurado na
 * ficha. O vínculo nasce de um clique numa conversa real (botão "🔗
 * Vincular usuário" no cabeçalho da thread, em chat-beta-v0828.js) --
 * aqui só a ficha (ativar reconhecimento/desvio, destino padrão,
 * desvincular). Nunca ativa nada automaticamente -- toda mudança de
 * comportamento exige confirmação explícita do gestor nesta tela.
 *
 * Aviso: bypass_bot fica gravado no banco mas ainda não é lido por
 * chat-inbound-webhook nesta entrega -- ver comentário no topo da
 * migration 20260902020000_chat_monitor_and_internal_whatsapp_schema.sql.
 *
 * Segue o mesmo padrão de sobrescrita encadeada de window.render já
 * usado no resto do app -- nunca substitui o router.
 */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const isGestor=()=>norm(state?.profile?.role)==='GESTOR';
  const DEST_TYPE_LABEL={ATENDENTE:'Atendente específico',LOJA:'Loja',SETOR:'Setor',LIVRE:'Texto livre'};

  let iw={loaded:false,profiles:[],links:[],stores:[],selectedUserId:null,auditByUser:{}};

  async function callRpc(name,params){return api(`rpc/${name}`,{method:'POST',body:JSON.stringify(params)})}

  async function loadAll(){
    const [profiles,links,stores]=await Promise.all([
      api('profiles?select=id,full_name,role,active,store_id,stores(name)&order=full_name').catch(()=>[]),
      api('chat_internal_whatsapp_links?select=*').catch(()=>[]),
      api('stores?select=id,name&active=eq.true&order=name').catch(()=>[]),
    ]);
    iw={loaded:true,profiles:profiles||[],links:links||[],stores:stores||[],selectedUserId:iw.selectedUserId,auditByUser:iw.auditByUser};
  }
  async function loadAuditFor(userId){
    if(iw.auditByUser[userId])return iw.auditByUser[userId];
    const rows=await api(`chat_internal_whatsapp_audit_events?user_id=eq.${userId}&select=*,changed_by_profile:profiles!chat_internal_whatsapp_audit_events_changed_by_fkey(full_name)&order=created_at.desc&limit=20`).catch(()=>[]);
    iw.auditByUser[userId]=rows||[];
    return iw.auditByUser[userId];
  }

  function backToConversas(){
    if(typeof window.render==='function'&&document.querySelector('[data-chat-beta-entry]')){
      document.querySelector('[data-chat-beta-entry]').click();
    }else if(typeof window.render==='function'){
      window.render('dashboard');
    }
  }
  function linkFor(userId){return iw.links.find(l=>String(l.user_id)===String(userId))||null}
  function identityStatusBadge(link){
    if(!link||link.identity_status!=='VINCULADO')return'<span class="vx-iw-badge vx-iw-badge-none">Não vinculado</span>';
    if(!link.raw_jid)return'<span class="vx-iw-badge vx-iw-badge-warn">LID pendente de vínculo</span>';
    return'<span class="vx-iw-badge vx-iw-badge-ok">Identidade WhatsApp vinculada</span>';
  }

  function userTable(){
    return `<div class="vx-iw-card">
      <h3>Usuários</h3>
      <table class="vx-iw-table"><thead><tr><th>Nome</th><th>Papel</th><th>Loja</th><th>WhatsApp interno</th></tr></thead>
      <tbody>${iw.profiles.length?iw.profiles.map(p=>`<tr data-user="${E(p.id)}" class="${String(iw.selectedUserId)===String(p.id)?'active':''}"><td><b>${E(p.full_name)}</b>${p.active?'':' <small>(inativo)</small>'}</td><td>${E(norm(p.role))}</td><td>${E(p.stores?.name||'—')}</td><td>${identityStatusBadge(linkFor(p.id))}</td></tr>`).join(''):'<tr><td colspan="4" class="vx-iw-empty">Nenhum usuário.</td></tr>'}</tbody></table>
    </div>`;
  }

  function fichaCard(){
    if(!iw.selectedUserId)return'';
    const p=iw.profiles.find(x=>String(x.id)===String(iw.selectedUserId));
    if(!p)return'';
    const link=linkFor(p.id);
    const linked=link&&link.identity_status==='VINCULADO';
    return `<div class="vx-iw-card">
      <h3>${E(p.full_name)}</h3>
      <div class="vx-iw-basic"><span>Papel: <b>${E(norm(p.role))}</b></span><span>Loja: <b>${E(p.stores?.name||'—')}</b></span><span>Status: <b>${p.active?'Ativo':'Inativo'}</b></span></div>
      <h4>WhatsApp interno</h4>
      ${!linked?`<p class="vx-iw-empty">Nenhuma identidade vinculada ainda -- use "🔗 Vincular usuário" no cabeçalho de uma conversa real na Central, quando essa pessoa escrever do WhatsApp pessoal dela pro número da empresa.</p>`:`
      <div class="vx-iw-basic">
        <span>Telefone: <b>${E(link.phone||'Identificação pendente')}</b></span>
        <span>Status: <b>${identityStatusBadge(link)}</b></span>
        <span>Validado em: <b>${link.validated_at?new Date(link.validated_at).toLocaleString('pt-BR'):'—'}</b></span>
      </div>
      <label class="vx-iw-toggle"><input type="checkbox" id="vxIwRecognized" ${link.recognized?'checked':''}> Reconhecimento como contato interno: ativo</label>
      <label class="vx-iw-toggle"><input type="checkbox" id="vxIwBypass" ${link.bypass_bot?'checked':''}> Desviar do robô de atendimento</label>
      <label>Destino padrão da mensagem<select id="vxIwDestType">${Object.entries(DEST_TYPE_LABEL).map(([k,l])=>`<option value="${k}" ${link.default_destination_type===k?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Valor do destino<input type="text" id="vxIwDestValue" value="${E(link.default_destination_value||'')}" placeholder="ex.: id do atendente, nome da loja, texto livre"></label>
      <div class="vx-iw-actions">
        <button type="button" class="vx-iw-save-btn" id="vxIwSave">Salvar ficha</button>
        <button type="button" class="vx-iw-unlink-btn" id="vxIwUnlink">Desvincular</button>
      </div>
      <h4>Histórico</h4>
      <table class="vx-iw-table" id="vxIwAuditTable"><thead><tr><th>Quando</th><th>Ação</th><th>Responsável</th></tr></thead><tbody><tr><td colspan="3" class="vx-iw-empty">Carregando…</td></tr></tbody></table>
      `}
    </div>`;
  }

  async function renderAudit(){
    const tbody=document.querySelector('#vxIwAuditTable tbody');
    if(!tbody||!iw.selectedUserId)return;
    const rows=await loadAuditFor(iw.selectedUserId);
    const actionLabel={VINCULADA:'Vinculada',FICHA_ATUALIZADA:'Ficha atualizada',DESVINCULADA:'Desvinculada'};
    tbody.innerHTML=rows.length?rows.map(a=>`<tr><td>${new Date(a.created_at).toLocaleString('pt-BR')}</td><td>${E(actionLabel[a.action]||a.action)}</td><td>${E(a.changed_by_profile?.full_name||'—')}</td></tr>`).join(''):'<tr><td colspan="3" class="vx-iw-empty">Nenhum evento ainda.</td></tr>';
  }

  function render(){
    const app=document.querySelector('#app');
    if(!app)return;
    if(!isGestor()){
      app.innerHTML=`<div class="vx-iw-wrap"><div class="vx-iw-card"><h3>Usuários</h3><p class="vx-iw-empty">Este recurso é restrito a usuários GESTOR.</p><button type="button" id="vxIwBack">← Voltar</button></div></div>`;
      document.getElementById('vxIwBack').onclick=backToConversas;
      return;
    }
    app.innerHTML=`<div class="vx-iw-wrap">
      <div class="vx-iw-head">
        <button type="button" id="vxIwBack" class="vx-iw-back">← Voltar</button>
        <div class="vx-iw-head-title"><h1>Usuários</h1><p>Ficha dos usuários e vínculo de WhatsApp interno.</p></div>
      </div>
      ${userTable()}
      ${fichaCard()}
    </div>`;
    document.getElementById('vxIwBack').onclick=backToConversas;
    document.querySelectorAll('[data-user]').forEach(tr=>tr.onclick=()=>{iw.selectedUserId=tr.dataset.user;render()});
    document.getElementById('vxIwSave')?.addEventListener('click',async()=>{
      const p=iw.profiles.find(x=>String(x.id)===String(iw.selectedUserId));
      try{
        await callRpc('update_internal_whatsapp_ficha',{
          p_user_id:iw.selectedUserId,
          p_recognized:document.getElementById('vxIwRecognized').checked,
          p_bypass_bot:document.getElementById('vxIwBypass').checked,
          p_default_destination_type:document.getElementById('vxIwDestType').value||null,
          p_default_destination_value:document.getElementById('vxIwDestValue').value.trim()||null,
        });
        toast?.(`Ficha de ${p?.full_name||'usuário'} salva.`);
        delete iw.auditByUser[iw.selectedUserId];
        await loadAll();render();
      }catch(err){toast?.('Não foi possível salvar a ficha: '+err.message,'err')}
    });
    document.getElementById('vxIwUnlink')?.addEventListener('click',async()=>{
      if(!confirm('Desvincular este WhatsApp interno? Reconhecimento e desvio do robô serão desligados junto.'))return;
      try{
        await callRpc('unlink_internal_whatsapp',{p_user_id:iw.selectedUserId});
        toast?.('Vínculo removido.');
        delete iw.auditByUser[iw.selectedUserId];
        await loadAll();render();
      }catch(err){toast?.('Não foi possível desvincular: '+err.message,'err')}
    });
    renderAudit();
  }

  async function renderInternalWhatsapp(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="card">Carregando Usuários...</div>';
    await loadAll();
    render();
  }
  window.renderChatInternalWhatsapp=renderInternalWhatsapp;

  const priorRender=window.render;
  window.render=async function(view){
    if(view==='chat-internal-whatsapp')return renderInternalWhatsapp();
    return priorRender(view);
  };
})();
