import type { EbayEnv } from "@/lib/env";

/**
 * Points d'entrée OFFICIELS eBay (aucun endpoint inventé). Production et sandbox
 * diffèrent uniquement par le domaine.
 *  - OAuth 2.0 :        https://developer.ebay.com/api-docs/static/oauth-authorization-code-grant.html
 *  - Identity API :     https://developer.ebay.com/api-docs/commerce/identity/resources/user/methods/getUser
 *  - Fulfillment API :  https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrders
 *  - Trading API :      https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMyeBaySelling.html
 *  - Notifications :    https://developer.ebay.com/api-docs/commerce/notification/overview.html
 *  - Lecture pour le conseiller (src/integrations/ebay/insights.ts, trading-insights.ts) :
 *      Account API (privilege, program, subscription, policies), Finances API (apiz), Analytics API
 *      (traffic_report, seller_standards_profile, customer_service_metric), Marketing API
 *      (ad_campaign, promotion), Trading GetItem / GetMyeBaySelling / GetFeedback / GetUser / GetMyMessages.
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
  apizBase: string;  // apiz.ebay.com (Identity API, Finances API)
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

/**
 * Autorisations ÉTENDUES (« analyse complète » du conseiller), demandées UNIQUEMENT si l'administrateur
 * choisit « Autoriser l'analyse complète ». Toutes en lecture seule côté MON STOCK :
 *  - sell.finances            : Finances API (apiz.ebay.com) → transactions (ventes, frais par type,
 *                               remboursements, litiges), versements et fonds en attente. eBay ne publie
 *                               pas de variante « readonly » de ce scope ; MON STOCK n'appelle que des GET.
 *  - sell.analytics.readonly  : Analytics API → rapport de trafic (impressions, vues, taux de clic,
 *                               conversion), niveau vendeur et métriques de service client.
 *  - sell.marketing.readonly  : Marketing API → campagnes Promoted Listings et promotions (lecture).
 * Docs : https://developer.ebay.com/api-docs/static/oauth-scopes.html
 */
export const EBAY_EXTENDED_SCOPES: ReadonlyArray<{ scope: string; reason: string }> = [
  { scope: "https://api.ebay.com/oauth/api_scope/sell.finances", reason: "Analyse complète : transactions, frais eBay par type, remboursements, litiges, versements et fonds en attente (Finances API, lecture uniquement)." },
  { scope: "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly", reason: "Analyse complète : trafic des annonces (impressions, vues, taux de clic, conversion), niveau vendeur et métriques de service client (Analytics API)." },
  { scope: "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly", reason: "Analyse complète : campagnes Promoted Listings et promotions en cours (Marketing API, lecture uniquement)." },
];

/** Scopes nommés (pour vérifier qu'une connexion a accordé une autorisation précise). */
export const EBAY_SCOPE = {
  base: "https://api.ebay.com/oauth/api_scope",
  fulfillment: "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  inventory: "https://api.ebay.com/oauth/api_scope/sell.inventory",
  accountReadonly: "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  identity: "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  finances: "https://api.ebay.com/oauth/api_scope/sell.finances",
  analyticsReadonly: "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  marketingReadonly: "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
} as const;

/** Scopes à demander à l'autorisation : standard, ou standard + étendus (« analyse complète »). */
export function ebayScopeList(options: { extended?: boolean } = {}): string[] {
  const base = EBAY_SCOPES.map((s) => s.scope);
  return options.extended ? [...base, ...EBAY_EXTENDED_SCOPES.map((s) => s.scope)] : base;
}

/**
 * Scopes à envoyer au RAFRAÎCHISSEMENT d'un token : exactement ceux ACCORDÉS à la connexion
 * (channel_connections.scopes). eBay répond invalid_scope si l'on demande un scope non accordé :
 * demander la liste courante de l'application casserait toutes les connexions existantes dès
 * qu'un scope est ajouté. Connexion ancienne sans scopes enregistrés → scopes standard.
 */
export function ebayRefreshScopes(granted: readonly string[] | null | undefined): string[] {
  const clean = [...new Set((granted ?? []).map((s) => s.trim()).filter((s) => s.startsWith("https://api.ebay.com/oauth/api_scope")))];
  return clean.length > 0 ? clean : ebayScopeList();
}

export function hasEbayScope(granted: readonly string[] | null | undefined, scope: string): boolean {
  return (granted ?? []).includes(scope);
}

/** true si la connexion a accordé TOUTES les autorisations de l'analyse complète. */
export function hasExtendedEbayScopes(granted: readonly string[] | null | undefined): boolean {
  return EBAY_EXTENDED_SCOPES.every((s) => hasEbayScope(granted, s.scope));
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
