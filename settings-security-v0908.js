/* VoxAssist Web V0.9.08 — Configurações > Sistema & Segurança.
   Matriz Mestra, Área 09 -- "Tempo de inatividade / encerramento
   automático": CRIAR confirmado, nenhum watcher de inatividade
   existe hoje (user-logoff-v0813.js só cobre logoff manual/troca de
   aba). Migration 20260908150000, coluna em companies (mesmo padrão
   de finance_*).
   Escopo desta etapa é só o CADASTRO do parâmetro -- implementar o
   watcher de inatividade de verdade fica pra uma etapa futura;
   nenhuma sessão é encerrada automaticamente por este código.
   Primeira tela real da Área 09 -- hub (settings-hub-v0908.js) sai
   de 'admin' e passa a apontar pra 'seguranca'. Reset Master
   continua na tela única de Empresa & Usuários (REAPROVEITAR, já
   implementado, não duplicado aqui). */
(function(){
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';
  const companyId=()=>state?.profile?.active_company_id;

  window.renderSecuritySettings=async function(){
    const app=document.querySelector('#app');if(!app)return;
    if(!isGestor()){app.innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Configurações disponíveis somente para gestores.</p></div>';return;}
    const cid=companyId();
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Sistema & Segurança</h2><p>Sessão desta empresa</p></div><div class="module-head-actions"><button class="secondary" id="vxSecBack">← Voltar</button></div></div>
      <section class="vx-admin-card" id="vxSecSessionCard"></section>
      <section class="vx-admin-card" id="vxSecAuditCard" style="margin-top:12px"></section>
    </div>`;
    document.getElementById('vxSecBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
    renderSession(cid);
    renderAudit(cid);
  };

  const E=window.esc||((v='')=>String(v??''));
  const AUDIT_AREA_LABELS={EMPRESA:'Dados da empresa',USUARIO:'Usuário',SISTEMA:'Sistema'};

  async function renderAudit(cid){
    const card=document.getElementById('vxSecAuditCard');if(!card)return;
    const rows=cid?await api(`audit_log?company_id=eq.${cid}&select=area,action,entity_type,created_at&order=created_at.desc&limit=20`).catch(()=>[]):[];
    card.innerHTML=`<div class="vx-admin-title"><h3>AUDITORIA -- ÚLTIMOS 20 REGISTROS</h3></div>
      <p class="vx-sg-help">Registro automático de alterações sensíveis (dados da empresa, acesso de usuários). Cobertura parcial -- expandir pra mais ações fica pra uma etapa futura.</p>
      <div class="vx-sg-list">${rows.length?rows.map(r=>`<div class="vx-sg-row"><b>${AUDIT_AREA_LABELS[r.area]||E(r.area)} -- ${E(r.action)}</b><span>${new Date(r.created_at).toLocaleString('pt-BR')}</span></div>`).join(''):'<p class="vx-sg-empty">Nenhum registro ainda.</p>'}</div>`;
  }

  async function renderSession(cid){
    const card=document.getElementById('vxSecSessionCard');if(!card)return;
    const rows=cid?await api(`companies?id=eq.${cid}&select=session_idle_timeout_minutes`).catch(()=>[]):[];
    const c=rows?.[0]||{};
    card.innerHTML=`<div class="vx-admin-title"><h3>TEMPO DE INATIVIDADE</h3></div>
      <p class="vx-sg-help">Minutos de inatividade até encerrar a sessão automaticamente. Cadastro apenas -- ainda não existe nenhum monitor de inatividade rodando no app; deixe em branco pra manter o comportamento atual (sem encerramento automático).</p>
      <form id="vxSecSessionForm" class="vx-admin-form">
        <label>ENCERRAR APÓS (MINUTOS)</label><input name="idle_minutes" type="number" min="1" value="${c.session_idle_timeout_minutes??''}" placeholder="EX.: 30 (em branco = sem limite)">
        <div class="vx-admin-form-actions"><button class="primary">SALVAR</button></div>
      </form>`;
    card.querySelector('#vxSecSessionForm').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.target),btn=e.submitter;btn.disabled=true;
      try{
        const v=f.get('idle_minutes');
        await api(`companies?id=eq.${cid}`,{method:'PATCH',body:JSON.stringify({session_idle_timeout_minutes:v?Number(v):null})});
        toast?.('Parâmetro salvo.');
      }catch(err){toast?.('Não foi possível salvar: '+err.message,'err');}
      btn.disabled=false;
    };
  }
})();
