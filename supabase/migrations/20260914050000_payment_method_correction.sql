-- ============================================================
-- Financeiro -- correct_payment_method: corrige a FORMA de um
-- recebimento já confirmado (ex.: Dinheiro -> PIX).
--
-- payments_lock_confirmed_fields (migration 20260913100000) trava
-- justamente `method` numa linha RECEBIDO/ESTORNO/DESCONTO -- de
-- propósito, pra ninguém reescrever dinheiro já contabilizado. Esta
-- migration NUNCA remove nem contorna essa trava: a correção
-- continua sendo, por baixo dos panos, um estorno interno + um novo
-- recebimento (mesma mecânica segura de reverse_payment/
-- register_payment) -- nenhum UPDATE de `method` em linha
-- confirmada em lugar nenhum deste arquivo.
--
-- Decisão do usuário (2026-09-14): diferente de um estorno de
-- verdade (que deve mesmo mostrar 2 linhas -- original ESTORNADO +
-- ESTORNO -- dinheiro realmente saiu/voltou), uma CORREÇÃO de forma
-- é o mesmo dinheiro, mesma OS, mesmo valor -- só a etiqueta mudou.
-- Por isso ela PRECISA aparecer como UM único pagamento vigente em
-- todo relatório operacional (Financeiro, Caixa, relatório diário,
-- financeiro da OS, recibos, exportações), nunca duas linhas nem
-- R$ em dobro.
--
-- MODELAGEM: dois sinais novos em `payments` marcam quais linhas são
-- "internas" de uma correção (nunca aparecem em relatório
-- operacional) e qual é a vigente:
--
--   superseded_by_payment_id -- gravado na linha ORIGINAL, aponta
--     pro pagamento vigente que a substituiu. Fica FORA da lista
--     travada por payments_lock_confirmed_fields -- mesmo padrão já
--     usado por reversal_state, o único outro campo que uma RPC
--     pode gravar numa linha confirmada.
--   is_correction_internal -- true só na linha de estorno interna
--     criada por correct_payment_method (nunca na de reverse_payment
--     "de verdade", que continua aparecendo normalmente pros dois
--     lados -- reverse_payment não muda nesta migration).
--
-- A nova linha vigente grava correction_of_payment_id/
-- correction_reason/correction_by/correction_at direto no INSERT
-- (nunca por UPDATE posterior -- zero atrito com a trava).
--
-- public.payments_operational (view abaixo) é a fonte única de
-- leitura pra qualquer tela operacional -- filtra as duas linhas
-- internas da correção uma vez só, em vez de espalhar essa regra
-- por cada tela/consulta do frontend.
-- ============================================================

alter table public.payments add column if not exists correction_of_payment_id uuid references public.payments(id);
alter table public.payments add column if not exists superseded_by_payment_id uuid references public.payments(id);
alter table public.payments add column if not exists is_correction_internal boolean not null default false;
alter table public.payments add column if not exists correction_reason text;
-- correction_by É uuid SEM foreign key pra profiles -- payments.created_by
-- já referencia profiles(id); uma segunda FK tornaria todo embed
-- `profiles(full_name)` já usado em payments/payments_operational
-- (financeiro-recebimentos-v1.js, os-detail-v0812.js) AMBÍGUO pro
-- PostgREST (duas relações possíveis pra profiles, exigiria hint
-- `profiles!created_by(...)` em todo lugar que hoje não tem). Gravado
-- só por auth.uid() dentro de correct_payment_method (SECURITY
-- DEFINER, já validou a sessão) -- sem risco de valor solto.
alter table public.payments add column if not exists correction_by uuid;
alter table public.payments add column if not exists correction_at timestamptz;

create index if not exists payments_correction_of_payment_id_idx on public.payments(correction_of_payment_id) where correction_of_payment_id is not null;
create index if not exists payments_superseded_by_payment_id_idx on public.payments(superseded_by_payment_id) where superseded_by_payment_id is not null;

