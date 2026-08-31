-- ============================================================
-- Correção de modelagem: LID não é telefone (2026-08-31). O primeiro
-- teste real de recebimento mostrou um remetente identificado por LID
-- (identidade de privacidade do WhatsApp, não um número) sendo gravado
-- em customer_phone como se fosse um telefone -- customer_phone passa
-- a ser reservado exclusivamente pro telefone real, quando resolvido.
--
-- remote_jid (renomeado de whatsapp_jid, adicionada na migration
-- anterior no mesmo dia -- nenhum dado real dependia do nome antigo
-- ainda) passa a ser o identificador técnico e ESTÁVEL da conversa
-- (sempre presente, seja telefone ou LID) -- é ele que decide
-- reaproveitar/criar conversa a partir de agora, não mais
-- customer_phone (que pode ficar nulo até ser resolvido, ou nunca ser
-- resolvido).
--
-- sender_lid guarda o LID separadamente quando existir, pra auditoria
-- e pra permitir resolver o telefone depois sem perder o vínculo.
-- ============================================================

alter table public.chat_conversations
  rename column whatsapp_jid to remote_jid;

alter table public.chat_conversations
  add column if not exists sender_lid text;

alter table public.chat_conversations
  alter column customer_phone drop not null;

comment on column public.chat_conversations.remote_jid is
  'JID técnico bruto da conversa (ex.: 5527999998888@s.whatsapp.net ou <id>@lid), exatamente como recebido do gateway -- identidade estável usada pra reaproveitar/criar conversa e como destino padrão no envio.';
comment on column public.chat_conversations.customer_phone is
  'Telefone real normalizado, só quando resolvido (JID direto @s.whatsapp.net ou LID resolvido via senderPn do Baileys). Nunca um LID. Pode ser nulo.';
comment on column public.chat_conversations.sender_lid is
  'LID do remetente, quando a conversa envolver identidade LID -- nunca exibido ao operador, só técnico/auditoria.';

create index if not exists idx_chat_conversations_remote_jid on public.chat_conversations (connection_id, remote_jid);

-- Corrige o único dado real já gravado errado (o teste da conexão
-- Pedro Teste, antes desta correção): move o LID que estava em
-- customer_phone pra sender_lid, onde pertence. Guardado por id+valor
-- -- não é uma heurística geral, só desfaz esse caso específico já
-- identificado.
update public.chat_conversations
set sender_lid = customer_phone, customer_phone = null
where id = '128d23ee-037e-4499-b71f-29b5371522de' and customer_phone = '77369691910178';
