-- ============================================================
-- schema.sql -- gerado por introspecção DIRETA do banco real
-- (information_schema + pg_catalog), em 2026-09-01, como parte do
-- Lote 3 do Plano Mestre.
--
-- O schema.sql anterior era fictício: descrevia 4 tabelas em
-- português (profiles, clientes, ordens_servico, historico_os) que o
-- app real nunca usa -- achado confirmado nesta sessão via HANDOFF_
-- CLAUDE_CODE.md e auditoria direta. Este arquivo substitui aquele
-- pelas 59 tabelas reais do schema public, com colunas,
-- constraints, índices e políticas de RLS exatamente como estão no
-- banco vivo (projeto dgasmtvpgifceyqufcfg) no momento da geração.
--
-- Não é pg_dump (Docker indisponível neste ambiente) -- é reconstruído
-- via introspecção SQL, então pode não ser 100% idêntico em sintaxe a
-- um dump real em casos extremos (tipos de domínio, colunas geradas),
-- mas reflete fielmente nomes, tipos, nullability, defaults,
-- constraints, índices e RLS. NÃO é uma migration -- é um retrato de
-- leitura, não deve ser executado para recriar o banco.
--
-- Achado real (2026-09-01): TODAS as 59 tabelas do schema
-- public já têm RLS habilitada -- inclusive companies, user_companies,
-- clients, equipments, appointments, stores, service_orders, profiles,
-- que uma auditoria anterior (baseada só nos arquivos versionados do
-- repositório, sem acesso ao banco) tinha classificado como "sem RLS
-- confirmada". As políticas reais usam current_company_id()/
-- current_company_role() corretamente -- o modelo certo já está em
-- produção, só nunca foi capturado em nenhuma migration versionada
-- deste repositório. Corrige esse achado anterior.
-- ============================================================

create table if not exists public.app_launch_audit (
  id uuid not null default gen_random_uuid(),
  requested_slug text not null,
  app_id uuid,
  user_id uuid,
  company_id uuid,
  result text not null,
  reason text,
  origin text,
  created_at timestamptz not null default now()
);
alter table public.app_launch_audit add constraint app_launch_audit_pkey PRIMARY KEY (id);
alter table public.app_launch_audit add constraint app_launch_audit_app_id_fkey FOREIGN KEY (app_id) REFERENCES integrated_apps(id) ON DELETE SET NULL;
alter table public.app_launch_audit add constraint app_launch_audit_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
alter table public.app_launch_audit add constraint app_launch_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.app_launch_audit add constraint app_launch_audit_result_check CHECK ((result = ANY (ARRAY['SUCCESS'::text, 'BLOCKED'::text, 'ERROR'::text])));
CREATE INDEX idx_app_launch_audit_slug ON public.app_launch_audit USING btree (requested_slug, created_at DESC);
CREATE INDEX idx_app_launch_audit_user ON public.app_launch_audit USING btree (user_id, created_at DESC);
alter table public.app_launch_audit enable row level security;
create policy "Gestor vê auditoria de launch de apps" on public.app_launch_audit for SELECT to authenticated
  using (((company_id = current_company_id()) AND (current_company_role() = 'GESTOR'::text)));

create table if not exists public.appointment_history (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  appointment_id uuid not null,
  service_order_id uuid not null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table public.appointment_history add constraint appointment_history_pkey PRIMARY KEY (id);
alter table public.appointment_history add constraint appointment_history_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;
alter table public.appointment_history add constraint appointment_history_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.appointment_history add constraint appointment_history_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
CREATE INDEX idx_appointment_history_appointment ON public.appointment_history USING btree (appointment_id, changed_at DESC);
alter table public.appointment_history enable row level security;
create policy "appointment_history_company" on public.appointment_history for ALL
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.appointments (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid not null,
  technician_id uuid,
  appointment_date date,
  period text,
  start_time time without time zone,
  end_time time without time zone,
  status text not null default 'ABERTO'::text,
  important_alert text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_note text,
  address_note text,
  cancelled_reason text,
  completed_at timestamptz,
  route_order integer not null default 999,
  duration_minutes integer not null default 50,
  appointment_type text,
  missed_reason text,
  completed_by uuid,
  updated_by uuid,
  customer_signature text,
  technician_signature text,
  execution_notes text,
  customer_signed_at timestamptz,
  technician_signed_at timestamptz
);
alter table public.appointments add constraint appointments_pkey PRIMARY KEY (id);
alter table public.appointments add constraint appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.appointments add constraint appointments_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.appointments add constraint appointments_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES profiles(id);
alter table public.appointments add constraint appointments_period_check CHECK ((period = ANY (ARRAY['MANHA'::text, 'TARDE'::text, 'HORARIO_COMERCIAL'::text, 'HORARIO_ESPECIFICO'::text])));
CREATE INDEX appointments_tech_date_idx ON public.appointments USING btree (technician_id, appointment_date);
CREATE INDEX idx_appointments_date_tech_period ON public.appointments USING btree (appointment_date, technician_id, period, route_order);
alter table public.appointments enable row level security;
create policy "appointments_company" on public.appointments for ALL to authenticated
  using (((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = appointments.service_order_id) AND (o.company_id = current_company_id())))) AND ((COALESCE(current_company_role(), 'ATENDENTE'::text) <> 'TECNICO'::text) OR (technician_id = auth.uid()))))
  with check (((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = appointments.service_order_id) AND (o.company_id = current_company_id())))) AND ((COALESCE(current_company_role(), 'ATENDENTE'::text) <> 'TECNICO'::text) OR (technician_id = auth.uid()))));

create table if not exists public.attachments (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid,
  client_id uuid,
  category text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  source text default 'WEB'::text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.attachments add constraint attachments_pkey PRIMARY KEY (id);
alter table public.attachments add constraint attachments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.attachments add constraint attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.attachments add constraint attachments_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.attachments enable row level security;
create policy "attachments_company" on public.attachments for ALL to authenticated
  using ((((service_order_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = attachments.service_order_id) AND (o.company_id = current_company_id()))))) OR ((client_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = attachments.client_id) AND (c.company_id = current_company_id())))))))
  with check ((((service_order_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = attachments.service_order_id) AND (o.company_id = current_company_id()))))) OR ((client_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = attachments.client_id) AND (c.company_id = current_company_id())))))));

create table if not exists public.audit_log (
  id bigint not null,
  user_id uuid,
  area text not null,
  action text not null,
  entity_type text,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  company_id uuid
);
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.audit_log add constraint audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.audit_log add constraint audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.audit_log enable row level security;
create policy "audit_log_company" on public.audit_log for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.chat_connections (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid,
  name text not null,
  provider text not null default 'WHATSAPP_QR'::text,
  status text not null default 'DESCONECTADO'::text,
  phone_number text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_version text,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz
);
alter table public.chat_connections add constraint chat_connections_pkey PRIMARY KEY (id);
alter table public.chat_connections add constraint chat_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_connections add constraint chat_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.chat_connections add constraint chat_connections_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
alter table public.chat_connections add constraint chat_connections_provider_check CHECK ((provider = ANY (ARRAY['WHATSAPP_QR'::text, 'META_CLOUD_API'::text])));
alter table public.chat_connections add constraint chat_connections_status_check CHECK ((status = ANY (ARRAY['DESCONECTADO'::text, 'CONECTANDO'::text, 'QR_REQUIRED'::text, 'CONECTADO'::text, 'RECONNECTING'::text, 'SESSION_INVALID'::text, 'ERRO'::text])));
CREATE INDEX idx_chat_connections_company ON public.chat_connections USING btree (company_id);
alter table public.chat_connections enable row level security;
create policy "Somente GESTOR administra conexões de chat" on public.chat_connections for ALL
  using (((company_id = current_company_id()) AND (current_company_role() = 'GESTOR'::text)))
  with check (((company_id = current_company_id()) AND (current_company_role() = 'GESTOR'::text)));
create policy "Usuários da empresa veem as conexões de chat" on public.chat_connections for SELECT
  using ((company_id = current_company_id()));

create table if not exists public.chat_contacts (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null,
  remote_jid text not null,
  sender_lid text,
  customer_phone text,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'NAO_VINCULADO'::text,
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.chat_contacts add constraint chat_contacts_pkey PRIMARY KEY (id);
alter table public.chat_contacts add constraint chat_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public.chat_contacts add constraint chat_contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_contacts add constraint chat_contacts_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES chat_connections(id) ON DELETE CASCADE;
alter table public.chat_contacts add constraint chat_contacts_connection_id_remote_jid_key UNIQUE (connection_id, remote_jid);
alter table public.chat_contacts add constraint chat_contacts_status_check CHECK ((status = ANY (ARRAY['NAO_VINCULADO'::text, 'VINCULADO_CLIENTE'::text, 'SOMENTE_CONTATO'::text])));
CREATE INDEX idx_chat_contacts_client ON public.chat_contacts USING btree (client_id);
CREATE INDEX idx_chat_contacts_company ON public.chat_contacts USING btree (company_id);
alter table public.chat_contacts enable row level security;
create policy "GESTOR/ATENDENTE veem contatos de WhatsApp" on public.chat_contacts for SELECT
  using (((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text]))));
