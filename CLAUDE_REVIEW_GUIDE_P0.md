# Guia de revisão futura — Claude

Revisar esta branch sem reescrever o layout por preferência pessoal. Prioridade: segurança, estabilidade, rastreabilidade e regressão.

Verificar especialmente:
- se existe qualquer outro script que ainda sobrescreva `window.renderDashboard` após `dashboard-master-v0812.js`;
- se listeners globais podem ser duplicados;
- se cada frase/contagem do Radar corresponde exatamente ao drill-down;
- se filtros respeitam empresa/loja e não substituem RLS;
- se queries falham de forma segura e distinguem `zero registros` de `erro de consulta`;
- se funções SECURITY DEFINER mantêm validação server-side do usuário e empresa;
- se o Reset Master deve ser redesenhado para escopo por empresa antes de voltar a ser habilitado amplamente;
- se há regressão em OS, abas, Agenda, Electrolux, NPS ou Minha Jornada;
- se a futura IA continua sem service_role, SQL arbitrário ou bypass de RLS.

Usar `AUDIT_DASHBOARD_P0_20260829.md` e `SECURITY_TEST_MATRIX_P0_20260829.md` como base da revisão.