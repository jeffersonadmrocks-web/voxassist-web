-- ============================================================
-- Financeiro (fase 2) -- register_payment / reverse_payment.
--
-- Decisão do usuário: parar de deixar o frontend montar a consistência
-- financeira via INSERT/UPDATE/DELETE direto em `payments`. Duas
-- operações explícitas (nunca um RPC genérico "financial_operation"):
--
--   register_payment  -- porta oficial de criação de um recebimento
--                         (uma OU mais formas de pagamento na mesma
--                         chamada, ex.: PIX+Crédito na mesma venda).
--   reverse_payment   -- estorno como NOVA transação vinculada à
--                         original (nunca DELETE, nunca reescreve a
--                         linha original), total ou parcial.
--
-- MODELAGEM ESCOLHIDA (auditado o schema real antes de criar qualquer
-- coisa nova):
--
-- * MÚLTIPLAS FORMAS NUMA MESMA OPERAÇÃO (ex.: R$600 PIX + R$400
--   Crédito): cada forma vira sua PRÓPRIA linha em `payments` (mesmo
--   modelo de "pagamento parcial é nativo" já usado pelo resto do
--   app), todas marcadas com o mesmo `operation_id` (gerado uma vez
--   por chamada de register_payment) -- sem payment_method_1/2 nem
--   tabela nova. Uma forma só = uma linha com operation_id próprio.
--
-- * ESTORNO: cada estorno é uma NOVA linha (nunca UPDATE/DELETE da
--   original), valor NEGATIVO, method igual ao original,
--   `reversal_of_payment_id` apontando pra original. Sem UNIQUE em
--   reversal_of_payment_id -- vários estornos parciais podem apontar
--   pra mesma original; a soma nunca pode ultrapassar o valor
--   original (validado no RPC, com lock -- ver seção de concorrência
--   abaixo). Status do estorno é 'ESTORNO' (contado normalmente em
--   qualquer soma -- é o valor NEGATIVO que zera o líquido
--   automaticamente). A original ganha só `reversal_state`
--   (PARCIAL/TOTAL), informativo, nunca muda de status.
--
-- * AUDITORIA: reaproveita public.audit_log (já usada por
--   admin_update_user_access e outras RPCs administrativas) -- nenhuma
--   tabela de log nova. A própria linha de `payments` também já
--   responde quem/quando/empresa/valor/OS/forma/original/motivo.
-- ============================================================

alter table public.payments add column if not exists operation_id uuid not null default gen_random_uuid();
alter table public.payments add column if not exists reversal_of_payment_id uuid references public.payments(id);
alter table public.payments add column if not exists reversal_reason text;
alter table public.payments add column if not exists reversal_state text;
alter table public.payments add column if not exists idempotency_key text;

alter table public.payments drop constraint if exists payments_reversal_state_check;
alter table public.payments add constraint payments_reversal_state_check
  check (reversal_state is null or reversal_state in ('PARCIAL','TOTAL'));

-- ============================================================
-- CORREÇÕES da revisão independente (ChatGPT), antes do deploy real.
-- A arquitetura acima foi aprovada; os 8 pontos abaixo corrigem
-- lacunas encontradas nela. Numeração igual à da revisão.
-- ============================================================