create policy "GESTOR/ATENDENTE vinculam contato de WhatsApp" on public.chat_contacts for UPDATE
  using (((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text]))))
  with check (((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text]))));

create table if not exists public.chat_conversation_events (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  conversation_id uuid not null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_by uuid,
  created_at timestamptz not null default now()
);
alter table public.chat_conversation_events add constraint chat_conversation_events_pkey PRIMARY KEY (id);
alter table public.chat_conversation_events add constraint chat_conversation_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.chat_conversation_events add constraint chat_conversation_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_conversation_events add constraint chat_conversation_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
CREATE INDEX idx_chat_conversation_events_conversation ON public.chat_conversation_events USING btree (conversation_id, created_at DESC);
alter table public.chat_conversation_events enable row level security;
create policy "Escopo de visualização de auditoria de conversas" on public.chat_conversation_events for SELECT
  using (((company_id = current_company_id()) AND (EXISTS ( SELECT 1
   FROM chat_conversations c
  WHERE ((c.id = chat_conversation_events.conversation_id) AND ((current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])) OR ((current_company_role() = 'TECNICO'::text) AND ((c.assigned_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM service_orders so
          WHERE ((so.id = c.service_order_id) AND (so.technician_id = auth.uid()))))))))))));
create policy "GESTOR/ATENDENTE registram evento de conversa" on public.chat_conversation_events for INSERT
  with check (((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text]))));

create table if not exists public.chat_conversations (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  current_store_id uuid,
  connection_id uuid,
  client_id uuid,
  service_order_id uuid,
  customer_phone text,
  customer_name text,
  status text not null default 'ABERTA'::text,
  assigned_user_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  remote_jid text,
  sender_lid text,
  last_away_sent_at timestamptz
);
alter table public.chat_conversations add constraint chat_conversations_pkey PRIMARY KEY (id);
alter table public.chat_conversations add constraint chat_conversations_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.chat_conversations add constraint chat_conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public.chat_conversations add constraint chat_conversations_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_conversations add constraint chat_conversations_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES chat_connections(id) ON DELETE SET NULL;
alter table public.chat_conversations add constraint chat_conversations_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE SET NULL;
alter table public.chat_conversations add constraint chat_conversations_store_id_fkey FOREIGN KEY (current_store_id) REFERENCES stores(id) ON DELETE SET NULL;
alter table public.chat_conversations add constraint chat_conversations_status_check CHECK ((status = ANY (ARRAY['ARQUIVADA'::text, 'ABERTA'::text, 'EM_ATENDIMENTO'::text, 'AGUARDANDO_CLIENTE'::text, 'FINALIZADA'::text])));
CREATE INDEX idx_chat_conversations_client ON public.chat_conversations USING btree (client_id);
CREATE INDEX idx_chat_conversations_company ON public.chat_conversations USING btree (company_id, last_message_at DESC);
CREATE INDEX idx_chat_conversations_current_store ON public.chat_conversations USING btree (current_store_id);
CREATE INDEX idx_chat_conversations_os ON public.chat_conversations USING btree (service_order_id);
CREATE INDEX idx_chat_conversations_phone ON public.chat_conversations USING btree (connection_id, customer_phone);
CREATE INDEX idx_chat_conversations_remote_jid ON public.chat_conversations USING btree (connection_id, remote_jid);
alter table public.chat_conversations enable row level security;
create policy "Escopo de visualização da Central de Conversas" on public.chat_conversations for SELECT
  using (((company_id = current_company_id()) AND ((current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])) OR ((current_company_role() = 'TECNICO'::text) AND ((assigned_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = chat_conversations.service_order_id) AND (so.technician_id = auth.uid())))))))));
create policy "GESTOR/ATENDENTE alteram conversas" on public.chat_conversations for UPDATE
  using (((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text]))))
  with check (((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text]))));
create policy "GESTOR/ATENDENTE criam conversas" on public.chat_conversations for INSERT
  with check (((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text]))));

create table if not exists public.chat_import_runs (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null,
  sync_type text not null,
  status text not null default 'RUNNING'::text,
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
  error_message text
);
alter table public.chat_import_runs add constraint chat_import_runs_pkey PRIMARY KEY (id);
alter table public.chat_import_runs add constraint chat_import_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_import_runs add constraint chat_import_runs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES chat_connections(id) ON DELETE CASCADE;
alter table public.chat_import_runs add constraint chat_import_runs_status_check CHECK ((status = ANY (ARRAY['RUNNING'::text, 'COMPLETED'::text, 'PARTIAL'::text, 'INTERRUPTED'::text, 'FAILED'::text])));
alter table public.chat_import_runs add constraint chat_import_runs_sync_type_check CHECK ((sync_type = ANY (ARRAY['INICIAL'::text, 'RECUPERACAO'::text])));
CREATE INDEX idx_chat_import_runs_connection ON public.chat_import_runs USING btree (connection_id, started_at DESC);
alter table public.chat_import_runs enable row level security;
create policy "GESTOR vê execuções de importação da empresa" on public.chat_import_runs for SELECT
  using (((company_id = current_company_id()) AND (current_company_role() = 'GESTOR'::text)));

create table if not exists public.chat_messages (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  conversation_id uuid not null,
  direction text not null,
  sender_user_id uuid,
  body text,
  message_type text not null default 'TEXT'::text,
  external_message_id text,
  status text not null default 'ENVIADA'::text,
  created_at timestamptz not null default now(),
  connection_id uuid,
  remote_jid text,
  from_me boolean,
  provider_message_id text,
  origin text not null default 'REALTIME'::text,
  original_timestamp timestamptz,
  deleted_at timestamptz,
  deleted_reason text,
  media_status text,
  media_storage_path text,
  media_mime_type text,
  media_size_bytes bigint
);
alter table public.chat_messages add constraint chat_messages_pkey PRIMARY KEY (id);
alter table public.chat_messages add constraint chat_messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_messages add constraint chat_messages_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES chat_connections(id) ON DELETE SET NULL;
alter table public.chat_messages add constraint chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_messages add constraint chat_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.chat_messages add constraint chat_messages_direction_check CHECK ((direction = ANY (ARRAY['INBOUND'::text, 'OUTBOUND'::text])));
alter table public.chat_messages add constraint chat_messages_media_status_check CHECK (((media_status IS NULL) OR (media_status = ANY (ARRAY['DISPONIVEL'::text, 'BAIXANDO'::text, 'ARMAZENADA'::text, 'INDISPONIVEL'::text, 'FALHA_DOWNLOAD'::text]))));
alter table public.chat_messages add constraint chat_messages_message_type_check CHECK ((message_type = ANY (ARRAY['TEXT'::text, 'IMAGE'::text, 'AUDIO'::text, 'VIDEO'::text, 'DOCUMENT'::text, 'LOCATION'::text, 'CONTACT'::text, 'REACTION'::text, 'QUOTE'::text, 'UNKNOWN'::text, 'OTHER'::text])));
alter table public.chat_messages add constraint chat_messages_origin_check CHECK ((origin = ANY (ARRAY['REALTIME'::text, 'IMPORT'::text])));
alter table public.chat_messages add constraint chat_messages_status_check CHECK ((status = ANY (ARRAY['AGUARDANDO_ENVIO'::text, 'ENVIADA'::text, 'ENTREGUE'::text, 'LIDA'::text, 'FALHOU'::text])));
CREATE INDEX idx_chat_messages_company ON public.chat_messages USING btree (company_id);
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id, created_at);
CREATE UNIQUE INDEX idx_chat_messages_dedup ON public.chat_messages USING btree (company_id, external_message_id) WHERE (external_message_id IS NOT NULL);
CREATE UNIQUE INDEX idx_chat_messages_dedup_composite ON public.chat_messages USING btree (connection_id, remote_jid, from_me, provider_message_id) WHERE ((provider_message_id IS NOT NULL) AND (remote_jid IS NOT NULL));
alter table public.chat_messages enable row level security;
create policy "Escopo de visualização de mensagens" on public.chat_messages for SELECT
  using (((company_id = current_company_id()) AND (EXISTS ( SELECT 1
   FROM chat_conversations c
  WHERE ((c.id = chat_messages.conversation_id) AND ((current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])) OR ((current_company_role() = 'TECNICO'::text) AND ((c.assigned_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM service_orders so
          WHERE ((so.id = c.service_order_id) AND (so.technician_id = auth.uid()))))))))))));
create policy "GESTOR/ATENDENTE/TECNICO autorizado envia mensagem" on public.chat_messages for INSERT
  with check (((company_id = current_company_id()) AND (EXISTS ( SELECT 1
   FROM chat_conversations c
  WHERE ((c.id = chat_messages.conversation_id) AND ((current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])) OR ((current_company_role() = 'TECNICO'::text) AND ((c.assigned_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM service_orders so
          WHERE ((so.id = c.service_order_id) AND (so.technician_id = auth.uid()))))))))))));

