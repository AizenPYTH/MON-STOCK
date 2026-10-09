/**
 * Traduction des erreurs de la base (codes métier levés par les fonctions SQL, SQLSTATE, erreurs
 * PostgREST) en messages utilisateur.
 *
 * Module PUR et PARTAGÉ : aucune dépendance serveur, Node ou navigateur. Il est utilisé par
 * l'application web (src/lib/errors.ts) ET par l'application mobile (apps/mobile), pour que les
 * deux affichent exactement les mêmes messages pour un même refus de la base.
 * tests/unit/shared-boundary.test.ts vérifie qu'il reste importable par le mobile.
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
  SKU_STALE: { code: "CONFLICT", message: "Ce SKU a été modifié entre-temps (autre onglet ou autre utilisateur). Rechargez la page pour voir la dernière version : vos changements n'ont pas été enregistrés." },
  SKU_UPDATE_INVALID: { code: "VALIDATION", message: "Modification du SKU invalide : vérifiez les champs du formulaire." },
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

/** Erreurs réseau RÉELLES (client HTTP / DNS / socket) : un message SQL contenant « network » n'en est pas une. */
export const NETWORK_ERROR = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|Network request failed/i;

export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export interface DescribedDbError {
  code: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
  /** Vrai quand la session (JWT) a expiré : l'interface propose de se reconnecter. */
  sessionExpired?: boolean;
}

/**
 * Message connu pour une erreur de la base, ou `null` si l'erreur n'est pas reconnue
 * (l'appelant affiche alors un message générique et journalise l'erreur brute — jamais
 * le message SQL brut à l'écran).
 */
export function describeDbError(e: DbErrorLike): DescribedDbError | null {
  const msg = e.message ?? "Erreur base de données";
  // Code métier en tête du message (« CODE » ou « CODE: détail »).
  const head = msg.match(/^([A-Z][A-Z0-9_]{2,})\b/)?.[1];
  const known = head ? SQL_ERROR_MESSAGES[head] : undefined;
  if (known) return { code: known.code, message: known.message, details: { pg: e.code ?? null, sqlCode: head ?? null } };
  for (const [k, v] of Object.entries(SQL_ERROR_MESSAGES)) {
    if (msg.includes(k)) return { code: v.code, message: v.message, details: { pg: e.code ?? null, sqlCode: k } };
  }
  if (e.code === "42501") return { code: "FORBIDDEN", message: "Vous n'avez pas les droits nécessaires pour cette action." };
  if (e.code === "23505") return { code: "CONFLICT", message: "Cet enregistrement existe déjà (doublon).", details: { pg: e.details ?? null } };
  if (e.code === "23503") return { code: "CONFLICT", message: "Impossible : cet élément est référencé par d'autres données." };
  if (e.code === "23514") return { code: "VALIDATION", message: "Valeur invalide (contrainte de validation).", details: { pg: msg } };
  if (e.code === "22001") return { code: "VALIDATION", message: "Valeur trop longue : raccourcissez le texte saisi.", details: { pg: e.code } };
  if (e.code === "22003") return { code: "VALIDATION", message: "Nombre hors limites : vérifiez les quantités et montants saisis.", details: { pg: e.code } };
  if (e.code === "40001" || e.code === "40P01") return { code: "CONFLICT", message: "Conflit d'accès simultané, réessayez.", details: { pg: e.code } };
  if (e.code === "PGRST116") return { code: "NOT_FOUND", message: "Élément introuvable." };
  if (e.code === "PGRST301" || /jwt expired/i.test(msg)) return { code: "AUTH_REQUIRED", message: "Votre session a expiré : reconnectez-vous.", sessionExpired: true };
  if (NETWORK_ERROR.test(msg)) return { code: "INTERNAL", message: "Base de données injoignable pour le moment. Réessayez dans quelques instants." };
  return null;
}
