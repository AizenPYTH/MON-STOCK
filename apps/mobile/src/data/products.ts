import { z } from "zod";
import type { Json } from "@/db/database.types";
import {
  addVariantsSchema,
  buildAddVariantsRequest,
  buildCreateProductRequest,
  formErrors,
  validateProductForm,
  type ProductWithVariantsInput,
  type VariantInput,
} from "@/features/stock/product-form";
import { buildSkuUpdatePayload, type SkuUpdateFields } from "@/features/stock/sku-update";
import { conditionSchema, emptyToNull, MAX_MONEY, MAX_QUANTITY, skuCodeSchema } from "@/features/stock/schemas";
import type { MobileSupabase } from "~/lib/supabase";
import { UserFacingError, userMessage } from "~/lib/errors";

/**
 * Catalogue — écritures. Tout passe par les fonctions SQL existantes, sous la session de
 * l'utilisateur (RLS + can_write_org) :
 *   - création : create_product_with_skus → create_sku par variante (unicité du code, mouvement
 *     « initial » dans l'historique), le tout dans une seule transaction ;
 *   - édition d'une variante : update_sku_with_variant (verrou optimiste updated_at) ;
 *   - édition du produit : update conditionnée par la version lue (updated_at).
 * Aucune règle de stock n'est réimplémentée ici.
 */

/** Erreur de formulaire : un message par champ (« name », « variants.0.code »…). */
export class FormValidationError extends UserFacingError {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("Vérifiez les champs signalés.", "VALIDATION");
    this.name = "FormValidationError";
  }
}

export interface CreatedProduct {
  productId: string;
  skus: { skuId: string; code: string }[];
}

function parseCreated(data: Json | null): CreatedProduct {
  const o = (data ?? {}) as { product_id?: string; skus?: { sku_id?: string; code?: string }[] };
  if (!o.product_id) throw new UserFacingError("Réponse inattendue du serveur : produit non confirmé.", "REJECTED");
  return { productId: o.product_id, skus: (o.skus ?? []).map((s) => ({ skuId: String(s.sku_id), code: String(s.code) })) };
}

export async function createProduct(supabase: MobileSupabase, organizationId: string, currency: string, input: ProductWithVariantsInput): Promise<CreatedProduct> {
  const v = validateProductForm(input);
  if (!v.ok) throw new FormValidationError(v.errors);
  const req = buildCreateProductRequest(v.data, currency);
  const { data, error } = await supabase.rpc("create_product_with_skus", { p_organization_id: organizationId, p_product: req.p_product ?? undefined, p_items: req.p_items });
  if (error) throw new UserFacingError(userMessage(error), "REJECTED");
  return parseCreated(data);
}

export async function addVariants(supabase: MobileSupabase, organizationId: string, currency: string, productId: string, variants: VariantInput[]): Promise<CreatedProduct> {
  const parsed = addVariantsSchema.safeParse({ product_id: productId, variants });
  if (!parsed.success) {
    // Mêmes clés que le formulaire de création (« variants.0.code »).
    throw new FormValidationError(formErrors(parsed.error.issues));
  }
  const req = buildAddVariantsRequest(parsed.data.variants, currency);
  const { data, error } = await supabase.rpc("create_product_with_skus", { p_organization_id: organizationId, p_product_id: productId, p_items: req.p_items });
  if (error) throw new UserFacingError(userMessage(error), "REJECTED");
  return parseCreated(data);
}

// ---------------------------------------------------------------------------------------------
// Édition du produit
// ---------------------------------------------------------------------------------------------

export interface EditableProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  model: string | null;
  attributes: Record<string, Json>;
  updated_at: string;
}

export async function fetchEditableProduct(supabase: MobileSupabase, organizationId: string, productId: string): Promise<EditableProduct | null> {
  const { data, error } = await supabase.from("products").select("id, name, brand, category, description, attributes, updated_at").eq("organization_id", organizationId).eq("id", productId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const attributes = (data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes) ? data.attributes : {}) as Record<string, Json>;
  return { ...data, attributes, model: typeof attributes.model === "string" ? attributes.model : null };
}

export const productEditSchema = z.object({
  name: z.string().trim().min(1, "Le nom du produit est requis.").max(300),
  brand: z.string().trim().max(120),
  model: z.string().trim().max(160),
  category: z.string().trim().max(120),
  description: z.string().trim().max(5000),
});
export type ProductEditInput = z.input<typeof productEditSchema>;

