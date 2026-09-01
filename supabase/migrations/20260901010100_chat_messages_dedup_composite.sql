-- ============================================================
-- Lote 2 da importacao inicial do WhatsApp (2026-09-01): dedup
-- composto real, preservando o ID bruto do Baileys (provider_message_id,
-- copiado no Lote 1, nunca reescrito/namespaced).
--
-- Verificado antes de criar: zero colisao em
-- (connection_id, remote_jid, from_me, provider_message_id) nos dados
-- reais (3 mensagens hoje). Criado EM PARALELO ao índice antigo
-- (idx_chat_messages_dedup, company_id+external_message_id) -- o
-- antigo continua garantindo idempotencia ate o codigo (Lote 4) estar
-- 100% migrado pra gravar pelas colunas novas. Nenhum dos dois é
-- removido nesta migration.
-- ============================================================

create unique index if not exists idx_chat_messages_dedup_composite
  on public.chat_messages (connection_id, remote_jid, from_me, provider_message_id)
  where provider_message_id is not null and remote_jid is not null;

comment on index public.idx_chat_messages_dedup_composite is
  'Dedup real da importacao/tempo real: chave tecnica do Baileys (JID + direcao + id bruto), nunca o external_message_id namespaced. Substitui idx_chat_messages_dedup só depois do cutover do codigo ser confirmado (lote de limpeza futuro).';
