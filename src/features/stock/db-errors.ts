/**
 * Traduction des erreurs métier PostgreSQL du stock et des commandes fournisseurs
 * (codes levés par apply_inventory_movement, create_sku, receive_purchase_order_items
 * et les garde-fous de la migration 20261008002000) en messages utilisateur.
 * Module pur : utilisable côté serveur comme dans les tests unitaires.
 */
import { fromPostgrestError, toUserMessage } from "@/lib/errors";

const MESSAGES: Array<[RegExp, string]> = [
  [/SKU_CODE_EXISTS|skus_org_code_uidx/, "Ce code SKU existe déjà dans votre organisation (les majuscules et minuscules ne sont pas distinguées)."],
  [/SKU_CODE_REQUIRED/, "Le code SKU est requis."],
  [/PRODUCT_NOT_FOUND/, "Produit introuvable."],
  [/SKU_HAS_HISTORY/, "Ce produit a un historique (mouvements, ventes ou achats) : archivez-le plutôt que de le supprimer."],
  [/MOVEMENT_QUANTITY_TOO_LARGE/, "Quantité trop grande : un mouvement est limité à 1 000 000 d'unités."],
  [/STOCK_QUANTITY_TOO_LARGE/, "Stock trop élevé : le stock d'un SKU est limité à 1 milliard d'unités."],
  [/MOVEMENT_QUANTITY_ZERO/, "La quantité doit être différente de zéro."],
  [/MOVEMENT_SIGN_INVALID/, "Sens du mouvement incohérent avec son type (une réception ajoute, une vente retire)."],
  [/INSUFFICIENT_STOCK/, "Stock insuffisant : ce mouvement rendrait le stock négatif. Seules les ventes réelles peuvent rendre le stock négatif."],
  [/PURCHASE_ORDER_STALE/, "Cette commande a été réceptionnée entre-temps (double envoi ou autre utilisateur). Rechargez la page : rien n'a été compté deux fois."],
  [/PURCHASE_ORDER_ALREADY_RECEIVED/, "Cette commande est déjà entièrement reçue."],
  [/PURCHASE_ORDER_CANCELLED/, "Cette commande est annulée : elle ne peut plus être réceptionnée."],
  [/PURCHASE_ORDER_NOT_SENT/, "Marquez d'abord la commande comme envoyée avant de la réceptionner."],
  [/PURCHASE_ORDER_EMPTY/, "Ajoutez au moins une ligne avant d'envoyer la commande."],
  [/PURCHASE_ORDER_INVALID_TRANSITION/, "Ce changement de statut n'est pas possible depuis le statut actuel."],
  [/PURCHASE_ORDER_CLOSED/, "Cette commande est close (reçue ou annulée)."],
  [/PURCHASE_ORDER_LOCKED/, "Les lignes ne sont modifiables que tant que la commande n'est pas confirmée."],
  [/PURCHASE_ORDER_RECEIPT_REQUIRED/, "Les quantités reçues se modifient uniquement par une réception."],
  [/PURCHASE_ORDER_NOT_DELETABLE/, "Une commande envoyée ou réceptionnée ne se supprime pas : annulez-la."],
  [/PURCHASE_ORDER_ITEM_NOT_FOUND/, "Ligne de commande introuvable."],
  [/PURCHASE_ORDER_NOT_FOUND/, "Commande introuvable."],
  [/numeric field overflow|out of range for type integer/, "Valeur trop grande."],
];

/** Message utilisateur pour une erreur PostgREST du domaine stock / achats. */
export function stockErrorMessage(e: { code?: string; message?: string; details?: string | null } | null | undefined): string {
  const text = `${e?.message ?? ""} ${e?.details ?? ""}`;
  for (const [re, msg] of MESSAGES) if (re.test(text)) return msg;
  return toUserMessage(fromPostgrestError(e ?? { message: "Erreur inattendue" }));
}
