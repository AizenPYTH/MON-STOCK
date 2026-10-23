import type { OAuthErrorCode } from "@/features/integrations/oauth-flow";

/**
 * Page de retour du flux OAuth eBay WEB (démarré par POST /api/integrations/ebay/connect).
 *
 * Seuls des chemins internes FIXES sont acceptés (liste blanche, comparaison exacte) : jamais une URL
 * fournie telle quelle, jamais de requête ni de fragment recopiés. Toute autre valeur (absente, URL
 * externe, `//evil`, chemin voisin, casse différente) donne la page des intégrations, comportement
 * historique. La redirection est ensuite construite côté serveur : origine canonique + chemin + un
 * CODE (`?error=`) ou un identifiant de connexion (`?connected=`), jamais un texte libre.
 */
export const OAUTH_RETURN_PATHS = ["/settings/integrations", "/onboarding/plateforme"] as const;

export type OAuthReturnPath = (typeof OAUTH_RETURN_PATHS)[number];

export const DEFAULT_OAUTH_RETURN: OAuthReturnPath = "/settings/integrations";

/** Chemin du parcours d'inscription (choix de plateforme). */
export const ONBOARDING_PLATFORM_PATH: OAuthReturnPath = "/onboarding/plateforme";

/** Champ du formulaire de démarrage qui porte la page de retour souhaitée. */
export const OAUTH_RETURN_FIELD = "return_to";

/**
 * Cookie httpOnly (même chemin que le cookie d'état) qui retient la page de retour pour les échecs
 * survenus AVANT la lecture de l'état en base (refus chez eBay, navigateur différent…). Il n'est
 * jamais une autorisation : sa valeur repasse par la liste blanche au retour.
 */
export const OAUTH_RETURN_COOKIE = "ebay_oauth_return";

/** `redirect_to` enregistré dans `oauth_states` pour un flux lancé depuis les réglages (valeur historique). */
export const SETTINGS_STATE_REDIRECT = "/settings/integrations/ebay/setup";

/** Chemin de retour validé (liste blanche exacte), sinon la page des intégrations. */
export function resolveOAuthReturn(raw: unknown): OAuthReturnPath {
  if (typeof raw !== "string") return DEFAULT_OAUTH_RETURN;
  return (OAUTH_RETURN_PATHS as readonly string[]).includes(raw) ? (raw as OAuthReturnPath) : DEFAULT_OAUTH_RETURN;
}

/** Valeur de `oauth_states.redirect_to` pour un flux web : l'onboarding est retenu tel quel. */
export function stateRedirectFor(ret: OAuthReturnPath): string {
  return ret === ONBOARDING_PLATFORM_PATH ? ONBOARDING_PLATFORM_PATH : SETTINGS_STATE_REDIRECT;
}

/** Page de retour lue dans l'état OAuth consommé (source serveur) ; valeur inconnue → intégrations. */
export function returnFromState(redirectTo: string | null | undefined): OAuthReturnPath {
  return redirectTo === ONBOARDING_PLATFORM_PATH ? ONBOARDING_PLATFORM_PATH : DEFAULT_OAUTH_RETURN;
}

/** Destination d'un échec : la page de retour + le CODE d'erreur seul. */
export function oauthErrorTarget(ret: OAuthReturnPath, code: OAuthErrorCode): string {
  return `${ret}?error=${code}`;
}

/**
 * Destination d'une connexion réussie (enregistrée en base) :
 * - depuis l'onboarding : la page de choix de plateforme, qui relit la connexion avant d'afficher
 *   le succès (`?connected=<id>` n'est qu'un indice, jamais une preuve) ;
 * - depuis les réglages : l'assistant pour une première connexion (ou jamais synchronisée), sinon la
 *   page des intégrations (comportement historique).
 */
export function oauthSuccessTarget(ret: OAuthReturnPath, input: { connectionId: string; isNew: boolean; hasSynced: boolean }): string {
  if (ret === ONBOARDING_PLATFORM_PATH) return `${ONBOARDING_PLATFORM_PATH}?connected=${input.connectionId}`;
  return input.isNew || !input.hasSynced ? `/settings/integrations/ebay/setup?connection=${input.connectionId}` : `/settings/integrations?connected=${input.connectionId}`;
}