/** Mise à jour sous verrou optimiste : refusée si le produit a changé depuis l'ouverture du formulaire. */
export async function updateProduct(supabase: MobileSupabase, organizationId: string, current: EditableProduct, input: ProductEditInput): Promise<void> {
  const parsed = productEditSchema.safeParse(input);
  if (!parsed.success) throw new FormValidationError(formErrors(parsed.error.issues));
  const d = parsed.data;
  const attributes: Record<string, Json> = { ...current.attributes };
  if (d.model) attributes.model = d.model;
  else delete attributes.model;
  const { data, error } = await supabase
    .from("products")
    .update({ name: d.name, brand: emptyToNull(d.brand), category: emptyToNull(d.category), description: emptyToNull(d.description), attributes, brand_normalized: d.brand ? normalizeForMatch(d.brand) : null, model_normalized: d.model ? normalizeForMatch(d.model) : null })
    .eq("organization_id", organizationId)
    .eq("id", current.id)
    .eq("updated_at", current.updated_at)
    .select("id");
  if (error) throw new UserFacingError(userMessage(error), "REJECTED");
  if (!data || data.length === 0) throw new UserFacingError(userMessage({ message: "PRODUCT_STALE" }), "CONFLICT");
}

/** Même normalisation que public.normalize_text (minuscules, sans accents, espaces réduits). */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Édition d'une variante (SKU)
// ---------------------------------------------------------------------------------------------

export interface EditableSku {
  id: string;
  code: string;
  cost_price: number | null;
  sale_price: number | null;
  location: string | null;
  reorder_point: number;
  barcode: string | null;
  updated_at: string;
  variant: { id: string; name: string; condition: string; grade: string | null; ean: string | null; attributes: Record<string, Json>; updated_at: string };
}

export async function fetchEditableSku(supabase: MobileSupabase, organizationId: string, skuId: string): Promise<EditableSku | null> {
  const { data, error } = await supabase
    .from("skus")
    .select("id, code, cost_price, sale_price, location, reorder_point, barcode, updated_at, variant:product_variants!inner(id, name, condition, grade, ean, attributes, updated_at)")
    .eq("organization_id", organizationId)
    .eq("id", skuId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const variant = Array.isArray(data.variant) ? data.variant[0] : data.variant;
  if (!variant) return null;
  const attributes = (variant.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes) ? variant.attributes : {}) as Record<string, Json>;
  return { ...data, variant: { ...variant, attributes } };
}

const optionalMoneyText = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, "").replace(",", "."))
  .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= MAX_MONEY), "Montant invalide (0 à 1 000 000).");
const optionalIntText = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= MAX_QUANTITY), "Nombre entier positif attendu.");

export const skuEditSchema = z.object({
  cost_price: optionalMoneyText,
  sale_price: optionalMoneyText,
  storage: z.string().trim().max(60),
  color: z.string().trim().max(60),
  grade: z.string().trim().max(20),
  condition: conditionSchema,
  location: z.string().trim().max(120),
  reorder_point: optionalIntText,
  ean: z
    .string()
    .trim()
    .regex(/^(\d{8}|\d{12,14})?$/, "EAN / GTIN : 8, 12, 13 ou 14 chiffres."),
});
export type SkuEditInput = z.input<typeof skuEditSchema>;

/** Prix, attributs et emplacement d'une variante : update_sku_with_variant (une transaction, verrou optimiste). */
export async function updateSku(supabase: MobileSupabase, organizationId: string, current: EditableSku, input: SkuEditInput): Promise<void> {
  const parsed = skuEditSchema.safeParse(input);
  if (!parsed.success) throw new FormValidationError(formErrors(parsed.error.issues));
  const d = parsed.data;
  const fields: SkuUpdateFields = {
    cost_price: d.cost_price === "" ? "" : Number(d.cost_price),
    sale_price: d.sale_price === "" ? "" : Number(d.sale_price),
    location: d.location,
    reorder_point: d.reorder_point === "" ? "" : Number(d.reorder_point),
    barcode: current.barcode ?? "",
    condition: d.condition,
    grade: d.grade,
    storage: d.storage,
    color: d.color,
    ean: d.ean,
  };
  const payload = buildSkuUpdatePayload(fields);
  // Champs non présents dans le formulaire mobile : on ne les écrase pas.
  for (const key of ["safety_stock", "lead_time_days", "default_supplier_id"]) delete payload.sku[key];
  const autoName = [d.storage, d.color, d.grade ? `Grade ${d.grade}` : null].filter(Boolean).join(" / ");
  if (autoName && current.variant.name !== autoName) payload.variant.name = autoName;
  const { error } = await supabase.rpc("update_sku_with_variant", {
    p_organization_id: organizationId,
    p_sku_id: current.id,
    p_sku: payload.sku,
    p_variant: payload.variant,
    p_expected_sku_updated_at: current.updated_at,
    p_expected_variant_updated_at: current.variant.updated_at,
  });
  if (error) throw new UserFacingError(userMessage(error), /SKU_STALE/.test(error.message ?? "") ? "CONFLICT" : "REJECTED");
}

export { skuCodeSchema };
