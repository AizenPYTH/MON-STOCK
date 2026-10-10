import { computeLandedCost, computeMargin } from "@/domain/pricing/margin";
import { detectTitleIssue } from "@/domain/sourcing/offer-filter";
import { normalizeText } from "@/domain/sourcing/normalizer";
import type { MarginContext } from "@/features/stock/model";
import { skuLabel } from "@/features/stock/model";
import type { MobileSupabase } from "~/lib/supabase";
import { UserFacingError, userMessage } from "~/lib/errors";

/**
 * Sourcing mobile : regroupement des offres RÉELLES (enregistrées par les sources connectées)
 * par produit, comparaison et préparation d'un BROUILLON de commande fournisseur.
 * Rien n'est envoyé au fournisseur depuis le mobile.
 */

export interface OfferRow {
  id: string;
  title: string;
  supplierId: string | null;
  supplierName: string;
  skuId: string | null;
  normalizedProductId: string | null;
  grade: string | null;
  price: number | null;
  currency: string | null;
  moq: number | null;
  deliveryDays: number | null;
  availableQuantity: number | null;
  shippingCost: number | null;
  sourceUrl: string | null;
  lastSeenAt: string | null;
}

export interface OfferGroup {
  key: string;
  title: string;
  offers: OfferRow[];
  min: number | null;
  max: number | null;
}

const OFFER_SELECT =
  "id, title_original, supplier_id, sku_id, normalized_product_id, grade, normalized_price, normalized_currency, moq, delivery_max_days, available_quantity, shipping_cost, source_url, last_seen_at, supplier:suppliers(name), sku:skus(code, product:products(name), variant:product_variants(name))";

type RawOffer = {
  id: string;
  title_original: string;
  supplier_id: string | null;
  sku_id: string | null;
  normalized_product_id: string | null;
  grade: string | null;
  normalized_price: number | null;
  normalized_currency: string | null;
  moq: number | null;
  delivery_max_days: number | null;
  available_quantity: number | null;
  shipping_cost: number | null;
  source_url: string | null;
  last_seen_at: string | null;
  supplier: { name: string } | null;
  sku: { code: string; product: { name: string } | null; variant: { name: string } | null } | null;
};

function toRow(o: RawOffer): OfferRow {
  return {
    id: o.id,
    title: o.title_original,
    supplierId: o.supplier_id,
    supplierName: o.supplier?.name ?? "Fournisseur inconnu",
    skuId: o.sku_id,
    normalizedProductId: o.normalized_product_id,
    grade: o.grade,
    price: o.normalized_price,
    currency: o.normalized_currency,
    moq: o.moq,
    deliveryDays: o.delivery_max_days,
    availableQuantity: o.available_quantity,
    shippingCost: o.shipping_cost,
    sourceUrl: o.source_url,
    lastSeenAt: o.last_seen_at,
  };
}

/** Empreinte courte et stable d'un texte (djb2, base 36) — sert uniquement de clé d'URL. */
function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Clé de regroupement : SKU associé, sinon produit normalisé, sinon l'offre seule.
 * Le produit normalisé désigne l'APPAREIL (« iPhone 13 ») : une pièce détachée ou un accessoire
 * (« Écran iPhone 13 », « Batterie iPhone 13 ») rattaché au même appareil n'est pas le même
 * article — ces offres sont séparées par leur titre normalisé pour ne jamais comparer un écran à
 * une batterie.
 */
export function groupKeyOf(o: Pick<OfferRow, "id" | "skuId" | "normalizedProductId"> & { title?: string }): string {
  if (o.skuId) return `sku:${o.skuId}`;
  if (!o.normalizedProductId) return `offer:${o.id}`;
  const issue = o.title ? detectTitleIssue(o.title) : null;
  if (issue && (issue.issue === "spare_part" || issue.issue === "accessory")) return `np:${o.normalizedProductId}:${shortHash(normalizeText(o.title!))}`;
  return `np:${o.normalizedProductId}`;
}

