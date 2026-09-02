/* VoxAssist Web V0.8.12 — hubs visuais de todos os módulos */
(function(){
  const baseRender=window.render;
  const colorMap={blue:'#1671d8',orange:'#f07d00',purple:'#7650d6',green:'#13904b',cyan:'#2389b9',red:'#cf3542',gray:'#60758d',brown:'#b7681d',teal:'#148c7a'};
  const card=(icon,title,sub,target,color='blue')=>`<button class="module-action-card ${color}" data-target="${target}"><span class="icon">${icon}</span><span><strong>${title}</strong><small>${sub}</small></span></button>`;
  // Achado do usuário em 2026-09-02: os cards de resumo (topo de cada
  // hub -- Atendimento/Oficina/Atividades/Financeiro/Loja) eram <div>
  // estáticos, sem data-target nem handler nenhum -- mostravam o
  // número real, mas clicar não fazia nada. Corrigido só onde existe
  // lista real por trás (rows é um array de verdade -- OS ou tarefas
  // já carregadas em state): vira botão, abre summaryModal com os
  // registros reais. Onde não há lista real (placeholder tipo '—'),
  // continua um <div> não-interativo -- nunca finge um drill-down que
  // não existe.
  let summaryDrills={};
  let summarySeq=0;
  const summary=(label,rows,color='blue',type='os')=>{
    if(!Array.isArray(rows))return `<div class="module-summary-card" style="--accent:${colorMap[color]||color}"><span>${label}</span><b>${rows}</b></div>`;
    const key='sum'+(summarySeq++);
    summaryDrills[key]={title:label,rows,type};
    return `<button type="button" class="module-summary-card module-summary-card-btn" data-summary="${key}" style="--accent:${colorMap[color]||color}" ${rows.length?'':'disabled'}><span>${label}</span><b>${rows.length}</b></button>`;
  };
  function summaryModal(title,rows,type){
    document.querySelector('#vxSummaryModal')?.remove();
    const bg=document.createElement('div');bg.id='vxSummaryModal';bg.className='vx-modal-bg';
    const esc=v=>typeof window.esc==='function'?window.esc(v??''):String(v??'');
    const body=type==='task'
      ?(rows.length?`<table><thead><tr><th>Tarefa</th><th>Situação</th><th>Prazo</th></tr></thead><tbody>${rows.map(t=>`<tr><td><b>${esc(t.title||t.description||'—')}</b></td><td>${esc(t.status||'—')}</td><td>${t.due_at?new Date(t.due_at).toLocaleDateString('pt-BR'):'—'}</td></tr>`).join('')}</tbody></table>`:'<p>Nenhum registro encontrado.</p>')
      :type==='stock'
      ?(rows.length?`<table><thead><tr><th>Peça</th><th>Código</th><th>Qtd</th></tr></thead><tbody>${rows.map(s=>`<tr><td><b>${esc(s.description||'—')}</b></td><td>${esc(s.code||'—')}</td><td>${esc(s.quantity??'—')}</td></tr>`).join('')}</tbody></table>`:'<p>Nenhum registro encontrado.</p>')
      :(rows.length?`<table><thead><tr><th>O.S.</th><th>Cliente</th><th>Equipamento</th><th>Situação</th></tr></thead><tbody>${rows.map(o=>`<tr data-os="${esc(o.id)}" style="cursor:pointer"><td><b>${esc(o.os_number||'—')}</b></td><td>${esc(o.clients?.name||'—')}</td><td>${esc([o.equipments?.product_type,o.equipments?.brand,o.equipments?.model].filter(Boolean).join(' • ')||'—')}</td><td>${esc(o.status||'—')}</td></tr>`).join('')}</tbody></table>`:'<p>Nenhum registro encontrado.</p>');
    bg.innerHTML=`<div class="vx-modal"><h3>${esc(title)} <small style="font-weight:400;color:#64748b">(${rows.length} registro${rows.length===1?'':'s'})</small></h3><div style="max-height:60vh;overflow:auto">${body}</div><div class="vx-modal-actions"><button type="button" data-close>Fechar</button></div></div>`;
    document.body.appendChild(bg);
    bg.querySelector('[data-close]').onclick=()=>bg.remove();
    bg.onclick=e=>{if(e.target===bg)bg.remove()};
    if(type!=='task')bg.querySelectorAll('[data-os]').forEach(tr=>tr.onclick=()=>{const id=tr.dataset.os;bg.remove();window.render('os:'+id)});
  }
  function bindSummaries(){document.querySelectorAll('[data-summary]').forEach(b=>b.onclick=()=>{const d=summaryDrills[b.dataset.summary];if(d)summaryModal(d.title,d.rows,d.type)});}
  // Achado real (Consolidação Geral, 2026-09-01): 9 cards apontavam pra
  // um alvo sem tela nenhuma e caíam só no toast genérico -- botão que
  // "funciona" (não trava, não é morto) mas nunca abre nada. A regra
  // "é proibido... criar botão morto" exige abrir uma tela de verdade,
  // mesmo que sem integração ainda -- então cada um ganha aqui uma
  // tela real "Estrutura disponível", nunca só um toast.
  const STRUCTURE_ONLY_TARGETS={
    'pareceres':['Pareceres Técnicos','A geração de pareceres/laudos por fabricante e seguradora ainda não tem tela própria. Hoje o laudo técnico é registrado dentro da própria O.S., na aba Orçamento/Análise Técnica.'],
    'anexos':['Fotos / Anexos (consulta consolidada)','A consulta de fotos e anexos por O.S. já existe dentro de cada Ordem de Serviço (aba Fotos/Anexos). Uma visão consolidada entre várias O.S. ainda não foi construída.'],
    'docs-tecnicos':['Documentação Técnica','A tabela de manuais/boletins por marca e modelo já existe e é usada dentro da O.S. (aba Equipamento). Uma tela de gestão/upload consolidada ainda não existe.'],
    'relatorios-fin':['Exportação de relatórios financeiros','Filtros e exportação (PDF/Excel) de relatórios financeiros ainda não foram implementados. O financeiro por O.S. já existe e pode ser consultado normalmente.'],
    'relatorios-export':['Exportação PDF / Excel','Exportação de relatórios gerenciais ainda não foi implementada nesta rodada.'],
    'backup':['Backup / Restauração','Rotina de backup/restauração administrada pelo Supabase (banco gerenciado) -- uma tela própria de acionamento manual ainda não existe.'],
    'integracoes':['Integrações','Painel de integrações (WhatsApp, GestãoClick, site) ainda não existe como tela única. A integração de WhatsApp já funciona de verdade em Chat VoxAssist.'],
    'loja-vendas':['Venda de Aparelho','Registro comercial de venda de equipamento (fora do fluxo de conserto) ainda não tem tela própria.'],
    'whatsapp':['Lembretes / WhatsApp','Fila de lembretes automáticos ainda não existe. O envio real de WhatsApp já funciona em Chat VoxAssist, por conversa.'],
    'financeiro-caixa':['Caixa','Um caixa (abertura/fechamento por período, lançamentos avulsos não vinculados a uma O.S.) ainda não existe. O financeiro hoje só existe vinculado a uma O.S. específica (aba Financeiro, dentro da O.S.).'],
    'financeiro-parcelas':['Contas / Parcelas','Acompanhamento de parcelamento e pagamentos futuros ainda não tem tela própria. Pagamentos hoje são registrados por O.S., sem parcelamento estruturado.'],
    'financeiro-relatorio-dia':['Relatório do dia (por forma de pagamento)','Resumo por dinheiro/cartão/Pix ainda não existe. O resumo financeiro real (recebido hoje/no mês) está no Dashboard.'],
    'auditoria-consolidada':['Auditoria','Um log consolidado de ações de usuários ainda não existe como tela única. Auditorias reais já existem por funcionalidade (histórico de status da O.S., histórico de casos NPS, histórico de compromissos).'],
  };
  function bindTargets(){document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>openTarget(b.dataset.target));}
  function renderStructureOnly(target,title,detail){
    const app=document.querySelector('#app');if(!app)return;
    const badge=typeof window.vxStructurePanel==='function'?window.vxStructurePanel(title,detail):`<div><strong>${title}</strong><p>${detail}</p></div>`;
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>${title}</h2><p>Estrutura disponível para avaliação visual — integração funcional em homologação.</p></div><div class="module-head-actions"><button class="secondary" id="vxStructureBack">← Voltar</button></div></div>${badge}</div>`;
    document.getElementById('vxStructureBack').onclick=()=>window.render(state.view||'dashboard');
  }
  async function openTarget(t){
    if(t==='nova-os') return baseRender('nova-os');
    if(t==='pesquisa-os') return renderOperational('os','Pesquisa O.S.');
    if(t==='clientes') return renderOperational('clientes','Clientes');
    if(t==='oficina-operacional') return renderOperational('oficina','Fila Técnica');
    if(t==='agenda-operacional') return renderOperational('agenda','Atividades');
    if(t==='nps-electrolux') return window.render('nps-electrolux');
    if(t==='estoque-operacional') return renderOperational('estoque','Estoque / Peças');
    if(t==='financeiro-operacional') return renderOperational('financeiro','Financeiro');
    if(t==='testes-operacional') return renderOperational('testes','Testes de Funções');
    if(t==='usuarios-operacional') return renderOperational('usuarios','Usuários / Segurança');
    if(t==='dashboard') return baseRender('dashboard');
    if(STRUCTURE_ONLY_TARGETS[t])return renderStructureOnly(t,...STRUCTURE_ONLY_TARGETS[t]);
    toast('Função registrada para evolução/homologação da V0.8.12.');
  }
  async function renderOperational(view,label){await baseRender(view);state.view='op:'+view;renderTabs(label);const title=document.querySelector('#title');if(title)title.textContent=label;}
  function lowerTabs(){return `<div class="module-lower-tabs"><button class="active">Oportunidades do Dia</button><button>Casos de Atenção</button><button data-target="agenda-operacional">Minhas Tarefas</button><button data-target="agenda-operacional">Agenda / Compromissos</button><button data-target="estoque-operacional">Pedidos de Peças</button><button>Produtividade / Bonificação</button></div><div class="module-lower-content">Ambiente de homologação — dados fictícios.</div>`}
  // summaryDrills NÃO é resetado aqui -- os argumentos (metrics, com os
  // summary(...) que povoam summaryDrills) já foram todos avaliados
  // ANTES do corpo desta função rodar (é assim que chamada de função
  // funciona em JS). Resetar aqui apagaria as entradas na hora que
  // acabaram de ser criadas, antes do clique existir pra usá-las --
  // achado real ao testar esta correção. Só acumula entre telas (chave
  // sequencial, nunca colide) -- efeito colateral inofensivo.
  function home(title,subtitle,actions,metrics='',buttons=''){const app=document.querySelector('#app');if(!app)return;app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="module-head-actions">${buttons}</div></div>${metrics?`<div class="module-summary">${metrics}</div>`:''}<div class="module-action-grid">${actions}</div>${lowerTabs()}</div>`;bindTargets();bindSummaries();}
  function ordersByStatus(s){return state.orders.filter(o=>o.status===s)}
  function countStatus(s){return ordersByStatus(s).length}

  function atendimento(){home('Atendimento','Balcão • Clientes • Ordens de Serviço',
    card('+','ABRIR NOVA O.S.','Inicie um atendimento sem sair da tela da OS.','nova-os','blue')+
    card('⌕','PESQUISAR O.S.','Localize ordens por número, cliente ou equipamento.','pesquisa-os','purple')+
    card('◉','CLIENTES','Cadastros, histórico e dados de contato.','clientes','purple')+
    card('▥','SITUAÇÃO DOS APARELHOS','Acompanhe rapidamente cada etapa das OS.','pesquisa-os','orange')+
    card('$','ORÇAMENTOS / APROVAÇÕES','Acompanhe orçamentos e retornos de clientes.','financeiro-operacional','green')+
    card('↗','ENTREGA / SAÍDA','Finalize serviços e documentos de saída.','pesquisa-os','cyan')+
    card('▤','RECIBOS','Emissão e consulta de recibos.','financeiro-operacional','gray')+
    card('▦','VENDA DE PEÇAS','Venda rápida vinculada ao atendimento.','estoque-operacional','teal')+
    card('▣','VENDA DE APARELHO','Registro de venda de equipamentos.','loja-vendas','brown'),
    summary('AGUARDANDO ANÁLISE',ordersByStatus('AGUARDANDO ANALISE'),'orange')+
    summary('AGUARDANDO APROVAÇÃO',ordersByStatus('AGUARDANDO APROVACAO'),'purple')+
    summary('EM CONSERTO',ordersByStatus('AGUARDANDO CONSERTO'),'blue')+
    summary('PRONTA',ordersByStatus('PRONTO PARA ENTREGA'),'green')
  )}
  function oficina(){home('Oficina','Fila técnica • Diagnóstico • Documentação • Peças',
    card('⚒','FILA TÉCNICA','Visualize aparelhos aguardando análise, conserto e finalização.','oficina-operacional','orange')+
    card('✓','ANÁLISE / DIAGNÓSTICO','Registre defeito constatado, serviço e parecer técnico.','oficina-operacional','blue')+
    card('▤','DOCUMENTAÇÃO TÉCNICA','Manuais, boletins, firmwares e materiais por marca/modelo.','docs-tecnicos','purple')+
    card('▦','PEÇAS DA O.S.','Inclua peças manuais, consulte saldo e vincule ao reparo.','estoque-operacional','green')+
    card('▣','ESTOQUE DO TÉCNICO','Itens em poder do técnico sem ruído fiscal.','estoque-operacional','cyan')+
    card('↻','REINGRESSOS / RETORNOS','Acompanhe retornos e reincidências de equipamento.','pesquisa-os','red')+
    card('⌑','PARECERES TÉCNICOS','Gere pareceres e documentos de fabricante/seguradora.','pareceres','gray')+
    card('▧','FOTOS / ANEXOS','Consulte fotos obrigatórias, PDFs e documentos da OS.','anexos','teal')+
    card('☑','CHECKLISTS','Acompanhe checklists técnicos e pendências de homologação.','testes-operacional','brown'),
    summary('AGUARDANDO ANÁLISE',ordersByStatus('AGUARDANDO ANALISE'),'orange')+summary('EM CONSERTO',ordersByStatus('AGUARDANDO CONSERTO'),'blue')+summary('PRONTO',ordersByStatus('PRONTO PARA ENTREGA'),'green')+summary('TAREFAS',state.tasks,'purple','task')
  )}
  function atividades(){home('Atividades','Tarefas • Agenda • Casos • Compromissos',
    card('☑','MINHAS TAREFAS','Pendências atribuídas ao usuário com prioridade e prazo.','agenda-operacional','blue')+
    card('◷','AGENDA / COMPROMISSOS','Atendimentos externos, retiradas e compromissos.','agenda-operacional','purple')+
    // Achado do usuário em 2026-09-02: havia um card "NPS ELECTROLUX"
    // aqui -- removido. Este hub atividades() é código morto (nunca é
    // renderizado de verdade, ver comentário em
    // electrolux-nps-v0826.js), e o NPS Electrolux agora só tem um
    // ponto de entrada: o card dentro do módulo Electrolux
    // (electrolux-reports-v0813.js).
    // Achado do usuário em 2026-09-02: este card apontava pra
    // 'agenda-operacional' (mesmo alvo genérico de Minhas Tarefas) --
    // não é um caso de atenção filtrado nenhum, é só a tela de agenda.
    // Clicar num item ali abria a OS vinculada a QUALQUER tarefa da
    // lista, sem relação com "caso de atenção" nenhum -- daí abrir uma
    // OS aparentemente aleatória. Corrigido pra apontar pro Dashboard
    // real ('dashboard'), onde o card "Casos de Atenção" já existe com
    // dados reais (dashboard_cases) e drill-down correto (mesmo padrão
    // já usado por "Oportunidades do Dia" logo abaixo).
    card('!','CASOS DE ATENÇÃO','Pendências direcionadas e situações que exigem acompanhamento.','dashboard','red')+
    card('↗','ATENDIMENTO EXTERNO','Agenda de técnicos de campo e observações de visita.','agenda-operacional','orange')+
    card('⌁','RETIRADAS / ENTREGAS','Acompanhe clientes previstos para retirada ou entrega.','pesquisa-os','green')+
    card('✉','LEMBRETES / WHATSAPP','Fila de lembretes e comunicações previstas.','whatsapp','teal')+
    card('▣','PEDIDOS DE PEÇAS','Pendências de compra, previsão e chegada de peças.','estoque-operacional','brown')+
    card('★','OPORTUNIDADES DO DIA','Ações comerciais e operacionais do dia.','dashboard','cyan')+
    card('▥','HISTÓRICO DE ATIVIDADES','Consulta de tarefas concluídas e movimentações.','agenda-operacional','gray'),
    summary('TAREFAS',state.tasks,'blue','task')+summary('PENDENTES',state.tasks.filter(t=>t.status==='PENDENTE'),'orange','task')+summary('EM ANDAMENTO',state.tasks.filter(t=>t.status==='EM ANDAMENTO'),'purple','task')+summary('CONCLUÍDAS',state.tasks.filter(t=>t.status==='CONCLUIDA'),'green','task')
  )}
  function financeiro(){home('Financeiro','Caixa • Recebimentos • Orçamentos • Relatórios',
    card('$','CAIXA','Lançamentos, formas de pagamento e fechamento do período.','financeiro-caixa','green')+
    card('▤','RECEBIMENTOS','Pagamentos vinculados às OS e lançamentos avulsos.','financeiro-operacional','blue')+
    card('◷','CONTAS / PARCELAS','Acompanhe parcelamentos e pagamentos futuros.','financeiro-parcelas','purple')+
    card('✓','ORÇAMENTOS APROVADOS','Valores aprovados e situação financeira das OS.','financeiro-operacional','teal')+
    card('×','ORÇAMENTOS RECUSADOS','Histórico gerencial de recusas sem gerar caixa.','financeiro-operacional','orange')+
    card('▥','RELATÓRIO DO DIA','Resumo por dinheiro, cartão, Pix e demais formas.','financeiro-relatorio-dia','cyan')+
    card('▧','RECIBOS','Emissão e consulta de recibos.','financeiro-operacional','gray')+
    card('⇩','EXPORTAR PDF / EXCEL','Relatórios financeiros para conferência e gestão.','relatorios-fin','brown')+
    card('⚙','CONFIGURAÇÕES FINANCEIRAS','Meios de pagamento, grupos e permissões.','usuarios-operacional','red'),
    summary('OS ATIVAS',state.orders.filter(o=>o.status!=='FINALIZADA'),'blue')+summary('AGUARD. APROVAÇÃO',ordersByStatus('AGUARDANDO APROVACAO'),'purple')+summary('PRONTAS',ordersByStatus('PRONTO PARA ENTREGA'),'green')+summary('LANÇAMENTOS','—','orange')
  )}
  function loja(){home('Loja','Estoque • Peças • Vendas • Transferências',
    card('▦','ESTOQUE / PEÇAS','Consulta de itens, saldos, códigos e localizações.','estoque-operacional','green')+
    card('↘','ENTRADA DE ESTOQUE','Entrada manual, NF, XML, foto ou código da peça.','estoque-operacional','blue')+
    card('↗','SAÍDA DE ESTOQUE','Saída vinculada à OS, técnico ou venda.','estoque-operacional','orange')+
    card('♟','EM PODER DO TÉCNICO','Peças em estoque pulmão de cada técnico.','estoque-operacional','cyan')+
    card('↔','TRANSFERÊNCIAS','Movimentações entre Vitória e Serra.','estoque-operacional','purple')+
    card('!','PENDÊNCIA FISCAL GARANTIA','Peças utilizadas aguardando faturamento ao fabricante.','estoque-operacional','red')+
    card('▣','VENDA DE PEÇAS','Venda rápida e vínculo opcional à OS.','estoque-operacional','teal')+
    card('▤','VENDA DE APARELHO','Registro comercial de equipamentos.','loja-vendas','brown')+
    card('⌕','CONSULTA / HISTÓRICO','Rastreabilidade por item, técnico, OS e loja.','estoque-operacional','gray'),
    summary('ITENS CADASTRADOS',state.stock,'green','stock')+summary('OS AGUARD. PEÇA',state.orders.filter(o=>(o.status||'').includes('PECA')),'orange')+summary('TÉCNICOS','—','cyan')+summary('PEND. FISCAIS','—','red')
  )}
  function relatorios(){home('Relatórios','Operação • Financeiro • Produtividade • Auditoria',
    card('▥','RELATÓRIOS DE O.S.','Entradas, saídas, prontos, ativos e filtros combináveis.','pesquisa-os','blue')+
    card('$','FINANCEIRO','Caixa, recebimentos, formas de pagamento e grupos.','financeiro-operacional','green')+
    card('★','PRODUTIVIDADE','Indicadores por técnico, atendente, equipe e período.','dashboard','purple')+
    card('▦','ESTOQUE','Saldo, movimentações, técnico e pendências fiscais.','estoque-operacional','orange')+
    card('♟','CLIENTES / EQUIPAMENTOS','Histórico, reincidência, titularidade e Cliente 360.','clientes','cyan')+
    card('☑','TESTES / HOMOLOGAÇÃO','Cobertura por módulo, falhas, retestes e validações.','testes-operacional','teal')+
    card('⚑','CASOS / TAREFAS','Atividades, atrasos e casos de atenção.','agenda-operacional','red')+
    card('⇩','EXPORTAÇÃO PDF / EXCEL','Geração e exportação de relatórios gerenciais.','relatorios-export','brown')+
    card('◷','AUDITORIA','Ações de usuários, alterações e eventos do sistema.','usuarios-operacional','gray')
  )}
  function configuracoes(){home('Configurações','Usuários • Segurança • Sistema • Backup',
    card('♟','USUÁRIOS','Gestor, atendente, técnico e estoque.','usuarios-operacional','blue')+
    card('⚿','PERMISSÕES','Acesso por módulo, ação, loja, horário e perfil.','usuarios-operacional','purple')+
    card('◷','SEGURANÇA / AUDITORIA','Logs, inatividade, bloqueios e comportamento suspeito.','auditoria-consolidada','red')+
    card('▣','LOJAS','Configuração de Vitória, Serra e regras multi-loja.','usuarios-operacional','cyan')+
    card('⇩','BACKUP / RESTAURAÇÃO','Banco, anexos, configurações e agendamento.','backup','green')+
    card('↻','ATUALIZAÇÕES','Controle de versão e histórico de atualização.','testes-operacional','orange')+
    card('▤','CADASTROS MESTRES','Marcas, modelos, grupos, fornecedores e documentação.','usuarios-operacional','teal')+
    card('⌁','INTEGRAÇÕES','WhatsApp, GestãoClick, site e demais APIs futuras.','integracoes','brown')+
    card('☑','TESTES DE FUNÇÕES','Acompanhamento digital da homologação.','testes-operacional','gray')
  )}

  window.render=async function(view){
    if(view==='os'){state.view='os';addTab('os','Atendimento');renderTabs('Atendimento');document.querySelector('#title').textContent='Atendimento';document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='os'));atendimento();return;}
    if(view==='oficina'){state.view='oficina';addTab('oficina','Oficina');renderTabs('Oficina');document.querySelector('#title').textContent='Oficina';document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='oficina'));oficina();return;}
    if(view==='agenda'){state.view='agenda';addTab('agenda','Atividades');renderTabs('Atividades');document.querySelector('#title').textContent='Atividades';document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='agenda'));atividades();return;}
    if(view==='financeiro'){state.view='financeiro';addTab('financeiro','Financeiro');renderTabs('Financeiro');document.querySelector('#title').textContent='Financeiro';document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='financeiro'));financeiro();return;}
    if(view==='estoque'){state.view='estoque';addTab('estoque','Loja');renderTabs('Loja');document.querySelector('#title').textContent='Loja';document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='estoque'));loja();return;}
    if(view==='testes'){state.view='testes';addTab('testes','Relatórios');renderTabs('Relatórios');document.querySelector('#title').textContent='Relatórios';document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='testes'));relatorios();return;}
    if(view==='usuarios'){state.view='usuarios';addTab('usuarios','Configurações');renderTabs('Configurações');document.querySelector('#title').textContent='Configurações';document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view==='usuarios'));configuracoes();return;}
    return baseRender(view);
  };
})();
