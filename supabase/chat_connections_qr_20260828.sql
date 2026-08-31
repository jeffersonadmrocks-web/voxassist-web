-- ============================================================
-- ETAPA C do Chat VoxAssist — amplia chat_connections (criada em
-- supabase/chat_foundation_20260828.sql) para os estados reais de uma
-- conexão WhatsApp por QR (voxassist-whatsapp-gateway, repositório
-- separado no Railway) e para os metadados que o gateway grava via
-- service_role.
--
-- Isolamento por empresa/filial já existe desde a primeira migration
-- (company_id + RLS via current_company_id()) — esta migration só
-- amplia o schema, não muda a política de isolamento. Idempotente.
-- ============================================================

alter table public.chat_connections drop constraint if exists chat_connections_status_check;
alter table public.chat_connections add constraint chat_connections_status_check
  check (status in ('DESCONECTADO', 'CONECTANDO', 'QR_REQUIRED', 'CONECTADO', 'RECONNECTING', 'SESSION_INVALID', 'ERRO'));

alter table public.chat_connections add column if not exists provider_version text;
alter table public.chat_connections add column if not exists last_connected_at timestamptz;
alter table public.chat_connections add column if not exists last_disconnected_at timestamptz;
