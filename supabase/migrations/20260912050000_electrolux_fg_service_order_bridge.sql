-- ============================================================
-- FG Electrolux -- Fase 1: bridge SVO <-> OS VoxAssist.
--
-- Auditoria (Fase 0, feita antes de qualquer alteração) confirmou:
-- NÃO EXISTE hoje nenhum vínculo entre atendimento Electrolux
-- (external_appointments) e OS VoxAssist (service_orders) -- são dois
-- mundos paralelos por decisão de design documentada
-- (electrolux_agenda_integration_v0825.sql: "Nunca vira OS
-- VoxAssist"). Essa decisão era certa pra AGENDA (nunca deve virar
-- OS), mas o usuário agora pede exatamente o oposto especificamente
-- pra FG: quando um atendimento é Fora de Garantia, ele DEVE virar
-- uma OS real, com a Electrolux como origem e o VoxAssist controlando
-- a operação a partir daí.
--
-- Achado extra desta auditoria: o campo que identifica o tipo de
-- atendimento (Garantia/Fora de Garantia/Seguradora/etc.) EXISTE na
-- resposta bruta da API Electrolux (usado ao vivo por
-- electrolux-reports-v0813.js via so.orderType, buscado direto do
-- endpoint) mas NUNCA foi persistido -- mapOrderToRow() em
-- supabase/functions/_shared/electrolux.ts descarta esse campo.
-- Complementado nesta mesma leva (ver diff do Edge Function).
--
-- Reaproveitado do schema atual: dashboard_cases (Casos de Atenção,
-- já genérico e sem CHECK em status/source -- usado aqui pro alerta
-- persistente, sem criar um segundo sistema de alertas), clients/
-- equipments (a OS abre no formulário padrão do VoxAssist, nunca um
-- formulário Electrolux paralelo), advance_service_order_status
-- (motor único de encerramento -- esta migration NUNCA avança nem
-- fecha uma OS sozinha, só registra o que a Electrolux informou).
-- ============================================================

-- ---------- ponte filial -> loja (item 5: nunca inferir manualmente) ----------
alter table public.electrolux_connections
  add column if not exists store_id uuid references public.stores(id);
comment on column public.electrolux_connections.store_id is
  'Loja (stores) correspondente a esta conexão/filial Electrolux -- toda OS FG criada a partir desta conexão herda este store_id automaticamente. Sem mapeamento, a criação de OS FG desta conexão é bloqueada (nunca infere loja manualmente).';

-- ---------- origem externa em service_orders (aditivo) ----------
alter table public.service_orders
  add column if not exists source text not null default 'VOXASSIST',
  add column if not exists external_order_number text,
  add column if not exists electrolux_connection_id uuid references public.electrolux_connections(id),
  add column if not exists electrolux_status_raw text,
  add column if not exists electrolux_closed_status text,
  add column if not exists electrolux_closed_at timestamptz,
  add column if not exists electrolux_conference_status text,
  add column if not exists electrolux_conferred_by uuid references public.profiles(id),
  add column if not exists electrolux_conferred_at timestamptz;

alter table public.service_orders add constraint service_orders_source_check check (source in ('VOXASSIST','ELECTROLUX'));
alter table public.service_orders add constraint service_orders_electrolux_conference_check check (electrolux_conference_status is null or electrolux_conference_status in ('AGUARDANDO_CONFERENCIA','CONFERIDO'));
-- Idempotência (item 15): a combinação empresa+conexão+SVO nunca pode
-- duplicar -- é a chave que a sincronização usa pra decidir upsert.
create unique index if not exists service_orders_electrolux_unique
  on public.service_orders (company_id, electrolux_connection_id, external_order_number)
  where (source = 'ELECTROLUX' and external_order_number is not null);

comment on column public.service_orders.source is
  'ELECTROLUX = criada a partir de um atendimento Electrolux (FG) -- preserva a origem durante toda a vida útil da OS. VOXASSIST = criada normalmente pelo app (default).';
comment on column public.service_orders.external_order_number is
  'SVO da Electrolux (mesmo número usado como os_number desta OS -- não passa pelo gerador padrão de numeração do VoxAssist). Null pra OS que não vieram de integração nenhuma.';
comment on column public.service_orders.electrolux_status_raw is
  'Último status bruto recebido da Electrolux pra esta SVO (ex.: "Aberta", "Encerrada", "Cancelada") -- histórico informativo, nunca decide o ciclo operacional interno.';
