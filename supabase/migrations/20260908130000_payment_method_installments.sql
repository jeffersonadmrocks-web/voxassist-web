-- ============================================================
-- Matriz Mestra, Área 06 (Financeiro) -- "Parcelamento configurável"
-- CRIAR confirmado: `payments.installments` é um número digitado
-- livremente na guia Finalizar OS, sem limite nenhum por forma de
-- pagamento. Guardado como coluna em `payment_methods` (limite
-- MÁXIMO de parcelas por forma) em vez de tabela nova -- é um
-- atributo da própria forma de pagamento, não uma lista separada.
--
-- Escopo desta etapa é só o CADASTRO do limite -- validar o campo
-- PARCELAS da guia Finalizar OS contra esse limite fica pra uma
-- etapa futura; o formulário continua aceitando qualquer valor por
-- ora, sem mudar o comportamento atual.
-- ============================================================

alter table public.payment_methods add column if not exists max_installments int;
comment on column public.payment_methods.max_installments is 'Limite máximo de parcelas pra essa forma de pagamento, parâmetro cadastrado -- ainda não validado no formulário de Finalizar OS.';

create or replace function public.admin_upsert_payment_method(
  p_company_id uuid,
  p_name text,
  p_id uuid default null::uuid,
  p_active boolean default true,
  p_sort_order integer default null::integer,
  p_max_installments integer default null::integer,
  p_clear_max_installments boolean default false
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid; v_next_order integer;
begin
  if not public.is_company_gestor(p_company_id) then
    raise exception 'Acesso permitido somente ao gestor da empresa';
  end if;
  if coalesce(trim(p_name),'')='' then
    raise exception 'Informe o nome da forma de pagamento';
  end if;
  if p_id is null then
    select coalesce(max(sort_order),0)+1 into v_next_order from public.payment_methods where company_id=p_company_id;
    insert into public.payment_methods(company_id,name,active,sort_order,max_installments,created_by)
    values (p_company_id, upper(trim(p_name)), coalesce(p_active,true), coalesce(p_sort_order,v_next_order), p_max_installments, auth.uid())
    returning id into v_id;
  else
    update public.payment_methods
      set name=upper(trim(p_name)), active=coalesce(p_active,active), sort_order=coalesce(p_sort_order,sort_order),
          max_installments=case when p_clear_max_installments then null else coalesce(p_max_installments,max_installments) end
      where id=p_id and company_id=p_company_id
      returning id into v_id;
    if v_id is null then raise exception 'Forma de pagamento não encontrada'; end if;
  end if;
  return v_id;
end;
$function$;
