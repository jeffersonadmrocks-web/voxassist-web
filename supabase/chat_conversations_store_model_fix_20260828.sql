-- ============================================================
-- Correção de arquitetura (regra crítica, 2026-08-28): número WhatsApp
-- NÃO é exclusivo de uma loja. A Vox tem 2 números e ambos atendem
-- Serra e Vitória — o cliente entra por qualquer um dos dois e escolhe
-- com qual loja quer falar. chat_connections já pertence à EMPRESA
-- (company_id é a única fronteira de RLS lá, sempre foi) — esta
-- migration só ajusta chat_conversations, onde a loja de fato
-- operacional precisa poder mudar durante o atendimento.
--
-- Renomeia chat_conversations.store_id -> current_store_id: mesmo
-- campo, nome deixa explícito que é MUTÁVEL (a conversa pode ser
-- transferida de loja sem trocar de número/sessão WhatsApp, sem perder
-- histórico). Nunca foi usado como fronteira de RLS (a policy de
-- chat_conversations desde a primeira migration já exige só
-- company_id + role/assigned_user_id/OS.technician_id — nenhuma
-- checagem por loja) — então não há policy pra corrigir aqui, só o
-- nome da coluna pra refletir a regra com clareza.
--
-- chat_connections.store_id continua existindo como estava: opcional,
-- só um dado auxiliar (ex.: "loja padrão sugerida" ao criar a
-- conexão), nunca restringe pra quais lojas aquela conexão pode
-- atender.
--
-- assigned_user_id (usuário responsável) já existia desde a primeira
-- migration, sem mudança.
--
-- "Transferir atendimento pra usuário" (troca assigned_user_id) e
-- "Transferir atendimento pra loja" (troca current_store_id) são as
-- duas operações independentes pedidas — ambas só um UPDATE direto
-- (já coberto pela policy "GESTOR/ATENDENTE alteram conversas",
-- migration anterior) + um INSERT em chat_conversation_events pra
-- auditoria (ação sugerida: 'TRANSFERIDA_PARA_USUARIO' /
-- 'TRANSFERIDA_PARA_LOJA') — nenhuma tabela ou RLS nova é necessária
-- pra isso. Nenhuma das duas toca a sessão WhatsApp/gateway.
-- ============================================================

alter table public.chat_conversations rename column store_id to current_store_id;

create index if not exists idx_chat_conversations_current_store on public.chat_conversations (current_store_id);
