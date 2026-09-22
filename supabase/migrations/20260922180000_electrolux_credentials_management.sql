-- Achado real do usuário (2026-09-22): a tela Electrolux (GESTOR) só
-- permite editar o "endereço da API" (electrolux_panel_settings.api_url)
-- -- que, desde a correção de 2026-09-04, é só um texto exibido/checagem
-- de "está configurado", nunca o valor realmente usado na chamada (a
-- chamada real sempre usava ELECTROLUX_API_URL/USER/PASSWORD, secrets
-- globais da Edge Function, configuráveis só por quem tem acesso direto
-- ao Supabase). Não existe hoje NENHUMA tela onde um GESTOR consiga
-- cadastrar/atualizar o usuário e senha reais da Electrolux -- pedido
-- explícito do usuário: cada empresa deve ter sua própria credencial, e
-- só o GESTOR da empresa a configura (os demais usuários nunca veem/
-- digitam usuário ou senha).
--
-- electrolux_connections (migration 20260901004500) já foi desenhada
-- pra isso -- uma linha por conexão/empresa, com um comentário
-- explícito dizendo "quando uma tela de gestão de conexões existir" --
-- só faltava a credencial de verdade e a RPC de escrita. Replica
-- exatamente o mesmo padrão já validado em produção pro Whirlpool
-- (whirlpool_connections + whirlpool_save_credentials): senha/usuário
-- nunca gravados em texto puro nesta tabela, só o id do secret no
-- Supabase Vault; só o GESTOR ativo da empresa dona da conexão pode
-- escrever.

alter table public.electrolux_connections
  add column if not exists api_url text,
  add column if not exists credential_username_secret_id uuid,
  add column if not exists credential_password_secret_id uuid,
  add column if not exists credential_version bigint not null default 0;

comment on column public.electrolux_connections.api_url is
  'Endereço base da API Electrolux desta conexão -- não é segredo. Substitui o uso do secret global ELECTROLUX_API_URL assim que preenchido.';
comment on column public.electrolux_connections.credential_username_secret_id is
  'Referência ao Supabase Vault; o usuário nunca é armazenado nesta tabela nem devolvido ao frontend.';
comment on column public.electrolux_connections.credential_password_secret_id is
  'Referência ao Supabase Vault; a senha nunca é armazenada nesta tabela nem devolvida ao frontend.';

-- Status da conexão do GESTOR: nunca expõe api_url/credential_secret_name
-- de outras empresas nem os ids de secret -- só o suficiente pra tela
-- mostrar "configurado"/"não configurado" e o histórico de sync.
CREATE OR REPLACE FUNCTION public.electrolux_get_my_connection()
 RETURNS TABLE(
   id uuid, name text, filial text, api_url text, active boolean,
   auth_status text, last_sync_at timestamptz, last_sync_error text,
   credential_configured boolean, credential_version bigint
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id, c.name, c.filial, c.api_url, c.active,
    c.auth_status, c.last_sync_at, c.last_sync_error,
    (c.credential_username_secret_id is not null and c.credential_password_secret_id is not null),
    c.credential_version
  from public.electrolux_connections c
  where c.company_id = public.current_company_id()
    and public.current_company_role() = 'GESTOR'
  order by c.created_at
  limit 1
$function$
;
revoke all on function public.electrolux_get_my_connection() from public, anon;
grant execute on function public.electrolux_get_my_connection() to authenticated;

CREATE OR REPLACE FUNCTION public.electrolux_save_credentials(
  p_connection_id uuid,
  p_api_url text,
  p_username text,
  p_password text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.electrolux_connections;
  username_id uuid;
  password_id uuid;
  new_version bigint;
  clean_url text;
begin
  select * into c from public.electrolux_connections where id = p_connection_id for update;
  if not found then raise exception 'Conexão Electrolux não encontrada'; end if;
  if not exists (
    select 1
    from public.user_companies uc
    join public.profiles p on p.id = uc.user_id
    where uc.user_id = (select auth.uid())
      and uc.company_id = c.company_id
      and uc.active = true
      and upper(coalesce(uc.role, p.role, '')) = 'GESTOR'
      and p.active = true
  ) then
    raise exception 'Apenas gestor ativo pode alterar credenciais Electrolux';
  end if;

  clean_url := regexp_replace(trim(coalesce(p_api_url, '')), '/+$', '');
  if clean_url !~ '^https?://' then
    raise exception 'Endereço da API Electrolux inválido';
  end if;
  if length(trim(coalesce(p_username, ''))) < 2 or length(p_username) > 200 then
    raise exception 'Usuário Electrolux inválido';
  end if;
  if length(coalesce(p_password, '')) < 4 or length(p_password) > 500 then
    raise exception 'Senha Electrolux inválida';
  end if;

  if c.credential_username_secret_id is null then
    select vault.create_secret(trim(p_username), 'electrolux_username_'||c.id::text,
      'Usuário Electrolux protegido — conexão '||c.id::text) into username_id;
  else
    username_id := c.credential_username_secret_id;
    perform vault.update_secret(username_id, trim(p_username));
  end if;
  if c.credential_password_secret_id is null then
    select vault.create_secret(p_password, 'electrolux_password_'||c.id::text,
      'Senha Electrolux protegida — conexão '||c.id::text) into password_id;
  else
    password_id := c.credential_password_secret_id;
    perform vault.update_secret(password_id, p_password);
  end if;

  new_version := c.credential_version + 1;
  update public.electrolux_connections
  set api_url = clean_url,
      credential_username_secret_id = username_id,
      credential_password_secret_id = password_id,
      credential_version = new_version,
      auth_status = 'NUNCA_TESTADO',
      updated_at = now()
  where id = c.id;

  return jsonb_build_object('ok', true, 'credential_version', new_version);
end
$function$
;
revoke all on function public.electrolux_save_credentials(uuid,text,text,text) from public, anon;
grant execute on function public.electrolux_save_credentials(uuid,text,text,text) to authenticated;

-- Único ponto de leitura da credencial real (usuário/senha em claro) --
-- só as Edge Functions (service_role) chamam isso, nunca o frontend.
-- Mesmo padrão já usado nas RPCs Whirlpool: toda leitura do Vault
-- acontece dentro do Postgres, nunca via client JS lendo vault.* direto.
CREATE OR REPLACE FUNCTION public.electrolux_resolve_credential(p_company_id uuid)
 RETURNS TABLE(api_url text, username text, password text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.api_url,
    (select decrypted_secret from vault.decrypted_secrets where id = c.credential_username_secret_id),
    (select decrypted_secret from vault.decrypted_secrets where id = c.credential_password_secret_id)
  from public.electrolux_connections c
  where c.company_id = p_company_id
    and c.active = true
    and c.credential_username_secret_id is not null
    and c.credential_password_secret_id is not null
  limit 1
$function$
;
revoke all on function public.electrolux_resolve_credential(uuid) from public, anon, authenticated;
grant execute on function public.electrolux_resolve_credential(uuid) to service_role;
