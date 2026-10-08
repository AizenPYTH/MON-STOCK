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

/** Méthode de récupération d'une offre (traçabilité, cf. RetrievalMethod dans integrations/sourcing/core). */
export const RETRIEVAL_METHOD_LABEL: Record<string, string> = {
  public_html: "Page publique HTML",
  public_json: "JSON public de la plateforme",
  public_feed: "Flux public",
  official_api: "API officielle",
  supplier_account: "Compte fournisseur",
  manual: "Saisie manuelle",
};

/** Méthode déduite du type de source quand l'offre n'a pas de provenance explicite. */
export const SOURCE_TYPE_TO_METHOD: Record<string, string> = {
  PUBLIC_WEB: "public_html",
  API: "official_api",
  CSV: "public_feed",
  XML: "public_feed",
  JSON: "public_feed",
  PARTNER_FEED: "public_feed",
  SUPPLIER_ACCOUNT: "supplier_account",
  MANUAL: "manual",
};

export const ACCESS_LEVEL_LABEL: Record<string, string> = { public: "Accès public", account: "Compte requis" };

/** Statut d'une source lors d'une recherche en direct (LiveSourceStatus). */
export const LIVE_SOURCE_STATUS_LABEL: Record<string, string> = {
  ok: "Interrogée",
  cached: "Résultat récent",
  no_search: "Catalogue synchronisé uniquement",
  account_required: "Compte requis",
  not_attested: "Accès automatisé non attesté",
  robots_disallowed: "robots.txt interdit",
  error: "Erreur",
  timeout: "Délai dépassé",
  skipped: "Non interrogée (hors budget)",
};

export const LIVE_SOURCE_STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "outline"> = {
  ok: "success",
  cached: "info",
  no_search: "neutral",
  account_required: "warning",
  not_attested: "warning",
  robots_disallowed: "danger",
  error: "danger",
  timeout: "danger",
  skipped: "neutral",
};
