const CFG={
  url:'https://dgasmtvpgifceyqufcfg.supabase.co',
  key:'sb_publishable_Lnp0_Tot_BUD3GJgny3Yrg_NgN-757t'
};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={session:null,profile:null,view:'dashboard',orders:[],clients:[],tests:[],tasks:[],stock:[],openTabs:['dashboard'],activeOs:null};
const statusFlow=['AGUARDANDO ANALISE','AGUARDANDO APROVACAO','AGUARDANDO CONSERTO','PRONTO PARA ENTREGA','FINALIZADA'];
const navMap={dashboard:'Dashboard',os:'Ordens de Serviço',clientes:'Clientes',oficina:'Oficina',agenda:'Agenda / Tarefas',estoque:'Estoque',financeiro:'Financeiro',testes:'Testes de Funções',usuarios:'Usuários / Segurança'};

function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function up(v=''){return String(v).toUpperCase()}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function dt(v){return v?new Date(v).toLocaleString('pt-BR'):'—'}
function toast(msg,type='ok'){const x=document.createElement('div');x.className='toast '+type;x.textContent=msg;document.body.appendChild(x);setTimeout(()=>x.remove(),3200)}
function authHeaders(json=true){const h={apikey:CFG.key};if(state.session?.access_token)h.Authorization='Bearer '+state.session.access_token;if(json)h['Content-Type']='application/json';return h}
async function api(path,opt={}){const r=await fetch(CFG.url+'/rest/v1/'+path,{...opt,headers:{...authHeaders(),...(opt.headers||{})}});if(!r.ok){let e=await r.text();throw new Error(e||r.statusText)}const t=await r.text();return t?JSON.parse(t):null}
async function auth(path,body){const r=await fetch(CFG.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:CFG.key,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.msg||d.error_description||d.message||'Falha de autenticação');return d}
function saveSession(s){state.session=s;localStorage.setItem('vox_session',JSON.stringify(s))}
function clearSession(){state.session=null;state.profile=null;localStorage.removeItem('vox_session')}
async function restoreSession(){try{const s=JSON.parse(localStorage.getItem('vox_session')||'null');if(!s)return false;if(s.expires_at && Date.now()/1000>s.expires_at-60 && s.refresh_token){const n=await auth('token?grant_type=refresh_token',{refresh_token:s.refresh_token});n.expires_at=Math.floor(Date.now()/1000)+(n.expires_in||3600);saveSession(n)}else state.session=s;await loadProfile();return true}catch(e){clearSession();return false}}
async function loadProfile(){if(!state.session?.user?.id)return;const p=await api(`profiles?id=eq.${state.session.user.id}&select=*`);state.profile=p?.[0]||null}
function can(area){const r=state.profile?.role||'GESTOR';if(r==='GESTOR')return true;if(area==='usuarios')return false;if(r==='TECNICO' && ['financeiro','usuarios'].includes(area))return false;return true}

function loginScreen(){
  document.body.innerHTML=`<div class="login-shell"><div class="login-card">
  <div class="login-brand">VOX<span>ASSIST</span></div><div class="version">WEB • V0.8.13 • HOMOLOGAÇÃO</div>
  <h1>Acesso ao sistema</h1><p>Ambiente de testes com dados fictícios e controle por usuário.</p>
  <form id="loginForm"><label>E-mail</label><input id="email" type="email" required autocomplete="username"><label>Senha</label><input id="password" type="password" required autocomplete="current-password">
  <button class="primary full">Entrar</button></form>
  <button class="link-btn" id="showSignup">Criar primeiro usuário de homologação</button>
  <div id="signup" class="hidden"><hr><h3>Criar acesso</h3><input id="fullName" placeholder="NOME COMPLETO"><input id="newEmail" type="email" placeholder="E-MAIL"><input id="newPassword" type="password" placeholder="SENHA (mín. 6 caracteres)"><button id="signupBtn" class="secondary full">Criar usuário</button><small>O primeiro usuário criado recebe perfil GESTOR; os seguintes entram como ATENDENTE e podem ser ajustados pelo gestor.</small></div>
  </div></div>`;
  $('#showSignup').onclick=()=>$('#signup').classList.toggle('hidden');
  $('#loginForm').onsubmit=async e=>{e.preventDefault();try{const d=await auth('token?grant_type=password',{email:$('#email').value,password:$('#password').value});d.expires_at=Math.floor(Date.now()/1000)+(d.expires_in||3600);saveSession(d);await loadProfile();await boot()}catch(err){toast('Não foi possível entrar: '+err.message,'err')}};
  $('#signupBtn').onclick=async()=>{try{const d=await auth('signup',{email:$('#newEmail').value,password:$('#newPassword').value,data:{full_name:up($('#fullName').value)}});toast(d.access_token?'Usuário criado e autenticado.':'Usuário criado. Confirme o e-mail se solicitado.');if(d.access_token){d.expires_at=Math.floor(Date.now()/1000)+(d.expires_in||3600);saveSession(d);await loadProfile();await boot()}}catch(err){toast(err.message,'err')}};
}

