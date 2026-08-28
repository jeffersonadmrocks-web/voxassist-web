-- ============================================================
-- Agendamento automático das edge functions periódicas (2026-08-28).
-- Achado real: pg_cron está instalado mas ZERO jobs configurados — os
-- comentários no código ("Agendada via Supabase Cron a cada 10min")
-- nunca corresponderam à realidade. Toda sincronização até hoje foi
-- manual. É a causa raiz de dados "parados" (ex.: SVO encerrada na
-- Electrolux não refletindo no VoxAssist).
-- Idempotente (desagenda antes de reagendar, se já existir).
-- ============================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-electrolux-agenda') then
    perform cron.unschedule('sync-electrolux-agenda');
  end if;
  if exists (select 1 from cron.job where jobname = 'sync-electrolux-nps') then
    perform cron.unschedule('sync-electrolux-nps');
  end if;
  if exists (select 1 from cron.job where jobname = 'operational-alerts-scan') then
    perform cron.unschedule('operational-alerts-scan');
  end if;
end $$;

select cron.schedule(
  'sync-electrolux-agenda',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://dgasmtvpgifceyqufcfg.supabase.co/functions/v1/sync-electrolux-agenda',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Lnp0_Tot_BUD3GJgny3Yrg_NgN-757t"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'sync-electrolux-nps',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://dgasmtvpgifceyqufcfg.supabase.co/functions/v1/sync-electrolux-nps',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Lnp0_Tot_BUD3GJgny3Yrg_NgN-757t"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'operational-alerts-scan',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://dgasmtvpgifceyqufcfg.supabase.co/functions/v1/operational-alerts-scan',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Lnp0_Tot_BUD3GJgny3Yrg_NgN-757t"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
