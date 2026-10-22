import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { StockLevel } from "@/domain/inventory/alerts";
import { STOCK_LEVEL_ORDER } from "@/domain/inventory/alerts";
import { fromPostgrestError } from "@/lib/errors";
import { fetchRowsUpTo } from "@/lib/supabase/paginate";
import { chunk } from "@/features/analytics/util.pure";
import { loadStockViews } from "@/features/analytics/stock-analytics";
import {
  ON_ORDER_STATUSES,
  buildRecommendation,
  draftToInsert,
  onOrderBySku,
  pickCheapestOffer,
  shouldSnapshot,
  sortDrafts,
  type OfferLike,
  type RecommendationDraft,
  type SupplierLike,
} from "@/features/analytics/replenishment.pure";
import type { StockRowView } from "@/features/stock/model";

const OFFER_SELECT =
  "id, sku_id, supplier_id, normalized_price, normalized_currency, moq, available_quantity, delivery_min_days, delivery_max_days, shipping_cost, last_seen_at, supplier:suppliers(id, name, average_lead_time_days, default_moq)";

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Bornes de lecture (pages de 1 000 : PostgREST plafonne chaque réponse — W-03). */
export const REPLENISHMENT_OFFERS_MAX = 20_000;
export const REPLENISHMENT_PO_ITEMS_MAX = 20_000;
export const REPLENISHMENT_SUPPLIERS_MAX = 5_000;

export interface RecommendationsResult {
  drafts: RecommendationDraft[];
  /** vrai si une lecture (stock, offres, commandes, fournisseurs) a atteint sa borne : résultat partiel */
  truncated: boolean;
}

function rethrowDb(e: unknown): never {
  throw fromPostgrestError(e as Parameters<typeof fromPostgrestError>[0]);
}

/**
 * Calcule (sans persister) les recommandations de réapprovisionnement de l'organisation :
 * délai = SKU → offre la moins chère (delivery_max_days) → fournisseur (délai moyen) → inconnu (7 j par défaut, signalé),
 * MOQ / fournisseur = offre active la moins chère, à défaut fournisseur par défaut du SKU,
 * en commande = commandes fournisseur envoyées / confirmées / partiellement reçues.
 * Toutes les lectures sont paginées ; `truncated` signale un résultat partiel (jamais présenté comme complet).
 */