create table if not exists public.client_addresses (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  label text,
  zip_code text,
  address text,
  address_number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  created_at timestamptz default now()
);
alter table public.client_addresses add constraint client_addresses_pkey PRIMARY KEY (id);
alter table public.client_addresses add constraint client_addresses_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.client_addresses enable row level security;
create policy "client_addresses_company" on public.client_addresses for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_addresses.client_id) AND (c.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_addresses.client_id) AND (c.company_id = current_company_id())))));

create table if not exists public.client_phones (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  phone text not null,
  label text,
  created_at timestamptz default now()
);
alter table public.client_phones add constraint client_phones_pkey PRIMARY KEY (id);
alter table public.client_phones add constraint client_phones_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.client_phones enable row level security;
create policy "client_phones_company" on public.client_phones for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_phones.client_id) AND (c.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_phones.client_id) AND (c.company_id = current_company_id())))));

create table if not exists public.clients (
  id uuid not null default gen_random_uuid(),
  name text not null,
  person_type text not null default 'PF'::text,
  document text,
  document_digits text,
  email text,
  phone_primary text,
  phone_secondary text,
  zip_code text,
  address text,
  address_number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  notes_internal text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rg_ie text,
  issuer_uf text,
  birth_opening_date date,
  fantasy_name text,
  contact_responsible text,
  company_id uuid not null
);
alter table public.clients add constraint clients_pkey PRIMARY KEY (id);
alter table public.clients add constraint clients_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.clients add constraint clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.clients add constraint clients_document_unique UNIQUE (document_digits);
alter table public.clients add constraint clients_person_type_check CHECK ((person_type = ANY (ARRAY['PF'::text, 'PJ'::text])));
CREATE UNIQUE INDEX clients_company_document_uidx ON public.clients USING btree (company_id, document_digits) WHERE ((document_digits IS NOT NULL) AND (document_digits <> ''::text));
alter table public.clients enable row level security;
create policy "clients_company" on public.clients for ALL to authenticated
  using (((company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'ATENDENTE'::text) <> 'TECNICO'::text) OR (EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.client_id = clients.id) AND (o.technician_id = auth.uid()) AND (o.company_id = current_company_id())))))))
  with check (((company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'ATENDENTE'::text) <> 'TECNICO'::text) OR (EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.client_id = clients.id) AND (o.technician_id = auth.uid()) AND (o.company_id = current_company_id())))))));

create table if not exists public.companies (
  id uuid not null default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  document text,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  phone text,
  email text,
  zip_code text,
  address text,
  address_number text,
  neighborhood text,
  city text,
  state text,
  state_registration text,
  municipal_registration text,
  cnae_main text,
  tax_regime text,
  special_tax_regime text,
  website text,
  mobile text,
  logo_url text,
  business_hours jsonb not null default '{}'::jsonb,
  document_footer text,
  document_header_note text
);
alter table public.companies add constraint companies_pkey PRIMARY KEY (id);
alter table public.companies add constraint companies_code_key UNIQUE (code);
CREATE UNIQUE INDEX companies_cnpj_digits_unique ON public.companies USING btree (regexp_replace(document, '\\D'::text, ''::text, 'g'::text)) WHERE ((document IS NOT NULL) AND (regexp_replace(document, '\\D'::text, ''::text, 'g'::text) <> ''::text));
alter table public.companies enable row level security;
create policy "companies_insert_gestor" on public.companies for INSERT to authenticated
  with check ((current_company_role() = 'GESTOR'::text));
create policy "companies_select" on public.companies for SELECT to authenticated
  using (((id = current_company_id()) OR (EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = companies.id) AND uc.active)))));
create policy "companies_update_gestor" on public.companies for UPDATE
  using ((EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = companies.id) AND uc.active AND (uc.role = 'GESTOR'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = companies.id) AND uc.active AND (uc.role = 'GESTOR'::text)))));

create table if not exists public.company_holidays (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  holiday_date date not null,
  name text not null,
  work_allowed boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.company_holidays add constraint company_holidays_pkey PRIMARY KEY (id);
alter table public.company_holidays add constraint company_holidays_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.company_holidays add constraint company_holidays_company_id_holiday_date_key UNIQUE (company_id, holiday_date);
alter table public.company_holidays enable row level security;
create policy "company_holidays_company" on public.company_holidays for ALL
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.company_schedule_settings (
  company_id uuid not null,
  work_days int4[] not null default ARRAY[1, 2, 3, 4, 5],
  morning_enabled boolean not null default true,
  afternoon_enabled boolean not null default true,
  default_duration_minutes integer not null default 50,
  morning_capacity_minutes integer not null default 240,
  afternoon_capacity_minutes integer not null default 240,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.company_schedule_settings add constraint company_schedule_settings_pkey PRIMARY KEY (company_id);
alter table public.company_schedule_settings add constraint company_schedule_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.company_schedule_settings enable row level security;
create policy "company_schedule_settings_company" on public.company_schedule_settings for ALL
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.dashboard_cases (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid,
  title text not null,
  message text,
  priority text not null default 'NORMAL'::text,
  status text not null default 'NOVO'::text,
  assigned_to uuid,
  scheduled_for date,
  source text not null default 'MANUAL'::text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.dashboard_cases add constraint dashboard_cases_pkey PRIMARY KEY (id);
alter table public.dashboard_cases add constraint dashboard_cases_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id);
alter table public.dashboard_cases add constraint dashboard_cases_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.dashboard_cases add constraint dashboard_cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.dashboard_cases add constraint dashboard_cases_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
CREATE INDEX idx_dashboard_cases_status ON public.dashboard_cases USING btree (status, scheduled_for);
alter table public.dashboard_cases enable row level security;
create policy "dashboard_cases_company" on public.dashboard_cases for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.electrolux_connections (
  id uuid not null default gen_random_uuid(),
  name text not null,
  filial text not null,
  company_id uuid not null,
  credential_secret_name text,
  active boolean not null default true,
  auth_status text not null default 'NUNCA_TESTADO'::text,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.electrolux_connections add constraint electrolux_connections_pkey PRIMARY KEY (id);
alter table public.electrolux_connections add constraint electrolux_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.electrolux_connections add constraint electrolux_connections_auth_status_check CHECK ((auth_status = ANY (ARRAY['OK'::text, 'FALHA'::text, 'NUNCA_TESTADO'::text])));
alter table public.electrolux_connections add constraint electrolux_connections_filial_check CHECK ((filial = ANY (ARRAY['VITORIA'::text, 'SERRA'::text])));
CREATE UNIQUE INDEX idx_electrolux_connections_active_filial ON public.electrolux_connections USING btree (filial) WHERE active;
alter table public.electrolux_connections enable row level security;

create table if not exists public.equipment_ownership_history (
  id uuid not null default gen_random_uuid(),
  equipment_id uuid not null,
  client_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  changed_by uuid
);
alter table public.equipment_ownership_history add constraint equipment_ownership_history_pkey PRIMARY KEY (id);
alter table public.equipment_ownership_history add constraint equipment_ownership_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id);
alter table public.equipment_ownership_history add constraint equipment_ownership_history_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.equipment_ownership_history add constraint equipment_ownership_history_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE;
alter table public.equipment_ownership_history enable row level security;
create policy "equipment_ownership_company" on public.equipment_ownership_history for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM equipments e
  WHERE ((e.id = equipment_ownership_history.equipment_id) AND (e.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM equipments e
  WHERE ((e.id = equipment_ownership_history.equipment_id) AND (e.company_id = current_company_id())))));

create table if not exists public.equipments (
  id uuid not null default gen_random_uuid(),
  current_client_id uuid not null,
  product_type text not null,
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  invoice_number text,
  invoice_date date,
  warranty_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accessories text,
  purchase_store text,
  contractor text,
  claim_number text,
  document_model text,
  company_id uuid not null
);
alter table public.equipments add constraint equipments_pkey PRIMARY KEY (id);
alter table public.equipments add constraint equipments_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.equipments add constraint equipments_current_client_id_fkey FOREIGN KEY (current_client_id) REFERENCES clients(id);
alter table public.equipments enable row level security;
create policy "equipments_company" on public.equipments for ALL to authenticated
  using (((company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'ATENDENTE'::text) <> 'TECNICO'::text) OR (EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.equipment_id = equipments.id) AND (o.technician_id = auth.uid()) AND (o.company_id = current_company_id())))))))
  with check (((company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'ATENDENTE'::text) <> 'TECNICO'::text) OR (EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.equipment_id = equipments.id) AND (o.technician_id = auth.uid()) AND (o.company_id = current_company_id())))))));

