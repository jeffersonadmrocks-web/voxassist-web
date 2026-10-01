# VoxAssist — Auditoria Dashboard P0 e Gate de Segurança

Data: 29/08/2026
Branch: `stabilize/dashboard-intelligence-p0-20260829`

## Objetivo
Consolidar o Dashboard como central de inteligência operacional sem alterar a produção antes da homologação, eliminar handlers/renderizadores concorrentes, remover indicadores fictícios e endurecer a segurança das RPCs administrativas.

## Implementado nesta rodada
- `dashboard-master-v0812.js` transformado no controlador único Dashboard Core V1.
- Radar de Gestão determinístico com regras rastreáveis para análise parada, aprovação sem resposta, prontos antigos, pedidos de peça atrasados, OS sem técnico e concentração de carga.
- Filtros globais de Loja, Grupo, Técnico, Atendente, Situação e Período.
- Drill-down dos principais indicadores para as OS que sustentam o número/frase.
- Resumo financeiro baseado em `payments`, `os_financial` e `os_parts`.
- Integração visual com Gestão Operacional / Minha Jornada, agenda nativa e agenda externa.
- Metas/bonificação deixam de exibir valores sintéticos e passam a mostrar `Não configurado` até existir fórmula oficial.
- Gate IA explícito: nenhuma informação operacional é enviada para IA externa nesta fase.
- Descoberta do Dia V2: conteúdo local, rotativo e educativo, sem acesso a dados operacionais.

## Scripts legados neutralizados
Os arquivos continuam presentes para compatibilidade de cache/carregamento, porém sem comportamento quando o Core V1 está ativo:
- dashboard-pyramids-v0812.js
- dashboard-layout1-v0812.js
- dashboard-approved-v0812.js
- dashboard-layout1-activate-v0812.js
- dashboard-actions-v0812.js
- dashboard-final-fix-v0812.js
- dashboard-popup-routing-final-v0812.js
- dashboard-productivity-manager-v0812.js
- dashboard-financial-summary-v0812.js

## Gate de Segurança aplicado no Supabase
Projeto: `dgasmtvpgifceyqufcfg`

Migrações aplicadas:
1. `harden_admin_rpcs_dashboard_p0`
2. `harden_trigger_functions_and_search_path`

Principais efeitos:
- removido `EXECUTE` de `anon`/PUBLIC das RPCs administrativas críticas;
- `admin_update_user_access` agora exige gestor da empresa-alvo via `is_company_gestor(p_company_id)`;
- `switch_store` exige vínculo ativo com a empresa e acesso autorizado à loja;
- `master_reset_test_environment` exige gestor da empresa ativa + permissão explícita `admin:master_reset` + frase de confirmação;
- funções internas de trigger não podem mais ser chamadas como RPC por `anon` ou `authenticated`;
- `search_path` fixado nas funções indicadas pelo Security Advisor.

Validação objetiva de grants após migração:
- admin_company_users: anon=false / authenticated=true
- admin_soft_delete_user: anon=false / authenticated=true
- admin_update_user_access: anon=false / authenticated=true
- switch_store: anon=false / authenticated=true
- master_reset_test_environment: anon=false / authenticated=true (bloqueado internamente sem permissão explícita)
- trg_sync_operational_task_from_service_order: anon=false / authenticated=false

## Avisos de segurança ainda abertos
- `integrated_apps`: RLS habilitada e sem policy. Tratar como bloqueado por padrão até definir uso.
- algumas RPCs `SECURITY DEFINER` continuam executáveis por `authenticated` porque fazem parte da API do aplicativo; devem permanecer com validação interna forte e passar por testes negativos multiempresa.
- Leaked Password Protection do Supabase Auth continua desabilitada. O conector disponível nesta sessão não expõe ação de alteração dessa configuração; habilitar no painel Supabase antes do gate de produção real.

## Critérios antes de merge para main
- teste autenticado em navegador com Gestor, Atendente e Técnico;
- validar cada KPI e frase contra a lista detalhada correspondente;
- confirmar que alternar abas não fecha/reabre guias;
- confirmar isolamento entre empresas e lojas com testes negativos;
- confirmar Agenda/Electrolux/NPS/Minha Jornada sem regressão;
- testar Reset Master sem permissão: deve falhar;
- habilitar/validar proteção de senha vazada antes de produção real;
- somente então fazer merge/publicação.

## Observação de infraestrutura
A conexão Vercel disponível nesta sessão retorna zero projetos para o time conectado, portanto não foi possível criar/inspecionar preview por esse conector. A branch foi mantida fora da `main` para evitar alteração de produção sem homologação.