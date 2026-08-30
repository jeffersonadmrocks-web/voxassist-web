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
P1: shell/navegação/abas.
P2: Dashboard e inteligência operacional.
P3: OS e atendimento.
P4: Agenda/Oficina/Estoque/Peças.
P5: Financeiro/Relatórios.
P6: Electrolux/NPS/Minha Jornada/Chat/Pulse como módulos isolados.
P7: remoção final dos rascunhos e gate de regressão.

## Critério de pronto
O VoxAssist estará consolidado quando cada função tiver um único dono no código ativo, o entrypoint carregar apenas módulos canônicos e a remoção de qualquer módulo auxiliar não derrubar o núcleo do sistema.