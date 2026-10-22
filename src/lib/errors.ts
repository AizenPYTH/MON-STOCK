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

/**
 * Erreurs dont le message est rédigé POUR l'utilisateur (français, sans détail technique ni secret) :
 * réponses de l'Edge déjà formulées, refus d'envoi de catalogue, erreurs de connecteurs (messages
 * documentés « sans secret »), échéance interne. Reconnues par leur nom pour ne pas importer ici
 * les modules qui les définissent.
 */
const USER_FACING_ERROR_NAMES: ReadonlySet<string> = new Set(["EdgeApiError", "CatalogRequestError", "ConnectorError", "DeadlineExceededError"]);

const unexpectedLog = createLogger("unexpected-error");

/** Message générique + référence courte, l'erreur d'origine étant journalisée (secrets masqués). */
export function unexpectedErrorMessage(e: unknown): string {
  const ref = newErrorReference();
  const name = e instanceof Error ? e.name : typeof e;
  const message = e instanceof Error ? e.message : String(e);
  unexpectedLog.error("unexpected error shown as generic message", { ref, name, message: scrubSecrets(message).slice(0, 500) });
  return `Une erreur inattendue s'est produite. Réessayez ou contactez le support (réf. ${ref}).`;
}

/**
 * Message affichable pour une erreur quelconque (W-19) : seules les AppError (et les erreurs rédigées
 * pour l'utilisateur ci-dessus) montrent leur message ; une erreur PostgREST est traduite ; toute
 * autre erreur (réseau `fetch failed`, TypeError, bibliothèque…) donne un message générique avec une
 * référence journalisée — jamais de message technique ou en anglais à l'écran.
 */
export function toUserMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  // Jamais le message SQL brut à l'écran : traduit (ou message générique + référence).
  if (isPostgrestLike(e)) return fromPostgrestError(e).message;
  if (e instanceof Error && USER_FACING_ERROR_NAMES.has(e.name) && e.message) return e.message;
  return unexpectedErrorMessage(e);
}
