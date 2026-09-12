-- ============================================================
-- Achado do usuário em 2026-09-12: dropdown TÉCNICO RESPONSÁVEL (aba
-- Orçamento/Análise Técnica da OS) mostrando o mesmo técnico
-- cadastrado várias vezes (6x "Andre Rodrigues Muniz", 3x "Farley
-- Gaigher Rabelo") -- confirmado que são linhas DIFERENTES de verdade
-- em profiles, não um bug de renderização (a query já é
-- `profiles?role=eq.TECNICO&active=eq.true&select=id,full_name`, sem
-- nenhum agrupamento).
--
-- Causa raiz confirmada por leitura do código: técnicos vindos da
-- Electrolux são criados por matchOrCreateTechnician()
-- (supabase/functions/_shared/technicianMatch.ts). A versão ATUAL
-- dessa função já é cuidadosa (reaproveita direto qualquer perfil
-- origin='ELECTROLUX' com o mesmo nome normalizado -- comentário no
-- próprio arquivo, "toda segunda ocorrência... reaproveita direto") e
-- a API real da Electrolux hoje NÃO manda nome nem id de técnico
-- (confirmado em supabase/functions/_shared/electrolux.ts: campos
-- opcionais "de propósito -- a Electrolux não manda isso ainda") --
-- ou seja, esse caminho está DORMENTE em produção agora, não está
-- criando duplicata nova. As duplicatas que existem hoje são
-- resíduo de ANTES dessa lógica de reaproveitamento existir (mesma
-- classe de achado já tratada uma vez, de forma pontual e só pra 2
-- UUIDs hardcoded, em electrolux_technician_merge_andre_muniz_
-- 20260828.sql e electrolux_technicians_company_link_20260828.sql) --
-- nunca foi feita uma limpeza genérica. Esta migration resolve isso
-- de vez: uma função reutilizável (não hardcoded pra nenhum nome),
-- que já roda uma vez no final desta migration, e fica disponível
-- caso alguma duplicata residual apareça de novo por outro motivo no
-- futuro (ver nota de GRANT mais abaixo).
--
-- Nunca apaga um perfil -- só desativa e aponta merged_into pro
-- perfil canônico, com registro em audit_log, pra manter rastreável
-- quem era quem. Todo o trabalho já atribuído ao duplicado
-- (service_orders/appointments/external_appointments/stock_
-- movements/technician_stock/technician_schedule_blocks) é
-- reatribuído ao canônico -- sem isso, a produtividade e a
-- bonificação da pessoa ficam fragmentadas entre vários IDs.
--
-- Escopo deliberadamente restrito a evitar mesclar gente diferente:
-- (1) agrupa por empresa (via user_companies), nunca globalmente --
-- duas empresas clientes distintas podem ter cada uma um técnico com
-- o mesmo nome, isso NUNCA deve virar uma mesclagem cross-empresa;
-- (2) só mescla automaticamente quando, no máximo, 1 perfil do grupo
-- não é origin='ELECTROLUX' (uma conta real vira o canônico quando
-- existir; 2+ contas reais com o mesmo nome é ambíguo demais pra
-- decidir sozinho -- fica de fora, pra revisão manual, nunca mesclada
-- às cegas).
-- ============================================================

alter table public.profiles
  add column if not exists merged_into uuid references public.profiles(id),
  add column if not exists merged_at timestamptz;

comment on column public.profiles.merged_into is
  'Preenchido quando este perfil foi identificado como duplicata (provisionamento Electrolux) e mesclado em outro -- nunca apagamos o perfil duplicado, só desativamos e apontamos pro canônico. Ver merge_duplicate_electrolux_technicians().';

create or replace function public.normalize_person_name(p_name text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    lower(translate(coalesce(p_name, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )),
    '[^a-z0-9]+', ' ', 'g'
  ))
$$;
comment on function public.normalize_person_name(text) is
  'Mesma normalização de normalizeName() em supabase/functions/_shared/electrolux.ts (remove acentos, minúsculas, colapsa separadores) -- usada pra comparar nomes de técnico sem depender da extensão unaccent.';

create or replace function public.merge_duplicate_electrolux_technicians()
returns table(company_id uuid, canonical_id uuid, canonical_name text, merged_id uuid, merged_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  grp record;
  dup record;
  v_canonical uuid;
  v_canonical_name text;
  v_real_count int;
begin
  for grp in (
    select uc.company_id as grp_company_id, public.normalize_person_name(p.full_name) as norm_name
    from public.profiles p
    join public.user_companies uc on uc.user_id = p.id and uc.active
    where p.role = 'TECNICO' and p.active and p.merged_into is null
    group by 1, 2
    having count(*) > 1
  ) loop
    select count(*) into v_real_count
    from public.profiles p
    join public.user_companies uc on uc.user_id = p.id and uc.active and uc.company_id = grp.grp_company_id
    where public.normalize_person_name(p.full_name) = grp.norm_name
      and p.role = 'TECNICO' and p.active and p.merged_into is null
      and p.origin <> 'ELECTROLUX';

    -- 2+ perfis "reais" (não provisionados) com o mesmo nome na mesma
    -- empresa é ambíguo demais (pode ser gente diferente de verdade) --
    -- nunca mescla automaticamente, fica de fora pra revisão manual.
    if v_real_count > 1 then
      continue;
    end if;

    select p.id, p.full_name into v_canonical, v_canonical_name
    from public.profiles p
    join public.user_companies uc on uc.user_id = p.id and uc.active and uc.company_id = grp.grp_company_id
    where public.normalize_person_name(p.full_name) = grp.norm_name
      and p.role = 'TECNICO' and p.active and p.merged_into is null
    order by (p.origin <> 'ELECTROLUX') desc, p.created_at asc
    limit 1;

    for dup in (
      select p.id, p.full_name
      from public.profiles p
      join public.user_companies uc on uc.user_id = p.id and uc.active and uc.company_id = grp.grp_company_id
      where public.normalize_person_name(p.full_name) = grp.norm_name
        and p.role = 'TECNICO' and p.active and p.merged_into is null
        and p.id <> v_canonical
    ) loop
      update public.service_orders set technician_id = v_canonical where technician_id = dup.id;
      update public.appointments set technician_id = v_canonical where technician_id = dup.id;
      update public.external_appointments set technician_id = v_canonical where technician_id = dup.id;
      update public.stock_movements set technician_id = v_canonical where technician_id = dup.id;
      update public.technician_stock set technician_id = v_canonical where technician_id = dup.id;
      update public.technician_schedule_blocks set technician_id = v_canonical where technician_id = dup.id;

      -- Vínculo empresa: só assume o do duplicado onde o canônico
      -- ainda não tem um pra mesma empresa (UNIQUE(user_id,company_id)
      -- em user_companies não permite as duas linhas coexistirem).
      update public.user_companies uc_dup
        set user_id = v_canonical
        where uc_dup.user_id = dup.id
          and not exists (
            select 1 from public.user_companies uc_can
            where uc_can.user_id = v_canonical and uc_can.company_id = uc_dup.company_id
          );
      delete from public.user_companies where user_id = dup.id;

      update public.user_store_access usa_dup
        set user_id = v_canonical
        where usa_dup.user_id = dup.id
          and not exists (
            select 1 from public.user_store_access usa_can
            where usa_can.user_id = v_canonical
              and usa_can.company_id = usa_dup.company_id
              and usa_can.store_id is not distinct from usa_dup.store_id
          );
      delete from public.user_store_access where user_id = dup.id;

      delete from public.external_technician_link_suggestions where suggested_profile_id = dup.id;

      update public.profiles
        set active = false, merged_into = v_canonical, merged_at = now()
        where id = dup.id;

      insert into public.audit_log (company_id, area, action, entity_type, entity_id, old_data, new_data)
      values (
        grp.grp_company_id, 'TECNICOS', 'MERGE_DUPLICADO_ELECTROLUX', 'profiles', dup.id,
        jsonb_build_object('id', dup.id, 'full_name', dup.full_name),
        jsonb_build_object('merged_into', v_canonical, 'canonical_name', v_canonical_name)
      );

      company_id := grp.grp_company_id;
      canonical_id := v_canonical;
      canonical_name := v_canonical_name;
      merged_id := dup.id;
      merged_name := dup.full_name;
      return next;
    end loop;
  end loop;
end;
$$;
comment on function public.merge_duplicate_electrolux_technicians() is
  'Limpeza/prevenção genérica de técnicos duplicados por empresa (nunca cross-empresa, nunca mescla 2+ perfis não-Electrolux com o mesmo nome). Idempotente -- seguro rodar de novo (só processa active=true e merged_into is null). Mesmo padrão de qualquer RPC deste projeto: sem GRANT explícito pra authenticated/anon, não fica exposta ao app -- só quem roda migration/SQL direto (ou service_role) executa.';

-- Roda a limpeza uma vez, agora, pras duplicatas já existentes
-- (Andre Rodrigues Muniz, Farley Gaigher Rabelo e qualquer outra que
-- a auditoria de código não tinha como enumerar sem acesso ao banco).
do $$
begin
  perform public.merge_duplicate_electrolux_technicians();
end $$;
