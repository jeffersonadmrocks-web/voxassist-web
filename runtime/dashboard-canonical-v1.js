/* VoxAssist — Dashboard Canônico V1
 * Fonte única do Dashboard. Não altera login, shell, abas, OS ou demais módulos.
 * Sem MutationObserver, sem sobrescritas encadeadas, sem números fictícios.
 *
 * Reconstrução (2026-09-01) pra reproduzir fielmente a referência visual
 * aprovada (screenshot real do usuário): ordem indicadores -> Casos de
 * Atenção/Oportunidades -> Gestão Visual -> Tarefas/Peças/Gestão por
 * Exceção -> Feed/Produtividade -> Metas/Resumo Financeiro -> Minha
 * Agenda (5 dias). Tudo derivado de tabelas/colunas reais já existentes
 * -- nenhuma tabela nova, nenhum valor fictício. Onde a referência pede
 * algo sem base real persistida (Metas e Bonificação), mantém "Não
 * configurado" -- regra explícita já dada pelo usuário nesta sessão.
 *
 * Achados/decisões de derivação, documentados porque a fonte não é
 * 1:1 óbvia. Referência visual = só composição/densidade/estilo; NUNCA
 * números, rótulos ou vocabulário de status copiados da imagem -- fonte
 * de verdade é sempre schema real + funcionalidade já aprovada:
 * - dashboard_cases.status: sem CHECK constraint no schema (só o default
 *   'NOVO' é garantido), mas o usuário confirmou em 2026-09-01 que o
 *   vocabulário real esperado é exatamente NOVO/EM ANDAMENTO/RESOLVIDO
 *   -- confirmação explícita do usuário, não suposição a partir da
 *   imagem de referência. Os 3 contadores do card são escopados aos
 *   últimos 30 dias (via created_at); o drill-down "Ver todos os
 *   casos" continua mostrando todos os casos em aberto, sem esse corte.
 * - parts_requests.status: mesma situação (sem CHECK constraint, nenhum
 *   outro código escreve nessa tabela). Uso só a contagem total (igual
 *   ao Dashboard original) e "Atrasados" via expected_date (data real,
 *   independente do texto do status) -- nunca uma quebra por
 *   PENDENTE/EM COMPRA/AGUARDANDO ENTREGA, que não tem base real.
 * - "Orçamentos (Mês)"/"Entregues (Mês)": contados via os_status_history
 *   (mudanças de status reais, com changed_at), não por opened_at/
 *   updated_at da OS -- é a única forma correta de saber QUANDO uma OS
 *   entrou em AGUARDANDO APROVACAO/FINALIZADA.
 */
