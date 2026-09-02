-- ============================================================
-- Anexos na Central de Conversas (Fase 6 do plano de reprodução do
-- protótipo aprovado -- artifact 42ebf5fb) -- LADO SEGURO apenas.
--
-- Escopo desta migration, alinhado à decisão explícita do usuário em
-- 2026-09-02: implementar agora o armazenamento/exibição de anexos
-- dentro do VoxAssist (upload real, RLS real, limites reais), SEM
-- inventar nem tocar no contrato do gateway externo
-- (voxassist-whatsapp-gateway, Railway) -- não há, em lugar nenhum
-- deste repositório, documentação de como esse gateway envia/recebe
-- mídia (confirmado por investigação antes de escrever esta
-- migration). O envio real ao WhatsApp fica registrado como pendência
-- explícita (ver comentário em chat-beta-v0828.js e no README de
-- pendências) -- NUNCA fingido como concluído.
--
-- Bucket novo `chat-media`, PRIVADO (sem URL pública) -- mesmo padrão
-- já usado de verdade neste projeto para `system3-legacy`
-- (system3-legacy.js: fetch autenticado com apikey+Bearer direto na
-- Storage REST API, nunca supabase-js .storage.from(), nunca URL
-- pública/assinada). Reaproveito o único precedente real que existe
-- no repositório em vez de inventar um novo padrão de upload.
--
-- Caminho do objeto: `${company_id}/${conversation_id}/${arquivo}` --
-- a política de storage usa o 1º segmento do caminho pra isolar por
-- empresa (mesmo nível de isolamento que é a base de todo o resto do
-- schema -- o isolamento fino por conversa/loja já é reforçado pela
-- RLS de chat_messages, que é o portão real pra saber quais linhas
-- (e portanto quais media_storage_path) cada usuário pode ver).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

create policy "chat_media_select_same_company" on storage.objects for SELECT to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = current_company_id()::text);

create policy "chat_media_insert_same_company" on storage.objects for INSERT to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = current_company_id()::text
    and current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text, 'TECNICO'::text])
  );

-- Sem policy de UPDATE/DELETE -- anexo enviado não é editável nem
-- apagável pela aplicação (mesma disciplina de chat_messages, que
-- também não tem DELETE).

-- ---------- limites reais por tipo (defesa em profundidade) ----------
-- Espelha os limites de mídia documentados publicamente pela
-- plataforma WhatsApp Business (não um número inventado): imagem até
-- 5MB, áudio/vídeo até 16MB, documento até 100MB. Validado no cliente
-- ANTES do upload (chat-beta-v0828.js) -- este trigger é a checagem
-- real/autoritativa no banco, defesa contra um payload manipulado
-- direto na API que tentasse gravar media_size_bytes fora do limite.
create or replace function public.chat_messages_media_limits_check() returns trigger
language plpgsql as $$
declare
  v_limit bigint;
begin
  if NEW.media_size_bytes is null then
    return NEW;
  end if;
  v_limit := case NEW.message_type
    when 'IMAGE' then 5*1024*1024
    when 'AUDIO' then 16*1024*1024
    when 'VIDEO' then 16*1024*1024
    when 'DOCUMENT' then 100*1024*1024
    else null
  end;
  if v_limit is null then
    raise exception 'chat_messages: message_type % não aceita anexo de mídia.', NEW.message_type;
  end if;
  if NEW.media_size_bytes > v_limit then
    raise exception 'chat_messages: anexo de % bytes excede o limite de % bytes pra message_type %.', NEW.media_size_bytes, v_limit, NEW.message_type;
  end if;
  if NEW.media_size_bytes <= 0 then
    raise exception 'chat_messages: media_size_bytes precisa ser positivo.';
  end if;
  return NEW;
end;
$$;

create trigger trg_chat_messages_media_limits_check
  before insert or update on public.chat_messages
  for each row execute function public.chat_messages_media_limits_check();

comment on column public.chat_messages.media_storage_path is
  'Caminho do objeto no bucket privado chat-media (formato company_id/conversation_id/arquivo). Acesso sempre via fetch autenticado à Storage REST API (apikey+Bearer), nunca URL pública -- mesmo padrão de system3-legacy.js.';
