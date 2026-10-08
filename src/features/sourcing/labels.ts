/** Libellés FR partagés par les écrans sourcing / fournisseurs. */
export const SOURCE_TYPE_LABEL: Record<string, string> = {
  PUBLIC_WEB: "Page publique",
  API: "API",
  CSV: "Flux CSV",
  XML: "Flux XML",
  JSON: "Flux JSON",
  SUPPLIER_ACCOUNT: "Compte fournisseur",
  MANUAL: "Saisie manuelle",
  PARTNER_FEED: "Flux partenaire",
};

export const SOURCE_STATUS_LABEL: Record<string, string> = {
  not_connected: "Source non connectée",
  active: "Connectée",
  paused: "En pause",
  error: "Erreur",
};

export const CONNECTION_STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  connected: "Connecté",
  expired: "Expiré",
  error: "Erreur",
  disconnected: "Déconnecté",
};

export const STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: "En stock",
  low: "Stock faible",
  out_of_stock: "Rupture",
  unknown: "Stock non communiqué",
};

export const OFFER_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  expired: "Expirée",
  suspicious: "Suspecte",
  rejected: "Rejetée",
};

export const CONDITION_LABEL: Record<string, string> = {
  new: "Neuf",
  refurbished: "Reconditionné",
  used: "Occasion",
  unknown: "État non communiqué",
};

export const TAX_LABEL: Record<string, string> = { ht: "HT", ttc: "TTC", unknown: "HT/TTC non communiqué" };

export const SYNC_FREQUENCY_LABEL: Record<string, string> = {
  manual: "Manuelle",
  hourly: "Toutes les heures",
  every_6_hours: "Toutes les 6 heures",
  daily: "Quotidienne",
};

export const PO_STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  confirmed: "Confirmée",
  partially_received: "Partiellement reçue",
  received: "Reçue",
  cancelled: "Annulée",
};

export const EVENT_KIND_LABEL: Record<string, string> = {
  price_below_threshold: "Prix sous votre seuil",
  price_drop: "Baisse de prix",
  new_stock: "Retour en stock",
  low_stock: "Stock en baisse",
  new_offer: "Nouvelle offre",
};

export const MATCH_LEVEL_LABEL: Record<string, string> = { high: "Correspondance forte", ambiguous: "À valider" };
