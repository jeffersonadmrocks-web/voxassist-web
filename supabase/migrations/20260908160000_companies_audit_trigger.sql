-- ============================================================
-- Matriz Mestra, Área 09 (Sistema & Segurança) -- "Auditoria"
-- CONSOLIDAR confirmado: `audit_log` já existe e já é usado por
-- admin_soft_delete_user/admin_update_user_access(_company_only)/
-- master_reset_test_environment (achado do C2, 2026-09-08) -- mas
-- nenhuma alteração de dado da EMPRESA (razão social, CNPJ,
-- endereço, e os parâmetros novos desta sessão: financeiros,
-- tempo de inatividade) fica registrada em lugar nenhum. Edição de
-- `companies` hoje é sempre por PATCH direto (companies_update_gestor
-- RLS), nunca por RPC -- instrumentar manualmente cada tela que edita
-- a empresa duplicaria lógica e ficaria fácil de esquecer numa tela
-- nova. Resolvido na fonte única: TRIGGER de banco, captura
-- QUALQUER UPDATE em `companies`, não importa por onde passou.
--
-- Escopo desta etapa é só `companies` (mais sensível: CNPJ, dados
-- fiscais, parâmetros financeiros). Estender pra outras tabelas
-- fica pra uma etapa futura, avaliando ruído x valor caso a caso
-- (ex.: service_orders muda de status com muita frequência via o
-- motor automático -- já tem seu próprio histórico em
-- os_status_history, duplicar em audit_log merece decisão à parte).
-- ============================================================

create or replace function public.audit_log_companies_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_jsonb(old) is distinct from to_jsonb(new) then
    insert into public.audit_log (company_id, user_id, area, action, entity_type, entity_id, old_data, new_data)
    values (new.id, auth.uid(), 'EMPRESA', 'UPDATE', 'companies', new.id, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end;
$$;
comment on function public.audit_log_companies_change is
  'Registra em audit_log qualquer UPDATE em companies (razão social, CNPJ, endereço, parâmetros financeiros/segurança), não importa se veio de RPC ou PATCH direto -- fonte única, não pode ser esquecida numa tela nova.';

drop trigger if exists trg_audit_log_companies_change on public.companies;
create trigger trg_audit_log_companies_change
  after update on public.companies
  for each row execute function public.audit_log_companies_change();
