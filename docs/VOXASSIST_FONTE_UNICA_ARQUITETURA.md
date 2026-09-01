# VoxAssist — Política de Fonte Única e Arquitetura Canônica

## Princípio central

O VoxAssist deve existir como um único produto coerente. Ideias, protótipos, hotfixes e versões intermediárias não podem permanecer simultaneamente ativas no runtime.

A analogia oficial é: **um único livro acabado, com capítulos modulares**.

Isso significa:

- uma única implementação ativa por função;
- versões aprovadas são checkpoints imutáveis;
- novas evoluções partem da versão aprovada, nunca de rascunhos antigos;
- versões antigas permanecem somente no histórico do Git/tags para auditoria e rollback;
- arquivos substituídos devem ser removidos do carregamento e, após homologação, removidos da árvore ativa quando não tiverem outra responsabilidade;
- nenhum patch antigo pode continuar executando MutationObserver, onclick, render ou outra lógica concorrente depois de substituído.

## Regras obrigatórias

1. **Um controlador por domínio**
   - Dashboard: 1 renderizador/controlador ativo.
   - Agenda: 1 controlador principal ativo.
   - Abas: 1 controlador ativo.
   - OS: 1 fluxo canônico por responsabilidade.
   - Financeiro, Estoque, NPS, Electrolux, Minha Jornada etc.: mesma regra.

2. **Aprovado = congelado**
   Uma versão visual/funcional aprovada recebe um checkpoint/tag. Ela não é sobrescrita silenciosamente. Evolução posterior cria uma nova versão explícita.

3. **Rascunhos não entram na história operacional**
   Provas de conceito, arquivos temporários, hotfixes e experimentos podem existir durante desenvolvimento, mas não devem permanecer no build ativo após a solução final ser homologada.

4. **Histórico não é runtime**
   O Git preserva tudo que foi feito. O navegador deve carregar somente o conjunto canônico atual.

5. **Sem dependência frágil de patch**
   Nenhuma função crítica deve depender de uma cadeia de patches em que a ausência de um arquivo intermediário faça o sistema inteiro travar.

6. **Falha isolada**
   Módulos auxiliares devem falhar de forma isolada. Um erro em Descoberta do Dia, Radar, NPS, Pulse IA ou Electrolux não pode impedir login, menu, abas ou OS de carregar.

7. **Manifesto de runtime**
   O projeto deve manter uma lista explícita dos módulos canônicos ativos e suas responsabilidades. Arquivos fora do manifesto não podem ser adicionados ao carregamento sem revisão.

8. **Teste anti-concorrência**
   O CI deve falhar se detectar mais de um controlador ativo para funções críticas, por exemplo múltiplas atribuições concorrentes de renderDashboard, roteamento de abas ou handlers globais equivalentes.

9. **Mudança pequena e reversível**
   Cada evolução deve ter commit próprio, preview, teste e rollback simples.

10. **Segurança e estabilidade antes de inteligência**
   IA, automações e recomendações só entram sobre dados, permissões e fluxos já estabilizados.

## Estratégia de consolidação

### Fase 1 — Inventário
Mapear arquivos carregados pelo index.html, responsabilidade, dependências e sobreposições.

### Fase 2 — Definir canônicos
Escolher a implementação aprovada/mais atual de cada domínio e registrar como fonte oficial.

### Fase 3 — Desativar concorrentes
Remover do index.html scripts substituídos. Não apagar tudo de uma vez; primeiro provar no Preview que o módulo canônico funciona sozinho.

### Fase 4 — Remover rascunhos da árvore ativa
Depois da homologação, excluir arquivos obsoletos do branch principal. O histórico continuará preservado no Git.

### Fase 5 — Manifesto + CI
Adicionar validações automáticas para impedir reintrodução futura de scripts concorrentes e dependências ausentes.

### Fase 6 — Tag de estabilidade
Cada marco homologado recebe tag/versionamento e relatório de teste.

## Regra de promoção

Uma versão só se torna canônica quando:

- o layout aprovado foi preservado;
- os fluxos principais funcionam;
- não há controlador concorrente;
- testes de Gestor/Atendente/Técnico passaram;
- isolamento multiempresa/RLS passou;
- não há dados fictícios apresentados como reais;
- rollback foi validado;
- módulos críticos continuam funcionando quando um módulo auxiliar falha.

## Objetivo final

Reduzir progressivamente a atual coleção de arquivos sobrepostos para um conjunto menor, organizado e canônico. O objetivo não é ter um único arquivo monolítico, e sim um único VoxAssist coerente: módulos claros, responsabilidades únicas, dependências explícitas e nenhuma lógica histórica concorrendo com a versão aprovada.
