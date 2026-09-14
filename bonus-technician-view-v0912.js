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

  const style=document.createElement('style');
  style.textContent=`.vx-bonus-no-sample-row td{color:#8b5200}.vx-bonus-no-sample-note{background:#fdf3e3;color:#8b5200;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:600;margin:8px 0 0}`;
  document.head.appendChild(style);

  // Achado do usuário (2026-09-14): .catch(()=>[]) escondia qualquer
  // falha real (tabela ausente, RLS, rede, RPC quebrada) atrás do
  // mesmo card "Não configurado" -- nunca dava pra saber se era um
  // backend nunca configurado ou um erro de verdade. fetchOrError()
  // loga o erro técnico real no console (nunca pro usuário comum) e
  // devolve {ok:false} pra quem chamou decidir a mensagem certa.
  async function fetchOrError(path, label){
    try{ return {ok:true, rows:await api(path)}; }
    catch(err){ console.error('[Bonificação] falha ao carregar '+label+':', err); return {ok:false, error:err}; }
  }
  async function fetchActiveProgram(cid){
    const r=await fetchOrError(`bonus_programs?company_id=eq.${cid}&status=eq.ATIVO&valid_to=is.null&select=id,name,period_start,period_end&order=created_at.desc&limit=1`, 'programa ativo');
    if(!r.ok)return {error:true};
    return r.rows?.[0]||null;
  }
  async function fetchMyResults(techId){
    const r=await fetchOrError(`bonus_results?technician_id=eq.${techId}&order=period_start.desc&select=*`, 'meus resultados');
    return r.ok?r.rows:{error:true};
  }

  // ---------- Card real no Dashboard ("Metas e Bonificação") ----------
  async function upgradeGoalsCard(){
    const card=document.querySelector('.vx-c-goals-card');
    if(!card)return;
    const cid=companyId();
    if(!cid)return;
    const program=await fetchActiveProgram(cid);
    if(program?.error){
      // Erro real de verdade (não "sem programa") -- nunca mostrar o
      // "Não configurado" padrão como se nada tivesse dado errado.
      card.querySelector('.vx-c-goals-empty p').textContent='Não foi possível carregar a Bonificação no momento.';
      return;
    }
    if(!program)return; // mantém o "Não configurado" já renderizado -- nunca inventa dado
    if(isTecnico()){
      const results=await fetchMyResults(myId());
      if(results.error){
        card.querySelector('.vx-c-goals-empty p').textContent='Não foi possível carregar seu resultado de Bonificação no momento.';
        return;
      }
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

  // Achado do usuário em 2026-09-14: técnico sem amostra válida de NPS
  // no período (ver migration 20260914040000) vem com achieved_percent
  // NULL e status='SEM_AMOSTRA' -- nunca 0%. Sem este tratamento a
  // célula ATINGIDO mostraria literalmente "null%". Peso mostrado como
  // "20% → 28,6%" quando a redistribuição mudou o peso efetivo deste
  // critério (nunca pro próprio critério sem amostra, que fica em 0%).
  function breakdownTable(criteriaResults){
    const arr=Array.isArray(criteriaResults)?criteriaResults:[];
    const hasNoSample=arr.some(c=>c.status==='SEM_AMOSTRA');
    return `<table class="vx-grid-table"><thead><tr><th>CRITÉRIO</th><th>PESO</th><th>ATINGIDO</th><th>POTENCIAL</th><th>CONQUISTADO</th></tr></thead><tbody>
      ${arr.map(c=>{
        const noSample=c.status==='SEM_AMOSTRA';
        const eff=c.effective_weight_percent;
        const pesoLabel=(!noSample&&eff!=null&&Math.abs(eff-c.weight_percent)>=0.05)?`${c.weight_percent}% → ${(Math.round(eff*10)/10)}%`:`${c.weight_percent}%`;
        const atingidoLabel=noSample?'<span title="Sem amostra suficiente neste período -- peso redistribuído entre os demais critérios, sem penalizar o técnico">N/A — sem amostra</span>':`${c.achieved_percent}%`;
        return `<tr${noSample?' class="vx-bonus-no-sample-row"':''}><td>${E(c.label)}</td><td>${pesoLabel}</td><td>${atingidoLabel}</td><td>${money(c.potential_share)}</td><td><b>${money(c.amount)}</b></td></tr>`;
      }).join('')}
    </tbody></table>${hasNoSample?'<p class="vx-bonus-no-sample-note">Um ou mais critérios ficaram sem amostra suficiente neste período — o peso deles foi redistribuído entre os demais, sem penalizar o técnico.</p>':''}`;
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
      const loadFailed=program?.error||results?.error;
      const safeResults=Array.isArray(results)?results:[];
      app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Produtividade / Bonificação</h2><p>Seus resultados -- só consulta, os parâmetros são definidos pelo gestor</p></div><div class="module-head-actions">${back}</div></div>
        ${loadFailed?'<div class="card"><p>Não foi possível carregar sua Bonificação no momento. Tente novamente em instantes.</p></div>'
          :!program?'<div class="card"><p>Nenhum programa de bonificação ativo no momento.</p></div>'
          :!safeResults.length?`<div class="card"><p>Programa "${E(program.name)}" ativo, mas ainda não há resultado calculado pra você.</p></div>`:''}
        ${!loadFailed&&safeResults.length?`<div class="vx-admin-card"><div class="vx-admin-title"><h3>EVOLUÇÃO</h3></div>
          <div class="vx-sg-list" id="vxBonusEvolutionList">${safeResults.map((r,i)=>`<div class="vx-sg-row" data-result-toggle="${i}" style="cursor:pointer"><b>${dateOnly(r.period_start)} a ${dateOnly(r.period_end)}</b><span>${r.status} · ${money(r.final_bonus)} de ${money(r.potential_bonus)} potencial</span></div><div class="vx-bonus-detail" id="vxBonusDetail${i}" hidden></div>`).join('')}</div>
        </div>`:''}
      </div>`;
      app.querySelectorAll('[data-result-toggle]').forEach(row=>{
        row.onclick=()=>{
          const i=row.dataset.resultToggle;
          const box=document.getElementById('vxBonusDetail'+i);
          if(!box)return;
          box.hidden=!box.hidden;
          if(!box.hidden&&!box.dataset.rendered){box.dataset.rendered='1';box.innerHTML=breakdownTable(safeResults[i].criteria_results);}
        };
      });
    }
    document.getElementById('vxBonusBack').onclick=()=>{const v=state.__vxBonusPrevView||'dashboard';state.__vxBonusPrevView=null;window.render(v);};
  };
})();
