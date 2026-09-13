-- ============================================================
-- EST-2A (3/6) -- stock_balances: o saldo físico canônico por
-- dimensão (EST-SAL-04, decisão do usuário 2026-09-13: "saldo
-- operacional canônico nasce por dimensão física desde a fundação do
-- motor" -- rejeitou explicitamente a alternativa de manter só
-- stock_items.available_quantity como saldo único global com
-- local/posição sendo apenas rótulo de auditoria).
--
-- Chave canônica (ajuste 1 do aceite): company_id + stock_item_id +
-- location_id + position_id + state. position_id é NOT NULL de
-- propósito -- um UNIQUE com position_id nullable trataria cada NULL
-- como distinto (Postgres), permitindo múltiplas linhas "sem posição"
-- pra mesma peça/local, exatamente a duplicidade de saldo que o
-- ajuste 1 proíbe ("não permitir múltiplas linhas concorrentes
-- representando o mesmo saldo físico"). Por isso a operação de entrada
-- (migration 20260913180000) sempre exige uma posição resolvida antes
-- de mexer no saldo.
--
-- state por enquanto só tem DISPONIVEL implementado (ajuste 3: não
-- antecipar o que ainda não tem operação real) -- EM_TRANSITO e
-- QUARENTENA ficam no CHECK como preparação conceitual do Bloco 2, mas
-- nenhum código insere esses estados ainda. RESERVADO
-- deliberadamente NÃO existe aqui -- EST-RES-04 (ajuste 2 do aceite
-- anterior) exige que reserva NUNCA seja saldo físico; será uma
-- estrutura própria (stock_reservations, ainda não criada), que lê
-- este saldo pra calcular "disponível pra novo uso" sem nunca gravar
-- uma baixa física falsa. Esta tabela não precisa de nenhuma coluna a
-- mais pra isso funcionar depois.
-- ============================================================

create table if not exists public.stock_balances (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id),
  position_id uuid not null references public.stock_positions(id),
  state text not null default 'DISPONIVEL' check (state in ('DISPONIVEL','EM_TRANSITO','QUARENTENA')),
  quantity numeric not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now()
);
alter table public.stock_balances add constraint stock_balances_pkey primary key (id);
alter table public.stock_balances add constraint stock_balances_dimension_uidx
  unique (company_id, stock_item_id, location_id, position_id, state);

-- Garantias de integridade equivalentes às já usadas em payments: a
-- posição precisa pertencer ao mesmo local, e o local/item precisam
-- pertencer à mesma empresa -- travado no banco, não só confiado ao
-- caller da RPC.
create or replace function public.stock_balances_enforce_dimension_integrity()
returns trigger
language plpgsql
as $$
declare
  v_item_company uuid;
  v_location_company uuid;
  v_position_location uuid;
begin
  select company_id into v_item_company from public.stock_items where id = new.stock_item_id;
  select company_id into v_location_company from public.stock_locations where id = new.location_id;
  select location_id into v_position_location from public.stock_positions where id = new.position_id;

  if v_item_company is null or v_location_company is null or v_position_location is null then
    raise exception 'Peça, local ou posição inválidos para o saldo.';
  end if;
  if v_item_company <> v_location_company then
    raise exception 'Peça e local pertencem a empresas diferentes.';
  end if;
  if v_position_location <> new.location_id then
    raise exception 'Posição não pertence ao local informado.';
  end if;

  new.company_id := v_item_company;
  return new;
end;
$$;
comment on function public.stock_balances_enforce_dimension_integrity is
  'Trava no banco que stock_item/location/position do saldo pertencem à mesma empresa e que a posição pertence ao local (EST-2A, ajuste 1 -- concorrência precisa ocorrer sobre a dimensão física correta).';

create trigger stock_balances_enforce_dimension
  before insert or update of stock_item_id, location_id, position_id, company_id on public.stock_balances
  for each row execute function public.stock_balances_enforce_dimension_integrity();

alter table public.stock_balances enable row level security;

-- Só SELECT permissivo -- nenhuma policy de INSERT/UPDATE/DELETE
-- direta (ajuste do usuário: "usuário comum não poderá INSERT/UPDATE/
-- DELETE stock_balances diretamente"). Só a RPC SECURITY DEFINER
-- escreve aqui.
create policy "stock_balances_select_company" on public.stock_balances
  for select to authenticated
  using (company_id = public.current_company_id());

comment on table public.stock_balances is
  'Saldo físico canônico por peça+local+posição+estado (EST-1 Bloco 2, EST-SAL-04). Sem policy de escrita direta -- só RPCs SECURITY DEFINER (EST-2A, 2026-09-13).';
