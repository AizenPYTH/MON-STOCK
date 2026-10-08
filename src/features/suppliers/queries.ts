import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { PurchaseOrder, Supplier, SupplierFeed, SupplierSource } from "@/db/types";
import { computeSupplierScore, type SupplierScoreResult } from "@/domain/sourcing/scoring";

export const SUPPLIER_OFFERS_PAGE_SIZE = 25;

export interface SupplierListItem {
  supplier: Supplier;
  offersCount: number;
  sourcesCount: number;
  sourceTypes: string[];
  lastSyncAt: string | null;
}

export async function listSuppliers(ctx: OrgContext, options: { archived?: boolean } = {}): Promise<SupplierListItem[]> {
  const orgId = ctx.organization.id;
  const [{ data: suppliers }, { data: offers }, { data: sources }, { data: feeds }] = await Promise.all([
    ctx.supabase.from("suppliers").select("*").eq("organization_id", orgId).eq("is_archived", options.archived ?? false).order("name").limit(500),
    ctx.supabase.from("sourcing_offers").select("supplier_id").eq("organization_id", orgId).eq("status", "active").limit(10000),
    ctx.supabase.from("supplier_sources").select("supplier_id, source_type, last_sync_at").eq("organization_id", orgId).limit(2000),
    ctx.supabase.from("supplier_feeds").select("supplier_id, format, last_sync_at").eq("organization_id", orgId).limit(2000),
  ]);
  const offerCounts = new Map<string, number>();
  for (const o of offers ?? []) offerCounts.set(o.supplier_id, (offerCounts.get(o.supplier_id) ?? 0) + 1);
  const sourceInfo = new Map<string, { count: number; types: Set<string>; last: string | null }>();
  const bump = (supplierId: string, type: string, last: string | null) => {
    const cur = sourceInfo.get(supplierId) ?? { count: 0, types: new Set<string>(), last: null };
    cur.count++;
    cur.types.add(type);
    if (last && (!cur.last || last > cur.last)) cur.last = last;
    sourceInfo.set(supplierId, cur);
  };
  for (const s of sources ?? []) bump(s.supplier_id, s.source_type, s.last_sync_at);
  for (const f of feeds ?? []) bump(f.supplier_id, f.format.toUpperCase(), f.last_sync_at);
  return (suppliers ?? []).map((supplier) => {
    const info = sourceInfo.get(supplier.id);
    return { supplier, offersCount: offerCounts.get(supplier.id) ?? 0, sourcesCount: info?.count ?? 0, sourceTypes: Array.from(info?.types ?? []), lastSyncAt: info?.last ?? null };
  });
}

export async function getSupplier(ctx: OrgContext, id: string): Promise<Supplier | null> {
  const { data } = await ctx.supabase.from("suppliers").select("*").eq("organization_id", ctx.organization.id).eq("id", id).maybeSingle();
  return data ?? null;
}

export async function getSupplierTabCounts(ctx: OrgContext, supplierId: string): Promise<{ offers: number; sources: number; orders: number }> {
  const [o, s, f, p] = await Promise.all([
    ctx.supabase.from("sourcing_offers").select("id", { count: "exact", head: true }).eq("supplier_id", supplierId).in("status", ["active", "suspicious"]),
    ctx.supabase.from("supplier_sources").select("id", { count: "exact", head: true }).eq("supplier_id", supplierId).neq("source_type", "MANUAL"),
    ctx.supabase.from("supplier_feeds").select("id", { count: "exact", head: true }).eq("supplier_id", supplierId),
    ctx.supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("supplier_id", supplierId),
  ]);
  return { offers: o.count ?? 0, sources: (s.count ?? 0) + (f.count ?? 0), orders: p.count ?? 0 };
}