function shell(){
 document.body.innerHTML=`<aside class="sidebar">
 <div class="brand">VOX<span>ASSIST</span><small>V0.8.13 WEB</small></div>
 ${Object.entries(navMap).map(([k,v])=>`<button class="nav" data-view="${k}">${v}</button>`).join('')}
 </aside><main><header><div><small>AMBIENTE DE HOMOLOGAÇÃO • DADOS FICTÍCIOS</small><h1 id="title">Dashboard</h1></div>
 <div class="user"><div><b id="userName">${esc(state.profile?.full_name||state.session?.user?.email||'USUÁRIO')}</b><small>${esc(state.profile?.role||'SEM PERFIL')} • ${esc(state.profile?.store_id?'LOJA VINCULADA':'TODAS/SEM LOJA')}</small></div><button id="newOs" class="primary">+ Nova OS</button><button id="logout" class="secondary">Sair</button></div></header>
 <div id="tabs" class="tabs"></div><section id="app"></section></main>`;
 $$('.nav').forEach(b=>{if(!can(b.dataset.view))b.classList.add('disabled');b.onclick=()=>can(b.dataset.view)&&render(b.dataset.view)});
 $('#newOs').onclick=()=>render('nova-os');$('#logout').onclick=async()=>{try{await auth('logout',{})}catch{}clearSession();loginScreen()};
}

async function loadCore(){
 const [orders,clients,tests,tasks,stock]=await Promise.all([
 api('service_orders?select=*,clients(name,phone_primary),equipments(product_type,brand,model),profiles!service_orders_technician_id_fkey(full_name)&order=opened_at.desc&limit=100').catch(()=>[]),
 api('clients?select=*&order=name').catch(()=>[]),
 api('homologation_tests?select=*&order=module,title').catch(()=>[]),
 api('tasks?select=*&order=created_at.desc&limit=100').catch(()=>[]),
 api('stock_items?select=*&order=description&limit=200').catch(()=>[])
 ]);
 state.orders=orders||[];state.clients=clients||[];state.tests=tests||[];state.tasks=tasks||[];state.stock=stock||[];
}
function addTab(view,label){if(!state.openTabs.includes(view))state.openTabs.push(view);state.view=view;renderTabs(label)}
function renderTabs(label){
 const tabs=$('#tabs');if(!tabs)return;
 tabs.innerHTML=state.openTabs.map(v=>`<button class="tab ${state.view===v?'active':''}" data-tab="${v}"><span>${esc(v.startsWith('os:')?'OS '+v.split(':')[1]:(navMap[v]||label||v))}</span>${v!=='dashboard'?`<i data-close="${v}">×</i>`:''}</button>`).join('');
 $$('.tab').forEach(t=>t.onclick=e=>{if(e.target.dataset.close)return;render(t.dataset.tab)});
 $$('[data-close]').forEach(x=>x.onclick=e=>{e.stopPropagation();closeTab(x.dataset.close)});
}
function closeTab(v){state.openTabs=state.openTabs.filter(x=>x!==v);const next=state.openTabs.at(-1)||'dashboard';render(next)}
function badge(s){return `<span class="status ${String(s).includes('PRONTO')?'green':''}">${esc(s||'—')}</span>`}
function metric(label,n,view='os'){return `<button class="card metric click" onclick="render('${view}')"><span>${label}</span><b>${n}</b></button>`}

async function render(view){
 if(!view)view='dashboard';state.view=view;
 if(view.startsWith('os:')){addTab(view);return renderOsDetail(view.split(':')[1])}
 if(view==='nova-os'){addTab(view,'Nova OS');return renderNewOs()}
 if(navMap[view])addTab(view);
 $('#title').textContent=navMap[view]||'VoxAssist';
 $$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 renderTabs();
 try{
 if(view==='dashboard')return renderDashboard();
 if(view==='os')return renderOrders();
 if(view==='clientes')return renderClients();
 if(view==='oficina')return renderWorkshop();
 if(view==='agenda')return renderTasks();
 if(view==='estoque')return renderStock();
 if(view==='financeiro')return renderFinance();
 if(view==='testes')return renderTests();
 if(view==='usuarios')return renderUsers();
 }catch(e){$('#app').innerHTML=`<div class="card error-card"><h3>Falha ao carregar módulo</h3><p>${esc(e.message)}</p></div>`}
}

