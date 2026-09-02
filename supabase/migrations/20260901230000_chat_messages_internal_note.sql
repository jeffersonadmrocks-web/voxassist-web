-- ============================================================
-- Nota interna na Central de Conversas (Fase 3 do plano de reprodução
-- do protótipo aprovado -- artifact 42ebf5fb).
--
-- Nota interna é uma mensagem visível só pra equipe, NUNCA enviada ao
-- cliente via WhatsApp. Representada como uma linha normal de
-- chat_messages (direction='OUTBOUND', já que foi escrita pela
-- equipe) marcada com origin='INTERNAL' -- o mesmo padrão já usado
-- por origin='IMPORT' pra distinguir mensagens sem duplicar o
-- histórico numa tabela à parte.
--
-- Ponto crítico de segurança funcional: chat-send-message (a única
-- function que despacha mensagem pro gateway/WhatsApp) NUNCA deve
-- processar uma linha origin='INTERNAL' -- o frontend insere direto
-- via REST (chat_messages), sem passar pela function, e
-- chat-send-message não lê nem grava nada com esse origin. Nenhuma
-- mudança necessária nas duas Edge Functions existentes.
-- ============================================================

alter table public.chat_messages drop constraint chat_messages_origin_check;
alter table public.chat_messages add constraint chat_messages_origin_check
  CHECK ((origin = ANY (ARRAY['REALTIME'::text, 'IMPORT'::text, 'INTERNAL'::text])));

comment on column public.chat_messages.origin is
  'REALTIME = mensagem real trocada com o cliente via WhatsApp (webhook/send). IMPORT = trazida do histórico do WhatsApp na importação inicial. INTERNAL = nota interna da equipe, nunca enviada ao cliente -- chat-send-message nunca despacha uma linha com este origin.';
