-- ============================================================
-- EST-2A (2/6) -- stock_positions: posição física dentro de um local
-- de estoque (Bloco 2 do EST-1: "posição sempre existe dentro de um
-- local", EST-LOC-03). stock_locations já existia (migration
-- 20260908090000, cadastro genérico) mas sem nenhuma camada de posição
-- -- storage_location em stock_items sempre foi texto livre
-- desconectado (achado EST-0B). Esta migration não mexe em
-- storage_location nem em stock_locations -- só adiciona a peça que
-- faltava.
--
-- company_id é redundante com stock_locations.company_id de propósito
-- (mesmo padrão de payments.company_id x service_orders.company_id):
-- a trigger abaixo GARANTE no banco que os dois nunca divergem, não
-- confia só no frontend/RLS -- mesma técnica já provada em
-- payments_enforce_company_from_os (migration 20260913090000).
-- ============================================================

create table if not exists public.stock_positions (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
alter table public.stock_positions add constraint stock_positions_pkey primary key (id);
alter table public.stock_positions add constraint stock_positions_location_code_uidx unique (location_id, code);

create or replace function public.stock_positions_enforce_company_from_location()
returns trigger
language plpgsql
as $$
begin
  select company_id into new.company_id from public.stock_locations where id = new.location_id;
  if new.company_id is null then
    raise exception 'Local de estoque inválido para a posição.';
  end if;
  return new;
end;
$$;
comment on function public.stock_positions_enforce_company_from_location is
  'Deriva/trava stock_positions.company_id a partir de stock_locations.company_id -- garantia no banco, mesmo padrão de payments_enforce_company_from_os (EST-2A, 2026-09-13).';

create trigger stock_positions_enforce_company
  before insert or update of location_id, company_id on public.stock_positions
  for each row execute function public.stock_positions_enforce_company_from_location();

alter table public.stock_positions enable row level security;

-- Só SELECT é permissiva -- cadastro de posição é uma ação
-- administrativa (GESTOR), feita por uma RPC própria
-- (admin_upsert_stock_position, fora do escopo do EST-2A -- não existe
-- ainda; até lá, o Motor de Estoque cria a posição sob demanda dentro
-- da própria transação de entrada quando necessário, como qualquer
-- outra escrita, nunca por INSERT direto do frontend).
create policy "stock_positions_select_company" on public.stock_positions
  for select to authenticated
  using (company_id = public.current_company_id());

comment on table public.stock_positions is
  'Posição física dentro de um local de estoque (EST-1 Bloco 2/EST-LOC-03). Sem policy de INSERT/UPDATE/DELETE direta -- só RPCs SECURITY DEFINER escrevem aqui (EST-2A, 2026-09-13).';
