-- RECORD ONLY: these migrations were already applied to Supabase project dgasmtvpgifceyqufcfg on 2026-08-29.
-- Do not run blindly. Kept in Git for review/audit.

-- Migration 1: harden_admin_rpcs_dashboard_p0
-- * revoke anon/public EXECUTE from administrative RPCs
-- * admin_update_user_access validates is_company_gestor(target company)
-- * switch_store requires active company/store authorization
-- * master_reset_test_environment requires company gestor + admin:master_reset permission

-- Migration 2: harden_trigger_functions_and_search_path
-- * revoke anon/authenticated RPC execution from internal trigger functions
-- * pin search_path for sync_client_document_digits and operational priority functions

-- Validate current grants using:
-- select has_function_privilege('anon','public.admin_company_users(uuid)','EXECUTE');
-- select has_function_privilege('anon','public.switch_store(uuid)','EXECUTE');
-- select has_function_privilege('authenticated','public.trg_sync_operational_task_from_service_order()','EXECUTE');
