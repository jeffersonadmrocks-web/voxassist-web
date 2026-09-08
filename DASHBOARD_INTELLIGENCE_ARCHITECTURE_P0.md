# Dashboard Intelligence — Arquitetura P0

## Princípio
O Dashboard não é um relatório. Ele é uma central de inteligência operacional que deve responder a quatro perguntas: o que está acontecendo, o que está errado, onde existe oportunidade e qual ação merece atenção agora.

## Camadas
1. **Dados autorizados** — consultas passam pelas permissões/RLS da sessão.
2. **Motor determinístico** — regras objetivas calculam filas, prazos, valores, carga, alertas e oportunidades.
3. **Dashboard Core** — apresenta KPIs, Radar de Gestão, filtros e drill-down rastreável.
4. **IA futura** — somente interpretação/recomendação, sem SQL arbitrário, sem service_role e sem bypass de RLS.
5. **Ação assistida futura** — qualquer alteração sensível exige autorização normal do usuário e confirmação humana.
6. **Auditoria** — perguntas, recomendações e ações futuras devem ser rastreáveis.

## Regras P0 atualmente implementadas
- análise acima de 3 dias;
- aprovação sem resposta acima de 48 horas;
- conserto acima de 4 dias;
- pronto para entrega acima de 7 dias;
- OS ativa sem técnico;
- OS urgente;
- pedido de peça com previsão vencida;
- concentração de carga técnica acima de 1,5x da média quando houver ao menos 3 OS no técnico líder.

As regras são deliberadamente simples nesta fase. Nenhuma deve ser apresentada como modelo preditivo ou IA.

## IA — Gate obrigatório
A IA permanece desabilitada para dados operacionais até que existam:
- RLS/RPC homologadas por perfil e empresa;
- minimização de dados enviados;
- política de campos proibidos/sensíveis;
- logs de auditoria;
- respostas com evidência/drill-down;
- separação entre leitura, recomendação e execução;
- confirmação humana para mudanças de OS, agenda, estoque, financeiro, usuários e permissões.

## Descoberta do Dia
É um conteúdo educativo local e independente do Radar. Não usa dados de clientes, OS ou usuários. Seu propósito é estimular repertório de gestão sem ser confundido com recomendação operacional baseada em dados.