-- ============================================================
-- CORREÇÃO CRÍTICA — isolamento de empresa no módulo Electrolux
-- (2026-08-28). Achado real em produção: com "VOX ELETRONICA" ativa, a
-- fila "Agendamentos em aberto" mostrava os MESMOS 60 pedidos que
-- aparecem com "VOX SERRA" ativa — external_appointments (e tudo que
-- depende dele: nps_cases, nps_contacts, nps_case_history,
-- external_appointment_history) nunca teve company_id nem RLS por
-- empresa. Qualquer GESTOR/ATENDENTE via TODOS os dados da Electrolux
-- de TODAS as empresas, independente de qual estivesse ativa.
--
-- Corrige adicionando company_id em external_appointments (a raiz de
-- onde tudo mais deriva por join) e reescrevendo as policies de select/
-- update pra exigir company_id = current_company_id() — direto ou via
-- join, seguindo o mesmo padrão já usado em service_orders/clients/etc.
-- Idempotente.
-- ============================================================

alter table public.external_appointments add column if not exists company_id uuid references public.companies(id);

-- Backfill: hoje 100% das SVOs Electrolux pertencem à VOX SERRA (mesma
-- empresa usada em ELECTROLUX_DEFAULT_COMPANY_ID pro vínculo de técnico).
update public.external_appointments
set company_id = '8ef20cb5-824c-4735-89d4-c5a5134d81b5'
where company_id is null;

create index if not exists idx_external_appointments_company on public.external_appointments (company_id);

-- ------------------------------------------------------------
-- external_appointments: exige company_id = current_company_id() além
-- da regra de perfil já existente.
-- ------------------------------------------------------------
drop policy if exists "Usuários autenticados veem compromissos externos" on public.external_appointments;
create policy "Usuários autenticados veem compromissos externos"
  on public.external_appointments for select
  using (
    company_id = current_company_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.role <> 'TECNICO' or external_appointments.technician_id = auth.uid())
    )
  );

drop policy if exists "Usuários autenticados atribuem técnico ao compromisso externo" on public.external_appointments;
create policy "Usuários autenticados atribuem técnico ao compromisso externo"
  on public.external_appointments for update
  using (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO')
  )
  with check (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO')
  );

-- ------------------------------------------------------------
-- external_appointment_history: escopado via join, mesma regra.
-- ------------------------------------------------------------
drop policy if exists "Usuários autenticados veem histórico de compromissos externos" on public.external_appointment_history;
create policy "Usuários autenticados veem histórico de compromissos externos"
  on public.external_appointment_history for select
  using (
    exists (
      select 1 from public.external_appointments ea
      where ea.id = external_appointment_history.external_appointment_id
        and ea.company_id = current_company_id()
    )
  );

-- ------------------------------------------------------------
-- nps_cases: mesma regra de perfil de antes, + company_id via join
-- pra external_appointments.
-- ------------------------------------------------------------
drop policy if exists "Usuários autenticados veem casos de NPS" on public.nps_cases;
create policy "Usuários autenticados veem casos de NPS"
  on public.nps_cases for select
  using (
    exists (
      select 1 from public.external_appointments ea
      where ea.id = nps_cases.external_appointment_id and ea.company_id = current_company_id()
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role <> 'TECNICO'
          or exists (
            select 1 from public.external_appointments ea
            where ea.id = nps_cases.external_appointment_id and ea.technician_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "Gestor e atendente alteram casos de NPS" on public.nps_cases;
create policy "Gestor e atendente alteram casos de NPS"
  on public.nps_cases for update
  using (
    exists (
      select 1 from public.external_appointments ea
      where ea.id = nps_cases.external_appointment_id and ea.company_id = current_company_id()
    )
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO')
  )
  with check (
    exists (
      select 1 from public.external_appointments ea
      where ea.id = nps_cases.external_appointment_id and ea.company_id = current_company_id()
    )
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role <> 'TECNICO')
  );

-- ------------------------------------------------------------
-- nps_contacts / nps_case_history: mesma regra, join até
-- external_appointments passando por nps_cases.
-- ------------------------------------------------------------
drop policy if exists "Usuários autenticados veem contatos de NPS" on public.nps_contacts;
create policy "Usuários autenticados veem contatos de NPS"
  on public.nps_contacts for select
  using (
    exists (
      select 1 from public.nps_cases c
      join public.external_appointments ea on ea.id = c.external_appointment_id
      join public.profiles p on p.id = auth.uid()
      where c.id = nps_contacts.nps_case_id
        and ea.company_id = current_company_id()
        and (p.role <> 'TECNICO' or ea.technician_id = auth.uid())
    )
  );

drop policy if exists "Usuários autenticados veem histórico de NPS" on public.nps_case_history;
create policy "Usuários autenticados veem histórico de NPS"
  on public.nps_case_history for select
  using (
    exists (
      select 1 from public.nps_cases c
      join public.external_appointments ea on ea.id = c.external_appointment_id
      join public.profiles p on p.id = auth.uid()
      where c.id = nps_case_history.nps_case_id
        and ea.company_id = current_company_id()
        and (p.role <> 'TECNICO' or ea.technician_id = auth.uid())
    )
  );
