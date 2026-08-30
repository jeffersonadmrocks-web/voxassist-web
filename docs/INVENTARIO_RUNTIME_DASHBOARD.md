# Inventário de Runtime — Dashboard

## Diagnóstico confirmado
O `index.html` atual carrega várias implementações concorrentes do Dashboard e da navegação. A ordem de carregamento determina qual função vence, e vários arquivos ainda envolvem (`wrap`) funções globais anteriores. Isso cria comportamento dependente da ordem dos scripts e permite regressão de funcionalidades já aprovadas.

## Renderizadores concorrentes encontrados
- `app.js`: possui `renderDashboard()` legado.
- `dashboard-master-v0812.js`: redefine `window.renderDashboard`.
- `dashboard-pyramids-v0812.js`: envolve o renderizador anterior.
- `dashboard-layout1-v0812.js`: redefine `window.renderDashboard` novamente.
- `dashboard-approved-v0812.js`: redefine novamente e contém o layout visual aprovado.
- `discovery-day-v0812.js`: envolve o renderizador ativo.
- `dashboard-actions-v0812.js`: envolve novamente o renderizador ativo.

## Mutadores pós-render encontrados
- `dashboard-final-fix-v0812.js`: MutationObserver permanente que reaplica handlers.
- `dashboard-productivity-manager-v0812.js`: MutationObserver permanente e substituição do card de produtividade.
- `dashboard-financial-summary-v0812.js`: MutationObserver permanente e substituição do card financeiro.
- `dashboard-popup-routing-final-v0812.js`: listener global em captura para substituir cliques do Dashboard.
- `dashboard-popup-multiselect-v0812.js`: outro listener global em captura sobre os mesmos modais.

## Navegação concorrente encontrada
- `tabs-final-fix.js`: redefine `window.render` e `window.renderTabs`.
- `final-routing-v0812.js`: redefine `window.render` novamente.
- `dashboard-tab-navigation-v0812.js`: redefine `window.render` e `window.renderTabs` novamente.
- `tabs-stable-switch-v0812.js`: redefine `window.render` e `window.renderTabs` novamente e intercepta clique em captura.
- `tabs-switch-preserve-v0812.js`: intercepta fechamento de abas em captura.

## CSS concorrente do Dashboard
- `dashboard-pyramids-v0812.css`
- `dashboard-layout1-v0812.css`
- `dashboard-approved-v0812.css`
- `dashboard-final-fix-v0812.css`
- `dashboard-pyramid-compact-v0812.css`

Os três últimos alteram seletores `.vx-approved`/pirâmides e podem se sobrescrever pela ordem do CSS.

## Baseline visual a preservar
`dashboard-approved-v0812.js` + `dashboard-approved-v0812.css`, acrescido somente das melhorias que foram realmente aprovadas. O arquivo aprovado ainda contém números demonstrativos/fictícios em produtividade, metas e formas de pagamento; portanto NÃO deve ser promovido sozinho para o runtime canônico antes de incorporarmos as fontes reais hoje existentes nos patches financeiro/produtividade.

## Plano de consolidação seguro
1. Criar `dashboard-canonical-v1.js` e `dashboard-canonical-v1.css` sem carregá-los na produção.
2. Incorporar no arquivo canônico: layout aprovado, dados reais, ações/drill-down, Descoberta do Dia, produtividade e financeiro.
3. Eliminar do canônico qualquer número fictício e qualquer MutationObserver usado para reescrever cards.
4. Criar `navigation-canonical-v1.js` a partir do comportamento aprovado das abas, sem cadeia de wrappers.
5. Em Preview, trocar o `index.html` para carregar somente os canônicos para essas responsabilidades.
6. Gate obrigatório: login, Visão Geral, Atendimento, Oficina, Agenda, Financeiro, abrir 3 OS em abas, alternar, fechar somente pelo X e retornar ao Dashboard.
7. Somente após o gate, retirar os scripts obsoletos do entrypoint. Os arquivos permanecem no histórico Git para rollback, mas não no runtime.

## Regra de segurança
Nenhuma exclusão em massa será feita antes do Preview canônico passar no gate. A `main` permanece intocada durante a consolidação.