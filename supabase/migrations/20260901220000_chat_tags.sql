-- ============================================================
-- Tags da Central de Conversas (Fase 2 do plano de reprodução do
-- protótipo aprovado -- artifact 42ebf5fb, "Central de Conversas").
--
-- Catálogo de tags por empresa (chat_tags) + atribuição por conversa
-- (chat_conversation_tags), separados porque o mesmo catálogo é
-- reutilizado entre conversas -- uma conversa guarda só os ids das
-- tags atribuídas, nunca uma cópia do rótulo/cor.
--
-- Modelo de acesso espelha o de chat_conversations: GESTOR/ATENDENTE
-- administram (criar/editar catálogo, atribuir/remover de conversas);
-- leitura liberada pra empresa toda (tag é rótulo/cor, não dado
-- sensível -- não replica aqui o filtro por TECNICO/OS que
-- chat_conversations usa pra SELECT).
-- ============================================================

create table if not exists public.chat_tags (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  label text not null,
  color text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.chat_tags add constraint chat_tags_pkey PRIMARY KEY (id);
alter table public.chat_tags add constraint chat_tags_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_tags add constraint chat_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.chat_tags add constraint chat_tags_label_not_blank_check CHECK (length(btrim(label)) > 0);
alter table public.chat_tags add constraint chat_tags_company_label_unique UNIQUE (company_id, label);
CREATE INDEX idx_chat_tags_company ON public.chat_tags USING btree (company_id);
alter table public.chat_tags enable row level security;

create policy "Empresa vê o catálogo de tags" on public.chat_tags for SELECT
  using (company_id = current_company_id());
create policy "GESTOR/ATENDENTE administram tags" on public.chat_tags for ALL
  using ((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])))
  with check ((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])));

create table if not exists public.chat_conversation_tags (
  conversation_id uuid not null,
  tag_id uuid not null,
  company_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.chat_conversation_tags add constraint chat_conversation_tags_pkey PRIMARY KEY (conversation_id, tag_id);
alter table public.chat_conversation_tags add constraint chat_conversation_tags_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
alter table public.chat_conversation_tags add constraint chat_conversation_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES chat_tags(id) ON DELETE CASCADE;
alter table public.chat_conversation_tags add constraint chat_conversation_tags_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_conversation_tags add constraint chat_conversation_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX idx_chat_conversation_tags_tag ON public.chat_conversation_tags USING btree (tag_id);
alter table public.chat_conversation_tags enable row level security;

create policy "Empresa vê as tags atribuídas às conversas" on public.chat_conversation_tags for SELECT
  using (company_id = current_company_id());
create policy "GESTOR/ATENDENTE atribuem/removem tags de conversas" on public.chat_conversation_tags for ALL
  using ((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])))
  with check ((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])));
