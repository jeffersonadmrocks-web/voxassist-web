-- ============================================================
-- digisac_test_runs — log sanitizado de cada teste de conexão Digisac
-- (etapa 1, GET de baixo risco). Escrita exclusivamente pela edge function
-- digisac-test via service_role, best-effort (uma falha ao gravar nunca
-- pode impedir a resposta do teste ao usuário). Guarda só o suficiente
-- pra diagnosticar sem tocar em dado sensível: qual dos 4 estágios foi
-- alcançado, o código HTTP devolvido pela Digisac (quando houve) e a
-- duração — nunca URL completa, headers, JWT ou token. Mesmo padrão de
-- app_launch_audit (supabase/app_gateway_v0827.sql): GESTOR-only select,
-- sem policy de insert pro cliente (service_role sempre ignora RLS).
-- Idempotente.
-- ============================================================

create table if not exists public.digisac_test_runs (
  id uuid primary key default gen_random_uuid(),
  tested_by uuid references public.profiles (id) on delete set null,
  result_status text not null check (result_status in ('CONEXAO_VALIDA', 'TOKEN_RECUSADO', 'ENDPOINT_INDISPONIVEL', 'CONFIGURACAO_AUSENTE')),
  digisac_reached boolean not null,
  token_validated boolean not null,
  endpoint_functional boolean not null,
  upstream_http_status int,
  duration_ms int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_digisac_test_runs_created on public.digisac_test_runs (created_at desc);

alter table public.digisac_test_runs enable row level security;

drop policy if exists "Gestor vê o histórico de testes de conexão Digisac" on public.digisac_test_runs;
create policy "Gestor vê o histórico de testes de conexão Digisac"
  on public.digisac_test_runs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'GESTOR'
    )
  );