comment on column public.service_orders.electrolux_closed_status is
  'Preenchido na primeira vez que a Electrolux reportou este SVO como encerrado/cancelado. Regra crítica do usuário: ENCERRADA NA ELECTROLUX != ENCERRADA NO VOXASSIST -- isto NUNCA altera service_orders.status sozinho, só sinaliza a pendência de conferência.';
comment on column public.service_orders.electrolux_conference_status is
  'AGUARDANDO_CONFERENCIA = a Electrolux encerrou mas o gestor ainda não conferiu; CONFERIDO = já conferido (o encerramento efetivo no VoxAssist continua sendo o fluxo normal de advance_service_order_status, não isto aqui).';

-- ---------- upsert idempotente (chamado pelo sync, service_role) ----------
create or replace function public.upsert_electrolux_fg_service_order(
  p_connection_id uuid,
  p_svo_number text,
  p_client_name text,
  p_client_phone text,
  p_product_name text,
  p_claimed_defect text,
  p_electrolux_status_raw text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_conn record;
  v_os_id uuid;
  v_client_id uuid;
  v_is_closed boolean;
  v_already_closed_at timestamptz;
  v_internal_status text;
  v_case_exists boolean;
begin
  if coalesce(trim(p_svo_number), '') = '' then
    raise exception 'SVO obrigatório';
  end if;

  select id, company_id, store_id, active into v_conn from public.electrolux_connections where id = p_connection_id;
  if v_conn.id is null then raise exception 'Conexão Electrolux não encontrada'; end if;
  if v_conn.store_id is null then
    -- Item 5: nunca infere loja manualmente -- sem o mapeamento
    -- explícito (electrolux_connections.store_id), a OS FG desta
    -- conexão fica bloqueada até alguém configurar o vínculo.
    raise exception 'Conexão Electrolux % sem loja mapeada (electrolux_connections.store_id) -- configure antes de sincronizar FG.', p_connection_id;
  end if;

  -- item 7: "Encerrada"/"Cancelada" na Electrolux é só um evento
  -- externo, nunca decide o status operacional aqui.
  v_is_closed := p_electrolux_status_raw in ('Encerrada', 'Cancelada');

  select id, electrolux_closed_at, status
    into v_os_id, v_already_closed_at, v_internal_status
  from public.service_orders
  where company_id = v_conn.company_id and electrolux_connection_id = p_connection_id and external_order_number = p_svo_number;

  if v_os_id is not null then
    -- OS já existe: item 6 -- sincronização NUNCA sobrescreve o que já
    -- é gestão VoxAssist (cliente/equipamento/status/financeiro). Só
    -- atualiza os campos de rastreio do lado Electrolux.
    update public.service_orders
      set electrolux_status_raw = p_electrolux_status_raw,
          electrolux_closed_status = case when v_is_closed and electrolux_closed_at is null then p_electrolux_status_raw else electrolux_closed_status end,
          electrolux_closed_at = case when v_is_closed and electrolux_closed_at is null then now() else electrolux_closed_at end,
          electrolux_conference_status = case when v_is_closed and electrolux_closed_at is null and v_internal_status not in ('FINALIZADA','CANCELADA','ORCAMENTO RECUSADO ENCERRADO') then 'AGUARDANDO_CONFERENCIA' else electrolux_conference_status end
      where id = v_os_id;

    -- item 8/9: alerta persistente, criado só na PRIMEIRA vez que o
    -- encerramento externo é detectado (idempotente -- item 15: syncs
    -- repetidos não duplicam alerta) e só se a OS ainda não estiver
    -- encerrada de verdade no VoxAssist.
    if v_is_closed and v_already_closed_at is null and v_internal_status not in ('FINALIZADA','CANCELADA','ORCAMENTO RECUSADO ENCERRADO') then
      select exists(
        select 1 from public.dashboard_cases
        where service_order_id = v_os_id and source = 'ELECTROLUX_FG_ENCERRADA' and status not in ('RESOLVIDO','CANCELADO')
      ) into v_case_exists;
      if not v_case_exists then
        insert into public.dashboard_cases (service_order_id, title, message, priority, source, company_id)
        values (
          v_os_id, 'FG Electrolux encerrada — conferir OS VoxAssist',
          format('SVO %s foi encerrada na Electrolux. A OS permanece aberta no VoxAssist e necessita de conferência para encerramento.', p_svo_number),
          'ALTA', 'ELECTROLUX_FG_ENCERRADA', v_conn.company_id
        );
      end if;
    end if;

    return v_os_id;
  end if;

  -- OS nova: item 3 -- aproveita os dados disponíveis, nunca duplica
  -- cliente desnecessariamente (match simples por telefone; sem CPF/
  -- CNPJ disponível na listagem da Electrolux hoje).
  if coalesce(trim(p_client_phone), '') <> '' then
    select id into v_client_id
    from public.clients
    where company_id = v_conn.company_id and phone_primary = p_client_phone
    limit 1;
  end if;

  if v_client_id is null then
    insert into public.clients (name, phone_primary, company_id)
    values (coalesce(nullif(trim(p_client_name), ''), 'Cliente Electrolux ' || p_svo_number), nullif(trim(p_client_phone), ''), v_conn.company_id)
    returning id into v_client_id;
  end if;

  declare
    v_equipment_id uuid;
  begin
    insert into public.equipments (current_client_id, product_type, company_id)
    values (v_client_id, coalesce(nullif(trim(p_product_name), ''), 'NÃO INFORMADO'), v_conn.company_id)
    returning id into v_equipment_id;

    insert into public.service_orders (
      os_number, client_id, equipment_id, store_id, service_type, order_type,
      reported_defect, source, external_order_number, electrolux_connection_id,
      electrolux_status_raw, electrolux_closed_status, electrolux_closed_at, electrolux_conference_status,
      company_id
    ) values (
      p_svo_number, v_client_id, v_equipment_id, v_conn.store_id, 'EXTERNO', 'FORA DE GARANTIA',
      p_claimed_defect, 'ELECTROLUX', p_svo_number, p_connection_id,
      p_electrolux_status_raw,
      case when v_is_closed then p_electrolux_status_raw end,
      case when v_is_closed then now() end,
      case when v_is_closed then 'AGUARDANDO_CONFERENCIA' end,
      v_conn.company_id
    ) returning id into v_os_id;
  end;

  if v_is_closed then
    insert into public.dashboard_cases (service_order_id, title, message, priority, source, company_id)
    values (
      v_os_id, 'FG Electrolux encerrada — conferir OS VoxAssist',
      format('SVO %s já chegou encerrada na Electrolux. A OS foi criada no VoxAssist e necessita de conferência para encerramento.', p_svo_number),
      'ALTA', 'ELECTROLUX_FG_ENCERRADA', v_conn.company_id
    );
  end if;

  return v_os_id;
end;
$$;
comment on function public.upsert_electrolux_fg_service_order is
  'Cria (na primeira vez) ou atualiza (só os campos de rastreio Electrolux) a OS FG correspondente a um SVO. Chamada pelo sync (service_role), nunca exposta ao app -- sem GRANT pra authenticated. Nunca sobrescreve cliente/equipamento/status/financeiro de uma OS já existente -- item 6/7 da especificação.';

-- ---------- conferência (item 10: nunca encerra, só marca conferido) ----------
create or replace function public.confer_electrolux_fg_closure(p_service_order_id uuid, p_dashboard_case_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.service_orders where id = p_service_order_id;
  if v_company_id is null then raise exception 'OS não encontrada'; end if;
  if not is_company_gestor(v_company_id) then raise exception 'Acesso permitido somente ao gestor da empresa'; end if;

  update public.service_orders
    set electrolux_conference_status = 'CONFERIDO', electrolux_conferred_by = auth.uid(), electrolux_conferred_at = now()
    where id = p_service_order_id;

  update public.dashboard_cases
    set status = 'RESOLVIDO', updated_at = now()
    where service_order_id = p_service_order_id and source = 'ELECTROLUX_FG_ENCERRADA' and status not in ('RESOLVIDO','CANCELADO')
      and (p_dashboard_case_id is null or id = p_dashboard_case_id);
end;
$$;
comment on function public.confer_electrolux_fg_closure is
  'Marca a conferência do encerramento externo como feita e resolve o alerta -- NUNCA encerra a OS (isso continua sendo o fluxo normal, advance_service_order_status, disparado pelo SALVAR/FINALIZAR de sempre). Gestor-only.';
grant execute on function public.confer_electrolux_fg_closure(uuid, uuid) to authenticated;
