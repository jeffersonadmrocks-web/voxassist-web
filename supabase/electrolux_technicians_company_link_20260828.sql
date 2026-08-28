-- ============================================================
-- Reconciliação manual (2026-08-28) — os técnicos provisórios criados
-- pelo sync da Electrolux (Farley Gaigher Rabelo, Brendo Pereira
-- Ferreira) não apareciam na Agenda Externa nem em nenhuma tela
-- escopada por empresa: profiles é filtrado por RLS via user_companies,
-- e a criação automática (supabase/functions/_shared/technicianMatch.ts)
-- nunca vincula o provisório a nenhuma empresa. Vincula os dois à VOX
-- SERRA (mesma empresa ativa hoje, mesma que "Andre Rodrigues Muniz" já
-- tem). Idempotente.
-- ============================================================

insert into public.user_companies (user_id, company_id, role, active, is_default)
select p.id, '8ef20cb5-824c-4735-89d4-c5a5134d81b5', 'TECNICO', true, true
from public.profiles p
where p.id in ('8e2b49ee-42c1-485b-934d-ee3f82ac0a3b', 'a3933bd9-6e16-45a4-acf4-4c7bf7fc3e46')
  and not exists (
    select 1 from public.user_companies uc
    where uc.user_id = p.id and uc.company_id = '8ef20cb5-824c-4735-89d4-c5a5134d81b5'
  );
