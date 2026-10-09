/**
 * Création de produit à variantes : validation et charges utiles de create_sku /
 * create_product_with_skus. Module PUR et PARTAGÉ (web + mobile) : zod uniquement.
 *
 * Un produit (marque, modèle, nom, catégorie) porte 1 à 50 variantes ; chaque variante
 * (capacité, couleur, grade, état) a son SKU (code, prix d'achat, prix de vente cible) et sa
 * quantité initiale (mouvement « initial » enregistré par la base).
 */
import { z } from "zod";
import type { Json } from "@/db/database.types";
import { emptyToNull, MAX_MONEY, MAX_QUANTITY, skuFields, variantFields } from "@/features/stock/schemas";

export const MAX_VARIANTS = 50;
export const PRODUCT_GRADES = ["A", "B", "C"] as const;
export const PRODUCT_CATEGORIES = ["Smartphone", "Tablette", "Ordinateur", "Montre connectée", "Console", "Audio", "Accessoire", "Pièce détachée"] as const;
export const STORAGE_PRESETS = ["64 Go", "128 Go", "256 Go", "512 Go", "1 To"] as const;
export const CONDITION_LABEL = { new: "Neuf", refurbished: "Reconditionné", used: "Occasion", unknown: "Non précisé" } as const;

type JsonObject = { [key: string]: Json };

const productFields = {
  name: z.string().trim().max(300).optional().or(z.literal("")),
  brand: z.string().trim().max(120).optional().or(z.literal("")),
  model: z.string().trim().max(160).optional().or(z.literal("")),
  category: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
};

/** Saisie mobile : « 429,90 » accepté ; vide → inconnu (undefined), jamais 0. Messages explicites. */
function blankToUndefined(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  return t === "" ? undefined : t;
}
const moneyInput = z.preprocess(
  blankToUndefined,
  z.coerce.number({ error: "Montant invalide (ex. 429,90)." }).min(0, "Le montant ne peut pas être négatif.").max(MAX_MONEY, "Montant trop élevé (1 000 000 maximum).").optional(),
);
const quantityInput = z.preprocess(
  blankToUndefined,
  z.coerce.number({ error: "Quantité invalide." }).int("Nombre entier attendu.").min(0, "La quantité ne peut pas être négative.").max(MAX_QUANTITY, "Quantité trop élevée (1 000 000 maximum).").optional(),
);

export const variantInputSchema = z.object({
  ...variantFields,
  grade: z.union([z.enum(PRODUCT_GRADES), z.literal("")], { error: "Grade A, B ou C." }).optional(),
  ...skuFields,
  cost_price: moneyInput,
  sale_price: moneyInput,
  initial_quantity: quantityInput,
});
export type VariantInput = z.input<typeof variantInputSchema>;

const variantsArraySchema = z
  .array(variantInputSchema)
  .min(1, "Ajoutez au moins une variante.")
  .max(MAX_VARIANTS, `${MAX_VARIANTS} variantes maximum.`)
  .superRefine((variants, ctx) => {
    for (const [i, message] of duplicateCodes(variants)) ctx.addIssue({ code: "custom", path: [i, "code"], message });
  });

/** Codes SKU répétés dans le même formulaire (la casse n'est pas distinguée, comme en base). */
export function duplicateCodes(variants: ReadonlyArray<{ code?: unknown }>): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  const seen = new Map<string, number>();
  variants.forEach((v, i) => {
    const key = String(v.code ?? "").trim().toUpperCase();
    if (!key) return;
    const first = seen.get(key);
    if (first !== undefined) out.push([i, `Même code SKU que la variante ${first + 1}.`]);
    else seen.set(key, i);
  });
  return out;
}

export const productWithVariantsSchema = z.object({ ...productFields, variants: variantsArraySchema }).superRefine((d, ctx) => {
  if (!productDisplayName(d)) ctx.addIssue({ code: "custom", path: ["name"], message: "Indiquez le nom du produit, ou au moins la marque et le modèle." });
});
export type ProductWithVariantsInput = z.input<typeof productWithVariantsSchema>;
export type ProductWithVariants = z.output<typeof productWithVariantsSchema>;

/** Variantes ajoutées à un produit existant (fiche produit → « Ajouter une variante »). */
export const addVariantsSchema = z.object({ product_id: z.string().uuid(), variants: variantsArraySchema });

