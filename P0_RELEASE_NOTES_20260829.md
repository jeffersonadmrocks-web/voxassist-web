# P0 Release Notes — 29/08/2026

Esta branch NÃO deve ser publicada automaticamente.

## Mudanças principais
- Dashboard Core V1 como controlador único.
- Radar de Gestão com regras determinísticas e drill-down.
- Filtros globais.
- Resumo financeiro real.
- Integração de indicadores com Gestão Operacional, agenda e peças.
- Metas/bonificação fictícias removidas.
- Descoberta do Dia rotativa e local.
- Gate IA explícito: sem envio de dados para IA externa.
- Hardening de RPCs e triggers no Supabase.

## Necessário antes da produção
1. Preview autenticado.
2. Teste Gestor/Atendente/Técnico.
3. Teste negativo multiempresa.
4. Regressão OS, Agenda, Electrolux, NPS e Minha Jornada.
5. Habilitar proteção contra senhas vazadas no Supabase Auth.
6. Revisão do PR e somente então merge.
