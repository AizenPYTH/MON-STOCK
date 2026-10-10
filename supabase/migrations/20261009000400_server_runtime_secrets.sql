-- =============================================================================
-- MON STOCK — migration 20261009000400 : secrets d'exécution du serveur (Supabase Vault)
-- -----------------------------------------------------------------------------
-- L'Edge Function `api` a besoin de secrets SERVEUR : clé de chiffrement des tokens OAuth
-- (TOKEN_ENCRYPTION_KEY), secret des tâches planifiées (CRON_SECRET) et, quand le vendeur les
-- fournit, les clés de l'application eBay. Ils sont lus, dans l'ordre :
--   1. variables d'environnement de la fonction (Dashboard → Edge Functions → Secrets) ;
--   2. Supabase Vault, via server_runtime_secrets() (service_role uniquement).
--
-- TOKEN_ENCRYPTION_KEY et CRON_SECRET sont GÉNÉRÉS ICI, dans la base (octets aléatoires) :
-- ils ne transitent par aucun fichier, aucun dépôt, aucun outil. Ils ne sont jamais recréés
-- s'ils existent (changer la clé de chiffrement rendrait illisibles les tokens déjà stockés).
-- =============================================================================

-- Base locale de test (sans Supabase Vault) : fonction neutre, aucun secret.
do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $f$
      create or replace function public.server_runtime_secrets() returns jsonb language sql stable as $b$ select '{}'::jsonb $b$
    $f$;
    revoke all on function public.server_runtime_secrets() from public;
    return;
  end if;

  if not exists (select 1 from vault.secrets where name = 'TOKEN_ENCRYPTION_KEY') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'TOKEN_ENCRYPTION_KEY', 'MON STOCK : chiffrement AES-256-GCM des tokens OAuth (généré en base, ne jamais régénérer).');
  end if;
  if not exists (select 1 from vault.secrets where name = 'CRON_SECRET') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'CRON_SECRET', 'MON STOCK : autorisation des tâches planifiées /api/cron/* (pg_cron → Edge Function).');
  end if;

  -- Lecture des secrets connus par le serveur uniquement (liste fermée).
  execute $f$
    create or replace function public.server_runtime_secrets()
    returns jsonb
    language sql
    stable
    security definer
    set search_path = ''
    as $b$
      select coalesce(jsonb_object_agg(s.name, s.decrypted_secret), '{}'::jsonb)
      from vault.decrypted_secrets s
      where s.name in (
        'TOKEN_ENCRYPTION_KEY', 'CRON_SECRET',
        'EBAY_ENV', 'EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_RU_NAME', 'EBAY_WEBHOOK_VERIFICATION_TOKEN',
        'SOURCING_DISCOVERY_PROVIDER', 'BRAVE_SEARCH_API_KEY'
      )
    $b$
  $f$;
  revoke all on function public.server_runtime_secrets() from public, anon, authenticated;
  grant execute on function public.server_runtime_secrets() to service_role;
end $outer$;