-- ---- 2) DESCONTO não é recebimento ----
-- payment_methods.is_discount marca estruturalmente qual forma é
-- desconto (hoje só "DESCONTO", mas não depende do nome literal daqui
-- pra frente -- corrige a fragilidade já documentada desde a migration
-- 20260908040000: "renomear o registro DESCONTO quebra silenciosamente
-- a lógica"). register_payment usa essa flag pra gravar status=
-- 'DESCONTO' (não 'RECEBIDO') nessas linhas -- continuam contando pro
-- saldo/paid_total da OS (não são excluídas de nada que precise saber
-- "quanto falta pra fechar a OS"), mas ficam estruturalmente distintas
-- de dinheiro de verdade pra Recebimentos/Caixa/produtividade (as
-- telas já filtravam por method='DESCONTO' -- mantido como segunda
-- checagem por compatibilidade, mas agora existe um sinal robusto que
-- não depende de string).
alter table public.payment_methods add column if not exists is_discount boolean not null default false;
update public.payment_methods set is_discount = true where upper(name) = 'DESCONTO' and not is_discount;

-- Vocabulário de status com integridade real no banco (não havia
-- CHECK nenhum antes desta fase). 'ESTORNO' e 'DESCONTO' são os
-- valores novos, gerados só pelas RPCs abaixo; os demais são legados
-- (nunca produzidos pelo app hoje, mantidos por segurança retroativa).
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (upper(status) in ('PENDENTE','RECEBIDO','ESTORNO','DESCONTO','CANCELADO','CANCELADA','ESTORNADO','ESTORNADA'));

-- ---- 3) idempotência resistente a concorrência ----
-- Um SELECT-depois-INSERT no corpo do RPC tem uma janela de corrida
-- real entre duas chamadas simultâneas com a mesma chave. Uma
-- UNIQUE(company_id, idempotency_key) direto em `payments` NÃO
-- funciona aqui -- uma operação com várias formas (PIX+Crédito) gera
-- várias linhas com a MESMA idempotency_key de propósito. A chave
-- então não identifica uma LINHA, identifica uma OPERAÇÃO -- por isso
-- vira uma tabela própria, pequena, com a UNIQUE de verdade
-- (company_id, idempotency_key) -> operation_id, resolvida de forma
-- atômica (INSERT ... ON CONFLICT + lock de linha) antes de tocar em
-- `payments`. Duas chamadas concorrentes com a mesma chave resolvem
-- pro MESMO operation_id; a segunda espera a primeira terminar (lock)
-- e aí enxerga os pagamentos já criados pela primeira, devolvendo-os
-- em vez de duplicar.
create table if not exists public.payment_operations (
  company_id uuid not null references public.companies(id),
  idempotency_key text not null,
  operation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  primary key (company_id, idempotency_key)
);
alter table public.payment_operations enable row level security;
drop policy if exists "payment_operations_company" on public.payment_operations;
create policy "payment_operations_company" on public.payment_operations
  as permissive for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- ---- 5) permissões financeiras -- catálogo oficial reaproveitado ----
-- Nenhum catálogo novo: financeiro.reverse entra no MESMO catálogo
-- único já existente (is_valid_permission_key, migration
-- 20260908200000 -- fonte de verdade também de
-- permissions-catalog-v0901.js/user-access-management-v0813.js).
-- register_payment: liberado pra quem já podia (role<>TECNICO, mesma
-- regra de can('financeiro') no frontend) OU tem financeiro.edit
-- concedido individualmente (ex.: um TECNICO liberado via matriz).
-- reverse_payment: por padrão só GESTOR (estorno mexe em dinheiro já
-- confirmado -- mais sensível que só lançar) OU quem tiver
-- financeiro.reverse concedido individualmente -- não assume que
-- "qualquer um que não seja TECNICO" pode estornar.
create or replace function public.is_valid_permission_key(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key in (
    'os.view','os.create','os.edit','os.cancel','os.status','os.print','os.financial',
    'whirlpool.view','whirlpool.edit',
    'agenda.view_all','agenda.view_own','agenda.edit','agenda.drag','agenda.block',
    'financeiro.view','financeiro.edit','financeiro.export','financeiro.reverse',
    'estoque.view','estoque.edit',
    'relatorios.view','relatorios.export',
    'config.view','config.users','config.companies'
  );
$$;
comment on function public.is_valid_permission_key is
  'Catálogo único de chaves de permissão válidas. financeiro.reverse (Estornar recebimentos) adicionado em 2026-09-13 pra register_payment/reverse_payment reaproveitarem o mesmo catálogo em vez de inventar um novo -- mesma função usada por admin_update_user_access/admin_update_user_access_company_only.';

-- ---- 6) imutabilidade -- lista de campos travados ampliada ----
-- A versão anterior só travava amount/method/company_id/
-- service_order_id numa transação confirmada. Passa a travar também
-- paid_at, created_by, operation_id, reversal_of_payment_id,
-- reversal_reason e idempotency_key -- são todos campos de
-- origem/auditoria, não fazem sentido mudarem depois que o dinheiro já
-- foi processado. reversal_state fica de fora de propósito (é o único
-- campo que reverse_payment precisa atualizar na linha original depois
-- de confirmada). DESCONTO entra na lista de status "confirmado" (a
-- linha de desconto também não deve ser adulterada depois de gravada).
create or replace function public.payments_lock_confirmed_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('RECEBIDO','ESTORNO','DESCONTO') then
    if new.amount is distinct from old.amount
      or new.method is distinct from old.method
      or new.company_id is distinct from old.company_id
      or new.service_order_id is distinct from old.service_order_id
      or new.paid_at is distinct from old.paid_at
      or new.created_by is distinct from old.created_by
      or new.operation_id is distinct from old.operation_id
      or new.reversal_of_payment_id is distinct from old.reversal_of_payment_id
      or new.reversal_reason is distinct from old.reversal_reason
      or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'Recebimento confirmado não pode ter seus dados de origem alterados -- use reverse_payment e um novo lançamento.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_lock_confirmed_fields on public.payments;
