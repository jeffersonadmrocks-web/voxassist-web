-- ============================================================
-- Achado do usuário em 2026-09-02: no Monitor de atividades (Central
-- de Conversas), a tabela de Atendentes já mostra TODOS os atendentes
-- cadastrados e ativos da empresa (nunca filtrou por online -- ver
-- runtime/chat-monitor-v1.js, api('profiles?...&active=eq.true...')),
-- mas não existia nenhum indicador de presença online/offline em
-- lugar nenhum do VoxAssist. Tabela nova, mínima, própria pra isso --
-- não reaproveita profiles pra não gerar escrita frequente (heartbeat
-- a cada 30s) numa tabela sensível/muito lida por RLS.
-- ============================================================

create table if not exists public.user_presence (
  user_id uuid not null,
  company_id uuid not null,
  last_seen_at timestamptz not null default now()
);
alter table public.user_presence add constraint user_presence_pkey PRIMARY KEY (user_id);
alter table public.user_presence add constraint user_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.user_presence add constraint user_presence_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

comment on table public.user_presence is 'Heartbeat de presença -- cada sessão ativa grava/atualiza sua própria linha a cada 30s (ver presence-heartbeat-v1.js). "Online" é calculado no cliente: last_seen_at recente (< ~2min). Sem histórico -- só o último ping.';

alter table public.user_presence enable row level security;
create policy "user_presence_select_company" on public.user_presence for SELECT to authenticated
  using (company_id = current_company_id());
create policy "user_presence_upsert_self" on public.user_presence for ALL to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and company_id = current_company_id());
