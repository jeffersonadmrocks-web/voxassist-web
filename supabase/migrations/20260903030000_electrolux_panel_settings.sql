-- ============================================================
-- Endereço do painel Electrolux (Vox Analytics) vira config do
-- SISTEMA, não do dispositivo (achado do usuário 2026-09-03): hoje
-- fica salvo em localStorage do navegador
-- (electrolux-reports-v0813.js, CONFIG_KEY) -- todo dispositivo/
-- navegador novo pede pra configurar de novo, mesmo sendo o MESMO
-- endereço pra empresa inteira. Vira uma linha por empresa, visível
-- pra todo usuário autenticado da empresa, editável só por GESTOR
-- (mesmo padrão de outras configurações administrativas).
--
-- Não é segredo (é só o endereço base, sem credencial -- a Basic Auth
-- real da Electrolux já vive só em Edge Function secrets,
-- ELECTROLUX_API_URL/USER/PASSWORD, nunca no navegador) -- por isso
-- RLS de leitura ampla é seguro aqui.
-- ============================================================

create table if not exists public.electrolux_panel_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  api_url text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
comment on table public.electrolux_panel_settings is
  'Endereço do painel de triagem Electrolux (Vox Analytics) por empresa -- config do sistema, não do dispositivo/navegador. Substitui o localStorage por usuário que existia antes (achado 2026-09-03).';

alter table public.electrolux_panel_settings enable row level security;

create policy "electrolux_panel_settings_select_company" on public.electrolux_panel_settings for select to authenticated
  using (company_id = current_company_id());

create policy "electrolux_panel_settings_write_gestor" on public.electrolux_panel_settings for all to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR')
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');
