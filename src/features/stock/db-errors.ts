/**
 * Traduction des erreurs métier PostgreSQL du stock et des commandes fournisseurs
 * (codes levés par apply_inventory_movement, create_sku, receive_purchase_order_items
 * et les garde-fous de la migration 20261008002000) en messages utilisateur.
 * Module pur : utilisable côté serveur comme dans les tests unitaires.
 */
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { stockErrorText } from "@/features/stock/db-error-messages";

/** Message utilisateur pour une erreur PostgREST du domaine stock / achats. */
export function stockErrorMessage(e: { code?: string; message?: string; details?: string | null } | null | undefined): string {
  return stockErrorText(e) ?? toUserMessage(fromPostgrestError(e ?? { message: "Erreur inattendue" }));
}
