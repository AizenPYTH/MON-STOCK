/**
 * Charge utile de update_sku_with_variant (module pur, testé unitairement).
 * Seuls les champs SOUMIS sont transmis : un champ absent du formulaire n'écrase rien, et les
 * attributs de la variante sont fusionnés côté serveur (valeur null = retrait de la clé) —
 * jamais de lecture-modification-écriture côté application.
 */
import type { Json } from "@/db/database.types";
import { emptyToNull } from "@/features/stock/schemas";

export interface SkuUpdateFields {
  barcode?: string;
  cost_price?: number | "";
  sale_price?: number | "";
  location?: string;
  reorder_point?: number | "";
  safety_stock?: number | "";
  lead_time_days?: number | "";
  default_supplier_id?: string;
  is_active?: "true" | "false";
  variant_name?: string;
  condition?: string;
  grade?: string;
  storage?: string;
  color?: string;
  ean?: string;
  mpn?: string;
}

export interface SkuUpdatePayload {
  sku: { [key: string]: Json };
  variant: { [key: string]: Json };
}

export function buildSkuUpdatePayload(d: SkuUpdateFields): SkuUpdatePayload {
  const sku: { [key: string]: Json } = {
    barcode: emptyToNull(d.barcode),
    cost_price: emptyToNull(d.cost_price),
    sale_price: emptyToNull(d.sale_price),
    location: emptyToNull(d.location),
    reorder_point: emptyToNull(d.reorder_point) ?? 0,
    safety_stock: emptyToNull(d.safety_stock) ?? 0,
    lead_time_days: emptyToNull(d.lead_time_days),
    default_supplier_id: emptyToNull(d.default_supplier_id),
  };
  if (d.is_active) sku.is_active = d.is_active === "true";

  const variant: { [key: string]: Json } = {};
  if (d.variant_name) variant.name = d.variant_name;
  if (d.condition) variant.condition = d.condition;
  if (d.grade !== undefined) variant.grade = emptyToNull(d.grade);
  if (d.ean !== undefined) variant.ean = emptyToNull(d.ean);
  if (d.mpn !== undefined) variant.mpn = emptyToNull(d.mpn);
  // Attributs structurés : seuls les champs soumis ; une valeur vide retire l'attribut.
  const attributes: { [key: string]: Json } = {};
  for (const [key, value] of [["storage", d.storage], ["color", d.color], ["grade", d.grade]] as const) {
    if (value === undefined) continue;
    attributes[key] = value === "" ? null : value;
  }
  variant.attributes = attributes;
  return { sku, variant };
}
