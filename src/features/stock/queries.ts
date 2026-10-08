import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { SalesChannel, StockOverviewRow } from "@/db/types";
import { enrichStockRow, type MarginContext, type StockRowView } from "@/features/stock/model";
import type { StockListParams } from "@/features/stock/schemas";

export const STOCK_PAGE_SIZE = 50;

/** Contexte de marge « par défaut » de l'organisation : canal principal (eBay si connecté, sinon manuel). */
export function marginContextFromChannels(channels: Pick<SalesChannel, "provider" | "fee_percent" | "payment_fee_percent" | "payment_fee_fixed" | "default_shipping_cost">[], orgSettings: unknown): MarginContext {
  const settings = (orgSettings ?? {}) as { default_shipping_cost?: number | null };
  const primary = channels.find((c) => c.provider === "ebay") ?? channels.find((c) => c.provider !== "manual") ?? channels[0];
  return {
    feePercent: primary?.fee_percent ?? null,
    paymentFeePercent: primary?.payment_fee_percent ?? null,
    paymentFeeFixed: primary?.payment_fee_fixed ?? null,
    shippingCost: primary?.default_shipping_cost ?? settings.default_shipping_cost ?? null,
  };
}

export async function getMarginContext(ctx: OrgContext): Promise<MarginContext> {
  const { data } = await ctx.supabase.from("sales_channels").select("provider, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost").eq("organization_id", ctx.organization.id).eq("is_active", true);
  return marginContextFromChannels(data ?? [], ctx.organization.settings);
}

/** Échappe les jokers ILIKE (%, _ et \\). */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/**
 * Terme de recherche utilisable dans un filtre `or=(...)` PostgREST : les caractères
 * structurants de cette syntaxe (virgule, parenthèses, guillemets) sont remplacés par
 * des espaces — sinon « iPhone 13, Pro » casse la requête (erreur 400 → page d'erreur).
 */
