/* VoxAssist Web V0.9.08 — hub de Configurações (9 grupos, estilo Atendimento).
   Achado do usuário em 2026-09-08: Configurações deve virar uma tela de
   entrada com cards clicáveis, no mesmo padrão visual dos outros hubs
   de módulo (Atendimento/Oficina/Atividades -- home()/module-action-grid,
   all-menus-layout.css, já existente e reaproveitado aqui, nenhuma classe
   nova). Os 9 grupos e a descrição de cada foram definidos pelo usuário,
   verbatim (tabela oficial, 2026-09-08):
     01 Empresa & Usuários / 02 Ordens de Serviço / 03 Cadastros & Catálogos /
     04 Agenda & Atendimento / 05 Estoque & Peças / 06 Financeiro /
     07 Comunicação & Automação / 08 Integrações / 09 Sistema & Segurança.
   "Conteúdo de cada grupo definido depois" -- por ora, os grupos que já
   têm alguma coisa de verdade construída nesta sessão (Empresas/Usuários,
   Grupos de Atendimento, Lojas, Agenda/feriados, Integrações
   WhatsApp/Electrolux, Reset Master) apontam pra tela única já existente
   e estabilizada (view 'usuarios') -- vários grupos hoje levam ao MESMO
   lugar de propósito, até o conteúdo de cada um ser efetivamente
   separado. Os que ainda não têm nada construído (Ordens de Serviço,
   Estoque & Peças, Financeiro) mostram o mesmo painel honesto "ESTRUTURA
   DISPONÍVEL" já usado em outros hubs (window.vxStructurePanel,
   status-badge-v0901.js) -- nunca um botão morto.
   Roteamento: window.__vxConfigSection (em memória, não é uma rota de
   verdade) decide o que a view 'usuarios' mostra -- null/undefined =
   hub; 'admin' = tela única de sempre; 'placeholder:xxx' = painel de
   estrutura disponível. Ver company-only-mode-v0813.js (onde essa
   decisão é lida) e o botão "← Voltar" de renderAdmin() (agora volta
   pro hub, não pro dashboard). */
(function(){
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';

  const CARDS=[
    ['♟','EMPRESA & USUÁRIOS','Empresas, unidades/lojas, usuários, equipes, técnicos, perfis, permissões e vínculo usuário × loja.','blue','admin'],
    ['▥','ORDENS DE SERVIÇO','Fluxos, situações, tipos de atendimento, numeração, campos obrigatórios, termos e regras.','purple','placeholder:os'],
    ['▤','CADASTROS & CATÁLOGOS','Marcas, produtos, grupos, defeitos, acessórios, serviços e listas auxiliares.','teal','admin'],
    ['◷','AGENDA & ATENDIMENTO','Técnicos externos, períodos, regiões, capacidade, regras e alertas de agendamento.','orange','admin'],
    ['▦','ESTOQUE & PEÇAS','Depósitos, movimentações, estoque técnico, devoluções e parâmetros de peças.','cyan','placeholder:estoque'],
    ['$','FINANCEIRO','Formas de pagamento, categorias, caixas, recebimentos e parâmetros financeiros.','green','placeholder:financeiro'],
    ['✉','COMUNICAÇÃO & AUTOMAÇÃO','WhatsApp, Chat, mensagens, notificações, horários, NPS e automações.','brown','admin'],
    ['⌁','INTEGRAÇÕES','Electrolux, Whirlpool, GestãoClick, Digisac, Pulse IA, APIs e webhooks.','red','admin'],
    ['⚙','SISTEMA & SEGURANÇA','Auditoria, logs, sessões, segurança, importação/exportação e parâmetros gerais.','gray','admin'],
  ];

  const PLACEHOLDER_TEXT={
    os:['Ordens de Serviço','Fluxos, situações, tipos de atendimento, numeração, campos obrigatórios, termos e regras da OS ainda não têm tela própria de configuração -- hoje são fixos no código. Grupo criado, conteúdo em definição.'],
    estoque:['Estoque & Peças','Depósitos, movimentações, estoque técnico, devoluções e parâmetros de peças ainda não têm tela própria de configuração. Grupo criado, conteúdo em definição.'],
    financeiro:['Financeiro','Formas de pagamento, categorias, caixas, recebimentos e parâmetros financeiros ainda não têm tela própria de configuração -- hoje as formas de pagamento são fixas no código (guia Finalizar OS, dentro da OS). Grupo criado, conteúdo em definição.'],
  };

  const card=([icon,title,desc,color,target])=>`<button type="button" class="module-action-card ${color}" data-config-target="${target}"><span class="icon">${icon}</span><span><strong>${title}</strong><small>${desc}</small></span></button>`;

  window.renderConfigHub=function(){
    const app=document.querySelector('#app');if(!app)return;
    if(!isGestor()){app.innerHTML='<div class="card error-card"><h3>Acesso restrito</h3><p>Configurações disponíveis somente para gestores.</p></div>';return;}
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>Configurações</h2><p>9 grupos principais -- conteúdo de cada um em definição/evolução contínua</p></div></div><div class="module-action-grid">${CARDS.map(card).join('')}</div></div>`;
    app.querySelectorAll('[data-config-target]').forEach(b=>b.onclick=()=>{
      window.__vxConfigSection=b.dataset.configTarget;
      window.render('usuarios');
    });
  };

  window.renderConfigPlaceholder=function(key){
    const app=document.querySelector('#app');if(!app)return;
    const [title,detail]=PLACEHOLDER_TEXT[key]||['Configurações',''];
    const badge=typeof window.vxStructurePanel==='function'?window.vxStructurePanel(title,detail):`<div><strong>${title}</strong><p>${detail}</p></div>`;
    app.innerHTML=`<div class="module-home"><div class="module-home-head"><div><h2>${title}</h2><p>Estrutura criada -- conteúdo em definição.</p></div><div class="module-head-actions"><button class="secondary" id="vxConfigHubBack">← Voltar</button></div></div>${badge}</div>`;
    document.getElementById('vxConfigHubBack').onclick=()=>{window.__vxConfigSection=null;window.render('usuarios');};
  };
})();
