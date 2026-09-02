/* VoxAssist — Robô de Atendimento (Fase 6)
 * Tela de configuração do fluxo de triagem/roteamento inicial do Chat
 * (schema/execução das Fases 1-5). Só GESTOR edita -- reforçado por RLS
 * nas tabelas chat_bot_flow_* (Fase 1), não só escondido aqui.
 *
 * Modelo: um RASCUNHO por empresa, livremente editável (cada campo
 * salva direto via REST, sem passo de "salvar tudo" -- espelha o botão
 * "Salvar" do protótipo como uma confirmação, não um requisito real).
 * Publicar (RPC publish_chat_bot_flow) congela o conteúdo pra sempre;
 * pra mudar depois, "Restaurar" (RPC restore_chat_bot_flow_version)
 * cria um rascunho novo a partir de qualquer versão do histórico.
 *
 * Segue o mesmo padrão de sobrescrita encadeada de window.render já
 * usado no resto do app -- nunca substitui o router.
 */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const isGestor=()=>norm(state?.profile?.role)==='GESTOR';
  const myUserId=()=>state?.session?.user?.id||null;

  const ANSWER_TYPE_LABEL={CHOICE:'Escolha entre opções',FREE_TEXT:'Texto livre'};
  const ROUTING_DIM_LABEL={STORE:'Loja',WARRANTY:'Garantia',BRAND:'Marca','':'Nenhuma (só informativo)'};
  const WARRANTY_DEFAULTS=['FORA DE GARANTIA','GARANTIA','SEGURADORA','REINGRESSO','OUTROS'];

  let bf={loaded:false,versions:[],draft:null,published:null,steps:[],conditions:[],rules:[],stores:[],profiles:[],auditEvents:[],queues:[],queueMembers:[]};

  async function callRpc(name,params){return api(`rpc/${name}`,{method:'POST',body:JSON.stringify(params)})}

  async function loadAll(){
    const [versions,stores,profiles,auditEvents,queues,queueMembers]=await Promise.all([
      api('chat_bot_flow_versions?select=*&order=created_at.desc').catch(()=>[]),
      api('stores?select=id,name&active=eq.true&order=name').catch(()=>[]),
      api('profiles?select=id,full_name,role&active=eq.true&order=full_name').catch(()=>[]),
      api('chat_bot_flow_audit_events?select=*,changed_by_profile:profiles!chat_bot_flow_audit_events_changed_by_fkey(full_name)&order=created_at.desc&limit=100').catch(()=>[]),
      // Achado do usuário em 2026-09-02 (pacote fila/robô/presença):
      // destino das regras deixou de ser um atendente individual e
      // virou uma fila de atendimento (chat_queues) -- integrantes
      // trocam livremente (chat_queue_members) sem republicar o robô.
      api('chat_queues?select=*&order=name').catch(()=>[]),
      api('chat_queue_members?select=queue_id,user_id,profiles(full_name)').catch(()=>[]),
    ]);
    const draft=(versions||[]).find(v=>v.status==='RASCUNHO')||null;
    const published=(versions||[]).find(v=>v.status==='PUBLICADA')||null;
    const editing=draft||published; // sem rascunho, mostra a publicada em modo leitura
    let steps=[],conditions=[],rules=[];
    if(editing){
      const [stepsRaw,rulesRaw]=await Promise.all([
        api(`chat_bot_flow_steps?flow_version_id=eq.${editing.id}&select=*&order=step_order.asc`).catch(()=>[]),
        api(`chat_bot_routing_rules?flow_version_id=eq.${editing.id}&select=*,target:chat_queues!chat_bot_routing_rules_target_queue_id_fkey(name),store:stores(name)&order=specificity.desc`).catch(()=>[]),
      ]);
      steps=stepsRaw||[];
      const stepIds=steps.map(s=>s.id);
      conditions=stepIds.length?await api(`chat_bot_flow_step_conditions?step_id=in.(${stepIds.join(',')})&select=*`).catch(()=>[]):[];
      rules=rulesRaw||[];
    }
    bf={loaded:true,versions:versions||[],draft,published,steps,conditions,rules,stores:stores||[],profiles:profiles||[],auditEvents:auditEvents||[],queues:queues||[],queueMembers:queueMembers||[]};
  }

  // ---------- CRUD de filas de atendimento ----------
  function membersOfQueue(queueId){return bf.queueMembers.filter(m=>String(m.queue_id)===String(queueId))}
  async function createQueue(name){
    const trimmed=String(name||'').trim();
    if(!trimmed){toast?.('Dê um nome pra fila (ex.: Garantia Vitória).','err');return}
    try{
      await api('chat_queues',{method:'POST',body:JSON.stringify({company_id:state.profile.active_company_id,name:trimmed})});
      toast?.('Fila criada.');
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível criar a fila: '+err.message,'err')}
  }
  async function removeQueue(id){
    const inUse=bf.rules.some(r=>String(r.target_queue_id)===String(id));
    if(inUse){toast?.('Esta fila está em uso por uma regra de roteamento -- remova a regra antes.','err');return}
    if(!confirm('Remover esta fila? Os integrantes perdem o acesso às conversas dela.'))return;
    try{
      await api(`chat_queues?id=eq.${id}`,{method:'DELETE'});
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível remover a fila: '+err.message,'err')}
  }
  async function toggleQueueMember(queueId,userId,shouldBeMember){
    try{
      if(shouldBeMember){
        await api('chat_queue_members',{method:'POST',body:JSON.stringify({queue_id:queueId,user_id:userId})});
      }else{
        await api(`chat_queue_members?queue_id=eq.${queueId}&user_id=eq.${userId}`,{method:'DELETE'});
      }
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível atualizar a fila: '+err.message,'err')}
  }

  function backToConversas(){
    if(typeof window.render==='function'&&document.querySelector('[data-chat-beta-entry]')){
      document.querySelector('[data-chat-beta-entry]').click();
    }else if(typeof window.render==='function'){
      window.render('dashboard');
    }
  }

  // ---------- ações de rascunho/versão ----------
  async function handleCreateBlankDraft(){
    try{
      await api('chat_bot_flow_versions',{method:'POST',body:JSON.stringify({company_id:state.profile.active_company_id,status:'RASCUNHO',created_by:myUserId()})});
      toast?.('Rascunho criado.');
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível criar o rascunho: '+err.message,'err')}
  }
  async function handleRestore(sourceId){
    if(bf.draft){toast?.('Já existe um rascunho em andamento -- publique ou apague as perguntas dele antes de restaurar outra versão.','err');return}
    try{
      await callRpc('restore_chat_bot_flow_version',{p_source_version_id:sourceId,p_reason:null});
      toast?.('Rascunho criado a partir da versão selecionada.');
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível restaurar: '+err.message,'err')}
  }
  async function handlePublish(){
    if(!bf.draft)return;
    if(!bf.steps.some(s=>s.active)){toast?.('Adicione pelo menos uma pergunta de triagem ativa antes de publicar.','err');return}
    if(!confirm('Publicar este fluxo? A versão atual (se houver) será arquivada, e o conteúdo publicado não poderá mais ser editado -- pra mudar depois, será preciso restaurar um novo rascunho.'))return;
    try{
      await callRpc('publish_chat_bot_flow',{p_flow_version_id:bf.draft.id,p_reason:null});
      toast?.('Robô de Atendimento publicado.');
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível publicar: '+err.message,'err')}
  }

  // ---------- edição de campos do rascunho ----------
  async function patchDraft(fields){
    if(!bf.draft)return;
    try{
      await api(`chat_bot_flow_versions?id=eq.${bf.draft.id}`,{method:'PATCH',body:JSON.stringify(fields)});
      Object.assign(bf.draft,fields);
    }catch(err){toast?.('Não foi possível salvar: '+err.message,'err')}
  }

  // ---------- CRUD de steps ----------
  function nextStepKey(){
    let n=bf.steps.length+1;
    while(bf.steps.some(s=>s.step_key===`pergunta_${n}`))n++;
    return `pergunta_${n}`;
  }
  async function addStep(){
    if(!bf.draft)return;
    const maxOrder=bf.steps.reduce((m,s)=>Math.max(m,s.step_order||0),0);
    try{
      await api('chat_bot_flow_steps',{method:'POST',body:JSON.stringify({
        flow_version_id:bf.draft.id,step_key:nextStepKey(),step_order:maxOrder+1,
        question_text:'Nova pergunta',answer_type:'FREE_TEXT',options:[],routing_dimension:null,active:true,
      })});
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível adicionar a pergunta: '+err.message,'err')}
  }
  async function updateStep(id,fields){
    try{
      await api(`chat_bot_flow_steps?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(fields)});
      const s=bf.steps.find(x=>x.id===id);if(s)Object.assign(s,fields);
    }catch(err){toast?.('Não foi possível salvar a pergunta: '+err.message,'err');await loadAll();renderScreen()}
  }
  async function removeStep(id){
    if(!confirm('Remover esta pergunta? Qualquer condição que dependa dela também será removida.'))return;
    try{
      await api(`chat_bot_flow_steps?id=eq.${id}`,{method:'DELETE'});
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível remover: '+err.message,'err')}
  }
  async function moveStep(id,dir){
    const sorted=[...bf.steps].sort((a,b)=>a.step_order-b.step_order);
    const idx=sorted.findIndex(s=>s.id===id);
    const swapIdx=idx+dir;
    if(swapIdx<0||swapIdx>=sorted.length)return;
    const a=sorted[idx],b=sorted[swapIdx];
    try{
      await Promise.all([
        api(`chat_bot_flow_steps?id=eq.${a.id}`,{method:'PATCH',body:JSON.stringify({step_order:b.step_order})}),
        api(`chat_bot_flow_steps?id=eq.${b.id}`,{method:'PATCH',body:JSON.stringify({step_order:a.step_order})}),
      ]);
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível reordenar: '+err.message,'err')}
  }
  async function setStoreOptionsForStep(step){
    const options=bf.stores.map(s=>({value:s.id,label:s.name}));
    await updateStep(step.id,{options});
  }
  async function seedWarrantyOptions(step){
    const options=WARRANTY_DEFAULTS.map(v=>({value:v,label:v}));
    await updateStep(step.id,{options});
    await loadAll();renderScreen();
  }
  async function setStepCondition(stepId,dependsOnStepId,value){
    try{
      await api(`chat_bot_flow_step_conditions?step_id=eq.${stepId}`,{method:'DELETE'});
      if(dependsOnStepId&&value){
        await api('chat_bot_flow_step_conditions',{method:'POST',body:JSON.stringify({step_id:stepId,depends_on_step_id:dependsOnStepId,depends_on_value:value})});
      }
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível salvar a condição: '+err.message,'err')}
  }

  // ---------- CRUD de regras de roteamento ----------
  async function addRule(e){
    e.preventDefault();
    if(!bf.draft)return;
    const f=new FormData(e.target);
    const storeId=String(f.get('storeId')||'')||null;
    const warrantyValue=String(f.get('warrantyValue')||'').trim()||null;
    const brandValue=String(f.get('brandValue')||'').trim()||null;
    const targetQueueId=String(f.get('targetQueueId')||'');
    if(!targetQueueId){toast?.('Escolha a fila de destino.','err');return}
    if(!storeId&&!warrantyValue&&!brandValue){toast?.('Escolha pelo menos uma dimensão (loja, garantia ou marca) -- uma regra sem nenhuma seria igual ao atendente padrão.','err');return}
    try{
      await api('chat_bot_routing_rules',{method:'POST',body:JSON.stringify({flow_version_id:bf.draft.id,store_id:storeId,warranty_value:warrantyValue,brand_value:brandValue,target_queue_id:targetQueueId})});
      e.target.reset();
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível criar a regra: '+err.message,'err')}
  }
  async function removeRule(id){
    if(!confirm('Remover esta regra de roteamento?'))return;
    try{
      await api(`chat_bot_routing_rules?id=eq.${id}`,{method:'DELETE'});
      await loadAll();renderScreen();
    }catch(err){toast?.('Não foi possível remover: '+err.message,'err')}
  }

  // ---------- testador de combinação (espelha matchRoutingRules de chatBotFlow.ts) ----------
  function normVal(v){const t=String(v||'').trim().toUpperCase();return t===''?null:t}
  function testRoutingCombo(storeId,warranty,brand){
    const wNorm=normVal(warranty),bNorm=normVal(brand);
    const matching=bf.rules.filter(r=>{
      if(r.store_id&&r.store_id!==storeId)return false;
      if(r.warranty_value&&normVal(r.warranty_value)!==wNorm)return false;
      if(r.brand_value&&normVal(r.brand_value)!==bNorm)return false;
      return true;
    });
    if(!matching.length)return null;
    return [...matching].sort((a,b)=>b.specificity-a.specificity)[0];
  }

  // ---------- render ----------
  function welcomeCard(){
    const readOnly=!bf.draft;
    return `<div class="vx-bf-card">
      <h3>Mensagem de boas-vindas</h3>
      <p class="vx-bf-sub">Enviada automaticamente assim que uma conversa nova chega (ou reabre depois de fora do horário), antes de qualquer atendente assumir.</p>
      <textarea id="vxBfWelcome" class="vx-bf-textarea" maxlength="400" ${readOnly?'disabled':''}>${E(bf.draft?.welcome_message??bf.published?.welcome_message??'')}</textarea>
      ${readOnly?'':'<button type="button" class="vx-bf-save-btn" id="vxBfWelcomeSave">Salvar mensagem</button>'}
    </div>`;
  }

  function stepConditionSelectHtml(step,availableSteps){
    const existing=bf.conditions.find(c=>c.step_id===step.id);
    return `<div class="vx-bf-step-condition">
      <label>Depende de <select data-cond-depends="${E(step.id)}"><option value="">Sempre (sem condição)</option>${availableSteps.filter(s=>s.id!==step.id).map(s=>`<option value="${E(s.id)}" ${existing?.depends_on_step_id===s.id?'selected':''}>${E(s.question_text)}</option>`).join('')}</select></label>
      <label>Valor esperado<input type="text" data-cond-value="${E(step.id)}" value="${E(existing?.depends_on_value||'')}" placeholder="ex.: GARANTIA" ${existing?'':'hidden'}></label>
    </div>`;
  }

  function stepRowHtml(step,idx,total){
    const isChoice=step.answer_type==='CHOICE';
    const isStoreDim=step.routing_dimension==='STORE';
    const options=Array.isArray(step.options)?step.options:[];
    return `<div class="vx-bf-step-row" data-step="${E(step.id)}">
      <div class="vx-bf-step-head">
        <span class="vx-bf-step-order">#${idx+1}</span>
        <input type="text" class="vx-bf-step-question" data-field="question_text" value="${E(step.question_text)}" placeholder="Texto da pergunta">
        <div class="vx-bf-step-actions">
          <button type="button" data-move="-1" ${idx===0?'disabled':''} title="Mover pra cima">↑</button>
          <button type="button" data-move="1" ${idx===total-1?'disabled':''} title="Mover pra baixo">↓</button>
          <label class="vx-bf-step-active"><input type="checkbox" data-field="active" ${step.active?'checked':''}> Ativa</label>
          <button type="button" class="vx-bf-step-remove" data-remove-step title="Remover pergunta">✕</button>
        </div>
      </div>
      <div class="vx-bf-step-fields">
        <label>Tipo de resposta<select data-field="answer_type">${Object.entries(ANSWER_TYPE_LABEL).map(([v,l])=>`<option value="${v}" ${step.answer_type===v?'selected':''}>${l}</option>`).join('')}</select></label>
        <label>Alimenta roteamento por<select data-field="routing_dimension"><option value="">${ROUTING_DIM_LABEL['']}</option><option value="STORE" ${step.routing_dimension==='STORE'?'selected':''}>Loja</option><option value="WARRANTY" ${step.routing_dimension==='WARRANTY'?'selected':''}>Garantia</option><option value="BRAND" ${step.routing_dimension==='BRAND'?'selected':''}>Marca</option></select></label>
      </div>
      ${isChoice?`<div class="vx-bf-step-options">
        <div class="vx-bf-step-options-label">Opções de resposta ${isStoreDim?'<small>(preenchidas automaticamente com as lojas ativas)</small>':''}</div>
        ${isStoreDim?`<button type="button" data-sync-store-options>🔄 Sincronizar com as lojas ativas</button>`:`
        <div class="vx-bf-options-list">${options.map((o,i)=>`<div class="vx-bf-option-row"><input type="text" data-opt-idx="${i}" data-opt-field="label" value="${E(o.label||'')}" placeholder="Rótulo (o que o cliente digita)"><button type="button" data-opt-remove="${i}">✕</button></div>`).join('')}</div>
        <button type="button" data-add-option>+ opção</button>
        ${step.routing_dimension==='WARRANTY'?'<button type="button" data-seed-warranty>Usar valores padrão de garantia</button>':''}`}
      </div>`:''}
      ${stepConditionSelectHtml(step,bf.steps)}
    </div>`;
  }

  function stepsCard(){
    if(!bf.draft)return`<div class="vx-bf-card"><h3>Perguntas de triagem</h3><p class="vx-bf-sub">${bf.published?'Fluxo publicado -- crie um rascunho pra editar as perguntas.':'Crie um rascunho pra configurar as perguntas de triagem.'}</p></div>`;
    const sorted=[...bf.steps].sort((a,b)=>a.step_order-b.step_order);
    return `<div class="vx-bf-card">
      <h3>Perguntas de triagem</h3>
      <p class="vx-bf-sub">Define o que o robô pergunta pra decidir quem recebe a conversa. Reordene, desative uma pergunta ou edite o texto. "Depende de" ramifica a pergunta (só aparece se a resposta anterior bater) -- ex.: pedir nota fiscal só quando Garantia = GARANTIA.</p>
      <div id="vxBfStepsList">${sorted.length?sorted.map((s,i)=>stepRowHtml(s,i,sorted.length)).join(''):'<p class="vx-bf-empty">Nenhuma pergunta ainda.</p>'}</div>
      <button type="button" class="vx-bf-add-btn" id="vxBfAddStep">+ Nova pergunta</button>
    </div>`;
  }

  function generalSettingsCard(){
    const readOnly=!bf.draft;
    const v=bf.draft||bf.published||{};
    return `<div class="vx-bf-card">
      <h3>Configurações gerais</h3>
      <p class="vx-bf-sub">Comportamento do robô fora das perguntas de triagem em si.</p>
      <label class="vx-bf-toggle"><input type="checkbox" id="vxBfAlwaysHuman" ${v.always_human_toggle?'checked':''} ${readOnly?'disabled':''}> Permitir "falar com atendente" em qualquer etapa</label>
      <label>Mensagem para resposta inválida<input type="text" id="vxBfInvalidMsg" maxlength="140" value="${E(v.invalid_message||'')}" ${readOnly?'disabled':''}></label>
      <label>Limite de tentativas antes de encaminhar<input type="number" id="vxBfRetryLimit" min="1" max="10" value="${E(v.retry_limit||3)}" ${readOnly?'disabled':''}></label>
      <label class="vx-bf-toggle"><input type="checkbox" id="vxBfLookup" ${v.lookup_toggle?'checked':''} ${readOnly?'disabled':''}> Buscar cliente/conversa/OS existente pelo telefone antes de perguntar</label>
      <label>Atendente padrão (quando nenhuma regra combina)<select id="vxBfDefaultAttendant" ${readOnly?'disabled':''}><option value="">Nenhum -- fica sem atribuição</option>${bf.profiles.filter(p=>['GESTOR','ATENDENTE'].includes(norm(p.role))).map(p=>`<option value="${E(p.id)}" ${String(v.default_attendant_id)===String(p.id)?'selected':''}>${E(p.full_name)}</option>`).join('')}</select></label>
      <label class="vx-bf-toggle"><input type="checkbox" id="vxBfAfterHoursToggle" ${v.after_hours_toggle?'checked':''} ${readOnly?'disabled':''}> Mensagem diferente fora do horário de atendimento</label>
      <label>Horário de atendimento (só texto informativo)<input type="text" id="vxBfBusinessHoursText" value="${E(v.business_hours_text||'')}" ${readOnly?'disabled':''}></label>
      <label>Mensagem fora do horário<input type="text" id="vxBfAfterHoursMsg" maxlength="160" value="${E(v.after_hours_message||'')}" ${readOnly?'disabled':''}></label>
      ${readOnly?'':'<button type="button" class="vx-bf-save-btn" id="vxBfGeneralSave">Salvar configurações</button>'}
    </div>`;
  }

  function versionsCard(){
    return `<div class="vx-bf-card">
      <h3>Versões do fluxo</h3>
      <p class="vx-bf-sub">Rascunho é livremente editável. Publicar congela o conteúdo pra sempre -- pra mudar depois, restaure uma versão do histórico (cria um rascunho novo a partir dela).</p>
      <div class="vx-bf-version-status">
        <span>Versão publicada: <b>${bf.published?`publicada em ${new Date(bf.published.published_at||bf.published.created_at).toLocaleString('pt-BR')}`:'Nenhuma'}</b></span>
        ${bf.draft?`<button type="button" class="primary" id="vxBfPublish">Publicar versão</button>`:bf.published?`<button type="button" id="vxBfCreateDraftFromPublished">Editar (criar rascunho)</button>`:`<button type="button" class="primary" id="vxBfCreateBlank">Criar robô de atendimento</button>`}
      </div>
      <div class="vx-bf-version-history">
        <div class="vx-bf-version-history-label">Histórico</div>
        <table class="vx-bf-table"><thead><tr><th>Status</th><th>Criada</th><th>Publicada</th><th></th></tr></thead>
        <tbody>${bf.versions.length?bf.versions.map(v=>`<tr><td>${E(v.status)}</td><td>${new Date(v.created_at).toLocaleString('pt-BR')}</td><td>${v.published_at?new Date(v.published_at).toLocaleString('pt-BR'):'—'}</td><td>${v.status!=='RASCUNHO'?`<button type="button" data-restore="${E(v.id)}">Restaurar</button>`:''}</td></tr>`).join(''):'<tr><td colspan="4" class="vx-bf-empty">Nenhuma versão ainda.</td></tr>'}</tbody></table>
      </div>
      <div class="vx-bf-version-history-label">Auditoria</div>
      <table class="vx-bf-table"><thead><tr><th>Quando</th><th>Ação</th><th>Responsável</th></tr></thead>
      <tbody>${bf.auditEvents.length?bf.auditEvents.slice(0,15).map(a=>`<tr><td>${new Date(a.created_at).toLocaleString('pt-BR')}</td><td>${E({CRIADA:'Criada',PUBLICADA:'Publicada',RESTAURADA:'Restaurada'}[a.action]||a.action)}</td><td>${E(a.changed_by_profile?.full_name||'—')}</td></tr>`).join(''):'<tr><td colspan="3" class="vx-bf-empty">Nenhum evento ainda.</td></tr>'}</tbody></table>
    </div>`;
  }

  // Achado do usuário em 2026-09-02: "Filas/Equipes separadas do fluxo
  // do robô, permitindo trocar integrantes sem republicar o robô" --
  // gerenciada aqui, fora do rascunho/publicação (uma fila existe
  // independente de qual versão do robô está ativa).
  function queuesCard(){
    const attendants=bf.profiles.filter(p=>['GESTOR','ATENDENTE'].includes(norm(p.role)));
    return `<div class="vx-bf-card">
      <h3>Filas de atendimento</h3>
      <p class="vx-bf-sub">Equipes nomeadas (ex.: "Garantia Vitória") que recebem conversas roteadas pelo robô. Qualquer integrante autorizado vê e pode assumir uma conversa da fila enquanto ninguém mais assumiu -- trocar integrantes aqui não exige publicar o robô de novo.</p>
      <form id="vxBfQueueForm" class="vx-bf-rule-form">
        <input type="text" name="name" placeholder="Nome da fila (ex.: Garantia Vitória)" required>
        <button type="submit" class="primary">+ Nova fila</button>
      </form>
      <div class="vx-bf-queue-list">${bf.queues.length?bf.queues.map(q=>{
        const members=membersOfQueue(q.id);
        const memberIds=new Set(members.map(m=>String(m.user_id)));
        return `<div class="vx-bf-queue-row" data-queue="${E(q.id)}">
          <div class="vx-bf-queue-head"><b>${E(q.name)}</b><span class="vx-bf-specificity-badge">${members.length} integrante${members.length===1?'':'s'}</span><button type="button" data-remove-queue="${E(q.id)}" title="Remover fila">✕</button></div>
          <div class="vx-bf-queue-members">${attendants.map(p=>`<label class="vx-bf-toggle"><input type="checkbox" data-queue-member="${E(q.id)}" data-user="${E(p.id)}" ${memberIds.has(String(p.id))?'checked':''}> ${E(p.full_name)}</label>`).join('')||'<small>Nenhum GESTOR/ATENDENTE cadastrado.</small>'}</div>
        </div>`;
      }).join(''):'<p class="vx-bf-empty">Nenhuma fila criada ainda.</p>'}</div>
    </div>`;
  }

  function routingRulesCard(){
    if(!bf.draft&&!bf.published)return'';
    return `<div class="vx-bf-card">
      <h3>Regras de roteamento</h3>
      <p class="vx-bf-sub">Combina loja + garantia + marca pra decidir automaticamente qual FILA recebe a conversa -- qualquer integrante autorizado da fila pode assumir. Prioridade AUTOMÁTICA por especificidade -- a regra com mais dimensões preenchidas sempre vence, sem precisar reordenar nada.</p>
      <table class="vx-bf-table"><thead><tr><th>Loja</th><th>Garantia</th><th>Marca</th><th>Especificidade</th><th>Fila</th>${bf.draft?'<th></th>':''}</tr></thead>
      <tbody>${bf.rules.length?bf.rules.map(r=>`<tr><td>${E(r.store?.name||'Qualquer')}</td><td>${E(r.warranty_value||'Qualquer')}</td><td>${E(r.brand_value||'Qualquer')}</td><td><span class="vx-bf-specificity-badge">${r.specificity}</span></td><td>${E(r.target?.name||'—')}</td>${bf.draft?`<td><button type="button" data-remove-rule="${E(r.id)}">✕</button></td>`:''}</tr>`).join(''):`<tr><td colspan="${bf.draft?6:5}" class="vx-bf-empty">Nenhuma regra ainda.</td></tr>`}</tbody></table>
      ${bf.draft?(bf.queues.length?`<form id="vxBfRuleForm" class="vx-bf-rule-form">
        <select name="storeId"><option value="">Qualquer loja</option>${bf.stores.map(s=>`<option value="${E(s.id)}">${E(s.name)}</option>`).join('')}</select>
        <input type="text" name="warrantyValue" placeholder="Garantia (ex.: GARANTIA) -- vazio = qualquer" list="vxBfWarrantyOptions">
        <datalist id="vxBfWarrantyOptions">${WARRANTY_DEFAULTS.map(v=>`<option value="${v}">`).join('')}</datalist>
        <input type="text" name="brandValue" placeholder="Marca -- vazio = qualquer">
        <select name="targetQueueId" required><option value="">Fila de destino…</option>${bf.queues.map(q=>`<option value="${E(q.id)}">${E(q.name)}</option>`).join('')}</select>
        <button type="submit" class="primary">+ Nova regra</button>
      </form>`:`<p class="vx-bf-empty">Crie ao menos uma fila de atendimento (acima) antes de adicionar uma regra.</p>`):''}
      <div class="vx-bf-tester">
        <div class="vx-bf-version-history-label">Testar uma combinação</div>
        <select id="vxBfTestStore"><option value="">Loja…</option>${bf.stores.map(s=>`<option value="${E(s.id)}">${E(s.name)}</option>`).join('')}</select>
        <input type="text" id="vxBfTestWarranty" placeholder="Garantia" list="vxBfWarrantyOptions2">
        <datalist id="vxBfWarrantyOptions2">${WARRANTY_DEFAULTS.map(v=>`<option value="${v}">`).join('')}</datalist>
        <input type="text" id="vxBfTestBrand" placeholder="Marca">
        <button type="button" id="vxBfTestRun">Testar</button>
        <div class="vx-bf-tester-result" id="vxBfTestResult"></div>
      </div>
    </div>`;
  }

  /* ---------- simulador interativo (achado do usuário em 2026-09-02,
     mockup aprovado artifact 42ebf5fb, linhas 2214-2272): faltava a
     casca conversacional por cima do que já existia -- as perguntas
     reais (bf.steps/bf.conditions), as regras reais (testRoutingCombo,
     já usado pelo "Testar uma combinação" acima) e o atendente padrão
     real. isStepEligibleSim/nextEligibleStepSim espelham
     isStepEligible/resolveNextEligibleStep de
     supabase/functions/_shared/chatBotFlow.ts:48-60,70-81 -- mesma
     regra de elegibilidade (ativa + ainda não respondida + condição
     bate por normVal, igual normalizeAnswerValue), só client-side pra
     não precisar de round-trip nenhum durante a simulação. Nenhuma
     lógica de roteamento nova -- o resultado final chama o mesmo
     testRoutingCombo de cima. */
  let simState={answers:{},history:[],humanEscape:false};
  function activeSortedSteps(){return[...bf.steps].filter(s=>s.active).sort((a,b)=>a.step_order-b.step_order)}
  function isStepEligibleSim(step,answers){
    if(Object.prototype.hasOwnProperty.call(answers,step.step_key))return false;
    const condition=bf.conditions.find(c=>c.step_id===step.id);
    if(!condition)return true;
    const dependsOnStep=bf.steps.find(s=>s.id===condition.depends_on_step_id);
    if(!dependsOnStep)return false;
    return normVal(answers[dependsOnStep.step_key])===normVal(condition.depends_on_value);
  }
  function nextEligibleStepSim(answers){return activeSortedSteps().find(s=>isStepEligibleSim(s,answers))||null}
  function resetSimulation(){simState={answers:{},history:[],humanEscape:false};renderSimulator()}
  function simCurrentStep(){return simState.humanEscape?null:nextEligibleStepSim(simState.answers)}
  function simAnswer(value,label){
    const cur=simCurrentStep();
    if(!cur)return;
    simState.answers[cur.step_key]=value;
    simState.history.push({question:cur.question_text,answerLabel:label});
    renderSimulator();
  }
  function renderSimulator(){
    const box=document.getElementById('vxBfSimThread');
    if(!box)return;
    const steps=activeSortedSteps();
    if(!steps.length){box.innerHTML='<p class="vx-bf-empty">Nenhuma pergunta ativa -- a conversa vai direto pro destino padrão.</p>';return}
    const v=bf.draft||bf.published||{};
    let html=simState.history.map(h=>`<div class="vx-bf-sim-row bot"><div class="vx-bf-sim-bubble">${E(h.question)}</div></div><div class="vx-bf-sim-row client"><div class="vx-bf-sim-bubble">${E(h.answerLabel)}</div></div>`).join('');
    if(simState.humanEscape){
      html+=`<div class="vx-bf-sim-row client"><div class="vx-bf-sim-bubble">🙋 Falar com atendente</div></div><div class="vx-bf-sim-summary">Encaminhado direto pra um atendente -- pediu "falar com atendente" antes de terminar a triagem, sem passar pelas regras de roteamento.</div>`;
    }else{
      const cur=simCurrentStep();
      if(cur){
        html+=`<div class="vx-bf-sim-row bot"><div class="vx-bf-sim-bubble">${E(cur.question_text)}</div></div>`;
        if(cur.answer_type==='CHOICE'){
          const opts=Array.isArray(cur.options)?cur.options:[];
          html+=`<div class="vx-bf-sim-options">${opts.length?opts.map(o=>`<button type="button" class="vx-bf-sim-opt" data-sim-answer="${E(o.value)}" data-sim-label="${E(o.label)}">${E(o.label)}</button>`).join(''):'<p class="vx-bf-empty">Esta pergunta ainda não tem opções de resposta.</p>'}</div>`;
        }else{
          html+=`<div class="vx-bf-sim-freetext"><input type="text" id="vxBfSimFreeText" placeholder="Resposta do cliente…" maxlength="200"><button type="button" id="vxBfSimFreeTextSend">Enviar</button></div>`;
        }
        if(v.always_human_toggle)html+=`<div class="vx-bf-sim-options"><button type="button" class="vx-bf-sim-opt vx-bf-sim-escape" data-sim-human="1">🙋 Falar com atendente</button></div>`;
      }else{
        const storeStep=steps.find(s=>s.routing_dimension==='STORE'),warrantyStep=steps.find(s=>s.routing_dimension==='WARRANTY'),brandStep=steps.find(s=>s.routing_dimension==='BRAND');
        const matched=testRoutingCombo(storeStep?simState.answers[storeStep.step_key]||null:null,warrantyStep?simState.answers[warrantyStep.step_key]||'':'',brandStep?simState.answers[brandStep.step_key]||'':'');
        const destino=matched?`fila ${matched.target?.name||'removida'}`:(v.default_attendant_id?(bf.profiles.find(p=>p.id===v.default_attendant_id)?.full_name||'atendente padrão'):'nenhum atendente padrão configurado');
        html+=`<div class="vx-bf-sim-summary"><b>Resumo da triagem</b>${simState.history.map(h=>`<div>${E(h.question)}: <b>${E(h.answerLabel)}</b></div>`).join('')}<div class="vx-bf-sim-summary-dest">Encaminhado para: <b>${E(destino)}</b>${matched?` <small>(regra com especificidade ${matched.specificity})</small>`:''}</div></div>`;
      }
    }
    box.innerHTML=html;
    box.scrollTop=box.scrollHeight;
    box.querySelectorAll('[data-sim-answer]').forEach(btn=>btn.onclick=()=>simAnswer(btn.dataset.simAnswer,btn.dataset.simLabel));
    box.querySelector('[data-sim-human]')?.addEventListener('click',()=>{simState.humanEscape=true;renderSimulator()});
    const freeInput=box.querySelector('#vxBfSimFreeText');
    const sendFreeText=()=>{const val=freeInput.value.trim();if(val)simAnswer(val,val)};
    box.querySelector('#vxBfSimFreeTextSend')?.addEventListener('click',sendFreeText);
    freeInput?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendFreeText()}});
  }
  function simulatorCard(){
    if(!bf.draft&&!bf.published)return'';
    return `<div class="vx-bf-card">
      <h3>Simular o fluxo</h3>
      <p class="vx-bf-sub">Testa o robô como o cliente veria, com as perguntas e regras configuradas acima -- qualquer edição reflete aqui na próxima simulação.</p>
      <div class="vx-bf-sim-thread" id="vxBfSimThread"></div>
      <button type="button" class="vx-bf-sim-reset" id="vxBfSimReset">↺ Reiniciar simulação</button>
    </div>`;
  }

  function wireStepRows(){
    document.querySelectorAll('.vx-bf-step-row').forEach(row=>{
      const stepId=row.dataset.step;
      const step=bf.steps.find(s=>s.id===stepId);
      if(!step)return;
      row.querySelectorAll('[data-field]').forEach(el=>{
        const field=el.dataset.field;
        // answer_type/routing_dimension mudam QUAL UI aparece (lista de
        // opções, botão de sincronizar loja, seed de garantia) -- essas
        // duas precisam re-renderizar a tela. question_text/active só
        // salvam silenciosamente (senão perderia o foco a cada letra
        // digitada).
        const needsRerender=field==='answer_type'||field==='routing_dimension';
        const handler=async()=>{
          const val=el.type==='checkbox'?el.checked:el.value;
          await updateStep(stepId,{[field]:val});
          if(needsRerender){await loadAll();renderScreen()}
        };
        el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'blur',handler);
      });
      row.querySelector('[data-move="-1"]')?.addEventListener('click',()=>moveStep(stepId,-1));
      row.querySelector('[data-move="1"]')?.addEventListener('click',()=>moveStep(stepId,1));
      row.querySelector('[data-remove-step]')?.addEventListener('click',()=>removeStep(stepId));
      row.querySelector('[data-sync-store-options]')?.addEventListener('click',()=>setStoreOptionsForStep(step).then(()=>{loadAll().then(renderScreen)}));
      row.querySelector('[data-seed-warranty]')?.addEventListener('click',()=>seedWarrantyOptions(step));
      row.querySelector('[data-add-option]')?.addEventListener('click',()=>{
        const options=[...(Array.isArray(step.options)?step.options:[]),{value:'',label:''}];
        updateStep(stepId,{options}).then(()=>{loadAll().then(renderScreen)});
      });
      row.querySelectorAll('[data-opt-remove]').forEach(btn=>btn.addEventListener('click',()=>{
        const i=Number(btn.dataset.optRemove);
        const options=(Array.isArray(step.options)?step.options:[]).filter((_,idx)=>idx!==i);
        updateStep(stepId,{options}).then(()=>{loadAll().then(renderScreen)});
      }));
      row.querySelectorAll('[data-opt-idx]').forEach(input=>input.addEventListener('blur',()=>{
        const i=Number(input.dataset.optIdx);
        const options=[...(Array.isArray(step.options)?step.options:[])];
        options[i]={value:input.value,label:input.value};
        updateStep(stepId,{options});
      }));
      const dependsSelect=row.querySelector(`[data-cond-depends="${stepId}"]`);
      const valueInput=row.querySelector(`[data-cond-value="${stepId}"]`);
      dependsSelect?.addEventListener('change',()=>{
        valueInput.hidden=!dependsSelect.value;
        if(!dependsSelect.value)setStepCondition(stepId,null,null);
      });
      valueInput?.addEventListener('blur',()=>{
        if(dependsSelect.value&&valueInput.value)setStepCondition(stepId,dependsSelect.value,valueInput.value);
      });
    });
  }

  function renderScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    if(!isGestor()){
      app.innerHTML=`<div class="vx-bf-wrap"><div class="vx-bf-card"><h3>Robô de Atendimento</h3><p class="vx-bf-sub">Este recurso é restrito a usuários GESTOR.</p><button type="button" id="vxBfBack">← Voltar</button></div></div>`;
      document.getElementById('vxBfBack').onclick=backToConversas;
      return;
    }
    app.innerHTML=`<div class="vx-bf-wrap">
      <div class="vx-bf-head">
        <button type="button" id="vxBfBack" class="vx-bf-back">← Voltar</button>
        <div class="vx-bf-head-title"><h1>Robô de Atendimento</h1><p>Mensagem automática, triagem por perguntas e roteamento inicial de conversas novas.</p></div>
      </div>
      ${welcomeCard()}
      ${stepsCard()}
      ${simulatorCard()}
      ${generalSettingsCard()}
      ${versionsCard()}
      ${queuesCard()}
      ${routingRulesCard()}
    </div>`;
    document.getElementById('vxBfBack').onclick=backToConversas;
    document.getElementById('vxBfQueueForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);createQueue(f.get('name'));});
    document.querySelectorAll('[data-remove-queue]').forEach(btn=>btn.addEventListener('click',()=>removeQueue(btn.dataset.removeQueue)));
    document.querySelectorAll('[data-queue-member]').forEach(chk=>chk.addEventListener('change',()=>toggleQueueMember(chk.dataset.queueMember,chk.dataset.user,chk.checked)));
    document.getElementById('vxBfWelcomeSave')?.addEventListener('click',()=>patchDraft({welcome_message:document.getElementById('vxBfWelcome').value}).then(()=>toast?.('Mensagem salva.')));
    document.getElementById('vxBfAddStep')?.addEventListener('click',addStep);
    document.getElementById('vxBfGeneralSave')?.addEventListener('click',()=>patchDraft({
      always_human_toggle:document.getElementById('vxBfAlwaysHuman').checked,
      invalid_message:document.getElementById('vxBfInvalidMsg').value,
      retry_limit:Number(document.getElementById('vxBfRetryLimit').value)||3,
      lookup_toggle:document.getElementById('vxBfLookup').checked,
      default_attendant_id:document.getElementById('vxBfDefaultAttendant').value||null,
      after_hours_toggle:document.getElementById('vxBfAfterHoursToggle').checked,
      business_hours_text:document.getElementById('vxBfBusinessHoursText').value,
      after_hours_message:document.getElementById('vxBfAfterHoursMsg').value,
    }).then(()=>toast?.('Configurações salvas.')));
    document.getElementById('vxBfPublish')?.addEventListener('click',handlePublish);
    document.getElementById('vxBfCreateBlank')?.addEventListener('click',handleCreateBlankDraft);
    document.getElementById('vxBfCreateDraftFromPublished')?.addEventListener('click',()=>handleRestore(bf.published.id));
    document.querySelectorAll('[data-restore]').forEach(btn=>btn.addEventListener('click',()=>handleRestore(btn.dataset.restore)));
    document.getElementById('vxBfRuleForm')?.addEventListener('submit',addRule);
    document.querySelectorAll('[data-remove-rule]').forEach(btn=>btn.addEventListener('click',()=>removeRule(btn.dataset.removeRule)));
    document.getElementById('vxBfTestRun')?.addEventListener('click',()=>{
      const storeId=document.getElementById('vxBfTestStore').value||null;
      const warranty=document.getElementById('vxBfTestWarranty').value;
      const brand=document.getElementById('vxBfTestBrand').value;
      const matched=testRoutingCombo(storeId,warranty,brand);
      const box=document.getElementById('vxBfTestResult');
      // Achado do usuário em 2026-09-02: "Testar uma combinação" precisa
      // informar regra vencedora, fila destino E integrantes
      // disponíveis (não só o nome da fila) -- só assim dá pra
      // conferir se a fila certa tem gente de verdade nela antes de
      // publicar.
      if(matched){
        const queueName=matched.target?.name||'fila removida';
        const members=membersOfQueue(matched.target_queue_id).map(m=>m.profiles?.full_name).filter(Boolean);
        box.innerHTML=`Regra vencedora: especificidade <b>${matched.specificity}</b>.<br>Fila destino: <b>${E(queueName)}</b>.<br>Integrantes disponíveis: ${members.length?members.map(E).join(', '):'<span class="vx-bf-sim-summary-empty">nenhum integrante nesta fila ainda -- ninguém vai ver a conversa até adicionar alguém.</span>'}`;
      }else{
        const v=bf.draft||bf.published;
        const defaultName=v?.default_attendant_id?bf.profiles.find(p=>p.id===v.default_attendant_id)?.full_name:null;
        box.textContent=`Nenhuma regra bate -- usaria o atendente padrão (${defaultName||'nenhum configurado'}).`;
      }
    });
    document.getElementById('vxBfSimReset')?.addEventListener('click',resetSimulation);
    wireStepRows();
    resetSimulation();
  }

  async function renderChatBotConfig(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="card">Carregando Robô de Atendimento...</div>';
    await loadAll();
    renderScreen();
  }

  window.renderChatBotConfig=renderChatBotConfig;

  const priorRender=window.render;
  window.render=async function(view){
    if(view==='chat-bot-config')return renderChatBotConfig();
    return priorRender(view);
  };

  window.VoxAssistRuntime=window.VoxAssistRuntime||{};
  window.VoxAssistRuntime.chatBotConfig={name:'Robô de Atendimento V1',version:'1.0.0',owner:'runtime/chat-bot-config-v1.js'};
})();
