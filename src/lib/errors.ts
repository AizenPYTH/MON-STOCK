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

/**
 * Codes métier levés par les fonctions et triggers SQL (`raise exception 'CODE'`), traduits en
 * messages compréhensibles. Toute nouvelle exception SQL doit être ajoutée ici
 * (tests/unit/errors-mapping.test.ts vérifie que chaque code des migrations est couvert).
 */
export const SQL_ERROR_MESSAGES: Record<string, { code: AppErrorCode; message: string }> = {
  AUTH_REQUIRED: { code: "AUTH_REQUIRED", message: "Connexion requise." },
  FORBIDDEN: { code: "FORBIDDEN", message: "Vous n'avez pas les droits nécessaires sur cette organisation." },
  CROSS_ORGANIZATION_REFERENCE: { code: "FORBIDDEN", message: "Opération refusée : cet élément appartient à une autre organisation." },
  ORGANIZATION_IMMUTABLE: { code: "FORBIDDEN", message: "Opération refusée : un élément ne peut pas changer d'organisation." },
  ORGANIZATION_NOT_MEMBER: { code: "FORBIDDEN", message: "Vous n'êtes pas membre de cette organisation." },
  LAST_OWNER: { code: "CONFLICT", message: "Impossible : l'organisation doit conserver au moins un propriétaire." },
  INVITATION_INVALID: { code: "NOT_FOUND", message: "Invitation invalide ou expirée." },
  INVITATION_EMAIL_MISMATCH: { code: "FORBIDDEN", message: "Cette invitation a été envoyée à une autre adresse email." },
  INVITATION_EMAIL_NOT_CONFIRMED: { code: "FORBIDDEN", message: "Confirmez d'abord votre adresse email, puis acceptez l'invitation." },
  INVITATION_EMAIL_INVALID: { code: "VALIDATION", message: "Adresse email d'invitation invalide." },
  INVALID_TOKEN: { code: "VALIDATION", message: "Lien invalide." },
  INSUFFICIENT_STOCK: { code: "VALIDATION", message: "Stock insuffisant : ce mouvement rendrait le stock négatif." },
  MOVEMENT_QUANTITY_ZERO: { code: "VALIDATION", message: "La quantité d'un mouvement ne peut pas être nulle." },
  MOVEMENT_QUANTITY_TOO_LARGE: { code: "VALIDATION", message: "Quantité trop importante pour un seul mouvement." },
  MOVEMENT_SIGN_INVALID: { code: "VALIDATION", message: "Sens du mouvement incohérent avec son type (entrée / sortie)." },
  STOCK_QUANTITY_TOO_LARGE: { code: "VALIDATION", message: "Le stock résultant dépasserait la limite autorisée." },
  SKU_NOT_FOUND: { code: "NOT_FOUND", message: "SKU introuvable." },
  SKU_CODE_EXISTS: { code: "CONFLICT", message: "Ce code SKU existe déjà dans votre organisation." },
  SKU_CODE_REQUIRED: { code: "VALIDATION", message: "Le code SKU est requis." },
  SKU_HAS_HISTORY: { code: "CONFLICT", message: "Ce SKU a un historique (mouvements, ventes ou commandes) : archivez-le plutôt que de le supprimer." },
  PRODUCT_NOT_FOUND: { code: "NOT_FOUND", message: "Produit introuvable." },
  LISTING_NOT_FOUND: { code: "NOT_FOUND", message: "Annonce introuvable." },
  CHANNEL_NOT_FOUND: { code: "NOT_FOUND", message: "Canal de vente introuvable." },
  CONNECTION_NOT_FOUND: { code: "NOT_FOUND", message: "Connexion introuvable." },
  INVALID_ORDER: { code: "VALIDATION", message: "Commande externe invalide (données incomplètes ou incohérentes) : elle n'a pas été importée." },
  PURCHASE_ORDER_NOT_FOUND: { code: "NOT_FOUND", message: "Commande fournisseur introuvable." },
  PURCHASE_ORDER_ITEM_NOT_FOUND: { code: "NOT_FOUND", message: "Ligne de commande fournisseur introuvable." },
  PURCHASE_ORDER_CANCELLED: { code: "CONFLICT", message: "Cette commande fournisseur est annulée." },
  PURCHASE_ORDER_CLOSED: { code: "CONFLICT", message: "Cette commande fournisseur est clôturée." },
  PURCHASE_ORDER_ALREADY_RECEIVED: { code: "CONFLICT", message: "Cette commande fournisseur a déjà été entièrement reçue." },
  PURCHASE_ORDER_EMPTY: { code: "VALIDATION", message: "La commande fournisseur ne contient aucune ligne." },
  PURCHASE_ORDER_INVALID_STATUS: { code: "VALIDATION", message: "Statut de commande fournisseur invalide." },
  PURCHASE_ORDER_INVALID_TRANSITION: { code: "CONFLICT", message: "Ce changement de statut n'est pas autorisé pour cette commande." },
  PURCHASE_ORDER_LOCKED: { code: "CONFLICT", message: "Cette commande n'est plus modifiable (envoyée ou réceptionnée)." },
  PURCHASE_ORDER_NOT_DELETABLE: { code: "CONFLICT", message: "Cette commande ne peut pas être supprimée : seules les commandes en brouillon le peuvent." },
  PURCHASE_ORDER_NOT_SENT: { code: "CONFLICT", message: "La commande doit être envoyée avant d'être réceptionnée." },
  PURCHASE_ORDER_RECEIPT_REQUIRED: { code: "VALIDATION", message: "Indiquez au moins une quantité reçue." },
  PURCHASE_ORDER_STALE: { code: "CONFLICT", message: "La commande a été modifiée entre-temps : rechargez la page et réessayez." },
  INVALID_RECEIPTS: { code: "VALIDATION", message: "Réception invalide : vérifiez les quantités saisies." },
};

