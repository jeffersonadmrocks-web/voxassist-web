# VoxAssist Web — Base V0.8.12

Versão web de desenvolvimento e homologação do VoxAssist, alinhada à base desktop V0.8.12 e ao Backlog Mestre consolidado das conversas de computador e celular.

## Regra de homologação

A Etapa 1 — Atendimento / Ordem de Serviço — deve ser estabilizada antes das etapas seguintes. Nenhum requisito antigo deve ser apagado por ter sido parcialmente implementado. Estados de acompanhamento: Pendente, Em desenvolvimento, Disponível para teste, Teste, Validado, Implementado e Necessita ajuste/Revisar.

## Escopo consolidado

### Atendimento / Ordem de Serviço
- Fluxo por etapas com validações obrigatórias e Salvar e Avançar.
- TAB em todos os campos, caixa alta e mensagens claras de validação/salvamento.
- Alteração manual controlada de situação, inclusive regressão com motivo e auditoria (#14/#40/#41).
- Cliente dentro da OS, Cliente 360, múltiplos telefones, CEP/endereço e histórico de OS/equipamentos.
- Tipo de produto; Grupo apenas administrativo/relatórios; estado do aparelho; interno/externo; local consumidor/laboratório.
- Técnico somente entre usuários técnicos cadastrados.
- Orçamento e Financeiro integrados à OS; pagamentos e formas de pagamento.
- Inclusão manual de peças e vínculo ao estoque/OS (#44).
- Histórico de status, datas/eventos e auditoria.
- F11/Observações Internas exclusivamente internas e nunca impressas.
- Pesquisa de OS em nova aba; abas estilo navegador; X somente fecha a própria aba; fechar outras/todas (#38/#47).
- PDF/Impressão profissional da OS (#48), preferencialmente 1 página e no máximo 2 quando necessário, com submenu de documentos.
- Parecer técnico guiado, assinatura visual automática do técnico e documentos técnicos.
- Mapa Google/Waze quando aplicável.

### Fotos, anexos, QR e mobile
- QR Code permanente por OS para recepção/técnicos.
- Fotos classificadas, documentos e PDFs vinculados.
- Checklists e pareceres pelo celular.
- Importação de PDF externo sem API, preservando original e prevenindo duplicidade.
- Templates por fabricante, incluindo Brastemp/Consul, e laudos com campos/fotos obrigatórios.
- Permitir salvar documento incompleto registrando pendências quando o fluxo exigir.

### Agenda e tarefas
- Agenda de atendimentos internos/externos, retiradas, reagendamento e cancelamento.
- Alertas para técnico e atendente e lembretes/WhatsApp.
- Central de tarefas com responsável, prioridade, prazo, status, notas e notificações.

### Oficina / Estoque
- Fila técnica, equipamentos, documentação técnica, manuais/firmware/boletins.
- Estoque com rastreabilidade por OS.
- Estoque em poder do técnico sem baixa fiscal imediata; identificar qual técnico possui cada peça.
- Fluxo de garantia em que a peça utilizada fica pendente de baixa fiscal até faturamento ao fabricante.
- Movimentações, transferências e estoque cruzado entre Vitória e Serra.
- Entrada/saída assistida por foto/código da peça como evolução prevista.

### Financeiro
- Financeiro dentro da OS, orçamento e pagamentos.
- Lançamentos parcelados sem exigir encerramento da OS.
- Caixa com lançamentos avulsos, filtros, totais e meios de pagamento.
- Relatórios e exportação PDF/Excel.
- Emissão fiscal deixada para etapa final; avaliar integração com GestãoClick ou provedor fiscal antes da arquitetura definitiva.

### Dashboard
- Indicadores por situação, grupo, técnico, atendente, loja e período.
- Cards/status clicáveis abrindo as OS correspondentes.
- Oportunidades do dia, casos de atenção e feed em tempo real.
- Produtividade por usuário/equipe/loja/período.
- Bonificação de atendentes configurável e auditável.
- Pedidos de peças com alertas e histórico.
- Exportação PDF/Excel.

### Usuários, permissões e multi-loja
- Perfis de homologação: Gestor, Atendente, Técnico e Estoque opcional.
- Dashboard e permissões diferenciadas por perfil.
- Vitória e Serra no mesmo sistema com acesso controlado.
- Permissões granulares, auditoria, bloqueio/revogação e detecção de comportamento suspeito.
- Bloqueio por inatividade e regras de segurança para operações críticas.

### Testes de Funções / Homologação
- Módulo digital dentro do VoxAssist para acompanhar testes por função e módulo.
- Registrar versão testada, função, resultado, erro, reteste, validação e regressão.
- Cobertura: Atendimento/OS, Oficina, Agenda, Financeiro, relatórios/PDF/Excel, System3/DBF/FPT e migração, clientes/equipamentos/vendas, multi-loja/usuários, loja/integrações, administração/segurança e homologação geral.

### Administração, backup e integrações
- Backup/restauração de banco, anexos e configurações; local configurável; backup de segurança antes de restaurar; último backup e agendamento.
- Atualização por arquivo na versão desktop enquanto coexistir.
- Integração WhatsApp; site; Mercado Livre/API como evoluções registradas.
- Migração System3/DBF/FPT preservada no backlog.

## Web / Supabase
- Ambiente web publicado para homologação com dados exclusivamente fictícios.
- Supabase como base de banco/autenticação para testes multiusuário.
- RLS obrigatório nas tabelas expostas e uso apenas de chave pública no frontend.
- Nunca publicar `service_role` ou segredos no GitHub/Vercel.
- Testar uso simultâneo em mais de um computador antes de decidir arquitetura definitiva de produção.

## Situação herdada da V0.8.12
Os itens #14/#40/#41 e #44 permanecem em reteste até homologação real. O redesenho das fichas de impressão é o requisito #48. Autocompletes, eventos/datas, F11, anexos, Financeiro da OS, Cliente 360, documentação técnica, dashboard, multi-loja e parecer guiado devem permanecer rastreados mesmo quando já houver implementação parcial.

## Regra de dados
Durante esta fase web, utilizar somente dados fictícios. Dados reais de clientes não devem ser usados no ambiente de homologação.
