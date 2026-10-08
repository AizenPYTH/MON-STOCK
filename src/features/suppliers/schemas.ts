import { z } from "zod";
import { RAW_OFFER_FIELDS, type RawOfferField } from "@/domain/sourcing/types";
import type { FieldMapping } from "@/services/sourcing/feed-parsers";

const optionalText = z.string().trim().max(300).optional().or(z.literal(""));
const optionalLong = z.string().trim().max(5000).optional().or(z.literal(""));
const optionalMoney = z.union([z.literal(""), z.coerce.number().min(0)]).optional();
const optionalInt = z.union([z.literal(""), z.coerce.number().int().min(0)]).optional();
const optionalPositiveInt = z.union([z.literal(""), z.coerce.number().int().min(1)]).optional();
const optionalCountry = z.string().trim().toUpperCase().length(2, "Code pays à 2 lettres (ex. FR).").optional().or(z.literal(""));
const optionalCurrency = z.string().trim().toUpperCase().length(3, "Code devise à 3 lettres (ex. EUR).").optional().or(z.literal(""));
const optionalUrl = z.url("URL invalide.").optional().or(z.literal(""));

export const syncFrequencySchema = z.enum(["manual", "hourly", "every_6_hours", "daily"]);
export const taxTypeSchema = z.enum(["ht", "ttc", "unknown"]);
export const conditionSchema = z.enum(["new", "refurbished", "used", "unknown"]);

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(200),
  company: optionalText,
  country: optionalCountry,
  website: optionalUrl,
  email: z.email("Adresse email invalide.").optional().or(z.literal("")),
  phone: optionalText,
  contact_name: optionalText,
  notes: optionalLong,
  payment_terms: optionalText,
  average_lead_time_days: optionalInt,
  default_moq: optionalPositiveInt,
  minimum_order_value: optionalMoney,
  currency: z.string().trim().toUpperCase().length(3, "Code devise à 3 lettres.").default("EUR"),
});

export const updateSupplierSchema = supplierSchema.extend({ supplier_id: z.string().uuid() });

export const publicWebSourceSchema = z.object({
  supplier_id: z.string().uuid(),
  name: z.string().trim().min(1, "Le nom de la source est requis.").max(200),
  base_url: z.url("URL de base invalide."),
  /** URLs de catalogue à lire lors d'une synchronisation (optionnel si l'adaptateur fournit une URL de recherche / de flux) */
  urls: z.string().trim().max(10000).optional().or(z.literal("")),
  adapter: z.string().trim().min(1, "Choisissez un adaptateur.").max(60),
  parser: z.string().trim().max(60).optional().or(z.literal("")),
  sync_frequency: syncFrequencySchema.default("manual"),
  default_currency: optionalCurrency,
  default_tax_type: taxTypeSchema.default("unknown"),
  country: optionalCountry,
  access_conditions: z.string().trim().max(2000).optional().or(z.literal("")),
  max_pages: z.union([z.literal(""), z.coerce.number().int().min(1).max(50)]).optional(),
  automated_access_confirmed: z.string().optional(),
});

export const connectAccountSchema = z.object({
  supplier_id: z.string().uuid(),
  connector_key: z.string().trim().min(1, "Choisissez un connecteur.").max(60),
});

export const connectionIdSchema = z.object({ connection_id: z.string().uuid() });

export const feedSchema = z.object({
  supplier_id: z.string().uuid(),
  feed_id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Le nom du flux est requis.").max(200),
  format: z.enum(["csv", "xml", "json"]),
  type: z.enum(["catalog", "price", "stock"]).default("catalog"),
  url: optionalUrl,
  sync_frequency: syncFrequencySchema.default("manual"),
  default_currency: optionalCurrency,
  default_tax_type: taxTypeSchema.default("unknown"),
  country: optionalCountry,
  delimiter: z.string().max(3).optional().or(z.literal("")),
  encoding: z.string().trim().max(30).optional().or(z.literal("")),
  root_path: z.string().trim().max(200).optional().or(z.literal("")),
  header_row: z.enum(["true", "false"]).default("true"),
});

