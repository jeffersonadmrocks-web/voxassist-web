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
-- Ambas `security invoker`: toda a segurança já existente (RLS
-- payments_company, as restritivas de OS finalizada da migration
-- 20260907060000, e o trigger de integridade empresa×OS da migration
-- 20260913090000) continua valendo exatamente igual dentro do RPC --
-- nada é duplicado ou reimplementado, só reaproveitado (mesmo padrão
-- já usado em advance_service_order_status).
--
-- MODELAGEM ESCOLHIDA (auditado o schema real antes de criar qualquer
-- coisa nova -- nenhuma tabela nova foi necessária):
--
-- * MÚLTIPLAS FORMAS NUMA MESMA OPERAÇÃO (ex.: R$600 PIX + R$400
--   Crédito): cada forma vira sua PRÓPRIA linha em `payments` (mesmo
--   modelo de "pagamento parcial é nativo" já usado pelo resto do
--   app), todas marcadas com o mesmo `operation_id` (novo, gerado uma
--   vez por chamada de register_payment) -- assim dá pra saber quais
--   linhas nasceram juntas sem inventar payment_method_1/2 nem tabela
--   nova. Uma forma só = uma linha com operation_id próprio.
--
-- * ESTORNO: cada estorno é uma NOVA linha em `payments` (nunca
--   UPDATE/DELETE da original), com valor NEGATIVO, method igual ao
--   original (conta no bucket certo em qualquer totalização por
--   forma) e `reversal_of_payment_id` apontando pra original. Sem
--   UNIQUE em reversal_of_payment_id -- vários estornos parciais podem
--   apontar pra mesma original, e a soma dos estornos nunca pode
--   ultrapassar o valor original (validado no RPC). O status do
--   estorno é 'ESTORNO' (novo valor, contado normalmente em qualquer
--   soma existente -- é o valor NEGATIVO que zera o líquido
--   automaticamente, sem precisar mudar nenhum código já existente em
--   financePanel()/dashboard-canonical-v1.js/financeiro-recebimentos-
--   v1.js). A original NUNCA muda de status por causa do estorno (ela
--   "aconteceu de verdade") -- ganha só `reversal_state` (PARCIAL/
--   TOTAL), um campo informativo à parte, não usado por nenhuma soma
--   existente, só pra UI conseguir mostrar um selo.
--
-- * AUDITORIA: nenhuma tabela de log nova -- a própria linha de
--   `payments` já responde tudo que foi pedido (quem: created_by;
--   quando: created_at/paid_at; empresa: company_id; valor: amount;
--   OS: service_order_id; forma: method; transação original:
--   reversal_of_payment_id; motivo: reversal_reason). Reutilizado, não
--   duplicado.
-- ============================================================

alter table public.payments add column if not exists operation_id uuid not null default gen_random_uuid();
alter table public.payments add column if not exists reversal_of_payment_id uuid references public.payments(id);
alter table public.payments add column if not exists reversal_reason text;
alter table public.payments add column if not exists reversal_state text;
alter table public.payments add column if not exists idempotency_key text;

alter table public.payments drop constraint if exists payments_reversal_state_check;
alter table public.payments add constraint payments_reversal_state_check
  check (reversal_state is null or reversal_state in ('PARCIAL','TOTAL'));

-- Vocabulário de status finalmente com integridade real no banco
-- (achado da auditoria do Financeiro: não havia CHECK nenhum antes).
-- Mantidos os literais legados (nunca produzidos pelo app hoje, só
-- verificados por convenção em vários arquivos) por segurança
-- retroativa; 'ESTORNO' é o único valor novo, gerado só por
-- reverse_payment.
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (upper(status) in ('PENDENTE','RECEBIDO','ESTORNO','CANCELADO','CANCELADA','ESTORNADO','ESTORNADA'));

-- ---- Correção não é edição livre (item 10) ----
-- Depois que uma transação é confirmada (RECEBIDO/ESTORNO), seus
-- campos financeiros centrais viram imutáveis -- correção passa a ser
-- reverse_payment + novo register_payment, nunca UPDATE retroativo.
-- Não trava PENDENTE (mantém vxEditPendingPayment funcionando como já
-- funcionava) nem campos não-financeiros (ex.: notes).
create or replace function public.payments_lock_confirmed_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('RECEBIDO','ESTORNO') then
    if new.amount is distinct from old.amount
      or new.method is distinct from old.method
      or new.company_id is distinct from old.company_id
      or new.service_order_id is distinct from old.service_order_id then
      raise exception 'Recebimento confirmado não pode ter valor/forma/empresa/OS alterados -- use reverse_payment e um novo lançamento.';
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
security invoker
set search_path = public
as $$
declare
  v_company_id uuid := current_company_id();
  v_role text := current_company_role();
  v_operation_id uuid := gen_random_uuid();
  v_component jsonb;
  v_method text;
  v_amount numeric;
  v_existing_count int;
begin
  if v_role = 'TECNICO' then
    raise exception 'Técnico não pode registrar recebimentos.';
  end if;

  if p_idempotency_key is not null then
    select count(*) into v_existing_count from public.payments
      where company_id = v_company_id and idempotency_key = p_idempotency_key;
    if v_existing_count > 0 then
      return query select * from public.payments
        where company_id = v_company_id and idempotency_key = p_idempotency_key
        order by created_at;
      return;
    end if;
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
      (c->>'amount')::numeric, c->>'method', 'RECEBIDO',
      p_due_date, coalesce(p_paid_at, now()),
      greatest(1, coalesce(p_installments,1)), p_notes, auth.uid(), v_operation_id, p_idempotency_key
    from jsonb_array_elements(p_components) c
    returning *;
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
security invoker
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
  if v_role = 'TECNICO' then
    raise exception 'Técnico não pode estornar recebimentos.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Motivo do estorno é obrigatório.';
  end if;

  select * into v_original from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_original.company_id <> v_company_id then
    raise exception 'Pagamento não pertence à empresa ativa.';
  end if;
  if v_original.reversal_of_payment_id is not null then
    raise exception 'Não é possível estornar um estorno -- estorne o pagamento original.';
  end if;
  if upper(coalesce(v_original.method,'')) = 'DESCONTO' then
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

  return v_reversal;
end;
$$;
