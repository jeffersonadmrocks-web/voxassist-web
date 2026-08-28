-- ============================================================
-- Reconciliação manual única (2026-08-28) — pedida explicitamente pelo
-- usuário após o fix do sync de técnicos da Electrolux criar um
-- provisório "Andre Rodrigues Muniz" que é a mesma pessoa que o técnico
-- "ANDRE MUNIZ" já cadastrado (o matching nunca funde nomes parecidos
-- sozinho, por design — carece de confirmação humana, que é este script).
-- Idempotente: cada passo só age se ainda houver o que fazer.
-- ============================================================

-- 1) Renomeia o perfil original pro nome exato que a Electrolux manda —
-- necessário pra bater no match por nome normalizado nos próximos ciclos
-- de sync (sem isso, o sync recriaria um provisório novo toda vez).
update public.profiles
set full_name = 'Andre Rodrigues Muniz', updated_at = now()
where id = '128bb390-f170-40f4-a598-f9d84443c168' and full_name <> 'Andre Rodrigues Muniz';

-- 2) Reatribui as 33 SVOs Electrolux que o sync ligou ao provisório
-- duplicado de volta pro perfil original.
update public.external_appointments
set technician_id = '128bb390-f170-40f4-a598-f9d84443c168', updated_at = now()
where technician_id = '711e258a-a272-4084-bffd-bd99f01c7689';

-- 3) Desativa o provisório duplicado (soft-delete, preserva histórico/FK
-- em vez de apagar).
update public.profiles
set active = false, updated_at = now()
where id = '711e258a-a272-4084-bffd-bd99f01c7689';

-- 4) Registra a confirmação — futuros ciclos de sync encontram esta linha
-- VINCULADO e reaproveitam o perfil original direto, sem reabrir
-- pendência nem recriar outro provisório.
insert into public.external_technician_link_suggestions
  (origin, external_technician_id, candidate_name, suggested_profile_id, status, resolved_at)
select 'ELECTROLUX', null, 'Andre Rodrigues Muniz', '128bb390-f170-40f4-a598-f9d84443c168', 'VINCULADO', now()
where not exists (
  select 1 from public.external_technician_link_suggestions
  where origin = 'ELECTROLUX' and external_technician_id is null
    and suggested_profile_id = '128bb390-f170-40f4-a598-f9d84443c168'
);
