-- Botão "Sincronizar agora" do GESTOR para o robô Whirlpool.
-- Não existe workflow_dispatch acionável a partir do Supabase (o worker
-- só roda via cron do GitHub Actions a cada ~15min ou push em main), então
-- "forçar agora" aqui significa: liberar a próxima tentativa automática
-- zerando next_retry_at, nunca disparar o worker de fato. Nunca ignora
-- CREDENCIAIS_INVALIDAS, PAUSADO nem um lock de worker em andamento --
-- mesma disciplina de whirlpool_worker_claim (2026-09-14).
CREATE OR REPLACE FUNCTION public.whirlpool_request_manual_sync(p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.whirlpool_connections;
begin
  select * into c from public.whirlpool_connections where id = p_connection_id for update;
  if not found then
    raise exception 'Conexão Whirlpool não encontrada';
  end if;
  if not public.whirlpool_is_company_manager(c.company_id) then
    raise exception 'Apenas gestor ativo pode solicitar sincronização manual da Whirlpool';
  end if;
  if not c.active or c.connection_status = 'NAO_CONFIGURADO' then
    raise exception 'Conexão Whirlpool ainda não configurada -- cadastre as credenciais antes de sincronizar';
  end if;
  if c.connection_status = 'CREDENCIAIS_INVALIDAS' then
    raise exception 'Credenciais da Whirlpool inválidas -- atualize a senha antes de forçar uma sincronização';
  end if;
  if c.connection_status = 'PAUSADO' then
    raise exception 'Robô Whirlpool está pausado -- retome antes de forçar uma sincronização';
  end if;

  if c.worker_lock_expires_at is not null and c.worker_lock_expires_at > now() then
    return jsonb_build_object('ok', true, 'already_running', true);
  end if;

  update public.whirlpool_connections
     set next_retry_at = null, updated_at = now()
   where id = c.id;

  insert into public.whirlpool_sync_events(company_id, connection_id, event_type, event_data)
  values (c.company_id, c.id, 'MANUAL_SYNC_REQUESTED',
    jsonb_build_object('requested_by', (select auth.uid())));

  return jsonb_build_object('ok', true, 'already_running', false);
end
$function$
;
revoke all on function public.whirlpool_request_manual_sync(uuid) from public, anon;
grant execute on function public.whirlpool_request_manual_sync(uuid) to authenticated;

comment on function public.whirlpool_request_manual_sync(uuid) is
  'GESTOR força a liberação da próxima janela de sincronização (zera next_retry_at) sem nunca ignorar CREDENCIAIS_INVALIDAS, PAUSADO ou um lock de worker ativo.';
