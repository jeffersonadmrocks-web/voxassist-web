# VoxAssist — Matriz Mestra de Configurações

Rastreamento vivo da reestruturação do menu Configurações em 9 áreas. Atualizado a cada rodada de trabalho — nunca reescrito do zero. Ver `docs internos`/conversa 2026-09-08 para o diagnóstico completo (5 agentes de pesquisa, schema.sql + migrations + grep completo do JS).

Princípio de execução: **corrigir o crítico + construir o seguro em paralelo**. Um item BLOQUEADO nunca bloqueia os demais.

Status possíveis: `PENDENTE` · `EM DIAGNÓSTICO` · `BLOQUEADO POR DEPENDÊNCIA` · `EM IMPLEMENTAÇÃO` · `IMPLEMENTADO` · `TESTADO` · `HOMOLOGADO`

---

## Conflitos estruturais críticos (prioridade imediata)

| # | Item | Classificação | Dependência | Ação | Status |
|---|---|---|---|---|---|
| C1 | Aviso falso "Não existe Loja/Unidade operacional" | CONSOLIDAR | nenhuma | Remover/corrigir texto em `company-only-mode-v0813.js` | **IMPLEMENTADO** (2026-09-08) |
| C2 | Funções sem migration versionada (`admin_soft_delete_user`, `admin_update_user_access_company_only`) | REVISAR | nenhuma pra documentar; bloqueia só alterações futuras nessas RPCs | Extraídas via `pg_get_functiondef`, documentadas em `20260908010000_document_admin_user_access_rpcs.sql` (corpo idêntico, zero mudança de comportamento). Achado extra: `admin_update_user_access_company_only` já grava `audit_log` -- corrige a suposição de "zero escritores" pra ações de usuário (continua zero pra OS/financeiro/estoque). | **IMPLEMENTADO** (2026-09-08) |
| C3 | 3 catálogos de chaves de permissão incompatíveis (`financeiro.*`×`finance.*`, `estoque.*`×`stock.*`, `config.*`×`settings.*`) gravando em `user_permissions` sem validação | REVISAR → CONSOLIDAR | bloqueia só a finalização de Permissões (Área 01); não bloqueia as demais 8 áreas | Levantamento em produção: **nenhum dado real usa as chaves divergentes** (só o catálogo A já em uso). `user-access-management-v0813.js` corrigido pra usar as chaves canônicas -- sem migração de dado necessária. Falta: endurecer a RPC pra rejeitar chave fora do catálogo (ainda não feito). | **EM IMPLEMENTAÇÃO** |
| C4 | 4 seletores de "empresa ativa" concorrentes (`company-only-mode`, `company-selector-singleton`, `user-logoff`, resíduo em `user-permissions-ui`) | CONSOLIDAR | nenhuma pra outras áreas | Escolher 1 fonte canônica, remover os outros 3 MutationObservers/queries duplicadas | **PENDENTE** |
| C5 | 3 telas "Alterar Usuário" concorrentes no mesmo botão (`company-only-mode`, `user-permissions-ui`, `user-access-management`) | CONSOLIDAR | bloqueia só polimento de Área 01 | Mapear campos/RPCs de cada uma, escolher canônica (`user-access-management-v0813.js` parece a mais completa — LOJAS+GRUPOS+permissões granulares) | **PENDENTE** |
| C6 | 2 formulários de cadastro/edição de empresa com cobertura de campos diferente | CONSOLIDAR | nenhuma pra outras áreas | Unificar em 1 formulário completo (usar `company-profile-complete-v0812.js` como base, é o mais completo) | **PENDENTE** |

---

## Área 01 — Empresa & Usuários

