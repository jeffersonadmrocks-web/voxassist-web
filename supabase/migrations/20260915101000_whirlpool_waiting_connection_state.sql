-- Permite preservar importações enquanto o portal Whirlpool está temporariamente indisponível.
alter table public.whirlpool_import_queue
  drop constraint if exists whirlpool_import_queue_state_check;

alter table public.whirlpool_import_queue
  add constraint whirlpool_import_queue_state_check
  check (state in (
    'PENDENTE',
    'PROCESSANDO',
    'AGUARDANDO_OPERADOR',
    'AGUARDANDO_CONEXAO_WHIRLPOOL',
    'CONCLUIDO',
    'IGNORADO',
    'ERRO'
  ));