create table if not exists public.external_appointment_history (
  id uuid not null default gen_random_uuid(),
  external_appointment_id uuid not null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_by text not null default 'ELECTROLUX_SYNC'::text,
  synced_at timestamptz not null default now()
);
alter table public.external_appointment_history add constraint external_appointment_history_pkey PRIMARY KEY (id);
alter table public.external_appointment_history add constraint external_appointment_history_external_appointment_id_fkey FOREIGN KEY (external_appointment_id) REFERENCES external_appointments(id) ON DELETE CASCADE;
CREATE INDEX idx_external_appointment_history_appt ON public.external_appointment_history USING btree (external_appointment_id, synced_at DESC);
alter table public.external_appointment_history enable row level security;
create policy "Usuários autenticados veem histórico de compromissos externos" on public.external_appointment_history for SELECT
  using ((EXISTS ( SELECT 1
   FROM external_appointments ea
  WHERE ((ea.id = external_appointment_history.external_appointment_id) AND (ea.company_id = current_company_id())))));

create table if not exists public.external_appointments (
  id uuid not null default gen_random_uuid(),
  origin text not null,
  external_id text not null,
  external_order_number text,
  technician_id uuid,
  appointment_date date,
  period text,
  status text not null default 'ABERTO'::text,
  external_status_raw text,
  external_internal_status text,
  client_name text,
  client_phone text,
  address_street text,
  address_neighborhood text,
  address_city text,
  address_state text,
  notes text,
  external_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  external_created_at timestamptz,
  concluded_at timestamptz,
  nps_missing_count integer not null default 0,
  nps_missing_since timestamptz,
  nps_closed_inferred_at timestamptz,
  company_id uuid,
  connection_id uuid
);
alter table public.external_appointments add constraint external_appointments_pkey PRIMARY KEY (id);
alter table public.external_appointments add constraint external_appointments_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.external_appointments add constraint external_appointments_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES electrolux_connections(id);
alter table public.external_appointments add constraint external_appointments_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.external_appointments add constraint external_appointments_origin_external_id_key UNIQUE (origin, external_id);
alter table public.external_appointments add constraint external_appointments_origin_check CHECK ((origin = 'ELECTROLUX'::text));
alter table public.external_appointments add constraint external_appointments_period_check CHECK ((period = ANY (ARRAY['MANHA'::text, 'TARDE'::text])));
alter table public.external_appointments add constraint external_appointments_status_check CHECK ((status = ANY (ARRAY['ABERTO'::text, 'AGENDADO'::text, 'CONCLUIDO'::text, 'CANCELADO'::text])));
CREATE INDEX idx_external_appointments_company ON public.external_appointments USING btree (company_id);
CREATE INDEX idx_external_appointments_status ON public.external_appointments USING btree (status);
CREATE INDEX idx_external_appointments_tech_date ON public.external_appointments USING btree (technician_id, appointment_date, period);
alter table public.external_appointments enable row level security;
create policy "Usuários autenticados atribuem técnico ao compromisso externo" on public.external_appointments for UPDATE to authenticated
  using (((company_id = current_company_id()) AND (COALESCE(current_company_role(), 'TECNICO'::text) <> 'TECNICO'::text)))
  with check (((company_id = current_company_id()) AND (COALESCE(current_company_role(), 'TECNICO'::text) <> 'TECNICO'::text)));
create policy "Usuários autenticados veem compromissos externos" on public.external_appointments for SELECT to authenticated
  using (((company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'TECNICO'::text) <> 'TECNICO'::text) OR (technician_id = auth.uid()))));

create table if not exists public.external_technician_link_suggestions (
  id uuid not null default gen_random_uuid(),
  origin text not null default 'ELECTROLUX'::text,
  external_technician_id text,
  candidate_name text not null,
  suggested_profile_id uuid,
  status text not null default 'PENDENTE'::text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.external_technician_link_suggestions add constraint external_technician_link_suggestions_pkey PRIMARY KEY (id);
alter table public.external_technician_link_suggestions add constraint external_technician_link_suggestions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.external_technician_link_suggestions add constraint external_technician_link_suggestions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.external_technician_link_suggestions add constraint external_technician_link_suggestions_suggested_profile_id_fkey FOREIGN KEY (suggested_profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.external_technician_link_suggestions add constraint external_technician_link_sugg_origin_external_technician_id_key UNIQUE (origin, external_technician_id, suggested_profile_id);
alter table public.external_technician_link_suggestions add constraint external_technician_link_suggestions_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'VINCULADO'::text, 'SEPARADO'::text])));
alter table public.external_technician_link_suggestions enable row level security;
create policy "Gestor resolve sugestões de vínculo" on public.external_technician_link_suggestions for UPDATE to authenticated
  using (((company_id = current_company_id()) AND (current_company_role() = 'GESTOR'::text)))
  with check (((company_id = current_company_id()) AND (current_company_role() = 'GESTOR'::text)));
create policy "Gestor vê sugestões de vínculo" on public.external_technician_link_suggestions for SELECT to authenticated
  using (((company_id = current_company_id()) AND (current_company_role() = 'GESTOR'::text)));

create table if not exists public.homologation_tests (
  id uuid not null default gen_random_uuid(),
  code text,
  module text not null,
  title text not null,
  classification text not null default 'FUNCAO_NOVA'::text,
  status text not null default 'NAO_TESTADA'::text,
  notes text,
  tested_by uuid,
  tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.homologation_tests add constraint homologation_tests_pkey PRIMARY KEY (id);
alter table public.homologation_tests add constraint homologation_tests_tested_by_fkey FOREIGN KEY (tested_by) REFERENCES profiles(id);
alter table public.homologation_tests add constraint homologation_tests_classification_check CHECK ((classification = ANY (ARRAY['JA_APROVADO_VERIFICAR_MIGRACAO'::text, 'PENDENTE_RETESTE'::text, 'FUNCAO_NOVA'::text])));
alter table public.homologation_tests add constraint homologation_tests_status_check CHECK ((status = ANY (ARRAY['NAO_TESTADA'::text, 'EM_TESTE'::text, 'FALHOU'::text, 'CORRIGIDA'::text, 'RETESTE'::text, 'APROVADA'::text])));
alter table public.homologation_tests enable row level security;
create policy "homologation_tests_delete_gestor" on public.homologation_tests for DELETE to authenticated
  using ((current_company_role() = 'GESTOR'::text));
create policy "homologation_tests_insert_gestor" on public.homologation_tests for INSERT to authenticated
  with check ((current_company_role() = 'GESTOR'::text));
create policy "homologation_tests_read" on public.homologation_tests for SELECT to authenticated
  using (true);
create policy "homologation_tests_update" on public.homologation_tests for UPDATE to authenticated
  using (true)
  with check (true);

create table if not exists public.integrated_apps (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  launch_url text not null,
  icon_key text,
  status text not null default 'active'::text,
  launch_mode text not null default 'external'::text,
  position integer not null default 0,
  roles_allowed text[] not null default '{}'::text[],
  health_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integrated_apps add constraint integrated_apps_pkey PRIMARY KEY (id);
alter table public.integrated_apps add constraint integrated_apps_slug_key UNIQUE (slug);
alter table public.integrated_apps add constraint integrated_apps_launch_mode_check CHECK ((launch_mode = ANY (ARRAY['internal'::text, 'external'::text, 'embedded-trusted'::text])));
alter table public.integrated_apps add constraint integrated_apps_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));
alter table public.integrated_apps enable row level security;

create table if not exists public.integration_sync_runs (
  id uuid not null default gen_random_uuid(),
  origin text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success boolean,
  orders_processed integer not null default 0,
  error_message text,
  promoted_count integer,
  skipped_count integer,
  failed_count integer,
  failed_details jsonb
);
alter table public.integration_sync_runs add constraint integration_sync_runs_pkey PRIMARY KEY (id);
CREATE INDEX idx_integration_sync_runs_origin ON public.integration_sync_runs USING btree (origin, started_at DESC);
alter table public.integration_sync_runs enable row level security;

