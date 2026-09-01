-- ============================================================
-- Hardening de segurança: electrolux_connections + autenticação
-- própria do cron das sincronizações Electrolux (2026-09-01).
--
-- Achado real: electrolux_connections nasceu (migration
-- 20260901004500_electrolux_connections.sql, regularizada agora no
-- histórico oficial) sem RLS e com grants completos de insert/
-- update/delete/truncate/references/trigger para anon e
-- authenticated -- qualquer usuário logado (ou nem isso, bastava um
-- policy futuro reabrir select) podia ler ou escrever direto na
-- tabela, inclusive credential_secret_name. Corrige fechando por
-- completo o acesso de anon/authenticated -- mesmo padrão já usado em
-- integration_sync_runs (ver integration_sync_runs_server_only): só
-- service_role (as próprias Edge Functions) lê/escreve. Nenhuma tela
-- hoje precisa ler essa tabela pelo client Supabase; quando uma tela
-- de gestão de conexões existir, a leitura correta é uma policy nova
-- restrita a current_company_role()='GESTOR' e
-- company_id=current_company_id() -- e mesmo assim nunca expor
-- credential_secret_name direto (usar uma view sem essa coluna).
--
-- Além disso, os dois cron jobs (sync-electrolux-agenda,
-- sync-electrolux-nps) disparavam as Edge Functions só com a apikey
-- pública, e as duas estavam deployadas com verify_jwt=false --
-- qualquer pessoa com a URL conseguia disparar os dois syncs
-- (comprovado antes desta migration com um curl direto, sem nenhum
-- header, retornando 200). As Edge Functions agora exigem
-- Authorization: Bearer <token> (ver index.ts de cada uma). O valor
-- nunca é gravado em texto aberto em cron.job nem em nenhum arquivo
-- deste repositório -- é gerado aqui mesmo, no servidor, via
-- pgcrypto, guardado só no Supabase Vault, e o cron lê de lá em
-- tempo de execução a cada disparo.
-- ============================================================

alter table public.electrolux_connections enable row level security;

revoke all on table public.electrolux_connections from anon, authenticated;
grant all on table public.electrolux_connections to service_role;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'electrolux_sync_service_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'electrolux_sync_service_token',
      'Bearer token exigido por sync-electrolux-agenda e sync-electrolux-nps -- nunca gravar em texto aberto em cron.job, código ou logs.'
    );
  end if;
end $$;

select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-electrolux-agenda'),
  command := $cron$
  select net.http_post(
    url := 'https://dgasmtvpgifceyqufcfg.supabase.co/functions/v1/sync-electrolux-agenda',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Lnp0_Tot_BUD3GJgny3Yrg_NgN-757t',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'electrolux_sync_service_token' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-electrolux-nps'),
  command := $cron$
  select net.http_post(
    url := 'https://dgasmtvpgifceyqufcfg.supabase.co/functions/v1/sync-electrolux-nps',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Lnp0_Tot_BUD3GJgny3Yrg_NgN-757t',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'electrolux_sync_service_token' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);
