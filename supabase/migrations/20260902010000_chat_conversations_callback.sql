-- ============================================================
-- "Agendar retorno" na barra de ferramentas da conversa (Central de
-- Conversas) -- achado do usuário em 2026-09-02, comparando com o
-- mockup aprovado (artifact 42ebf5fb): faltava o botão "📅 Agendar
-- retorno" e o chip de lista "Retornos de hoje", que dependem de um
-- campo próprio -- não existia nenhuma coluna equivalente em
-- chat_conversations nem qualquer outra tabela do domínio de chat.
--
-- next_callback_at/next_callback_reason guardam só o PRÓXIMO retorno
-- agendado por conversa (não um histórico -- o histórico completo já
-- fica em chat_conversation_events via o evento SCHEDULE_CALLBACK,
-- mesmo padrão de auditoria já usado por TRANSFER/ASSUMIR). Aditivo,
-- nullable, não muda nenhum comportamento existente até
-- chat-beta-v0828.js passar a lê-los/escrevê-los.
-- ============================================================

alter table public.chat_conversations
  add column if not exists next_callback_at timestamptz,
  add column if not exists next_callback_reason text;

comment on column public.chat_conversations.next_callback_at is
  'Data/hora do próximo retorno agendado pelo atendente para esta conversa (botão "Agendar retorno"). Null quando não há retorno pendente. Alimenta o chip de lista "Retornos de hoje".';
comment on column public.chat_conversations.next_callback_reason is
  'Motivo/nota livre do retorno agendado em next_callback_at. Null quando não há retorno pendente.';

create index if not exists idx_chat_conversations_next_callback_at
  on public.chat_conversations (next_callback_at)
  where next_callback_at is not null;
