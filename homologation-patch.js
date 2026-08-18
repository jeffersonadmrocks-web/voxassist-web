// VoxAssist Web V0.8.12 — pacote de homologação funcional
// Mantém app.js estável e adiciona funções de teste/gestão sem regressão do shell principal.

function testRoute(t){
  const m=up(t.module||'');
  if(m.includes('ORDEM')||m.includes('OS')||m.includes('ATEND')) return 'os';
  if(m.includes('CLIENT')) return 'clientes';
  if(m.includes('OFIC')||m.includes('TECN')) return 'oficina';
  if(m.includes('AGEN')||m.includes('TAREF')) return 'agenda';
  if(m.includes('ESTOQ')||m.includes('ALMOX')) return 'estoque';
  if(m.includes('FINANC')) return 'financeiro';
  if(m.includes('USU')||m.includes('PERFIL')||m.includes('SEGUR')) return 'usuarios';
  if(m.includes('DASH')) return 'dashboard';
  return 'dashboard';
}

function testStatusLabel(s){
  return ({NAO_TESTADA:'NÃO TESTADA',EM_TESTE:'EM TESTE',VALIDADA:'VALIDADA',NECESSITA_AJUSTE:'NECESSITA AJUSTE',RETESTE:'RETESTE'})[s]||s;
}

function renderTests(){
  const counts={NAO_TESTADA:0,EM_TESTE:0,VALIDADA:0,NECESSITA_AJUSTE:0,RETESTE:0};
  state.tests.forEach(t=>counts[t.status]=(counts[t.status]||0)+1);
  const groups={};
  state.tests.forEach(t=>{const m=t.module||'GERAL';(groups[m]??=[]).push(t)});
  $('#app').innerHTML=`
    <div class="section-title"><div><h2>Testes de Funções — V0.8.12</h2><small>Abra a função, execute o teste e registre o resultado aqui.</small></div><span class="status">HOMOLOGAÇÃO DIGITAL</span></div>
    <div class="grid metrics">
      ${metric('Não testadas',counts.NAO_TESTADA,'testes')}
      ${metric('Em teste',counts.EM_TESTE,'testes')}
      ${metric('Validadas',counts.VALIDADA,'testes')}
      ${metric('Ajuste / Reteste',counts.NECESSITA_AJUSTE+counts.RETESTE,'testes')}
    </div>
    ${Object.entries(groups).map(([module,items])=>`<div class="card block"><div class="section-title"><h3>${esc(module)}</h3><span class="hint">${items.length} teste(s)</span></div>${items.map(t=>`<div class="test"><div><b>${esc(t.code||'')} ${esc(t.title)}</b><small>${esc(t.classification||'')} ${t.notes?'• '+esc(t.notes):''}</small></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="secondary mini" data-open-test="${esc(testRoute(t))}">Abrir função</button><select data-test="${t.id}">${['NAO_TESTADA','EM_TESTE','VALIDADA','NECESSITA_AJUSTE','RETESTE'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${testStatusLabel(s)}</option>`).join('')}</select></div></div>`).join('')}</div>`).join('')||'<div class="card"><p>Nenhum teste cadastrado.</p></div>'}`;
  $$('[data-open-test]').forEach(b=>b.onclick=()=>render(b.dataset.openTest));
  $$('[data-test]').forEach(s=>s.onchange=async()=>{
    try{
      const payload={status:s.value,tested_by:state.session.user.id,tested_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      if(s.value==='NECESSITA_AJUSTE'||s.value==='RETESTE'){
        const note=up(prompt('Descreva o ajuste ou motivo do reteste:')||'');
        if(note) payload.notes=note;
      }
      await api(`homologation_tests?id=eq.${s.dataset.test}`,{method:'PATCH',body:JSON.stringify(payload)});
      const local=state.tests.find(t=>t.id===s.dataset.test);if(local)Object.assign(local,payload);
      toast('Resultado do teste registrado.');renderTests();
    }catch(e){toast(e.message,'err')}
  });
}

async function renderTasks(){
  const profiles=await api('profiles?select=id,full_name,role,active&active=eq.true&order=full_name').catch(()=>[]);
  const rows=state.tasks||[];
  $('#app').innerHTML=`
    <div class="section-title"><div><h2>Agenda / Central de Tarefas</h2><small>Crie, atribua, priorize e conclua tarefas de homologação.</small></div></div>
    <div class="card block"><h3>Nova tarefa</h3><div class="form-grid">
      <div class="field"><label>TÍTULO *</label><input id="taskTitle"></div>
      <div class="field"><label>PRIORIDADE</label><select id="taskPriority"><option>NORMAL</option><option>ALTA</option><option>URGENTE</option><option>BAIXA</option></select></div>
      <div class="field"><label>RESPONSÁVEL</label><select id="taskAssigned"><option value="">NÃO DEFINIDO</option>${profiles.map(p=>`<option value="${p.id}">${esc(p.full_name)} • ${esc(p.role)}</option>`).join('')}</select></div>
      <div class="field"><label>PRAZO</label><input id="taskDue" type="datetime-local"></div>
      <div class="field wide"><label>DESCRIÇÃO</label><textarea id="taskDescription"></textarea></div>
    </div><button class="primary" id="taskCreate">Criar tarefa</button></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Prioridade</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead><tbody>${rows.map(t=>{const p=profiles.find(x=>x.id===t.assigned_to);return `<tr><td><b>${esc(t.title)}</b><small>${esc(t.description||'')}</small></td><td>${esc(t.priority)}</td><td>${esc(p?.full_name||'NÃO DEFINIDO')}</td><td>${t.due_at?dt(t.due_at):'SEM PRAZO'}</td><td><select data-task-status="${t.id}">${['PENDENTE','EM_ANDAMENTO','CONCLUIDA','CANCELADA'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s.replaceAll('_',' ')}</option>`).join('')}</select></td></tr>`}).join('')}</tbody></table></div></div>`;
  applyUppercase();
  $('#taskCreate').onclick=async()=>{
    const title=up($('#taskTitle').value);if(!title)return toast('Informe o título da tarefa.','err');
    const due=$('#taskDue').value?new Date($('#taskDue').value).toISOString():null;
    try{await api('tasks',{method:'POST',body:JSON.stringify({title,description:up($('#taskDescription').value),priority:$('#taskPriority').value,assigned_to:$('#taskAssigned').value||null,due_at:due,created_by:state.session.user.id,status:'PENDENTE'})});toast('Tarefa criada.');await loadCore();renderTasks()}catch(e){toast(e.message,'err')}
  };
  $$('[data-task-status]').forEach(s=>s.onchange=async()=>{try{await api(`tasks?id=eq.${s.dataset.taskStatus}`,{method:'PATCH',body:JSON.stringify({status:s.value,updated_at:new Date().toISOString()})});toast('Status da tarefa atualizado.');await loadCore();renderTasks()}catch(e){toast(e.message,'err')}});
}

