/* VoxAssist Web V0.9.07 — AGENDA: feriados e horário de funcionamento
   (Configurações). Achado do usuário em 2026-09-07 (ampliação do menu
   Configurações): company_holidays/company_schedule_settings são
   tabelas reais, já usadas pelo módulo Agenda (field-agenda-complete-
   v0813.js, funções openHoliday()/openSettings()) pra bloquear dias e
   calcular capacidade -- mas só editáveis de dentro da própria tela
   de Agenda. Aqui reaproveita EXATAMENTE o mesmo formato de dado (lido
   diretamente do arquivo antes de escrever este) -- não inventa
   colunas novas. Mesmo padrão de injeção validado nesta sessão pra
   Grupos de Atendimento/Lojas/Integrações: GESTOR-only,
   MutationObserver com debounce. */
(function(){
  const E=window.esc||((v='')=>String(v??''));
  const DAYS=[['1','Seg'],['2','Ter'],['3','Qua'],['4','Qui'],['5','Sex'],['6','Sáb'],['7','Dom']];

  function companyId(){return state?.profile?.active_company_id}
  function isGestor(){return String(state?.profile?.role||'').toUpperCase()==='GESTOR'}
  function uid(){return state?.session?.user?.id||state?.profile?.id||null}

  // Achado do usuário em 2026-09-07: card ia direto pra .vx-admin-page
  // (grid de 1 coluna só) -- empilhava numa lista longa. Reaproveita a
  // mesma grade compartilhada de 2 colunas (.vx-admin-grid, já
  // existente nesse painel) que os outros cards novos usam.
  function extrasGrid(page){
    let grid=page.querySelector('#vxAdminExtrasGrid');
    if(!grid){grid=document.createElement('div');grid.id='vxAdminExtrasGrid';grid.className='vx-config-extras-grid';page.appendChild(grid);}
    return grid;
  }

  async function enhance(){
   try{
    if(state?.view!=='usuarios'||!isGestor())return;
    const page=document.querySelector('.vx-admin-page');
    if(!page||page.dataset.vxSchedule==='1')return;
    const cid=companyId();if(!cid)return;
    page.dataset.vxSchedule='1';
    const card=document.createElement('section');
    card.className='vx-admin-card';
    card.id='vxScheduleCard';
    extrasGrid(page).appendChild(card);
    await renderCard(card,cid);
    const techCard=document.createElement('section');
    techCard.className='vx-admin-card';
    techCard.id='vxAgendaTechCard';
    extrasGrid(page).appendChild(techCard);
    await renderTechCard(techCard,cid);
    const regionsCard=document.createElement('section');
    regionsCard.className='vx-admin-card';
    regionsCard.id='vxServiceRegionsCard';
    extrasGrid(page).appendChild(regionsCard);
    await renderRegionsCard(cid);
    const techDetailsCard=document.createElement('section');
    techDetailsCard.className='vx-admin-card';
    techDetailsCard.id='vxTechDetailsCard';
    extrasGrid(page).appendChild(techDetailsCard);
    await renderTechDetailsCard(cid);
    const storeOverridesCard=document.createElement('section');
    storeOverridesCard.className='vx-admin-card';
    storeOverridesCard.id='vxStoreOverridesCard';
    extrasGrid(page).appendChild(storeOverridesCard);
    await renderStoreOverridesCard(cid);
   }catch(err){console.error('[schedule] falha ao injetar card:',err);}
  }

  // Achado do usuário em 2026-09-08 (Matriz Mestra, Área 04): "regiões
  // de atendimento" não existia (nem tabela, nem tela) -- catálogo
  // novo (service_regions, migration 20260908090000), sem semeadura.
  // Associar região a um técnico específico fica pra uma etapa futura.
  async function renderRegionsCard(cid){
    const card=document.getElementById('vxServiceRegionsCard');if(!card)return;
    const regions=cid?await api(`service_regions?company_id=eq.${cid}&select=*&order=sort_order`).catch(()=>[]):[];
    card.innerHTML=`<div class="vx-admin-title"><h3>REGIÕES DE ATENDIMENTO</h3><span>${regions.length}</span></div>
      <p class="vx-sg-help">Cidades/bairros/zonas atendidas pelo atendimento externo. Associar uma região a um técnico específico fica pra uma etapa futura.</p>
      <div class="vx-sg-list">${regions.length?regions.map(r=>`<div class="vx-sg-row${r.active?'':' inactive'}"><b>${E(r.name)}</b><span>${r.active?'ATIVA':'INATIVA'}</span><div class="vx-sg-row-actions"><button type="button" data-rename="${E(r.id)}">Renomear</button><button type="button" data-toggle="${E(r.id)}">${r.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhuma região cadastrada ainda.</p>'}</div>
      <button type="button" class="secondary" id="vxRegionNew">+ Nova região</button>`;
    card.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{
      const r=regions.find(x=>String(x.id)===b.dataset.rename);
      if(r)openRegionModal(cid,r);
    });
    card.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
      const r=regions.find(x=>String(x.id)===b.dataset.toggle);if(!r)return;
      b.disabled=true;
      try{
        await api('rpc/admin_upsert_service_region',{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:r.id,p_name:r.name,p_active:!r.active})});
        toast?.(r.active?'Região desativada.':'Região ativada.');
        await renderRegionsCard(cid);
      }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');b.disabled=false;}
    });
    document.getElementById('vxRegionNew').onclick=()=>openRegionModal(cid,null);
  }
  function openRegionModal(cid,region){
    document.querySelector('#vxRegionModal')?.remove();
    const ov=document.createElement('div');ov.id='vxRegionModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${region?'Renomear região':'Nova região'}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxRegionForm" class="vx-admin-form"><label>NOME *</label><input name="name" required maxlength="60" value="${region?E(region.name):''}" placeholder="EX.: CENTRO, JARDIM CAMBURI"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        await api('rpc/admin_upsert_service_region',{method:'POST',body:JSON.stringify({p_company_id:cid,p_id:region?.id||null,p_name:String(f.get('name')).trim(),p_active:region?region.active:true})});
        ov.remove();
        toast?.(region?'Região atualizada.':'Região criada.');
        await renderRegionsCard(cid);
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
  }

  // Achado do usuário em 2026-09-08 (Matriz Mestra, Área 04):
  // profiles.external_schedule_enabled já era lido em vários lugares
  // (field-agenda-complete-v0813.js e outros) pra decidir quem
  // participa da agenda externa, mas nunca tinha nenhum jeito de
  // ESCREVER esse campo pelo app -- só direto no banco. RPC nova
  // (admin_set_technician_external_schedule, migration
  // 20260908080000), gestor-only.
  async function renderTechCard(card,cid){
    // admin_company_users não devolve external_schedule_enabled --
    // RLS de profiles (profiles_select_company) já escopa por empresa
    // ativa sozinha, sem precisar de RPC pra essa leitura.
    const techs=await api('profiles?role=eq.TECNICO&active=eq.true&select=id,full_name,external_schedule_enabled&order=full_name').catch(()=>[]);
    card.innerHTML=`<div class="vx-admin-title"><h3>TÉCNICOS — AGENDA EXTERNA</h3><span>${techs.length}</span></div>
      <p class="vx-sg-help">Quem participa da agenda de atendimento externo (visitas ao cliente). Não duplica o cadastro do técnico -- só liga/desliga essa característica.</p>
      <div class="vx-sg-list">${techs.length?techs.map(t=>`<label class="vx-sg-row" style="cursor:pointer"><b style="flex:1">${E(t.full_name)}</b><input type="checkbox" data-tech="${E(t.id)}" ${t.external_schedule_enabled?'checked':''}></label>`).join(''):'<p class="vx-sg-empty">Nenhum técnico cadastrado nesta empresa ainda.</p>'}</div>`;
    card.querySelectorAll('[data-tech]').forEach(cb=>cb.onchange=async()=>{
      cb.disabled=true;
      try{
        await api('rpc/admin_set_technician_external_schedule',{method:'POST',body:JSON.stringify({p_user_id:cb.dataset.tech,p_company_id:cid,p_enabled:cb.checked})});
        toast?.(cb.checked?'Técnico adicionado à agenda externa.':'Técnico removido da agenda externa.');
      }catch(err){toast?.('Não foi possível alterar: '+err.message,'err');cb.checked=!cb.checked;}
      finally{cb.disabled=false;}
    });
  }

  // Achado do usuário em 2026-09-09 (Matriz Mestra, Área 01 -- decisão
  // sobre Técnicos): região = associação com service_regions
  // (catálogo já existente). Especialidade = NÃO texto livre nem
  // dicionário novo -- reaproveita product_types (catálogo mestre
  // GLOBAL da Área 03, nunca duplicado por empresa) como o próprio
  // vocabulário de especialidade. Disponibilidade = 1 linha por dia
  // da semana por técnico (technician_availability, migration
  // 20260909010000), mesmas chaves de dia de companies.business_hours
  // pra manter consistência. Escopo desta etapa: cadastro + exibição
  // -- roteamento automático por região/especialidade/disponibilidade
  // fica pra evolução futura, nenhuma regra de atribuição de OS é
  // alterada aqui.
  const AVAIL_DAYS=[['seg','Seg'],['ter','Ter'],['qua','Qua'],['qui','Qui'],['sex','Sex'],['sab','Sáb'],['dom','Dom']];

  async function renderTechDetailsCard(cid){
    const card=document.getElementById('vxTechDetailsCard');if(!card)return;
    const techs=await api('profiles?role=eq.TECNICO&active=eq.true&select=id,full_name&order=full_name').catch(()=>[]);
    card.innerHTML=`<div class="vx-admin-title"><h3>TÉCNICOS — REGIÃO, ESPECIALIDADE E DISPONIBILIDADE</h3><span>${techs.length}</span></div>
      <p class="vx-sg-help">Região de atendimento, tipos de produto que domina e dias/horários em que pode ser agendado. Cadastro + uso na Agenda -- roteamento automático por essas regras fica pra uma etapa futura.</p>
      <div class="vx-sg-list">${techs.length?techs.map(t=>`<div class="vx-sg-row"><b>${E(t.full_name)}</b><div class="vx-sg-row-actions"><button type="button" data-config="${E(t.id)}">Configurar</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhum técnico cadastrado nesta empresa ainda.</p>'}</div>`;
    card.querySelectorAll('[data-config]').forEach(b=>b.onclick=()=>{
      const t=techs.find(x=>String(x.id)===b.dataset.config);
      if(t)openTechDetailsModal(cid,t);
    });
  }

  async function openTechDetailsModal(cid,tech){
    document.querySelector('#vxTechDetailsModal')?.remove();
    const [regions,groups,types,myRegions,mySpecialties,myAvail]=await Promise.all([
      api(`service_regions?company_id=eq.${cid}&active=eq.true&select=id,name&order=sort_order`).catch(()=>[]),
      api('product_groups?select=id,name&order=name').catch(()=>[]),
      api('product_types?active=eq.true&select=id,name,group_id&order=name').catch(()=>[]),
      api(`technician_regions?company_id=eq.${cid}&technician_id=eq.${tech.id}&select=region_id`).catch(()=>[]),
      api(`technician_specialties?company_id=eq.${cid}&technician_id=eq.${tech.id}&select=product_type_id`).catch(()=>[]),
      api(`technician_availability?company_id=eq.${cid}&technician_id=eq.${tech.id}&select=*`).catch(()=>[]),
    ]);
    const regionSet=new Set(myRegions.map(r=>String(r.region_id)));
    const typeSet=new Set(mySpecialties.map(s=>String(s.product_type_id)));
    const availByDay=Object.fromEntries(myAvail.map(a=>[a.weekday,a]));
    const ov=document.createElement('div');ov.id='vxTechDetailsModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>${E(tech.full_name)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">
      <h4 style="margin:0 0 6px;font-size:10px;text-transform:uppercase;color:#6c7e90">REGIÕES DE ATENDIMENTO</h4>
      <div class="vx-store-checks">${regions.length?regions.map(r=>`<label><input type="checkbox" data-region value="${E(r.id)}" ${regionSet.has(String(r.id))?'checked':''}> <b>${E(r.name)}</b></label>`).join(''):'<span class="vx-sg-empty">Nenhuma região cadastrada -- crie em "Regiões de Atendimento" nesta mesma tela.</span>'}</div>
      <h4 style="margin:14px 0 6px;font-size:10px;text-transform:uppercase;color:#6c7e90">ESPECIALIDADE (TIPOS DE PRODUTO)</h4>
      <div class="vx-store-checks">${types.length?groups.map(g=>types.filter(t=>String(t.group_id)===String(g.id))).flat().concat(types.filter(t=>!groups.some(g=>String(g.id)===String(t.group_id)))).map(t=>`<label><input type="checkbox" data-type value="${E(t.id)}" ${typeSet.has(String(t.id))?'checked':''}> <b>${E(t.name)}</b></label>`).join(''):'<span class="vx-sg-empty">Nenhum tipo de produto no catálogo.</span>'}</div>
      <h4 style="margin:14px 0 6px;font-size:10px;text-transform:uppercase;color:#6c7e90">DISPONIBILIDADE</h4>
      <div class="vx-avail-grid">${AVAIL_DAYS.map(([k,l])=>{const a=availByDay[k];const av=a?a.available:true;return `<div class="vx-avail-row"><label><input type="checkbox" data-avail-day="${k}" ${av?'checked':''}> ${l}</label><input type="time" data-avail-start="${k}" value="${a?.start_time?String(a.start_time).slice(0,5):''}" ${av?'':'disabled'}><span>até</span><input type="time" data-avail-end="${k}" value="${a?.end_time?String(a.end_time).slice(0,5):''}" ${av?'':'disabled'}></div>`;}).join('')}</div>
      <div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>FECHAR</button><button type="button" class="primary" id="vxTechDetailsSave">SALVAR</button></div>
    </div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelectorAll('[data-avail-day]').forEach(cb=>cb.onchange=()=>{
      const row=cb.closest('.vx-avail-row');
      row.querySelectorAll('input[type=time]').forEach(i=>i.disabled=!cb.checked);
    });
    ov.querySelector('#vxTechDetailsSave').onclick=async()=>{
      const btn=ov.querySelector('#vxTechDetailsSave');btn.disabled=true;
      try{
        const regionIds=[...ov.querySelectorAll('[data-region]:checked')].map(x=>x.value);
        const typeIds=[...ov.querySelectorAll('[data-type]:checked')].map(x=>x.value);
        await api('rpc/admin_set_technician_regions',{method:'POST',body:JSON.stringify({p_company_id:cid,p_technician_id:tech.id,p_region_ids:regionIds})});
        await api('rpc/admin_set_technician_specialties',{method:'POST',body:JSON.stringify({p_company_id:cid,p_technician_id:tech.id,p_product_type_ids:typeIds})});
        for(const [k] of AVAIL_DAYS){
          const dayCb=ov.querySelector(`[data-avail-day="${k}"]`);
          const start=ov.querySelector(`[data-avail-start="${k}"]`).value||null;
          const end=ov.querySelector(`[data-avail-end="${k}"]`).value||null;
          await api('rpc/admin_set_technician_availability',{method:'POST',body:JSON.stringify({p_company_id:cid,p_technician_id:tech.id,p_weekday:k,p_available:dayCb.checked,p_start_time:dayCb.checked?start:null,p_end_time:dayCb.checked?end:null})});
        }
        toast?.('Dados do técnico salvos.');
        ov.remove();
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
  }

  // Achado do usuário em 2026-09-09 (Matriz Mestra, Área 01 --
  // "Parâmetros próprios por unidade"): companies.business_hours é
  // decorativo, nunca lido em lógica real -- quem de fato importa é
  // company_schedule_settings (work_days/capacidade), hoje só por
  // empresa. Sobrescrita por loja em store_schedule_overrides
  // (migration 20260909040000, mirror exato das colunas -- sem
  // chave/valor genérica), ausência de linha = usa o padrão da
  // empresa. Escopo desta etapa é só o CADASTRO da sobrescrita --
  // ligar no motor real de capacidade da Agenda
  // (field-agenda-complete-v0813.js, hoje 100% por empresa) fica pra
  // uma etapa futura própria.
  async function renderStoreOverridesCard(cid){
    const card=document.getElementById('vxStoreOverridesCard');if(!card)return;
    const [stores,overrides]=await Promise.all([
      api(`stores?company_id=eq.${cid}&active=eq.true&select=id,name,code&order=name`).catch(()=>[]),
      api(`store_schedule_overrides?company_id=eq.${cid}&select=store_id`).catch(()=>[]),
    ]);
    const overrideSet=new Set(overrides.map(o=>String(o.store_id)));
    card.innerHTML=`<div class="vx-admin-title"><h3>PARÂMETROS POR UNIDADE</h3><span>${stores.length}</span></div>
      <p class="vx-sg-help">Dias de funcionamento e capacidade específicos de uma loja, quando diferente do padrão da empresa (acima). Sem sobrescrita, a loja usa o padrão da empresa.</p>
      <div class="vx-sg-list">${stores.length?stores.map(s=>`<div class="vx-sg-row"><b>${E(s.code||s.name)}</b><span>${overrideSet.has(String(s.id))?'PRÓPRIO':'PADRÃO DA EMPRESA'}</span><div class="vx-sg-row-actions"><button type="button" data-config-store="${E(s.id)}">Configurar</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhuma loja cadastrada ainda.</p>'}</div>`;
    card.querySelectorAll('[data-config-store]').forEach(b=>b.onclick=()=>{
      const s=stores.find(x=>String(x.id)===b.dataset.configStore);
      if(s)openStoreOverrideModal(cid,s);
    });
  }

  async function openStoreOverrideModal(cid,store){
    const [companyRows,storeRows]=await Promise.all([
      api(`company_schedule_settings?company_id=eq.${cid}&select=*&limit=1`).catch(()=>[]),
      api(`store_schedule_overrides?store_id=eq.${store.id}&select=*`).catch(()=>[]),
    ]);
    const def=companyRows?.[0]||{work_days:[1,2,3,4,5],default_duration_minutes:50,morning_capacity_minutes:240,afternoon_capacity_minutes:240,morning_enabled:true,afternoon_enabled:true};
    const own=storeRows?.[0]||null;
    const s=own||def;
    const workDays=new Set(s.work_days||def.work_days||[1,2,3,4,5]);
    document.querySelector('#vxStoreOverrideModal')?.remove();
    const ov=document.createElement('div');ov.id='vxStoreOverrideModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>Parâmetros -- ${E(store.code||store.name)}</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body">
      ${own?'<p class="vx-sg-help">Esta loja tem parâmetros PRÓPRIOS (diferentes do padrão da empresa).</p>':'<p class="vx-sg-help">Esta loja usa o padrão da empresa. Salvar abaixo cria uma sobrescrita própria.</p>'}
      <div class="vx-sched-days">${DAYS.map(([v,l])=>`<label><input type="checkbox" data-day="${v}" ${workDays.has(Number(v))?'checked':''}> ${l}</label>`).join('')}</div>
      <div class="vx-sched-grid">
        <label>DURAÇÃO PADRÃO (MIN)<input id="vxStoOvDur" type="number" min="5" value="${Number(s.default_duration_minutes??def.default_duration_minutes??50)}"></label>
        <label>CAPACIDADE MANHÃ (MIN)<input id="vxStoOvManha" type="number" min="0" value="${Number(s.morning_capacity_minutes??def.morning_capacity_minutes??240)}"></label>
        <label>CAPACIDADE TARDE (MIN)<input id="vxStoOvTarde" type="number" min="0" value="${Number(s.afternoon_capacity_minutes??def.afternoon_capacity_minutes??240)}"></label>
      </div>
      <div class="vx-admin-form-actions">${own?'<button type="button" class="secondary danger" id="vxStoOvClear">USAR PADRÃO DA EMPRESA</button>':''}<span class="grow"></span><button type="button" class="secondary" data-cancel>CANCELAR</button><button type="button" class="primary" id="vxStoOvSave">SALVAR PRÓPRIO DESTA LOJA</button></div>
    </div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('#vxStoOvSave').onclick=async()=>{
      const btn=ov.querySelector('#vxStoOvSave');btn.disabled=true;
      const work_days=[...ov.querySelectorAll('[data-day]:checked')].map(x=>Number(x.dataset.day));
      try{
        await api('rpc/admin_set_store_schedule_override',{method:'POST',body:JSON.stringify({p_company_id:cid,p_store_id:store.id,p_work_days:work_days,p_morning_enabled:true,p_afternoon_enabled:true,p_default_duration_minutes:Number(ov.querySelector('#vxStoOvDur').value)||50,p_morning_capacity_minutes:Number(ov.querySelector('#vxStoOvManha').value)||240,p_afternoon_capacity_minutes:Number(ov.querySelector('#vxStoOvTarde').value)||240})});
        toast?.('Parâmetros próprios da loja salvos.');
        ov.remove();
        await renderStoreOverridesCard(cid);
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');btn.disabled=false;}
    };
    ov.querySelector('#vxStoOvClear')?.addEventListener('click',async()=>{
      if(!confirm('Remover os parâmetros próprios desta loja? Ela volta a usar o padrão da empresa.'))return;
      try{
        await api('rpc/admin_clear_store_schedule_override',{method:'POST',body:JSON.stringify({p_company_id:cid,p_store_id:store.id})});
        toast?.('Loja voltou a usar o padrão da empresa.');
        ov.remove();
        await renderStoreOverridesCard(cid);
      }catch(err){toast?.('Não foi possível remover: '+err.message,'err');}
    });
  }

  async function renderCard(card,cid){
    const [holidays,settingsRows]=await Promise.all([
      api(`company_holidays?company_id=eq.${cid}&select=*&order=holiday_date`).catch(()=>[]),
      api(`company_schedule_settings?company_id=eq.${cid}&select=*&limit=1`).catch(()=>[]),
    ]);
    const s=settingsRows?.[0]||{work_days:[1,2,3,4,5],default_duration_minutes:50,morning_capacity_minutes:240,afternoon_capacity_minutes:240};
    const workDays=new Set(s.work_days||[1,2,3,4,5]);
    card.innerHTML=`<div class="vx-admin-title"><h3>AGENDA — FERIADOS E HORÁRIO</h3></div>
      <p class="vx-sg-help">Dias sem expediente e capacidade padrão de atendimento externo -- usados pelo módulo Agenda pra bloquear datas e calcular disponibilidade.</p>
      <div class="vx-sched-days">${DAYS.map(([v,l])=>`<label><input type="checkbox" data-day="${v}" ${workDays.has(Number(v))?'checked':''}> ${l}</label>`).join('')}</div>
      <div class="vx-sched-grid">
        <label>DURAÇÃO PADRÃO (MIN)<input id="vxSchedDur" type="number" min="5" value="${Number(s.default_duration_minutes||50)}"></label>
        <label>CAPACIDADE MANHÃ (MIN)<input id="vxSchedManha" type="number" min="0" value="${Number(s.morning_capacity_minutes||240)}"></label>
        <label>CAPACIDADE TARDE (MIN)<input id="vxSchedTarde" type="number" min="0" value="${Number(s.afternoon_capacity_minutes||240)}"></label>
      </div>
      <button type="button" class="secondary" id="vxSchedSave">Salvar jornada</button>
      <div class="vx-sg-list" style="margin-top:14px">${holidays.length?holidays.map(h=>`<div class="vx-sg-row"><b>${E(h.name||'FERIADO')}</b><span>${new Date(h.holiday_date+'T12:00:00').toLocaleDateString('pt-BR')}${h.work_allowed?' • empresa trabalha':''}</span><div class="vx-sg-row-actions"><button type="button" data-del-holiday="${E(h.id)}">Excluir</button></div></div>`).join(''):'<p class="vx-sg-empty">Nenhum feriado cadastrado ainda.</p>'}</div>
      <button type="button" class="secondary" id="vxHolNew">+ Novo feriado</button>`;

    card.querySelector('#vxSchedSave').onclick=async()=>{
      const btn=card.querySelector('#vxSchedSave');btn.disabled=true;
      const work_days=[...card.querySelectorAll('[data-day]:checked')].map(x=>Number(x.dataset.day));
      const body={company_id:cid,work_days,default_duration_minutes:Number(card.querySelector('#vxSchedDur').value)||50,morning_capacity_minutes:Number(card.querySelector('#vxSchedManha').value)||240,afternoon_capacity_minutes:Number(card.querySelector('#vxSchedTarde').value)||240,updated_by:uid(),updated_at:new Date().toISOString()};
      try{
        if(settingsRows?.length)await api(`company_schedule_settings?company_id=eq.${cid}`,{method:'PATCH',body:JSON.stringify(body)});
        else await api('company_schedule_settings',{method:'POST',body:JSON.stringify(body)});
        toast?.('Jornada da empresa atualizada.');
        await renderCard(card,cid);
      }catch(err){toast?.('Não foi possível salvar a jornada: '+err.message,'err');btn.disabled=false;}
    };
    card.querySelectorAll('[data-del-holiday]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Excluir este feriado?'))return;
      b.disabled=true;
      try{
        await api(`company_holidays?id=eq.${b.dataset.delHoliday}`,{method:'DELETE'});
        toast?.('Feriado excluído.');
        await renderCard(card,cid);
      }catch(err){toast?.('Não foi possível excluir: '+err.message,'err');b.disabled=false;}
    });
    card.querySelector('#vxHolNew').onclick=()=>openHolidayModal(card,cid);
  }

  function openHolidayModal(card,cid){
    document.querySelector('#vxHolModal')?.remove();
    const ov=document.createElement('div');ov.id='vxHolModal';ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>Novo feriado</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><form id="vxHolForm" class="vx-admin-form"><label>DATA *</label><input name="date" type="date" required><label>DESCRIÇÃO</label><input name="name" maxlength="80" placeholder="FERIADO MUNICIPAL, ESTADUAL…"><label><input type="checkbox" name="work_allowed"> Empresa trabalhará neste dia</label><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button class="primary">SALVAR</button></div></form></div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-close],[data-cancel]').forEach(b=>b.onclick=()=>ov.remove());
    ov.querySelector('form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        await api('company_holidays',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({company_id:cid,holiday_date:f.get('date'),name:String(f.get('name')||'').trim()||'FERIADO',work_allowed:!!f.get('work_allowed'),created_by:uid()})});
        ov.remove();
        toast?.('Feriado cadastrado.');
        await renderCard(card,cid);
      }catch(err){toast?.('Não foi possível salvar o feriado: '+err.message,'err');btn.disabled=false;}
    };
  }

  let enhanceDebounce=null;
  function scheduleEnhance(){
    if(enhanceDebounce)clearTimeout(enhanceDebounce);
    enhanceDebounce=setTimeout(enhance,120);
  }
  const baseRender=window.render;
  window.render=async function(view){const r=await baseRender(view);if(view==='usuarios')scheduleEnhance();return r};

  const appRoot=document.querySelector('#app')||document.body;
  new MutationObserver(()=>{if(state?.view==='usuarios')scheduleEnhance();}).observe(appRoot,{childList:true,subtree:true});

  const style=document.createElement('style');
  style.textContent=`.vx-sched-days{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}.vx-sched-days label{display:flex;align-items:center;gap:5px;font-size:10.5px;border:1px solid #dbe5ee;border-radius:6px;padding:5px 9px;cursor:pointer}.vx-sched-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.vx-sched-grid label{display:flex;flex-direction:column;gap:4px;font-size:9.5px;color:#6c7e90;font-weight:700}.vx-sched-grid input{border:1px solid #cfd9e3;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit}
  .vx-avail-grid{display:flex;flex-direction:column;gap:6px}.vx-avail-row{display:flex;align-items:center;gap:8px;font-size:11.5px}.vx-avail-row label{display:flex;align-items:center;gap:5px;min-width:52px;font-weight:700}.vx-avail-row input[type=time]{border:1px solid #cfd9e3;border-radius:6px;padding:4px 6px;font-size:11px;font-family:inherit}.vx-avail-row input[type=time]:disabled{opacity:.4}.vx-avail-row span{font-size:10px;color:#8a96a3}`;
  document.head.appendChild(style);
})();