create trigger trg_payments_lock_confirmed_fields
  before update on public.payments
  for each row
  execute function public.payments_lock_confirmed_fields();

-- ---- register_payment ----
-- ---- 1) porta oficial de verdade ----
-- SECURITY DEFINER: com a migration 20260913080000 corrigida (a
-- policy permissiva de payments virou só select/update-pending/
-- delete-pending -- nenhum INSERT direto sobra pra usuário comum),
-- esta função passa a ser o ÚNICO jeito de criar um pagamento
-- confirmado. Como SECURITY DEFINER contorna a RLS de payments (mas
-- NUNCA a de service_orders/payment_methods, consultadas normalmente
-- abaixo), toda validação de empresa/OS/forma/permissão que a RLS
-- fazia "de graça" antes precisa estar explícita aqui -- e já estava,
-- desde a primeira versão desta migration.
create or replace function public.register_payment(
  p_service_order_id uuid,
  p_components jsonb,
  p_notes text default null,
  p_due_date date default null,
  p_paid_at timestamptz default null,
  p_installments integer default 1,
  p_idempotency_key text default null
)
returns setof public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_role text := current_company_role();
  v_operation_id uuid;
  v_component jsonb;
  v_method text;
  v_amount numeric;
begin
  if not (v_role <> 'TECNICO' or public.current_user_has_permission('financeiro.edit')) then
    raise exception 'Sem permissão para registrar recebimentos.';
  end if;

  if p_service_order_id is not null then
    if not exists (select 1 from public.service_orders where id = p_service_order_id and company_id = v_company_id) then
      raise exception 'OS não encontrada nesta empresa.';
    end if;
    if v_role <> 'GESTOR' and exists (
      select 1 from public.service_orders where id = p_service_order_id and status = 'FINALIZADA'
    ) then
      raise exception 'OS finalizada só pode ser alterada pelo GESTOR.';
    end if;
  end if;

  if jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento.';
  end if;

  -- 3) idempotência: resolve/reserva o operation_id ANTES de validar
  -- os componentes, com lock de linha -- ver comentário na criação de
  -- payment_operations acima.
  if p_idempotency_key is not null then
    insert into public.payment_operations (company_id, idempotency_key, operation_id)
    values (v_company_id, p_idempotency_key, gen_random_uuid())
    on conflict (company_id, idempotency_key) do nothing;

    select operation_id into v_operation_id
      from public.payment_operations
      where company_id = v_company_id and idempotency_key = p_idempotency_key
      for update;

    if exists (select 1 from public.payments where operation_id = v_operation_id) then
      return query select * from public.payments where operation_id = v_operation_id order by created_at;
      return;
    end if;
  else
    v_operation_id := gen_random_uuid();
  end if;

  for v_component in select * from jsonb_array_elements(p_components) loop
    v_method := v_component->>'method';
    v_amount := nullif(v_component->>'amount','')::numeric;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Valor inválido para a forma %', coalesce(v_method,'(?)');
    end if;
    if v_method is null or not exists (
      select 1 from public.payment_methods
      where company_id = v_company_id and active and upper(name) = upper(v_method)
    ) then
      raise exception 'Forma de pagamento inválida ou inativa: %', coalesce(v_method,'(?)');
    end if;
  end loop;

  return query
    insert into public.payments (
      service_order_id, company_id, amount, method, status, due_date, paid_at,
      installments, notes, created_by, operation_id, idempotency_key
    )
    select
      p_service_order_id, v_company_id,
      (c->>'amount')::numeric, c->>'method',
      case when pm.is_discount then 'DESCONTO' else 'RECEBIDO' end,
      p_due_date, coalesce(p_paid_at, now()),
      greatest(1, coalesce(p_installments,1)), p_notes, auth.uid(), v_operation_id, p_idempotency_key
    from jsonb_array_elements(p_components) c
    join public.payment_methods pm
      on pm.company_id = v_company_id and pm.active and upper(pm.name) = upper(c->>'method')
    returning *;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, new_data)
  select auth.uid(), v_company_id, 'FINANCEIRO', 'REGISTRAR_RECEBIMENTO', 'PAYMENT', p.id,
    jsonb_build_object('amount', p.amount, 'method', p.method, 'status', p.status, 'service_order_id', p.service_order_id, 'operation_id', p.operation_id)
  from public.payments p where p.operation_id = v_operation_id;
