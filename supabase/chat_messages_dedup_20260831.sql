-- ============================================================
-- ETAPA D — evita mensagem duplicada quando o Baileys reentrega a
-- mesma mensagem (acontece em reconexão/histórico). Índice único
-- parcial: só aplica quando external_message_id não é nulo (mensagens
-- sem id externo, se algum dia existirem, não competem entre si).
-- Idempotente.
-- ============================================================

create unique index if not exists idx_chat_messages_dedup
  on public.chat_messages (company_id, external_message_id)
  where external_message_id is not null;