export async function getSupplierOffers(ctx: OrgContext, supplierId: string, page = 1, status: "active" | "all" = "active") {
  const from = (page - 1) * SUPPLIER_OFFERS_PAGE_SIZE;
  let q = ctx.supabase
    .from("sourcing_offers")
    .select("*, source:supplier_sources(id, name, source_type), sku:skus(id, code, product:products(name))", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .eq("supplier_id", supplierId);
  q = status === "active" ? q.in("status", ["active", "suspicious"]) : q;
  const { data, count, error } = await q.order("last_seen_at", { ascending: false }).range(from, from + SUPPLIER_OFFERS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, pageSize: SUPPLIER_OFFERS_PAGE_SIZE };
}

export type SupplierOfferRow = Awaited<ReturnType<typeof getSupplierOffers>>["rows"][number];

export interface SupplierSourcesView {
  sources: Array<SupplierSource & { feeds: SupplierFeed[] }>;
  connections: Array<{ id: string; connector_key: string; status: string; last_sync_at: string | null; last_error: string | null }>;
  manualSource: SupplierSource | null;
}

export async function getSupplierSources(ctx: OrgContext, supplierId: string): Promise<SupplierSourcesView> {
  const [{ data: sources }, { data: feeds }, { data: connections }] = await Promise.all([
    ctx.supabase.from("supplier_sources").select("*").eq("supplier_id", supplierId).order("created_at"),
    ctx.supabase.from("supplier_feeds").select("*").eq("supplier_id", supplierId).order("created_at"),
    ctx.supabase.from("supplier_connections").select("id, connector_key, status, last_sync_at, last_error").eq("supplier_id", supplierId),
  ]);
  const feedsBySource = new Map<string, SupplierFeed[]>();
  for (const f of feeds ?? []) feedsBySource.set(f.source_id, [...(feedsBySource.get(f.source_id) ?? []), f]);
  const all = (sources ?? []).map((s) => ({ ...s, feeds: feedsBySource.get(s.id) ?? [] }));
  return { sources: all.filter((s) => s.source_type !== "MANUAL"), connections: connections ?? [], manualSource: all.find((s) => s.source_type === "MANUAL") ?? null };
}

export async function getSupplierPurchaseOrders(ctx: OrgContext, supplierId: string) {
  const { data } = await ctx.supabase
    .from("purchase_orders")
    .select("*, items:purchase_order_items(id, quantity_ordered, quantity_received, unit_cost)")
    .eq("organization_id", ctx.organization.id)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getPurchaseOrder(ctx: OrgContext, poId: string) {
  const { data } = await ctx.supabase
    .from("purchase_orders")
    .select("*, items:purchase_order_items(*, sku:skus(id, code, product:products(name), variant:product_variants(name)))")
    .eq("organization_id", ctx.organization.id)
    .eq("id", poId)
    .maybeSingle();
  return data ?? null;
}

export type PurchaseOrderDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>>;

export interface SupplierPerformance {
  score: SupplierScoreResult;
  receivedOrders: number;
  cancelledOrders: number;
  leadTimeSamples: Array<{ reference: string | null; days: number; sentAt: string; receivedAt: string }>;
  activeOffers: number;
  staleOffers: number;
  stored: Pick<Supplier, "internal_score" | "score_breakdown" | "score_computed_at">;
}

export function leadTimeDays(po: Pick<PurchaseOrder, "sent_at" | "received_at">): number | null {
  if (!po.sent_at || !po.received_at) return null;
  const d = (new Date(po.received_at).getTime() - new Date(po.sent_at).getTime()) / 86_400_000;
  return d >= 0 ? Math.round(d * 10) / 10 : null;
}

export async function getSupplierPerformance(ctx: OrgContext, supplier: Supplier): Promise<SupplierPerformance> {
  const [{ data: orders }, { count: active }, { count: stale }] = await Promise.all([
    ctx.supabase.from("purchase_orders").select("id, reference, status, sent_at, received_at").eq("supplier_id", supplier.id).limit(500),
    ctx.supabase.from("sourcing_offers").select("id", { count: "exact", head: true }).eq("supplier_id", supplier.id).eq("status", "active"),
    ctx.supabase.from("sourcing_offers").select("id", { count: "exact", head: true }).eq("supplier_id", supplier.id).eq("status", "active").lt("last_seen_at", new Date(Date.now() - 48 * 3_600_000).toISOString()),
  ]);
  const list = orders ?? [];
  const received = list.filter((o) => o.status === "received" || o.status === "partially_received");
  const cancelled = list.filter((o) => o.status === "cancelled");
  const samples = received
    .map((o) => ({ reference: o.reference, days: leadTimeDays(o), sentAt: o.sent_at, receivedAt: o.received_at }))
    .filter((s): s is { reference: string | null; days: number; sentAt: string; receivedAt: string } => s.days !== null && s.sentAt !== null && s.receivedAt !== null);
  const score = computeSupplierScore({ receivedOrders: received.length, leadTimeSamples: samples.map((s) => s.days), expectedLeadTimeDays: supplier.average_lead_time_days, problemCount: cancelled.length, activeOffers: active ?? 0 });
  return { score, receivedOrders: received.length, cancelledOrders: cancelled.length, leadTimeSamples: samples, activeOffers: active ?? 0, staleOffers: stale ?? 0, stored: { internal_score: supplier.internal_score, score_breakdown: supplier.score_breakdown, score_computed_at: supplier.score_computed_at } };
}