export function groupOffers(raw: readonly RawOffer[]): OfferGroup[] {
  const groups = new Map<string, OfferGroup>();
  for (const r of raw) {
    const row = toRow(r);
    const key = groupKeyOf(row);
    const title = r.sku ? `${skuLabel({ product_name: r.sku.product?.name ?? r.title_original, variant_name: r.sku.variant?.name ?? null })}${r.grade ? ` · Grade ${r.grade}` : ""}` : r.title_original;
    const g = groups.get(key) ?? { key, title, offers: [], min: null, max: null };
    g.offers.push(row);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const prices = g.offers.map((o) => o.price).filter((p): p is number => p !== null);
    g.min = prices.length ? Math.min(...prices) : null;
    g.max = prices.length ? Math.max(...prices) : null;
  }
  return [...groups.values()].sort((a, b) => b.offers.length - a.offers.length || a.title.localeCompare(b.title, "fr"));
}

export async function fetchOfferGroups(supabase: MobileSupabase, organizationId: string): Promise<{ groups: OfferGroup[]; offers: number; truncated: boolean }> {
  const LIMIT = 500;
  const { data, error } = await supabase.from("sourcing_offers").select(OFFER_SELECT).eq("organization_id", organizationId).eq("status", "active").order("normalized_price", { ascending: true, nullsFirst: false }).limit(LIMIT + 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawOffer[];
  return { groups: groupOffers(rows.slice(0, LIMIT)), offers: Math.min(rows.length, LIMIT), truncated: rows.length > LIMIT };
}

export interface SupplierRow {
  id: string;
  name: string;
  country: string | null;
  purchaseOrders: number;
  averagePrice: number | null;
}

export async function fetchActiveSuppliers(supabase: MobileSupabase, organizationId: string): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, country, orders:purchase_orders(count), offers:sourcing_offers(normalized_price, status)")
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .order("name")
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((s) => {
    const prices = ((s.offers ?? []) as { normalized_price: number | null; status: string }[]).filter((o) => o.status === "active" && o.normalized_price !== null).map((o) => o.normalized_price as number);
    const orders = (s.orders as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
    return { id: s.id, name: s.name, country: s.country, purchaseOrders: orders, averagePrice: prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : null };
  });
}

export interface ComparedOffer extends OfferRow {
  landedUnitCost: number | null;
  marginPercent: number | null;
  netProfit: number | null;
}

export interface Comparison {
  title: string;
  sku: { id: string; code: string; salePrice: number | null; avgSalePrice30d: number | null; available: number } | null;
  resalePrice: number | null;
  resaleBasis: "sale_price" | "average_30d" | null;
  offers: ComparedOffer[];
  best: { price: number | null; spread: number | null; maxMargin: number | null };
}

/** Coût rendu (prix + port connu) et marge nette estimée par offre (domaine partagé). */
export function compareOffers(offers: readonly OfferRow[], resalePrice: number | null, marginCtx: MarginContext): ComparedOffer[] {
  return offers
    .map((o) => {
      const landed = o.price === null ? null : computeLandedCost({ unitPrice: o.price, quantity: Math.max(1, o.moq ?? 1), shippingCost: o.shippingCost, importFees: null });
      const unitCost = landed?.unitLandedCost ?? o.price;
      const margin = computeMargin({ salePrice: resalePrice, costPrice: unitCost, ...marginCtx });
      return { ...o, landedUnitCost: landed?.unitLandedCost ?? null, marginPercent: margin.netMarginPercent, netProfit: margin.netProfit };
    })
    .sort((a, b) => (b.marginPercent ?? -Infinity) - (a.marginPercent ?? -Infinity) || (a.price ?? Infinity) - (b.price ?? Infinity));
}

export async function fetchComparison(supabase: MobileSupabase, organizationId: string, key: string, marginCtx: MarginContext): Promise<Comparison | null> {
  const [kind, id] = key.split(":");
  if (!id || !["sku", "np", "offer"].includes(kind ?? "")) return null;
  let q = supabase.from("sourcing_offers").select(OFFER_SELECT).eq("organization_id", organizationId).eq("status", "active");
  q = kind === "sku" ? q.eq("sku_id", id) : kind === "np" ? q.eq("normalized_product_id", id) : q.eq("id", id);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  // Le filtre en base porte sur le produit normalisé ; la clé complète sépare ensuite les pièces.
  const raw = ((data ?? []) as unknown as RawOffer[]).filter((r) => groupKeyOf(toRow(r)) === key);
  if (raw.length === 0) return null;
  const group = groupOffers(raw)[0]!;
  let sku: Comparison["sku"] = null;
  const skuId = kind === "sku" ? id : (raw.find((r) => r.sku_id)?.sku_id ?? null);
  if (skuId) {
    const { data: row } = await supabase.from("v_stock_overview").select("sku_id, code, sale_price, avg_sale_price_30d, quantity_available").eq("organization_id", organizationId).eq("sku_id", skuId).maybeSingle();
    if (row?.sku_id) sku = { id: row.sku_id, code: row.code ?? "", salePrice: row.sale_price, avgSalePrice30d: row.avg_sale_price_30d, available: row.quantity_available ?? 0 };
  }
  const resalePrice = sku?.avgSalePrice30d ?? sku?.salePrice ?? null;
  const offers = compareOffers(group.offers, resalePrice, marginCtx);
  const prices = offers.map((o) => o.price).filter((p): p is number => p !== null);
  const margins = offers.map((o) => o.marginPercent).filter((m): m is number => m !== null);
  return {
    title: group.title,
    sku,
    resalePrice,
    resaleBasis: sku?.avgSalePrice30d !== null && sku?.avgSalePrice30d !== undefined ? "average_30d" : sku?.salePrice !== null && sku?.salePrice !== undefined ? "sale_price" : null,
    offers,
    best: { price: prices.length ? Math.min(...prices) : null, spread: prices.length > 1 ? Math.round((Math.max(...prices) - Math.min(...prices)) * 100) / 100 : null, maxMargin: margins.length ? Math.max(...margins) : null },
  };
}

/**
 * Brouillon de commande fournisseur (statut « draft », jamais envoyé) avec une ligne : l'offre
 * choisie × quantité. Règles en base : insertion en brouillon uniquement, rôle rédacteur requis,
 * références de la même organisation (RLS + garde-fous).
 */
export async function createDraftPurchaseOrder(
  supabase: MobileSupabase,
  input: { organizationId: string; userId: string; offer: Pick<OfferRow, "id" | "supplierId" | "skuId" | "price">; quantity: number; currency: string },
): Promise<{ purchaseOrderId: string }> {
  if (!input.offer.supplierId) throw new UserFacingError("Cette offre n'a pas de fournisseur associé.");
  if (!input.offer.skuId) throw new UserFacingError("Associez d'abord cette offre à un SKU (depuis l'application web).");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100_000) throw new UserFacingError("Quantité invalide.");
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({ organization_id: input.organizationId, supplier_id: input.offer.supplierId, currency: input.currency, status: "draft", created_by: input.userId, notes: "Brouillon préparé depuis l'application mobile (comparaison d'offres)." })
    .select("id")
    .single();
  if (error || !po) throw new UserFacingError(userMessage(error ?? { message: "Création impossible" }));
  const { error: itemError } = await supabase.from("purchase_order_items").insert({
    organization_id: input.organizationId,
    purchase_order_id: po.id,
    sku_id: input.offer.skuId,
    offer_id: input.offer.id,
    quantity_ordered: input.quantity,
    unit_cost: input.offer.price,
    currency: input.currency,
  });
  if (itemError) {
    // Pas de brouillon vide orphelin (un brouillon est supprimable).
    await supabase.from("purchase_orders").delete().eq("id", po.id).eq("organization_id", input.organizationId);
    throw new UserFacingError(userMessage(itemError));
  }
  return { purchaseOrderId: po.id };
}

export async function deleteDraftPurchaseOrder(supabase: MobileSupabase, organizationId: string, purchaseOrderId: string): Promise<void> {
  const { error } = await supabase.from("purchase_orders").delete().eq("id", purchaseOrderId).eq("organization_id", organizationId).eq("status", "draft");
  if (error) throw new UserFacingError(userMessage(error));
}
