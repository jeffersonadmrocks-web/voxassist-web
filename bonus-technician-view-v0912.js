/* VoxAssist Web V0.9.12 — Fase 3 do motor de Bonificação: card real no
   Dashboard + tela pessoal do técnico (consulta própria, sem editar
   parâmetros). Nunca edita runtime/dashboard-canonical-v1.js
   diretamente (arquivo grande, único, de fonte real de produtividade)
   -- injeta por wrap de window.renderDashboard e manipulação do DOM
   já renderizado, mesmo padrão de permissions-catalog-v0901.js. */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const isTecnico=()=>String(state?.profile?.role||'').toUpperCase()==='TECNICO';
  const companyId=()=>state?.profile?.active_company_id;
  const myId=()=>state?.profile?.id||state?.session?.user?.id;
  const dateOnly=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';

  async function fetchActiveProgram(cid){
    const rows=await api(`bonus_programs?company_id=eq.${cid}&status=eq.ATIVO&valid_to=is.null&select=id,name,period_start,period_end&order=created_at.desc&limit=1`).catch(()=>[]);
    return rows?.[0]||null;
  }
  async function fetchMyResults(techId){
    return await api(`bonus_results?technician_id=eq.${techId}&order=period_start.desc&select=*`).catch(()=>[]);
  }

  // ---------- Card real no Dashboard ("Metas e Bonificação") ----------
  async function upgradeGoalsCard(){
    const card=document.querySelector('.vx-c-goals-card');
    if(!card)return;
    const cid=companyId();
    if(!cid)return;
    const program=await fetchActiveProgram(cid);
    if(!program)return; // mantém o "Não configurado" já renderizado -- nunca inventa dado
    if(isTecnico()){
      const results=await fetchMyResults(myId());
      const current=results.find(r=>r.period_start<=program.period_end&&r.period_end>=program.period_start)||results[0];
      if(!current){
        card.querySelector('.vx-c-goals-empty p').textContent=`Programa "${program.name}" ativo (${dateOnly(program.period_start)} a ${dateOnly(program.period_end)}), mas ainda sem resultado calculado pra você neste período.`;
        return;
      }
      card.innerHTML=`<div class="vx-c-title"><h3>Metas e Bonificação</h3><span class="vx-c-goals-status">${current.status}</span></div>
        <div class="vx-c-fin-grid">
          <div><span>Período</span><b>${dateOnly(current.period_start)} a ${dateOnly(current.period_end)}</b></div>
          <div><span>Média OS/dia</span><b>${current.avg_daily_closed_os}</b></div>
          <div><span>Bônus potencial</span><b>${money(current.potential_bonus)}</b></div>
          <div><span>Bônus conquistado</span><b style="color:#078f46">${money(current.final_bonus)}</b></div>
        </div>
        <button type="button" class="secondary" data-bonus-details style="margin-top:8px">Ver detalhes por critério</button>`;
      card.querySelector('[data-bonus-details]').onclick=()=>window.renderBonusTechnicianView?.();
    }else{
      card.innerHTML=`<div class="vx-c-title"><h3>Metas e Bonificação</h3></div><div class="vx-c-goals-empty"><p>Programa "${E(program.name)}" ativo (${dateOnly(program.period_start)} a ${dateOnly(program.period_end)}). Gerencie em Configurações → Financeiro → Bonificação.</p></div>`;
    }
  }
  const baseDashboard=window.renderDashboard;
  if(typeof baseDashboard==='function')window.renderDashboard=async function(){const r=await baseDashboard.apply(this,arguments);upgradeGoalsCard();return r;};

  // ---------- Liga o botão "Produtividade / Bonificação" (lowerTabs, hoje inerte) ----------
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('button');
    if(b&&(b.textContent||'').trim()==='Produtividade / Bonificação'){
      e.preventDefault();
      window.renderBonusTechnicianView?.();
    }
  },true);

  function breakdownTable(criteriaResults){
    const arr=Array.isArray(criteriaResults)?criteriaResults:[];
    return `<table class="vx-grid-table"><thead><tr><th>CRITÉRIO</th><th>PESO</th><th>ATINGIDO</th><th>POTENCIAL</th><th>CONQUISTADO</th></tr></thead><tbody>
      ${arr.map(c=>`<tr><td>${E(c.label)}</td><td>${c.weight_percent}%</td><td>${c.achieved_percent}%</td><td>${money(c.potential_share)}</td><td><b>${money(c.amount)}</b></td></tr>`).join('')}
    </tbody></table>`;
  }

  window.renderBonusTechnicianView=async function(){
    const app=document.querySelector('#app');if(!app)return;
    if(!state.__vxBonusPrevView)state.__vxBonusPrevView=state.view;
    app.innerHTML='<div class="card">Carregando produtividade e bonificação...</div>';
    const back=`<button class="secondary" id="vxBonusBack">← Voltar</button>`;

    if(isGestor()){
      app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Produtividade / Bonificação</h2><p>Gestão do programa de bonificação</p></div><div class="module-head-actions">${back}</div></div>
        <div class="card"><p>A configuração completa do programa, critérios, faixas, simulador e histórico de todos os técnicos fica em <b>Configurações → Financeiro → Bonificação dos Técnicos</b>.</p>
        <button type="button" class="primary" id="vxBonusGoSettings">Abrir Configurações</button></div></div>`;
      document.getElementById('vxBonusGoSettings').onclick=()=>{window.__vxConfigSection='financeiro';window.render('usuarios');};
    }else{
      const cid=companyId();
      const [program,results]=await Promise.all([cid?fetchActiveProgram(cid):null,fetchMyResults(myId())]);
      app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Produtividade / Bonificação</h2><p>Seus resultados -- só consulta, os parâmetros são definidos pelo gestor</p></div><div class="module-head-actions">${back}</div></div>
        ${!program?'<div class="card"><p>Nenhum programa de bonificação ativo no momento.</p></div>':!results.length?`<div class="card"><p>Programa "${E(program.name)}" ativo, mas ainda não há resultado calculado pra você.</p></div>`:''}
        ${results.length?`<div class="vx-admin-card"><div class="vx-admin-title"><h3>EVOLUÇÃO</h3></div>
          <div class="vx-sg-list" id="vxBonusEvolutionList">${results.map((r,i)=>`<div class="vx-sg-row" data-result-toggle="${i}" style="cursor:pointer"><b>${dateOnly(r.period_start)} a ${dateOnly(r.period_end)}</b><span>${r.status} · ${money(r.final_bonus)} de ${money(r.potential_bonus)} potencial</span></div><div class="vx-bonus-detail" id="vxBonusDetail${i}" hidden></div>`).join('')}</div>
        </div>`:''}
      </div>`;
      app.querySelectorAll('[data-result-toggle]').forEach(row=>{
        row.onclick=()=>{
          const i=row.dataset.resultToggle;
          const box=document.getElementById('vxBonusDetail'+i);
          if(!box)return;
          box.hidden=!box.hidden;
          if(!box.hidden&&!box.dataset.rendered){box.dataset.rendered='1';box.innerHTML=breakdownTable(results[i].criteria_results);}
        };
      });
    }
    document.getElementById('vxBonusBack').onclick=()=>{const v=state.__vxBonusPrevView||'dashboard';state.__vxBonusPrevView=null;window.render(v);};
  };
})();
