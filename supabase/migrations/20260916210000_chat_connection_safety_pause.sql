-- P0 de segurança do WhatsApp -- incidente real (2026-09-16): a mesma
-- linha da Digisac (sistema legado, fora do VoxAssist) e o gateway
-- Baileys do VoxAssist ficaram conectados ao MESMO número simultaneamente,
-- ambos potencialmente respondendo à mesma mensagem, o que motivou uma
-- restrição de 10h aplicada pelo WhatsApp -- sem nenhuma forma de pausar
-- o robô/gateway pra aquele NÚMERO sem desconectar manualmente a sessão
-- inteira. O achado de 2026-09-15 (chat_bot_pause) já resolveu "pausar o
-- robô" por EMPRESA (chat_bot_flow_versions.paused); isto resolve o nível
-- que faltava: pausar/marcar risco por CONEXÃO (número), o nível onde o
-- incidente de verdade aconteceu.
--
-- paused_at/pause_reason/paused_by: pausa de emergência da CONEXÃO
-- (nunca só do robô) -- enquanto pausada, chat-gateway-proxy recusa
-- connect/reconnect (nunca alcança o gateway) e chat-inbound-webhook
-- nunca dispara automação (bot nem mensagem de ausência) pra ela, mesmo
-- que uma mensagem ainda chegue por algum caminho.
--
-- external_provider_active/external_provider_name: exclusividade de
-- provedor -- registra que um sistema EXTERNO ao VoxAssist (Digisac hoje,
-- outro amanhã) está confirmado como ativo pra esse número. Enquanto
-- true, mesmo efeito do pause acima (bloqueia connect/reconnect e
-- automação) -- é o gestor quem confirma isso manualmente (não há
-- integração com a Digisac neste repositório pra detectar sozinho).
--
-- Reaproveita a policy "Somente GESTOR administra conexões de chat" já
-- existente (for all, chat_foundation_20260828.sql) -- nenhuma RPC nova
-- necessária pra alternar os campos, mesmo padrão já usado pra
-- chat_bot_flow_versions.paused (PATCH direto via PostgREST). A trilha
-- de auditoria vem de um trigger, não de uma RPC -- só assim cobre
-- qualquer forma de escrita (inclusive a manual, comprovada acima) sem
-- exigir que o frontend passe a chamar uma RPC nova.
alter table public.chat_connections
  add column if not exists paused_at timestamptz,
  add column if not exists pause_reason text,
  add column if not exists paused_by uuid references public.profiles (id) on delete set null,
  add column if not exists external_provider_active boolean not null default false,
  add column if not exists external_provider_name text,
  add column if not exists external_provider_set_by uuid references public.profiles (id) on delete set null,
  add column if not exists external_provider_set_at timestamptz;

comment on column public.chat_connections.paused_at is
  'Pausa de emergência da CONEXÃO (não só do robô) -- chat-gateway-proxy recusa connect/reconnect e chat-inbound-webhook nunca dispara automação enquanto não-nulo. GESTOR liga/desliga via PATCH direto (mesma policy "Somente GESTOR administra conexões de chat").';
comment on column public.chat_connections.external_provider_active is
  'true = um sistema externo ao VoxAssist (ex.: Digisac) está confirmado pelo gestor como ativo pra este número -- mesmo efeito de bloqueio do pause acima. Nunca detectado automaticamente (sem integração com sistemas externos neste repositório).';

create table if not exists public.chat_connection_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  connection_id uuid not null references public.chat_connections (id) on delete cascade,
  action text not null,
  previous_data jsonb,
  new_data jsonb,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_connection_audit_events_connection on public.chat_connection_audit_events (connection_id, created_at desc);

alter table public.chat_connection_audit_events enable row level security;

drop policy if exists "GESTOR vê auditoria de conexões da empresa" on public.chat_connection_audit_events;
create policy "GESTOR vê auditoria de conexões da empresa"
  on public.chat_connection_audit_events for select
  using (
    company_id = current_company_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'GESTOR')
  );

-- Nenhuma policy de INSERT/UPDATE/DELETE: só o trigger (security definer
-- implícito de trigger de tabela do dono) grava aqui -- nunca escrita
-- direta por PostgREST, nem de GESTOR.
revoke insert, update, delete on public.chat_connection_audit_events from authenticated, anon;

create or replace function public.chat_connections_audit_trigger()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.paused_at is distinct from old.paused_at then
    insert into public.chat_connection_audit_events(company_id, connection_id, action, previous_data, new_data, changed_by)
    values (
      new.company_id, new.id,
      case when new.paused_at is not null then 'CONEXAO_PAUSADA' else 'CONEXAO_DESPAUSADA' end,
      jsonb_build_object('paused_at', old.paused_at, 'pause_reason', old.pause_reason),
      jsonb_build_object('paused_at', new.paused_at, 'pause_reason', new.pause_reason),
      auth.uid()
    );
  end if;
  if new.external_provider_active is distinct from old.external_provider_active then
    insert into public.chat_connection_audit_events(company_id, connection_id, action, previous_data, new_data, changed_by)
    values (
      new.company_id, new.id,
      case when new.external_provider_active then 'CONFLITO_PROVEDOR_EXTERNO_MARCADO' else 'CONFLITO_PROVEDOR_EXTERNO_DESMARCADO' end,
      jsonb_build_object('external_provider_active', old.external_provider_active, 'external_provider_name', old.external_provider_name),
      jsonb_build_object('external_provider_active', new.external_provider_active, 'external_provider_name', new.external_provider_name),
      auth.uid()
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists chat_connections_audit on public.chat_connections;
create trigger chat_connections_audit
  after update on public.chat_connections
  for each row execute function public.chat_connections_audit_trigger();
