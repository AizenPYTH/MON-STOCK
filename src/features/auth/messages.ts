/**
 * Codes d'erreur transmis à la page de connexion via `?error=`. L'URL ne transporte jamais
 * de texte libre affiché tel quel (un lien forgé ne peut pas injecter de message trompeur).
 */
const LOGIN_ERRORS = {
  session_expired: "Votre session a expiré. Reconnectez-vous pour continuer.",
  link_expired: "Ce lien a expiré. Demandez un nouveau lien (les liens reçus par email sont valables peu de temps et ne servent qu'une fois).",
  reset_link_expired: "Le lien de réinitialisation a expiré ou a déjà été utilisé. Demandez un nouveau lien depuis « Mot de passe oublié ? ».",
  link_invalid: "Lien d'authentification invalide. Demandez un nouveau lien.",
  link_not_validated: "Le lien n'a pas pu être validé dans ce navigateur. Ouvrez-le dans le navigateur où vous avez fait la demande, ou demandez un nouveau lien.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorMessage(code: string | undefined | null): string | undefined {
  if (!code) return undefined;
  if (Object.prototype.hasOwnProperty.call(LOGIN_ERRORS, code)) return LOGIN_ERRORS[code as LoginErrorCode];
  return LOGIN_ERRORS.link_invalid;
}

/**
 * Codes Supabase Auth signifiant réellement « lien expiré ou déjà utilisé » : jeton OTP expiré,
 * état du flux PKCE expiré ou consommé (introuvable côté serveur).
 */
const EXPIRED_LINK_CODES: ReadonlySet<string> = new Set(["otp_expired", "flow_state_expired", "flow_state_not_found"]);

/**
 * Code d'erreur pour un échec du callback Supabase.
 * - `errorCode` : `error_code` du lien, ou code de l'erreur de l'échange PKCE (absent si inconnu) ;
 * - `exchangeFailed` : l'échange du code contre une session a échoué (souvent : lien ouvert dans un
 *   autre navigateur que celui de la demande, le vérificateur PKCE n'y existe pas).
 * Seul un code réellement « expiré » est présenté comme tel ; tout autre échec de l'échange
 * (vérificateur absent, code inconnu ou manquant) reçoit un message distinct.
 */
export function callbackErrorCode(params: { errorCode?: string | null; next: string; exchangeFailed?: boolean }): LoginErrorCode {
  if (params.errorCode && EXPIRED_LINK_CODES.has(params.errorCode)) {
    return params.next.startsWith("/update-password") ? "reset_link_expired" : "link_expired";
  }
  if (params.exchangeFailed) return "link_not_validated";
  return "link_invalid";
}
