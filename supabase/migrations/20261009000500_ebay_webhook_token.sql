-- =============================================================================
-- MON STOCK — migration 20261009000500 : jeton de vérification des notifications eBay
-- -----------------------------------------------------------------------------
-- eBay exige, pour un keyset de production, un endpoint de notifications « Marketplace Account
-- Deletion » validé par un jeton (32 à 80 caractères alphanumériques) saisi À LA FOIS dans le
-- portail développeur eBay et sur le serveur. Il est généré ici dans Supabase Vault (lisible par
-- le propriétaire du projet : Dashboard → Project Settings → Vault) ; jamais dans le dépôt.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'vault')
     and not exists (select 1 from vault.secrets where name = 'EBAY_WEBHOOK_VERIFICATION_TOKEN') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'EBAY_WEBHOOK_VERIFICATION_TOKEN', 'MON STOCK : jeton à recopier dans le portail eBay (Alerts & Notifications → Marketplace account deletion).');
  end if;
end $$;