| Item | Classificação | Ação | Migration | Arquivos | Status |
|---|---|---|---|---|---|
| Empresas (razão social, CNPJ, endereço, logo, docs) | REAPROVEITAR (ver C6) | — | — | `company-profile-complete-v0812.js` | IMPLEMENTADO (consolidação pendente) |
| Unidades/lojas + ativar/desativar | REAPROVEITAR | — | `20260907020000_admin_upsert_store.sql` | `service-stores-admin-v0907.js` | IMPLEMENTADO |
| Parâmetros próprios por unidade | CRIAR | — | — | — | PENDENTE |
| Usuários (cadastro/gerenciamento) | REAPROVEITAR (ver C5) | — | — | 3 telas concorrentes | IMPLEMENTADO (consolidação pendente) |
| Perfis (Gestor/Atendente/Técnico/Administrativo/Personalizado) | REVISAR | `role` é CHECK rígido (5 valores); "Administrativo"/"Personalizado" não existem no banco | — | `profiles_role_check` | EM DIAGNÓSTICO |
| Permissões por módulo/ação | REVISAR (ver C3) | — | — | — | PENDENTE |
| Técnicos: interno/externo, agenda | REAPROVEITAR | — | — | `profiles.external_schedule_enabled` | IMPLEMENTADO |
| Técnicos: região, especialidade, disponibilidade | CRIAR | — | — | — | PENDENTE |
| Segurança: redefinir senha (gestor→usuário) | CRIAR | — | — | — | PENDENTE |
| Segurança: encerrar sessão remota | CRIAR | — | — | — | PENDENTE |
| Segurança: bloqueio/desbloqueio de conta | CRIAR | — | — | — | PENDENTE |
| Histórico básico de acesso (login/logout) | CRIAR | `audit_log` cobre alteração de cadastro, não login | — | — | PENDENTE |

## Área 02 — Ordens de Serviço

| Item | Classificação | Ação | Status |
|---|---|---|---|
| Numeração | REAPROVEITAR | Só expor leitura em Configurações. Card informativo "NUMERAÇÃO" em `settings-order-types-v0908.js`, regra fixa de `os-number-format-v0812.js` (nenhuma lógica nova). | **IMPLEMENTADO** (2026-09-08) |
| Motor de fluxo/status automático | REAPROVEITAR — **nunca recriar** | `advance_service_order_status` é fonte única | IMPLEMENTADO (é o motor existente) |
| Rótulos de status duplicados (`manual-status-v0812.js` FLOW × `vxOsStatusLabel`) | CONSOLIDAR | Revisado 2026-09-08: `labelOf()` de manual-status-v0812.js já PREFERE `window.vxOsStatusLabel` sempre que disponível (`os-status-engine-v0903.js` carrega antes) -- na prática `FLOW` só serve de fallback morto pro rótulo. Risco baixo (rótulo já é o certo hoje). `FLOW` continua com um uso real, diferente: é a lista ORDENADA de status oferecida no seletor manual de situação -- essa parte não é redundante, fica pra depois com menor prioridade. | BAIXA PRIORIDADE (não é bug funcional) |
| Tipos de OS (ativar/desativar sem apagar histórico) | CRIAR | `order_types` por empresa (migration `20260908050000`) + RPC `admin_upsert_order_type`, gestor-only. Empresas existentes semeadas com os 5 tipos já em uso; empresa nova semeada por trigger. Tela própria `settings-order-types-v0908.js`. `order-type-v0812.js` (Nova OS) já lê desta tabela, fallback pra lista fixa se vazia. GARANTIA/REINGRESSO mantidos com os mesmos nomes (comportamento especial por string exata, aviso na tela). | **IMPLEMENTADO** (2026-09-08) |
| Tipo de atendimento (Interno/Externo) | REVISAR | CHECK rígido no banco, 3º valor exige migration | EM DIAGNÓSTICO |
| Campos obrigatórios por etapa | CRIAR (exposição) | Regra já existe no motor SQL (`compute_missing_for_status`, migration `20260903050000`), falta só exibir -- card informativo "CAMPOS OBRIGATÓRIOS POR ETAPA" em `settings-order-types-v0908.js`, texto espelha 1:1 as condições da função SQL, sem duplicar lógica nova. | **IMPLEMENTADO** (2026-09-08) |
| Termos e condições (por tipo de documento, versionado) | CRIAR | Confirmado: nunca implementado, nenhum artefato no repo | PENDENTE |
| Impressão e documentos (seleção/parametrização de modelos) | CONSOLIDAR + CRIAR | Duplicação real de HTML entre impressão e WhatsApp | PENDENTE |

## Área 03 — Cadastros & Catálogos