create table if not exists public.manufacturer_document_templates (
  id uuid not null default gen_random_uuid(),
  manufacturer text not null,
  document_type text not null,
  name text not null,
  active boolean not null default true,
  field_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.manufacturer_document_templates add constraint manufacturer_document_templates_pkey PRIMARY KEY (id);
alter table public.manufacturer_document_templates enable row level security;
create policy "manufacturer_document_templates_read" on public.manufacturer_document_templates for SELECT to authenticated
  using (true);
create policy "manufacturer_document_templates_write_gestor" on public.manufacturer_document_templates for ALL to authenticated
  using ((current_company_role() = 'GESTOR'::text))
  with check ((current_company_role() = 'GESTOR'::text));

create table if not exists public.manufacturer_imports (
  id uuid not null default gen_random_uuid(),
  manufacturer text,
  original_file_path text not null,
  extracted_data jsonb not null default '{}'::jsonb,
  confidence jsonb not null default '{}'::jsonb,
  service_order_id uuid,
  import_status text not null default 'AGUARDANDO_REVISAO'::text,
  created_by uuid,
  created_at timestamptz not null default now(),
  company_id uuid,
  original_file_name text,
  original_file_mime text,
  original_file_data text,
  updated_at timestamptz not null default now()
);
alter table public.manufacturer_imports add constraint manufacturer_imports_pkey PRIMARY KEY (id);
alter table public.manufacturer_imports add constraint manufacturer_imports_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.manufacturer_imports add constraint manufacturer_imports_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.manufacturer_imports add constraint manufacturer_imports_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id);
alter table public.manufacturer_imports enable row level security;
create policy "manufacturer_imports_company" on public.manufacturer_imports for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.nps_case_history (
  id uuid not null default gen_random_uuid(),
  nps_case_id uuid not null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table public.nps_case_history add constraint nps_case_history_pkey PRIMARY KEY (id);
alter table public.nps_case_history add constraint nps_case_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.nps_case_history add constraint nps_case_history_nps_case_id_fkey FOREIGN KEY (nps_case_id) REFERENCES nps_cases(id) ON DELETE CASCADE;
CREATE INDEX idx_nps_case_history_case ON public.nps_case_history USING btree (nps_case_id, changed_at DESC);
alter table public.nps_case_history enable row level security;
create policy "Usuários autenticados veem histórico de NPS" on public.nps_case_history for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM (nps_cases c
     JOIN external_appointments ea ON ((ea.id = c.external_appointment_id)))
  WHERE ((c.id = nps_case_history.nps_case_id) AND (ea.company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'TECNICO'::text) <> 'TECNICO'::text) OR (ea.technician_id = auth.uid()))))));
create policy "nps_case_history_insert_company" on public.nps_case_history for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM ((nps_cases c
     JOIN external_appointments ea ON ((ea.id = c.external_appointment_id)))
     JOIN user_companies uc ON (((uc.user_id = auth.uid()) AND (uc.company_id = ea.company_id))))
  WHERE ((c.id = nps_case_history.nps_case_id) AND (ea.company_id = current_company_id()) AND (uc.active = true) AND (uc.role <> 'TECNICO'::text)))));

create table if not exists public.nps_cases (
  id uuid not null default gen_random_uuid(),
  external_appointment_id uuid not null,
  filial text,
  classification text not null default 'MEDIA'::text,
  situacao text not null default 'AGUARDANDO_ENCERRAMENTO'::text,
  opened_at timestamptz,
  concluded_at timestamptz,
  visit_count integer not null default 1,
  has_complaint boolean not null default false,
  has_return_visit boolean not null default false,
  has_reopening boolean not null default false,
  whatsapp_valid boolean not null default true,
  survey_deadline_at timestamptz,
  responsible_user_id uuid,
  attention_reason text,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closure_inferred_at timestamptz,
  eligible_at timestamptz,
  closure_detection_method text,
  connection_id uuid
);
alter table public.nps_cases add constraint nps_cases_pkey PRIMARY KEY (id);
alter table public.nps_cases add constraint nps_cases_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES electrolux_connections(id);
alter table public.nps_cases add constraint nps_cases_external_appointment_id_fkey FOREIGN KEY (external_appointment_id) REFERENCES external_appointments(id) ON DELETE CASCADE;
alter table public.nps_cases add constraint nps_cases_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.nps_cases add constraint nps_cases_external_appointment_id_key UNIQUE (external_appointment_id);
alter table public.nps_cases add constraint nps_cases_classification_check CHECK ((classification = ANY (ARRAY['ALTA'::text, 'MEDIA'::text, 'ATENCAO'::text, 'NAO_ELEGIVEL'::text])));
alter table public.nps_cases add constraint nps_cases_closure_detection_method_check CHECK (((closure_detection_method IS NULL) OR (closure_detection_method = 'ENCERRAMENTO_POR_AUSENCIA'::text)));
alter table public.nps_cases add constraint nps_cases_filial_check CHECK ((filial = ANY (ARRAY['VITORIA'::text, 'SERRA'::text])));
alter table public.nps_cases add constraint nps_cases_situacao_check CHECK ((situacao = ANY (ARRAY['AGUARDANDO_ENCERRAMENTO'::text, 'AGUARDANDO_PRAZO_NPS'::text, 'AGUARDANDO_CONTATO'::text, 'PRIMEIRO_CONTATO_ENVIADO'::text, 'AGUARDANDO_RESPOSTA'::text, 'LEMBRETE_ENVIADO'::text, 'CLIENTE_CONFIRMOU_RESPOSTA'::text, 'CLIENTE_NAO_RECEBEU'::text, 'CLIENTE_NAO_RESPONDEU'::text, 'CLIENTE_NAO_DESEJA_CONTATO'::text, 'CASO_DE_ATENCAO'::text, 'FINALIZADO'::text])));
CREATE INDEX idx_nps_cases_classification ON public.nps_cases USING btree (classification);
CREATE INDEX idx_nps_cases_eligible_at ON public.nps_cases USING btree (eligible_at) WHERE (situacao = ANY (ARRAY['AGUARDANDO_PRAZO_NPS'::text, 'AGUARDANDO_CONTATO'::text]));
CREATE INDEX idx_nps_cases_responsible ON public.nps_cases USING btree (responsible_user_id);
CREATE INDEX idx_nps_cases_situacao ON public.nps_cases USING btree (situacao);
alter table public.nps_cases enable row level security;
create policy "Gestor e atendente alteram casos de NPS" on public.nps_cases for UPDATE to authenticated
  using (((EXISTS ( SELECT 1
   FROM external_appointments ea
  WHERE ((ea.id = nps_cases.external_appointment_id) AND (ea.company_id = current_company_id())))) AND (COALESCE(current_company_role(), 'TECNICO'::text) <> 'TECNICO'::text)))
  with check (((EXISTS ( SELECT 1
   FROM external_appointments ea
  WHERE ((ea.id = nps_cases.external_appointment_id) AND (ea.company_id = current_company_id())))) AND (COALESCE(current_company_role(), 'TECNICO'::text) <> 'TECNICO'::text)));
create policy "Usuários autenticados veem casos de NPS" on public.nps_cases for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM external_appointments ea
  WHERE ((ea.id = nps_cases.external_appointment_id) AND (ea.company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'TECNICO'::text) <> 'TECNICO'::text) OR (ea.technician_id = auth.uid()))))));

create table if not exists public.nps_contacts (
  id uuid not null default gen_random_uuid(),
  nps_case_id uuid not null,
  contact_type text not null,
  phone_used text not null,
  message_text text not null,
  filial text,
  previous_situacao text,
  new_situacao text,
  observacao text,
  confirmed_response boolean,
  sent_by uuid,
  sent_at timestamptz not null default now()
);
alter table public.nps_contacts add constraint nps_contacts_pkey PRIMARY KEY (id);
alter table public.nps_contacts add constraint nps_contacts_nps_case_id_fkey FOREIGN KEY (nps_case_id) REFERENCES nps_cases(id) ON DELETE CASCADE;
alter table public.nps_contacts add constraint nps_contacts_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.nps_contacts add constraint nps_contacts_contact_type_check CHECK ((contact_type = ANY (ARRAY['PRIMEIRO_CONTATO'::text, 'LEMBRETE'::text])));
CREATE INDEX idx_nps_contacts_case ON public.nps_contacts USING btree (nps_case_id, sent_at DESC);
alter table public.nps_contacts enable row level security;
create policy "Usuários autenticados veem contatos de NPS" on public.nps_contacts for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM (nps_cases c
     JOIN external_appointments ea ON ((ea.id = c.external_appointment_id)))
  WHERE ((c.id = nps_contacts.nps_case_id) AND (ea.company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'TECNICO'::text) <> 'TECNICO'::text) OR (ea.technician_id = auth.uid()))))));
create policy "nps_contacts_insert_company" on public.nps_contacts for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM ((nps_cases c
     JOIN external_appointments ea ON ((ea.id = c.external_appointment_id)))
     JOIN user_companies uc ON (((uc.user_id = auth.uid()) AND (uc.company_id = ea.company_id))))
  WHERE ((c.id = nps_contacts.nps_case_id) AND (ea.company_id = current_company_id()) AND (uc.active = true) AND (uc.role <> 'TECNICO'::text)))));

create table if not exists public.operational_alerts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  operational_task_id uuid,
  alert_type text not null,
  severity text not null,
  status text not null default 'ATIVO'::text,
  message text not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.operational_alerts add constraint operational_alerts_pkey PRIMARY KEY (id);