/** Traduit une erreur PostgREST/Postgres (code SQLSTATE ou message métier) en AppError. */
export function fromPostgrestError(e: { code?: string; message?: string; details?: string | null }): AppError {
  const msg = e.message ?? "Erreur base de données";
  // Code métier en tête du message (« CODE » ou « CODE: détail »).
  const head = msg.match(/^([A-Z][A-Z0-9_]{2,})\b/)?.[1];
  const known = head ? SQL_ERROR_MESSAGES[head] : undefined;
  if (known) return new AppError(known.code, known.message, { details: { pg: e.code ?? null, sqlCode: head ?? null } });
  for (const [k, v] of Object.entries(SQL_ERROR_MESSAGES)) {
    if (msg.includes(k)) return new AppError(v.code, v.message, { details: { pg: e.code ?? null, sqlCode: k } });
  }
  if (e.code === "42501") return new AppError("FORBIDDEN", "Vous n'avez pas les droits nécessaires pour cette action.");
  if (e.code === "23505") return new AppError("CONFLICT", "Cet enregistrement existe déjà (doublon).", { details: { pg: e.details ?? null } });
  if (e.code === "23503") return new AppError("CONFLICT", "Impossible : cet élément est référencé par d'autres données.");
  if (e.code === "23514") return new AppError("VALIDATION", "Valeur invalide (contrainte de validation).", { details: { pg: msg } });
  if (e.code === "PGRST116") return new AppError("NOT_FOUND", "Élément introuvable.");
  if (e.code === "PGRST301" || /jwt expired/i.test(msg)) return new AppError("AUTH_REQUIRED", "Votre session a expiré : reconnectez-vous.", { action: { label: "Se reconnecter", href: "/login" } });
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) return new AppError("INTERNAL", "Base de données injoignable pour le moment. Réessayez dans quelques instants.");
  return new AppError("INTERNAL", `Erreur de base de données : ${msg}`, { details: { pg: e.code ?? null } });
}

export function toUserMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return "Une erreur inattendue s'est produite.";
}
