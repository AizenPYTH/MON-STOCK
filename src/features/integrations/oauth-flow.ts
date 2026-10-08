/**
 * Codes d'erreur du flux OAuth eBay transmis dans l'URL (`/settings/integrations?error=<code>`).
 * Seul un CODE circule dans l'URL : la page affiche le message associé. Un texte libre dans
 * l'URL permettrait à un tiers d'afficher n'importe quel message dans l'application (lien piégé).
 */
export const OAUTH_ERROR_MESSAGES = {
  not_admin: "Seuls les administrateurs de l'organisation peuvent connecter eBay.",
  not_configured: "Intégration eBay non configurée sur ce serveur (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RU_NAME). Voir docs/ebay-setup.md.",
  cross_site: "Demande de connexion refusée : elle ne provient pas de MON STOCK. Relancez la connexion depuis cette page.",
  state_failed: "Impossible de démarrer la connexion eBay (état OAuth non enregistré). Réessayez.",
  access_denied: "Vous avez refusé l'autorisation sur eBay : aucune connexion n'a été créée.",
  ebay_error: "eBay a renvoyé une erreur pendant l'autorisation. Relancez la connexion ; si le problème persiste, vérifiez le RuName et l'environnement (production / sandbox).",
  incomplete: "Retour eBay incomplet (code ou état manquant). Relancez la connexion.",
  state_check_failed: "Impossible de vérifier l'état de la connexion. Réessayez.",
  state_unknown: "État de connexion inconnu ou déjà utilisé. Relancez la connexion eBay.",
  browser_mismatch: "Ce retour eBay ne provient pas du navigateur qui a lancé la connexion. Relancez la connexion eBay depuis MON STOCK.",
  state_expired: "La demande de connexion a expiré (15 min). Relancez la connexion eBay.",
  exchange_denied: "eBay a refusé le code d'autorisation (expiré ou déjà utilisé). Relancez la connexion eBay.",
  app_credentials: "eBay refuse les identifiants de l'application (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET invalides ou environnement production/sandbox incohérent).",
  rate_limited: "Quota d'appels eBay atteint : réessayez dans quelques minutes.",
  ebay_unavailable: "eBay n'a pas répondu correctement pendant la connexion. Réessayez dans quelques minutes.",
  internal: "La connexion eBay n'a pas pu être enregistrée. Réessayez ; si le problème persiste, contactez le support.",
} as const;

export type OAuthErrorCode = keyof typeof OAUTH_ERROR_MESSAGES;

export const OAUTH_GENERIC_ERROR = "La connexion eBay n'a pas abouti. Relancez la connexion depuis cette page.";

/** Message à afficher pour un code reçu dans l'URL ; tout texte inconnu donne le message générique (jamais recopié). */
export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(OAUTH_ERROR_MESSAGES, code) ? OAUTH_ERROR_MESSAGES[code as OAuthErrorCode] : OAUTH_GENERIC_ERROR;
}

/** Code d'erreur pour une exception levée pendant l'échange du code / la lecture du compte. */
export function oauthErrorCodeFor(e: unknown): OAuthErrorCode {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  switch (code) {
    case "AUTH_EXPIRED":
      return "exchange_denied";
    case "NOT_CONFIGURED":
      return "app_credentials";
    case "RATE_LIMITED":
      return "rate_limited";
    case "API_ERROR":
    case "INVALID_RESPONSE":
      return "ebay_unavailable";
    default:
      return "internal";
  }
}

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Cookie httpOnly liant l'état OAuth au navigateur qui a démarré le flux (posé par /connect, exigé par /callback). */
export const OAUTH_STATE_COOKIE = "ebay_oauth_state";
export const OAUTH_STATE_COOKIE_PATH = "/api/integrations/ebay";
export const OAUTH_STATE_TTL_SECONDS = 15 * 60;

/**
 * Défense CSRF du démarrage du flux (en plus du POST obligatoire et des cookies SameSite=Lax) :
 * refuse une requête explicitement inter-sites (Sec-Fetch-Site) ou dont l'Origin n'est pas l'application.
 */
export function isCrossSiteRequest(headers: Headers, allowedOrigins: string[]): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  if (!origin || origin === "null") return origin === "null";
  return !allowedOrigins.some((o) => {
    try {
      return new URL(o).origin === origin;
    } catch {
      return false;
    }
  });
}