export function orSearchTerm(raw: string): string {
  // `*` est aussi un joker PostgREST : retiré plutôt qu'interprété.
  return escapeLike(raw.replace(/[,()"*]/g, " ").replace(/\s+/g, " ").trim());
}

export interface StockListResult {
  rows: StockRowView[];
  total: number;
  page: number;
  pageSize: number;
  facets: { brands: string[]; categories: string[]; suppliers: Array<{ id: string; name: string }> };
  /** Statuts calculés (à risque / faible / normal) : seules les POST_FILTER_LIMIT premières lignes sont analysées. */
  truncated: boolean;
}

/** Les statuts dépendant de la vitesse sont calculés côté serveur sur un ensemble borné. */
export const POST_FILTER_LIMIT = 2000;

export async function listStock(ctx: OrgContext, params: StockListParams): Promise<StockListResult> {
  const orgId = ctx.organization.id;
  const supabase = ctx.supabase;
  const marginCtx = await getMarginContext(ctx);

  const needsPostFilter = params.status === "at_risk" || params.status === "normal";
  const page = params.page;
  const from = (page - 1) * STOCK_PAGE_SIZE;

  let query = supabase.from("v_stock_overview").select("*", { count: "exact" }).eq("organization_id", orgId);
  query = params.archived ? query.eq("is_active", false) : query.eq("is_active", true);

  const q = params.q ? orSearchTerm(params.q) : "";
  if (q) {
    query = query.or(`product_name.ilike.%${q}%,code.ilike.%${q}%,barcode.ilike.%${q}%,brand.ilike.%${q}%,variant_name.ilike.%${q}%`);
  }
  // Canal / fournisseur : filtrés en base sur les tableaux de la vue (pas de liste d'identifiants dans l'URL).
  if (params.channel) query = query.contains("channel_providers", [params.channel]);
  if (params.supplier) query = query.contains("supplier_ids", [params.supplier]);
  if (params.brand) query = query.eq("brand", params.brand);
  if (params.category) query = query.eq("category", params.category);
  if (params.min_margin !== undefined && Number.isFinite(params.min_margin)) query = query.gte("unit_margin", params.min_margin);
  if (params.stock === "in_stock") query = query.gt("quantity_available", 0);
  if (params.stock === "empty") query = query.lte("quantity_available", 0);
  if (params.stock === "negative") query = query.lt("quantity_available", 0);
  if (params.status === "out_of_stock") query = query.lte("quantity_available", 0);
  if (params.status === "low") query = query.gt("quantity_available", 0);
  if (params.status === "at_risk") query = query.gt("quantity_available", 0).gt("units_90d", 0);
  if (params.status === "normal") query = query.gt("quantity_available", 0);

  switch (params.sort) {
    case "low_stock":
      query = query.order("quantity_available", { ascending: true }).order("product_name", { ascending: true });
      break;
    case "margin":
      query = query.order("unit_margin", { ascending: false, nullsFirst: false }).order("product_name", { ascending: true });
      break;
    case "stock_value":
      query = query.order("stock_value", { ascending: false, nullsFirst: false }).order("product_name", { ascending: true });
      break;
    case "last_sale":
      query = query.order("last_sale_at", { ascending: false, nullsFirst: false }).order("product_name", { ascending: true });
      break;
    case "oldest_sale":
      // Stock dormant : jamais vendu d'abord, puis la dernière vente la plus ancienne.
      query = query.order("last_sale_at", { ascending: true, nullsFirst: true }).order("product_name", { ascending: true });
      break;
    case "name":
      query = query.order("product_name", { ascending: true }).order("code", { ascending: true });
      break;
    case "best_sellers":
    default:
      query = query.order("units_30d", { ascending: false, nullsFirst: false }).order("units_90d", { ascending: false, nullsFirst: false }).order("product_name", { ascending: true });
  }

  // Départage final stable : sans lui, deux lignes ex æquo peuvent changer de page d'une requête à l'autre.
  query = query.order("sku_id", { ascending: true });

  if (needsPostFilter || params.status === "low") {
    // Statuts dépendant de la vitesse : calcul côté serveur sur un ensemble borné, puis pagination.
    const { data, error } = await query.limit(POST_FILTER_LIMIT + 1);
    if (error) throw error;
    const scanned = data ?? [];
    const truncated = scanned.length > POST_FILTER_LIMIT;
    const all = scanned.slice(0, POST_FILTER_LIMIT).map((r) => enrichStockRow(r, marginCtx)).filter((v) => v.classification.level === params.status);
    const rows = all.slice(from, from + STOCK_PAGE_SIZE);
    return { rows, total: all.length, page, pageSize: STOCK_PAGE_SIZE, facets: await facets(), truncated };
  }

  const { data, error, count } = await query.range(from, from + STOCK_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []).map((r) => enrichStockRow(r, marginCtx));
  return { rows, total: count ?? rows.length, page, pageSize: STOCK_PAGE_SIZE, facets: await facets(), truncated: false };

  async function facets() {
    const [{ data: brands }, { data: cats }, { data: sups }] = await Promise.all([
      supabase.from("products").select("brand").eq("organization_id", orgId).eq("is_archived", false).not("brand", "is", null).limit(1000),
      supabase.from("products").select("category").eq("organization_id", orgId).eq("is_archived", false).not("category", "is", null).limit(1000),
      supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("is_archived", false).order("name").limit(500),
    ]);
    return {
      brands: Array.from(new Set((brands ?? []).map((b) => b.brand).filter((x): x is string => Boolean(x)))).sort(),
      categories: Array.from(new Set((cats ?? []).map((c) => c.category).filter((x): x is string => Boolean(x)))).sort(),
      suppliers: sups ?? [],
    };
  }
}

export async function getStockRowByCode(ctx: OrgContext, code: string): Promise<StockOverviewRow | null> {
  const { data } = await ctx.supabase.from("v_stock_overview").select("*").eq("organization_id", ctx.organization.id).ilike("code", escapeLike(code)).maybeSingle();
  return data ?? null;
}

export async function getStockRowById(ctx: OrgContext, skuId: string): Promise<StockOverviewRow | null> {
  const { data } = await ctx.supabase.from("v_stock_overview").select("*").eq("organization_id", ctx.organization.id).eq("sku_id", skuId).maybeSingle();
  return data ?? null;
}

export interface SkuRotation {
  /** jours effectivement couverts par la fenêtre (≤ 30, moins si le SKU est récent) */
  windowDays: number;
  avgOnHand: number | null;
  unitsSold: number;
}

export async function getSkuDetail(ctx: OrgContext, code: string) {
  const row = await getStockRowByCode(ctx, code);
  if (!row || !row.sku_id) return null;
  const orgId = ctx.organization.id;
  const skuId = row.sku_id;
  const [movements, listings, offers, orderItems, priceHistory, siblings, suppliers, pendingSales, marginCtx, product, variant, purchaseItems, skuMeta, rotation, defaultSupplier] = await Promise.all([
    ctx.supabase.from("inventory_movements").select("*").eq("sku_id", skuId).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    ctx.supabase.from("channel_listings").select("*, sales_channel:sales_channels(name)").eq("sku_id", skuId).order("last_synced_at", { ascending: false }).limit(100),
    ctx.supabase
      .from("sourcing_offers")
      .select("*, supplier:suppliers(id, name, country, internal_score, average_lead_time_days, default_moq)")
      .eq("sku_id", skuId)
      .eq("status", "active")
      .order("normalized_price", { ascending: true, nullsFirst: false })
      .limit(20),
    ctx.supabase.from("order_items").select("*, order:orders(id, provider, order_number, external_order_id, placed_at, status)").eq("sku_id", skuId).order("created_at", { ascending: false }).limit(20),
    ctx.supabase.from("price_history").select("*").eq("sku_id", skuId).order("recorded_at", { ascending: false }).limit(30),
    ctx.supabase.from("v_stock_overview").select("sku_id, code, variant_name, quantity_available").eq("organization_id", orgId).eq("product_id", row.product_id ?? "").order("code").limit(200),
    ctx.supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("is_archived", false).order("name").limit(500),
    // Ventes rattachées mais non déduites — hors commandes annulées / remboursées (que
    // apply_pending_sales_for_sku ignore : les compter afficherait une alerte impossible à traiter).
    ctx.supabase
      .from("order_items")
      .select("id, order:orders!inner(status)", { count: "exact", head: true })
      .eq("sku_id", skuId)
      .eq("inventory_applied", false)
      .not("order.status", "in", "(cancelled,refunded)"),
    getMarginContext(ctx),
    ctx.supabase.from("products").select("*").eq("id", row.product_id ?? "").maybeSingle(),
    ctx.supabase.from("product_variants").select("*").eq("id", row.variant_id ?? "").maybeSingle(),
    ctx.supabase
      .from("purchase_order_items")
      .select("quantity_ordered, quantity_received, purchase_order:purchase_orders!inner(status)")
      .eq("sku_id", skuId)
      .in("purchase_order.status", ["sent", "confirmed", "partially_received"]),
    ctx.supabase.from("skus").select("updated_at").eq("id", skuId).maybeSingle(),
    ctx.supabase.rpc("sku_rotation", { p_organization_id: orgId, p_sku_ids: [skuId] }),
    row.default_supplier_id
      ? ctx.supabase.from("suppliers").select("id, name, average_lead_time_days, default_moq").eq("id", row.default_supplier_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const onOrder = (purchaseItems.data ?? []).reduce((sum, pi) => sum + Math.max(0, pi.quantity_ordered - pi.quantity_received), 0);
  const rot = rotation.data?.[0];

  return {
    row,
    view: enrichStockRow(row, marginCtx),
    marginCtx,
    product: product.data ?? null,
    variant: variant.data ?? null,
    movements: movements.data ?? [],
    listings: listings.data ?? [],
    offers: offers.data ?? [],
    orderItems: orderItems.data ?? [],
    priceHistory: priceHistory.data ?? [],
    siblings: (siblings.data ?? []).filter((s) => s.sku_id !== skuId),
    suppliers: suppliers.data ?? [],
    pendingSalesCount: pendingSales.count ?? 0,
    onOrder,
    skuUpdatedAt: skuMeta.data?.updated_at ?? null,
    rotation: rot ? ({ windowDays: Number(rot.window_days), avgOnHand: rot.avg_on_hand === null ? null : Number(rot.avg_on_hand), unitsSold: rot.units_sold } satisfies SkuRotation) : null,
    defaultSupplier: defaultSupplier.data ?? null,
  };
}

export type SkuDetail = NonNullable<Awaited<ReturnType<typeof getSkuDetail>>>;

/** Recherche rapide de SKU (mapping, sourcing, formulaires). */
export async function searchSkus(ctx: OrgContext, q: string, limit = 20) {
  const term = escapeLike(q.trim());
  let query = ctx.supabase.from("v_stock_overview").select("sku_id, code, product_name, variant_name, brand, quantity_available, cost_price, sale_price").eq("organization_id", ctx.organization.id).eq("is_active", true).limit(limit);
  if (term) query = query.or(`product_name.ilike.%${term}%,code.ilike.%${term}%,barcode.ilike.%${term}%`);
  const { data } = await query.order("product_name");
  return data ?? [];
}

export async function listProducts(ctx: OrgContext, limit = 500) {
  const { data } = await ctx.supabase.from("products").select("id, name, brand").eq("organization_id", ctx.organization.id).eq("is_archived", false).order("name").limit(limit);
  return data ?? [];
}