function renderDashboard(){
 const o=state.orders, count=s=>o.filter(x=>x.status===s).length;
 $('#app').innerHTML=`<div class="grid metrics">${metric('OS em aberto',o.filter(x=>x.status!=='FINALIZADA').length)}${metric('Aguardando análise',count('AGUARDANDO ANALISE'))}${metric('Aguardando aprovação',count('AGUARDANDO APROVACAO'))}${metric('Prontas para entrega',count('PRONTO PARA ENTREGA'))}</div>
 <div class="dash-grid"><div><div class="section-title"><h2>Ordens recentes</h2><button class="secondary" onclick="render('os')">Ver todas</button></div>${ordersTable(o.slice(0,8))}</div>
 <div><div class="section-title"><h2>Tarefas e alertas</h2></div><div class="card">${state.tasks.slice(0,6).map(t=>`<div class="list-row"><div><b>${esc(t.title)}</b><small>${esc(t.priority)} • ${esc(t.status)}</small></div><span>${t.due_at?dt(t.due_at):'Sem prazo'}</span></div>`).join('')||'<p>Nenhuma tarefa.</p>'}</div></div></div>`;
}
function ordersTable(rows){
 return `<div class="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Equipamento</th><th>Situação</th><th>Técnico</th><th>Abertura</th></tr></thead><tbody>${rows.map(o=>`<tr onclick="render('os:${o.id}')"><td><b>${esc(o.os_number)}</b></td><td>${esc(o.clients?.name||'—')}</td><td>${esc([o.equipments?.product_type,o.equipments?.brand,o.equipments?.model].filter(Boolean).join(' • ')||'—')}</td><td>${badge(o.status)}</td><td>${esc(o.profiles?.full_name||'—')}</td><td>${dt(o.opened_at)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderOrders(){
 $('#app').innerHTML=`<div class="toolbar"><div class="search"><input id="osSearch" placeholder="Pesquisar OS, cliente, equipamento ou situação"></div><button class="primary" onclick="render('nova-os')">+ Gerar OS</button></div>${ordersTable(state.orders)}`;
 $('#osSearch').oninput=e=>{const q=up(e.target.value);const f=state.orders.filter(o=>JSON.stringify(o).toUpperCase().includes(q));$('.table-wrap').outerHTML=ordersTable(f)};
}
function clientOptions(){return state.clients.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(c.phone_primary||'SEM TELEFONE')}</option>`).join('')}
async function renderNewOs(){
 $('#title').textContent='Nova Ordem de Serviço';
 $('#app').innerHTML=`<form id="osForm" class="os-page"><div class="os-top"><div><small>NOVA ORDEM DE SERVIÇO</small><h2>Atendimento</h2></div>${badge('RASCUNHO')}</div>
 <div class="os-tabs static"><b>Dados</b><b>Equipamento</b><b>Atendimento</b><b>Financeiro</b><b>Fotos/Anexos</b><b>Histórico</b></div>
 <div class="card block"><h3>Dados do Cliente</h3><div class="form-grid"><div class="field wide"><label>CLIENTE *</label><select id="clientId" required><option value="">Selecione...</option>${clientOptions()}</select><button type="button" class="mini" id="quickClient">+ Cadastrar cliente</button></div></div></div>
 <div class="card block"><h3>Equipamento</h3><div class="form-grid"><div class="field"><label>TIPO DE PRODUTO *</label><input id="productType" required placeholder="TV / REFRIGERADOR / AR-CONDICIONADO"></div><div class="field"><label>MARCA</label><input id="brand"></div><div class="field"><label>MODELO</label><input id="model"></div><div class="field"><label>NÚMERO DE SÉRIE</label><input id="serial"></div><div class="field"><label>ESTADO DO APARELHO</label><input id="condition" placeholder="USADO / ARRANHADO / ..."></div></div></div>
 <div class="card block"><h3>Atendimento</h3><div class="form-grid"><div class="field"><label>TIPO DE ATENDIMENTO</label><select id="serviceType"><option>INTERNO</option><option>EXTERNO</option></select></div><div class="field"><label>LOCAL DO PRODUTO</label><select id="productLocation"><option>LABORATORIO</option><option>CONSUMIDOR</option></select></div><div class="field wide"><label>DEFEITO RELATADO *</label><textarea id="reported" required></textarea></div><div class="field wide internal"><label>OBSERVAÇÕES INTERNAS / F11 — NÃO IMPRIMIR</label><textarea id="notes"></textarea></div></div></div>
 <div class="actions sticky-actions"><button class="primary">Salvar OS</button><button type="button" class="primary alt" id="saveAdvance">Salvar e Avançar</button><button type="button" class="secondary" onclick="render('os')">Cancelar</button></div></form>`;
 applyUppercase();$('#quickClient').onclick=quickClient;$('#osForm').onsubmit=e=>saveNewOs(e,false);$('#saveAdvance').onclick=e=>saveNewOs(e,true);
}
function applyUppercase(){document.querySelectorAll('input:not([type=email]):not([type=password]),textarea').forEach(i=>i.addEventListener('input',()=>{i.value=up(i.value)}))}
async function quickClient(){
 const name=up(prompt('Nome do cliente:')||'');if(!name)return;const phone=up(prompt('Telefone:')||'');
 try{const d=await api('clients',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({name,phone_primary:phone,person_type:'PF'})});state.clients.push(d[0]);toast('Cliente cadastrado.');render('nova-os')}catch(e){toast('Erro ao cadastrar cliente: '+e.message,'err')}
}
function genOsNumber(){const d=new Date();return `${String(d.getDate()).padStart(2,'0')}${String.fromCharCode(65+d.getMonth())}${String(d.getFullYear()).slice(-2)}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`}
async function saveNewOs(e,advance){e?.preventDefault?.();const client=$('#clientId').value, product=up($('#productType').value), reported=up($('#reported').value);if(!client||!product||!reported)return toast('Preencha CLIENTE, TIPO DE PRODUTO e DEFEITO RELATADO.','err');
 try{
 const eq=await api('equipments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({current_client_id:client,product_type:product,brand:up($('#brand').value),model:up($('#model').value),serial_number:up($('#serial').value)})});
 const os=await api('service_orders',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({os_number:genOsNumber(),client_id:client,equipment_id:eq[0].id,service_type:$('#serviceType').value,product_location:$('#productLocation').value,device_condition:up($('#condition').value),reported_defect:reported,internal_notes:up($('#notes').value),status:'AGUARDANDO ANALISE',created_by:state.session.user.id,attendant_id:state.session.user.id,store_id:state.profile?.store_id||null})});
 await api('os_status_history',{method:'POST',body:JSON.stringify({service_order_id:os[0].id,new_status:'AGUARDANDO ANALISE',change_type:'AUTOMATICO',changed_by:state.session.user.id})});
 toast('OS salva com sucesso.');await loadCore();render(advance?`os:${os[0].id}`:'os');
 }catch(err){toast('Falha ao salvar OS: '+err.message,'err')}
}

async function renderOsDetail(id){
 const arr=await api(`service_orders?id=eq.${id}&select=*,clients(*),equipments(*),profiles!service_orders_technician_id_fkey(full_name)`);const o=arr?.[0];if(!o)return $('#app').innerHTML='<div class="card">OS não encontrada.</div>';state.activeOs=o;$('#title').textContent='OS '+o.os_number;
 const [hist,parts,fin,atts]=await Promise.all([api(`os_status_history?service_order_id=eq.${id}&select=*&order=changed_at.desc`),api(`os_parts?service_order_id=eq.${id}&select=*&order=created_at`),api(`os_financial?service_order_id=eq.${id}&select=*`),api(`attachments?service_order_id=eq.${id}&select=*&order=created_at.desc`)]);
 $('#app').innerHTML=`<div class="os-page"><div class="os-top"><div><small>ORDEM DE SERVIÇO</small><h2>${esc(o.os_number)}</h2><p>${esc(o.clients?.name)} • ${esc(o.equipments?.product_type)} ${esc(o.equipments?.brand||'')} ${esc(o.equipments?.model||'')}</p></div><div class="status-box">${badge(o.status)}<button class="secondary mini" onclick="manualStatus()">Alterar Situação</button></div></div>
 <div class="os-tabs"><button class="active" onclick="showPanel('dados',this)">Dados</button><button onclick="showPanel('equip',this)">Equipamento</button><button onclick="showPanel('atend',this)">Atendimento</button><button onclick="showPanel('pecas',this)">Peças/Orçamento</button><button onclick="showPanel('fin',this)">Financeiro</button><button onclick="showPanel('anexos',this)">Fotos/Anexos</button><button onclick="showPanel('hist',this)">Histórico</button></div>
 <div id="dados" class="panel"><div class="detail-grid"><div class="card"><h3>Cliente</h3>${kv('Nome',o.clients?.name)}${kv('Telefone',o.clients?.phone_primary)}${kv('E-mail',o.clients?.email)}<button class="secondary" onclick="renderClient360('${o.client_id}')">Abrir Cliente 360</button></div><div class="card"><h3>Situação e datas</h3>${kv('Situação',o.status)}${kv('Abertura',dt(o.opened_at))}${kv('Técnico',o.profiles?.full_name||'NÃO DEFINIDO')}${kv('Prioridade',o.priority)}</div></div></div>
 <div id="equip" class="panel hidden"><div class="card">${kv('Tipo',o.equipments?.product_type)}${kv('Marca',o.equipments?.brand)}${kv('Modelo',o.equipments?.model)}${kv('Série',o.equipments?.serial_number)}${kv('Estado',o.device_condition)}${kv('NF',o.equipments?.invoice_number)}${kv('Garantia',o.equipments?.warranty_info)}</div></div>
 <div id="atend" class="panel hidden"><div class="detail-grid"><div class="card"><h3>Defeito relatado</h3><p>${esc(o.reported_defect||'—')}</p><h3>Defeito constatado</h3><textarea id="diagnosed">${esc(o.diagnosed_defect||'')}</textarea><h3>Serviço técnico</h3><textarea id="techService">${esc(o.technical_service||'')}</textarea><button class="primary" onclick="saveTechnical()">Salvar parecer</button></div><div class="card internal"><h3>Observações Internas / F11</h3><textarea id="internalNotes">${esc(o.internal_notes||'')}</textarea><small>Este conteúdo não deve aparecer em documentos do cliente.</small><button class="secondary" onclick="saveInternalNotes()">Salvar F11</button></div></div></div>
 <div id="pecas" class="panel hidden"><div class="card"><div class="section-title"><h3>Peças da OS</h3><button class="primary" onclick="addManualPart()">+ Peça manual</button></div>${partsTable(parts)}</div></div>
 <div id="fin" class="panel hidden">${financialPanel(fin?.[0],parts)}</div>
 <div id="anexos" class="panel hidden"><div class="card"><div class="section-title"><h3>Fotos e anexos</h3><button class="secondary" onclick="toast('Upload físico será conectado ao Storage na próxima rodada.')">+ Anexar arquivo</button></div>${atts.map(a=>`<div class="list-row"><div><b>${esc(a.category)}</b><small>${esc(a.file_name)}</small></div><span>${dt(a.created_at)}</span></div>`).join('')||'<p>Nenhum anexo cadastrado.</p>'}<div class="qr-placeholder">QR DA OS • ${esc(o.os_number)}<small>Endpoint móvel preparado para ativação com Storage</small></div></div></div>
 <div id="hist" class="panel hidden"><div class="card">${hist.map(h=>`<div class="timeline"><b>${esc(h.new_status)}</b><span>${dt(h.changed_at)} • ${esc(h.change_type)}</span>${h.reason?`<p>Motivo: ${esc(h.reason)}</p>`:''}</div>`).join('')||'<p>Sem histórico.</p>'}</div></div>
 <div class="actions"><button class="primary" onclick="saveAdvanceCurrent()">Salvar e Avançar</button><button class="secondary" onclick="printOs()">Gerar PDF / Imprimir</button><button class="secondary" onclick="render('os')">Voltar</button></div></div>`;
 applyUppercase();
}
function kv(k,v){return `<div class="kv"><span>${k}</span><b>${esc(v||'—')}</b></div>`}
function showPanel(id,b){$$('.panel').forEach(p=>p.classList.add('hidden'));$('#'+id).classList.remove('hidden');$$('.os-tabs button').forEach(x=>x.classList.remove('active'));b?.classList.add('active')}
function partsTable(p){return `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Descrição</th><th>Qtd.</th><th>Unit.</th><th>Total</th><th>Origem</th></tr></thead><tbody>${p.map(x=>`<tr><td>${esc(x.code||'—')}</td><td>${esc(x.description)}</td><td>${x.quantity}</td><td>${money(x.unit_value)}</td><td>${money(x.quantity*x.unit_value)}</td><td>${x.is_manual?'MANUAL':'ESTOQUE'}</td></tr>`).join('')}</tbody></table></div>`}
function financialPanel(f,p){const parts=p.reduce((s,x)=>s+Number(x.quantity)*Number(x.unit_value),0), labor=Number(f?.labor_value||0), disc=Number(f?.discount_value||0);return `<div class="card"><h3>Financeiro da OS</h3><div class="form-grid"><div class="field"><label>MÃO DE OBRA</label><input id="labor" type="number" step=".01" value="${labor}"></div><div class="field"><label>DESCONTO</label><input id="discount" type="number" step=".01" value="${disc}"></div><div class="field wide"><label>OBSERVAÇÕES FINANCEIRAS</label><textarea id="finNotes">${esc(f?.notes||'')}</textarea></div></div><div class="total-box"><span>Peças ${money(parts)}</span><span>Mão de obra ${money(labor)}</span><b>Total ${money(parts+labor-disc)}</b></div><button class="primary" onclick="saveFinancial('${f?.id||''}')">Salvar financeiro</button></div>`}
async function saveTechnical(){try{await api(`service_orders?id=eq.${state.activeOs.id}`,{method:'PATCH',body:JSON.stringify({diagnosed_defect:up($('#diagnosed').value),technical_service:up($('#techService').value),updated_at:new Date().toISOString()})});toast('Parecer salvo.')}catch(e){toast(e.message,'err')}}
async function saveInternalNotes(){try{await api(`service_orders?id=eq.${state.activeOs.id}`,{method:'PATCH',body:JSON.stringify({internal_notes:up($('#internalNotes').value),updated_at:new Date().toISOString()})});toast('Observações internas salvas.')}catch(e){toast(e.message,'err')}}
async function addManualPart(){const code=up(prompt('Código da peça:')||''),description=up(prompt('Descrição:')||'');if(!description)return;const quantity=Number(prompt('Quantidade:','1')||1),unit_value=Number((prompt('Valor unitário:','0')||'0').replace(',','.'));try{await api('os_parts',{method:'POST',body:JSON.stringify({service_order_id:state.activeOs.id,code,description,quantity,unit_value,is_manual:true})});toast('Peça incluída.');render(`os:${state.activeOs.id}`)}catch(e){toast(e.message,'err')}}
async function saveFinancial(id){const body={service_order_id:state.activeOs.id,labor_value:Number($('#labor').value||0),discount_value:Number($('#discount').value||0),notes:up($('#finNotes').value),updated_at:new Date().toISOString()};try{if(id)await api(`os_financial?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(body)});else await api('os_financial',{method:'POST',body:JSON.stringify(body)});toast('Financeiro salvo.');render(`os:${state.activeOs.id}`)}catch(e){toast(e.message,'err')}}
async function manualStatus(){const current=state.activeOs.status;const next=up(prompt(`Situação atual: ${current}\nNova situação:`,current)||'');if(!next||next===current)return;const currentIdx=statusFlow.indexOf(current),nextIdx=statusFlow.indexOf(next);let reason='';if(nextIdx<currentIdx || nextIdx===-1){reason=up(prompt('Informe o motivo da regressão/exceção:')||'');if(!reason)return toast('Motivo obrigatório para regressão/exceção.','err')}try{await api(`service_orders?id=eq.${state.activeOs.id}`,{method:'PATCH',body:JSON.stringify({status:next,updated_at:new Date().toISOString()})});await api('os_status_history',{method:'POST',body:JSON.stringify({service_order_id:state.activeOs.id,previous_status:current,new_status:next,change_type:'MANUAL',reason,changed_by:state.session.user.id})});toast('Situação alterada e auditada.');await loadCore();render(`os:${state.activeOs.id}`)}catch(e){toast(e.message,'err')}}
async function saveAdvanceCurrent(){const i=statusFlow.indexOf(state.activeOs.status);const next=statusFlow[Math.min(i+1,statusFlow.length-1)];if(next===state.activeOs.status)return toast('OS já está na última etapa.');try{if(next==='AGUARDANDO APROVACAO'&&!state.activeOs.diagnosed_defect&&!$('#diagnosed')?.value)return toast('Informe o defeito constatado antes de avançar.','err');await api(`service_orders?id=eq.${state.activeOs.id}`,{method:'PATCH',body:JSON.stringify({status:next,updated_at:new Date().toISOString()})});await api('os_status_history',{method:'POST',body:JSON.stringify({service_order_id:state.activeOs.id,previous_status:state.activeOs.status,new_status:next,change_type:'AUTOMATICO',changed_by:state.session.user.id})});toast('OS salva e avançada para '+next);await loadCore();render(`os:${state.activeOs.id}`)}catch(e){toast(e.message,'err')}}
function printOs(){const o=state.activeOs;const w=open('','_blank');w.document.write(`<html><head><title>OS ${esc(o.os_number)}</title><style>body{font-family:Arial;padding:28px;color:#172033}.head{border-bottom:3px solid #0c2340;padding-bottom:12px}.box{border:1px solid #bbb;padding:12px;margin:12px 0}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}h1{margin:0;color:#0c2340}small{color:#666}@media print{button{display:none}}</style></head><body><div class=head><h1>VOXASSIST • ORDEM DE SERVIÇO ${esc(o.os_number)}</h1><small>Documento de homologação</small></div><div class=row><div class=box><b>CLIENTE</b><p>${esc(o.clients?.name)}</p><p>${esc(o.clients?.phone_primary||'')}</p></div><div class=box><b>EQUIPAMENTO</b><p>${esc(o.equipments?.product_type)} ${esc(o.equipments?.brand||'')} ${esc(o.equipments?.model||'')}</p><p>Série: ${esc(o.equipments?.serial_number||'—')}</p></div></div><div class=box><b>SITUAÇÃO</b><p>${esc(o.status)}</p></div><div class=box><b>DEFEITO RELATADO</b><p>${esc(o.reported_defect||'—')}</p></div><div class=box><b>DEFEITO CONSTATADO</b><p>${esc(o.diagnosed_defect||'—')}</p></div><div class=box><b>SERVIÇO</b><p>${esc(o.technical_service||'—')}</p></div><p><small>Observações internas/F11 não são impressas.</small></p><button onclick=print()>Imprimir / Salvar PDF</button></body></html>`);w.document.close()}

