/** Types partagés du moteur de sourcing (purs, sans dépendance serveur). */
import type { ProductCondition } from "@/domain/sourcing/normalizer";

export type TaxType = "ht" | "ttc" | "unknown";
export type StockStatus = "in_stock" | "low" | "out_of_stock" | "unknown";

/**
 * Offre brute telle que produite par un parser (flux, page publique, saisie manuelle),
 * avant normalisation, validation et stockage. Toute valeur absente est null : rien n'est inventé.
 */
export interface RawOffer {
  externalOfferId: string;
  externalProductId?: string | null;
  title: string;
  price: number | null;
  currency: string | null;
  taxType?: TaxType;
  vatRate?: number | null;
  moq?: number | null;
  minimumOrderValue?: number | null;
  availableQuantity?: number | null;
  stockStatus?: StockStatus;
  shippingCost?: number | null;
  shippingCurrency?: string | null;
  deliveryMinDays?: number | null;
  deliveryMaxDays?: number | null;
  country?: string | null;
  url?: string | null;
  ean?: string | null;
  mpn?: string | null;
  brand?: string | null;
  model?: string | null;
  storage?: string | null;
  color?: string | null;
  grade?: string | null;
  condition?: ProductCondition | string | null;
  supplierSku?: string | null;
  /** multiple de commande (lot de 5, carton de 10…) */
  orderMultiple?: number | null;
  /** régime de TVA annoncé par le fournisseur (jamais déduit du pays) */
  vatRegime?: VatRegimeCode | null;
  /** pays d'expédition, distinct du pays du fournisseur */
  shipFromCountry?: string | null;
  warrantyMonths?: number | null;
  /** date de disponibilité (arrivage), AAAA-MM-JJ */
  availableFrom?: string | null;
  /** date de mise à jour indiquée par le fournisseur (ISO) */
  supplierUpdatedAt?: string | null;
  raw?: unknown;
}

export type VatRegimeCode = "normal" | "margin" | "reverse_charge" | "exempt" | "unknown";

export const RAW_OFFER_FIELDS = [
  "external_offer_id",
  "title",
  "price",
  "currency",
  "tax_type",
  "moq",
  "minimum_order_value",
  "available_quantity",
  "stock_status",
  "shipping_cost",
  "delivery_days",
  "delivery_min_days",
  "delivery_max_days",
  "country",
  "url",
  "ean",
  "mpn",
  "brand",
  "model",
  "storage",
  "color",
  "grade",
  "condition",
  "supplier_sku",
  "order_multiple",
  "vat_regime",
  "ship_from_country",
  "warranty_months",
  "available_from",
  "supplier_updated_at",
] as const;
export type RawOfferField = (typeof RAW_OFFER_FIELDS)[number];

export const RAW_OFFER_FIELD_LABELS: Record<RawOfferField, string> = {
  external_offer_id: "Identifiant de l'offre (obligatoire)",
  title: "Titre (obligatoire)",
  price: "Prix (obligatoire)",
  currency: "Devise",
  tax_type: "HT / TTC",
  moq: "Quantité minimale (MOQ)",
  minimum_order_value: "Montant minimum de commande",
  available_quantity: "Quantité disponible",
  stock_status: "Statut du stock",
  shipping_cost: "Frais de port",
  delivery_days: "Délai de livraison (jours)",
  delivery_min_days: "Délai minimum (jours)",
  delivery_max_days: "Délai maximum (jours)",
  country: "Pays (code à 2 lettres)",
  url: "URL de l'offre",
  ean: "EAN / GTIN",
  mpn: "Référence fabricant (MPN)",
  brand: "Marque",
  model: "Modèle",
  storage: "Stockage",
  color: "Couleur",
  grade: "Grade",
  condition: "État",
  supplier_sku: "Référence fournisseur",
  order_multiple: "Multiple de commande",
  vat_regime: "Régime de TVA (normal, marge…)",
  ship_from_country: "Pays d'expédition",
  warranty_months: "Garantie (mois)",
  available_from: "Disponible à partir du",
  supplier_updated_at: "Mise à jour fournisseur",
};
