/* VoxAssist V0.8.13 — NPS Electrolux (Atividades → NPS Electrolux).
   NÃO edita all-menus-layout.js. Injeta um card a mais na grid do hub
   Atividades (mesmo padrão .module-action-card, ancorado no card nativo
   "agenda-operacional" pra não vazar pra outros hubs) e, ao clicar,
   substitui #app pela própria tela. "Voltar" chama window.render('agenda')
   de novo, voltando pro hub Atividades. Carência de 6h desde concluded_at
   antes de um caso virar elegível pra contato (ver isEligibleForContact em
   supabase/functions/_shared/npsClassification.ts — a promoção em si roda
   no sync-electrolux-nps, este arquivo só lê/mostra o estado já resolvido).
   Nunca responde pelo cliente, nunca infere resposta, nunca envia nada
   sozinho — cada ação de contato exige confirmação explícita de quem clicou. */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const ELX_SURVEY_LINK='https://wa.me/554140421506';
  const ELX_SURVEY_PHONE_DISPLAY='+55 41 4042-1506';

  function role(){return state.profile?.role||'GESTOR'}
  function isTechnician(){return role()==='TECNICO'}
  function isGestor(){return role()==='GESTOR'}
  function canWrite(){return !isTechnician()}
  function uid(){return state.session?.user?.id||state.profile?.id||null}

  const CLASS_LABEL={ALTA:'Alta prioridade',MEDIA:'Prioridade média',ATENCAO:'Caso de atenção',NAO_ELEGIVEL:'Não elegível'};
  const SIT_LABEL={
    AGUARDANDO_ENCERRAMENTO:'Concluído — aguardando encerramento',
    AGUARDANDO_PRAZO_NPS:'Encerrado — aguardando 6 horas',
    AGUARDANDO_CONTATO:'Elegível para NPS',
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
  // Contatado mas ainda sem desfecho — cobre primeiro contato, lembrete e o
  // estado manual "aguardando resposta" propriamente dito.
  const CONTACTED_SITUACOES=['PRIMEIRO_CONTATO_ENVIADO','LEMBRETE_ENVIADO','AGUARDANDO_RESPOSTA'];
  function isAttention(c){return c.classification==='ATENCAO'||c.situacao==='CASO_DE_ATENCAO'}

  /* ---------- entrada na tela real de Atividades ----------
     A tela "Atividades" do menu NÃO é o hub de cards atividades() de
     all-menus-layout.js — esse hub é código morto: field-agenda-v0813.js
     e depois field-agenda-complete-v0813.js reenvolvem window.render e
     interceptam view==='agenda' direto, sem nunca delegar pro hub. Quem
     realmente aparece é renderAgenda() (field-agenda-complete-v0813.js),
     a tela "Agenda Externa". Âncora correta: .vx-agenda-controls (a
     barra de botões "Agenda/Lista/Mapa/Feriado/Jornada" no topo dessa
     tela), confirmado lendo renderAgenda() diretamente — não suposição.
     Corrige um bug real: o card nunca apareceu em produção porque
     ancorava num hub inalcançável. */
  function ensureEntryCard(){
    const controls=document.querySelector('.vx-agenda-controls');
    if(!controls||controls.querySelector('[data-nps-entry]'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.dataset.npsEntry='1';
    btn.textContent='NPS Electrolux';
    btn.onclick=openNpsScreen;
    controls.appendChild(btn);
  }
  // ensureEntryCard() já é auto-protegida (só age quando .vx-agenda-controls
  // existe, ou seja, só na tela de Agenda) — nunca precisou de uma flag
  // externa pra saber "estou na tela do NPS". Achado real: a flag
  // npsScreenActive travava em true pra sempre sempre que o usuário saía
  // da tela do NPS por qualquer caminho que não fosse o botão "Voltar"
  // (trocar de aba, trocar de empresa) — o botão nunca mais reaparecia
  // depois disso, mesmo voltando pra Agenda de verdade.
  const observer=new MutationObserver(ensureEntryCard);
  // Ancora em document.body, não #app: shell() (app.js) faz
  // document.body.innerHTML=... em login/logout/troca de empresa, o que
  // recria #app como um nó novo — um observer travado na referência
  // antiga do #app fica órfão (nunca mais dispara) depois disso. Achado
  // real: era exatamente por isso que o botão "sumia" depois de um
  // tempo — o body em si nunca é substituído, só observá-lo direto.
  observer.observe(document.body,{childList:true,subtree:true});

  /* ---------- dados ---------- */
  let cache={cases:[],contactsToday:[],profileNames:{},filter:{filial:'',situacao:'',classification:'',search:'',technicianId:'',responsibleId:'',dateFrom:'',dateTo:''}};

  async function loadCases(){
    cache.cases=await api('nps_cases?select=*,external_appointments(external_order_number,client_name,client_phone,technician_id,appointment_date)&order=created_at.desc');
  }
  // Resolve nomes de técnico e responsável de uma vez só (não um fetch por
  // linha) -- alimenta tanto os selects de filtro quanto a exibição.
  async function loadNames(){
    const techIds=cache.cases.map(c=>c.external_appointments?.technician_id).filter(Boolean);
    const respIds=cache.cases.map(c=>c.responsible_user_id).filter(Boolean);
    const allIds=[...new Set([...techIds,...respIds])];
    cache.profileNames=allIds.length
      ? Object.fromEntries((await api(`profiles?select=id,full_name&id=in.(${allIds.join(',')})`).catch(()=>[])).map(r=>[r.id,r.full_name]))
      : {};
  }
  async function loadContactsToday(){
    const startOfDay=new Date();startOfDay.setHours(0,0,0,0);
    cache.contactsToday=await api(`nps_contacts?select=nps_case_id,sent_at&sent_at=gte.${startOfDay.toISOString()}`).catch(()=>[]);
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
    return `Olá, ${firstName(clientName)}! 😊\n\nSeu atendimento foi finalizado. A Electrolux enviará uma pesquisa pelo número ${ELX_SURVEY_PHONE_DISPLAY}, referente ao atendimento da nossa equipe — técnico e atendente.\n\nNo NPS, as notas 9 e 10 representam uma avaliação positiva para nossa empresa. Poderia reservar um momento para responder conforme sua experiência? Sua avaliação é muito importante para continuarmos aprimorando nosso atendimento! 🙌\n\nVox Eletrônica – ${FILIAL_LABEL[filial]||'[filial]'}`;
  }

  /* ---------- navegação ---------- */
  async function openNpsScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    app.innerHTML='<div class="vx-nps"><div class="vx-loading">Carregando Gestão de NPS…</div></div>';
    try{
      await Promise.all([loadCases(),loadContactsToday()]);
      await loadNames();
      renderNpsScreen();
    }catch(e){
      app.innerHTML=`<div class="vx-nps"><div class="card error-card"><h3>Falha ao carregar Gestão de NPS</h3><p>${E(e.message||'Erro desconhecido.')}</p><button id="npsBackErr">← Voltar</button></div></div>`;
      document.getElementById('npsBackErr').onclick=goBack;
    }
  }
  function goBack(){window.render('agenda')}

  /* ---------- indicadores ---------- */
  function indicators(){
    const cs=cache.cases;
    const aguardando6h=cs.filter(c=>['AGUARDANDO_ENCERRAMENTO','AGUARDANDO_PRAZO_NPS'].includes(c.situacao)).length;
    const elegiveisAgora=cs.filter(c=>c.situacao==='AGUARDANDO_CONTATO').length;
    const altaOportunidade=cs.filter(c=>c.classification==='ALTA'&&!['FINALIZADO','CASO_DE_ATENCAO'].includes(c.situacao)).length;
    const contatadosHoje=new Set(cache.contactsToday.map(ct=>ct.nps_case_id)).size;
    const aguardandoResposta=cs.filter(c=>CONTACTED_SITUACOES.includes(c.situacao)).length;
    const casosAtencao=cs.filter(isAttention).length;
    return{aguardando6h,elegiveisAgora,altaOportunidade,contatadosHoje,aguardandoResposta,casosAtencao};
  }

  /* ---------- filtro/listagem/ordenação ----------
     Fila de NPS: elegíveis agora primeiro (Alta antes de Média), depois
     quem já foi contatado, depois quem ainda aguarda as 6h, depois
     desfechos manuais — dentro do mesmo grupo, quem ficou elegível há mais
     tempo primeiro (concluded_at ascendente). Casos de atenção nunca
     entram nessa fila — vão pra tabela separada (seção 5 do pedido). */
  const CLASS_RANK={ALTA:0,MEDIA:1};
  function queueTier(c){
    if(c.situacao==='AGUARDANDO_CONTATO')return 0;
    if(CONTACTED_SITUACOES.includes(c.situacao))return 1;
    if(['AGUARDANDO_ENCERRAMENTO','AGUARDANDO_PRAZO_NPS'].includes(c.situacao))return 2;
    return 3;
  }
  function sortQueue(list){
    return [...list].sort((a,b)=>{
      const ta=queueTier(a),tb=queueTier(b);
      if(ta!==tb)return ta-tb;
      if(ta===0){
        const ra=CLASS_RANK[a.classification]??2,rb=CLASS_RANK[b.classification]??2;
        if(ra!==rb)return ra-rb;
      }
      const da=a.concluded_at?new Date(a.concluded_at).getTime():Infinity;
      const db=b.concluded_at?new Date(b.concluded_at).getTime():Infinity;
      return da-db;
    });
  }
  function filteredCases(){
    const f=cache.filter;
    const base=cache.cases.filter(c=>{
      if(f.filial&&c.filial!==f.filial)return false;
      if(f.situacao&&c.situacao!==f.situacao)return false;
      if(f.classification&&c.classification!==f.classification)return false;
      if(f.technicianId&&c.external_appointments?.technician_id!==f.technicianId)return false;
      if(f.responsibleId&&c.responsible_user_id!==f.responsibleId)return false;
      if(f.dateFrom&&(!c.concluded_at||c.concluded_at<f.dateFrom))return false;
      if(f.dateTo&&(!c.concluded_at||c.concluded_at>f.dateTo+'T23:59:59'))return false;
      if(f.search){
        const q=f.search.toLowerCase();
        const ea=c.external_appointments||{};
        const hay=`${ea.client_name||''} ${ea.external_order_number||''}`.toLowerCase();
        if(!hay.includes(q))return false;
      }
      return true;
    });
    return{
      queue:sortQueue(base.filter(c=>!isAttention(c))),
      attention:base.filter(isAttention),
    };
  }

  function row(c){
    const ea=c.external_appointments||{};
    const techName=cache.profileNames[ea.technician_id]||'—';
    const respName=cache.profileNames[c.responsible_user_id]||'Sem responsável';
    return `<tr data-case="${E(c.id)}">
      <td>${E(ea.client_name||'—')}</td>
      <td>${E(ea.external_order_number||'—')}</td>
      <td>${E(c.filial?FILIAL_LABEL[c.filial]:'A definir')}</td>
      <td>${E(techName)}</td>
      <td>${E(respName)}</td>
      <td>${E(CLASS_LABEL[c.classification]||c.classification)}</td>
      <td>${E(SIT_LABEL[c.situacao]||c.situacao)}</td>
      <td>${c.concluded_at?new Date(c.concluded_at).toLocaleDateString('pt-BR'):'—'}</td>
      <td>${Number(c.visit_count||1)}</td>
      <td><button data-open-case="${E(c.id)}">Abrir</button></td>
    </tr>`;
  }

  function technicianOptions(){
    const ids=[...new Set(cache.cases.map(c=>c.external_appointments?.technician_id).filter(Boolean))];
    return ids.map(id=>`<option value="${E(id)}" ${cache.filter.technicianId===id?'selected':''}>${E(cache.profileNames[id]||'—')}</option>`).join('');
  }
  function responsibleOptions(){
    const ids=[...new Set(cache.cases.map(c=>c.responsible_user_id).filter(Boolean))];
    return ids.map(id=>`<option value="${E(id)}" ${cache.filter.responsibleId===id?'selected':''}>${E(cache.profileNames[id]||'—')}</option>`).join('');
  }

  function tableHead(){
    return `<thead><tr>
      <th>Cliente</th><th>OS Electrolux</th><th>Filial</th><th>Técnico</th><th>Responsável</th><th>Classificação</th><th>Situação</th><th>Elegível em</th><th>Visitas</th><th></th>
    </tr></thead>`;
  }

  function renderNpsScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    const ind=indicators();
    const{queue,attention}=filteredCases();
    app.innerHTML=`<div class="vx-nps">
      <div class="vx-nps-head">
        <div><button id="npsBack">← Voltar</button><h2>NPS Electrolux</h2><small>Acompanhamento da pesquisa de satisfação Electrolux</small></div>
      </div>
      <div class="vx-nps-indicators">
        <div class="vx-nps-ind"><span>Aguardando 6h</span><b>${ind.aguardando6h}</b></div>
        <div class="vx-nps-ind"><span>Elegíveis agora</span><b>${ind.elegiveisAgora}</b></div>
        <div class="vx-nps-ind"><span>Alta oportunidade</span><b>${ind.altaOportunidade}</b></div>
        <div class="vx-nps-ind"><span>Contatados hoje</span><b>${ind.contatadosHoje}</b></div>
        <div class="vx-nps-ind"><span>Aguardando resposta</span><b>${ind.aguardandoResposta}</b></div>
        <div class="vx-nps-ind vx-nps-ind-warn"><span>Casos de atenção</span><b>${ind.casosAtencao}</b></div>
      </div>
      <div class="vx-nps-filters">
        <input id="npsSearch" placeholder="Buscar cliente ou OS Electrolux…" value="${E(cache.filter.search)}">
        <select id="npsFilial"><option value="">Filial: todas</option><option value="VITORIA" ${cache.filter.filial==='VITORIA'?'selected':''}>Vitória</option><option value="SERRA" ${cache.filter.filial==='SERRA'?'selected':''}>Serra</option></select>
        <select id="npsTecnico"><option value="">Técnico: todos</option>${technicianOptions()}</select>
        <select id="npsResponsavel"><option value="">Responsável: todos</option>${responsibleOptions()}</select>
        <select id="npsClassificacao"><option value="">Classificação: todas</option>${Object.entries(CLASS_LABEL).map(([k,l])=>`<option value="${k}" ${cache.filter.classification===k?'selected':''}>${l}</option>`).join('')}</select>
        <select id="npsSituacao"><option value="">Situação: todas</option>${Object.entries(SIT_LABEL).map(([k,l])=>`<option value="${k}" ${cache.filter.situacao===k?'selected':''}>${l}</option>`).join('')}</select>
        <label class="vx-nps-period">Período<input type="date" id="npsDateFrom" value="${E(cache.filter.dateFrom)}"> a <input type="date" id="npsDateTo" value="${E(cache.filter.dateTo)}"></label>
      </div>
      <h3 class="vx-nps-section-title">Fila de NPS</h3>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table">${tableHead()}<tbody>${queue.map(row).join('')||'<tr><td colspan="10">Nenhum caso na fila com esse filtro.</td></tr>'}</tbody></table></div>
      <h3 class="vx-nps-section-title vx-nps-section-warn">Casos de atenção</h3>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table">${tableHead()}<tbody>${attention.map(row).join('')||'<tr><td colspan="10">Nenhum caso de atenção com esse filtro.</td></tr>'}</tbody></table></div>
    </div>`;

    document.getElementById('npsBack').onclick=goBack;
    document.getElementById('npsSearch').oninput=e=>{cache.filter.search=e.target.value;renderNpsScreen()};
    document.getElementById('npsFilial').onchange=e=>{cache.filter.filial=e.target.value;renderNpsScreen()};
    document.getElementById('npsTecnico').onchange=e=>{cache.filter.technicianId=e.target.value;renderNpsScreen()};
    document.getElementById('npsResponsavel').onchange=e=>{cache.filter.responsibleId=e.target.value;renderNpsScreen()};
    document.getElementById('npsClassificacao').onchange=e=>{cache.filter.classification=e.target.value;renderNpsScreen()};
    document.getElementById('npsSituacao').onchange=e=>{cache.filter.situacao=e.target.value;renderNpsScreen()};
    document.getElementById('npsDateFrom').onchange=e=>{cache.filter.dateFrom=e.target.value;renderNpsScreen()};
    document.getElementById('npsDateTo').onchange=e=>{cache.filter.dateTo=e.target.value;renderNpsScreen()};
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
    const aguardandoElegibilidade=['AGUARDANDO_ENCERRAMENTO','AGUARDANDO_PRAZO_NPS'].includes(c.situacao);
    const eligibleAt=c.eligible_at?new Date(c.eligible_at):null;

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
      ${aguardandoElegibilidade?`<div class="vx-nps-alert">⏳ Ainda em carência — elegível para contato a partir de ${eligibleAt?eligibleAt.toLocaleString('pt-BR'):'—'}.</div>`:''}
      <div class="vx-nps-actions">
        <button id="npsSendFirst" ${!canWrite()||primeiro||aguardandoElegibilidade?'disabled':''}>Enviar primeiro contato</button>
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
