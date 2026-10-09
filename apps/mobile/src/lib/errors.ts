import { describeDbError, NETWORK_ERROR } from "@/lib/db-error-messages";
import { stockErrorText } from "@/features/stock/db-error-messages";

/**
 * Message utilisateur pour toute erreur (Supabase, réseau, validation).
 * Mêmes traductions que l'application web (modules partagés) ; jamais le message SQL brut.
 */
export const OFFLINE_MESSAGE = "Connexion internet indisponible. Vérifiez votre réseau puis réessayez.";
export const GENERIC_MESSAGE = "Une erreur inattendue est survenue. Réessayez dans quelques instants.";

export class UserFacingError extends Error {
  constructor(message: string, readonly code: string = "ERROR") {
    super(message);
    this.name = "UserFacingError";
  }
}

const AUTH_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, "Email ou mot de passe incorrect."],
  [/email not confirmed/i, "Adresse email non confirmée : ouvrez le lien reçu par email, puis reconnectez-vous."],
  [/user already registered|already been registered/i, "Un compte existe déjà avec cette adresse email : connectez-vous."],
  [/password should be at least|weak password/i, "Mot de passe trop faible (8 caractères minimum)."],
  [/rate limit|too many requests|over_email_send_rate_limit/i, "Trop de tentatives. Patientez quelques minutes puis réessayez."],
  [/invalid.*(otp|token)|token has expired|expired/i, "Lien expiré ou déjà utilisé : demandez-en un nouveau."],
  [/refresh token|session.*(missing|expired)|jwt expired/i, "Votre session a expiré : reconnectez-vous."],
];

function isNetworkError(message: string): boolean {
  return NETWORK_ERROR.test(message) || /network request failed|failed to fetch|timeout|abort/i.test(message);
}

export function userMessage(e: unknown): string {
  if (e instanceof UserFacingError) return e.message;
  if (!e || typeof e !== "object") return GENERIC_MESSAGE;
  const o = e as { message?: unknown; code?: unknown; details?: unknown; name?: unknown; status?: unknown };
  const message = typeof o.message === "string" ? o.message : "";
  if (isNetworkError(message)) return OFFLINE_MESSAGE;
  // Erreurs Supabase Auth (AuthApiError…)
  if (typeof o.name === "string" && /Auth/.test(o.name)) {
    for (const [re, text] of AUTH_MESSAGES) if (re.test(message) || re.test(String(o.code ?? ""))) return text;
    return "Authentification impossible pour le moment. Réessayez.";
  }
  // Erreurs PostgREST / PostgreSQL : refus métier du stock d'abord, puis traduction partagée.
  const db = { code: typeof o.code === "string" ? o.code : undefined, message, details: typeof o.details === "string" ? o.details : null };
  const stock = stockErrorText(db);
  if (stock) return stock;
  const known = describeDbError(db);
  if (known) return known.message;
  return GENERIC_MESSAGE;
}

/** Erreur de session expirée : l'interface renvoie vers la connexion. */
export function isSessionExpired(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as { message?: unknown; code?: unknown };
  return o.code === "PGRST301" || (typeof o.message === "string" && /jwt expired|refresh token/i.test(o.message));
}
