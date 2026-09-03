-- Achado do usuário em 2026-09-03: o modal "Novo caso de atenção" foi
-- redesenhado (referência aprovada) pra permitir escolher um "Tipo de
-- atenção" e vincular o caso à OS atual OU ao cliente (não só à OS).
-- dashboard_cases já tinha service_order_id nullable, mas não tinha
-- client_id nenhum -- aditivo, não mexe em nada existente.
alter table public.dashboard_cases add column if not exists client_id uuid;
alter table public.dashboard_cases add constraint dashboard_cases_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete cascade;
alter table public.dashboard_cases add column if not exists case_type text;
comment on column public.dashboard_cases.client_id is
  'Preenchido quando o caso é relacionado ao cliente em vez de a uma OS específica (mutuamente exclusivo com service_order_id na UI, mas sem CHECK -- texto livre como o resto da tabela).';
comment on column public.dashboard_cases.case_type is
  'Categoria livre escolhida no modal (ex.: Informação importante, Reclamação do cliente) -- sem CHECK, mesmo padrão de priority/status nesta tabela.';
