-- ============================================================
-- Robô de Atendimento -- fila de atendimento compartilhada
-- (achado do usuário 2026-09-02, pacote fila/robô/presença).
--
-- Substitui o destino "ATENDENTE" das regras de roteamento por "FILA
-- DE ATENDIMENTO": uma equipe nomeada (ex.: "Garantia Vitória"), cujos
-- integrantes podem ser trocados sem precisar republicar o robô.
-- Mantém tudo mais igual -- Loja+Garantia+Marca+especificidade
-- automática (chat_bot_routing_rules) continua exatamente igual, só
-- muda o QUE a regra aponta.
-- ============================================================

create table if not exists public.chat_queues (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.chat_queues add constraint chat_queues_pkey PRIMARY KEY (id);
alter table public.chat_queues add constraint chat_queues_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_queues add constraint chat_queues_name_check CHECK (length(trim(name)) > 0);
CREATE UNIQUE INDEX chat_queues_company_name_unique ON public.chat_queues (company_id, upper(trim(name)));

alter table public.chat_queues enable row level security;
create policy "chat_queues_select_company" on public.chat_queues for SELECT to authenticated
  using (company_id = current_company_id() and current_company_role() in ('GESTOR','ATENDENTE'));
create policy "chat_queues_write_gestor" on public.chat_queues for ALL to authenticated
  using (company_id = current_company_id() and current_company_role() = 'GESTOR')
  with check (company_id = current_company_id() and current_company_role() = 'GESTOR');

comment on table public.chat_queues is
  'Fila/equipe de atendimento nomeada (ex.: "Garantia Vitória") -- destino das regras de roteamento do Robô de Atendimento no lugar de um atendente individual. Integrantes trocam livremente (chat_queue_members) sem precisar republicar o robô.';

create table if not exists public.chat_queue_members (
  queue_id uuid not null,
  user_id uuid not null,
  added_at timestamptz not null default now()
);
alter table public.chat_queue_members add constraint chat_queue_members_pkey PRIMARY KEY (queue_id, user_id);
alter table public.chat_queue_members add constraint chat_queue_members_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES chat_queues(id) ON DELETE CASCADE;
alter table public.chat_queue_members add constraint chat_queue_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.chat_queue_members enable row level security;
-- Achado: a policy de chat_conversations (abaixo) faz uma subquery
-- nesta tabela pra decidir se o ATENDENTE enxerga uma conversa da fila
-- -- se esta tabela só deixasse GESTOR ler, a subquery do próprio
-- ATENDENTE nunca enxergaria sua PRÓPRIA linha de membresia (RLS
-- aplica recursivamente em subquery, não é security definer). Por
-- isso o próprio usuário sempre pode ver sua(s) linha(s), além de GESTOR.
create policy "chat_queue_members_select_self_or_gestor" on public.chat_queue_members for SELECT to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.chat_queues q where q.id = queue_id and q.company_id = current_company_id() and current_company_role() = 'GESTOR')
  );
create policy "chat_queue_members_write_gestor" on public.chat_queue_members for ALL to authenticated
  using (exists (select 1 from public.chat_queues q where q.id = queue_id and q.company_id = current_company_id() and current_company_role() = 'GESTOR'))
  with check (exists (select 1 from public.chat_queues q where q.id = queue_id and q.company_id = current_company_id() and current_company_role() = 'GESTOR'));

comment on table public.chat_queue_members is
  'Integrantes autorizados de uma fila de atendimento -- só GESTOR gerencia; cada usuário sempre enxerga sua própria linha (necessário pra RLS de chat_conversations funcionar pro próprio ATENDENTE).';

-- ---------- regras de roteamento passam a apontar pra fila, não atendente ----------
-- Sem linhas reais hoje (confirmado antes desta migration) -- troca
-- direta da coluna, sem necessidade de reescrever dado existente.
alter table public.chat_bot_routing_rules drop constraint chat_bot_routing_rules_target_attendant_id_fkey;
alter table public.chat_bot_routing_rules rename column target_attendant_id to target_queue_id;
alter table public.chat_bot_routing_rules add constraint chat_bot_routing_rules_target_queue_id_fkey FOREIGN KEY (target_queue_id) REFERENCES chat_queues(id);

-- ---------- conversa carrega a fila pra onde o robô roteou ----------
alter table public.chat_conversations add column current_queue_id uuid;
alter table public.chat_conversations add constraint chat_conversations_current_queue_id_fkey FOREIGN KEY (current_queue_id) REFERENCES chat_queues(id) ON DELETE SET NULL;

comment on column public.chat_conversations.current_queue_id is
  'Fila de atendimento pra onde o robô roteou esta conversa (regra de roteamento batida) -- null = sem fila (atribuição direta/atendente padrão/conversa manual). Todo integrante autorizado da fila enxerga a conversa enquanto ela estiver não atribuída (assigned_user_id null) -- ver policy de SELECT abaixo.';

-- ---------- amplia a visibilidade da Central de Conversas por fila ----------
-- Achado do usuário: "atendentes não devem receber filas/lojas para as
-- quais não estejam autorizados". Antes desta migration, ATENDENTE via
-- TODA conversa da empresa, sem restrição nenhuma -- comportamento
-- preservado quando current_queue_id é null (maioria das conversas
-- hoje), só ganha restrição quando a conversa tem fila. GESTOR e
-- TECNICO continuam exatamente como já estavam.
ALTER POLICY "Escopo de visualização da Central de Conversas" ON public.chat_conversations
  USING (
    (company_id = current_company_id())
    AND (
      (current_company_role() = 'GESTOR')
      OR (
        current_company_role() = 'ATENDENTE'
        AND (
          current_queue_id IS NULL
          OR assigned_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.chat_queue_members qm WHERE qm.queue_id = chat_conversations.current_queue_id AND qm.user_id = auth.uid())
        )
      )
      OR (
        (current_company_role() = 'TECNICO')
        AND (
          (assigned_user_id = auth.uid())
          OR (EXISTS (SELECT 1 FROM public.service_orders so WHERE ((so.id = chat_conversations.service_order_id) AND (so.technician_id = auth.uid()))))
        )
      )
    )
  );
