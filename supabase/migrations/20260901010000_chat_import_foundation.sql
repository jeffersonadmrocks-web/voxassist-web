-- ============================================================
-- Lote 1 da importação inicial do WhatsApp (2026-09-01): tabelas e
-- colunas novas, todas aditivas -- nenhum comportamento existente muda
-- nesta migration. O código (chat-inbound-webhook/chat-send-message)
-- só passa a ler/escrever essas colunas no Lote 4.
--
-- chat_import_runs / chat_contacts seguem o mesmo padrão já usado em
-- integration_sync_runs (log de execução) e electrolux_connections
-- (RLS: GESTOR da empresa lê, só service_role escreve).
-- ============================================================

create table if not exists public.chat_import_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  connection_id uuid not null references public.chat_connections (id) on delete cascade,
  sync_type text not null check (sync_type in ('INICIAL', 'RECUPERACAO')),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'COMPLETED', 'PARTIAL', 'INTERRUPTED', 'FAILED')),
  progress_reported jsonb not null default '{}'::jsonb,
  batches_confirmed integer not null default 0,
  chats_received integer not null default 0,
  contacts_received integer not null default 0,
  messages_received integer not null default 0,
  messages_inserted integer not null default 0,
  messages_duplicate integer not null default 0,
  messages_quarantined integer not null default 0,
  messages_failed integer not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Nunca conteúdo de mensagem, nome ou telefone -- só mensagem técnica segura.
  error_message text
);

create index if not exists idx_chat_import_runs_connection on public.chat_import_runs (connection_id, started_at desc);

alter table public.chat_import_runs enable row level security;

drop policy if exists "GESTOR vê execuções de importação da empresa" on public.chat_import_runs;
create policy "GESTOR vê execuções de importação da empresa"
  on public.chat_import_runs for select
  using (company_id = current_company_id() and current_company_role() = 'GESTOR');

revoke all on table public.chat_import_runs from anon, authenticated;
grant select on table public.chat_import_runs to authenticated;
grant all on table public.chat_import_runs to service_role;

-- ------------------------------------------------------------
-- chat_contacts -- endereço de WhatsApp sem conversa necessariamente
-- aberta (Baileys entrega "contacts" e "chats" como listas distintas).
-- Nunca cria public.clients sozinha -- vínculo é sempre ação manual,
-- registrada em status/client_id, nunca automática.
-- ------------------------------------------------------------
create table if not exists public.chat_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  connection_id uuid not null references public.chat_connections (id) on delete cascade,
  remote_jid text not null,
  sender_lid text,
  customer_phone text,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'NAO_VINCULADO' check (status in ('NAO_VINCULADO', 'VINCULADO_CLIENTE', 'SOMENTE_CONTATO')),
  client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, remote_jid)
);

create index if not exists idx_chat_contacts_company on public.chat_contacts (company_id);
create index if not exists idx_chat_contacts_client on public.chat_contacts (client_id);

comment on column public.chat_contacts.display_name is
  'Nome apresentado pela origem (WhatsApp) -- nunca promovido a cliente automaticamente.';
comment on column public.chat_contacts.customer_phone is
  'Telefone real normalizado, só quando resolvido. Nunca um LID. Pode ser nulo -- mesma regra de chat_conversations.customer_phone.';

alter table public.chat_contacts enable row level security;

-- Mesmo escopo de chat_conversations: GESTOR/ATENDENTE veem tudo da
-- empresa; TECNICO só teria acesso se algum dia um contato for
-- vinculado a uma OS dele -- hoje chat_contacts não tem esse vínculo,
-- então fica restrito a GESTOR/ATENDENTE.
drop policy if exists "GESTOR/ATENDENTE veem contatos de WhatsApp" on public.chat_contacts;
create policy "GESTOR/ATENDENTE veem contatos de WhatsApp"
  on public.chat_contacts for select
  using (company_id = current_company_id() and current_company_role() = any (array['GESTOR', 'ATENDENTE']));

drop policy if exists "GESTOR/ATENDENTE vinculam contato de WhatsApp" on public.chat_contacts;
create policy "GESTOR/ATENDENTE vinculam contato de WhatsApp"
  on public.chat_contacts for update
  using (company_id = current_company_id() and current_company_role() = any (array['GESTOR', 'ATENDENTE']))
  with check (company_id = current_company_id() and current_company_role() = any (array['GESTOR', 'ATENDENTE']));

