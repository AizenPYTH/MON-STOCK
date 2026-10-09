import { z } from "zod";

/** Bornes de bon sens (la base refuse aussi au-delà : mouvements ≤ 1 000 000, numeric(12,2)). */
export const MAX_MONEY = 1_000_000;
export const MAX_QUANTITY = 1_000_000;
export const MAX_LEAD_TIME_DAYS = 365;

const optionalText = z.string().trim().max(300).optional().or(z.literal(""));
const optionalMoney = z.union([z.literal(""), z.coerce.number().min(0, "Le montant ne peut pas être négatif.").max(MAX_MONEY, "Montant trop élevé (1 000 000 maximum).")]).optional();
const optionalInt = z.union([z.literal(""), z.coerce.number().int("Nombre entier attendu.").min(0, "La valeur ne peut pas être négative.").max(MAX_QUANTITY, "Valeur trop élevée (1 000 000 maximum).")]).optional();
const optionalLeadTime = z.union([z.literal(""), z.coerce.number().int("Nombre entier attendu.").min(0).max(MAX_LEAD_TIME_DAYS, "Délai trop long (365 jours maximum).")]).optional();
const eanSchema = z
  .string()
  .trim()
  .regex(/^(\d{8}|\d{12,14})?$/, "EAN / GTIN : 8, 12, 13 ou 14 chiffres.")
  .optional()
  .or(z.literal(""));

export const skuCodeSchema = z
  .string()
  .trim()
  .min(1, "Le code SKU est requis.")
  .max(64)
  .regex(/^[A-Za-z0-9._\-\/]+$/, "Le SKU ne peut contenir que lettres, chiffres, points, tirets et barres obliques.");

export const conditionSchema = z.enum(["new", "refurbished", "used", "unknown"]);

export const variantFields = {
  variant_name: optionalText,
  condition: conditionSchema.default("unknown"),
  grade: optionalText,
  storage: optionalText,
  color: optionalText,
  ean: eanSchema,
  mpn: optionalText,
};

export const skuFields = {
  code: skuCodeSchema,
  barcode: optionalText,
  cost_price: optionalMoney,
  sale_price: optionalMoney,
  location: optionalText,
  reorder_point: optionalInt,
  safety_stock: optionalInt,
  lead_time_days: optionalLeadTime,
  default_supplier_id: z.string().uuid().optional().or(z.literal("")),
  initial_quantity: optionalInt,
};

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Le nom du produit est requis.").max(300),
  brand: optionalText,
  category: optionalText,
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  image_url: z.string().trim().url("URL d'image invalide.").optional().or(z.literal("")),
  ...variantFields,
  ...skuFields,
});

export const addSkuSchema = z.object({
  product_id: z.string().uuid(),
  ...variantFields,
  ...skuFields,
});

export const updateSkuSchema = z.object({
  sku_id: z.string().uuid(),
  /** Version lue à l'ouverture du formulaire (verrou optimiste contre les éditions simultanées). */
  expected_updated_at: z.string().trim().min(1).max(64).optional(),
  /** Version de la variante lue à l'ouverture du formulaire (même verrou optimiste). */
  expected_variant_updated_at: z.string().trim().min(1).max(64).optional(),
  barcode: optionalText,
  cost_price: optionalMoney,
  sale_price: optionalMoney,
  location: optionalText,
  reorder_point: optionalInt,
  safety_stock: optionalInt,
  lead_time_days: optionalLeadTime,
  default_supplier_id: z.string().uuid().optional().or(z.literal("")),
  is_active: z.enum(["true", "false"]).optional(),
  variant_name: optionalText,
  condition: conditionSchema.optional(),
  grade: optionalText,
  storage: optionalText,
  color: optionalText,
  ean: eanSchema,
  mpn: optionalText,
});

export const updateProductSchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().trim().min(1, "Le nom du produit est requis.").max(300),
  brand: optionalText,
  category: optionalText,
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  image_url: z.string().trim().url("URL d'image invalide.").optional().or(z.literal("")),
});

export const adjustStockSchema = z.object({
  sku_id: z.string().uuid(),
  type: z.enum(["receipt", "adjustment", "return", "transfer_in", "transfer_out", "correction"]),
  direction: z.enum(["in", "out"]),
  quantity: z.coerce.number().int("Nombre entier attendu.").min(1, "La quantité doit être au moins 1.").max(MAX_QUANTITY, "Quantité trop élevée (1 000 000 maximum)."),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const STOCK_SORTS = ["best_sellers", "low_stock", "margin", "stock_value", "last_sale", "oldest_sale", "name"] as const;
export type StockSort = (typeof STOCK_SORTS)[number];
export const STOCK_STATUS_FILTERS = ["out_of_stock", "at_risk", "low", "normal"] as const;

export const stockListParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  status: z.enum(STOCK_STATUS_FILTERS).optional(),
  supplier: z.string().uuid().optional(),
  channel: z.enum(["ebay", "amazon", "shopify", "woocommerce", "manual"]).optional(),
  min_margin: z.coerce.number().min(-MAX_MONEY).max(MAX_MONEY).optional(),
  stock: z.enum(["in_stock", "empty", "negative"]).optional(),
  sort: z.enum(STOCK_SORTS).default("best_sellers"),
  page: z.coerce.number().int().min(1).default(1),
  archived: z.enum(["1"]).optional(),
});
export type StockListParams = z.infer<typeof stockListParamsSchema>;

export function emptyToNull<T>(v: T | "" | undefined): T | null {
  return v === "" || v === undefined ? null : v;
}

export function fieldErrorsOf(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}
