-- ============================================================
-- Achado do usuário em 2026-09-07: o botão "RESET MASTER"
-- (master-reset-v0813.js) chama esta função no banco, mas ela nunca
-- tinha migration correspondente no repositório -- só existia
-- aplicada diretamente no Supabase, fora de qualquer controle de
-- versão/revisão (mesma situação já encontrada antes nesta sessão com
-- admin_update_user_access/admin_company_users). Documentando
-- retroativamente aqui a definição EXATA já ao vivo (via
-- pg_get_functiondef), sem alterar nenhum comportamento.
--
-- Propósito confirmado pelo usuário: resetar todos os dados
-- cadastrados durante este período de testes, pra permitir rodar o
-- sistema "limpo" (sem informações falsas) assim que for
-- efetivamente habilitado para uso real.
--
-- Comportamento real: apaga virtualmente todos os dados
-- operacionais da instalação (OS, clientes, equipamentos, financeiro,
-- pagamentos, peças/pedidos de peça, casos de atenção, agenda,
-- feriados, anexos, documentos técnicos, auditoria, estoque, dados
-- legados do System3, homologações, importações de fabricante) e
-- TODAS as empresas/lojas/vínculos de usuário -- inclusive apaga
-- todos os outros perfis de usuário (profiles), preservando só quem
-- executou o reset (com store_id/active_company_id/assinatura
-- zerados). Protegido por três camadas: 1) só GESTOR da empresa
-- ativa, 2) exige uma permissão explícita concedida
-- (user_permissions: admin:master_reset=true -- "Gate de Segurança",
-- não é liberada por padrão a ninguém), 3) exige digitar o texto de
-- confirmação exato "RESETAR VOXASSIST".
-- ============================================================
create or replace function public.master_reset_test_environment(confirm_text text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller uuid:=auth.uid();
  caller_company uuid;
begin
  if caller is null then raise exception 'Sessão inválida'; end if;
  select active_company_id into caller_company from public.profiles where id=caller and active=true;
  if caller_company is null or not public.is_company_gestor(caller_company) then
    raise exception 'Apenas gestor da empresa ativa pode executar o Reset Master';
  end if;
  if not exists(
    select 1 from public.user_permissions up
    where up.user_id=caller
      and up.company_id=caller_company
      and up.permission_key='admin:master_reset'
      and up.allowed=true
  ) then
    raise exception 'Reset Master bloqueado pelo Gate de Segurança';
  end if;
  if confirm_text<>'RESETAR VOXASSIST' then raise exception 'Confirmação inválida'; end if;

  update public.profiles set store_id=null,active_company_id=null,external_schedule_enabled=false,signature_data=null;
  delete from public.appointment_history where true; delete from public.appointments where true; delete from public.attachments where true; delete from public.audit_log where true;
  delete from public.client_addresses where true; delete from public.client_phones where true; delete from public.company_holidays where true; delete from public.company_schedule_settings where true;
  delete from public.dashboard_cases where true; delete from public.equipment_ownership_history where true; delete from public.homologation_tests where true; delete from public.manufacturer_imports where true;
  delete from public.os_parts where true; delete from public.payments where true; delete from public.parts_requests where true; delete from public.os_financial where true; delete from public.os_status_history where true;
  delete from public.stock_movements where true; delete from public.technician_stock where true; delete from public.technician_schedule_blocks where true; delete from public.whatsapp_history where true;
  delete from public.tasks where true; delete from public.technical_documents where true; delete from public.system3_legacy_records where true; delete from public.system3_legacy_files where true;
  delete from public.service_orders where true; delete from public.equipments where true; delete from public.clients where true; delete from public.stock_items where true;
  delete from public.user_permissions where true; delete from public.user_store_access where true; delete from public.user_companies where true; delete from public.stores where true; delete from public.companies where true;
  delete from public.profiles where id<>caller;
  return jsonb_build_object('ok',true,'preserved_user',caller,'mode','EMPRESA_ONLY','message','Ambiente reiniciado em modo Empresa-only.');
end;
$function$;
comment on function public.master_reset_test_environment is
  'Reset total do ambiente de testes (documentado retroativamente em 2026-09-07 -- já existia ao vivo no banco sem migration). Apaga todos os dados operacionais e todos os usuários exceto quem executa. Protegido por: GESTOR + permissão explícita admin:master_reset + texto de confirmação exato.';
