-- ============================================================
-- Achado do usuário em 2026-09-07: ao ampliar o menu Configurações,
-- descobri que não existe hoje NENHUM formulário real de criar/
-- editar loja em lugar nenhum do app (company-store-model-v0813.js
-- só LISTA nomes, é somente leitura) -- lojas só tinham sido criadas
-- via SQL direto nesta sessão (ex.: VOX VITÓRIA). RPC nova, mesmo
-- formato de admin_upsert_service_group (única já existente pro
-- mesmo padrão de card GESTOR-only em Configurações).
-- ============================================================
create or replace function public.admin_upsert_store(
  p_company_id uuid,
  p_name text,
  p_code text default null,
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
    raise exception 'Informe um nome para a loja';
  end if;
  if p_id is not null then
    update public.stores
       set name = trim(p_name), code = nullif(trim(coalesce(p_code,'')),''), active = p_active, updated_at = now()
     where id = p_id and company_id = p_company_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Loja não encontrada nesta empresa';
    end if;
  else
    insert into public.stores(company_id, name, code, active)
    values (p_company_id, trim(p_name), nullif(trim(coalesce(p_code,'')),''), p_active)
    returning id into v_id;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe uma loja com este código';
end;
$$;
comment on function public.admin_upsert_store is
  'Cria/renomeia/ativa-desativa uma loja -- GESTOR-only via is_company_gestor. Mesmo padrão de admin_upsert_service_group. Usado pelo card LOJAS de Configurações (service-stores-admin-v0907.js).';
grant execute on function public.admin_upsert_store(uuid, text, text, uuid, boolean) to authenticated;
