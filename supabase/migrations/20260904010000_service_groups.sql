-- Achado do usuário em 2026-09-04: "Grupo" não é tipo de aparelho
-- (isso já existe só como rótulo cosmético, inferGroup) -- é um
-- catálogo que o GESTOR cria e nomeia como quiser (ex.: "TVs",
-- "Produtos Garantia"), representando área de responsabilidade/tipo
-- de serviço. Técnico pode pertencer a um ou mais grupos; o atendente
-- escolhe manualmente o grupo da OS (nunca sugestão automática, nunca
-- aparece em documento impresso/enviado ao cliente).

create table if not exists public.service_groups (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.service_groups add constraint service_groups_pkey primary key (id);
alter table public.service_groups add constraint service_groups_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.service_groups add constraint service_groups_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
create index idx_service_groups_company on public.service_groups using btree (company_id, active);

alter table public.service_groups enable row level security;
create policy "service_groups_select_company" on public.service_groups for select to authenticated
  using (company_id = current_company_id());
create policy "service_groups_write_gestor" on public.service_groups for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

create table if not exists public.service_group_technicians (
  id uuid not null default gen_random_uuid(),
  service_group_id uuid not null,
  technician_id uuid not null,
  company_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.service_group_technicians add constraint service_group_technicians_pkey primary key (id);
alter table public.service_group_technicians add constraint service_group_technicians_group_id_fkey
  foreign key (service_group_id) references public.service_groups(id) on delete cascade;
alter table public.service_group_technicians add constraint service_group_technicians_technician_id_fkey
  foreign key (technician_id) references public.profiles(id) on delete cascade;
alter table public.service_group_technicians add constraint service_group_technicians_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.service_group_technicians add constraint service_group_technicians_unique
  unique (service_group_id, technician_id);
create index idx_sgt_technician on public.service_group_technicians using btree (technician_id);
create index idx_sgt_group on public.service_group_technicians using btree (service_group_id);

alter table public.service_group_technicians enable row level security;
create policy "service_group_technicians_select_company" on public.service_group_technicians for select to authenticated
  using (company_id = current_company_id());
create policy "service_group_technicians_write_gestor" on public.service_group_technicians for all to authenticated
  using (company_id = current_company_id() and public.is_company_gestor(company_id))
  with check (company_id = current_company_id() and public.is_company_gestor(company_id));

-- Aditivo -- nenhuma OS existente é afetada, campo opcional.
alter table public.service_orders add column if not exists service_group_id uuid;
alter table public.service_orders add constraint service_orders_service_group_id_fkey
  foreign key (service_group_id) references public.service_groups(id) on delete set null;
comment on column public.service_orders.service_group_id is
  'Grupo de atendimento (gestão interna, escolhido manualmente pelo atendente) -- NUNCA deve aparecer em documento impresso ou enviado ao cliente (printVox/printWhirlpool).';

grant select on public.service_groups to authenticated;
grant select on public.service_group_technicians to authenticated;

-- RPC simples pro gestor criar/renomear/(des)ativar um grupo -- evita
-- expor INSERT/UPDATE direto em service_groups sem validação de papel.
create or replace function public.admin_upsert_service_group(
  p_company_id uuid,
  p_name text,
  p_id uuid default null,
  p_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_company_gestor(p_company_id) then
    raise exception 'Acesso permitido somente ao gestor da empresa';
  end if;
  if coalesce(trim(p_name),'') = '' then
    raise exception 'Informe um nome para o grupo';
  end if;
  if p_id is not null then
    update public.service_groups
       set name = trim(p_name), active = p_active
     where id = p_id and company_id = p_company_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Grupo não encontrado nesta empresa';
    end if;
  else
    insert into public.service_groups(company_id, name, active, created_by)
    values (p_company_id, trim(p_name), p_active, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function public.admin_upsert_service_group(uuid, text, uuid, boolean) to authenticated;

-- Achado em 2026-09-04: admin_update_user_access já existe e funciona
-- no banco ao vivo, mas nunca teve migration correspondente no
-- repositório (aplicada direto em algum momento anterior a esta
-- sessão). Assinatura completa abaixo é a real, peguei via
-- pg_get_functiondef antes de alterar.
--
-- Erro real cometido e corrigido nesta mesma sessão: create or replace
-- com um parâmetro A MAIS não substitui a função antiga -- Postgres
-- casa por (nome + tipos dos parâmetros, em ordem), então uma lista de
-- parâmetros diferente cria uma SEGUNDA função em paralelo (overload),
-- deixando a chamada ambígua pro PostgREST e quebrando a tela "Alterar
-- Usuário" que já funcionava. Precisa dropar a assinatura antiga
-- explicitamente antes de criar a nova.
drop function if exists public.admin_update_user_access(uuid, uuid, text, text, boolean, uuid[], text, jsonb);
create or replace function public.admin_update_user_access(
  p_user_id uuid,
  p_company_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean,
  p_store_ids uuid[],
  p_access_type text,
  p_permissions jsonb default '{}'::jsonb,
  p_service_group_ids uuid[] default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_store uuid;
  v_group uuid;
  v_key text;
  v_val jsonb;
begin
  if auth.uid() is null or not public.is_company_gestor(p_company_id) then
    raise exception 'Acesso permitido somente ao gestor da empresa';
  end if;
  if p_role not in ('GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO') then
    raise exception 'Perfil inválido';
  end if;
  if not exists (
    select 1 from public.user_companies
    where user_id=p_user_id and company_id=p_company_id
  ) then
    raise exception 'Usuário não vinculado à empresa';
  end if;
  if coalesce(array_length(p_store_ids,1),0)=0 then
    raise exception 'Selecione ao menos uma loja';
  end if;
  if exists (
    select 1 from unnest(p_store_ids) x
    where not exists (
      select 1 from public.stores s
      where s.id=x and s.company_id=p_company_id and s.active=true
    )
  ) then
    raise exception 'Uma ou mais lojas não pertencem à empresa';
  end if;

  update public.profiles
     set full_name=upper(trim(p_full_name)), role=p_role, active=p_active,
         store_id=p_store_ids[1], active_company_id=p_company_id, updated_at=now()
   where id=p_user_id;

  update public.user_companies
     set role=p_role, active=p_active, store_id=p_store_ids[1]
   where user_id=p_user_id and company_id=p_company_id;

  delete from public.user_store_access
   where user_id=p_user_id and company_id=p_company_id;
  foreach v_store in array p_store_ids loop
    insert into public.user_store_access(user_id,company_id,store_id,active)
    values(p_user_id,p_company_id,v_store,true);
  end loop;

  -- p_service_group_ids null = "não mexer" (chamador antigo/tela que
  -- ainda não manda esse campo); array vazio = "remover todos".
  if p_service_group_ids is not null then
    if exists (
      select 1 from unnest(p_service_group_ids) x
      where not exists (
        select 1 from public.service_groups g
        where g.id=x and g.company_id=p_company_id
      )
    ) then
      raise exception 'Um ou mais grupos não pertencem à empresa';
    end if;
    delete from public.service_group_technicians
     where technician_id=p_user_id and company_id=p_company_id;
    foreach v_group in array p_service_group_ids loop
      insert into public.service_group_technicians(service_group_id,technician_id,company_id)
      values(v_group,p_user_id,p_company_id)
      on conflict (service_group_id,technician_id) do nothing;
    end loop;
  end if;

  delete from public.user_permissions
   where user_id=p_user_id and company_id=p_company_id;
  insert into public.user_permissions(user_id,company_id,permission_key,allowed,granted_by)
  values(p_user_id,p_company_id,'access_type:'||upper(coalesce(nullif(trim(p_access_type),''),'PERSONALIZADO')),true,auth.uid());

  for v_key,v_val in select key,value from jsonb_each(coalesce(p_permissions,'{}'::jsonb)) loop
    insert into public.user_permissions(user_id,company_id,permission_key,allowed,granted_by)
    values(p_user_id,p_company_id,v_key,coalesce((v_val::text)::boolean,false),auth.uid());
  end loop;

  insert into public.audit_log(user_id,company_id,area,action,entity_type,entity_id,new_data)
  values(auth.uid(),p_company_id,'CONFIGURACOES','ALTERAR_USUARIO','PROFILE',p_user_id,
         jsonb_build_object('role',p_role,'active',p_active,'stores',p_store_ids,'access_type',p_access_type,'permissions',p_permissions,'service_groups',p_service_group_ids));
end;
$$;
grant execute on function public.admin_update_user_access(uuid, uuid, text, text, boolean, uuid[], text, jsonb, uuid[]) to authenticated;

-- Achado em 2026-09-04, no mesmo levantamento: admin_company_users (a
-- RPC que alimenta a tela "Alterar usuário") NUNCA retornava
-- store_ids/store_names, mesmo a tela já lendo esses dois campos pra
-- pré-marcar "LOJAS LIBERADAS" -- bug real pré-existente (checkbox de
-- loja nunca vinha marcado), descoberto ao investigar onde encaixar
-- os grupos. Corrigido junto (adiciona store_ids/store_names de
-- verdade, lendo user_store_access) + os 2 campos novos de grupo.
-- Achado ao aplicar: diferente do que a documentação sugere,
-- Postgres recusa CREATE OR REPLACE quando o RETURNS TABLE muda
-- (mesmo só acrescentando colunas no fim) -- "cannot change return
-- type of existing function... Use DROP FUNCTION ... first." Como só
-- existe UMA assinatura de entrada (p_company_id uuid, sem overload),
-- o DROP aqui é seguro -- equivale a uma troca de verdade, não deixa
-- nenhuma versão órfã pra trás (diferente do caso de
-- admin_update_user_access acima, que tinha 2 assinaturas de entrada
-- diferentes coexistindo).
drop function if exists public.admin_company_users(uuid);
create or replace function public.admin_company_users(p_company_id uuid)
returns table(
  user_id uuid, full_name text, email text, role text, active boolean,
  access_type text, company_ids uuid[], company_names text[], permissions jsonb,
  store_ids uuid[], store_names text[],
  service_group_ids uuid[], service_group_names text[]
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_company_gestor(p_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;
  return query
  select p.id,p.full_name,p.email,coalesce(uc.role,p.role),(p.active and uc.active),
         coalesce((select split_part(up.permission_key,':',2) from public.user_permissions up where up.user_id=p.id and up.company_id=p_company_id and up.permission_key like 'access_type:%' and up.allowed=true order by up.granted_at desc limit 1),'PERSONALIZADO'),
         coalesce((select array_agg(uc2.company_id order by c2.legal_name) from public.user_companies uc2 join public.companies c2 on c2.id=uc2.company_id where uc2.user_id=p.id and uc2.active=true),array[]::uuid[]),
         coalesce((select array_agg(coalesce(c2.trade_name,c2.legal_name) order by c2.legal_name) from public.user_companies uc2 join public.companies c2 on c2.id=uc2.company_id where uc2.user_id=p.id and uc2.active=true),array[]::text[]),
         coalesce((select jsonb_object_agg(up.permission_key,up.allowed) from public.user_permissions up where up.user_id=p.id and up.company_id=p_company_id and up.permission_key not like 'access_type:%'),'{}'::jsonb),
         coalesce((select array_agg(usa.store_id order by s.name) from public.user_store_access usa join public.stores s on s.id=usa.store_id where usa.user_id=p.id and usa.company_id=p_company_id and usa.active=true),array[]::uuid[]),
         coalesce((select array_agg(s.name order by s.name) from public.user_store_access usa join public.stores s on s.id=usa.store_id where usa.user_id=p.id and usa.company_id=p_company_id and usa.active=true),array[]::text[]),
         coalesce((select array_agg(sgt.service_group_id order by g.name) from public.service_group_technicians sgt join public.service_groups g on g.id=sgt.service_group_id where sgt.technician_id=p.id and sgt.company_id=p_company_id),array[]::uuid[]),
         coalesce((select array_agg(g.name order by g.name) from public.service_group_technicians sgt join public.service_groups g on g.id=sgt.service_group_id where sgt.technician_id=p.id and sgt.company_id=p_company_id),array[]::text[])
  from public.user_companies uc join public.profiles p on p.id=uc.user_id
  where uc.company_id=p_company_id order by p.full_name;
end $$;
grant execute on function public.admin_company_users(uuid) to authenticated;
