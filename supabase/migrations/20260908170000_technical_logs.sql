-- ============================================================
-- Matriz Mestra, Área 09 (Sistema & Segurança) -- "Logs técnicos"
-- CRIAR confirmado: nenhuma captura de erro de JS existe hoje (grep
-- completo, zero `window.onerror`/`unhandledrejection` no repo).
--
-- Escopo desta etapa: captura simples de erros JS não tratados do
-- FRONTEND (mensagem + stack + URL), gravados pelo próprio usuário
-- logado (insert-only, sem gestor), visíveis só pro gestor. Não
-- captura erro de backend/Postgres/Edge Function -- isso ficaria
-- em log do próprio Supabase, fora do escopo desta tabela.
-- ============================================================

create table if not exists public.technical_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id),
  message text,
  stack text,
  source_url text,
  created_at timestamptz not null default now()
);
create index if not exists technical_logs_company_idx on public.technical_logs(company_id, created_at desc);

alter table public.technical_logs enable row level security;

drop policy if exists "technical_logs_insert_company" on public.technical_logs;
create policy "technical_logs_insert_company" on public.technical_logs
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists "technical_logs_select_gestor" on public.technical_logs;
create policy "technical_logs_select_gestor" on public.technical_logs
  for select to authenticated
  using (company_id = public.current_company_id() and public.is_company_gestor(company_id));
