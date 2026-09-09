-- ============================================================
-- Matriz Mestra, C3 (catálogo de permissão) -- último passo
-- pendente: "endurecer a RPC pra rejeitar chave fora do catálogo".
-- Levantamento anterior (2026-09-08) já confirmou zero dado real
-- usando as chaves divergentes (financeiro.*×finance.*, etc.) e já
-- corrigiu `user-access-management-v0813.js` pra só mandar chaves
-- canônicas -- faltava só a trava no servidor, pra nenhum caminho
-- futuro (RPC chamada direto, tela nova, engano de digitação)
-- conseguir gravar uma chave fora do catálogo único
-- (`permissions-catalog-v0901.js`, fonte de verdade visual já
-- existente).
--
-- Catálogo replicado aqui em UMA função (`is_valid_permission_key`)
-- em vez de inline nas 2 RPCs, pra não duplicar a lista 2x.
--
-- Achado ao levantar as chaves reais ANTES de travar: a tela
-- canônica de fato usada (`user-access-management-v0813.js`, a
-- "mais completa" que o C5 aponta como base) manda 24 chaves, 7 a
-- mais que a matriz visual de `permissions-catalog-v0901.js` (que é
-- só um recorte pra exibição): os.print, os.financial,
-- agenda.view_own, agenda.drag, financeiro.export,
-- relatorios.export, config.companies. As outras 2 telas
-- concorrentes (`user-permissions-ui-v0813.js`,
-- `company-only-mode-v0813.js`) usam só o subconjunto de 17 --
-- checado por grep nas 3 antes de travar, pra não quebrar nenhuma
-- gravação real. Catálogo aqui é a UNIÃO das 24, não o recorte de 17
-- (travar pelas 17 quebraria a tela canônica).
-- ============================================================

create or replace function public.is_valid_permission_key(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key in (
    'os.view','os.create','os.edit','os.cancel','os.status','os.print','os.financial',
    'whirlpool.view','whirlpool.edit',
    'agenda.view_all','agenda.view_own','agenda.edit','agenda.drag','agenda.block',
    'financeiro.view','financeiro.edit','financeiro.export',
    'estoque.view','estoque.edit',
    'relatorios.view','relatorios.export',
    'config.view','config.users','config.companies'
  );
$$;
comment on function public.is_valid_permission_key is
  'Catálogo único de chaves de permissão válidas -- união das 24 chaves reais usadas por user-access-management-v0813.js (tela canônica, superset) + o recorte de 17 usado por user-permissions-ui-v0813.js/company-only-mode-v0813.js/permissions-catalog-v0901.js. Usada por admin_update_user_access/admin_update_user_access_company_only pra rejeitar chave fora do catálogo (C3, endurecimento pendente fechado em 2026-09-08).';

create or replace function public.admin_update_user_access(
  p_user_id uuid,
  p_company_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean,
  p_store_ids uuid[],
  p_access_type text,
  p_permissions jsonb DEFAULT '{}'::jsonb,
  p_service_group_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    if not public.is_valid_permission_key(v_key) then
      raise exception 'Chave de permissão inválida: %', v_key;
    end if;
    insert into public.user_permissions(user_id,company_id,permission_key,allowed,granted_by)
    values(p_user_id,p_company_id,v_key,coalesce((v_val::text)::boolean,false),auth.uid());
  end loop;

  insert into public.audit_log(user_id,company_id,area,action,entity_type,entity_id,new_data)
  values(auth.uid(),p_company_id,'CONFIGURACOES','ALTERAR_USUARIO','PROFILE',p_user_id,
         jsonb_build_object('role',p_role,'active',p_active,'stores',p_store_ids,'access_type',p_access_type,'permissions',p_permissions,'service_groups',p_service_group_ids));
end;
$function$;

create or replace function public.admin_update_user_access_company_only(
  p_user_id uuid,
  p_company_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean,
  p_access_type text,
  p_permissions jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_key text; v_val jsonb; v_any_active boolean;
BEGIN
  IF NOT public.is_company_gestor(p_company_id) THEN RAISE EXCEPTION 'Acesso permitido somente ao gestor da empresa'; END IF;
  IF p_role NOT IN ('GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO') THEN RAISE EXCEPTION 'Perfil inválido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_companies WHERE user_id=p_user_id AND company_id=p_company_id) THEN RAISE EXCEPTION 'Usuário não vinculado à empresa'; END IF;

  UPDATE public.user_companies SET role=p_role,active=p_active,store_id=NULL WHERE user_id=p_user_id AND company_id=p_company_id;
  SELECT EXISTS(SELECT 1 FROM public.user_companies WHERE user_id=p_user_id AND active=true) INTO v_any_active;
  UPDATE public.profiles SET full_name=upper(trim(p_full_name)),role=p_role,active=v_any_active,store_id=NULL,
         active_company_id=CASE WHEN v_any_active THEN active_company_id ELSE NULL END,updated_at=now()
   WHERE id=p_user_id;

  DELETE FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id;
  INSERT INTO public.user_permissions(user_id,company_id,permission_key,allowed,granted_by)
  VALUES(p_user_id,p_company_id,'access_type:'||upper(coalesce(nullif(trim(p_access_type),''),'PERSONALIZADO')),true,auth.uid());
  FOR v_key,v_val IN SELECT key,value FROM jsonb_each(coalesce(p_permissions,'{}'::jsonb)) LOOP
    IF NOT public.is_valid_permission_key(v_key) THEN
      RAISE EXCEPTION 'Chave de permissão inválida: %', v_key;
    END IF;
    INSERT INTO public.user_permissions(user_id,company_id,permission_key,allowed,granted_by)
    VALUES(p_user_id,p_company_id,v_key,coalesce((v_val::text)::boolean,false),auth.uid());
  END LOOP;
  INSERT INTO public.audit_log(user_id,company_id,area,action,entity_type,entity_id,new_data)
  VALUES(auth.uid(),p_company_id,'CONFIGURACOES','ALTERAR_USUARIO','PROFILE',p_user_id,jsonb_build_object('role',p_role,'active_na_empresa',p_active,'access_type',p_access_type,'permissions',p_permissions));
END $function$;
