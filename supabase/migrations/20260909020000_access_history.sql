-- ============================================================
-- Matriz Mestra, Área 01 -- "Histórico básico de acesso
-- (login/logout)". Decisão do usuário (2026-09-09): registro
-- simples agora (sem mexer no schema interno do Supabase Auth) --
-- usuário, empresa, data/hora, evento e, quando disponível de
-- forma segura, informação de sessão/dispositivo (user_agent, único
-- dado assim obtido de forma confiável e sem chamada externa --
-- capturar IP exigiria um serviço de terceiro, fora de escopo).
--
-- `audit_log` (existente) cobre alteração de CADASTRO, não
-- login/logout -- tabela nova e conceito diferente, não duplica.
-- ============================================================

create table if not exists public.access_history (
  id uuid primary key default gen_random_uuid(),
  -- referencia profiles (não auth.users) de propósito -- permite o
  -- PostgREST embutir profiles(full_name) direto na leitura, sem
  -- query separada pra resolver nome de usuário.
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  event text not null check (event in ('LOGIN', 'LOGOUT')),
  occurred_at timestamptz not null default now(),
  user_agent text
);
create index if not exists access_history_company_idx on public.access_history(company_id, occurred_at desc);

alter table public.access_history enable row level security;

drop policy if exists "access_history_insert_self" on public.access_history;
create policy "access_history_insert_self" on public.access_history
  for insert to authenticated
  with check (user_id = auth.uid() and (company_id is null or company_id = public.current_company_id()));

drop policy if exists "access_history_select_gestor" on public.access_history;
create policy "access_history_select_gestor" on public.access_history
  for select to authenticated
  using (company_id is not null and company_id = public.current_company_id() and public.is_company_gestor(company_id));
