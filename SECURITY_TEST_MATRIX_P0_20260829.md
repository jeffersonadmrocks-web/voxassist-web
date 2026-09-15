# Matriz de Homologação P0 — Dashboard e Segurança

Use esta matriz antes de qualquer merge para `main`.

| ID | Área | Cenário | Resultado esperado | Estado |
|---|---|---|---|---|
| D01 | Dashboard | Abrir como GESTOR | Dashboard Core V1 carrega sem erro e sem renderer duplicado | PENDENTE NAVEGADOR |
| D02 | Dashboard | Clicar OS Ativas | Modal lista exatamente a base filtrada | PENDENTE NAVEGADOR |
| D03 | Radar | Análise >3 dias | Frase mostra contagem real e abre as mesmas OS | PENDENTE NAVEGADOR |
| D04 | Radar | Aprovação >48h | Frase mostra contagem/valor real e abre as mesmas OS | PENDENTE NAVEGADOR |
| D05 | Radar | Pronto >7 dias | Frase mostra contagem/valor real e abre as mesmas OS | PENDENTE NAVEGADOR |
| D06 | Filtros | Loja/Grupo/Técnico/Atendente/Situação/Período | Todos os KPIs respeitam o filtro aplicável | PENDENTE NAVEGADOR |
| D07 | Abas | Abrir OS pelo Dashboard | OS abre em aba interna sem destruir o Dashboard | PENDENTE NAVEGADOR |
| D08 | Metas | Sem configuração oficial | Exibe Não configurado; nenhum número fictício | IMPLEMENTADO |
| D09 | Descoberta | Abrir Informação curta/Saber mais | Conteúdo local rotativo; zero acesso a dados operacionais | IMPLEMENTADO |
| S01 | RPC | chamada anônima admin_company_users | EXECUTE negado | PASSOU SQL |
| S02 | RPC | chamada anônima admin_update_user_access | EXECUTE negado | PASSOU SQL |
| S03 | RPC | chamada anônima switch_store | EXECUTE negado | PASSOU SQL |
| S04 | Trigger RPC | chamada direta por authenticated | EXECUTE negado | PASSOU SQL |
| S05 | Usuários | Gestor empresa A tenta alterar usuário empresa B | servidor deve negar | PENDENTE TESTE NEGATIVO |
| S06 | Loja | usuário tenta switch_store sem vínculo ativo | servidor deve negar | IMPLEMENTADO / PENDENTE TESTE |
| S07 | Reset | Gestor sem admin:master_reset | servidor deve negar | IMPLEMENTADO / PENDENTE TESTE |
| S08 | Auth | senha vazada conhecida | cadastro/troca deve ser bloqueado | BLOQUEADO: CONFIG AUTH |
| R01 | Regressão | Agenda VoxAssist | agenda abre e persiste movimentações | PENDENTE NAVEGADOR |
| R02 | Regressão | Agenda Electrolux | compromissos continuam visíveis sem mesclar OS | PENDENTE NAVEGADOR |
| R03 | Regressão | NPS Electrolux | fluxo permanece funcional | PENDENTE NAVEGADOR |
| R04 | Regressão | Minha Jornada | tarefas/alertas continuam funcionais | PENDENTE NAVEGADOR |
| R05 | Regressão | OS | abrir/salvar/avançar/alterar situação | PENDENTE NAVEGADOR |

## Regra de liberação
Nenhum item P0 crítico pode permanecer em FALHOU ou BLOQUEADO para liberar a branch. Itens que exigem navegador devem ser executados em preview antes do merge.