alter table public.operational_alerts add constraint operational_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.operational_alerts add constraint operational_alerts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.operational_alerts add constraint operational_alerts_operational_task_id_fkey FOREIGN KEY (operational_task_id) REFERENCES operational_tasks(id) ON DELETE SET NULL;
alter table public.operational_alerts add constraint operational_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.operational_alerts add constraint operational_alerts_alert_type_check CHECK ((alert_type = ANY (ARRAY['TASK_STALLED'::text, 'LOW_ACTIVITY'::text, 'DEADLINE_APPROACHING'::text])));
alter table public.operational_alerts add constraint operational_alerts_severity_check CHECK ((severity = ANY (ARRAY['LEMBRETE'::text, 'ATENCAO'::text, 'OCORRENCIA'::text, 'CRITICO'::text])));
alter table public.operational_alerts add constraint operational_alerts_status_check CHECK ((status = ANY (ARRAY['ATIVO'::text, 'RECONHECIDO'::text, 'JUSTIFICADO'::text, 'RESOLVIDO'::text])));
CREATE INDEX idx_operational_alerts_company ON public.operational_alerts USING btree (company_id);
CREATE INDEX idx_operational_alerts_user ON public.operational_alerts USING btree (user_id, status);
alter table public.operational_alerts enable row level security;
create policy "operational_alerts_select_company" on public.operational_alerts for SELECT to authenticated
  using (((company_id = current_company_id()) AND ((user_id = auth.uid()) OR is_company_gestor(company_id))));
create policy "operational_alerts_update_own_company" on public.operational_alerts for UPDATE to authenticated
  using (((company_id = current_company_id()) AND (user_id = auth.uid())))
  with check (((company_id = current_company_id()) AND (user_id = auth.uid())));

create table if not exists public.operational_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  event_type text not null,
  source_table text,
  source_id uuid,
  operational_task_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.operational_events add constraint operational_events_pkey PRIMARY KEY (id);
alter table public.operational_events add constraint operational_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.operational_events add constraint operational_events_operational_task_id_fkey FOREIGN KEY (operational_task_id) REFERENCES operational_tasks(id) ON DELETE SET NULL;
alter table public.operational_events add constraint operational_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX idx_operational_events_company ON public.operational_events USING btree (company_id);
CREATE INDEX idx_operational_events_task ON public.operational_events USING btree (operational_task_id, created_at DESC);
CREATE INDEX idx_operational_events_user ON public.operational_events USING btree (user_id, created_at DESC);
alter table public.operational_events enable row level security;
create policy "operational_events_insert_own_company" on public.operational_events for INSERT to authenticated
  with check (((company_id = current_company_id()) AND (user_id = auth.uid())));
create policy "operational_events_select_company" on public.operational_events for SELECT to authenticated
  using (((company_id = current_company_id()) AND ((user_id = auth.uid()) OR is_company_gestor(company_id))));

create table if not exists public.operational_expectations (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  lembrete_minutes integer not null default 20,
  atencao_minutes integer not null default 30,
  ocorrencia_minutes integer not null default 45,
  critico_minutes integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.operational_expectations add constraint operational_expectations_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX uq_operational_expectations_company ON public.operational_expectations USING btree (company_id);
alter table public.operational_expectations enable row level security;
create policy "operational_expectations_select_company" on public.operational_expectations for SELECT to authenticated
  using ((company_id = current_company_id()));
create policy "operational_expectations_update_gestor_company" on public.operational_expectations for UPDATE to authenticated
  using (((company_id = current_company_id()) AND is_company_gestor(company_id)))
  with check (((company_id = current_company_id()) AND is_company_gestor(company_id)));

create table if not exists public.operational_justifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  operational_alert_id uuid,
  reason_code text not null,
  note text,
  period_start timestamptz not null default now(),
  period_end timestamptz,
  created_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.operational_justifications add constraint operational_justifications_pkey PRIMARY KEY (id);
alter table public.operational_justifications add constraint operational_justifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.operational_justifications add constraint operational_justifications_operational_alert_id_fkey FOREIGN KEY (operational_alert_id) REFERENCES operational_alerts(id) ON DELETE SET NULL;
alter table public.operational_justifications add constraint operational_justifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.operational_justifications add constraint operational_justifications_reason_code_check CHECK ((reason_code = ANY (ARRAY['ATENDIMENTO_PRESENCIAL'::text, 'LIGACAO_EXTENSA'::text, 'REUNIAO_TREINAMENTO'::text, 'ATIVIDADE_EXTERNA'::text, 'PAUSA_AUTORIZADA'::text, 'INDISPONIBILIDADE_TECNICA'::text, 'OUTRO'::text])));
CREATE INDEX idx_operational_justifications_company ON public.operational_justifications USING btree (company_id);
CREATE INDEX idx_operational_justifications_user ON public.operational_justifications USING btree (user_id, period_start, period_end);
alter table public.operational_justifications enable row level security;
create policy "operational_justifications_insert_own_company" on public.operational_justifications for INSERT to authenticated
  with check (((company_id = current_company_id()) AND (user_id = auth.uid())));
create policy "operational_justifications_select_company" on public.operational_justifications for SELECT to authenticated
  using (((company_id = current_company_id()) AND ((user_id = auth.uid()) OR is_company_gestor(company_id))));

create table if not exists public.operational_tasks (
  id uuid not null default gen_random_uuid(),
  origin text not null,
  service_order_id uuid,
  appointment_id uuid,
  nps_case_id uuid,
  title text not null,
  description text,
  responsible_user_id uuid,
  created_by uuid,
  status text not null default 'PENDENTE'::text,
  due_at timestamptz,
  reschedule_count integer not null default 0,
  blocks_user_id uuid,
  attention_flag boolean not null default false,
  awaiting_client_response boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.operational_tasks add constraint operational_tasks_pkey PRIMARY KEY (id);
alter table public.operational_tasks add constraint operational_tasks_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;
alter table public.operational_tasks add constraint operational_tasks_blocks_user_id_fkey FOREIGN KEY (blocks_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.operational_tasks add constraint operational_tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.operational_tasks add constraint operational_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.operational_tasks add constraint operational_tasks_nps_case_id_fkey FOREIGN KEY (nps_case_id) REFERENCES nps_cases(id) ON DELETE CASCADE;
alter table public.operational_tasks add constraint operational_tasks_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.operational_tasks add constraint operational_tasks_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.operational_tasks add constraint operational_tasks_origin_check CHECK ((origin = ANY (ARRAY['OS'::text, 'AGENDA'::text, 'NPS'::text, 'MANUAL'::text])));
alter table public.operational_tasks add constraint operational_tasks_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'EM_ANDAMENTO'::text, 'CONCLUIDA'::text, 'REAGENDADA'::text, 'TRANSFERIDA'::text, 'CANCELADA'::text])));
CREATE INDEX idx_operational_tasks_agenda ON public.operational_tasks USING btree (appointment_id) WHERE (origin = 'AGENDA'::text);
CREATE INDEX idx_operational_tasks_company ON public.operational_tasks USING btree (company_id);
CREATE INDEX idx_operational_tasks_nps ON public.operational_tasks USING btree (nps_case_id) WHERE (origin = 'NPS'::text);
CREATE INDEX idx_operational_tasks_os ON public.operational_tasks USING btree (service_order_id) WHERE (origin = 'OS'::text);
CREATE INDEX idx_operational_tasks_responsible ON public.operational_tasks USING btree (responsible_user_id, status);
alter table public.operational_tasks enable row level security;
create policy "operational_tasks_insert_manual_company" on public.operational_tasks for INSERT to authenticated
  with check (((company_id = current_company_id()) AND (origin = 'MANUAL'::text) AND (created_by = auth.uid()) AND ((responsible_user_id IS NULL) OR (responsible_user_id = auth.uid()))));
create policy "operational_tasks_select_company" on public.operational_tasks for SELECT to authenticated
  using (((company_id = current_company_id()) AND ((responsible_user_id = auth.uid()) OR is_company_gestor(company_id) OR ((responsible_user_id IS NULL) AND (EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = operational_tasks.company_id) AND (uc.active = true) AND (uc.role <> 'TECNICO'::text))))))));
create policy "operational_tasks_update_company" on public.operational_tasks for UPDATE to authenticated
  using (((company_id = current_company_id()) AND ((responsible_user_id = auth.uid()) OR is_company_gestor(company_id))))
  with check (((company_id = current_company_id()) AND ((responsible_user_id = auth.uid()) OR is_company_gestor(company_id))));

create table if not exists public.os_financial (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid not null,
  labor_value numeric not null default 0,
  discount_value numeric not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  freight_value numeric default 0,
  auxiliary_material_value numeric default 0,
  technical_report_value numeric default 0,
  analysis_date date
);
alter table public.os_financial add constraint os_financial_pkey PRIMARY KEY (id);
alter table public.os_financial add constraint os_financial_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.os_financial add constraint os_financial_service_order_id_key UNIQUE (service_order_id);
alter table public.os_financial enable row level security;
create policy "os_financial_company" on public.os_financial for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = os_financial.service_order_id) AND (o.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = os_financial.service_order_id) AND (o.company_id = current_company_id())))));

create table if not exists public.os_parts (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid not null,
  stock_item_id uuid,
  code text,
  description text not null,
  quantity numeric not null default 1,
  unit_value numeric not null default 0,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  brand text,
  move_stock boolean not null default false
);
alter table public.os_parts add constraint os_parts_pkey PRIMARY KEY (id);
alter table public.os_parts add constraint os_parts_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.os_parts add constraint os_parts_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id);
alter table public.os_parts enable row level security;
create policy "os_parts_company" on public.os_parts for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = os_parts.service_order_id) AND (o.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = os_parts.service_order_id) AND (o.company_id = current_company_id())))));

