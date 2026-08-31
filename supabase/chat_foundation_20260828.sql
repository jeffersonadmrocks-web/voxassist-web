-- ============================================================
-- Fundação do Chat VoxAssist (ETAPA B) — schema/migrations, sem nenhuma
-- lógica de provider WhatsApp ainda (isso é ETAPA C, decidida depois da
-- hospedagem do processo persistente). Arquitetura:
--   VOXASSIST → CHAT VOXASSIST → MessagingService → MessagingProvider
--   → WhatsAppQrProvider (futuro) / MetaCloudApiProvider (futuro)
--
-- Segue à risca o padrão de isolamento multiempresa já comprovado em
-- electrolux_company_isolation_fix_20260828.sql: toda tabela nasce com
-- company_id (não organization_id — o schema real deste projeto usa
-- companies/current_company_id(), nunca foi migrado pra
-- organizations/branches, e essa não é a hora de fazer essa migração
-- separada só porque o Chat é novo) e RLS via current_company_id(),
-- desde esta primeira migration. store_id existe como dado (pra
-- "Conexões" por filial, item 5 da diretriz) mas não é limite de RLS —
-- mesmo critério já usado em external_appointments, onde o limite
-- comprovado é a empresa, não a loja (GESTOR/ATENDENTE já enxergam
-- entre lojas da mesma empresa em outros módulos).
--
-- current_company_id() já existe no banco (usada e comprovada em
-- electrolux_company_isolation_fix_20260828.sql) — não é redefinida
-- aqui. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- chat_connections — uma conexão de mensageria por filial (WhatsApp
-- primeiro; provider é só um rótulo, sem nenhum campo específico de
-- Baileys/Meta ainda). status começa sempre DESCONECTADO — nenhuma
-- conexão real existe até a ETAPA C.
-- ------------------------------------------------------------
create table if not exists public.chat_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  name text not null,
  provider text not null default 'WHATSAPP_QR' check (provider in ('WHATSAPP_QR', 'META_CLOUD_API')),
  status text not null default 'DESCONECTADO' check (status in ('DESCONECTADO', 'CONECTANDO', 'CONECTADO', 'ERRO')),
  phone_number text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_connections_company on public.chat_connections (company_id);

alter table public.chat_connections enable row level security;

drop policy if exists "Usuários da empresa veem as conexões de chat" on public.chat_connections;
create policy "Usuários da empresa veem as conexões de chat"
  on public.chat_connections for select
  using (company_id = current_company_id());

drop policy if exists "Somente GESTOR administra conexões de chat" on public.chat_connections;
create policy "Somente GESTOR administra conexões de chat"
  on public.chat_connections for all
  using (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR')
  )
  with check (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR')
  );

-- ------------------------------------------------------------
-- chat_conversations — Central de Conversas. Vínculo opcional com
-- clients/service_orders (item 6 da diretriz: "identificação do cliente
-- pelo telefone", "vínculo conversa ↔ cliente", "vínculo conversa ↔
-- OS") — opcional porque uma conversa pode chegar de um número ainda
-- não cadastrado como cliente.
-- ------------------------------------------------------------
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  connection_id uuid references public.chat_connections (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  service_order_id uuid references public.service_orders (id) on delete set null,
  customer_phone text not null,
  customer_name text,
  status text not null default 'ABERTA' check (status in ('ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'FINALIZADA')),
  assigned_user_id uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_conversations_company on public.chat_conversations (company_id, last_message_at desc);
create index if not exists idx_chat_conversations_phone on public.chat_conversations (connection_id, customer_phone);
create index if not exists idx_chat_conversations_client on public.chat_conversations (client_id);
create index if not exists idx_chat_conversations_os on public.chat_conversations (service_order_id);

alter table public.chat_conversations enable row level security;

-- GESTOR/ATENDENTE veem todas as conversas da empresa ativa. TÉCNICO só
-- vê a conversa atribuída a ele ou vinculada a uma OS da qual é o
-- técnico responsável — mesmo critério de escopo já usado em
-- external_appointments/nps_cases pra TECNICO.
drop policy if exists "Escopo de visualização da Central de Conversas" on public.chat_conversations;
create policy "Escopo de visualização da Central de Conversas"
  on public.chat_conversations for select
  using (
    company_id = current_company_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and (
        p.role in ('GESTOR', 'ATENDENTE')
        or (
          p.role = 'TECNICO'
          and (
            chat_conversations.assigned_user_id = auth.uid()
            or exists (
              select 1 from public.service_orders so
              where so.id = chat_conversations.service_order_id and so.technician_id = auth.uid()
            )
          )
        )
      )
    )
  );

drop policy if exists "GESTOR/ATENDENTE alteram conversas" on public.chat_conversations;
create policy "GESTOR/ATENDENTE alteram conversas"
  on public.chat_conversations for update
  using (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('GESTOR', 'ATENDENTE'))
  )
  with check (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('GESTOR', 'ATENDENTE'))
  );

drop policy if exists "GESTOR/ATENDENTE criam conversas" on public.chat_conversations;
create policy "GESTOR/ATENDENTE criam conversas"
  on public.chat_conversations for insert
  with check (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('GESTOR', 'ATENDENTE'))
  );

