import { AppError } from "@/lib/errors";

/**
 * Erreurs des connecteurs marketplace. Chaque erreur porte un code stable afin que
 * le moteur de synchronisation et l'interface réagissent de façon prévisible :
 *  - AUTH_EXPIRED     : le token d'autorisation n'est plus valide → « Reconnecter »
 *  - RATE_LIMITED     : quota API atteint (réessayer plus tard)
 *  - API_ERROR        : réponse d'erreur ou panne de l'API distante
 *  - INVALID_RESPONSE : réponse reçue mais non conforme au schéma attendu (Zod)
 *  - NOT_CONFIGURED   : variables d'environnement absentes sur ce serveur
 *  - NOT_IMPLEMENTED  : connecteur pas encore disponible (jamais simulé)
 * Les `details` ne contiennent JAMAIS de secret (token, clé…).
 */
export type ConnectorErrorCode = "AUTH_EXPIRED" | "RATE_LIMITED" | "API_ERROR" | "INVALID_RESPONSE" | "NOT_CONFIGURED" | "NOT_IMPLEMENTED";

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly provider: string;
  readonly details: Record<string, unknown>;
  readonly httpStatus: number | null;
  readonly retryable: boolean;

  constructor(
    code: ConnectorErrorCode,
    provider: string,
    message: string,
    options: { details?: Record<string, unknown>; httpStatus?: number | null; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ConnectorError";
    this.code = code;
    this.provider = provider;
    this.details = options.details ?? {};
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable ?? (code === "RATE_LIMITED" || code === "API_ERROR");
  }
}

export function isConnectorError(e: unknown): e is ConnectorError {
  return e instanceof ConnectorError;
}

export const RECONNECT_ACTION = { label: "Reconnecter eBay", href: "/settings/integrations" } as const;

/** Traduit une ConnectorError en AppError (message utilisateur + action éventuelle). */
export function connectorErrorToAppError(e: ConnectorError): AppError {
  switch (e.code) {
    case "AUTH_EXPIRED":
      return new AppError("CONNECTION_EXPIRED", e.message, { action: RECONNECT_ACTION, details: e.details, cause: e });
    case "RATE_LIMITED":
      return new AppError("RATE_LIMITED", e.message, { details: e.details, cause: e });
    case "NOT_CONFIGURED":
      return new AppError("NOT_CONFIGURED", e.message, { details: e.details, cause: e });
    case "NOT_IMPLEMENTED":
      return new AppError("NOT_IMPLEMENTED", e.message, { details: e.details, cause: e });
    case "INVALID_RESPONSE":
    case "API_ERROR":
    default:
      return new AppError("EXTERNAL_API", e.message, { details: e.details, cause: e });
  }
}

/** Message court et sûr (sans secret) pour les journaux et sync_errors. */
export function describeError(e: unknown): { code: string; message: string; details: Record<string, unknown> } {
  if (isConnectorError(e)) return { code: e.code, message: e.message, details: { ...e.details, httpStatus: e.httpStatus } };
  if (e instanceof AppError) return { code: e.code, message: e.message, details: e.details ?? {} };
  if (e instanceof Error) return { code: "INTERNAL", message: e.message, details: {} };
  return { code: "INTERNAL", message: String(e), details: {} };
}
