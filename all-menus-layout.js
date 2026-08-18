/* VoxAssist Web V0.8.12 — hubs visuais de todos os módulos */
(function(){
  const baseRender=window.render;
  const colorMap={blue:'#1671d8',orange:'#f07d00',purple:'#7650d6',green:'#13904b',cyan:'#2389b9',red:'#cf3542',gray:'#60758d',brown:'#b7681d',teal:'#148c7a'};
  const card=(icon,title,sub,target,color='blue')=>`<button class="module-action-card ${color}" data-target="${target}"><span class="icon">${icon}</span><span><strong>${title}</strong><small>${sub}</small></span></button>`;
  const summary=(label,n,color='blue')=>`<div class="module-summary-card" style="--accent:${colorMap[color]||color}"><span>${label}</span><b>${n}</b></div>`;
  function bindTargets(){document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>openTarget(b.dataset.target));}
  async function openTarget(t){
    if(t==='nova-os') return baseRender('nova-os');
    if(t==='pesquisa-os') return renderOperational('os','Pesquisa O.S.');
    if(t==='clientes') return renderOperational('clientes','Clientes');
    if(t==='oficina-operacional') return renderOperational('oficina','Fila Técnica');
    if(t==='agenda-operacional') return renderOperational('agenda','Atividades');
    if(t==='estoque-operacional') return renderOperational('estoque','Estoque / Peças');
    if(t==='financeiro-operacional') return renderOperational('financeiro','Financeiro');
    if(t==='testes-operacional') return renderOperational('testes','Testes de Funções');
    if(t==='usuarios-operacional') return renderOperational('usuarios','Usuários / Segurança');
    if(t==='dashboard') return baseRender('dashboard');
    toast('Função registrada para evolução/homologação da V0.8.12.');
  }
  async function renderOperational(view,label){await baseRender(view);state.view='op:'+view;renderTabs(label);const title=document.querySelector('#title');if(title)title.textContent=label;}
  function lowerTabs(){return `<div class="module-lower-tabs"><button class="active">Oportunidades do Dia</button><button>Casos de Atenção</button><button data-target="agenda-operacional">Minhas Tarefas</button><button data-target="agenda-operacional">Agenda / Compromissos</button><button data-target="estoque-operacional">Pedidos de Peças</button><button>Produtividade / Bonificação</button></div><div class="module-lower-content">Ambiente de homologação — dados fictícios.</div>`}
  function home(title,subtitle,actions,metrics='',buttons=''){const app=document.querySelector('#app');if(!app)return;app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="module-head-actions">${buttons}</div></div>${metrics?`<div class="module-summary">${metrics}</div>`:''}<div class="module-action-grid">${actions}</div>${lowerTabs()}</div>`;bindTargets();}
  function countStatus(s){return state.orders.filter(o=>o.status===s).length}

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
    summary('AGUARDANDO ANÁLISE',countStatus('AGUARDANDO ANALISE'),'orange')+
    summary('AGUARDANDO APROVAÇÃO',countStatus('AGUARDANDO APROVACAO'),'purple')+
    summary('EM CONSERTO',countStatus('AGUARDANDO CONSERTO'),'blue')+
    summary('PRONTA',countStatus('PRONTO PARA ENTREGA'),'green')
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
    summary('AGUARDANDO ANÁLISE',countStatus('AGUARDANDO ANALISE'),'orange')+summary('EM CONSERTO',countStatus('AGUARDANDO CONSERTO'),'blue')+summary('PRONTO',countStatus('PRONTO PARA ENTREGA'),'green')+summary('TAREFAS',state.tasks.length,'purple')
  )}
  function atividades(){home('Atividades','Tarefas • Agenda • Casos • Compromissos',
    card('☑','MINHAS TAREFAS','Pendências atribuídas ao usuário com prioridade e prazo.','agenda-operacional','blue')+
    card('◷','AGENDA / COMPROMISSOS','Atendimentos externos, retiradas e compromissos.','agenda-operacional','purple')+
    card('!','CASOS DE ATENÇÃO','Pendências direcionadas e situações que exigem acompanhamento.','agenda-operacional','red')+
    card('↗','ATENDIMENTO EXTERNO','Agenda de técnicos de campo e observações de visita.','agenda-operacional','orange')+
    card('⌁','RETIRADAS / ENTREGAS','Acompanhe clientes previstos para retirada ou entrega.','pesquisa-os','green')+
    card('✉','LEMBRETES / WHATSAPP','Fila de lembretes e comunicações previstas.','whatsapp','teal')+
    card('▣','PEDIDOS DE PEÇAS','Pendências de compra, previsão e chegada de peças.','estoque-operacional','brown')+
    card('★','OPORTUNIDADES DO DIA','Ações comerciais e operacionais do dia.','dashboard','cyan')+
    card('▥','HISTÓRICO DE ATIVIDADES','Consulta de tarefas concluídas e movimentações.','agenda-operacional','gray'),
    summary('TAREFAS',state.tasks.length,'blue')+summary('PENDENTES',state.tasks.filter(t=>t.status==='PENDENTE').length,'orange')+summary('EM ANDAMENTO',state.tasks.filter(t=>t.status==='EM ANDAMENTO').length,'purple')+summary('CONCLUÍDAS',state.tasks.filter(t=>t.status==='CONCLUIDA').length,'green')
  )}
  function financeiro(){home('Financeiro','Caixa • Recebimentos • Orçamentos • Relatórios',
    card('$','CAIXA','Lançamentos, formas de pagamento e fechamento do período.','financeiro-operacional','green')+
    card('▤','RECEBIMENTOS','Pagamentos vinculados às OS e lançamentos avulsos.','financeiro-operacional','blue')+
    card('◷','CONTAS / PARCELAS','Acompanhe parcelamentos e pagamentos futuros.','financeiro-operacional','purple')+
    card('✓','ORÇAMENTOS APROVADOS','Valores aprovados e situação financeira das OS.','financeiro-operacional','teal')+
    card('×','ORÇAMENTOS RECUSADOS','Histórico gerencial de recusas sem gerar caixa.','financeiro-operacional','orange')+
    card('▥','RELATÓRIO DO DIA','Resumo por dinheiro, cartão, Pix e demais formas.','financeiro-operacional','cyan')+
    card('▧','RECIBOS','Emissão e consulta de recibos.','financeiro-operacional','gray')+
    card('⇩','EXPORTAR PDF / EXCEL','Relatórios financeiros para conferência e gestão.','relatorios-fin','brown')+
    card('⚙','CONFIGURAÇÕES FINANCEIRAS','Meios de pagamento, grupos e permissões.','usuarios-operacional','red'),
    summary('OS ATIVAS',state.orders.filter(o=>o.status!=='FINALIZADA').length,'blue')+summary('AGUARD. APROVAÇÃO',countStatus('AGUARDANDO APROVACAO'),'purple')+summary('PRONTAS',countStatus('PRONTO PARA ENTREGA'),'green')+summary('LANÇAMENTOS','—','orange')
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
    summary('ITENS CADASTRADOS',state.stock.length,'green')+summary('OS AGUARD. PEÇA',state.orders.filter(o=>(o.status||'').includes('PECA')).length,'orange')+summary('TÉCNICOS','—','cyan')+summary('PEND. FISCAIS','—','red')
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
    card('◷','SEGURANÇA / AUDITORIA','Logs, inatividade, bloqueios e comportamento suspeito.','usuarios-operacional','red')+
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
