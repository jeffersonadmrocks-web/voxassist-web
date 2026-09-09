-- ============================================================
-- Matriz Mestra, Área 07 -- "Notificações automáticas pro cliente".
-- Decisão do usuário (2026-09-09): implementar progressivamente.
-- Fase 1: gatilho automático + mensagem sugerida + confirmação
-- humana antes do envio. Começar por "Pronto para entrega/retirada".
-- Não alterar a arquitetura de sessão/QR/reconexão do WhatsApp.
--
-- Reaproveita 100% do que já existe: `message_templates` (catálogo
-- já construído, migration 20260908100000), `advance_service_order_
-- status` (motor único de status, nunca duplicado) e
-- `window.vxResolveOsChatTarget`/`window.vxOpenChatWithDraft`
-- (mecanismo real de chat já usado pelo botão "Chat" da OS e por
-- os-send-document-chat-v0813.js -- abre a conversa com o texto
-- pronto, NUNCA envia sozinho).
--
-- Só uma coluna nova: `trigger_event`, pra marcar qual mensagem
-- padrão é sugerida em qual evento. Nenhuma tabela nova.
-- ============================================================

alter table public.message_templates add column if not exists trigger_event text;
alter table public.message_templates drop constraint if exists message_templates_trigger_event_check;
alter table public.message_templates add constraint message_templates_trigger_event_check
  check (trigger_event is null or trigger_event in ('OS_PRONTO_PARA_ENTREGA'));

comment on column public.message_templates.trigger_event is
  'Evento que sugere automaticamente esta mensagem (Fase 1: só OS_PRONTO_PARA_ENTREGA). Nulo = mensagem sem disparo automático, só uso manual. Sugestão sempre exige confirmação humana antes de enviar -- nunca envia sozinho.';