(function(){
  'use strict';
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const M=v=>typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const norm=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replaceAll('_',' ').replace(/\s+/g,' ').trim();
  const role=()=>norm(state?.profile?.role||'GESTOR');
  const me=()=>state?.profile?.id;
  const age=o=>Math.max(0,Math.floor((Date.now()-new Date(o.updated_at||o.opened_at||Date.now()).getTime())/86400000));
  const isOpen=o=>!['FINALIZADA','CANCELADA'].includes(norm(o.status));
  const safe=x=>Array.isArray(x)?x:[];
  const scope=rows=>role()==='TECNICO'?rows.filter(o=>o.technician_id===me()):role()==='ATENDENTE'?rows.filter(o=>o.attendant_id===me()||!o.attendant_id):rows;
  const budget=f=>Math.max(0,Number(f?.labor_value||0)+Number(f?.freight_value||0)+Number(f?.auxiliary_material_value||0)+Number(f?.technical_report_value||0)-Number(f?.discount_value||0));
  const startOfMonth=d=>new Date(d.getFullYear(),d.getMonth(),1);
  const withTimeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,rej)=>setTimeout(()=>rej(new Error(label+' excedeu '+ms+'ms')),ms))]);
  const pct=(part,total)=>total>0?Math.round((part/total)*100):0;

  async function source(label,path,fallback=[]){
    try{return {label,ok:true,data:await withTimeout(api(path),7000,label)}}catch(error){return {label,ok:false,data:fallback,error}}
  }

  function modal(title,rows){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>O.S.</th><th>Cliente</th><th>Equipamento</th><th>Situação</th><th>Dias</th></tr></thead><tbody>${rows.map(o=>`<tr data-os="${E(o.id)}"><td><b>${E(o.os_number||'—')}</b></td><td>${E(o.clients?.name||'—')}</td><td>${E([o.equipments?.product_type,o.equipments?.brand,o.equipments?.model].filter(Boolean).join(' • ')||'—')}</td><td>${E(norm(o.status)||'—')}</td><td>${age(o)}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
    bg.querySelectorAll('[data-os]').forEach(tr=>tr.onclick=()=>{const id=tr.dataset.os;bg.remove();if(typeof window.render==='function')window.render('os:'+id);else if(typeof render==='function')render('os:'+id);});
  }

  function casesModal(title,rows){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>Caso</th><th>Prioridade</th><th>Situação</th><th>Aberto em</th></tr></thead><tbody>${rows.map(c=>`<tr><td><b>${E(c.title)}</b>${c.message?`<br><small>${E(c.message)}</small>`:''}</td><td>${E(norm(c.priority)||'—')}</td><td>${E(norm(c.status)||'—')}</td><td>${new Date(c.created_at).toLocaleDateString('pt-BR')}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
  }

  // Modal pra linhas de parts_requests (achado do usuário em
  // 2026-09-01: "Pedidos de Peças" não tinha como ver quais pedidos
  // reais estavam por trás de cada número -- mesmo problema do
  // Gestão Visual, mesma correção: linhas reais, não só a contagem).
  function partsModal(title,rows){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>Peça</th><th>Código</th><th>Qtd</th><th>Fornecedor</th><th>Situação</th><th>Previsão</th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${E(p.description||'—')}</b></td><td>${E(p.code||'—')}</td><td>${E(p.quantity||1)}</td><td>${E(p.supplier||'—')}</td><td>${E(norm(p.status)||'—')}</td><td>${p.expected_date?new Date(p.expected_date).toLocaleDateString('pt-BR'):'—'}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
  }

  // Modal pra ver o histórico completo do Feed (achado do usuário em
  // 2026-09-01: "Ver tudo" não fazia nada -- o feed real vinha
  // truncado nas últimas 8 mudanças de status; aqui mostra tudo que
  // já foi buscado, sem esse corte).
  function feedModal(title,rows,feedTextFn){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>Quando</th><th>Evento</th></tr></thead><tbody>${rows.map(h=>`<tr><td>${new Date(h.changed_at).toLocaleString('pt-BR')}</td><td>${E(feedTextFn(h))}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
  }

  // Modal pra linhas de tasks (achado do usuário em 2026-09-01: mesma
  // situação -- "Retornar clientes pendentes" não mostrava quais
  // tarefas reais).
  function tasksModal(title,rows){
    document.querySelector('#vxCanonicalModal')?.remove();
    const bg=document.createElement('div');bg.id='vxCanonicalModal';bg.className='vx-c-modal-bg';
    bg.innerHTML=`<div class="vx-c-modal"><div class="vx-c-modal-head"><div><strong>${E(title)}</strong><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><button type="button" data-close>×</button></div><div class="vx-c-modal-body">${rows.length?`<table><thead><tr><th>Tarefa</th><th>Prioridade</th><th>Situação</th><th>Prazo</th></tr></thead><tbody>${rows.map(t=>`<tr><td><b>${E(t.title||'—')}</b></td><td>${E(norm(t.priority)||'—')}</td><td>${E(norm(t.status)||'—')}</td><td>${t.due_at?new Date(t.due_at).toLocaleDateString('pt-BR'):'—'}</td></tr>`).join('')}</tbody></table>`:'<div class="vx-c-empty">Nenhum registro encontrado.</div>'}</div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove();};
  }

  function orderValue(o,finMap){const direct=Number(o.total_amount||o.budget_total||o.valor_total||o.total||o.amount||0);if(direct)return direct;return budget(finMap.get(String(o.id)))}

  // Pluralização mínima pra "N geladeiras do mesmo modelo" -- só os
  // tipos de produto já vistos no restante do app; fallback genérico
  // com "(s)" pra não arriscar plural errado de um tipo desconhecido.
  const PLURAL={GELADEIRA:'geladeiras',REFRIGERADOR:'refrigeradores',TV:'TVs',FOGAO:'fogões',MICROONDAS:'micro-ondas','LAVA E SECA':'lava e secas',LAVADORA:'lavadoras'};
  function plural(t){const n=norm(t);return PLURAL[n]||(t?E(t).toLowerCase()+'(s)':'aparelho(s)')}

  function discovery(){
    const pool=[
      ['Gestão','Nem todo atraso é um problema isolado; repetição costuma indicar gargalo de processo.','Observe onde a fila cresce por vários dias. O ponto de acúmulo merece investigação antes de cobrar velocidade das pessoas.'],
      ['Prioridade','Urgência sem critério transforma tudo em urgente.','Defina prioridade pelo impacto no cliente, prazo e risco operacional. Isso reduz decisões por impulso.'],
      ['Qualidade','Um indicador útil deve levar a uma ação possível.','Se um número não permite identificar causa, responsável ou próximo passo, ele é apenas informação — não inteligência de gestão.'],
      ['Segurança','A melhor permissão é a menor necessária para realizar o trabalho.','Privilégio mínimo reduz impacto de erro humano, credencial comprometida e acesso indevido.'],
      ['Produtividade','Mais atividade não significa mais resultado.','Compare volume concluído, tempo de ciclo, retorno do cliente e retrabalho para distinguir esforço de produtividade real.']
    ];
    const d=pool[Math.floor(Date.now()/86400000)%pool.length];
    return `<div class="vx-c-discovery"><div><strong>💡 DESCOBERTA DO DIA · ${E(d[0])}</strong><p>${E(d[1])}</p></div><details><summary>Quero saber mais</summary><p>${E(d[2])}</p><small>Conteúdo local. Não consulta nem envia dados operacionais.</small></details></div>`;
  }

  window.renderDashboard=async function(){
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML='<div class="card">Carregando inteligência operacional...</div>';

    const today=new Date();today.setHours(0,0,0,0);
    const month0=startOfMonth(today);
    const prevMonth0=new Date(month0.getFullYear(),month0.getMonth()-1,1);
    const agendaEnd=new Date(today);agendaEnd.setDate(agendaEnd.getDate()+4);
    const days30Ago=new Date(today);days30Ago.setDate(days30Ago.getDate()-30);
    const isoDate=d=>d.toISOString().slice(0,10);

    const results=await Promise.all([
      source('Ordens','service_orders?select=*,clients(name,neighborhood,city),equipments(product_type,brand,model),profiles!service_orders_technician_id_fkey(full_name)&order=opened_at.desc&limit=500',state?.orders||[]),
      source('Tarefas','tasks?select=*&order=due_at.asc.nullslast&limit=200',state?.tasks||[]),
      source('Casos de atenção','dashboard_cases?select=*&order=created_at.desc&limit=200',[]),
      source('Agenda 5 dias',`appointments?select=*,service_orders(os_number,reported_defect,client_id,clients(neighborhood,city),equipments(product_type,brand,model))&appointment_date=gte.${isoDate(today)}&appointment_date=lte.${isoDate(agendaEnd)}&order=appointment_date.asc,period.asc,start_time.asc&limit=300`,[]),
      source('Peças','parts_requests?select=*&order=created_at.desc&limit=200',[]),
      source('Financeiro','os_financial?select=*&limit=1000',[]),
      source('Pagamentos','payments?select=*&order=paid_at.desc.nullslast&limit=1500',[]),
      source('Técnicos','profiles?select=id,full_name,role&active=eq.true&order=full_name',[]),
      source('Histórico de status',`os_status_history?select=*,service_orders(os_number)&changed_at=gte.${isoDate(prevMonth0)}&order=changed_at.desc&limit=400`,[])
    ]);
    const by=Object.fromEntries(results.map(r=>[r.label,r]));
    const orders=scope(safe(by['Ordens'].data)), active=orders.filter(isOpen);
    const analysis=active.filter(o=>norm(o.status)==='AGUARDANDO ANALISE');
    const approval=active.filter(o=>norm(o.status)==='AGUARDANDO APROVACAO');
    const repair=active.filter(o=>['AGUARDANDO CONSERTO','EM CONSERTO'].includes(norm(o.status)));
    const ready=active.filter(o=>norm(o.status)==='PRONTO PARA ENTREGA');
    const overdueAnalysis=analysis.filter(o=>age(o)>3), overdueApproval=approval.filter(o=>age(o)>3), overdueRepair=repair.filter(o=>age(o)>7);
    const readyOverdue7=ready.filter(o=>age(o)>7), readyOverdue3=ready.filter(o=>age(o)>3);
    const noTech=active.filter(o=>!o.technician_id), urgent=active.filter(o=>norm(o.priority).includes('URG'));
    const tasks=safe(by['Tarefas'].data).filter(t=>!['CONCLUIDO','CANCELADO'].includes(norm(t.status)));
    const casesAll=safe(by['Casos de atenção'].data);
    const casesAbertos=casesAll.filter(c=>!['RESOLVIDO','CANCELADO'].includes(norm(c.status)));
    // Card "Casos de Atenção": Novos/Em andamento/Resolvidos, escopados
    // aos últimos 30 dias -- confirmado pelo usuário em 2026-09-01 (a
    // versão anterior, mais conservadora, tratava EM ANDAMENTO/
    // RESOLVIDO como vocabulário não confirmado; o usuário confirmou
    // que é exatamente esse o vocabulário real esperado).
    const casesLast30=casesAll.filter(c=>c.created_at&&new Date(c.created_at)>=days30Ago);
    const casesNovos=casesLast30.filter(c=>norm(c.status)==='NOVO');
    const casesAndamento=casesLast30.filter(c=>norm(c.status)==='EM ANDAMENTO');
    const casesResolvidos=casesLast30.filter(c=>norm(c.status)==='RESOLVIDO');
    // Card "Pedidos de Peças": Pendentes de aprovação/Em compra/
    // Aguardando entrega/Atrasados/Recebidos hoje -- vocabulário
    // confirmado pelo usuário em 2026-09-01 (mesma situação de Casos
    // de Atenção: sem CHECK constraint no schema, mas confirmado como
    // o vocabulário real esperado, não suposição a partir da imagem).
    const partsAll=safe(by['Peças'].data);
    const partsPendentes=partsAll.filter(p=>['PENDENTE','SOLICITADO'].includes(norm(p.status)));
    const partsCompra=partsAll.filter(p=>norm(p.status).includes('COMPRA'));
    const partsEntrega=partsAll.filter(p=>norm(p.status).includes('ENTREGA'));
    const partsAtrasadas=partsAll.filter(p=>p.expected_date&&new Date(p.expected_date)<today&&!norm(p.status).includes('RECEBID'));
    const partsRecebidasHoje=partsAll.filter(p=>norm(p.status).includes('RECEBID')&&p.updated_at&&isoDate(new Date(p.updated_at))===isoDate(today));
    const finMap=new Map(safe(by['Financeiro'].data).map(f=>[String(f.service_order_id),f]));
    const validPayments=safe(by['Pagamentos'].data).filter(p=>p.paid_at&&!['CANCELADO','CANCELADA','ESTORNADO','ESTORNADA'].includes(norm(p.status)));
    const receivedMonth=validPayments.filter(p=>new Date(p.paid_at)>=month0).reduce((s,p)=>s+Number(p.amount||0),0);

    // Resumo Financeiro -- 6 métricas. Definição original dada pelo
    // usuário em 2026-09-01 (a imagem de referência é só o layout; as
    // definições de cada card vieram por texto, não da imagem);
    // "A receber" x "Oportunidade de faturamento" CORRIGIDO em
    // 2026-09-02 -- achado do usuário: as duas métricas contavam a
    // mesma OS em conserto duas vezes (uma líquida, outra bruta).
    // Definição confirmada pelo usuário (versão do Dashboard -- o
    // relatório financeiro completo, tela separada, pode ter conceito
    // diferente):
    // 1. Faturamento realizado = quanto efetivamente entrou no mês
    //    (= receivedMonth, já real).
    // 2. A receber = orçado em OS PRONTAS PARA ENTREGA (aparelho já
    //    concluído, só aguardando o cliente retirar), menos o que já
    //    foi pago dessa OS. Não inclui mais OS ainda em conserto --
    //    essas agora só entram em "Oportunidade de faturamento" (ver
    //    item 5), pra não contar o mesmo valor duas vezes.
    // 3. Média diária = faturamento realizado dividido pelos dias já
    //    passados do mês corrente.
    // 4. Ticket médio recebido = faturamento realizado dividido pelo
    //    número de OS distintas que receberam pagamento no mês.
    // 5. Oportunidade de faturamento = OS já aprovadas/autorizado o
    //    reparo, ainda em conserto (AGUARDANDO CONSERTO/EM CONSERTO) --
    //    "quase certo o recebimento, só falta a ação da equipe pra
    //    gerar o resultado" (palavras do usuário) -- é o "repair" já
    //    calculado acima, valor bruto orçado (não líquido -- é
    //    potencial, não dívida em aberto).
    // 6. Meta do mês = sem tabela real de meta financeira persistida
    //    (mesma situação do card "Metas e Bonificação" ao lado) --
    //    fica honestamente "Não configurado", nunca um número inventado.
    const paidByOrder=new Map();
    validPayments.forEach(p=>{const k=String(p.service_order_id);paidByOrder.set(k,(paidByOrder.get(k)||0)+Number(p.amount||0))});
    const aReceber=orders.filter(o=>norm(o.status)==='PRONTO PARA ENTREGA').reduce((s,o)=>{
      const bud=budget(finMap.get(String(o.id))), paid=paidByOrder.get(String(o.id))||0;
      return s+Math.max(0,bud-paid);
    },0);
    const mediaDiaria=receivedMonth/Math.max(1,today.getDate());
    const paidThisMonthOrderIds=new Set(validPayments.filter(p=>new Date(p.paid_at)>=month0).map(p=>String(p.service_order_id)));
    const ticketMedioRecebido=paidThisMonthOrderIds.size?receivedMonth/paidThisMonthOrderIds.size:0;
    const oportunidadeFaturamento=repair.reduce((s,o)=>s+budget(finMap.get(String(o.id))),0);
    const failures=results.filter(r=>!r.ok).map(r=>r.label);
    const techs=safe(by['Técnicos'].data).filter(t=>norm(t.role)==='TECNICO');
    const history=safe(by['Histórico de status'].data);

    // clientes com mais de 1 OS ativa
    const byClient=new Map();
    active.forEach(o=>{if(!o.client_id)return;byClient.set(o.client_id,(byClient.get(o.client_id)||0)+1)});
    const repeatClients=[...byClient.values()].filter(n=>n>1).length;
    const repeatClientOrders=active.filter(o=>o.client_id&&byClient.get(o.client_id)>1);

    // retiradas previstas pra hoje = compromisso de hoje numa OS já pronta
    const agenda=safe(by['Agenda 5 dias'].data);
    const readyIds=new Set(ready.map(o=>o.id));
    const retiradasHoje=agenda.filter(a=>a.appointment_date===isoDate(today)&&readyIds.has(a.service_order_id)).length;

    // Orçamentos/Entregues do mês, via os_status_history (data real da
    // transição, não opened_at/updated_at da OS).
    function monthTransitions(statusLabel,from,to){
      const ids=new Set(history.filter(h=>norm(h.new_status)===statusLabel&&new Date(h.changed_at)>=from&&new Date(h.changed_at)<to).map(h=>h.service_order_id));
      const rows=orders.filter(o=>ids.has(o.id));
      return {count:ids.size,value:rows.reduce((s,o)=>s+budget(finMap.get(String(o.id))),0),rows};
    }
    const monthEnd=new Date(month0.getFullYear(),month0.getMonth()+1,1);
    const orcamentosMes=monthTransitions('AGUARDANDO APROVACAO',month0,monthEnd);
    const entreguesMes=monthTransitions('FINALIZADA',month0,monthEnd);
    const activeOpenedThisMonth=active.filter(o=>new Date(o.opened_at)>=month0).length;

    // Gestão Visual -- faixas de idade (0-7/8-15/16-30/31-90 dias),
    // corrigido em 2026-09-01 a pedido do usuário (faixas antigas
    // 0/1-3/4-7/8+ estavam erradas -- inclusive sobrepostas).
    function ageBuckets(rows){
      const b=[0,0,0,0], rowsByBucket=[[],[],[],[]];
      rows.forEach(o=>{const a=age(o);const i=a<=7?0:a<=15?1:a<=30?2:3;b[i]++;rowsByBucket[i].push(o)});
      const oldest=rows.reduce((m,o)=>Math.max(m,age(o)),0);
      return {b,oldest,rowsByBucket};
    }
    const gvAnalysis=ageBuckets(analysis), gvApproval=ageBuckets(approval), gvReady=ageBuckets(ready);
    // Drill-down por faixa etária do Gestão Visual -- clicar num
    // número/segmento mostra exatamente quais OS estão naquela faixa
    // (achado do usuário em 2026-09-01: os números eram estáticos, sem
    // forma de ver quais atendimentos estavam por trás do total).
    const gvDrills={};
    [['gvAnalysis',gvAnalysis,'Aguardando Análise'],['gvApproval',gvApproval,'Aguardando Aprovação'],['gvReady',gvReady,'Prontos para Entrega']].forEach(([key,g,label])=>{
      g.rowsByBucket.forEach((rows,i)=>{gvDrills[`${key}_b${i}`]=rows});
    });

    // Produtividade por técnico (tabela) -- OS/Valor recebido/Prontos/Aproveitamento.
    // Achado do usuário em 2026-09-02: ao contrário dos outros cards
    // (corrigidos no commit 5d32a85), esta tabela nunca ganhou
    // drill-down -- "2 OS" era só texto estático, sem como ver quais
    // eram. Corrigido do mesmo jeito: cada célula clicável abre o
    // modal real com as OS por trás do número.
    const prodRows=techs.map(t=>{
      const mine=orders.filter(o=>o.technician_id===t.id);
      const readyRowsMine=mine.filter(o=>norm(o.status)==='PRONTO PARA ENTREGA');
      const finalMine=mine.filter(o=>norm(o.status)==='FINALIZADA');
      const valorRecebido=validPayments.filter(p=>mine.some(o=>String(o.id)===String(p.service_order_id))).reduce((s,p)=>s+Number(p.amount||0),0);
      return {tech:t,os:mine.length,osRows:mine,valor:valorRecebido,prontos:readyRowsMine.length,prontosRows:readyRowsMine,aproveitamento:pct(finalMine.length,mine.length||1)};
    }).filter(r=>r.os>0).sort((a,b)=>b.valor-a.valor);
    const totalRecebidoOS=prodRows.reduce((s,r)=>s+r.valor,0);
    const prodDrills={};
    prodRows.forEach(r=>{prodDrills['prodOs_'+r.tech.id]=r.osRows;prodDrills['prodProntos_'+r.tech.id]=r.prontosRows});

    // Feed em tempo real -- eventos reais de os_status_history.
    function feedText(h){
      const num=h.service_orders?.os_number||'—';
      const ns=norm(h.new_status);
      if(!h.previous_status)return `Nova OS #${num} criada`;
      if(ns==='AGUARDANDO APROVACAO')return `Orçamento enviado para cliente — OS #${num}`;
      if(ns==='EM CONSERTO'||ns==='AGUARDANDO CONSERTO')return `OS #${num} entrou em conserto`;
      if(ns==='PRONTO PARA ENTREGA')return `OS #${num} pronta para entrega`;
      if(ns==='FINALIZADA')return `OS #${num} marcada como concluída`;
      return `OS #${num}: ${E(norm(h.previous_status))} → ${E(ns)}`;
    }
    const feed=history.slice(0,8);

    // Agenda -- próximos 5 dias, agrupado por dia/período, com
    // detecção de aparelhos repetidos (mesmo modelo, ou mesma região).
    // Achado do usuário em 2026-09-02: o card se chamava "Minha
    // Agenda" mas a consulta nunca filtrava por técnico nenhum --
    // mostrava os compromissos de TODOS os técnicos misturados, pra
    // qualquer perfil. Corrigido: TÉCNICO só vê a própria agenda de
    // verdade agora; GESTOR/ATENDENTE viram "Agenda dos Técnicos", com
    // navegação pra escolher um técnico (ou "Todos", mesmo
    // comportamento de antes -- tudo misturado) sem precisar recarregar
    // o Dashboard inteiro (buildAgendaDays/agendaCardHtml ficam
    // acessíveis fora deste closure via window.__vxDashAgenda pra
    // renderAgendaCardOnly() re-renderizar só o card).
    const weekdayShort=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
    function buildAgendaDays(techFilterId){
      const filtered=techFilterId?agenda.filter(a=>String(a.technician_id)===String(techFilterId)):agenda;
      return [0,1,2,3,4].map(off=>{
        const d=new Date(today);d.setDate(d.getDate()+off);
        const iso=isoDate(d);
        const rows=filtered.filter(a=>a.appointment_date===iso);
        const label=off===0?'Hoje':off===1?'Amanhã':`${weekdayShort[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}`;
        const byModel=new Map(),byRegion=new Map();
        rows.forEach(a=>{
          const eq=a.service_orders?.equipments;if(!eq)return;
          const modelKey=[eq.product_type,eq.brand,eq.model].filter(Boolean).join('|');
          if(modelKey)byModel.set(modelKey,(byModel.get(modelKey)||[]).concat(a));
          const region=a.service_orders?.clients?.neighborhood||a.service_orders?.clients?.city;
          if(region&&eq.product_type){const k=eq.product_type+'|'+region;byRegion.set(k,(byRegion.get(k)||[]).concat(a))}
        });
        let dupWarning='';
        const modelDup=[...byModel.entries()].find(([,v])=>v.length>1);
        if(modelDup){const eq=modelDup[1][0].service_orders.equipments;dupWarning=`${modelDup[1].length} ${plural(eq.product_type)} do mesmo modelo`}
        else{const regionDup=[...byRegion.entries()].find(([,v])=>v.length>1);if(regionDup){const [type]=regionDup[0].split('|');dupWarning=`${regionDup[1].length} ${plural(type)} na mesma região`}}
        return {label,iso,rows,count:rows.length,dupWarning};
      });
    }
    // GESTOR/ATENDENTE começam em "Todos os técnicos" (sem filtro,
    // mesmo comportamento de sempre); TÉCNICO é sempre e só a própria
    // agenda, sem seletor -- nunca outro usuário. Navegação entre
    // técnicos usa a mesma lista "techs" já usada na Produtividade
    // (RLS já escopa por empresa -- ver profiles_select_company;
    // não existe hoje nenhuma restrição adicional por loja pra
    // ATENDENTE em lugar nenhum deste arquivo, então não inventei uma
    // aqui -- reportado no fechamento).
    let agendaSelectedTechId=role()==='TECNICO'?me():null;
    function apptCard(a){
      const eq=a.service_orders?.equipments||{};
      const loc=a.service_orders?.clients?.neighborhood||a.service_orders?.clients?.city||'';
      return `<div class="vx-c-appt"><b>${E([eq.product_type,eq.brand,eq.model].filter(Boolean).join(' · ')||'Equipamento')}</b><span>${E(loc)}${loc&&a.service_orders?.reported_defect?' · ':''}${E(a.service_orders?.reported_defect||'')}</span></div>`;
    }
    function agendaSectionHtml(techFilterId){
      const isTecnico=role()==='TECNICO';
      const currentDays=buildAgendaDays(techFilterId);
      const idx=techFilterId?techs.findIndex(t=>String(t.id)===String(techFilterId)):-1;
      const title=isTecnico?'Minha Agenda':'Agenda dos Técnicos';
      const grid=`<div class="vx-c-agenda5-grid">${currentDays.map(d=>{
        const manha=d.rows.filter(a=>norm(a.period)!=='TARDE'), tarde=d.rows.filter(a=>norm(a.period)==='TARDE');
        return `<div class="vx-c-agenda5-day"><div class="vx-c-agenda5-day-head"><strong>${E(d.label)}</strong><span>${d.count}</span></div>
          ${manha.length?`<div class="vx-c-agenda5-period"><small>MANHÃ</small>${manha.map(apptCard).join('')}</div>`:''}
          ${tarde.length?`<div class="vx-c-agenda5-period"><small>TARDE</small>${tarde.map(apptCard).join('')}</div>`:''}
          ${!d.count?'<p class="vx-c-empty">Sem compromissos.</p>':''}
          ${d.dupWarning?`<div class="vx-c-agenda5-warn">⚠ ${E(d.dupWarning)}</div>`:''}
        </div>`;
      }).join('')}</div>`;
      const techNav=isTecnico?'':`<div class="vx-c-agenda5-tech-nav">
        <button type="button" id="vxAgendaTechPrev" ${idx<=0?'disabled':''} title="Técnico anterior">‹</button>
        <select id="vxAgendaTechSelect">
          <option value="" ${!techFilterId?'selected':''}>Todos os técnicos</option>
          ${techs.map(t=>`<option value="${E(t.id)}" ${String(t.id)===String(techFilterId)?'selected':''}>${E(t.full_name)}</option>`).join('')}
        </select>
        <button type="button" id="vxAgendaTechNext" ${idx>=0&&idx>=techs.length-1?'disabled':''} title="Próximo técnico">›</button>
      </div>`;
      return `<section class="vx-c-agenda5-card" id="vxAgendaCard">
        <div class="vx-c-title"><h3>◷ ${title} — Próximos 5 dias</h3><a href="#" id="vxAgendaFull">Ver agenda completa</a></div>
        ${techNav}
        ${grid}
      </section>`;
    }
    function wireAgendaCard(){
      document.getElementById('vxAgendaFull').onclick=(ev)=>{
        ev.preventDefault();
        window.__vxAgendaTechFilter=agendaSelectedTechId||null;
        if(typeof window.render==='function')window.render('agenda');
      };
      document.getElementById('vxAgendaTechSelect')?.addEventListener('change',e=>{agendaSelectedTechId=e.target.value||null;renderAgendaCardOnly()});
      document.getElementById('vxAgendaTechPrev')?.addEventListener('click',()=>{
        const idx=techs.findIndex(t=>String(t.id)===String(agendaSelectedTechId));
        if(idx>0){agendaSelectedTechId=techs[idx-1].id;renderAgendaCardOnly()}
      });
      document.getElementById('vxAgendaTechNext')?.addEventListener('click',()=>{
        const idx=techs.findIndex(t=>String(t.id)===String(agendaSelectedTechId));
        if(idx===-1){if(techs.length){agendaSelectedTechId=techs[0].id;renderAgendaCardOnly()}return}
        if(idx<techs.length-1){agendaSelectedTechId=techs[idx+1].id;renderAgendaCardOnly()}
      });
    }
    // "Trocar técnico atualiza somente o conteúdo do card" -- pedido
    // do usuário em 2026-09-02: nunca recarrega o Dashboard inteiro,
    // só troca o <section> da agenda.
    function renderAgendaCardOnly(){
      const card=document.getElementById('vxAgendaCard');
      if(!card)return;
      card.outerHTML=agendaSectionHtml(agendaSelectedTechId);
      wireAgendaCard();
    }

    const drills={active,analysis,approval,repair,ready,noTech,urgent,overdueAnalysis,overdueApproval,overdueRepair,readyOverdue7,readyOverdue3,orcamentosMes:orcamentosMes.rows,entreguesMes:entreguesMes.rows,repeatClientOrders,...gvDrills,...prodDrills};
    const partsDrills={partsAll,partsPendentes,partsCompra,partsEntrega,partsAtrasadas,partsRecebidasHoje};
    const tasksDrills={tasks};
    const caseDrills={casesAbertos,casesNovos,casesAndamento,casesResolvidos};

    function kpi(icon,title,value,sub,key){return `<button type="button" class="vx-c-kpi" data-drill="${key}" data-title="${E(title)}"><span class="vx-c-kpi-icon">${icon}</span><span class="vx-c-kpi-label">${E(title)}</span><b>${E(value)}</b><small>${E(sub)}</small></button>`}
    function oppRow(label,n){return `<div class="vx-c-opp-row"><span>${E(label)}</span><b>${n}</b></div>`}
    function taskRow(label,n,key){
      if(!key)return `<div class="vx-c-task-row"><span class="vx-c-task-check">☐</span><span>${E(label)}</span><b>${n}</b></div>`;
      return `<button type="button" class="vx-c-task-row" data-drill="${key}" data-title="${E(label)}"${n?'':' disabled'}><span class="vx-c-task-check">☐</span><span>${E(label)}</span><b>${n}</b></button>`;
    }
    function iconRow(icon,label,n,tone,key){
      if(!key)return `<div class="vx-c-icon-row"><span class="vx-c-icon-row-ic ${tone||''}">${icon}</span><span>${E(label)}</span><b>${n}</b></div>`;
      return `<button type="button" class="vx-c-icon-row" data-drill="${key}" data-title="${E(label)}"${n?'':' disabled'}><span class="vx-c-icon-row-ic ${tone||''}">${icon}</span><span>${E(label)}</span><b>${n}</b></button>`;
    }
    function gvPanel(title,g,drillKey){
      const labels=['0 a 7 dias','8 a 15 dias','16 a 30 dias','31 a 90 dias'],tones=['b0','b1','b2','b3'];
      return `<div class="vx-c-gv-panel"><div class="vx-c-gv-head"><strong>${E(title)}</strong><span>Total: ${g.b.reduce((s,n)=>s+n,0)}</span></div>
        <div class="vx-c-gv-bar">${g.b.map((n,i)=>`<span class="vx-c-gv-seg ${tones[i]}" style="flex:${Math.max(n,0.001)}"></span>`).join('')}</div>
        <div class="vx-c-gv-legend">${g.b.map((n,i)=>`<button type="button" class="vx-c-gv-legend-item" data-drill="${drillKey}_b${i}" data-title="${E(title)} — ${labels[i]}" ${n?'':'disabled'}><small>${labels[i]}</small><b>${n}</b></button>`).join('')}</div>
        <small class="vx-c-gv-oldest">Mais antigo: ${g.oldest} dia${g.oldest===1?'':'s'}</small></div>`;
    }

    app.innerHTML=`<div class="vx-canonical">
      ${failures.length?`<div class="vx-c-warning"><strong>Dados parciais:</strong> ${E(failures.join(', '))} não responderam. O Dashboard continuou com as demais fontes.</div>`:''}
      <div class="vx-c-hero"><div><span class="vx-c-hero-eyebrow">VOXASSIST · PAINEL DE GESTÃO</span><h2>${role()==='GESTOR'?'Visão Geral da Operação':role()==='TECNICO'?'Minha Central Técnica':'Minha Central de Atendimento'}</h2><p>Dados atualizados em tempo real.</p></div><span class="vx-c-hero-date">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</span></div>

      <div class="vx-c-kpirow">
        ${kpi('📋','OS Ativas',active.length,`+${activeOpenedThisMonth} este mês`,'active')}
        ${kpi('📥','Aguardando Análise',analysis.length,`${overdueAnalysis.length} acima do prazo`,'analysis')}
        ${kpi('⏳','Aguardando Aprovação',approval.length,`${urgent.filter(o=>approval.includes(o)).length} urgentes`,'approval')}
        ${kpi('🔧','Em Conserto',repair.length,overdueRepair.length?`${overdueRepair.length} acima do prazo`:'Normal','repair')}
        ${kpi('📦','Prontos para Entrega',ready.length,`${readyOverdue7.length} há mais de 7 dias`,'ready')}
        ${kpi('💰','Orçamentos (Mês)',orcamentosMes.count,M(orcamentosMes.value),'orcamentosMes')}
        ${kpi('🚚','Entregues (Mês)',entreguesMes.count,M(entreguesMes.value),'entreguesMes')}
      </div>

      <div class="vx-c-grid-2">
        <section class="vx-c-cases-card"><div class="vx-c-title"><h3>⚠ Casos de Atenção</h3><a href="#" data-drill="casesAbertos" data-title="Casos de Atenção">Ver todos os casos</a></div>
          <div class="vx-c-cases-row">
            <div><b>${casesNovos.length}</b><span>Novos casos</span><small>Requerem triagem</small></div>
            <div><b>${casesAndamento.length}</b><span>Em andamento</span><small>Aguardando retorno do cliente</small></div>
            <div><b>${casesResolvidos.length}</b><span>Resolvidos</span><small>Últimos 30 dias</small></div>
          </div>
        </section>
        <section class="vx-c-opp-card"><div class="vx-c-title"><h3>◎ Oportunidades do Dia</h3><a href="#" data-drill="ready" data-title="Oportunidades do Dia">Ver todas</a></div>
          ${oppRow('Retiradas previstas para hoje',retiradasHoje)}
          ${oppRow('Orçamentos sem resposta',approval.length)}
          ${oppRow('Aparelhos prontos para retirada',ready.length)}
          ${oppRow('Prazos críticos próximos',analysis.filter(o=>age(o)===2).length+approval.filter(o=>age(o)===2).length+repair.filter(o=>age(o)===6).length)}
          ${oppRow('Clientes com mais de 1 OS',repeatClients)}
        </section>
      </div>

      <section class="vx-c-gv-card"><div class="vx-c-title"><h3>▥ Gestão Visual <span class="vx-c-info" title="Distribuição das OS por tempo desde a última mudança de situação">ⓘ</span></h3><a href="#" data-drill="active" data-title="Gestão Visual">Ver todos</a></div>
        <div class="vx-c-gv-grid">${gvPanel('AGUARDANDO ANÁLISE',gvAnalysis,'gvAnalysis')}${gvPanel('AGUARDANDO APROVAÇÃO',gvApproval,'gvApproval')}${gvPanel('PRONTOS PARA ENTREGA',gvReady,'gvReady')}</div>
      </section>

      <div class="vx-c-grid-3">
        <section class="vx-c-list-card vx-c-list-tasks"><div class="vx-c-title"><h3>☑ Minhas Tarefas</h3></div>
          ${taskRow('Tirar novos casos de atenção',casesNovos.length,'cases:casesNovos')}
          ${taskRow('Retornar clientes pendentes',tasks.length,'tasks:tasks')}
          ${taskRow('Acompanhar orçamentos sem resposta',approval.length,'approval')}
          ${taskRow('Aprovar pedidos de peças',partsPendentes.length,'parts:partsPendentes')}
          ${taskRow('Confirmar aparelhos prontos',ready.length,'ready')}
        </section>
        <section class="vx-c-list-card vx-c-list-parts"><div class="vx-c-title"><h3>▦ Pedidos de Peças</h3><a href="#" data-drill="parts:partsAll" data-title="Pedidos de Peças">Ver todas</a></div>
          ${iconRow('◷','Pendentes de aprovação',partsPendentes.length,'','parts:partsPendentes')}
          ${iconRow('🛒','Em compra',partsCompra.length,'','parts:partsCompra')}
          ${iconRow('🚚','Aguardando entrega',partsEntrega.length,'','parts:partsEntrega')}
          ${iconRow('⚠','Atrasados',partsAtrasadas.length,'warn','parts:partsAtrasadas')}
          ${iconRow('✓','Recebidos hoje',partsRecebidasHoje.length,'ok','parts:partsRecebidasHoje')}
        </section>
        <section class="vx-c-list-card vx-c-list-exception"><div class="vx-c-title"><h3>⚠ Gestão por Exceção</h3></div>
          ${iconRow('⚠','OS paradas há mais de 7 dias',overdueRepair.length,'warn','overdueRepair')}
          ${iconRow('⏳','Orçamentos sem resposta há mais de 3 dias',overdueApproval.length,'warn','overdueApproval')}
          ${iconRow('📦','Peças atrasadas',partsAtrasadas.length,'warn','parts:partsAtrasadas')}
          ${iconRow('📥','Aparelhos prontos há mais de 3 dias',readyOverdue3.length,'warn','readyOverdue3')}
          ${iconRow('👤','Clientes com mais de 1 OS aberta',repeatClients,'','repeatClientOrders')}
        </section>
      </div>

      <div class="vx-c-grid-2">
        <section class="vx-c-feed-card"><div class="vx-c-title"><h3>◉ Feed em Tempo Real</h3><a href="#" id="vxFeedAll">Ver tudo</a></div>
          ${feed.length?feed.map(h=>`<div class="vx-c-feed-row"><span class="vx-c-feed-dot"></span><div><b>${new Date(h.changed_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</b><span>${E(feedText(h))}</span></div></div>`).join(''):'<p class="vx-c-empty">Nenhuma movimentação recente.</p>'}
        </section>
        <section class="vx-c-prod-table-card"><div class="vx-c-title"><h3>★ Produtividade</h3></div>
          <p class="vx-c-prod-total">Total recebido nas OS: <b>${M(totalRecebidoOS)}</b></p>
          <div class="vx-c-tw"><table class="vx-c-prod-table"><thead><tr><th>Técnico</th><th>OS</th><th>Valor Recebido</th><th>Prontos</th><th>Aproveitamento</th></tr></thead>
          <tbody>${prodRows.length?prodRows.map(r=>`<tr><td>${E(r.tech.full_name)}</td><td><button type="button" class="vx-c-prod-cell" data-drill="prodOs_${E(r.tech.id)}" data-title="OS de ${E(r.tech.full_name)}">${r.os}</button></td><td>${M(r.valor)}</td><td><button type="button" class="vx-c-prod-cell" data-drill="prodProntos_${E(r.tech.id)}" data-title="Prontos de ${E(r.tech.full_name)}" ${r.prontos?'':'disabled'}>${r.prontos}</button></td><td>${r.aproveitamento}%</td></tr>`).join(''):'<tr><td colspan="5" class="vx-c-empty">Nenhuma OS atribuída ainda.</td></tr>'}</tbody></table></div>
        </section>
      </div>

      <div class="vx-c-grid-2">
        <section class="vx-c-goals-card"><div class="vx-c-title"><h3>Metas e Bonificação</h3></div><div class="vx-c-goals-empty"><span class="vx-c-goals-icon">◷</span><p>Não configurado. Indicadores de meta e bônus só serão exibidos quando houver regra persistida e auditável.</p></div></section>
        <section class="vx-c-fin-card"><div class="vx-c-title"><h3>$ Resumo Financeiro</h3><small>somente pagamentos registrados</small></div>
          <div class="vx-c-fin-grid">
            <div><span>Faturamento realizado (Mês)</span><b>${M(receivedMonth)}</b></div>
            <div><span>A receber</span><b>${M(aReceber)}</b></div>
            <div><span>Média diária</span><b>${M(mediaDiaria)}</b></div>
            <div><span>Ticket médio recebido</span><b>${M(ticketMedioRecebido)}</b></div>
            <div><span>Oportunidade de faturamento</span><b>${M(oportunidadeFaturamento)}</b></div>
            <div><span>Meta do mês</span><b class="vx-c-fin-empty">Não configurado</b></div>
          </div>
        </section>
      </div>

      ${agendaSectionHtml(agendaSelectedTechId)}

      ${discovery()}
    </div>`;
    app.querySelectorAll('[data-drill]').forEach(el=>el.onclick=(ev)=>{
      ev.preventDefault();
      const k=el.dataset.drill;
      const title=el.dataset.title||el.textContent.trim()||'Detalhamento';
      if(k.startsWith('parts:'))return partsModal(title,partsDrills[k.slice(6)]||[]);
      if(k.startsWith('tasks:'))return tasksModal(title,tasksDrills[k.slice(6)]||[]);
      if(k.startsWith('cases:')||k==='casesAbertos')return casesModal(title,caseDrills[k==='casesAbertos'?'casesAbertos':k.slice(6)]||[]);
      if(drills[k])modal(title,drills[k]);
    });
    document.getElementById('vxFeedAll').onclick=(ev)=>{ev.preventDefault();feedModal('Feed em Tempo Real',history,feedText)};
    wireAgendaCard();
  };

  window.VoxAssistRuntime=window.VoxAssistRuntime||{};
  window.VoxAssistRuntime.dashboard={name:'Dashboard Canônico V1',version:'2.0.0',owner:'runtime/dashboard-canonical-v1.js'};
})();
