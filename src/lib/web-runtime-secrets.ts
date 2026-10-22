/** Secrets d'exécution du serveur WEB (W-02), chargés par src/instrumentation.ts. */

/**
 * Secrets lus par le code exécuté sur le serveur web (vérifié par fermeture des imports depuis
 * src/app, src/proxy.ts et src/instrumentation.ts) :
 * - TOKEN_ENCRYPTION_KEY : chiffrement des jetons eBay / fournisseurs ;
 * - CRON_SECRET : routes /api/cron/* ;
 * - EBAY_* : OAuth, synchronisation et webhook eBay depuis le web ;
 * - SOURCING_DISCOVERY_PROVIDER / BRAVE_SEARCH_API_KEY : découverte de sources (catalogue sourcing).
 */
export const WEB_RUNTIME_SECRET_NAMES = [
  "TOKEN_ENCRYPTION_KEY",
  "CRON_SECRET",
  "EBAY_ENV",
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_RU_NAME",
  "EBAY_WEBHOOK_VERIFICATION_TOKEN",
  "SOURCING_DISCOVERY_PROVIDER",
  "BRAVE_SEARCH_API_KEY",
] as const;

/** Délai maximal de lecture du Vault : un Vault lent ne doit pas bloquer le démarrage de l'instance. */
export const VAULT_TIMEOUT_MS = 5_000;