export const manualOfferSchema = z.object({
  supplier_id: z.string().uuid(),
  title: z.string().trim().min(1, "Le titre est requis.").max(500),
  price: z.coerce.number().positive("Le prix doit être supérieur à 0 (un prix inconnu ne se saisit pas)."),
  currency: z.string().trim().toUpperCase().length(3, "Code devise à 3 lettres."),
  tax_type: taxTypeSchema.default("unknown"),
  moq: optionalPositiveInt,
  minimum_order_value: optionalMoney,
  available_quantity: optionalInt,
  shipping_cost: optionalMoney,
  delivery_min_days: optionalInt,
  delivery_max_days: optionalInt,
  country: optionalCountry,
  source_url: optionalUrl,
  ean: z.string().trim().max(14).regex(/^\d*$/, "EAN : chiffres uniquement.").optional().or(z.literal("")),
  mpn: optionalText,
  brand: optionalText,
  model: optionalText,
  storage: optionalText,
  color: optionalText,
  grade: optionalText,
  condition: conditionSchema.default("unknown"),
  supplier_sku: optionalText,
  sku_id: z.string().uuid().optional().or(z.literal("")),
  external_offer_id: optionalText,
});

// Commandes fournisseurs : bornes de bon sens (la base refuse au-delà d'1 000 000 d'unités par mouvement,
// et le total numeric(12,2) ne doit pas déborder).
const PO_MAX_QUANTITY = 100_000;
const PO_MAX_UNIT_COST = 1_000_000;
const poQuantity = z.coerce.number().int("Nombre entier attendu.").min(1, "La quantité doit être au moins 1.").max(PO_MAX_QUANTITY, "Quantité trop élevée (100 000 maximum).");
const poOptionalQuantity = z.union([z.literal(""), poQuantity]).optional();
const poOptionalUnitCost = z.union([z.literal(""), z.coerce.number().min(0, "Le coût ne peut pas être négatif.").max(PO_MAX_UNIT_COST, "Coût unitaire trop élevé.")]).optional();

export const createPurchaseOrderSchema = z.object({
  supplier_id: z.string().uuid(),
  reference: optionalText,
  currency: z.string().trim().toUpperCase().length(3, "Code devise à 3 lettres."),
  expected_at: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Date invalide.").optional().or(z.literal("")),
  notes: optionalLong,
  sku_id: z.string().uuid().optional().or(z.literal("")),
  quantity: poOptionalQuantity,
  unit_cost: poOptionalUnitCost,
  offer_id: z.string().uuid().optional().or(z.literal("")),
});

export const addPurchaseOrderItemSchema = z.object({
  purchase_order_id: z.string().uuid(),
  sku_id: z.string().uuid("Choisissez un SKU."),
  quantity: poQuantity,
  unit_cost: poOptionalUnitCost,
  offer_id: z.string().uuid().optional().or(z.literal("")),
});

/** Réception : quantité saisie + quantité déjà reçue affichée (jeton anti double envoi). */
export const receiptLineSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(PO_MAX_QUANTITY),
  expected_received: z.coerce.number().int().min(0).max(PO_MAX_QUANTITY).optional(),
});

export const purchaseOrderStatusSchema = z.object({
  purchase_order_id: z.string().uuid(),
  status: z.enum(["draft", "sent", "confirmed", "cancelled"]),
});

export function emptyToNull<T>(v: T | "" | undefined): T | null {
  return v === "" || v === undefined ? null : v;
}

export function fieldErrorsOf(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

/** Lit le mapping colonnes → champs depuis un FormData (`map_<champ>` = colonne, `const_<champ>` = constante). */
export function fieldMappingFromFormData(formData: FormData): FieldMapping {
  const out: FieldMapping = {};
  for (const field of RAW_OFFER_FIELDS) {
    const constant = String(formData.get(`const_${field}`) ?? "").trim();
    const column = String(formData.get(`map_${field}`) ?? "").trim();
    if (constant) out[field as RawOfferField] = { const: constant };
    else if (column) out[field as RawOfferField] = column;
  }
  return out;
}

/** Lignes du textarea d'URLs → tableau d'URLs http(s) uniques (max 50). */
export function parseUrlLines(text: string): { urls: string[]; invalid: string[] } {
  const urls: string[] = [];
  const invalid: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const u = line.trim();
    if (!u) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
      if (!urls.includes(u)) urls.push(u);
    } catch {
      invalid.push(u);
    }
  }
  return { urls: urls.slice(0, 50), invalid };
}
