-- =============================================================================
-- MON STOCK — migration 20261009000500 : jeton de vérification des notifications eBay
-- -----------------------------------------------------------------------------
-- eBay exige, pour un keyset de production, un endpoint de notifications « Marketplace Account
-- Deletion » validé par un jeton (32 à 80 caractères alphanumériques) saisi À LA FOIS dans le
-- portail développeur eBay et sur le serveur. Il est généré ici dans Supabase Vault (lisible par
-- le propriétaire du projet : Dashboard → Project Settings → Vault) ; jamais dans le dépôt.
-- =============================================================================
do $$
declare
  v_exists boolean;
begin
  -- Base locale de test sans Supabase Vault : rien à faire.
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    return;
  end if;
  execute 'select exists (select 1 from vault.secrets where name = $1)' into v_exists using 'EBAY_WEBHOOK_VERIFICATION_TOKEN';
  if not v_exists then
    execute 'select vault.create_secret($1, $2, $3)'
      using encode(extensions.gen_random_bytes(24), 'hex'), 'EBAY_WEBHOOK_VERIFICATION_TOKEN', 'MON STOCK : jeton à recopier dans le portail eBay (Alerts & Notifications → Marketplace account deletion).';
  end if;
end $$;