-- ---- view operacional -- única fonte de leitura pra relatórios ----
create or replace view public.payments_operational
with (security_invoker = true) as
select p.*
from public.payments p
where p.superseded_by_payment_id is null
  and p.is_correction_internal = false;

comment on view public.payments_operational is
  'Fonte única de leitura pra qualquer tela operacional (Financeiro/Recebimentos, Caixa, relatório diário, financeiro da OS, recibos, exportações, resumo do Dashboard). Filtra as linhas superadas por correct_payment_method (superseded_by_payment_id) e o estorno interno da correção (is_correction_internal) -- um recebimento corrigido aparece como UMA linha só, nunca duas nem valor em dobro. Um estorno de verdade (reverse_payment) não é afetado por este filtro e continua aparecendo como sempre (original + estorno). security_invoker=true -- roda com a RLS de quem consulta, mesma policy de public.payments, nenhuma policy nova.';

grant select on public.payments_operational to authenticated;

-- ---- idempotência (mesmo padrão de payment_operations) ----
create table if not exists public.payment_corrections (
  company_id uuid not null references public.companies(id),
  idempotency_key text not null,
  original_payment_id uuid not null references public.payments(id),
  new_payment_id uuid references public.payments(id),
  created_at timestamptz not null default now(),
  primary key (company_id, idempotency_key)
);
alter table public.payment_corrections enable row level security;
drop policy if exists "payment_corrections_company" on public.payment_corrections;
create policy "payment_corrections_company" on public.payment_corrections
  as permissive for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- ---- correct_payment_method ----
