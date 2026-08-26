/* VoxAssist V0.8.13 — Gestão de NPS (Electrolux → Gestão de NPS).
   NÃO edita electrolux-reports-v0813.js. Injeta um card a mais no hub
   Electrolux (mesmo padrão .module-action-card já usado pelos 9 grupos de
   status) e, ao clicar, substitui #app pela própria tela. "Voltar" chama
   window.render('electrolux') de novo, igual o botão nativo já faz.
   Nunca responde pelo cliente, nunca infere resposta, nunca envia nada
   sozinho — cada ação de contato exige confirmação explícita de quem clicou. */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const ELX_SURVEY_LINK='https://wa.me/554140421506';
  const ELX_SURVEY_PHONE_DISPLAY='+55 41 4042-1506';
  let npsScreenActive=false;

  function role(){return state.profile?.role||'GESTOR'}
  function isTechnician(){return role()==='TECNICO'}
  function isGestor(){return role()==='GESTOR'}
  function canWrite(){return !isTechnician()}
  function uid(){return state.session?.user?.id||state.profile?.id||null}

  const CLASS_LABEL={ALTA:'Alta prioridade',MEDIA:'Prioridade média',ATENCAO:'Caso de atenção',NAO_ELEGIVEL:'Não elegível'};
  const SIT_LABEL={
    AGUARDANDO_CONTATO:'Aguardando contato',
    PRIMEIRO_CONTATO_ENVIADO:'Primeiro contato enviado',
    AGUARDANDO_RESPOSTA:'Aguardando resposta',
    LEMBRETE_ENVIADO:'Lembrete enviado',
    CLIENTE_CONFIRMOU_RESPOSTA:'Cliente confirmou que respondeu',
    CLIENTE_NAO_RECEBEU:'Cliente informou que não recebeu a pesquisa',
    CLIENTE_NAO_RESPONDEU:'Cliente não respondeu ao nosso contato',
    CLIENTE_NAO_DESEJA_CONTATO:'Cliente não deseja receber contato',
    CASO_DE_ATENCAO:'Caso de atenção',
    FINALIZADO:'Finalizado',
  };
  const FILIAL_LABEL={VITORIA:'Vitória',SERRA:'Serra'};

  /* ---------- entrada no hub Electrolux ---------- */
  function ensureEntryCard(){
    const grid=document.querySelector('.module-action-grid');
    if(!grid||grid.querySelector('[data-nps-entry]'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='module-action-card teal';
    btn.dataset.npsEntry='1';
    btn.innerHTML=`<span class="icon">★</span><span><strong>GESTÃO DE NPS</strong><small>Pesquisa de satisfação Electrolux</small></span>`;
    btn.onclick=openNpsScreen;
    grid.appendChild(btn);
  }
  const observer=new MutationObserver(()=>{
    if(npsScreenActive)return;
    if(document.querySelector('.module-action-grid'))ensureEntryCard();
  });
  observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});

  /* ---------- dados ---------- */
  let cache={cases:[],filter:{filial:'',situacao:'',classification:'',search:''}};

  async function loadCases(){
    cache.cases=await api('nps_cases?select=*,external_appointments(external_order_number,client_name,client_phone,technician_id,appointment_date)&order=created_at.desc');
  }
  async function loadContacts(caseId){
    return api(`nps_contacts?nps_case_id=eq.${caseId}&order=sent_at.desc`).catch(()=>[]);
  }
  async function loadHistory(caseId){
    return api(`nps_case_history?nps_case_id=eq.${caseId}&order=changed_at.desc`).catch(()=>[]);
  }
  async function loadTechName(techId){
    if(!techId)return null;
    const rows=await api(`profiles?select=full_name&id=eq.${techId}&limit=1`).catch(()=>[]);
    return rows?.[0]?.full_name||null;
  }

  async function writeHistory(caseId,action,prev,next){
    await api('nps_case_history',{method:'POST',body:JSON.stringify({nps_case_id:caseId,action,previous_data:prev||{},new_data:next||{},changed_by:uid()})}).catch(()=>{});
  }
  async function patchCase(c,patch,action){
    const prev={...c};
    await api(`nps_cases?id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
    await writeHistory(c.id,action,{situacao:prev.situacao,classification:prev.classification,filial:prev.filial,responsible_user_id:prev.responsible_user_id},patch);
    Object.assign(c,patch);
  }
  async function insertContact(c,input){
    await api('nps_contacts',{method:'POST',body:JSON.stringify({
      nps_case_id:c.id,contact_type:input.contactType,phone_used:input.phone,message_text:input.message,
      filial:c.filial,previous_situacao:c.situacao,new_situacao:input.newSituacao,
      observacao:input.observacao||null,confirmed_response:null,sent_by:uid(),
    })});
  }

  /* ---------- WhatsApp ---------- */
  function toDigits(phone){
    const d=String(phone||'').replace(/\D/g,'');
    return d.startsWith('55')&&d.length>=12?d:`55${d}`;
  }
  function firstName(name){return String(name||'').trim().split(/\s+/)[0]||name||'cliente'}
  function buildMessage(clientName,filial){
    return `Olá, ${firstName(clientName)}!\n\nSeu atendimento foi finalizado. A Electrolux enviará uma pesquisa pelo número ${ELX_SURVEY_PHONE_DISPLAY}, referente ao atendimento da nossa equipe - técnico e atendente.\n\nPoderia reservar um momento para respondê-la? Sua avaliação é muito importante para continuarmos aprimorando nosso atendimento!\n\nVox Eletrônica - ${FILIAL_LABEL[filial]||'[filial]'}`;
  }

  /* ---------- navegação ---------- */
  async function openNpsScreen(){
    npsScreenActive=true;
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="vx-nps"><div class="vx-loading">Carregando Gestão de NPS…</div></div>';
    try{
      await loadCases();
      renderNpsScreen();
    }catch(e){
      app.innerHTML=`<div class="vx-nps"><div class="card error-card"><h3>Falha ao carregar Gestão de NPS</h3><p>${E(e.message||'Erro desconhecido.')}</p><button id="npsBackErr">← Voltar</button></div></div>`;
      document.getElementById('npsBackErr').onclick=goBack;
    }
  }
  function goBack(){npsScreenActive=false;window.render('electrolux')}

  /* ---------- indicadores ---------- */
  function indicators(){
    const cs=cache.cases;
    const total=cs.length;
    const alta=cs.filter(c=>c.classification==='ALTA').length;
    const aguardando=cs.filter(c=>c.situacao==='AGUARDANDO_CONTATO').length;
    const primeiroContato=cs.filter(c=>c.situacao!=='AGUARDANDO_CONTATO').length;
    const lembrete=cs.filter(c=>c.situacao==='LEMBRETE_ENVIADO').length;
    const confirmou=cs.filter(c=>c.situacao==='CLIENTE_CONFIRMOU_RESPOSTA').length;
    const semResposta=cs.filter(c=>['CLIENTE_NAO_RESPONDEU','AGUARDANDO_RESPOSTA'].includes(c.situacao)).length;
    const atencao=cs.filter(c=>c.classification==='ATENCAO'||c.situacao==='CASO_DE_ATENCAO').length;
    const withDates=cs.filter(c=>c.opened_at&&c.concluded_at);
    const ate10=withDates.length?Math.round(100*withDates.filter(c=>(new Date(c.concluded_at)-new Date(c.opened_at))/86400000<=10).length/withDates.length):0;
    const umaVisita=total?Math.round(100*cs.filter(c=>c.visit_count===1).length/total):0;
    return{total,alta,aguardando,primeiroContato,lembrete,confirmou,semResposta,atencao,ate10,umaVisita};
  }

  /* ---------- filtro/listagem ---------- */
  function filteredCases(){
    const f=cache.filter;
    return cache.cases.filter(c=>{
      if(f.filial&&c.filial!==f.filial)return false;
      if(f.situacao&&c.situacao!==f.situacao)return false;
      if(f.classification&&c.classification!==f.classification)return false;
      if(f.search){
        const q=f.search.toLowerCase();
        const ea=c.external_appointments||{};
        const hay=`${ea.client_name||''} ${ea.external_order_number||''}`.toLowerCase();
        if(!hay.includes(q))return false;
      }
      return true;
    });
  }

  function row(c){
    const ea=c.external_appointments||{};
    return `<tr data-case="${E(c.id)}">
      <td>${E(ea.client_name||'—')}</td>
      <td>${E(ea.external_order_number||'—')}</td>
      <td>${E(c.filial?FILIAL_LABEL[c.filial]:'A definir')}</td>
      <td>${E(CLASS_LABEL[c.classification]||c.classification)}</td>
      <td>${E(SIT_LABEL[c.situacao]||c.situacao)}</td>
      <td>${c.concluded_at?new Date(c.concluded_at).toLocaleDateString('pt-BR'):'—'}</td>
      <td>${Number(c.visit_count||1)}</td>
      <td><button data-open-case="${E(c.id)}">Abrir</button></td>
    </tr>`;
  }

  function renderNpsScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    const ind=indicators();
    const list=filteredCases();
    app.innerHTML=`<div class="vx-nps">
      <div class="vx-nps-head">
        <div><button id="npsBack">← Voltar</button><h2>Gestão de NPS</h2><small>Acompanhamento da pesquisa de satisfação Electrolux</small></div>
      </div>
      <div class="vx-nps-indicators">
        <div class="vx-nps-ind"><span>Concluídos</span><b>${ind.total}</b></div>
        <div class="vx-nps-ind"><span>Alta prioridade</span><b>${ind.alta}</b></div>
        <div class="vx-nps-ind"><span>Aguardando contato</span><b>${ind.aguardando}</b></div>
        <div class="vx-nps-ind"><span>Primeiro contato realizado</span><b>${ind.primeiroContato}</b></div>
        <div class="vx-nps-ind"><span>Lembrete enviado</span><b>${ind.lembrete}</b></div>
        <div class="vx-nps-ind"><span>Cliente confirmou resposta</span><b>${ind.confirmou}</b></div>
        <div class="vx-nps-ind"><span>Sem resposta</span><b>${ind.semResposta}</b></div>
        <div class="vx-nps-ind vx-nps-ind-warn"><span>Casos de atenção</span><b>${ind.atencao}</b></div>
        <div class="vx-nps-ind"><span>Concluído em até 10 dias</span><b>${ind.ate10}%</b></div>
        <div class="vx-nps-ind"><span>Resolvido em 1 visita</span><b>${ind.umaVisita}%</b></div>
      </div>
      <div class="vx-nps-filters">
        <input id="npsSearch" placeholder="Buscar cliente ou OS Electrolux…" value="${E(cache.filter.search)}">
        <select id="npsFilial"><option value="">Filial: todas</option><option value="VITORIA" ${cache.filter.filial==='VITORIA'?'selected':''}>Vitória</option><option value="SERRA" ${cache.filter.filial==='SERRA'?'selected':''}>Serra</option></select>
        <select id="npsClassificacao"><option value="">Classificação: todas</option>${Object.entries(CLASS_LABEL).map(([k,l])=>`<option value="${k}" ${cache.filter.classification===k?'selected':''}>${l}</option>`).join('')}</select>
        <select id="npsSituacao"><option value="">Situação: todas</option>${Object.entries(SIT_LABEL).map(([k,l])=>`<option value="${k}" ${cache.filter.situacao===k?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table"><thead><tr>
        <th>Cliente</th><th>OS Electrolux</th><th>Filial</th><th>Classificação</th><th>Situação</th><th>Concluído em</th><th>Visitas</th><th></th>
      </tr></thead><tbody>${list.map(row).join('')||'<tr><td colspan="8">Nenhum caso encontrado com esse filtro.</td></tr>'}</tbody></table></div>
    </div>`;

    document.getElementById('npsBack').onclick=goBack;
    document.getElementById('npsSearch').oninput=e=>{cache.filter.search=e.target.value;renderNpsScreen()};
    document.getElementById('npsFilial').onchange=e=>{cache.filter.filial=e.target.value;renderNpsScreen()};
    document.getElementById('npsClassificacao').onchange=e=>{cache.filter.classification=e.target.value;renderNpsScreen()};
    document.getElementById('npsSituacao').onchange=e=>{cache.filter.situacao=e.target.value;renderNpsScreen()};
    document.querySelectorAll('[data-open-case]').forEach(b=>b.onclick=()=>openCaseModal(b.dataset.openCase));
  }

  /* ---------- modal de caso ---------- */
  function modal(html){
    const bg=document.createElement('div');
    bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal vx-nps-modal">${html}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});
    return bg;
  }

  function lastContactOfType(contacts,type){return contacts.find(c=>c.contact_type===type)||null}
  function hoursSince(dateStr){return dateStr?(Date.now()-new Date(dateStr).getTime())/36e5:Infinity}

  async function openCaseModal(caseId){
    const c=cache.cases.find(x=>String(x.id)===String(caseId));
    if(!c)return;
    const ea=c.external_appointments||{};
    const [contacts,history,techName]=await Promise.all([loadContacts(c.id),loadHistory(c.id),loadTechName(ea.technician_id)]);
    const primeiro=lastContactOfType(contacts,'PRIMEIRO_CONTATO');
    const lembrete=lastContactOfType(contacts,'LEMBRETE');
    const lastContact=contacts[0]||null;
    const recente=lastContact&&hoursSince(lastContact.sent_at)<24;

    const bg=modal(`
      <h3>Atendimento Electrolux · OS ${E(ea.external_order_number||'—')}</h3>
      <div class="vx-modal-grid">
        <label>Cliente<input value="${E(ea.client_name||'—')}" readonly></label>
        <label>Telefone<input value="${E(ea.client_phone||'—')}" readonly></label>
        <label>Técnico<input value="${E(techName||'Não atribuído')}" readonly></label>
        <label>Concluído em<input value="${c.concluded_at?new Date(c.concluded_at).toLocaleString('pt-BR'):'—'}" readonly></label>
        <label>Classificação<input value="${E(CLASS_LABEL[c.classification]||c.classification)}" readonly></label>
        <label>Situação atual<input value="${E(SIT_LABEL[c.situacao]||c.situacao)}" readonly></label>
        <label>Filial<select id="npsCaseFilial" ${canWrite()?'':'disabled'}>
          <option value="">A definir</option>
          <option value="VITORIA" ${c.filial==='VITORIA'?'selected':''}>Vitória</option>
          <option value="SERRA" ${c.filial==='SERRA'?'selected':''}>Serra</option>
        </select></label>
      </div>
      ${recente?'<div class="vx-nps-alert">⚠ Contato recente (menos de 24h) registrado para este caso.</div>':''}
      <div class="vx-nps-actions">
        <button id="npsSendFirst" ${!canWrite()||primeiro?'disabled':''}>Enviar primeiro contato</button>
        <button id="npsSendReminder" ${!canWrite()||!primeiro||(lembrete&&!isGestor())?'disabled':''}>${lembrete?'Autorizar novo lembrete (gestor)':'Enviar lembrete'}</button>
        <a href="${ELX_SURVEY_LINK}" target="_blank" rel="noopener" class="vx-nps-secondary-link">Enviar separadamente (Electrolux)</a>
      </div>
      <div class="vx-nps-actions">
        <button id="npsConfirmResponse" ${!canWrite()?'disabled':''}>Cliente confirmou que respondeu</button>
        <button id="npsNotReceived" ${!canWrite()?'disabled':''}>Cliente não recebeu</button>
        <button id="npsNoContact" ${!canWrite()?'disabled':''}>Cliente não deseja contato</button>
      </div>
      <div class="vx-nps-actions">
        <button id="npsAttention" ${!canWrite()?'disabled':''}>Marcar caso de atenção</button>
        <button id="npsFinalize" ${!canWrite()?'disabled':''}>Finalizar</button>
      </div>
      <h4>Histórico de contatos</h4>
      <div class="vx-nps-history">${contacts.map(ct=>`<div class="vx-nps-hist-row"><b>${E(ct.contact_type==='PRIMEIRO_CONTATO'?'Primeiro contato':'Lembrete')}</b><span>${new Date(ct.sent_at).toLocaleString('pt-BR')}</span><small>${E(ct.observacao||'')}</small></div>`).join('')||'<small>Nenhum contato registrado ainda.</small>'}</div>
      <h4>Auditoria</h4>
      <div class="vx-nps-history">${history.map(h=>`<div class="vx-nps-hist-row"><b>${E(h.action)}</b><span>${new Date(h.changed_at).toLocaleString('pt-BR')}</span></div>`).join('')||'<small>Sem eventos.</small>'}</div>
      <div class="vx-modal-actions"><button data-cancel>Fechar</button></div>
    `);
    bg.querySelector('[data-cancel]').onclick=()=>bg.remove();

    bg.querySelector('#npsCaseFilial').onchange=async e=>{
      if(!canWrite())return;
      const filial=e.target.value||null;
      await patchCase(c,{filial},'FILIAL_DEFINIDA');
      toast?.('Filial atualizada.');
    };

    bg.querySelector('#npsSendFirst').onclick=()=>sendFlow(c,ea,'PRIMEIRO_CONTATO',bg);
    bg.querySelector('#npsSendReminder').onclick=()=>{
      if(lembrete&&!isGestor())return;
      if(lembrete&&isGestor()&&!confirm('Já existe um lembrete registrado. Autorizar o envio de outro?'))return;
      sendFlow(c,ea,'LEMBRETE',bg);
    };
    bg.querySelector('#npsConfirmResponse').onclick=async()=>{
      await patchCase(c,{situacao:'CLIENTE_CONFIRMOU_RESPOSTA'},'CLIENTE_CONFIRMOU_RESPOSTA');
      bg.remove();renderNpsScreen();
    };
    bg.querySelector('#npsNotReceived').onclick=async()=>{
      await patchCase(c,{situacao:'CLIENTE_NAO_RECEBEU'},'CLIENTE_NAO_RECEBEU');
      bg.remove();renderNpsScreen();
    };
    bg.querySelector('#npsNoContact').onclick=async()=>{
      await patchCase(c,{situacao:'CLIENTE_NAO_DESEJA_CONTATO'},'CLIENTE_NAO_DESEJA_CONTATO');
      bg.remove();renderNpsScreen();
    };
    bg.querySelector('#npsAttention').onclick=async()=>{
      const motivo=prompt('Motivo do caso de atenção:');
      if(!motivo)return;
      await patchCase(c,{situacao:'CASO_DE_ATENCAO',classification:'ATENCAO',attention_reason:motivo,has_complaint:true},'MARCADO_CASO_DE_ATENCAO');
      bg.remove();renderNpsScreen();
    };
    bg.querySelector('#npsFinalize').onclick=async()=>{
      const motivo=prompt('Motivo do encerramento (opcional):')||null;
      await patchCase(c,{situacao:'FINALIZADO',closed_reason:motivo},'FINALIZADO');
      bg.remove();renderNpsScreen();
    };
  }

  async function sendFlow(c,ea,contactType,bg){
    if(!ea.client_phone){toast?.('Cliente sem telefone cadastrado.','err');return}
    let filial=c.filial;
    if(!filial){
      const chosen=prompt('Qual filial? Digite VITORIA ou SERRA:');
      if(!chosen||!['VITORIA','SERRA'].includes(chosen.toUpperCase())){toast?.('Filial inválida — envio cancelado.','err');return}
      filial=chosen.toUpperCase();
      await patchCase(c,{filial},'FILIAL_DEFINIDA');
    }
    const message=buildMessage(ea.client_name,filial);
    const link=`https://wa.me/${toDigits(ea.client_phone)}?text=${encodeURIComponent(message)}`;
    window.open(link,'_blank','noopener');

    if(!confirm('Confirma que a mensagem foi enviada pelo WhatsApp?'))return;

    const newSituacao=contactType==='PRIMEIRO_CONTATO'?'PRIMEIRO_CONTATO_ENVIADO':'LEMBRETE_ENVIADO';
    await insertContact(c,{contactType,phone:ea.client_phone,message,newSituacao});
    await patchCase(c,{situacao:newSituacao},contactType==='PRIMEIRO_CONTATO'?'PRIMEIRO_CONTATO_ENVIADO':'LEMBRETE_ENVIADO');
    toast?.('Contato registrado.');
    bg.remove();
    renderNpsScreen();
  }
})();
