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
  style.textContent=`.vx-sched-days{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}.vx-sched-days label{display:flex;align-items:center;gap:5px;font-size:10.5px;border:1px solid #dbe5ee;border-radius:6px;padding:5px 9px;cursor:pointer}.vx-sched-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.vx-sched-grid label{display:flex;flex-direction:column;gap:4px;font-size:9.5px;color:#6c7e90;font-weight:700}.vx-sched-grid input{border:1px solid #cfd9e3;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit}`;
  document.head.appendChild(style);
})();