| Item | Classificação | Status |
|---|---|---|
| Grupos e tipos de produto (TV/Geladeira/Freezer/...) | **REAPROVEITAR catálogo mestre (intocado) + CRIAR camada de associação por empresa** | **IMPLEMENTADO** (2026-09-08). Catálogo mestre `product_groups`/`product_types` confirmado global, seeded, sem FK externa, sem trigger/função, sem policy de escrita -- decisão do usuário: nunca duplicar por empresa, nunca dar escrita direta nele. Criada `company_product_types` (migration `20260908030000`) + RPC `admin_set_company_product_type` (gestor-only; ausência de linha = ativo por padrão, empresa herda o catálogo inteiro sem reconfigurar nada). Tela própria `settings-product-catalog-v0908.js` -- primeira área a sair da página única e virar destino próprio no hub. `inferGroup()` (os-detail-v0812.js) mantido como está (2 usos, só exibição, nunca persistido) -- consolidação com o catálogo real fica pra depois de mapear todos os consumidores, sem apagar o fallback ainda. |
| Defeitos | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `product_defects` por empresa (migration `20260908070000`), RPC `admin_upsert_product_defect`, card em `settings-product-catalog-v0908.js`. Sem seed (campo era texto livre, nada pra preservar). Ligação com o campo DEFEITO RELATADO (autocomplete/sugestão) fica pra depois -- campo continua texto livre por ora. |
| Estado do produto | CRIAR | **IMPLEMENTADO** (2026-09-08) -- `product_conditions` por empresa (migration `20260908060000`), RPC `admin_upsert_product_condition`, card na mesma tela de Produtos (`settings-product-catalog-v0908.js`). Empresas existentes semeadas com NOVO/USADO/ARRANHADO/AVARIADO (nada perdido); gestor livre pra renomear/adicionar. Ligado ao campo ESTADO DO APARELHO na Nova OS e na aba Equipamento da OS aberta, com fallback pra lista fixa. |
| Acessórios | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `product_accessories` por empresa (migration `20260908070000`), RPC `admin_upsert_product_accessory`, card em `settings-product-catalog-v0908.js`. Sem seed. Ligação com o campo ACESSÓRIOS fica pra depois -- campo continua texto livre por ora. |
| Serviços com valor padrão | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `services_catalog` por empresa (migration `20260908070000`), RPC `admin_upsert_service_catalog_item` (nome + valor padrão), card em `settings-product-catalog-v0908.js`. Sem seed. Ligação com o orçamento da OS fica pra depois -- valor continua digitado livremente por ora. |

⚠️ "Grupos de Atendimento" (já existe) é conceito diferente (roteamento interno), não confundir com catálogo de produto.

## Área 04 — Agenda & Atendimento

| Item | Classificação | Status |
|---|---|---|
| Horários (dias/período/capacidade da empresa) | REAPROVEITAR | IMPLEMENTADO |
| Técnicos disponíveis na agenda | CONSOLIDAR | **IMPLEMENTADO** (2026-09-08) -- achado: `profiles.external_schedule_enabled` já era lido em vários lugares (field-agenda-complete-v0813.js, dashboard, electrolux-agenda-bridge) mas nunca tinha nenhum jeito de ESCREVER pelo app (zero writers confirmado). RPC nova `admin_set_technician_external_schedule` (gestor-only, migration `20260908080000`) + card novo em `settings-schedule-v0907.js` (mesma tela de Horários), lista técnicos com checkbox. Não duplica cadastro de técnico. |
| Capacidade por técnico/região | CRIAR | PENDENTE (futuro, não urgente) |
| Regiões de atendimento | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `service_regions` por empresa (migration `20260908090000`), card em `settings-schedule-v0907.js` (mesma tela de Agenda). Associar região a técnico fica pra depois. |
| Conflito/transferência/sem técnico definido | REAPROVEITAR | IMPLEMENTADO |
| Períodos disponíveis (enum) | REVISAR | 2 valores mortos no CHECK (`HORARIO_COMERCIAL`/`HORARIO_ESPECIFICO`) |
| Alertas (parâmetros da regra) | CRIAR | PENDENTE |

## Área 05 — Estoque & Peças

| Item | Classificação | Status |
|---|---|---|
| Locais de estoque (múltiplos depósitos) | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `stock_locations` por empresa (migration `20260908090000`), tela própria nova `settings-stock-v0908.js` (primeiro conteúdo real da Área 05, saiu de placeholder). Separar saldo de `stock_items` por local fica pra depois. |
| Categorias de peças | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `part_categories`, mesma tela de Estoque. |
| Unidades (UN/KIT/PAR/METRO) | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `stock_units`, mesma tela de Estoque. |
| Movimentações | CONSOLIDAR (schema existe, zero gravação) | PENDENTE |
| Estoque técnico | REAPROVEITAR schema / CRIAR gravação | PENDENTE |
| Fabricantes (garantia/reembolso) | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `manufacturers` por empresa (migration `20260908110000`, nome + garantia padrão em dias + observação de reembolso), card em `settings-stock-v0908.js` (mesma tela de Estoque). Sem seed. Ligação com o campo MARCA da Nova OS ou com o cálculo de garantia por OS fica pra depois. |
| Alertas | CRIAR | PENDENTE |

