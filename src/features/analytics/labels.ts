import type { BadgeVariant } from "@/components/ui/badge";

export const PROVIDER_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Manuel" };

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  paid: "Payée",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  refunded: "Remboursée",
  unknown: "Inconnu",
};

export const ORDER_STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: "warning",
  paid: "info",
  shipped: "accent",
  delivered: "success",
  cancelled: "neutral",
  refunded: "danger",
  unknown: "outline",
};

export const TAX_LABEL: Record<string, string> = { ht: "HT", ttc: "TTC", unknown: "HT/TTC non précisé" };

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  PUBLIC_WEB: "Site public",
  API: "API fournisseur",
  CSV: "Flux CSV",
  XML: "Flux XML",
  JSON: "Flux JSON",
  SUPPLIER_ACCOUNT: "Compte fournisseur",
  MANUAL: "Saisie manuelle",
  PARTNER_FEED: "Flux partenaire",
};

export const ALERT_TYPE_LABEL: Record<string, string> = {
  sync_failed: "Synchronisation échouée",
  connection_expired: "Connexion expirée",
  unmapped_listings: "Annonces non associées",
  negative_stock: "Stock négatif",
  sourcing_opportunity: "Opportunité de sourcing",
};

/** Libellé du bouton d'action d'une alerte événementielle selon son type. */
export function alertActionLabel(type: string): string {
  switch (type) {
    case "connection_expired":
      return "Reconnecter eBay";
    case "sync_failed":
      return "Voir la synchronisation";
    case "unmapped_listings":
      return "Associer les annonces";
    case "negative_stock":
      return "Corriger le stock";
    case "sourcing_opportunity":
      return "Voir l'offre";
    default:
      return "Ouvrir";
  }
}

export const ALERT_SEVERITY_VARIANT: Record<string, BadgeVariant> = { info: "info", warning: "warning", critical: "danger" };
export const ALERT_SEVERITY_LABEL: Record<string, string> = { info: "Info", warning: "Attention", critical: "Critique" };

export const SOURCING_EVENT_LABEL: Record<string, string> = {
  price_below_threshold: "Prix sous le seuil",
  price_drop: "Baisse de prix",
  new_stock: "Stock de nouveau disponible",
  low_stock: "Stock fournisseur faible",
  new_offer: "Nouvelle offre",
};
