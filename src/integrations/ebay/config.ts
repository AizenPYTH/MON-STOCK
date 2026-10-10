import type { EbayEnv } from "@/lib/env";

/**
 * Points d'entrée OFFICIELS eBay (aucun endpoint inventé). Production et sandbox
 * diffèrent uniquement par le domaine.
 *  - OAuth 2.0 :        https://developer.ebay.com/api-docs/static/oauth-authorization-code-grant.html
 *  - Identity API :     https://developer.ebay.com/api-docs/commerce/identity/resources/user/methods/getUser
 *  - Fulfillment API :  https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrders
 *  - Trading API :      https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMyeBaySelling.html
 *  - Notifications :    https://developer.ebay.com/api-docs/commerce/notification/overview.html
 */
export interface EbayConfig {
  environment: "production" | "sandbox";
  clientId: string;
  clientSecret: string;
  ruName: string;
  webhookVerificationToken: string | null;
  authorizeUrl: string;
  tokenUrl: string;
  apiBase: string;   // api.ebay.com
  apizBase: string;  // apiz.ebay.com (Identity API)
  tradingUrl: string; // ws/api.dll
}

export const EBAY_PROVIDER = "ebay" as const;

/** Version de compatibilité de la Trading API (schéma XML). */
export const EBAY_TRADING_COMPATIBILITY_LEVEL = "1225";

/**
 * Scopes demandés, chacun justifié :
 *  - api_scope                  : scope de base obligatoire pour tout token (client_credentials pour
 *                                 les clés publiques de notification ; lecture générale).
 *  - sell.fulfillment           : Sell Fulfillment API → récupération des commandes et de leur statut
 *                                 (création, paiement, expédition, annulation). Nécessaire pour les ventes.
 *  - sell.inventory             : Trading API GetMyeBaySelling (lecture des annonces actives) et
 *                                 ReviseInventoryStatus (envoi des quantités). Sans ce scope la Trading
 *                                 API refuse les appels avec un token OAuth.
 *  - sell.account.readonly      : Account API (politiques métier) pour préparer les annonces.
 *  - commerce.identity.readonly : Identity API getUser → affiche « Connecté en tant que <username> »
 *                                 et relie les notifications eBay (userId) à la bonne connexion.
 */
export const EBAY_SCOPES: ReadonlyArray<{ scope: string; reason: string }> = [
  { scope: "https://api.ebay.com/oauth/api_scope", reason: "Scope de base requis par eBay pour tout token OAuth." },
  { scope: "https://api.ebay.com/oauth/api_scope/sell.fulfillment", reason: "Lecture des commandes (Sell Fulfillment API) : création, paiement, expédition, annulations." },
  { scope: "https://api.ebay.com/oauth/api_scope/sell.inventory", reason: "Lecture des annonces actives (GetMyeBaySelling) et mise à jour des quantités (ReviseInventoryStatus)." },
  { scope: "https://api.ebay.com/oauth/api_scope/sell.account.readonly", reason: "Lecture des politiques métier (paiement, retour, expédition) nécessaires pour préparer une annonce (Account API)." },
  { scope: "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly", reason: "Identifiant et pseudo du compte vendeur (Identity API) pour afficher le compte connecté et router les notifications." },
];

export function ebayScopeList(): string[] {
  return EBAY_SCOPES.map((s) => s.scope);
}

export function createEbayConfig(env: EbayEnv): EbayConfig {
  const sandbox = env.EBAY_ENV === "sandbox";
  return {
    environment: env.EBAY_ENV,
    clientId: env.EBAY_CLIENT_ID,
    clientSecret: env.EBAY_CLIENT_SECRET,
    ruName: env.EBAY_RU_NAME,
    webhookVerificationToken: env.EBAY_WEBHOOK_VERIFICATION_TOKEN ?? null,
    authorizeUrl: sandbox ? "https://auth.sandbox.ebay.com/oauth2/authorize" : "https://auth.ebay.com/oauth2/authorize",
    tokenUrl: sandbox ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token" : "https://api.ebay.com/identity/v1/oauth2/token",
    apiBase: sandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
    apizBase: sandbox ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com",
    tradingUrl: sandbox ? "https://api.sandbox.ebay.com/ws/api.dll" : "https://api.ebay.com/ws/api.dll",
  };
}
