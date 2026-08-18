# Backlog Mestre VoxAssist — Base V0.8.12

Consolidação de requisitos recuperados das conversas de computador e celular. Este arquivo é a referência de escopo da migração Web e não substitui o histórico de homologação.

## Prioridade 1 — Atendimento / OS
- [RETESTE] #14/#40/#41 — situação atual destacada e alteração manual controlada; regressão/exceção exige motivo e grava situação anterior/nova, usuário, data/hora e motivo.
- [RETESTE] #44 — inclusão manual de peça na OS.
- [REVISAR] #47 — abas tipo navegador, preservação de dados, X individual e ações fechar outras/todas.
- [DISPONÍVEL/RETESTE] #48 — ficha PDF/impressão profissional, compacta, 1 página preferencial e máximo 2; observações internas/F11 nunca impressas.
- TAB, caixa alta, validações obrigatórias, mensagens claras e confirmação de salvamento.
- Fluxo automático Salvar e Avançar como padrão.
- Cadastro/seleção de cliente dentro da OS; Cliente 360 e OS/equipamentos vinculados.
- CEP, endereço, telefone com DDD e múltiplos telefones.
- Equipamento, tipo de produto, estado do aparelho, interno/externo e local do produto.
- Grupo do produto apenas administrativo/relatórios e útil para grupos de técnicos.
- Técnico responsável somente entre técnicos cadastrados.
- Orçamento e Financeiro integrados; pagamentos e formas de pagamento.
- Histórico de status, datas/eventos, anexos e auditoria.
- Pesquisa de OS abre nova aba sem fechar a atual.
- Parecer técnico guiado e assinatura visual automática do técnico.
- Impressão/Gerar PDF com submenu de documentos.

## Fotos / QR / documentos
- QR permanente na OS para anexar fotos/documentos/PDFs.
- Fotos classificadas e uso por recepção/técnicos.
- Checklists/pareceres no celular.
- Importação de PDF externo sem API, mantendo original e prevenindo duplicidade.
- Templates de fabricante, Brastemp/Consul e documentos/laudos com campos e fotos obrigatórios.
- Salvar incompleto com registro de pendências quando necessário.

## Agenda / tarefas
- Agenda interno/externo, retiradas, reagendamento e cancelamento.
- Alertas técnico/atendente e lembretes WhatsApp.
- Tarefas com prioridade, prazo, status, notas e notificações.

## Oficina / Estoque
- Fila técnica e central de documentação por modelo: manuais, firmware e boletins.
- Estoque rastreado por OS.
- Estoque pulmão/em poder do técnico sem movimentação fiscal repetitiva; saber qual técnico possui a peça.
- Garantia: peça usada fica operacionalmente baixada/comprometida e fiscalmente pendente até emissão ao fabricante.
- Estoque cruzado e transferências Vitória/Serra.
- Entrada/saída por foto/código da peça como evolução.

## Financeiro
- Orçamento/pagamentos na OS.
- Parcelamento sem exigir finalização.
- Caixa avulso, filtros por data, totais por meio de pagamento.
- PDF/Excel.
- Fiscal somente nas etapas finais: reavaliar GestãoClick, Focus NFe, Nuvem Fiscal ou outro provedor antes de fechar arquitetura.

## Dashboard
- Situação/grupo/técnico/atendente/loja/período.
- Cards clicáveis por status.
- Oportunidades do dia, feed em tempo real e casos de atenção.
- Produtividade por usuário/equipe/loja/período.
- Bonificação de atendentes configurável/auditável.
- Pedidos de peças com alertas/histórico.

## Usuários / segurança / multi-loja
- Gestor, Atendente, Técnico e Estoque opcional, cada um com dashboard/permissões adequados.
- Vitória e Serra no mesmo sistema, acesso por autorização.
- Permissões granulares, auditoria, bloqueio/revogação e detecção de comportamento suspeito.
- Bloqueio por inatividade e senha/controle para operações críticas.

## Testes de Funções
- Checklist digital dentro do sistema, evitando papel.
- Registrar função, módulo, versão, resultado, falha, reteste, regressão e validação.
- Cobrir Atendimento/OS, Oficina, Agenda, Financeiro, relatórios, System3/DBF/FPT, clientes/equipamentos/vendas, multi-loja, integrações e administração/segurança.

## Administração / integrações
- Backup/restauração completos, agendamento e validação.
- Atualização por arquivo enquanto existir desktop.
- WhatsApp, site, Mercado Livre/API registrados.
- Migração System3/DBF/FPT preservada.

## Web / homologação
- Não voltar para uma web básica: evoluir a mesma aplicação publicada.
- Dados exclusivamente fictícios.
- Supabase para banco/autenticação e testes multiusuário.
- RLS obrigatório; nenhum segredo/service_role no frontend.
- Validar simultaneidade, delay e estabilidade antes da arquitetura definitiva.
