-- VoxAssist Web - esquema inicial de homologação
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  perfil text not null check (perfil in ('GESTOR','ATENDENTE','TECNICO','ESTOQUE')),
  loja text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  cpf_cnpj text,
  loja text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  cliente_id uuid references public.clientes(id),
  tipo_produto text not null,
  marca text,
  modelo text,
  tipo_atendimento text,
  local_produto text,
  defeito_relatado text,
  observacoes_internas text,
  situacao text not null default 'AGUARDANDO ANÁLISE',
  tecnico_id uuid references public.profiles(id),
  loja text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.historico_os (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  situacao_anterior text,
  situacao_nova text not null,
  motivo text,
  usuario_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.historico_os enable row level security;

-- Políticas de homologação devem ser criadas de acordo com os perfis antes de usar dados reais.