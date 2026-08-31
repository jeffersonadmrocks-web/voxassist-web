-- ============================================================
-- Preserva o JID original do WhatsApp (achado real, 2026-08-31): o
-- primeiro teste de recebimento real mostrou customer_phone recebendo
-- um valor de 14 dígitos que não bate com nenhum formato de telefone
-- (nem BR, nem internacional comum) -- indício forte de LID (Linked
-- ID), o identificador de privacidade mais novo do WhatsApp, que o
-- gateway aceitava como se fosse um número por só checar "8 a 15
-- dígitos" (extractPhoneNumber). customer_phone continua sendo o
-- identificador de exibição/dedup da conversa (não muda, não quebra
-- nada existente) -- mas o envio de resposta (chat-send-message) não
-- pode mais assumir que "customer_phone + @s.whatsapp.net" é sempre o
-- destino certo: se for um LID de verdade, o domínio correto é @lid,
-- não @s.whatsapp.net. whatsapp_jid guarda o JID bruto exatamente como
-- o gateway recebeu (com o domínio original), pra reenvio preciso.
-- Nullable: conversas criadas antes desta migration não têm esse dado
-- e continuam funcionando com o fallback antigo (customer_phone).
-- ============================================================

alter table public.chat_conversations
  add column if not exists whatsapp_jid text;

comment on column public.chat_conversations.whatsapp_jid is
  'JID bruto do WhatsApp (ex.: 5527999998888@s.whatsapp.net ou <id>@lid), exatamente como recebido do gateway -- usado como destino preferencial no envio, nunca reconstruído a partir de customer_phone.';
