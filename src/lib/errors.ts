/**
 * Erreurs applicatives : chaque erreur porte un code stable et un message
 * compréhensible par l'utilisateur (jamais « Something went wrong »).
 */
import { createLogger } from "@/lib/logger";
import { scrubSecrets } from "@/integrations/core/sanitize";
import { describeDbError, type AppErrorCode } from "@/lib/db-error-messages";

export type { AppErrorCode } from "@/lib/db-error-messages";

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

export { SQL_ERROR_MESSAGES } from "@/lib/db-error-messages";

const log = createLogger("db-error");

/** Référence courte communiquée à l'utilisateur et journalisée côté serveur (corrélation support). */
export function newErrorReference(): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Traduit une erreur PostgREST/Postgres (code SQLSTATE ou message métier) en AppError. */
export function fromPostgrestError(e: { code?: string; message?: string; details?: string | null; hint?: string | null }): AppError {
  const msg = e.message ?? "Erreur base de données";
  const known = describeDbError(e);
  if (known) {
    const action = known.code === "AUTH_REQUIRED" && known.sessionExpired ? { action: { label: "Se reconnecter", href: "/login" } } : {};
    return new AppError(known.code, known.message, { details: known.details, ...action });
  }
  // Erreur inconnue : le message brut (noms de tables, de contraintes, valeurs) n'est JAMAIS
  // montré à l'utilisateur ; il est journalisé côté serveur (secrets masqués) avec une référence.
  const ref = newErrorReference();
  log.error("unmapped database error", {
    ref,
    pg: e.code ?? null,
    message: scrubSecrets(msg),
    details: e.details ? scrubSecrets(e.details) : null,
    hint: e.hint ? scrubSecrets(e.hint) : null,
  });
  return new AppError("INTERNAL", `Une erreur inattendue est survenue côté base de données. Réessayez ou contactez le support (réf. ${ref}).`, {
    details: { pg: e.code ?? null, ref },
  });
}

/** Erreur PostgREST (instance PostgrestError, ou objet { code, message } des anciennes versions). */
function isPostgrestLike(e: unknown): e is { code?: string; message: string; details?: string | null; hint?: string | null } {
  if (!e || typeof e !== "object") return false;
  const o = e as { name?: unknown; code?: unknown; message?: unknown };
  if (typeof o.message !== "string") return false;
  return o.name === "PostgrestError" || (!(e instanceof Error) && typeof o.code === "string");
}

export function toUserMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  // Jamais le message SQL brut à l'écran : traduit (ou message générique + référence).
  if (isPostgrestLike(e)) return fromPostgrestError(e).message;
  if (e instanceof Error) return e.message;
  return "Une erreur inattendue s'est produite.";
}