-- ------------------------------------------------------------
-- chat_messages — company_id direto (não só via join em
-- chat_conversations) por instrução explícita: toda tabela nova do Chat
-- nasce com isolamento próprio, não só herdado.
-- ------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND')),
  sender_user_id uuid references public.profiles (id) on delete set null,
  body text,
  message_type text not null default 'TEXT' check (message_type in ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LOCATION', 'OTHER')),
  external_message_id text,
  status text not null default 'ENVIADA' check (status in ('ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU')),
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_conversation on public.chat_messages (conversation_id, created_at);
create index if not exists idx_chat_messages_company on public.chat_messages (company_id);

alter table public.chat_messages enable row level security;

drop policy if exists "Escopo de visualização de mensagens" on public.chat_messages;
create policy "Escopo de visualização de mensagens"
  on public.chat_messages for select
  using (
    company_id = current_company_id()
    and exists (
      select 1 from public.chat_conversations c
      join public.profiles p on p.id = auth.uid()
      where c.id = chat_messages.conversation_id
      and (
        p.role in ('GESTOR', 'ATENDENTE')
        or (
          p.role = 'TECNICO'
          and (
            c.assigned_user_id = auth.uid()
            or exists (select 1 from public.service_orders so where so.id = c.service_order_id and so.technician_id = auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "GESTOR/ATENDENTE/TECNICO autorizado envia mensagem" on public.chat_messages;
create policy "GESTOR/ATENDENTE/TECNICO autorizado envia mensagem"
  on public.chat_messages for insert
  with check (
    company_id = current_company_id()
    and exists (
      select 1 from public.chat_conversations c
      join public.profiles p on p.id = auth.uid()
      where c.id = chat_messages.conversation_id
      and (
        p.role in ('GESTOR', 'ATENDENTE')
        or (
          p.role = 'TECNICO'
          and (
            c.assigned_user_id = auth.uid()
            or exists (select 1 from public.service_orders so where so.id = c.service_order_id and so.technician_id = auth.uid())
          )
        )
      )
    )
  );

-- ------------------------------------------------------------
-- chat_conversation_events — histórico auditável (atribuição, mudança
-- de status), mesmo padrão já usado em nps_case_history/
-- external_appointment_history. Nunca editável por usuário comum
-- (só INSERT, sem UPDATE/DELETE policy).
-- ------------------------------------------------------------
create table if not exists public.chat_conversation_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_conversation_events_conversation on public.chat_conversation_events (conversation_id, created_at desc);

alter table public.chat_conversation_events enable row level security;

drop policy if exists "Escopo de visualização de auditoria de conversas" on public.chat_conversation_events;
create policy "Escopo de visualização de auditoria de conversas"
  on public.chat_conversation_events for select
  using (
    company_id = current_company_id()
    and exists (
      select 1 from public.chat_conversations c
      join public.profiles p on p.id = auth.uid()
      where c.id = chat_conversation_events.conversation_id
      and (
        p.role in ('GESTOR', 'ATENDENTE')
        or (
          p.role = 'TECNICO'
          and (
            c.assigned_user_id = auth.uid()
            or exists (select 1 from public.service_orders so where so.id = c.service_order_id and so.technician_id = auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "GESTOR/ATENDENTE registram evento de conversa" on public.chat_conversation_events;
create policy "GESTOR/ATENDENTE registram evento de conversa"
  on public.chat_conversation_events for insert
  with check (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('GESTOR', 'ATENDENTE'))
  );