create table if not exists public.os_status_history (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid not null,
  previous_status text,
  new_status text not null,
  change_type text not null default 'AUTOMATICO'::text,
  reason text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table public.os_status_history add constraint os_status_history_pkey PRIMARY KEY (id);
alter table public.os_status_history add constraint os_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id);
alter table public.os_status_history add constraint os_status_history_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.os_status_history add constraint os_status_history_change_type_check CHECK ((change_type = ANY (ARRAY['AUTOMATICO'::text, 'MANUAL'::text])));
alter table public.os_status_history enable row level security;
create policy "os_status_history_company" on public.os_status_history for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = os_status_history.service_order_id) AND (o.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = os_status_history.service_order_id) AND (o.company_id = current_company_id())))));

create table if not exists public.parts_requests (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid,
  description text not null,
  code text,
  quantity numeric not null default 1,
  supplier text,
  order_number text,
  expected_date date,
  status text not null default 'SOLICITADO'::text,
  requested_by uuid,
  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.parts_requests add constraint parts_requests_pkey PRIMARY KEY (id);
alter table public.parts_requests add constraint parts_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id);
alter table public.parts_requests add constraint parts_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.parts_requests add constraint parts_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id);
alter table public.parts_requests add constraint parts_requests_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
CREATE INDEX idx_parts_requests_status ON public.parts_requests USING btree (status, expected_date);
alter table public.parts_requests enable row level security;
create policy "parts_requests_company" on public.parts_requests for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.payments (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid not null,
  amount numeric not null,
  method text not null,
  status text not null default 'PENDENTE'::text,
  due_date date,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  installments integer default 1,
  notes text
);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.payments add constraint payments_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.payments enable row level security;
create policy "payments_company" on public.payments for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = payments.service_order_id) AND (o.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = payments.service_order_id) AND (o.company_id = current_company_id())))));

create table if not exists public.product_groups (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_groups add constraint product_groups_pkey PRIMARY KEY (id);
alter table public.product_groups add constraint product_groups_code_key UNIQUE (code);
alter table public.product_groups enable row level security;
create policy "product_groups_read" on public.product_groups for SELECT to authenticated
  using (true);

create table if not exists public.product_types (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  group_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_types add constraint product_types_pkey PRIMARY KEY (id);
alter table public.product_types add constraint product_types_group_id_fkey FOREIGN KEY (group_id) REFERENCES product_groups(id);
alter table public.product_types add constraint product_types_code_key UNIQUE (code);
alter table public.product_types enable row level security;
create policy "product_types_read" on public.product_types for SELECT to authenticated
  using (true);

create table if not exists public.profiles (
  id uuid not null,
  full_name text not null,
  role text not null,
  store_id uuid,
  external_schedule_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  active_company_id uuid,
  email text,
  signature_data text,
  origin text not null default 'VOXASSIST'::text,
  electrolux_external_id text,
  registration_status text not null default 'ATIVO'::text
);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_active_company_id_fkey FOREIGN KEY (active_company_id) REFERENCES companies(id);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id);
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text, 'TECNICO'::text, 'ESTOQUE'::text, 'FINANCEIRO'::text])));
CREATE UNIQUE INDEX idx_profiles_electrolux_external_id ON public.profiles USING btree (electrolux_external_id) WHERE (electrolux_external_id IS NOT NULL);
alter table public.profiles enable row level security;
create policy "profiles_select_company" on public.profiles for SELECT to authenticated
  using (((id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = profiles.id) AND (uc.company_id = current_company_id()) AND uc.active)))));
create policy "profiles_update_self" on public.profiles for UPDATE to authenticated
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create table if not exists public.service_orders (
  id uuid not null default gen_random_uuid(),
  os_number text not null,
  manufacturer_os_number text,
  manufacturer text,
  client_id uuid not null,
  equipment_id uuid,
  store_id uuid,
  service_type text not null default 'INTERNO'::text,
  product_location text,
  device_condition text,
  reported_defect text,
  diagnosed_defect text,
  technical_service text,
  internal_notes text,
  status text not null default 'AGUARDANDO ANALISE'::text,
  attendant_id uuid,
  technician_id uuid,
  priority text default 'NORMAL'::text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_type text not null default 'FORA DE GARANTIA'::text,
  previous_service_order_id uuid,
  approval_decision text,
  approval_date date,
  rejection_reason text,
  repair_started_at timestamptz,
  ready_at timestamptz,
  delivery_at timestamptz,
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  reactivated_at timestamptz,
  reactivated_by uuid,
  company_id uuid not null
);
alter table public.service_orders add constraint service_orders_pkey PRIMARY KEY (id);
alter table public.service_orders add constraint service_orders_attendant_id_fkey FOREIGN KEY (attendant_id) REFERENCES profiles(id);
alter table public.service_orders add constraint service_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.service_orders add constraint service_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.service_orders add constraint service_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.service_orders add constraint service_orders_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipments(id);
alter table public.service_orders add constraint service_orders_previous_service_order_id_fkey FOREIGN KEY (previous_service_order_id) REFERENCES service_orders(id) ON DELETE SET NULL;
alter table public.service_orders add constraint service_orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id);
alter table public.service_orders add constraint service_orders_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES profiles(id);
alter table public.service_orders add constraint service_orders_service_type_check CHECK ((service_type = ANY (ARRAY['INTERNO'::text, 'EXTERNO'::text])));
CREATE INDEX idx_service_orders_order_type ON public.service_orders USING btree (order_type);
CREATE INDEX idx_service_orders_previous ON public.service_orders USING btree (previous_service_order_id);
CREATE INDEX service_orders_client_idx ON public.service_orders USING btree (client_id);
CREATE UNIQUE INDEX service_orders_company_number_uidx ON public.service_orders USING btree (company_id, os_number);
CREATE INDEX service_orders_manufacturer_idx ON public.service_orders USING btree (manufacturer_os_number);
CREATE INDEX service_orders_status_idx ON public.service_orders USING btree (status);
alter table public.service_orders enable row level security;
create policy "service_orders_company" on public.service_orders for ALL to authenticated
  using (((company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'ATENDENTE'::text) <> 'TECNICO'::text) OR (technician_id = auth.uid()))))
  with check (((company_id = current_company_id()) AND ((COALESCE(current_company_role(), 'ATENDENTE'::text) <> 'TECNICO'::text) OR (technician_id = auth.uid()))));

create table if not exists public.stock_items (
  id uuid not null default gen_random_uuid(),
  code text not null,
  description text not null,
  manufacturer text,
  manufacturer_url text,
  compatible_models text,
  storage_location text,
  fiscal_quantity numeric not null default 0,
  available_quantity numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  product_group text,
  supplier text,
  unit_cost numeric not null default 0,
  reference_price numeric not null default 0,
  photo_url text,
  company_id uuid not null
);
alter table public.stock_items add constraint stock_items_pkey PRIMARY KEY (id);
alter table public.stock_items add constraint stock_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
CREATE UNIQUE INDEX stock_items_company_code_uidx ON public.stock_items USING btree (company_id, code);
alter table public.stock_items enable row level security;
create policy "stock_items_company" on public.stock_items for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.stock_movements (
  id uuid not null default gen_random_uuid(),
  item_id uuid not null,
  movement_type text not null,
  quantity numeric not null,
  technician_id uuid,
  service_order_id uuid,
  fiscal_pending boolean not null default false,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.stock_movements add constraint stock_movements_pkey PRIMARY KEY (id);
alter table public.stock_movements add constraint stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.stock_movements add constraint stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES stock_items(id);
alter table public.stock_movements add constraint stock_movements_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id);
alter table public.stock_movements add constraint stock_movements_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES profiles(id);
alter table public.stock_movements add constraint stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['ENTRADA'::text, 'SAIDA'::text, 'TRANSFERENCIA_TECNICO'::text, 'RETORNO_TECNICO'::text, 'USO_GARANTIA'::text, 'BAIXA_FISCAL_GARANTIA'::text, 'AJUSTE'::text])));
CREATE INDEX idx_stock_movements_item ON public.stock_movements USING btree (item_id);
CREATE INDEX idx_stock_movements_os ON public.stock_movements USING btree (service_order_id);
CREATE INDEX idx_stock_movements_tech ON public.stock_movements USING btree (technician_id);
alter table public.stock_movements enable row level security;
create policy "stock_movements_company" on public.stock_movements for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM stock_items i
  WHERE ((i.id = stock_movements.item_id) AND (i.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM stock_items i
  WHERE ((i.id = stock_movements.item_id) AND (i.company_id = current_company_id())))));

