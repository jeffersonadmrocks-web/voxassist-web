-- VoxAssist -- Configurações > Cadastros & Catálogos > Produtos
-- Achado do usuário em 2026-09-08 (Matriz Mestra, item Área 03): o
-- catálogo mestre (product_groups/product_types) JÁ EXISTE, populado,
-- global (sem company_id), read-only via RLS. Decisão arquitetural
-- explícita do usuário: NÃO duplicar "TV — Empresa A"/"TV — Empresa
-- B" nem adicionar company_id direto nas tabelas mestre. Em vez
-- disso, camada de ASSOCIAÇÃO por empresa -- a empresa escolhe quais
-- tipos do catálogo mestre usa, sem recriar nada. Catálogo mestre
-- continua intocado (nenhuma policy de escrita adicionada a ele --
-- administração do catálogo global fica fora de escopo por ora,
-- conforme pedido explícito do usuário).
--
-- Regra de leitura (sem migração de dado nenhuma): AUSÊNCIA de linha
-- aqui para (company_id, product_type_id) = tipo ATIVO por padrão
-- (empresa herda o catálogo mestre inteiro, não precisa "religar"
-- nada). Só uma linha explícita com active=false representa uma
-- desativação daquele tipo para aquela empresa. Isso hoje é só
-- configuração/exibição -- Nova OS continua com "TIPO DE PRODUTO"
-- como campo livre (new-os-v0812.js), nenhuma mudança de
-- comportamento operacional nesta migration.
create table if not exists public.company_product_types (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  product_type_id uuid not null,
  active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.company_product_types add constraint company_product_types_pkey primary key (id);
alter table public.company_product_types add constraint company_product_types_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.company_product_types add constraint company_product_types_product_type_id_fkey
  foreign key (product_type_id) references public.product_types(id) on delete cascade;
alter table public.company_product_types add constraint company_product_types_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.company_product_types add constraint company_product_types_unique
  unique (company_id, product_type_id);
create index idx_company_product_types_company on public.company_product_types using btree (company_id);

alter table public.company_product_types enable row level security;
create policy "company_product_types_select_company" on public.company_product_types for select to authenticated
  using (company_id = current_company_id());
create policy "company_product_types_write_gestor" on public.company_product_types for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_set_company_product_type(
  p_company_id uuid,
  p_product_type_id uuid,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Acesso permitido somente ao gestor da empresa';
  end if;
  insert into public.company_product_types(company_id, product_type_id, active, created_by)
  values (p_company_id, p_product_type_id, p_active, auth.uid())
  on conflict (company_id, product_type_id)
  do update set active = excluded.active;
end;
$$;
comment on function public.admin_set_company_product_type is
  'Ativa/desativa um tipo de produto do catálogo mestre PARA UMA EMPRESA (nunca altera product_types/product_groups, que continuam globais e intocados). Ausência de linha = ativo por padrão (empresa herda o catálogo mestre inteiro). Gestor-only.';
grant execute on function public.admin_set_company_product_type(uuid, uuid, boolean) to authenticated;
