-- ============================================================
-- Whirlpool -- ponte de controle entre o VoxAssist e o executor
-- externo (robô construído fora deste repositório, login no portal
-- Whirlpool/SAP + fila de importação de OS). Auditoria confirmou:
-- HOJE não existe nenhum dado compartilhado entre os dois lados --
-- esta migration cria a única fonte de verdade que ambos passam a
-- ler/escrever.
--
-- CONTRATO (repassar pro time que mantém o executor):
--   * O EXECUTOR (service_role, nunca authenticated) é dono de:
--     status, reason, next_retry_at, last_run_at, last_result,
--     last_imported_count, last_error, queue_pending_count,
--     queue_completed_count, is_running -- grava tudo isso a cada
--     ciclo/execução, direto via UPDATE (service_role ignora RLS).
--   * O VOXASSIST (via RPC abaixo, nunca UPDATE direto) só grava
--     force_sync_requested_at/force_sync_requested_by, quando o
--     GESTOR clica "Sincronizar agora".
--   * O EXECUTOR deve, a cada ciclo, checar se
--     force_sync_requested_at é mais recente que a última execução
--     que ele já processou -- se sim, ignora SÓ o next_retry_at
--     (nunca ignora is_running nem status='CREDENCIAIS_INVALIDAS' --
--     essas duas travas continuam valendo dos dois lados, VoxAssist E
--     executor, defesa em profundidade).
--   * Nunca grava senha, cookie nem token nesta tabela -- só estado
--     operacional (achado do usuário: "não expor senha, cookies ou
--     tokens").
--
-- status/reason são texto livre (sem CHECK) de propósito -- o
-- executor é dono do vocabulário real (hoje já usa pelo menos
-- AGUARDANDO_CONEXAO_WHIRLPOOL/PORTAL_INDISPONIVEL/
-- CREDENCIAIS_INVALIDAS, mas pode crescer) -- travar aqui quebraria
-- silenciosamente a cada status novo que o executor decidisse emitir.
-- Só 'CREDENCIAIS_INVALIDAS' tem tratamento especial (bloqueia
-- sincronização manual), comparado como string mesmo.
-- ============================================================

create table if not exists public.whirlpool_sync_status (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  status text,
  reason text,
  next_retry_at timestamptz,
  last_run_at timestamptz,
  last_result text,
  last_imported_count integer not null default 0,
  last_error text,
  queue_pending_count integer not null default 0,
  queue_completed_count integer not null default 0,
  is_running boolean not null default false,
  force_sync_requested_at timestamptz,
  force_sync_requested_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (company_id)
);
alter table public.whirlpool_sync_status enable row level security;

-- SELECT liberado pra qualquer usuário autenticado da empresa (é só
-- status operacional, nunca segredo) -- mesma amplitude de leitura já
-- usada em chat_connections. Nenhuma policy de INSERT/UPDATE/DELETE
-- pra authenticated -- o executor grava via service_role (ignora
-- RLS); o VoxAssist só grava via a RPC abaixo (SECURITY DEFINER).
drop policy if exists "whirlpool_sync_status_select_company" on public.whirlpool_sync_status;
create policy "whirlpool_sync_status_select_company" on public.whirlpool_sync_status
  as permissive for select to authenticated
  using (company_id = current_company_id());

comment on table public.whirlpool_sync_status is
  'Ponte de controle entre o VoxAssist e o executor externo do robô Whirlpool (login no portal + fila de importação de OS). Executor (service_role) é dono de status/reason/next_retry_at/last_*/queue_*/is_running. VoxAssist só grava force_sync_requested_at/by, via request_whirlpool_manual_sync -- nunca UPDATE direto. Nunca grava senha/cookie/token.';

-- ---------- Sincronizar agora (GESTOR estrito) ----------
create or replace function public.request_whirlpool_manual_sync(p_company_id uuid)
returns public.whirlpool_sync_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := current_company_role();
  v_row public.whirlpool_sync_status;
begin
  if p_company_id is distinct from current_company_id() then
    raise exception 'Empresa não corresponde à empresa ativa.';
  end if;
  if v_role is distinct from 'GESTOR' then
    raise exception 'Somente o GESTOR pode solicitar sincronização manual.';
  end if;

  select * into v_row from public.whirlpool_sync_status where company_id = p_company_id for update;
  if not found then
    raise exception 'Nenhum executor Whirlpool configurado para esta empresa.';
  end if;
  -- Achado do usuário: "não ignorar CREDENCIAIS_INVALIDAS -- nesse
  -- estado, o gestor precisa primeiro atualizar as credenciais". Trava
  -- também aqui (servidor), nunca só no botão desabilitado no frontend.
  if v_row.status = 'CREDENCIAIS_INVALIDAS' then
    raise exception 'Credenciais da Whirlpool inválidas -- atualize as credenciais antes de sincronizar.';
  end if;
  -- "Impedir cliques repetidos enquanto houver execução ativa" --
  -- checado com o lock (FOR UPDATE acima) já tomado, sem janela de
  -- corrida entre dois cliques quase simultâneos.
  if v_row.is_running then
    raise exception 'Já existe uma sincronização em andamento.';
  end if;

  update public.whirlpool_sync_status
    set force_sync_requested_at = now(), force_sync_requested_by = auth.uid()
    where company_id = p_company_id
    returning * into v_row;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  values (auth.uid(), p_company_id, 'WHIRLPOOL', 'SOLICITAR_SINCRONIZACAO_MANUAL', 'WHIRLPOOL_SYNC_STATUS', v_row.id,
    jsonb_build_object('status_no_momento', v_row.status, 'reason_no_momento', v_row.reason));

  return v_row;
end;
$$;
comment on function public.request_whirlpool_manual_sync is
  'GESTOR solicita ao executor externo que force uma tentativa de sincronização agora, ignorando só next_retry_at. Bloqueia se status=CREDENCIAIS_INVALIDAS ou is_running=true (servidor, não só o botão desabilitado). Nunca executa a sincronização em si -- só grava o pedido (force_sync_requested_at/by) pro executor externo detectar no próximo ciclo. Auditado em audit_log.';
grant execute on function public.request_whirlpool_manual_sync(uuid) to authenticated;