-- GESTOR estrito, validado no servidor -- NUNCA por permissão
-- granular (decisão explícita do usuário: corrigir a forma de um
-- recebimento já confirmado é mais sensível que estornar --
-- financeiro.reverse não libera isto. `is distinct from`, não `<>`,
-- pra um v_role nulo -- sessão sem role resolvida -- também cair no
-- bloqueio em vez de silenciosamente passar como NULL/falso).
create or replace function public.correct_payment_method(
  p_payment_id uuid,
  p_new_method text,
  p_reason text,
  p_idempotency_key text default null
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
  v_new public.payments;
  v_reversal public.payments;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing_new_id uuid;
  v_new_method text := btrim(coalesce(p_new_method, ''));
begin
  if v_role is distinct from 'GESTOR' then
    raise exception 'Somente o GESTOR pode corrigir a forma de um recebimento.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Motivo da correção é obrigatório.';
  end if;
  if v_new_method = '' then
    raise exception 'Informe a nova forma de pagamento.';
  end if;

  -- idempotência: resolve/reserva ANTES de tocar em payments, com
  -- lock de linha -- segunda chamada com a mesma chave (clique
  -- duplo/retry de rede) devolve o mesmo resultado em vez de
  -- duplicar ou estourar em "já foi corrigido".
  if v_key is not null then
    insert into public.payment_corrections (company_id, idempotency_key, original_payment_id)
    values (v_company_id, v_key, p_payment_id)
    on conflict (company_id, idempotency_key) do nothing;

    select new_payment_id into v_existing_new_id
      from public.payment_corrections
      where company_id = v_company_id and idempotency_key = v_key
      for update;

    if v_existing_new_id is not null then
      select * into v_new from public.payments where id = v_existing_new_id;
      return v_new;
    end if;
  end if;

  select * into v_original from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_original.company_id <> v_company_id then
    raise exception 'Pagamento não pertence à empresa ativa.';
  end if;
  if v_original.is_correction_internal then
    raise exception 'Este lançamento é interno de uma correção -- não pode ser corrigido diretamente.';
  end if;
  if v_original.superseded_by_payment_id is not null then
    raise exception 'Este recebimento já foi corrigido anteriormente.';
  end if;
  if v_original.reversal_of_payment_id is not null then
    raise exception 'Não é possível corrigir a forma de um estorno.';
  end if;
  if v_original.reversal_state is not null then
    raise exception 'Este recebimento já foi estornado (total ou parcialmente) -- corrija pelo fluxo de estorno.';
  end if;
  if upper(coalesce(v_original.status, '')) <> 'RECEBIDO' then
    raise exception 'Somente um recebimento confirmado pode ter a forma corrigida.';
  end if;
  if upper(coalesce(v_original.method, '')) = upper(v_new_method) then
    raise exception 'A nova forma precisa ser diferente da forma atual.';
  end if;
  if not exists (
    select 1 from public.payment_methods
    where company_id = v_company_id and active and upper(name) = upper(v_new_method)
  ) then
    raise exception 'Forma de pagamento inválida ou inativa: %', v_new_method;
  end if;

  -- 1) estorno interno -- zera a linha original (nova linha
  -- negativa vinculada via reversal_of_payment_id, nunca UPDATE do
  -- valor/forma original). is_correction_internal=true -- nunca
  -- aparece em payments_operational.
  insert into public.payments (
    service_order_id, company_id, amount, method, status, paid_at,
    installments, notes, created_by, operation_id,
    reversal_of_payment_id, reversal_reason, is_correction_internal
  ) values (
    v_original.service_order_id, v_company_id, -v_original.amount, v_original.method, 'ESTORNO', now(),
    1, p_reason, auth.uid(), v_original.operation_id,
    v_original.id, p_reason, true
  ) returning * into v_reversal;

  -- 2) novo recebimento vigente, na forma corrigida. Mantém mesma
  -- data (paid_at) da original pra não "mudar de dia" no relatório
  -- diário/Caixa, e mesmo created_by (quem de fato recebeu o
  -- dinheiro -- a correção de forma não muda isso; quem AUTORIZOU a
  -- correção fica em correction_by). Vínculo de correção gravado
  -- direto no INSERT -- nunca por UPDATE posterior.
  insert into public.payments (
    service_order_id, company_id, amount, method, status, paid_at,
    installments, notes, created_by, operation_id,
    correction_of_payment_id, correction_reason, correction_by, correction_at
  ) values (
    v_original.service_order_id, v_company_id, v_original.amount, v_new_method, 'RECEBIDO', v_original.paid_at,
    v_original.installments, v_original.notes, v_original.created_by, v_original.operation_id,
    v_original.id, p_reason, auth.uid(), now()
  ) returning * into v_new;

  -- único UPDATE na linha confirmada original -- superseded_by_payment_id
  -- fica fora da lista travada por payments_lock_confirmed_fields,
  -- mesmo padrão já usado por reversal_state (reverse_payment).
  update public.payments
    set reversal_state = 'TOTAL', superseded_by_payment_id = v_new.id
    where id = v_original.id;

  if v_key is not null then
    update public.payment_corrections set new_payment_id = v_new.id
      where company_id = v_company_id and idempotency_key = v_key;
  end if;

  insert into public.audit_log(user_id, company_id, area, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), v_company_id, 'FINANCEIRO', 'CORRIGIR_FORMA_PAGAMENTO', 'PAYMENT', v_original.id,
    jsonb_build_object('method', v_original.method, 'amount', v_original.amount),
    jsonb_build_object('new_payment_id', v_new.id, 'method', v_new.method, 'reason', p_reason));

  return v_new;
end;
$$;

comment on function public.correct_payment_method is
  'Corrige a forma de um recebimento confirmado sem violar payments_lock_confirmed_fields -- por baixo dos panos é um estorno interno (is_correction_internal=true) + novo recebimento (correction_of_payment_id), mas aparece como UM pagamento só em payments_operational. GESTOR estrito (validado no servidor, nunca por permissão granular). Idempotente via payment_corrections -- clique duplo/retry com a mesma p_idempotency_key devolve o mesmo resultado.';