revoke all on table public.chat_contacts from anon;
grant select, update on table public.chat_contacts to authenticated;
grant all on table public.chat_contacts to service_role;

-- ------------------------------------------------------------
-- chat_messages -- colunas novas, todas nullable/default seguro.
-- provider_message_id é CÓPIA do valor de external_message_id (nunca
-- edita/reescreve o original) -- external_message_id fica deprecated
-- por 1 release, removida só num lote de limpeza posterior depois do
-- cutover confirmado.
-- ------------------------------------------------------------
alter table public.chat_messages
  add column if not exists connection_id uuid references public.chat_connections (id) on delete set null,
  add column if not exists remote_jid text,
  add column if not exists from_me boolean,
  add column if not exists provider_message_id text,
  add column if not exists origin text not null default 'REALTIME',
  add column if not exists original_timestamp timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text,
  add column if not exists media_status text,
  add column if not exists media_storage_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_size_bytes bigint;

alter table public.chat_messages drop constraint if exists chat_messages_origin_check;
alter table public.chat_messages add constraint chat_messages_origin_check
  check (origin in ('REALTIME', 'IMPORT'));

alter table public.chat_messages drop constraint if exists chat_messages_media_status_check;
alter table public.chat_messages add constraint chat_messages_media_status_check
  check (media_status is null or media_status in ('DISPONIVEL', 'BAIXANDO', 'ARMAZENADA', 'INDISPONIVEL', 'FALHA_DOWNLOAD'));

comment on column public.chat_messages.provider_message_id is
  'ID bruto original do WhatsApp/Baileys -- cópia de external_message_id (deprecated), nunca modificado. Chave de dedup real é (connection_id, remote_jid, from_me, provider_message_id), criada no Lote 2.';
comment on column public.chat_messages.external_message_id is
  'DEPRECATED -- mantida em paralelo com provider_message_id até o cutover do dedup composto (Lote 2) ser confirmado. Não remover sem migrar todo consumidor.';
comment on column public.chat_messages.origin is
  'REALTIME = chegou pelo webhook em tempo real. IMPORT = veio da importação de histórico -- nunca dispara robô/SLA/fila/notificação/reabertura.';
comment on column public.chat_messages.original_timestamp is
  'Data/hora real da mensagem no WhatsApp (Baileys). created_at continua sendo o momento de ingestão no VoxAssist.';

-- Backfill das 3 linhas reais existentes (todas REALTIME, sem mídia,
-- sem exclusão) -- conversation_id já resolve connection_id/remote_jid.
update public.chat_messages m
set
  connection_id = c.connection_id,
  remote_jid = c.remote_jid,
  from_me = (m.direction = 'OUTBOUND'),
  provider_message_id = m.external_message_id,
  original_timestamp = coalesce(m.original_timestamp, m.created_at)
from public.chat_conversations c
where c.id = m.conversation_id
  and m.connection_id is null;

-- Estado "aguardando envio" -- ausente hoje (gap real confirmado
-- contra o schema live antes desta migration).
alter table public.chat_messages drop constraint if exists chat_messages_status_check;
alter table public.chat_messages add constraint chat_messages_status_check
  check (status in ('AGUARDANDO_ENVIO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU'));

-- Tipos adicionais que o parser de importação precisa reconhecer sem
-- bloquear o lote -- UNKNOWN é o marcador seguro pra tipo não mapeado.
alter table public.chat_messages drop constraint if exists chat_messages_message_type_check;
alter table public.chat_messages add constraint chat_messages_message_type_check
  check (message_type in ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'REACTION', 'QUOTE', 'UNKNOWN', 'OTHER'));

-- ------------------------------------------------------------
-- chat_conversations -- estado neutro pra conversa nascida só do
-- histórico (nunca entra na fila operacional sozinha).
-- ------------------------------------------------------------
alter table public.chat_conversations drop constraint if exists chat_conversations_status_check;
alter table public.chat_conversations add constraint chat_conversations_status_check
  check (status in ('ARQUIVADA', 'ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'FINALIZADA'));

comment on constraint chat_conversations_status_check on public.chat_conversations is
  'ARQUIVADA = conversa que existe só por histórico importado, nunca teve mensagem REALTIME -- fora da fila operacional até chegar mensagem real ou ação de atendente.';
