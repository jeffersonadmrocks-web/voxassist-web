-- ============================================================
-- Robô de Atendimento -- Fase 2: estado de execução por conversa +
-- auditoria de configuração + selo visual das mensagens do robô.
--
-- chat_conversation_bot_state: 1 linha por conversa que já passou (ou
-- está passando) pela triagem do robô. Escrita SÓ pela service_role
-- dentro de chat-inbound-webhook (Fase 5) -- de propósito sem policy
-- de INSERT/UPDATE pra usuário autenticado (RLS default-deny cobre
-- isso sozinho), só SELECT pra quem já pode ver a conversa.
-- ============================================================

create table if not exists public.chat_conversation_bot_state (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  conversation_id uuid not null,
  flow_version_id uuid not null,
  current_step_id uuid,
  status text not null default 'EM_ANDAMENTO'::text,
  answers jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.chat_conversation_bot_state add constraint chat_conversation_bot_state_pkey PRIMARY KEY (id);
alter table public.chat_conversation_bot_state add constraint chat_conversation_bot_state_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_conversation_bot_state add constraint chat_conversation_bot_state_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_conversation_bot_state add constraint chat_conversation_bot_state_flow_version_id_fkey FOREIGN KEY (flow_version_id) REFERENCES chat_bot_flow_versions(id);
alter table public.chat_conversation_bot_state add constraint chat_conversation_bot_state_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES chat_bot_flow_steps(id) ON DELETE SET NULL;
alter table public.chat_conversation_bot_state add constraint chat_conversation_bot_state_conversation_id_unique UNIQUE (conversation_id);
alter table public.chat_conversation_bot_state add constraint chat_conversation_bot_state_status_check CHECK ((status = ANY (ARRAY['EM_ANDAMENTO'::text, 'CONCLUIDO'::text, 'ABANDONADO'::text, 'BYPASS_HUMANO'::text, 'LIMITE_TENTATIVAS'::text])));
alter table public.chat_conversation_bot_state add constraint chat_conversation_bot_state_attempt_count_check CHECK ((attempt_count >= 0));
CREATE INDEX idx_chat_conversation_bot_state_status ON public.chat_conversation_bot_state USING btree (status) WHERE (status = 'EM_ANDAMENTO');

alter table public.chat_conversation_bot_state enable row level security;
create policy "chat_conversation_bot_state_select_same_as_conversation" on public.chat_conversation_bot_state for SELECT to authenticated
  using (
    company_id = current_company_id()
    and exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id
        and (
          current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])
          or (current_company_role() = 'TECNICO' and (c.assigned_user_id = auth.uid() or exists (select 1 from public.service_orders so where so.id = c.service_order_id and so.technician_id = auth.uid())))
        )
    )
  );
-- Sem policy de INSERT/UPDATE/DELETE pra authenticated -- só a
-- service_role (chat-inbound-webhook) escreve aqui, igual a
-- last_away_sent_at hoje.

comment on table public.chat_conversation_bot_state is
  'Progresso da triagem do robô por conversa -- 1:1 com chat_conversations. Escrita exclusiva da service_role dentro de chat-inbound-webhook (Fase 5); leitura segue a mesma visibilidade de chat_conversations.';

-- ---------- auditoria de configuração (mesmo esqueleto de goal_bonus_audit_events) ----------

create table if not exists public.chat_bot_flow_audit_events (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  reason text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
alter table public.chat_bot_flow_audit_events add constraint chat_bot_flow_audit_events_pkey PRIMARY KEY (id);
alter table public.chat_bot_flow_audit_events add constraint chat_bot_flow_audit_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_bot_flow_audit_events add constraint chat_bot_flow_audit_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.chat_bot_flow_audit_events add constraint chat_bot_flow_audit_events_entity_type_check CHECK ((entity_type = 'FLOW_VERSION'::text));
alter table public.chat_bot_flow_audit_events add constraint chat_bot_flow_audit_events_action_check CHECK ((action = ANY (ARRAY['CRIADA'::text, 'PUBLICADA'::text, 'RESTAURADA'::text])));
CREATE INDEX idx_chat_bot_flow_audit_events_company ON public.chat_bot_flow_audit_events USING btree (company_id, created_at DESC);

alter table public.chat_bot_flow_audit_events enable row level security;
create policy "chat_bot_flow_audit_events_select_gestor" on public.chat_bot_flow_audit_events for SELECT to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR');
-- INSERT liberado pra GESTOR da própria empresa -- na prática só é
-- exercido pelo trigger de criação (abaixo) e pelas RPCs de publicar/
-- restaurar (Fase 3, security invoker, rodam com a permissão de quem
-- chamou) -- não existe nenhum outro caminho de escrita no código que
-- use isso, mas a fronteira real de quem PODE é esta policy, igual ao
-- resto do schema.
create policy "chat_bot_flow_audit_events_insert_gestor" on public.chat_bot_flow_audit_events for INSERT to authenticated
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');
-- Sem policy de UPDATE/DELETE -- append-only de verdade.

comment on table public.chat_bot_flow_audit_events is
  'Auditoria append-only de configuração do robô (criação/publicação/restauração de versão) -- mesmo padrão de goal_bonus_audit_events.';

-- ---------- selo visual das mensagens do robô ----------
-- message_type continua 'TEXT' pras mensagens do robô (não muda) --
-- só o ORIGIN novo abaixo que as distingue visualmente na Central.
alter table public.chat_messages drop constraint chat_messages_origin_check;
alter table public.chat_messages add constraint chat_messages_origin_check
  CHECK ((origin = ANY (ARRAY['REALTIME'::text, 'IMPORT'::text, 'INTERNAL'::text, 'BOT'::text])));

comment on column public.chat_messages.origin is
  'REALTIME = mensagem real trocada com o cliente via WhatsApp (webhook/send). IMPORT = trazida do histórico do WhatsApp na importação inicial. INTERNAL = nota interna da equipe, nunca enviada ao cliente. BOT = mensagem automática do Robô de Atendimento (boas-vindas/triagem/fora do horário quando há fluxo publicado) -- enviada de verdade ao cliente via gateway, igual REALTIME, só marcada pra aparecer com selo distinto na Central.';

-- ---------- auditoria automática de criação de rascunho ----------
-- Criar um rascunho novo é um INSERT direto (RLS já permite pro
-- GESTOR, sem precisar de RPC) -- este trigger garante que MESMO
-- assim fica um evento de auditoria (CRIADA), sem depender do
-- frontend lembrar de gravar isso à parte.
create or replace function public.chat_bot_flow_versions_log_creation() returns trigger
language plpgsql as $$
begin
  insert into public.chat_bot_flow_audit_events (company_id, entity_type, entity_id, action, previous_data, new_data, changed_by)
  values (NEW.company_id, 'FLOW_VERSION', NEW.id, 'CRIADA', '{}'::jsonb, to_jsonb(NEW), NEW.created_by);
  return NEW;
end;
$$;

create trigger trg_chat_bot_flow_versions_log_creation
  after insert on public.chat_bot_flow_versions
  for each row execute function public.chat_bot_flow_versions_log_creation();
