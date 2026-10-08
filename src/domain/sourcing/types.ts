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
  raw?: unknown;
}

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
};
