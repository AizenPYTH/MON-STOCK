/**
 * Erreurs applicatives : chaque erreur porte un code stable et un message
 * compréhensible par l'utilisateur (jamais « Something went wrong »).
 */
export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "NOT_CONFIGURED"
  | "CONNECTION_EXPIRED"
  | "EXTERNAL_API"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly action?: { label: string; href: string };

  constructor(
    code: AppErrorCode,
    message: string,
    options: { status?: number; details?: Record<string, unknown>; action?: { label: string; href: string }; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.details = options.details;
    this.action = options.action;
  }
}

function defaultStatus(code: AppErrorCode): number {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "VALIDATION":
      return 400;
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "NOT_IMPLEMENTED":
      return 501;
    case "NOT_CONFIGURED":
    case "CONNECTION_EXPIRED":
    case "EXTERNAL_API":
    case "INTERNAL":
    default:
      return 500;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Traduit une erreur PostgREST/Postgres (code SQLSTATE ou message métier) en AppError. */
export function fromPostgrestError(e: { code?: string; message?: string; details?: string | null }): AppError {
  const msg = e.message ?? "Erreur base de données";
  if (msg.includes("AUTH_REQUIRED")) return new AppError("AUTH_REQUIRED", "Connexion requise.");
  if (msg.includes("FORBIDDEN") || e.code === "42501") return new AppError("FORBIDDEN", "Vous n'avez pas les droits nécessaires sur cette organisation.");
  if (msg.includes("INSUFFICIENT_STOCK")) return new AppError("VALIDATION", "Stock insuffisant : ce mouvement rendrait le stock négatif.");
  if (msg.includes("SKU_NOT_FOUND")) return new AppError("NOT_FOUND", "SKU introuvable.");
  if (msg.includes("LISTING_NOT_FOUND")) return new AppError("NOT_FOUND", "Annonce introuvable.");
  if (msg.includes("INVITATION_INVALID")) return new AppError("NOT_FOUND", "Invitation invalide ou expirée.");
  if (msg.includes("INVITATION_EMAIL_MISMATCH")) return new AppError("FORBIDDEN", "Cette invitation a été envoyée à une autre adresse email.");
  if (e.code === "23505") return new AppError("CONFLICT", "Cet enregistrement existe déjà (doublon).", { details: { pg: e.details ?? null } });
  if (e.code === "23503") return new AppError("CONFLICT", "Impossible : cet élément est référencé par d'autres données.");
  if (e.code === "23514") return new AppError("VALIDATION", "Valeur invalide (contrainte de validation).", { details: { pg: msg } });
  if (e.code === "PGRST116") return new AppError("NOT_FOUND", "Élément introuvable.");
  return new AppError("INTERNAL", msg, { details: { pg: e.code ?? null } });
}

export function toUserMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return "Une erreur inattendue s'est produite.";
}
