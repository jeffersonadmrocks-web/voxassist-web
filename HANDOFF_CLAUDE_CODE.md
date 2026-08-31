# VoxAssist Web — handoff para Claude Code

Repositório: https://github.com/jeffersonadmrocks-web/voxassist-web
Stack: HTML/CSS/JS puro (sem build), ~104 arquivos JS carregados via
`<script>` direto no `index.html`, backend Supabase.

## Já corrigido e commitado localmente (ver `FIXES_20260824.md` no zip entregue)

1. `order-type-v0812.js` — bug de sintaxe (string mal fechada) que
   quebrava o carregamento do arquivo inteiro. Corrigido e validado
   com `node --check`.
2. `tabs-switch-preserve-v0812.js` — removido listener de clique
   duplicado que brigava com `tabs-stable-switch-v0812.js` via
   `stopImmediatePropagation` (a versão "sem piscar" nunca rodava).
3. `index.html` — `electrolux-reports-v0813.js` agora está incluído
   (existia no repo mas não era carregado); `defer` adicionado nas 94
   tags `<script>`.
4. `supabase/RLS_DRAFT_V0813.sql` — rascunho de políticas RLS só para
   `profiles` e `service_orders` (únicas tabelas com colunas
   confirmadas por uso real no código). NÃO aplicar sem revisar.

Todos os 104 arquivos `.js` passam em `node --check` agora.

## Pendente — precisa de ambiente real (git, Supabase, navegador)

Em ordem de prioridade:

1. **`supabase/schema.sql` está desatualizado e não bate com o app.**
   O app usa ~30 tabelas (`companies`, `stores`, `user_companies`,
   `user_store_access`, `user_permissions`, `clients`,
   `client_addresses`, `client_phones`, `equipments`,
   `service_orders`, `os_status_history`, `os_parts`, `os_financial`,
   `attachments`, `appointments`, `appointment_history`, `tasks`,
   `stock_items`, `stock_movements`, `technician_stock`,
   `dashboard_cases`, `parts_requests`, `payments`,
   `homologation_tests`, `technical_documents`, `manufacturer_imports`,
   `company_holidays`, `company_schedule_settings`, `profiles`), mas
   o schema.sql versionado só descreve 4 tabelas fictícias com nomes
   em português que não existem no código.
   **Ação:** `supabase db dump --schema public` (ou export pelo
   painel) no projeto real, substituir `supabase/schema.sql`, então
   revisar/completar `supabase/RLS_DRAFT_V0813.sql` com o schema real
   antes de aplicar RLS em produção.

2. **`rpc/master_reset_test_environment`** é chamada por
   `master-reset-v0813.js` mas não existe em nenhum arquivo do repo.
   Confirmar se existe no painel do Supabase (fora de versionamento) e
   trazer a definição para o repo, ou implementar do zero — stub
   comentado no fim de `RLS_DRAFT_V0813.sql`.

3. **46 dos 104 arquivos `.js` criam seu próprio `MutationObserver`**
   observando `document.documentElement` inteiro
   (`subtree:true, childList:true`). Toda mutação de DOM em qualquer
   lugar da página dispara até 46 callbacks. Precisa levantar, arquivo
   por arquivo, se o observer ainda é necessário ou se dá para
   substituir por uma chamada direta após a ação que motivou o patch
   (ex.: chamar a função de montagem diretamente após `render()`, em
   vez de vigiar o DOM inteiro). Fazer aos poucos, um arquivo por vez,
   testando no navegador a cada corte.

4. **`renderDashboard` é redefinido/encadeado por 6 arquivos**
   (`app.js`, `desktop-layout-patch.js`, `dashboard-master-v0812.js`,
   `dashboard-approved-v0812.js`, `dashboard-layout1-v0812.js`, mais
   wrappers em `dashboard-pyramids-v0812.js`,
   `dashboard-actions-v0812.js`, `discovery-day-v0812.js`). A versão
   que efetivamente aparece na tela hoje é a última a rodar por ordem
   de `<script>` no `index.html` — checar isso primeiro
   (`grep -n 'renderDashboard' index.html` não existe, é preciso
   seguir a ordem das tags `<script src=...>` e ver qual arquivo
   reatribui `window.renderDashboard` por último). Decidir qual é a
   implementação "oficial" (provável candidata:
   `dashboard-layout1-v0812.js`, é a mais completa) e remover as
   demais, uma de cada vez, testando no navegador.

5. Mesma lógica do item 4 vale para `window.render` — também é
   encadeado por vários arquivos (`tabs-final-fix.js`,
   `dashboard-tab-navigation-v0812.js`, `tabs-stable-switch-v0812.js`,
   `final-routing-v0812.js`, `electrolux-reports-v0813.js`).

6. **9 arquivos existem no repo mas não são carregados por ninguém**
   (não estão em nenhuma tag `<script>`/`<link>` do `index.html`):
   `os-layout-urgent-v2.js/css`, `os-fidelity-patch.js`,
   `dashboard-os-open-fix-v0812.js`, `import-save-hotfix-v0813.js`,
   `search-refinement-v0812.css/js`,
   `whirlpool-client-equipment-block-fix-v0813.js`.
   Decidir, arquivo por arquivo: incluir no `index.html` (se a
   intenção era usar) ou apagar (se foi abandonado).
   (Os 3 órfãos de contexto de empresa/loja que estavam nesta lista —
   `company-context-guard-v0813.js`, `company-selector-stable-v0813.js`,
   `store-context-final-v0813.js` — foram apagados em 2026-08-28 após
   auditoria confirmar que eram versões superadas por
   `company-selector-singleton-v0813.js`/`company-management-final-
   v0813.js`, sem nenhuma referência real no repo.)

7. `STABILIZATION_LOCK_V0.8.12.md` do próprio repo proíbe criar novos
   `*-patch.js`/`*-urgent.js` para a tela de OS e exige fonte única
   (`os-detail-v0812.js` + `.css`). Hoje ainda existem
   `os-corrections-v0812.js`, `os-budget-restore-v0812.js`,
   `os-edit-data-fix-v0812.js`, `os-save-currency-fix-v0812.js`,
   `os-summary-lock-alignment-v0812.js`, `os-summary-map-v0812.js`
   mexendo na mesma tela — considerar migrar o conteúdo de cada um
   para dentro de `os-detail-v0812.js`/`.css` e apagar os patches,
   validando cada área da tela de OS depois da fusão.

## Como validar sintaxe rapidamente a cada mudança

```bash
for f in *.js; do node --check "$f" || echo "ERRO em $f"; done
```

## Prompt sugerido para abrir a sessão no Claude Code

> Estou continuando uma auditoria do repositório voxassist-web
> (clonado localmente). Leia HANDOFF_CLAUDE_CODE.md e FIXES_20260824.md
> na raiz do projeto para contexto do que já foi corrigido e do que
> falta. Comece pelo item 1 da lista de pendências (schema.sql
> desatualizado): rode `supabase db dump` e me ajude a comparar com
> o schema.sql atual antes de qualquer outra mudança.
