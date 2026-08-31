-- ============================================================
-- Remoção da infraestrutura de teste Digisac (etapa 1, revogada em
-- 2026-08-28). Decisão: a integração Digisac↔VoxAssist foi encerrada —
-- a Digisac continua em uso pela Vox EXTERNAMENTE e de forma
-- independente durante a transição para o Chat VoxAssist próprio
-- (MessagingService → MessagingProvider → WhatsAppQrProvider). Nada
-- neste arquivo afeta a operação da Digisac em si, só a tabela que
-- vivia dentro do VoxAssist.
--
-- A migration original que criou esta tabela
-- (supabase/digisac_test_audit_20260828.sql) permanece no repositório
-- por instrução explícita — a remoção é feita por esta migration nova,
-- auditável, em vez de apagar o histórico.
--
-- Dependências verificadas antes de escrever isto: nenhuma FK aponta
-- para digisac_test_runs, e nenhuma outra tabela/função a referencia.
-- Idempotente.
-- ============================================================

drop table if exists public.digisac_test_runs;
