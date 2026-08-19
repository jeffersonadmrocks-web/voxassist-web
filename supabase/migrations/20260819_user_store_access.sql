create table if not exists public.user_store_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, company_id, store_id)
);

alter table public.user_store_access enable row level security;

create index if not exists idx_user_store_access_user_company on public.user_store_access(user_id, company_id) where active = true;
create index if not exists idx_user_store_access_store on public.user_store_access(store_id) where active = true;

-- Acesso de leitura apenas aos próprios vínculos. Operações administrativas são feitas pela Edge Function com service role.
drop policy if exists "user reads own store access" on public.user_store_access;
create policy "user reads own store access" on public.user_store_access
for select to authenticated
using (user_id = auth.uid());
