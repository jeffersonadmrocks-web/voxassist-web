-- Robô Whirlpool: hoje uma falha ao processar uma OS específica (ex.: PDF
-- não localizado, OS não encontrada na pesquisa) só aparece no log do
-- GitHub Actions -- a linha da fila (whirlpool_import_queue) permanece
-- PENDENTE sem nenhum rastro, como se nada tivesse sido tentado. Esta RPC
-- registra a tentativa (attempts+1, last_error_code, last_error_message)
-- sem tirar a OS da fila nem bloquear a próxima tentativa automática --
-- só o worker (service_role) chama, nunca o frontend.
CREATE OR REPLACE FUNCTION public.whirlpool_worker_job_failed(
  p_queue_id uuid,
  p_error_code text,
  p_error_message text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.whirlpool_import_queue
     set attempts = attempts + 1,
         last_error_code = nullif(left(coalesce(p_error_code, ''), 100), ''),
         last_error_message = nullif(left(coalesce(p_error_message, ''), 1600), ''),
         updated_at = now()
   where id = p_queue_id
     and state = 'PENDENTE';
end
$function$
;
revoke all on function public.whirlpool_worker_job_failed(uuid,text,text) from public, anon, authenticated;
grant execute on function public.whirlpool_worker_job_failed(uuid,text,text) to service_role;

comment on function public.whirlpool_worker_job_failed(uuid,text,text) is
  'Registra a falha de uma OS individual na fila (attempts+last_error) sem removê-la de PENDENTE -- a OS continua elegível para a próxima tentativa automática.';