function renderClients(){
 $('#app').innerHTML=`<div class="toolbar"><input id="clientSearch" placeholder="Pesquisar cliente, telefone, documento ou cidade"><button class="primary" onclick="quickClient()">+ Novo cliente</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Documento</th><th>Cidade</th><th>Ativo</th></tr></thead><tbody>${state.clients.map(c=>`<tr onclick="renderClient360('${c.id}')"><td><b>${esc(c.name)}</b></td><td>${esc(c.phone_primary||'—')}</td><td>${esc(c.document||'—')}</td><td>${esc(c.city||'—')}</td><td>${c.active?'SIM':'NÃO'}</td></tr>`).join('')}</tbody></table></div></div>`;
 $('#clientSearch').oninput=e=>{const q=up(e.target.value);$$('tbody tr').forEach(r=>r.style.display=up(r.innerText).includes(q)?'':'none')};
}
async function renderClient360(id){const c=(await api(`clients?id=eq.${id}&select=*`))[0];const os=await api(`service_orders?client_id=eq.${id}&select=*,equipments(product_type,brand,model)&order=opened_at.desc`);$('#title').textContent='Cliente 360';$('#app').innerHTML=`<div class="detail-grid"><div class="card"><h2>${esc(c.name)}</h2>${kv('Telefone',c.phone_primary)}${kv('Telefone 2',c.phone_secondary)}${kv('E-mail',c.email)}${kv('Documento',c.document)}${kv('Endereço',[c.address,c.address_number,c.neighborhood,c.city,c.state].filter(Boolean).join(', '))}</div><div class="card"><h3>Resumo</h3>${kv('OS vinculadas',os.length)}${kv('Cliente desde',dt(c.created_at))}</div></div><div class="section-title"><h2>Histórico de OS</h2></div>${ordersTable(os)}<div class="actions"><button class="secondary" onclick="render('clientes')">Voltar</button></div>`}
function renderWorkshop(){const rows=state.orders.filter(o=>['AGUARDANDO ANALISE','AGUARDANDO CONSERTO'].includes(o.status));$('#app').innerHTML=`<div class="grid metrics">${metric('Fila técnica',rows.length,'oficina')}${metric('Aguardando análise',rows.filter(x=>x.status==='AGUARDANDO ANALISE').length,'oficina')}${metric('Em conserto',rows.filter(x=>x.status==='AGUARDANDO CONSERTO').length,'oficina')}</div><div class="section-title"><h2>Fila da Oficina</h2></div>${ordersTable(rows)}<div class="modules"><div class="card"><h3>Documentação técnica</h3><p>Manuais, firmware e boletins por modelo permanecem registrados como central técnica.</p></div><div class="card"><h3>Parecer guiado</h3><p>Preencha defeito constatado e serviço diretamente na OS.</p></div><div class="card"><h3>Assinatura do técnico</h3><p>Estrutura visual prevista para documentos técnicos.</p></div></div>`}
function renderTasks(){$('#app').innerHTML=`<div class="section-title"><h2>Agenda / Central de Tarefas</h2><button class="primary" onclick="addTask()">+ Nova tarefa</button></div><div class="card">${state.tasks.map(t=>`<div class="list-row"><div><b>${esc(t.title)}</b><small>${esc(t.description||'')} • ${esc(t.priority)} • ${esc(t.status)}</small></div><span>${t.due_at?dt(t.due_at):'Sem prazo'}</span></div>`).join('')||'<p>Nenhuma tarefa.</p>'}</div>`}
async function addTask(){const title=up(prompt('Título da tarefa:')||'');if(!title)return;const description=up(prompt('Descrição:')||'');const priority=up(prompt('Prioridade:','NORMAL')||'NORMAL');try{await api('tasks',{method:'POST',body:JSON.stringify({title,description,priority,created_by:state.session.user.id,status:'PENDENTE'})});toast('Tarefa criada.');await loadCore();render('agenda')}catch(e){toast(e.message,'err')}}
function renderStock(){$('#app').innerHTML=`<div class="section-title"><h2>Estoque</h2><span class="hint">Fiscal x disponível x em poder do técnico</span></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Código</th><th>Descrição</th><th>Fabricante</th><th>Local</th><th>Fiscal</th><th>Disponível</th></tr></thead><tbody>${state.stock.map(s=>`<tr><td><b>${esc(s.code)}</b></td><td>${esc(s.description)}</td><td>${esc(s.manufacturer||'—')}</td><td>${esc(s.storage_location||'—')}</td><td>${s.fiscal_quantity}</td><td>${s.available_quantity}</td></tr>`).join('')}</tbody></table></div></div><div class="modules"><div class="card"><h3>Em poder do técnico</h3><p>Movimentações suportam técnico, OS e pendência fiscal sem entradas/saídas fiscais artificiais.</p></div><div class="card"><h3>Garantia</h3><p>Movimentação pode ficar com fiscal_pending=true até faturamento ao fabricante.</p></div><div class="card"><h3>Foto/código</h3><p>Fluxo de captura por foto permanece preparado como evolução do estoque.</p></div></div>`}
async function renderFinance(){const f=await api('os_financial?select=*,service_orders(os_number,status)&order=updated_at.desc&limit=100').catch(()=>[]);$('#app').innerHTML=`<div class="grid metrics">${metric('OS com financeiro',f.length,'financeiro')}${metric('OS em aberto',state.orders.filter(o=>o.status!=='FINALIZADA').length,'financeiro')}</div><div class="section-title"><h2>Financeiro das OS</h2></div><div class="card"><div class="table-wrap"><table><thead><tr><th>OS</th><th>Situação</th><th>Mão de obra</th><th>Desconto</th><th>Atualização</th></tr></thead><tbody>${f.map(x=>`<tr><td>${esc(x.service_orders?.os_number||'—')}</td><td>${badge(x.service_orders?.status)}</td><td>${money(x.labor_value)}</td><td>${money(x.discount_value)}</td><td>${dt(x.updated_at)}</td></tr>`).join('')}</tbody></table></div></div>`}
function renderTests(){$('#app').innerHTML=`<div class="section-title"><h2>Testes de Funções — V0.8.13</h2><span class="status">HOMOLOGAÇÃO DIGITAL</span></div><div class="card">${state.tests.map(t=>`<div class="test"><div><b>${esc(t.code||'')} ${esc(t.title)}</b><small>${esc(t.module)} • ${esc(t.classification)}${t.notes?' • '+esc(t.notes):''}</small></div><select data-test="${t.id}"><option ${t.status==='NAO_TESTADA'?'selected':''}>NAO_TESTADA</option><option ${t.status==='EM_TESTE'?'selected':''}>EM_TESTE</option><option ${t.status==='VALIDADA'?'selected':''}>VALIDADA</option><option ${t.status==='NECESSITA_AJUSTE'?'selected':''}>NECESSITA_AJUSTE</option><option ${t.status==='RETESTE'?'selected':''}>RETESTE</option></select></div>`).join('')||'<p>Cadastre itens de homologação no Supabase.</p>'}</div>`;$$('[data-test]').forEach(s=>s.onchange=async()=>{try{await api(`homologation_tests?id=eq.${s.dataset.test}`,{method:'PATCH',body:JSON.stringify({status:s.value,tested_by:state.session.user.id,tested_at:new Date().toISOString(),updated_at:new Date().toISOString()})});toast('Teste atualizado.')}catch(e){toast(e.message,'err')}})}
async function renderUsers(){const p=await api('profiles?select=*&order=full_name');$('#app').innerHTML=`<div class="section-title"><h2>Usuários, perfis e segurança</h2></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Loja</th><th>Ativo</th></tr></thead><tbody>${p.map(x=>`<tr><td><b>${esc(x.full_name)}</b></td><td>${esc(x.role)}</td><td>${esc(x.store_id||'TODAS/SEM LOJA')}</td><td>${x.active?'SIM':'NÃO'}</td></tr>`).join('')}</tbody></table></div></div><div class="modules"><div class="card"><h3>Perfis</h3><p>GESTOR, ATENDENTE, TÉCNICO e ESTOQUE.</p></div><div class="card"><h3>Auditoria</h3><p>Alterações manuais de situação ficam registradas no histórico.</p></div><div class="card"><h3>Inatividade</h3><p>Bloqueio automático da interface após 30 minutos sem atividade.</p></div></div>`}

let idleTimer;function resetIdle(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{clearSession();toast('Sessão encerrada por inatividade.');setTimeout(loginScreen,700)},30*60*1000)}
['click','keydown','mousemove','touchstart'].forEach(ev=>addEventListener(ev,resetIdle,{passive:true}));
async function boot(){shell();resetIdle();await loadCore();render('dashboard')}
(async()=>{if(await restoreSession())boot();else loginScreen()})();