## Área 06 — Financeiro

| Item | Classificação | Status |
|---|---|---|
| Formas de pagamento (ativar/ordem) | CRIAR | **IMPLEMENTADO** (2026-09-08) -- tabela `payment_methods` por empresa (migration `20260908040000`), RPC `admin_upsert_payment_method`, tela própria `settings-payment-methods-v0908.js`. Empresas existentes semeadas com as 7 formas já em uso (nada perdido); empresa nova semeada por trigger. Guia Finalizar OS (`os-detail-v0812.js`) já lê desta tabela, com fallback pra lista fixa se a empresa não tiver nenhuma. "DESCONTO" continua com o mesmo nome (comparação por string no frontend depende disso). |
| Parcelamento configurável | CRIAR | **IMPLEMENTADO cadastro** (2026-09-08) -- `payment_methods.max_installments` (migration `20260908130000`), RPC `admin_upsert_payment_method` estendida (parâmetro novo com default, retrocompatível) para gravar/limpar o limite. Campo no mesmo modal de "Renomear forma de pagamento". Ainda não validado no formulário de Finalizar OS -- só cadastro. |
| Contas e caixas | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `cash_accounts` por empresa (migration `20260908090000`), card em `settings-payment-methods-v0908.js` (mesma tela de Financeiro). Vincular pagamento a uma conta específica fica pra depois. |
| Categorias financeiras | CRIAR | **IMPLEMENTADO catálogo** (2026-09-08) -- `financial_categories`, mesma tela de Financeiro. |
| Regras de recebimento | CRIAR | PENDENTE |
| Descontos (limite/autorização por perfil) | CRIAR | **IMPLEMENTADO cadastro** (2026-09-08) -- `discount_limits` (migration `20260908140000`, 1 linha por (empresa, perfil fixo GESTOR/ATENDENTE/TECNICO), RPC `admin_set_discount_limit` gestor-only). Card "LIMITE DE DESCONTO POR PERFIL" em `settings-payment-methods-v0908.js`. Ainda não validado quando a forma DESCONTO é lançada na guia Finalizar OS -- só cadastro. |
| Parâmetros (juros/taxas/arredondamento) | CRIAR | **IMPLEMENTADO cadastro** (2026-09-08) -- 3 colunas novas em `companies` (migration `20260908120000`: juros ao mês %, multa %, modo de arredondamento), editadas por PATCH direto (mesmo padrão de `document_footer`/`business_hours`, protegido pela policy `companies_update_gestor` já existente, sem RPC nova). Card "PARÂMETROS FINANCEIROS" em `settings-payment-methods-v0908.js`. Ainda não aplicado em nenhum cálculo da guia Finalizar OS -- só cadastro. |

## Área 07 — Comunicação & Automação

| Item | Classificação | Status |
|---|---|---|
| Canais (WhatsApp/Chat) | REAPROVEITAR — **não tocar na base** | IMPLEMENTADO (referência apenas) |
| Horário de atendimento | CONSOLIDAR com tabelas de Agenda | PENDENTE |
| Mensagens padrão / variáveis | CRIAR (coluna morta encontrada, não reaproveitar) | **IMPLEMENTADO** -- cadastro de nome+texto por empresa (migration `20260908100000`, RPC `admin_upsert_message_template`), tela própria `settings-communication-v0908.js`, primeiro conteúdo real da Área 07 (hub saiu de 'admin' pra 'comunicacao'). Escopo só cadastro: não dispara nada, não toca em nenhuma rota de envio/WhatsApp existente; ligar como atalho dentro do chat fica pra etapa futura. Variáveis livres (`{cliente}` etc.), sem parser (2026-09-08) |
| Notificações automáticas pro cliente | CRIAR | PENDENTE |
| NPS | confirmado específico Electrolux → fica na Área 08 | N/A |
| Automação (regra geral) | CRIAR (arquitetura só, sem pressa) | PENDENTE |

## Área 08 — Integrações

