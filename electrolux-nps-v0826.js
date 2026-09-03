/* VoxAssist V0.8.13 — NPS Electrolux (Electrolux → NPS Electrolux).
   Achado do usuário em 2026-09-02: o NPS é uma função nativa da
   operação Electrolux, então o único ponto de entrada é o card "NPS
   ELECTROLUX" dentro da tela Electrolux (electrolux-reports-v0813.js),
   que chama window.vxOpenNpsScreen() abaixo -- substitui #app pela
   própria tela real (mesma sempre foi, nada de novo aqui). "Voltar"
   chama window.render('electrolux'), de volta pro módulo Electrolux.
   Carência de 6h desde concluded_at antes de um caso virar elegível
   pra contato (ver isEligibleForContact em
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
    RESPONDIDO:'Respondido (Electrolux)',
  };
  const FILIAL_LABEL={VITORIA:'Vitória',SERRA:'Serra'};
  // Contatado mas ainda sem desfecho — cobre primeiro contato, lembrete e o
  // estado manual "aguardando resposta" propriamente dito.
  const CONTACTED_SITUACOES=['PRIMEIRO_CONTATO_ENVIADO','LEMBRETE_ENVIADO','AGUARDANDO_RESPOSTA'];
  // Elegível ou ainda em carência -- nunca foi contatado.
  const PENDING_SITUACOES=['AGUARDANDO_ENCERRAMENTO','AGUARDANDO_PRAZO_NPS','AGUARDANDO_CONTATO'];
  function isAttention(c){return c.classification==='ATENCAO'||c.situacao==='CASO_DE_ATENCAO'}
  // Correção 2026-09-03: a premissa de 2026-09-02 estava errada -- o
  // endpoint de detalhe (GET /api/dashboard/service-orders/{id}) sempre
  // devolveu nota/status/data de resposta de NPS, pra SVO aberta ou
  // encerrada. sync-electrolux-nps agora reconcilia isso automaticamente
  // (ver supabase/functions/sync-electrolux-nps/index.ts), revisitando
  // periodicamente enquanto a SVO segue disponível na origem (~60 dias).
  // #npsMarkResponded continua existindo como registro manual pra quando
  // o gestor/atendente já viu o resultado e não quer esperar o próximo
  // ciclo do sync -- os dois caminhos gravam o mesmo situacao=RESPONDIDO.
  function isResponded(c){return c.situacao==='RESPONDIDO'}

  /* ---------- entrada na tela real do NPS ----------
     Achado do usuário em 2026-09-02: o NPS Electrolux é uma função
     nativa da operação Electrolux e não deve ter nenhum ponto de
     entrada fora do módulo Electrolux. O botão "NPS Electrolux" que
     esta função injetava na barra de controles da Agenda Externa
     (.vx-agenda-controls, ver renderAgenda() em
     field-agenda-complete-v0813.js) era exatamente esse acesso
     duplicado/fora de lugar -- removido. O único ponto de entrada agora
     é o card "NPS ELECTROLUX" dentro da tela Electrolux
     (electrolux-reports-v0813.js), que chama window.vxOpenNpsScreen()
     abaixo -- mesma tela real, mesmos dados, mesma lógica, só mudou
     de onde se chega até ela. */
  window.vxOpenNpsScreen=()=>openNpsScreen();

  /* ---------- dados ---------- */
  let cache={cases:[],contactsToday:[],profileNames:{},activeIndicator:null,filter:{filial:'',situacao:'',classification:'',contactedTodayOnly:false,search:'',technicianId:'',responsibleId:'',dateFrom:'',dateTo:''}};

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
  // Achado do usuário 2026-09-03: espaçamento igual ao modelo aprovado
  // (imagem enviada) -- cada ideia no próprio parágrafo, "Olá" e
  // "atendimento finalizado" juntos na primeira linha.
  function buildMessage(clientName,filial){
    return `Olá, ${firstName(clientName)}! 😊 Seu atendimento foi finalizado.\n\nA Electrolux enviará uma pesquisa pelo número ${ELX_SURVEY_PHONE_DISPLAY}, referente ao atendimento da nossa equipe — técnico e atendente.\n\nNo NPS, as notas 9 e 10 representam uma avaliação positiva para nossa empresa.\n\nPoderia reservar um momento para responder conforme sua experiência?\n\nSua avaliação é muito importante para continuarmos aprimorando nosso atendimento! 🙌\n\nVox Eletrônica – ${FILIAL_LABEL[filial]||'[filial]'}`;
  }

  /* ---------- navegação ---------- */
  async function openNpsScreen(){
    // Achado do usuário 2026-09-03: esta tela substitui #app sem passar por
    // window.render(), então o poll de 15s do módulo Electrolux
    // (electrolux-reports-v0813.js) continuava rodando e chutava o usuário
    // de volta pro Início a cada tick. "Voltar" (goBack -> window.render
    // ('electrolux')) já reinicia o poll normalmente.
    window.vxElxStopPoll?.();
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
  // Voltava pra 'agenda' de quando o único ponto de entrada era o botão
  // na Agenda Externa -- agora que a entrada é sempre pelo módulo
  // Electrolux (card "NPS ELECTROLUX"), "Voltar" volta pra lá.
  function goBack(){window.render('electrolux')}

  /* ---------- indicadores ---------- */
  function indicators(){
    const cs=cache.cases;
    const aguardando6h=cs.filter(c=>['AGUARDANDO_ENCERRAMENTO','AGUARDANDO_PRAZO_NPS'].includes(c.situacao)).length;
    const elegiveisAgora=cs.filter(c=>c.situacao==='AGUARDANDO_CONTATO').length;
    const altaOportunidade=cs.filter(c=>c.classification==='ALTA'&&!['FINALIZADO','CASO_DE_ATENCAO'].includes(c.situacao)).length;
    const contatadosHoje=new Set(cache.contactsToday.map(ct=>ct.nps_case_id)).size;
    const aguardandoResposta=cs.filter(c=>CONTACTED_SITUACOES.includes(c.situacao)).length;
    const casosAtencao=cs.filter(isAttention).length;
    const respondidos=cs.filter(isResponded).length;
    return{aguardando6h,elegiveisAgora,altaOportunidade,contatadosHoje,aguardandoResposta,casosAtencao,respondidos};
  }

  // Achado do usuário 2026-09-03: os 7 cards de indicador eram só
  // decorativos -- clicar não filtrava as tabelas abaixo. Cada card vira
  // um atalho pro filtro que o define (mesmo cache.filter já usado pelos
  // selects manuais) -- clicar de novo no mesmo card limpa o filtro.
  const INDICATOR_FILTERS={
    aguardando6h:{situacao:['AGUARDANDO_ENCERRAMENTO','AGUARDANDO_PRAZO_NPS']},
    elegiveisAgora:{situacao:'AGUARDANDO_CONTATO'},
    altaOportunidade:{classification:'ALTA'},
    contatadosHoje:{contactedTodayOnly:true},
    aguardandoResposta:{situacao:CONTACTED_SITUACOES},
    casosAtencao:{situacao:'CASO_DE_ATENCAO'},
    respondidos:{situacao:'RESPONDIDO'},
  };
  function applyIndicatorFilter(key){
    cache.filter.situacao='';cache.filter.classification='';cache.filter.contactedTodayOnly=false;
    if(cache.activeIndicator===key){cache.activeIndicator=null}
    else{cache.activeIndicator=key;Object.assign(cache.filter,INDICATOR_FILTERS[key])}
    renderNpsScreen();
  }

  /* ---------- filtro/listagem/ordenação ----------
     Achado do usuário em 2026-09-02: a tela precisa separar claramente
     Elegíveis/Pendentes | Enviados/Aguardando resposta | Respondidos --
     antes disso tudo ficava numa "Fila de NPS" só, misturado por
     prioridade. Casos de atenção continuam numa tabela própria (nunca
     mudou). "Outros desfechos" cobre os finais manuais que não são nem
     fila nem resposta de verdade (cliente confirmou verbalmente, não
     recebeu, não quis contato, finalizado sem resposta) -- nada some
     de vista, só sai da fila ativa. */
  const CLASS_RANK={ALTA:0,MEDIA:1};
  function sortPending(list){
    return [...list].sort((a,b)=>{
      const ta=a.situacao==='AGUARDANDO_CONTATO'?0:1,tb=b.situacao==='AGUARDANDO_CONTATO'?0:1;
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
  function byConcludedAsc(list){
    return [...list].sort((a,b)=>{
      const da=a.concluded_at?new Date(a.concluded_at).getTime():Infinity;
      const db=b.concluded_at?new Date(b.concluded_at).getTime():Infinity;
      return da-db;
    });
  }
  function byRespondedDesc(list){
    return [...list].sort((a,b)=>{
      const da=a.responded_at?new Date(a.responded_at).getTime():0;
      const db=b.responded_at?new Date(b.responded_at).getTime():0;
      return db-da;
    });
  }
  function filteredCases(){
    const f=cache.filter;
    const contactedTodayIds=f.contactedTodayOnly?new Set(cache.contactsToday.map(ct=>ct.nps_case_id)):null;
    const base=cache.cases.filter(c=>{
      if(f.filial&&c.filial!==f.filial)return false;
      if(f.situacao){const list=Array.isArray(f.situacao)?f.situacao:[f.situacao];if(!list.includes(c.situacao))return false}
      if(f.classification&&c.classification!==f.classification)return false;
      if(contactedTodayIds&&!contactedTodayIds.has(c.id))return false;
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
    const nonAttention=base.filter(c=>!isAttention(c));
    const pending=nonAttention.filter(c=>PENDING_SITUACOES.includes(c.situacao));
    const sent=nonAttention.filter(c=>CONTACTED_SITUACOES.includes(c.situacao));
    const responded=nonAttention.filter(isResponded);
    const other=nonAttention.filter(c=>!PENDING_SITUACOES.includes(c.situacao)&&!CONTACTED_SITUACOES.includes(c.situacao)&&!isResponded(c));
    return{
      pending:sortPending(pending),
      sent:byConcludedAsc(sent),
      responded:byRespondedDesc(responded),
      other:byConcludedAsc(other),
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
      <td>${c.nps_score!=null?E(c.nps_score):'—'}</td>
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
      <th>Cliente</th><th>OS Electrolux</th><th>Filial</th><th>Técnico</th><th>Responsável</th><th>Classificação</th><th>Situação</th><th>Elegível em</th><th>Visitas</th><th>Nota</th><th></th>
    </tr></thead>`;
  }

  function renderNpsScreen(){
    const app=document.querySelector('#app');
    if(!app)return;
    const ind=indicators();
    const{pending,sent,responded,other,attention}=filteredCases();
    app.innerHTML=`<div class="vx-nps">
      <div class="vx-nps-head">
        <div><button id="npsBack">← Voltar</button><h2>NPS Electrolux</h2><small>Acompanhamento da pesquisa de satisfação Electrolux</small></div>
      </div>
      <div class="vx-nps-indicators">
        <button type="button" class="vx-nps-ind ${cache.activeIndicator==='aguardando6h'?'active':''}" data-ind="aguardando6h"><span>Aguardando 6h</span><b>${ind.aguardando6h}</b></button>
        <button type="button" class="vx-nps-ind ${cache.activeIndicator==='elegiveisAgora'?'active':''}" data-ind="elegiveisAgora"><span>Elegíveis agora</span><b>${ind.elegiveisAgora}</b></button>
        <button type="button" class="vx-nps-ind ${cache.activeIndicator==='altaOportunidade'?'active':''}" data-ind="altaOportunidade"><span>Alta oportunidade</span><b>${ind.altaOportunidade}</b></button>
        <button type="button" class="vx-nps-ind ${cache.activeIndicator==='contatadosHoje'?'active':''}" data-ind="contatadosHoje"><span>Contatados hoje</span><b>${ind.contatadosHoje}</b></button>
        <button type="button" class="vx-nps-ind ${cache.activeIndicator==='aguardandoResposta'?'active':''}" data-ind="aguardandoResposta"><span>Aguardando resposta</span><b>${ind.aguardandoResposta}</b></button>
        <button type="button" class="vx-nps-ind vx-nps-ind-warn ${cache.activeIndicator==='casosAtencao'?'active':''}" data-ind="casosAtencao"><span>Casos de atenção</span><b>${ind.casosAtencao}</b></button>
        <button type="button" class="vx-nps-ind vx-nps-ind-ok ${cache.activeIndicator==='respondidos'?'active':''}" data-ind="respondidos"><span>Respondidos</span><b>${ind.respondidos}</b></button>
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
      <h3 class="vx-nps-section-title">Elegíveis / Pendentes</h3>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table">${tableHead()}<tbody>${pending.map(row).join('')||'<tr><td colspan="11">Nenhum caso pendente com esse filtro.</td></tr>'}</tbody></table></div>
      <h3 class="vx-nps-section-title">Enviados / Aguardando resposta</h3>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table">${tableHead()}<tbody>${sent.map(row).join('')||'<tr><td colspan="11">Nenhum caso enviado com esse filtro.</td></tr>'}</tbody></table></div>
      <h3 class="vx-nps-section-title vx-nps-section-ok">Respondidos</h3>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table">${tableHead()}<tbody>${responded.map(row).join('')||'<tr><td colspan="11">Nenhum caso respondido com esse filtro.</td></tr>'}</tbody></table></div>
      <h3 class="vx-nps-section-title vx-nps-section-warn">Casos de atenção</h3>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table">${tableHead()}<tbody>${attention.map(row).join('')||'<tr><td colspan="11">Nenhum caso de atenção com esse filtro.</td></tr>'}</tbody></table></div>
      <h3 class="vx-nps-section-title">Outros desfechos</h3>
      <div class="vx-nps-table-wrap"><table class="vx-nps-table">${tableHead()}<tbody>${other.map(row).join('')||'<tr><td colspan="11">Nenhum outro desfecho com esse filtro.</td></tr>'}</tbody></table></div>
    </div>`;

    document.getElementById('npsBack').onclick=goBack;
    app.querySelectorAll('[data-ind]').forEach(b=>b.onclick=()=>applyIndicatorFilter(b.dataset.ind));
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
      ${isResponded(c)?`<div class="vx-nps-alert vx-nps-alert-ok">✔ Respondido -- nota ${E(c.nps_score)}${c.technician_nps_score!=null?` (técnico: ${E(c.technician_nps_score)})`:''} em ${c.responded_at?new Date(c.responded_at).toLocaleString('pt-BR'):'—'}.${c.response_comment?` "${E(c.response_comment)}"`:''}</div>`:''}
      <div class="vx-nps-actions">
        <button id="npsSendFirst" ${!canWrite()||primeiro||aguardandoElegibilidade||isResponded(c)?'disabled':''}>Enviar primeiro contato</button>
        <button id="npsSendReminder" ${!canWrite()||!primeiro||(lembrete&&!isGestor())||isResponded(c)?'disabled':''}>${lembrete?'Autorizar novo lembrete (gestor)':'Enviar lembrete'}</button>
        <a href="${ELX_SURVEY_LINK}" target="_blank" rel="noopener" class="vx-nps-secondary-link">Enviar separadamente (Electrolux)</a>
      </div>
      <div class="vx-nps-actions">
        <button id="npsConfirmResponse" ${!canWrite()||isResponded(c)?'disabled':''}>Cliente confirmou que respondeu</button>
        <button id="npsNotReceived" ${!canWrite()||isResponded(c)?'disabled':''}>Cliente não recebeu</button>
        <button id="npsNoContact" ${!canWrite()||isResponded(c)?'disabled':''}>Cliente não deseja contato</button>
      </div>
      <div class="vx-nps-actions">
        <button id="npsAttention" ${!canWrite()||isResponded(c)?'disabled':''}>Marcar caso de atenção</button>
        <button id="npsFinalize" ${!canWrite()||isResponded(c)?'disabled':''}>Finalizar</button>
      </div>
      <div class="vx-nps-actions">
        <button id="npsMarkResponded" ${!canWrite()||isResponded(c)?'disabled':''}>Marcar como respondido (Electrolux)</button>
      </div>
      <div id="npsRespondedForm" class="vx-nps-responded-form" hidden>
        <p class="vx-nps-hint">Copie exatamente o que aparece no painel da Electrolux -- não existe hoje uma forma automática de trazer esse dado (a API integrada não devolve NPS).</p>
        <label>Nota (0-10)<input type="number" id="npsRespScore" min="0" max="10" step="1"></label>
        <label>Nota do técnico (0-10, opcional)<input type="number" id="npsRespTechScore" min="0" max="10" step="1"></label>
        <label>Data da resposta<input type="datetime-local" id="npsRespDate"></label>
        <label>Comentário (opcional)<textarea id="npsRespComment" rows="2"></textarea></label>
        <div class="vx-modal-actions">
          <button data-cancel-responded>Cancelar</button>
          <button id="npsRespConfirm" class="vx-nps-primary">Confirmar resposta</button>
        </div>
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

    const respondedForm=bg.querySelector('#npsRespondedForm');
    bg.querySelector('#npsMarkResponded').onclick=()=>{
      if(!canWrite()||isResponded(c))return;
      respondedForm.hidden=false;
      const now=new Date();
      now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
      bg.querySelector('#npsRespDate').value=now.toISOString().slice(0,16);
      bg.querySelector('#npsRespScore').focus();
    };
    bg.querySelector('[data-cancel-responded]').onclick=()=>{respondedForm.hidden=true};
    bg.querySelector('#npsRespConfirm').onclick=async()=>{
      const scoreRaw=bg.querySelector('#npsRespScore').value;
      const techScoreRaw=bg.querySelector('#npsRespTechScore').value;
      const dateRaw=bg.querySelector('#npsRespDate').value;
      const comment=bg.querySelector('#npsRespComment').value.trim()||null;
      const score=scoreRaw===''?null:Number(scoreRaw);
      const techScore=techScoreRaw===''?null:Number(techScoreRaw);
      if(score===null||!Number.isInteger(score)||score<0||score>10){toast?.('Informe a nota (0 a 10) exatamente como aparece no painel da Electrolux.','err');return}
      if(techScoreRaw!==''&&(!Number.isInteger(techScore)||techScore<0||techScore>10)){toast?.('Nota do técnico precisa ser um número de 0 a 10.','err');return}
      if(!dateRaw){toast?.('Informe a data da resposta.','err');return}
      const respondedAt=new Date(dateRaw).toISOString();
      await patchCase(c,{
        situacao:'RESPONDIDO',nps_score:score,technician_nps_score:techScore,
        response_comment:comment,responded_at:respondedAt,
      },'RESPONDIDO');
      toast?.('Resposta registrada -- caso retirado da fila de pendência.');
      bg.remove();renderNpsScreen();
    };
  }

  // Achado do usuário 2026-09-03: isto abria o wa.me manualmente antes;
  // depois passou a enviar automático pelo chat integrado -- mas o
  // usuário pediu uma etapa de revisão: a mensagem tem que aparecer
  // PRONTA no campo da conversa, o atendente relê/edita se precisar e
  // só sai quando ELE clica Enviar (chat-beta-v0828.js). Acha/abre a
  // conversa (mesma regra de "+ Nova" na Central,
  // window.vxFindOrCreateConversation), mesma conexão já usada pela
  // Central. "Enviado" (insertContact/patchCase) só é marcado depois
  // do envio de verdade -- vxOpenChatWithDraft arma window.
  // __vxNpsPendingContact, consumido em chat-beta-v0828.js só se essa
  // MESMA conversa for realmente enviada (window.vxNpsMarkContactSent
  // abaixo) -- nunca finge sucesso antes de o atendente agir.
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
    const phone=window.vxNormalizePhoneFull?.(ea.client_phone);
    if(!phone){toast?.('Telefone do cliente inválido -- confira DDD e quantidade de dígitos.','err');return}
    if(typeof window.vxFindOrCreateConversation!=='function'||typeof window.vxOpenChatWithDraft!=='function'){toast?.('Chat integrado indisponível no momento.','err');return}

    const sendBtn=bg.querySelector(contactType==='PRIMEIRO_CONTATO'?'#npsSendFirst':'#npsSendReminder');
    if(sendBtn){sendBtn.disabled=true;sendBtn.textContent='ABRINDO CONVERSA...'}
    try{
      const connRows=await api('chat_connections?status=eq.CONECTADO&select=id&limit=1').catch(()=>[]);
      const connectionId=connRows?.[0]?.id;
      if(!connectionId)throw new Error('Nenhuma conexão de WhatsApp conectada no momento.');
      const conversationId=await window.vxFindOrCreateConversation(connectionId,phone,ea.client_name||null);
      if(!conversationId)throw new Error('Não foi possível abrir a conversa.');

      window.__vxNpsPendingContact={caseId:c.id,contactType,phone:ea.client_phone,conversationId};
      bg.remove();
      await window.vxOpenChatWithDraft(conversationId,message);
      toast?.('Mensagem pronta no campo da conversa -- revise e clique Enviar quando quiser.');
    }catch(err){
      toast?.('Não foi possível abrir a conversa: '+(err.message||'erro desconhecido'),'err');
      if(sendBtn){sendBtn.disabled=false;sendBtn.textContent=contactType==='PRIMEIRO_CONTATO'?'Enviar primeiro contato':'Enviar lembrete'}
    }
  }

  // Consumido por chat-beta-v0828.js só depois do envio REAL confirmado
  // pelo gateway (nunca no momento de só preparar o rascunho).
  window.vxNpsMarkContactSent=async(caseId,contactType,phone,message)=>{
    try{
      const c=cache.cases.find(x=>String(x.id)===String(caseId));
      if(!c)return;
      const newSituacao=contactType==='PRIMEIRO_CONTATO'?'PRIMEIRO_CONTATO_ENVIADO':'LEMBRETE_ENVIADO';
      await insertContact(c,{contactType,phone,message,newSituacao});
      await patchCase(c,{situacao:newSituacao},newSituacao);
    }catch(e){
      console.error('[electrolux-nps] falha ao registrar contato enviado:',e);
    }
  };
})();
