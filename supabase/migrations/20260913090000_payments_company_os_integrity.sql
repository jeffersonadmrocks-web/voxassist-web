-- ============================================================
-- Ajuste estrutural pedido na revisão da migration anterior
-- (20260913080000, que tornou payments.service_order_id opcional e
-- introduziu payments.company_id):
--
-- INTEGRIDADE EMPRESA x OS -- a migration anterior confiava no
-- aplicativo (e na RLS, que só valida "sua própria empresa", nunca "a
-- mesma empresa da OS referenciada") pra manter payments.company_id
-- coerente com service_orders.company_id quando há OS vinculada. Isso
-- permitiria, em tese, um pagamento com company_id de uma empresa mas
-- service_order_id de uma OS de outra. Corrigido com um TRIGGER (não
-- apenas CHECK -- um CHECK não alcança outra tabela) que DERIVA
-- company_id a partir da própria OS sempre que service_order_id não é
-- nulo, na própria gravação -- o banco garante a coerência, nunca
-- depende do que o cliente mandou. Quando service_order_id é nulo
-- (avulso), company_id continua vindo de quem grava (obrigatório, sem
-- OS pra derivar) -- que é a própria EMPRESA ATIVA do usuário
-- (state.profile.active_company_id no client), não uma "loja".
--
-- CORREÇÃO (2026-09-13, revisão do usuário): uma versão anterior desta
-- migration também adicionava payments.store_id, com base numa
-- interpretação equivocada de que "Vox Serra"/"Vox Vitória" seriam
-- lojas de uma mesma empresa. Confirmado que são EMPRESAS distintas
-- (cada uma com seu próprio CNPJ, isoladas por company_id) -- o
-- conceito de loja/unidade dentro de uma empresa é só uma evolução
-- arquitetural futura em aberto, sem uso no Financeiro hoje. Removido:
-- este Financeiro não usa nem exige store_id. Estruturas de loja que
-- já existiam antes disso por outro motivo (ex.: service_orders.
-- store_id, a tabela stores) não foram tocadas nem removidas -- só não
-- ganharam nenhum uso novo aqui.
-- ============================================================

-- Corrige qualquer linha existente que já devesse ter vindo da OS (a
-- migration anterior só preencheu company_id onde estava NULL; isso
-- garante consistência total antes do trigger passar a valer).
update public.payments p
set company_id = o.company_id
from public.service_orders o
where p.service_order_id = o.id
  and p.company_id is distinct from o.company_id;

create or replace function public.payments_enforce_company_from_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if new.service_order_id is not null then
    select company_id into v_company_id from public.service_orders where id = new.service_order_id;
    if v_company_id is null then
      raise exception 'payments.service_order_id % não corresponde a nenhuma OS existente', new.service_order_id;
    end if;
    new.company_id := v_company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_enforce_company_from_os on public.payments;
create trigger trg_payments_enforce_company_from_os
  before insert or update of service_order_id, company_id on public.payments
  for each row
  execute function public.payments_enforce_company_from_os();
