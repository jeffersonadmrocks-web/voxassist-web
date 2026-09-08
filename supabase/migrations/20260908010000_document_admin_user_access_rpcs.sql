-- VoxAssist -- documentação retroativa de RPCs que existiam em produção
-- sem migration versionada (achado do levantamento de Configurações,
-- 2026-09-08, item C2 da Matriz Mestra -- CONFIGURACOES_MATRIZ.md).
-- Corpo capturado via pg_get_functiondef, aplicado como "create or
-- replace" com o MESMO corpo -- zero mudança de comportamento.
--
-- admin_soft_delete_user: inativa o vínculo do usuário com a empresa
-- (user_companies.active=false) e, se o usuário não tiver mais nenhum
-- vínculo ativo em nenhuma empresa, inativa também profiles.active.
-- Gestor-only (is_company_gestor), não permite auto-exclusão, grava
-- audit_log (area='CONFIGURACOES', action='INATIVAR_EXCLUIR_USUARIO').
create or replace function public.admin_soft_delete_user(p_user_id uuid, p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF NOT public.is_company_gestor(p_company_id) THEN RAISE EXCEPTION 'Acesso permitido somente ao gestor da empresa'; END IF;
  IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'Você não pode excluir seu próprio usuário'; END IF;
  UPDATE public.user_companies SET active=false,store_id=NULL WHERE user_id=p_user_id AND company_id=p_company_id;
  IF NOT EXISTS(SELECT 1 FROM public.user_companies WHERE user_id=p_user_id AND active=true) THEN
    UPDATE public.profiles SET active=false,active_company_id=NULL,store_id=NULL,updated_at=now() WHERE id=p_user_id;
  END IF;
  INSERT INTO public.audit_log(user_id,company_id,area,action,entity_type,entity_id)
  VALUES(auth.uid(),p_company_id,'CONFIGURACOES','INATIVAR_EXCLUIR_USUARIO','PROFILE',p_user_id);
END $function$;
comment on function public.admin_soft_delete_user is
  'Documentação retroativa 2026-09-08 (corpo idêntico ao já em produção). Inativa vínculo usuário-empresa (e o profile inteiro se sem nenhum vínculo ativo restante). Gestor-only, bloqueia auto-exclusão, grava audit_log.';

-- admin_update_user_access_company_only: variante "empresa-only" (sem
-- loja) de admin_update_user_access -- grava role/active/permissões
-- do usuário PARA UMA EMPRESA ESPECÍFICA, sempre limpando e
-- reinserindo (DELETE + INSERT) todas as linhas de user_permissions
-- daquele par (user_id, company_id). Não valida a chave de permissão
-- recebida contra nenhum catálogo -- aceita qualquer texto em
-- p_permissions (raiz do conflito C3 da Matriz Mestra: 3 catálogos de
-- chave incompatíveis hoje conseguem gravar aqui livremente). Gestor-
-- only, valida role contra os 5 valores permitidos, grava audit_log
-- (area='CONFIGURACOES', action='ALTERAR_USUARIO').
create or replace function public.admin_update_user_access_company_only(
  p_user_id uuid,
  p_company_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean,
  p_access_type text,
  p_permissions jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    INSERT INTO public.user_permissions(user_id,company_id,permission_key,allowed,granted_by)
    VALUES(p_user_id,p_company_id,v_key,coalesce((v_val::text)::boolean,false),auth.uid());
  END LOOP;
  INSERT INTO public.audit_log(user_id,company_id,area,action,entity_type,entity_id,new_data)
  VALUES(auth.uid(),p_company_id,'CONFIGURACOES','ALTERAR_USUARIO','PROFILE',p_user_id,jsonb_build_object('role',p_role,'active_na_empresa',p_active,'access_type',p_access_type,'permissions',p_permissions));
END $function$;
comment on function public.admin_update_user_access_company_only is
  'Documentação retroativa 2026-09-08 (corpo idêntico ao já em produção). Grava role/active/permissões de um usuário numa empresa específica -- SEM validar permission_key contra catálogo nenhum (raiz do conflito C3, ver CONFIGURACOES_MATRIZ.md). Gestor-only, grava audit_log.';
