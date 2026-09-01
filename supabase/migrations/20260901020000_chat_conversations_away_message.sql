-- ============================================================
-- Mensagem automática de ausência fora do horário de atendimento
-- (segunda a sexta, 08h-18h, horário de Brasília) -- ver
-- _shared/messagingService.ts (isWithinBusinessHours,
-- currentClosedPeriodStart, decideAwayMessage) para a lógica pura,
-- testada, que decide quando mandar.
--
-- last_away_sent_at guarda só QUANDO a última mensagem de ausência foi
-- enviada nesta conversa -- é a única coisa necessária pra não repetir
-- várias vezes pro mesmo cliente dentro do mesmo período fechado.
-- Aditiva, nullable, não muda nenhum comportamento existente até
-- chat-inbound-webhook passar a lê-la/escrevê-la.
-- ============================================================

alter table public.chat_conversations
  add column if not exists last_away_sent_at timestamptz;

comment on column public.chat_conversations.last_away_sent_at is
  'Quando a mensagem automática de "fora do horário de atendimento" foi enviada pela última vez nesta conversa. Comparado contra o início do período fechado atual (currentClosedPeriodStart) para nunca repetir mais de uma vez pro mesmo cliente no mesmo período.';