end;
$$;

-- ---- reverse_payment ----
create or replace function public.reverse_payment(
  p_payment_id uuid,
  p_reason text,
  p_amount numeric default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := current_company_role();
  v_company_id uuid := current_company_id();
  v_original public.payments;
  v_already_reversed numeric;
  v_remaining numeric;
  v_amount numeric;
  v_reversal public.payments;
begin
  if not (v_role = 'GESTOR' or public.current_user_has_permission('financeiro.reverse')) then
    raise exception 'Sem permissão para estornar recebimentos.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Motivo do estorno é obrigatório.';
  end if;

  -- 4) concorrência: lock pessimista na linha original ANTES de
  -- calcular quanto já foi estornado -- sem isso, dois estornos
  -- simultâneos leem o mesmo "disponível" e ambos passam, ultrapassando
  -- o valor original. Com o lock, o segundo chamador espera o primeiro
  -- confirmar (ou desfazer) antes de recalcular, sempre a partir do
  -- estado real e mais atual.
  select * into v_original from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_original.company_id <> v_company_id then
    raise exception 'Pagamento não pertence à empresa ativa.';
  end if;
  if v_original.reversal_of_payment_id is not null then
    raise exception 'Não é possível estornar um estorno -- estorne o pagamento original.';
  end if;
  if upper(coalesce(v_original.method,'')) = 'DESCONTO' or v_original.status = 'DESCONTO' then
    raise exception 'Desconto não é dinheiro recebido -- não há o que estornar.';
  end if;
  if v_original.service_order_id is not null and v_role <> 'GESTOR' and exists (
    select 1 from public.service_orders where id = v_original.service_order_id and status = 'FINALIZADA'
  ) then
    raise exception 'OS finalizada só pode ser alterada pelo GESTOR.';
  end if;

  select coalesce(sum(abs(amount)), 0) into v_already_reversed
    from public.payments where reversal_of_payment_id = v_original.id;
  v_remaining := v_original.amount - v_already_reversed;
  if v_remaining <= 0 then
    raise exception 'Este pagamento já foi totalmente estornado.';
  end if;

  v_amount := coalesce(p_amount, v_remaining);
  if v_amount <= 0 or v_amount > v_remaining then
    raise exception 'Valor de estorno inválido (disponível para estorno: %).', v_remaining;
  end if;

  insert into public.payments (
    service_order_id, company_id, amount, method, status, paid_at,
    installments, notes, created_by, operation_id,
    reversal_of_payment_id, reversal_reason
  ) values (
    v_original.service_order_id, v_company_id, -v_amount, v_original.method, 'ESTORNO', now(),
    1, p_reason, auth.uid(), v_original.operation_id,
    v_original.id, p_reason
  ) returning * into v_reversal;

  update public.payments
    set reversal_state = case when v_amount = v_remaining then 'TOTAL' else 'PARCIAL' end
    where id = v_original.id;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), v_company_id, 'FINANCEIRO', 'ESTORNAR_RECEBIMENTO', 'PAYMENT', v_original.id,
    jsonb_build_object('amount', v_original.amount, 'method', v_original.method),
    jsonb_build_object('reversal_payment_id', v_reversal.id, 'amount_reversed', v_amount, 'reason', p_reason, 'reversal_state', case when v_amount = v_remaining then 'TOTAL' else 'PARCIAL' end));

  return v_reversal;
end;
$$;