export async function computeRecommendationsWithCoverage(ctx: OrgContext): Promise<RecommendationsResult> {
  const orgId = ctx.organization.id;
  const [bundle, offersRes, poRes, suppliersRes] = await Promise.all([
    loadStockViews(ctx),
    fetchRowsUpTo(
      (from, to) =>
        ctx.supabase
          .from("sourcing_offers")
          .select(OFFER_SELECT)
          .eq("organization_id", orgId)
          .eq("status", "active")
          .not("sku_id", "is", null)
          .order("normalized_price", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      REPLENISHMENT_OFFERS_MAX,
    ).catch(rethrowDb),
    fetchRowsUpTo(
      (from, to) =>
        ctx.supabase
          .from("purchase_order_items")
          .select("id, sku_id, quantity_ordered, quantity_received, purchase_orders!inner(status)")
          .eq("organization_id", orgId)
          .in("purchase_orders.status", [...ON_ORDER_STATUSES])
          .order("id", { ascending: true })
          .range(from, to),
      REPLENISHMENT_PO_ITEMS_MAX,
    ).catch(rethrowDb),
    fetchRowsUpTo(
      (from, to) => ctx.supabase.from("suppliers").select("id, name, average_lead_time_days, default_moq").eq("organization_id", orgId).eq("is_archived", false).order("id", { ascending: true }).range(from, to),
      REPLENISHMENT_SUPPLIERS_MAX,
    ).catch(rethrowDb),
  ]);

  const offersBySku = new Map<string, OfferLike[]>();
  const offerSuppliers = new Map<string, SupplierLike>();
  for (const o of offersRes.rows) {
    if (!o.sku_id) continue;
    const list = offersBySku.get(o.sku_id) ?? [];
    list.push(o);
    offersBySku.set(o.sku_id, list);
    const s = one(o.supplier);
    if (s) offerSuppliers.set(o.supplier_id, s);
  }
  const suppliers = new Map<string, SupplierLike>(suppliersRes.rows.map((s) => [s.id, s]));
  const onOrder = onOrderBySku(
    poRes.rows.map((pi) => ({
      sku_id: pi.sku_id,
      quantity_ordered: pi.quantity_ordered,
      quantity_received: pi.quantity_received,
      status: one(pi.purchase_orders)?.status ?? "",
    })),
  );

  const viewsById = new Map<string, StockRowView>();
  const drafts: RecommendationDraft[] = [];
  for (const v of bundle.views) {
    const skuId = v.row.sku_id;
    if (!skuId) continue;
    viewsById.set(skuId, v);
    const offer = pickCheapestOffer(offersBySku.get(skuId) ?? []);
    const draft = buildRecommendation(v, {
      offer,
      offerSupplier: offer ? (offerSuppliers.get(offer.supplier_id) ?? suppliers.get(offer.supplier_id) ?? null) : null,
      defaultSupplier: v.row.default_supplier_id ? (suppliers.get(v.row.default_supplier_id) ?? null) : null,
      onOrder: onOrder.get(skuId) ?? 0,
    });
    if (shouldSnapshot(draft)) drafts.push(draft);
  }
  return {
    drafts: sortDrafts(drafts, viewsById),
    truncated: bundle.truncated || offersRes.truncated || poRes.truncated || suppliersRes.truncated,
  };
}

/** Recommandations seules (appelants qui n'affichent pas la complétude, ex. outils du conseiller). */
export async function computeRecommendations(ctx: OrgContext): Promise<RecommendationDraft[]> {
  return (await computeRecommendationsWithCoverage(ctx)).drafts;
}

/** Persiste un instantané : les recommandations ouvertes précédentes sont marquées « ignorées » (remplacées). */
export async function persistRecommendations(ctx: OrgContext, drafts: RecommendationDraft[]): Promise<{ inserted: number; computedAt: string }> {
  const orgId = ctx.organization.id;
  const computedAt = new Date().toISOString();
  const { error: dismissError } = await ctx.supabase.from("replenishment_recommendations").update({ status: "dismissed" }).eq("organization_id", orgId).eq("status", "open");
  if (dismissError) throw fromPostgrestError(dismissError);
  const rows = drafts.map((d) => draftToInsert(d, orgId, computedAt));
  for (const part of chunk(rows, 500)) {
    const { error } = await ctx.supabase.from("replenishment_recommendations").insert(part);
    if (error) throw fromPostgrestError(error);
  }
  return { inserted: rows.length, computedAt };
}

export interface RecommendationView {
  id: string;
  skuId: string;
  code: string;
  label: string;
  level: StockLevel | null;
  levelReason: string | null;
  computedAt: string;
  currentStock: number;
  dailyVelocity: number | null;
  velocityExplanation: string | null;
  daysOfCover: number | null;
  leadTimeDays: number | null;
  leadTimeSource: string | null;
  usedDefaultLeadTime: boolean;
  safetyStock: number;
  moq: number | null;
  onOrder: number;
  supplierAvailable: number | null;
  targetQuantity: number | null;
  recommendedQuantity: number | null;
  explanation: string;
  warnings: string[];
  supplier: { id: string; name: string } | null;
  offer: { id: string; price: number | null; currency: string | null; moq: number | null; taxType: string | null } | null;
  unitPrice: number | null;
  currency: string;
}

const REC_SELECT = "*, sku:skus(id, code, product:products(name), variant:product_variants(name)), supplier:suppliers(id, name), offer:sourcing_offers(id, normalized_price, normalized_currency, moq, tax_type)";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function isLevel(v: unknown): v is StockLevel {
  return v === "out_of_stock" || v === "at_risk" || v === "low" || v === "normal";
}

export async function listOpenRecommendations(ctx: OrgContext, limit = 200): Promise<RecommendationView[]> {
  const { data, error } = await ctx.supabase
    .from("replenishment_recommendations")
    .select(REC_SELECT)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "open")
    .order("current_stock", { ascending: true })
    .order("recommended_quantity", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw fromPostgrestError(error);
  const views = (data ?? []).map((r): RecommendationView => {
    const inputs = (r.inputs && typeof r.inputs === "object" && !Array.isArray(r.inputs) ? r.inputs : {}) as Record<string, unknown>;
    const sku = one(r.sku);
    const product = one(sku?.product);
    const variant = one(sku?.variant);
    const supplier = one(r.supplier);
    const offer = one(r.offer);
    const variantName = variant?.name && variant.name !== "Standard" ? ` · ${variant.name}` : "";
    const warnings = Array.isArray(inputs.warnings) ? inputs.warnings.filter((w): w is string => typeof w === "string") : [];
    return {
      id: r.id,
      skuId: r.sku_id,
      code: sku?.code ?? "",
      label: `${product?.name ?? sku?.code ?? ""}${variantName}`,
      level: isLevel(inputs.level) ? inputs.level : null,
      levelReason: str(inputs.level_reason),
      computedAt: r.computed_at,
      currentStock: r.current_stock,
      dailyVelocity: r.daily_velocity,
      velocityExplanation: str(inputs.velocity_explanation),
      daysOfCover: r.days_of_cover,
      leadTimeDays: r.lead_time_days,
      leadTimeSource: str(inputs.lead_time_source),
      usedDefaultLeadTime: inputs.used_default_lead_time === true,
      safetyStock: r.safety_stock,
      moq: num(inputs.moq),
      onOrder: num(inputs.on_order) ?? 0,
      supplierAvailable: num(inputs.supplier_available),
      targetQuantity: r.target_quantity,
      recommendedQuantity: r.recommended_quantity,
      explanation: r.explanation,
      warnings,
      supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
      offer: offer ? { id: offer.id, price: offer.normalized_price, currency: offer.normalized_currency, moq: offer.moq, taxType: offer.tax_type } : null,
      unitPrice: num(inputs.unit_price),
      currency: str(inputs.currency) ?? ctx.organization.default_currency,
    };
  });
  return views.sort((a, b) => {
    const la = a.level ? STOCK_LEVEL_ORDER[a.level] : 9;
    const lb = b.level ? STOCK_LEVEL_ORDER[b.level] : 9;
    if (la !== lb) return la - lb;
    const da = a.daysOfCover ?? Number.POSITIVE_INFINITY;
    const db = b.daysOfCover ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return (b.recommendedQuantity ?? -1) - (a.recommendedQuantity ?? -1);
  });
}

export interface RecommendationHistory {
  /** null si le comptage a échoué (affiché « — ») */
  totalRows: number | null;
  snapshots: number;
  /** vrai si les instantanés n'ont pas tous été lus : `snapshots` est un minimum */
  snapshotsIsMinimum: boolean;
  lastComputedAt: string | null;
}

export async function getRecommendationHistory(ctx: OrgContext): Promise<RecommendationHistory> {
  const orgId = ctx.organization.id;
  const [countRes, listRes] = await Promise.all([
    ctx.supabase.from("replenishment_recommendations").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    ctx.supabase.from("replenishment_recommendations").select("computed_at").eq("organization_id", orgId).order("computed_at", { ascending: false }).limit(1000),
  ]);
  const rows = listRes.data ?? [];
  const stamps = new Set(rows.map((r) => r.computed_at));
  const totalRows = countRes.error ? null : (countRes.count ?? 0);
  // Seules les 1 000 lignes les plus récentes sont lues : au-delà, le nombre d'instantanés est un minimum.
  return { totalRows, snapshots: stamps.size, snapshotsIsMinimum: listRes.error !== null || totalRows === null || totalRows > rows.length, lastComputedAt: rows[0]?.computed_at ?? null };
}
