-- ============================================================
-- Matriz Mestra, Área 07 (Comunicação & Automação) -- "Mensagens
-- padrão" -- CRIAR confirmado: nada existia (mensagens de WhatsApp
-- hoje são sempre digitadas na hora, sem nenhum texto reutilizável
-- salvo). Mesmo padrão de catálogo simples já usado em payment_methods/
-- order_types/product_conditions/etc, com um campo a mais (body text).
--
-- Escopo desta etapa é só o CADASTRO do texto (nome + corpo com
-- {variaveis} livres, sem parser/validação de variável nenhuma).
-- Ligar isso a um botão real de "usar modelo" dentro do chat/WhatsApp
-- fica pra uma etapa futura -- essa tabela não dispara nada sozinha,
-- não toca em nenhuma rota de envio existente.
-- ============================================================

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  body text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists message_templates_company_name_uk on public.message_templates(company_id, upper(name));
create index if not exists message_templates_company_idx on public.message_templates(company_id, sort_order);

alter table public.message_templates enable row level security;

drop policy if exists "message_templates_select_company" on public.message_templates;
create policy "message_templates_select_company" on public.message_templates
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "message_templates_write_gestor" on public.message_templates;
create policy "message_templates_write_gestor" on public.message_templates
  for all to authenticated
  using (company_id = public.current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = public.current_company_id() and public.is_company_gestor(company_id));

create or replace function public.admin_upsert_message_template(
  p_company_id uuid,
  p_id uuid,
  p_name text,
  p_body text,
  p_active boolean
) returns public.message_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.message_templates%rowtype;
  v_next_sort int;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Apenas gestores podem alterar mensagens padrão.';
  end if;

  if p_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_next_sort from public.message_templates where company_id = p_company_id;
    insert into public.message_templates (company_id, name, body, active, sort_order, created_by)
      values (p_company_id, trim(p_name), coalesce(p_body, ''), coalesce(p_active, true), v_next_sort, auth.uid())
      returning * into v_row;
  else
    update public.message_templates
      set name = trim(p_name), body = coalesce(p_body, ''), active = coalesce(p_active, true)
      where id = p_id and company_id = p_company_id
      returning * into v_row;
  end if;

  return v_row;
end;
$$;
comment on function public.admin_upsert_message_template is
  'Cria ou atualiza uma mensagem padrão (nome + corpo texto) da empresa. GESTOR-only via is_company_gestor. Só cadastro -- não dispara envio nenhum.';

grant execute on function public.admin_upsert_message_template(uuid, uuid, text, text, boolean) to authenticated;