| Item | Classificação | Status |
|---|---|---|
| Card de status (WhatsApp/Electrolux) | REAPROVEITAR | IMPLEMENTADO |
| Última sincronização / logs / config detalhada | CRIAR | PENDENTE |
| Pulse IA (`integrated_apps`+`app_launch_audit`) | REAPROVEITAR — modelo arquitetural pras outras | IMPLEMENTADO |
| GestãoClick / Digisac | CRIAR | PENDENTE |
| Whirlpool | REVISAR — pertence à Área 02 (documento), não é integração de API | EM DIAGNÓSTICO |

## Área 09 — Sistema & Segurança

| Item | Classificação | Status |
|---|---|---|
| Tempo de inatividade / encerramento automático | CRIAR | **IMPLEMENTADO cadastro** (2026-09-08) -- `companies.session_idle_timeout_minutes` (migration `20260908150000`), editado por PATCH direto (mesmo padrão de `finance_*`, protegido por `companies_update_gestor`). Tela própria nova `settings-security-v0908.js`, primeira tela real da Área 09 -- hub saiu de 'admin' pra 'seguranca'. Nenhum monitor de inatividade implementado ainda -- só cadastro do parâmetro, comportamento de sessão atual intacto. Nota de navegação: RESET MASTER continua montado em `.vx-admin-actions` (tela 'admin', REAPROVEITAR) -- agora acessado pelo card "EMPRESA & USUÁRIOS", não mais por "SISTEMA & SEGURANÇA"; função em si intocada. |
| Auditoria | CONSOLIDAR — `audit_log` existe, zero escritores | PENDENTE |
| Logs técnicos | CRIAR | PENDENTE |
| Importação/exportação genérica | REVISAR — atual é específico de OS, pertence à Área 02 | EM DIAGNÓSTICO |
| Reset Master | REAPROVEITAR | IMPLEMENTADO -- continua na tela 'admin' (`.vx-admin-actions`), agora acessado pelo card "EMPRESA & USUÁRIOS" no hub (o card "SISTEMA & SEGURANÇA" passou a apontar pra `settings-security-v0908.js`) |

---

## Log de execução

- **2026-09-08**: Matriz criada a partir do diagnóstico de 5 agentes.
  - C1 (aviso falso "Não existe Loja") -- **corrigido**.
  - C2 (2 RPCs sem migration versionada) -- extraídas e documentadas retroativamente.
  - C3 (catálogo de permissão divergente) -- levantamento em produção mostrou zero dado real usando as chaves conflitantes; `user-access-management-v0813.js` corrigido pra usar o catálogo canônico. Falta só endurecer a RPC contra chave arbitrária.
  - Ao iniciar construção do catálogo de produtos (Área 03), migration própria abortou com erro real (`product_types` já existe) -- achado maior: `product_groups`+`product_types` já existem no banco, populados, globais (sem company_id), nunca ligados a nenhuma tela. Rollback automático, nada ficou pela metade. Decisão de escopo (global × por empresa) posta ao usuário antes de construir a UI de gestão.
  - Leva seguinte: Numeração + Campos obrigatórios por etapa (Área 02, exposição só-leitura, sem lógica nova) e Mensagens padrão (Área 07, migration `20260908100000`, primeira tela real da Comunicação -- hub saiu de placeholder/'admin' pra 'comunicacao'). **Total: 20 itens implementados de 45.**
  - Leva seguinte: Fabricantes/garantia-reembolso (Área 05, migration `20260908110000`, card em `settings-stock-v0908.js`). **Total: 21 itens implementados de 45.**
  - Leva seguinte: Parâmetros financeiros -- juros/multa/arredondamento (Área 06, migration `20260908120000`, colunas em `companies`, card em `settings-payment-methods-v0908.js`). **Total: 22 itens implementados de 45.**
  - Leva seguinte: Parcelamento configurável -- limite de parcelas por forma de pagamento (Área 06, migration `20260908130000`, RPC estendida retrocompatível). **Total: 23 itens implementados de 45.**
  - Leva seguinte: Descontos -- limite por perfil GESTOR/ATENDENTE/TECNICO (Área 06, migration `20260908140000`). **Total: 24 itens implementados de 45.**
  - Leva seguinte: Tempo de inatividade (Área 09, migration `20260908150000`, primeira tela real de Sistema & Segurança -- hub saiu de 'admin' pra 'seguranca'; RESET MASTER permanece intocado na tela 'admin', agora só acessado por outro card do hub). **Total: 25 itens implementados de 45.**
