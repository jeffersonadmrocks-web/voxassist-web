-- ============================================================
-- Resposta com citação na Central de Conversas (Fase 5 do plano de
-- reprodução do protótipo aprovado -- artifact 42ebf5fb).
--
-- reply_to_message_id: auto-referência simples em chat_messages --
-- guarda qual mensagem esta está "respondendo/citando" (mesma ideia
-- visual do quote do WhatsApp: um trecho da mensagem original acima
-- do corpo da resposta). Nullable -- maioria das mensagens não cita
-- nada.
--
-- Escopo desta fase, documentado com honestidade: o gateway externo
-- (voxassist-whatsapp-gateway, Railway, fora deste repositório) não
-- tem nenhum suporte confirmado a citação nativa do WhatsApp (nenhuma
-- referência a "quoted"/"context" em nenhuma function deste repo --
-- confirmado por busca antes de escrever esta migration). Por isso
-- reply_to_message_id é tratado como metadado PRÓPRIO do VoxAssist --
-- aparece pra equipe dentro da Central de Conversas, mas NÃO garante
-- que o cliente veja a citação nativa no WhatsApp dele. Documentar
-- isso é melhor que fingir um recurso não confirmado.
--
-- Integridade: um trigger bloqueia reply_to_message_id apontando pra
-- mensagem de OUTRA conversa -- sem isso, um payload manipulado direto
-- na API poderia ligar mensagens de conversas (e por extensão,
-- clientes) diferentes entre si, vazando contexto indevido.
-- ============================================================

alter table public.chat_messages add column reply_to_message_id uuid;
alter table public.chat_messages add constraint chat_messages_reply_to_message_id_fkey
  FOREIGN KEY (reply_to_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;
CREATE INDEX idx_chat_messages_reply_to ON public.chat_messages USING btree (reply_to_message_id) WHERE (reply_to_message_id IS NOT NULL);

comment on column public.chat_messages.reply_to_message_id is
  'Mensagem que esta está respondendo/citando (metadado do VoxAssist -- não confirma citação nativa no WhatsApp do cliente, ver comentário desta migration). Sempre da MESMA conversation_id -- reforçado por trigger.';

create or replace function public.chat_messages_reply_to_same_conversation() returns trigger
language plpgsql as $$
declare
  v_target_conversation_id uuid;
begin
  if NEW.reply_to_message_id is null then
    return NEW;
  end if;
  select conversation_id into v_target_conversation_id
  from public.chat_messages where id = NEW.reply_to_message_id;
  if v_target_conversation_id is null then
    raise exception 'chat_messages: reply_to_message_id não encontrado.';
  end if;
  if v_target_conversation_id is distinct from NEW.conversation_id then
    raise exception 'chat_messages: reply_to_message_id precisa pertencer à mesma conversation_id.';
  end if;
  return NEW;
end;
$$;

create trigger trg_chat_messages_reply_to_same_conversation
  before insert or update on public.chat_messages
  for each row execute function public.chat_messages_reply_to_same_conversation();