create table if not exists public.stores (
  id uuid not null default gen_random_uuid(),
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.stores add constraint stores_pkey PRIMARY KEY (id);
alter table public.stores add constraint stores_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.stores add constraint stores_code_key UNIQUE (code);
alter table public.stores enable row level security;
create policy "stores_company" on public.stores for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));
create policy "stores_gestor_all_linked" on public.stores for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = stores.company_id) AND (uc.active = true) AND (uc.role = 'GESTOR'::text)))));

create table if not exists public.system3_legacy_files (
  id uuid not null default gen_random_uuid(),
  file_name text not null,
  storage_path text not null,
  file_type text,
  file_size bigint,
  checksum text,
  imported_at timestamptz not null default now(),
  imported_by uuid,
  status text not null default 'PENDENTE'::text,
  notes text,
  company_id uuid
);
alter table public.system3_legacy_files add constraint system3_legacy_files_pkey PRIMARY KEY (id);
alter table public.system3_legacy_files add constraint system3_legacy_files_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.system3_legacy_files add constraint system3_legacy_files_imported_by_fkey FOREIGN KEY (imported_by) REFERENCES auth.users(id);
alter table public.system3_legacy_files enable row level security;
create policy "system3_files_company_read" on public.system3_legacy_files for SELECT to authenticated
  using ((company_id = current_company_id()));
create policy "system3_files_company_write" on public.system3_legacy_files for ALL to authenticated
  using (((company_id = current_company_id()) AND is_company_gestor(company_id)))
  with check (((company_id = current_company_id()) AND is_company_gestor(company_id)));

create table if not exists public.system3_legacy_records (
  id uuid not null default gen_random_uuid(),
  source_file_id uuid,
  source_table text,
  source_key text,
  record_type text,
  client_name text,
  document text,
  phone text,
  os_number text,
  product_type text,
  brand text,
  model text,
  serial_number text,
  opened_at timestamptz,
  closed_at timestamptz,
  status text,
  searchable_text text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  company_id uuid
);
alter table public.system3_legacy_records add constraint system3_legacy_records_pkey PRIMARY KEY (id);
alter table public.system3_legacy_records add constraint system3_legacy_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.system3_legacy_records add constraint system3_legacy_records_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES system3_legacy_files(id) ON DELETE CASCADE;
CREATE INDEX idx_system3_legacy_records_client ON public.system3_legacy_records USING btree (client_name);
CREATE INDEX idx_system3_legacy_records_document ON public.system3_legacy_records USING btree (document);
CREATE INDEX idx_system3_legacy_records_os ON public.system3_legacy_records USING btree (os_number);
CREATE INDEX idx_system3_legacy_records_phone ON public.system3_legacy_records USING btree (phone);
CREATE INDEX idx_system3_legacy_records_searchable ON public.system3_legacy_records USING gin (to_tsvector('simple'::regconfig, COALESCE(searchable_text, ''::text)));
CREATE INDEX idx_system3_legacy_records_serial ON public.system3_legacy_records USING btree (serial_number);
alter table public.system3_legacy_records enable row level security;
create policy "system3_records_company_read" on public.system3_legacy_records for SELECT to authenticated
  using ((company_id = current_company_id()));
create policy "system3_records_company_write" on public.system3_legacy_records for ALL to authenticated
  using (((company_id = current_company_id()) AND is_company_gestor(company_id)))
  with check (((company_id = current_company_id()) AND is_company_gestor(company_id)));

create table if not exists public.tasks (
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid,
  created_by uuid,
  service_order_id uuid,
  priority text not null default 'NORMAL'::text,
  due_at timestamptz,
  status text not null default 'PENDENTE'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null
);
alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);
alter table public.tasks add constraint tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id);
alter table public.tasks add constraint tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.tasks add constraint tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.tasks add constraint tasks_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.tasks enable row level security;
create policy "tasks_company" on public.tasks for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.technical_documents (
  id uuid not null default gen_random_uuid(),
  product_type text,
  brand text,
  model text,
  doc_type text not null,
  title text,
  status text default 'NAO CADASTRADO'::text,
  url text,
  created_by uuid,
  created_at timestamptz default now()
);
alter table public.technical_documents add constraint technical_documents_pkey PRIMARY KEY (id);
alter table public.technical_documents add constraint technical_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.technical_documents enable row level security;
create policy "technical_documents_read" on public.technical_documents for SELECT to authenticated
  using (true);
create policy "technical_documents_write_gestor" on public.technical_documents for ALL to authenticated
  using ((current_company_role() = 'GESTOR'::text))
  with check ((current_company_role() = 'GESTOR'::text));

create table if not exists public.technician_schedule_blocks (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  technician_id uuid not null,
  block_date date not null,
  period text not null default 'DIA_INTEIRO'::text,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.technician_schedule_blocks add constraint technician_schedule_blocks_pkey PRIMARY KEY (id);
alter table public.technician_schedule_blocks add constraint technician_schedule_blocks_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.technician_schedule_blocks add constraint technician_schedule_blocks_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.technician_schedule_blocks add constraint technician_schedule_blocks_period_check CHECK ((period = ANY (ARRAY['MANHA'::text, 'TARDE'::text, 'DIA_INTEIRO'::text])));
CREATE INDEX idx_schedule_blocks_date_tech ON public.technician_schedule_blocks USING btree (block_date, technician_id);
alter table public.technician_schedule_blocks enable row level security;
create policy "technician_schedule_blocks_company" on public.technician_schedule_blocks for ALL
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.technician_stock (
  id uuid not null default gen_random_uuid(),
  technician_id uuid not null,
  stock_item_id uuid not null,
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  company_id uuid
);
alter table public.technician_stock add constraint technician_stock_pkey PRIMARY KEY (id);
alter table public.technician_stock add constraint technician_stock_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.technician_stock add constraint technician_stock_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
alter table public.technician_stock add constraint technician_stock_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.technician_stock add constraint technician_stock_technician_id_stock_item_id_key UNIQUE (technician_id, stock_item_id);
alter table public.technician_stock add constraint technician_stock_quantity_check CHECK ((quantity >= (0)::numeric));
CREATE INDEX idx_technician_stock_tech ON public.technician_stock USING btree (technician_id);
alter table public.technician_stock enable row level security;
create policy "technician_stock_company" on public.technician_stock for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.user_companies (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null,
  role text not null,
  store_id uuid,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.user_companies add constraint user_companies_pkey PRIMARY KEY (id);
alter table public.user_companies add constraint user_companies_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.user_companies add constraint user_companies_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id);
alter table public.user_companies add constraint user_companies_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.user_companies add constraint user_companies_user_id_company_id_key UNIQUE (user_id, company_id);
alter table public.user_companies add constraint user_companies_role_check CHECK ((role = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text, 'TECNICO'::text, 'ESTOQUE'::text, 'FINANCEIRO'::text])));
alter table public.user_companies enable row level security;
create policy "user_companies_select" on public.user_companies for SELECT to authenticated
  using (((user_id = auth.uid()) OR (company_id = current_company_id())));

create table if not exists public.user_permissions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  permission_key text not null,
  allowed boolean not null default false,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  company_id uuid
);
alter table public.user_permissions add constraint user_permissions_pkey PRIMARY KEY (id);
alter table public.user_permissions add constraint user_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.user_permissions add constraint user_permissions_user_id_permission_key_key UNIQUE (user_id, permission_key);
CREATE INDEX idx_user_permissions_key ON public.user_permissions USING btree (permission_key);
CREATE INDEX idx_user_permissions_user ON public.user_permissions USING btree (user_id);
alter table public.user_permissions enable row level security;
create policy "user_permissions_company" on public.user_permissions for ALL to authenticated
  using ((company_id = current_company_id()))
  with check ((company_id = current_company_id()));

create table if not exists public.user_store_access (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null,
  store_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.user_store_access add constraint user_store_access_pkey PRIMARY KEY (id);
alter table public.user_store_access add constraint user_store_access_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.user_store_access add constraint user_store_access_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
alter table public.user_store_access add constraint user_store_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.user_store_access add constraint user_store_access_user_id_company_id_store_id_key UNIQUE (user_id, company_id, store_id);
alter table public.user_store_access enable row level security;
create policy "user_store_access_select" on public.user_store_access for SELECT
  using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = user_store_access.company_id) AND (uc.role = 'GESTOR'::text) AND (uc.active = true))))));

create table if not exists public.whatsapp_history (
  id uuid not null default gen_random_uuid(),
  service_order_id uuid not null,
  phone text not null,
  message_template text,
  message_body text,
  sent_documents jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_history add constraint whatsapp_history_pkey PRIMARY KEY (id);
alter table public.whatsapp_history add constraint whatsapp_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.whatsapp_history add constraint whatsapp_history_service_order_id_fkey FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;
alter table public.whatsapp_history enable row level security;
create policy "whatsapp_history_company" on public.whatsapp_history for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = whatsapp_history.service_order_id) AND (o.company_id = current_company_id())))))
  with check ((EXISTS ( SELECT 1
   FROM service_orders o
  WHERE ((o.id = whatsapp_history.service_order_id) AND (o.company_id = current_company_id())))));

