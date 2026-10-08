/**
 * Codes d'erreur transmis à la page de connexion via `?error=`. L'URL ne transporte jamais
 * de texte libre affiché tel quel (un lien forgé ne peut pas injecter de message trompeur).
 */
const LOGIN_ERRORS = {
  session_expired: "Votre session a expiré. Reconnectez-vous pour continuer.",
  link_expired: "Ce lien a expiré. Demandez un nouveau lien (les liens reçus par email sont valables peu de temps et ne servent qu'une fois).",
  reset_link_expired: "Le lien de réinitialisation a expiré ou a déjà été utilisé. Demandez un nouveau lien depuis « Mot de passe oublié ? ».",
  link_invalid: "Lien d'authentification invalide. Demandez un nouveau lien.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorMessage(code: string | undefined | null): string | undefined {
  if (!code) return undefined;
  if (Object.prototype.hasOwnProperty.call(LOGIN_ERRORS, code)) return LOGIN_ERRORS[code as LoginErrorCode];
  return LOGIN_ERRORS.link_invalid;
}

/** Code d'erreur pour un échec du callback Supabase (paramètres `error_code` / `error` du lien). */
export function callbackErrorCode(params: { errorCode?: string | null; next: string }): LoginErrorCode {
  const expired = params.errorCode === "otp_expired" || params.errorCode === "flow_state_expired" || params.errorCode === "flow_state_not_found";
  if (params.next.startsWith("/update-password")) return "reset_link_expired";
  return expired ? "link_expired" : "link_invalid";
}
