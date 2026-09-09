-- ============================================================
-- Matriz Mestra, Área 08 (Integrações) -- "Última sincronização /
-- logs / config detalhada" -- REAPROVEITAR confirmado:
-- `electrolux_connections.last_sync_at`/`last_sync_error` já
-- existem e já são gravados pelo fluxo real de sincronização --
-- só faltava expor em Configurações.
--
-- Achado de segurança ao investigar: `electrolux_connections` tem
-- RLS habilitado SEM NENHUMA policy (bloqueio total via PostgREST,
-- endurecimento proposital de sessão anterior -- a tabela guarda
-- `credential_secret_name`). Por isso NÃO se cria uma policy de
-- SELECT direta na tabela (exporia a linha inteira, credencial
-- inclusa) -- em vez disso, uma RPC devolve só os 2 campos seguros
-- (nunca a credencial), mantendo o endurecimento intocado.
-- ============================================================

create or replace function public.get_electrolux_sync_status(p_company_id uuid)
returns table (last_sync_at timestamptz, last_sync_error text, connections_with_error int)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_company_id is null or p_company_id <> public.current_company_id() then
    raise exception 'Acesso permitido somente à empresa ativa do usuário.';
  end if;

  return query
    select
      max(c.last_sync_at),
      (select c2.last_sync_error from public.electrolux_connections c2
        where c2.company_id = p_company_id and c2.last_sync_error is not null
        order by c2.last_sync_at desc nulls last limit 1),
      (select count(*)::int from public.electrolux_connections c3
        where c3.company_id = p_company_id and c3.last_sync_error is not null)
    from public.electrolux_connections c
    where c.company_id = p_company_id;
end;
$$;
comment on function public.get_electrolux_sync_status is
  'Devolve só última sincronização/erro/contagem de erro do Electrolux pra empresa -- nunca a credencial (credential_secret_name), respeitando o endurecimento de electrolux_connections (RLS sem policy de SELECT direta).';

grant execute on function public.get_electrolux_sync_status(uuid) to authenticated;