async function renderUsers(){
  if(state.profile?.role!=='GESTOR')return $('#app').innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Somente o perfil GESTOR pode alterar usuários e permissões.</p></div>';
  const p=await api('profiles?select=*&order=full_name');
  $('#app').innerHTML=`<div class="section-title"><div><h2>Usuários, perfis e segurança</h2><small>Altere o perfil e ative/desative acessos para testar dashboards e permissões.</small></div></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Loja</th><th>Ativo</th><th>Ação</th></tr></thead><tbody>${p.map(x=>`<tr><td><b>${esc(x.full_name)}</b></td><td><select id="role-${x.id}">${['GESTOR','ATENDENTE','TECNICO','ESTOQUE'].map(r=>`<option value="${r}" ${x.role===r?'selected':''}>${r}</option>`).join('')}</select></td><td>${esc(x.store_id||'TODAS/SEM LOJA')}</td><td><select id="active-${x.id}"><option value="true" ${x.active?'selected':''}>SIM</option><option value="false" ${!x.active?'selected':''}>NÃO</option></select></td><td><button class="secondary mini" data-save-user="${x.id}">Salvar</button></td></tr>`).join('')}</tbody></table></div></div><div class="modules"><div class="card"><h3>Perfis para teste</h3><p>GESTOR, ATENDENTE, TÉCNICO e ESTOQUE.</p></div><div class="card"><h3>Observação</h3><p>Esta rodada valida a experiência e o comportamento de menus. O endurecimento final das regras RLS ficará para a etapa de produção.</p></div></div>`;
  $$('[data-save-user]').forEach(b=>b.onclick=async()=>{const id=b.dataset.saveUser;try{await api(`profiles?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({role:$(`#role-${id}`).value,active:$(`#active-${id}`).value==='true',updated_at:new Date().toISOString()})});toast('Perfil atualizado.');if(id===state.session.user.id)await loadProfile();shell();await loadCore();render('usuarios')}catch(e){toast(e.message,'err')}});
}

// Segurança de interface: ausência de perfil nunca deve assumir GESTOR.
can=function(area){
  const r=state.profile?.role;
  if(!r)return area==='dashboard';
  if(r==='GESTOR')return true;
  if(area==='usuarios')return false;
  if(r==='TECNICO'&&['financeiro','usuarios'].includes(area))return false;
  if(r==='ESTOQUE'&&['financeiro','usuarios'].includes(area))return false;
  return true;
};

// Se a sessão já existia antes do patch carregar, redesenha o shell com as regras novas.
setTimeout(async()=>{if(state.session){try{await loadProfile();shell();await loadCore();render(state.view||'dashboard')}catch(e){console.warn('Patch de homologação:',e)} }},0);
