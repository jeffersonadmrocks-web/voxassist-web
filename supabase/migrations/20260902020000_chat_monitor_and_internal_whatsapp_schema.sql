-- ============================================================
-- Fase 6 (Central de Conversas x mockup aprovado, achado do usuário em
-- 2026-09-02): schema pro "Monitor de atividades" (card de limites de
-- SLA) e pra "Usuários" (WhatsApp interno). Segue o MESMO padrão de
-- segurança já provado em produção pelo Robô de Atendimento
-- (20260901330000_chat_bot_flow_schema.sql): current_company_id() /
-- current_company_role() nas policies, tabela de auditoria append-only
-- no mesmo esqueleto de chat_bot_flow_audit_events.
--
-- "WhatsApp interno" (mockup #screenUsers): reconhece que uma mensagem
-- chegou do WhatsApp PESSOAL de um colaborador pro número da empresa,
-- e permite desviar essa conversa do robô de triagem. O vínculo nasce
-- de um clique numa conversa real ("🔗 Vincular usuário", só grava a
-- identidade técnica); ativar reconhecimento/desvio é uma ação
-- SEPARADA, só na ficha do usuário -- nunca automático. Nunca promove
-- o LID cru a "telefone": raw_jid e phone são colunas distintas, phone
-- só é preenchido quando a conversa de origem já tinha customer_phone
-- confirmado.
--
-- Aviso explícito: esta migration cria só o MODELO DE DADOS e as RPCs
-- de escrita -- não altera chat-inbound-webhook. bypass_bot fica
-- gravado mas ainda não é lido por nenhuma function em produção; o fio
-- que faria o robô realmente pular a triagem pra um contato
-- reconhecido é um passo futuro, deliberadamente fora deste lote (mesma
-- cautela da autorização original: nunca alterar o pipeline de
-- mensagens sem um ciclo de teste dedicado só pra isso).
-- ============================================================

create table if not exists public.chat_sla_settings (
  company_id uuid not null,
  wait_normal_max_min integer not null default 15,
  wait_atencao_max_min integer not null default 30,
  alert_gestor_min integer not null default 60,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.chat_sla_settings add constraint chat_sla_settings_pkey PRIMARY KEY (company_id);
alter table public.chat_sla_settings add constraint chat_sla_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.chat_sla_settings add constraint chat_sla_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.chat_sla_settings add constraint chat_sla_settings_positive_check CHECK (wait_normal_max_min > 0 AND wait_atencao_max_min >= wait_normal_max_min AND alert_gestor_min >= wait_atencao_max_min);

comment on table public.chat_sla_settings is 'Limiares de tempo de espera do cliente, configuráveis por empresa no Monitor de atividades. Mesmos valores usados no chip "Tempo excedido" da lista de conversas -- nunca dois números diferentes pro mesmo conceito.';

alter table public.chat_sla_settings enable row level security;
create policy "chat_sla_settings_select_company" on public.chat_sla_settings for SELECT to authenticated
  using (company_id = current_company_id());
create policy "chat_sla_settings_write_gestor" on public.chat_sla_settings for ALL to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR')
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');


create table if not exists public.chat_internal_whatsapp_links (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  raw_jid text,
  phone text,
  identity_status text not null default 'PENDENTE',
  recognized boolean not null default false,
  bypass_bot boolean not null default false,
  default_destination_type text,
  default_destination_value text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.chat_internal_whatsapp_links add constraint chat_internal_whatsapp_links_pkey PRIMARY KEY (id);
alter table public.chat_internal_whatsapp_links add constraint chat_internal_whatsapp_links_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.chat_internal_whatsapp_links add constraint chat_internal_whatsapp_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.chat_internal_whatsapp_links add constraint chat_internal_whatsapp_links_company_user_key UNIQUE (company_id, user_id);
alter table public.chat_internal_whatsapp_links add constraint chat_internal_whatsapp_links_status_check CHECK (identity_status in ('PENDENTE','VINCULADO'));
alter table public.chat_internal_whatsapp_links add constraint chat_internal_whatsapp_links_dest_type_check CHECK (default_destination_type is null or default_destination_type in ('ATENDENTE','LOJA','SETOR','LIVRE'));

comment on column public.chat_internal_whatsapp_links.raw_jid is 'Identidade técnica (LID/JID) reconhecida numa conversa real -- nunca exibida como telefone.';
comment on column public.chat_internal_whatsapp_links.phone is 'Telefone confirmado da conversa de origem, se houver -- nunca promovido a partir de raw_jid.';
comment on column public.chat_internal_whatsapp_links.recognized is 'Ativado só na ficha do usuário (tela Usuários), nunca automaticamente ao vincular.';
comment on column public.chat_internal_whatsapp_links.bypass_bot is 'Ativado só na ficha do usuário. Ainda não lido por chat-inbound-webhook -- ver aviso no topo desta migration.';

alter table public.chat_internal_whatsapp_links enable row level security;
create policy "chat_internal_whatsapp_links_select_gestor" on public.chat_internal_whatsapp_links for SELECT to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR');

create table if not exists public.chat_internal_whatsapp_audit_events (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  link_id uuid,
  user_id uuid not null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_by uuid,
  created_at timestamptz not null default now()
);
alter table public.chat_internal_whatsapp_audit_events add constraint chat_internal_whatsapp_audit_events_pkey PRIMARY KEY (id);
alter table public.chat_internal_whatsapp_audit_events add constraint chat_internal_whatsapp_audit_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.chat_internal_whatsapp_audit_events add constraint chat_internal_whatsapp_audit_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.chat_internal_whatsapp_audit_events add constraint chat_internal_whatsapp_audit_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.chat_internal_whatsapp_audit_events add constraint chat_internal_whatsapp_audit_events_action_check CHECK (action in ('VINCULADA','FICHA_ATUALIZADA','DESVINCULADA'));
CREATE INDEX idx_chat_internal_whatsapp_audit_events_company ON public.chat_internal_whatsapp_audit_events USING btree (company_id, created_at DESC);

alter table public.chat_internal_whatsapp_audit_events enable row level security;
create policy "chat_internal_whatsapp_audit_events_select_gestor" on public.chat_internal_whatsapp_audit_events for SELECT to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR');
-- Sem policy de INSERT/UPDATE/DELETE pro cliente -- só as RPCs
-- (security invoker, mas rodando com o mesmo authenticated que já
-- passou a checagem de GESTOR) escrevem aqui, mesmo padrão de
-- chat_bot_flow_audit_events.
create policy "chat_internal_whatsapp_audit_events_insert_gestor" on public.chat_internal_whatsapp_audit_events for INSERT to authenticated
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');
