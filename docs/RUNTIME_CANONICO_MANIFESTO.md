# VoxAssist — Manifesto do Runtime Canônico

Status: REGRA OBRIGATÓRIA DE ARQUITETURA

## Princípio
O VoxAssist é um único produto acabado. O histórico de ideias pertence ao Git; rascunhos e versões substituídas não pertencem ao runtime do navegador.

## Regra de fonte única
Cada responsabilidade deve possuir exatamente uma implementação ativa:
- Dashboard: 1 renderizador canônico.
- Navegação/abas: 1 controlador canônico.
- Ordem de Serviço: 1 fluxo canônico por responsabilidade.
- Agenda: 1 controlador canônico.
- Financeiro: 1 controlador canônico.
- Electrolux, NPS, Minha Jornada, Chat e integrações: módulos isolados, sem sobrescrever funções centrais.

## Dashboard Canônico V1 — ATIVO NA BRANCH DE HOMOLOGAÇÃO
- JS canônico: `runtime/dashboard-canonical-v1.js`.
- CSS canônico: `runtime/dashboard-canonical-v1.css`.
- O `index.html` desta branch deixou de carregar os antigos renderizadores e patches visuais do Dashboard.
- Os arquivos antigos permanecem no Git como histórico, mas não participam do runtime desta branch.
- A rota existente `final-routing-v0812.js` direciona a Visão Geral para a única `window.renderDashboard` ativa.

### Garantias do Dashboard V1
- sem `MutationObserver` para reescrever o Dashboard;
- sem percentuais de produtividade inventados;
- sem metas ou bônus fictícios;
- sem percentuais fictícios de meios de pagamento;
- consultas com timeout individual de 7 segundos;
- falha de uma fonte mostra aviso de dados parciais e não congela a tela inteira;
- drill-down para OS ativas, etapas, atrasos, urgências e OS sem técnico;
- resumo financeiro baseado em pagamentos registrados e valores das OS prontas;
- Descoberta do Dia local, rotativa e sem envio de dados operacionais.

## Proibido no runtime
- carregar duas versões do mesmo módulo;
- patches que redefinem funções globais de outro módulo;
- MutationObserver usado para reescrever continuamente um layout já renderizado;
- arquivos v0812/v0813/final/fix/master coexistindo para a mesma responsabilidade;
- dependência de um módulo auxiliar para login, shell, menu ou abertura de OS;
- números fictícios apresentados como indicadores reais.

## Histórico e rollback
Versões substituídas devem permanecer no histórico Git/tag, mas sair da árvore ativa ou, no mínimo, deixar de ser referenciadas pelo entrypoint. O rollback deve ser feito por commit/tag, não por scripts antigos mantidos carregados.

## Gate para remover um rascunho
1. Identificar a responsabilidade duplicada.
2. Eleger a implementação canônica aprovada.
3. Confirmar que o entrypoint referencia somente a canônica.
4. Testar login, menu, abas e módulo afetado no Preview.
5. Só então remover/arquivar o arquivo obsoleto da árvore ativa.

## Falha isolada
Dashboard, Radar, Descoberta do Dia, Pulse IA, Electrolux, NPS e demais módulos auxiliares devem falhar de forma isolada. Uma falha neles não pode impedir login, shell, navegação ou abertura de OS.

## Sequência da consolidação
P0: inventário de scripts carregados e funções globais duplicadas.
P1: Dashboard Canônico V1 — implementado na branch, aguardando homologação do Preview.
P2: shell/navegação/abas — próxima consolidação após o gate do Dashboard.
P3: OS e atendimento.
P4: Agenda/Oficina/Estoque/Peças.
P5: Financeiro/Relatórios.
P6: Electrolux/NPS/Minha Jornada/Chat/Pulse como módulos isolados.
P7: remoção final dos rascunhos e gate de regressão.

## Critério de pronto
O VoxAssist estará consolidado quando cada função tiver um único dono no código ativo, o entrypoint carregar apenas módulos canônicos e a remoção de qualquer módulo auxiliar não derrubar o núcleo do sistema.