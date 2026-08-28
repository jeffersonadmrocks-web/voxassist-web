-- ============================================================
-- VoxAssist — App Gateway v1 (V0.8.13, 2026-08-27)
-- Fundação reutilizável pra abrir aplicativos externos integrados
-- (Pulse IA primeiro). Migration aditiva e idempotente — não toca em
-- nenhuma tabela existente. Seguro rodar mais de uma vez.
--
-- Decisão de design: nem authenticated nem anon têm QUALQUER policy de
-- select/insert/update/delete em integrated_apps — só service_role (dentro
-- da edge function app-gateway-launch) acessa. Isso obriga toda resolução
-- de app/URL a passar pelo Gateway; o cliente nunca lê launch_url direto
-- via PostgREST, só recebe o resultado já validado pela function.
-- ============================================================

-- ------------------------------------------------------------
-- integrated_apps — registro central dos apps integrados.
-- ------------------------------------------------------------
create table if not exists public.integrated_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  launch_url text not null,
  icon_key text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  launch_mode text not null default 'external' check (launch_mode in ('internal', 'external', 'embedded-trusted')),
  position integer not null default 0,
  roles_allowed text[] not null default '{}',
  health_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integrated_apps enable row level security;
-- Nenhuma policy pra authenticated/anon de propósito — ver nota no topo.

-- ------------------------------------------------------------
-- app_launch_audit — auditoria de toda tentativa de abertura (sucesso,
-- bloqueio ou erro), escrita exclusivamente pela edge function via
-- service_role. Nunca grava token/senha/cookie/segredo.
-- ------------------------------------------------------------
create table if not exists public.app_launch_audit (
  id uuid primary key default gen_random_uuid(),
  requested_slug text not null,
  app_id uuid references public.integrated_apps (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  result text not null check (result in ('SUCCESS', 'BLOCKED', 'ERROR')),
  reason text,
  origin text,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_launch_audit_slug on public.app_launch_audit (requested_slug, created_at desc);
create index if not exists idx_app_launch_audit_user on public.app_launch_audit (user_id, created_at desc);

alter table public.app_launch_audit enable row level security;

drop policy if exists "Gestor vê auditoria de launch de apps" on public.app_launch_audit;
create policy "Gestor vê auditoria de launch de apps"
  on public.app_launch_audit for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'GESTOR'
    )
  );
-- Sem policy de insert/update/delete pro client — só service_role escreve.

-- ------------------------------------------------------------
-- Seed: Pulse IA, primeiro app homologado. Mantém acesso pra todos os
-- perfis hoje em uso (preserva o comportamento atual — window.open aberto
-- pra qualquer usuário logado, sem checagem de papel).
-- ------------------------------------------------------------
insert into public.integrated_apps (slug, name, description, launch_url, status, launch_mode, position, roles_allowed)
values (
  'pulse-ia',
  'Pulse IA',
  'Redes sociais com apoio de IA',
  'https://pulse-ia-eight.vercel.app',
  'active',
  'external',
  0,
  array['GESTOR', 'ATENDENTE', 'TECNICO', 'ESTOQUE', 'FINANCEIRO']
)
on conflict (slug) do nothing;
