-- ============================================================
-- Respostas rápidas (Fase 4 do plano de reprodução do protótipo
-- aprovado -- artifact 42ebf5fb, "Central de Conversas").
--
-- Templates reutilizáveis de mensagem, por empresa. Mesmo padrão de
-- catálogo já usado em chat_tags (Fase 2): leitura liberada pra
-- empresa toda, escrita restrita a GESTOR/ATENDENTE.
-- ============================================================

create table if not exists public.chat_quick_reply_templates (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  title text not null,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.chat_quick_reply_templates add constraint chat_quick_reply_templates_pkey PRIMARY KEY (id);
alter table public.chat_quick_reply_templates add constraint chat_quick_reply_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public.chat_quick_reply_templates add constraint chat_quick_reply_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.chat_quick_reply_templates add constraint chat_quick_reply_templates_title_not_blank_check CHECK (length(btrim(title)) > 0);
alter table public.chat_quick_reply_templates add constraint chat_quick_reply_templates_body_not_blank_check CHECK (length(btrim(body)) > 0);
CREATE INDEX idx_chat_quick_reply_templates_company ON public.chat_quick_reply_templates USING btree (company_id, created_at DESC);
alter table public.chat_quick_reply_templates enable row level security;

create policy "Empresa vê as respostas rápidas" on public.chat_quick_reply_templates for SELECT
  using (company_id = current_company_id());
create policy "GESTOR/ATENDENTE administram respostas rápidas" on public.chat_quick_reply_templates for ALL
  using ((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])))
  with check ((company_id = current_company_id()) AND (current_company_role() = ANY (ARRAY['GESTOR'::text, 'ATENDENTE'::text])));
