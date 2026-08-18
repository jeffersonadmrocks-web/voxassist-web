# VoxAssist Web V0.8.12 — Status de Homologação

## Funcional nesta rodada
- Login e sessão via Supabase Auth, com cadastro do primeiro usuário de homologação.
- Dashboard lendo dados do Supabase.
- Listagem e pesquisa de OS.
- Nova OS persistida no Supabase, com cliente, equipamento, atendimento e histórico inicial.
- Abas principais e OS abertas em abas independentes no padrão navegador.
- Cliente 360 com histórico de OS.
- Situação destacada e alteração manual auditada; regressão exige motivo.
- Salvar e Avançar com validação inicial do parecer.
- F11 / Observações Internas separadas e fora da impressão.
- Parecer técnico: defeito constatado e serviço técnico.
- Inclusão manual de peças na OS.
- Financeiro da OS: mão de obra, desconto, observações e total com peças.
- Impressão/PDF pelo navegador com layout profissional base e sem observações internas.
- Oficina com fila por situação.
- Agenda / Central de tarefas.
- Estoque exibindo fiscal x disponível e estrutura para poder do técnico/pendência fiscal.
- Financeiro geral por OS.
- Módulo digital de Testes de Funções, com status gravável no Supabase.
- Perfis de usuário e bloqueio de menus no frontend.
- Sessão expira por inatividade após 30 minutos.

## Parcial / precisa evolução e reteste
- Perfis Gestor/Atendente/Técnico/Estoque: interface e leitura existentes; regras de RLS por perfil ainda precisam endurecimento para produção.
- Fotos/Anexos: tabela e bucket privado existem; o frontend publicado desta rodada ainda mantém a ativação completa de upload/visualização como próxima correção.
- QR Code móvel: posição/fluxo previsto, geração e endpoint móvel ainda em homologação.
- #48 impressão: base profissional disponível; ainda precisa comparação visual final com os modelos reais aprovados e refinamento para 1 página sempre que possível.
- Parecer com assinatura visual automática: estrutura prevista, assinatura real por perfil ainda pendente.
- Dashboard avançado: produtividade, bonificação, pedidos de peças, oportunidades do dia e feed em tempo real ainda precisam implementação completa.
- Estoque por técnico: banco suporta técnico, OS e fiscal_pending; telas de movimentação completa ainda precisam ser concluídas.
- Agenda externa, reagendamento, cancelamento, alertas e WhatsApp ainda não estão completos.
- Backup/restauração, atualização desktop, System3/DBF/FPT e importações avançadas permanecem registrados no Backlog Mestre.
- Mapas Google/Waze e integrações externas permanecem pendentes.
- WhatsApp, Mercado Livre/site e emissor fiscal permanecem pendentes conforme cronograma.

## Regra
Esta versão deve ser chamada de **V0.8.12 Web em homologação**, não de V0.8.12 totalmente validada. Itens só mudam para Validado após teste real do usuário.
