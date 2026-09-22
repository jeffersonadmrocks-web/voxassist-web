-- Achado real (runs 35732822271 e 35751633147, 2026-09-22): as MESMAS 3 OS
-- (7015580021, 7015728303, 7015661850) falham em toda execução, cada vez
-- com um motivo diferente ("OS não localizada", "Botão Procurar não
-- localizado", "Tela de pesquisa de OS não carregou", "Formulário de
-- impressão não localizado") -- padrão consistente com instabilidade real
-- de timing na navegação SAP, não um bug determinístico único no código.
--
-- whirlpool_worker_job_failed só incrementa attempts e grava o último erro
-- -- nunca tira a OS de PENDENTE. Como a fila ("pending" em
-- whirlpool-worker-api/index.ts) sempre pega as 3 mais antigas
-- (order by created_at limit 3), essas mesmas 3 OS quebradas são
-- retentadas para sempre, run após run, e nenhuma OS nova consegue ser
-- processada enquanto elas não forem resolvidas manualmente -- a fila
-- inteira fica travada por um punhado de itens problemáticos.
--
-- Corrige adicionando um limite de tentativas: ao atingir 5 falhas, a OS
-- sai de PENDENTE e vai para ERRO (estado já existente no check
-- constraint desde a fundação, hoje só usado como proteção de índice --
-- nunca atribuído por nenhuma RPC). Isso libera a fila pra próxima OS
-- pendente sem apagar o histórico (attempts/last_error continuam
-- gravados) -- a OS em ERRO fica disponível pra revisão manual futura.
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
declare v_max_attempts constant integer := 5;
begin
  update public.whirlpool_import_queue
     set attempts = attempts + 1,
         last_error_code = nullif(left(coalesce(p_error_code, ''), 100), ''),
         last_error_message = nullif(left(coalesce(p_error_message, ''), 1600), ''),
         state = case when attempts + 1 >= v_max_attempts then 'ERRO' else state end,
         updated_at = now()
   where id = p_queue_id
     and state = 'PENDENTE';
end
$function$
;
revoke all on function public.whirlpool_worker_job_failed(uuid,text,text) from public, anon, authenticated;
grant execute on function public.whirlpool_worker_job_failed(uuid,text,text) to service_role;

comment on function public.whirlpool_worker_job_failed(uuid,text,text) is
  'Registra a falha de uma OS individual na fila (attempts+last_error). Continua elegível em PENDENTE até 5 tentativas; na 5a falha vai para ERRO (revisão manual) pra não travar a fila com o mesmo item pra sempre.';
