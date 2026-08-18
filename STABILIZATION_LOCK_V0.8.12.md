# VoxAssist Web V0.8.12 — Stabilization Lock

A partir desta revisão, novas funções e evoluções ficam congeladas até a Etapa 1 — Atendimento / Ordem de Serviço — estar estável e homologada.

## Ordem obrigatória de correção
1. Acesso/login sem regressão.
2. Menu lateral funcionando.
3. Sistema de abas: + cria guia, navegação troca conteúdo da guia ativa, X fecha somente a própria guia.
4. Atendimento abrindo corretamente.
5. Pesquisa de OS básica funcionando sem travar a interface.
6. Ordem de Serviço fiel ao layout aprovado do desktop.
7. Abas internas da OS funcionando: O.S., Equipamento, Cliente, Orçamento, Fotos/Anexos, Financeiro e Histórico.
8. Botões principais da OS funcionando: situação, voltar, caso de atenção, solicitar peça, gerar parecer, gerar PDF, imprimir, F11, salvar parecer, salvar F11 e salvar/avançar.
9. Dados persistidos no Supabase sem regressão.
10. Somente após homologação destes itens liberar novas evoluções.

## Regra técnica
- Não criar novos arquivos `*-patch.js` ou `*-urgent.js` para corrigir a OS.
- A OS deve ter uma única fonte de layout/behavior: `os-detail-v0812.js` + `os-detail-v0812.css`.
- Toda correção futura da OS deve alterar diretamente esses dois arquivos.
- Regressões têm prioridade sobre novas funcionalidades.

## Status atual
- Nova evolução: BLOQUEADA.
- Etapa 1 Atendimento/OS: RETESTE URGENTE.
- Layout Desktop aprovado: referência obrigatória para a Web.