/** Nom affiché : saisi, sinon « marque + modèle » (sans répéter la marque si le modèle la contient). */
export function productDisplayName(d: { name?: string; brand?: string; model?: string }): string {
  const name = d.name?.trim();
  if (name) return name;
  const brand = d.brand?.trim() ?? "";
  const model = d.model?.trim() ?? "";
  if (!model) return "";
  return brand && !model.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${model}` : model;
}

/** Nom de variante lisible : « 128 Go / Noir / Grade B », ou « Standard ». */
export function variantAutoName(v: { storage?: string; color?: string; grade?: string }): string {
  return [v.storage?.trim(), v.color?.trim(), v.grade?.trim() ? `Grade ${v.grade.trim()}` : null].filter(Boolean).join(" / ") || "Standard";
}

function codePart(s: string | undefined, max: number): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\bGO\b|\bGB\b/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, max);
}

/**
 * Code SKU suggéré (modifiable) : MODÈLE-CAPACITÉ-COULEUR-GRADE, ex. « IPHONE13-128-NOIR-B ».
 * Respecte le format de skuCodeSchema (lettres, chiffres, tirets ; 64 caractères max).
 */
export function suggestSkuCode(product: { brand?: string; model?: string; name?: string }, v: { storage?: string; color?: string; grade?: string }): string {
  const base = codePart(product.model || product.name || product.brand, 20) || "SKU";
  const storage = codePart(v.storage?.replace(/\s*(to|tb)\b/i, "TB"), 8);
  const parts = [base, storage, codePart(v.color, 10), codePart(v.grade, 2)].filter(Boolean);
  return parts.join("-").slice(0, 64);
}

/** p_variant de create_sku (même forme que le formulaire web). */
export function variantPayload(d: { variant_name?: string; condition?: string; grade?: string; storage?: string; color?: string; ean?: string; mpn?: string }): JsonObject {
  const attributes: Record<string, string> = {};
  if (d.storage) attributes.storage = d.storage;
  if (d.color) attributes.color = d.color;
  if (d.grade) attributes.grade = d.grade;
  return {
    name: d.variant_name || variantAutoName(d),
    condition: d.condition ?? "unknown",
    grade: emptyToNull(d.grade),
    ean: emptyToNull(d.ean),
    mpn: emptyToNull(d.mpn),
    attributes,
  };
}

/** p_sku de create_sku. */
export function skuPayload(
  d: { code: string; barcode?: string; cost_price?: number | ""; sale_price?: number | ""; location?: string; reorder_point?: number | ""; safety_stock?: number | ""; lead_time_days?: number | ""; default_supplier_id?: string },
  currency: string,
): JsonObject {
  return {
    code: d.code,
    barcode: emptyToNull(d.barcode),
    cost_price: emptyToNull(d.cost_price),
    sale_price: emptyToNull(d.sale_price),
    currency,
    location: emptyToNull(d.location),
    reorder_point: emptyToNull(d.reorder_point) ?? 0,
    safety_stock: emptyToNull(d.safety_stock) ?? 0,
    lead_time_days: emptyToNull(d.lead_time_days),
    default_supplier_id: emptyToNull(d.default_supplier_id),
  };
}

export interface CreateProductRequest {
  p_product: JsonObject | null;
  p_items: Json[];
}

function itemsPayload(variants: z.output<typeof variantInputSchema>[], currency: string): Json[] {
  return variants.map((v) => ({ variant: variantPayload(v), sku: skuPayload(v, currency), initial_quantity: emptyToNull(v.initial_quantity) ?? 0 }));
}

/** Arguments de create_product_with_skus pour un nouveau produit (données déjà validées). */
export function buildCreateProductRequest(d: ProductWithVariants, currency: string): CreateProductRequest {
  return {
    p_product: {
      name: productDisplayName(d),
      brand: emptyToNull(d.brand),
      model: emptyToNull(d.model),
      category: emptyToNull(d.category),
      description: emptyToNull(d.description),
    },
    p_items: itemsPayload(d.variants, currency),
  };
}

/** Arguments de create_product_with_skus pour ajouter des variantes à un produit existant. */
export function buildAddVariantsRequest(variants: z.output<typeof variantInputSchema>[], currency: string): CreateProductRequest {
  return { p_product: null, p_items: itemsPayload(variants, currency) };
}

/**
 * Validation complète du formulaire : TOUTES les erreurs d'un coup (zod n'exécute pas le contrôle
 * du nom quand un champ de variante est déjà invalide ; on l'ajoute ici).
 */
export function validateProductForm(input: ProductWithVariantsInput): { ok: true; data: ProductWithVariants } | { ok: false; errors: Record<string, string> } {
  const r = productWithVariantsSchema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const errors = formErrors(r.error.issues);
  if (!errors.name && !productDisplayName(input)) errors.name = "Indiquez le nom du produit, ou au moins la marque et le modèle.";
  for (const [i, message] of duplicateCodes(input.variants ?? [])) errors[`variants.${i}.code`] ??= message;
  return { ok: false, errors };
}

/** Erreurs zod → { "name": "...", "variants.1.code": "..." } (premier message par champ). */
export function formErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".") || "_";
    out[key] ??= i.message;
  }
  return out;
}
