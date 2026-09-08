-- ============================================================
-- Matriz Mestra, Área 09 (Sistema & Segurança) -- "Tempo de
-- inatividade / encerramento automático" -- CRIAR confirmado:
-- nenhum watcher de inatividade existe hoje (user-logoff-v0813.js
-- só cobre logoff manual/troca de aba, sem nenhum timer de
-- inatividade). Guardado como coluna em `companies`, mesmo padrão
-- de finance_* (valor único por empresa).
--
-- Escopo desta etapa é só o CADASTRO do parâmetro -- implementar o
-- watcher de inatividade de verdade (timer no frontend + logoff
-- automático) fica pra uma etapa futura; nenhuma sessão é encerrada
-- automaticamente por esta migration, comportamento atual intacto.
-- ============================================================

alter table public.companies add column if not exists session_idle_timeout_minutes int;
comment on column public.companies.session_idle_timeout_minutes is 'Minutos de inatividade até encerrar a sessão automaticamente, parâmetro cadastrado -- ainda não aplicado (nenhum watcher de inatividade implementado ainda).';
