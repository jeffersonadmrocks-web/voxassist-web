-- ============================================================
-- Presença real dos atendentes -- 3 estados (achado do usuário
-- 2026-09-02, pacote fila/robô/presença).
--
-- O indicador anterior (user_presence, 2026-09-02 mais cedo) era
-- binário: online se last_seen_at < 2min, senão offline -- sem estado
-- intermediário e sem diferenciar "não mandou heartbeat há um tempo"
-- de "saiu explicitamente" (logout). Pedido agora exige os 3 estados
-- com limiares próprios e logout explícito como um sinal à parte do
-- simples tempo decorrido:
--   Online: heartbeat válido e atividade nos últimos 10 minutos.
--   Ausente: sessão válida, sem atividade entre 10 e 20 minutos.
--   Offline: logout explícito, sessão encerrada, ou >20min sem presença válida.
-- ============================================================

alter table public.user_presence add column logged_out_at timestamptz;

comment on column public.user_presence.logged_out_at is
  'Marca logout explícito (user-logoff-v0813.js) -- se mais recente que last_seen_at, força OFFLINE mesmo dentro dos 10/20min de tolerância por tempo. Todo heartbeat novo (presence-heartbeat-v1.js) limpa este campo -- qualquer atividade nova volta pra ONLINE imediatamente, mesmo depois de um logout anterior.';

comment on table public.user_presence is
  'Heartbeat de presença -- cada sessão ativa grava/atualiza sua própria linha a cada 30s (ver presence-heartbeat-v1.js). Estado calculado no cliente a partir de last_seen_at + logged_out_at (ver presenceStatus em chat-monitor-v1.js): ONLINE (<10min), AUSENTE (10-20min), OFFLINE (>20min ou logout explícito mais recente que o último heartbeat). Sem histórico -- só o último ping.';
