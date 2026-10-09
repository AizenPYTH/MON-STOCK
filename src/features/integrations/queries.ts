import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { ChannelConnection, SyncError, SyncRun, UnmappedListingRow, ChannelListing } from "@/db/types";
import { listConnectorCatalog, type ConnectorCatalogEntry } from "@/integrations/core/registry";
import { getEbayConnector } from "@/integrations/core/registry";
import type { MappingParams } from "@/features/integrations/schemas";
import { toUserMessage } from "@/lib/errors";
import { orIlikeAny } from "@/lib/postgrest";

export interface ConnectionView {
  connection: ChannelConnection;
  channelName: string;
  lastRun: SyncRun | null;
}

export interface IntegrationsOverview {
  catalog: ConnectorCatalogEntry[];
  ebay: { configured: boolean; issues: string[]; environment: "production" | "sandbox" | null; scopes: ReadonlyArray<{ scope: string; reason: string }> };
  connections: ConnectionView[];
  unmappedCount: number;
  queryError: string | null;
}

export async function getIntegrationsOverview(ctx: OrgContext): Promise<IntegrationsOverview> {
  const ebay = getEbayConnector();
  const config = ebay.config();
  const base: IntegrationsOverview = {
    catalog: listConnectorCatalog(),
    ebay: { configured: ebay.isConfigured(), issues: ebay.configurationIssues(), environment: config?.environment ?? null, scopes: ebay.scopes },
    connections: [],
    unmappedCount: 0,
    queryError: null,
  };
  try {
    const orgId = ctx.organization.id;
    const [{ data: connections, error: connError }, { count }] = await Promise.all([
      ctx.supabase.from("channel_connections").select("*, sales_channel:sales_channels(name)").eq("organization_id", orgId).order("created_at"),
      ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]),
    ]);
    if (connError) throw connError;
    const ids = (connections ?? []).map((c) => c.id);
    const lastRuns = new Map<string, SyncRun>();
    if (ids.length > 0) {
      const { data: runs } = await ctx.supabase.from("sync_runs").select("*").eq("organization_id", orgId).eq("source_kind", "channel").in("source_ref", ids).order("started_at", { ascending: false }).limit(ids.length * 5);
      for (const r of runs ?? []) if (r.source_ref && !lastRuns.has(r.source_ref)) lastRuns.set(r.source_ref, r);
    }
    base.connections = (connections ?? []).map((c) => {
      const { sales_channel, ...connection } = c;
      return { connection, channelName: sales_channel?.name ?? "", lastRun: lastRuns.get(c.id) ?? null };
    });
    base.unmappedCount = count ?? 0;
  } catch (e) {
    base.queryError = toUserMessage(e);
  }
  return base;
}

export async function listSyncRuns(ctx: OrgContext, limit = 30): Promise<{ runs: SyncRun[]; connections: Map<string, ChannelConnection>; error: string | null }> {
  const orgId = ctx.organization.id;
  const [{ data: runs, error }, { data: connections }] = await Promise.all([
    ctx.supabase.from("sync_runs").select("*").eq("organization_id", orgId).eq("source_kind", "channel").order("started_at", { ascending: false }).limit(limit),
    ctx.supabase.from("channel_connections").select("*").eq("organization_id", orgId),
  ]);
  const map = new Map<string, ChannelConnection>();
  for (const c of connections ?? []) map.set(c.id, c);
  return { runs: runs ?? [], connections: map, error: error ? toUserMessage(error) : null };
}

export async function getSyncRunDetail(ctx: OrgContext, runId: string): Promise<{ run: SyncRun; errors: SyncError[]; connection: ChannelConnection | null } | null> {
  const { data: run } = await ctx.supabase.from("sync_runs").select("*").eq("organization_id", ctx.organization.id).eq("id", runId).maybeSingle();
  if (!run) return null;
  const [{ data: errors }, connection] = await Promise.all([
    ctx.supabase.from("sync_errors").select("*").eq("sync_run_id", runId).order("created_at").limit(500),
    run.source_ref ? ctx.supabase.from("channel_connections").select("*").eq("id", run.source_ref).maybeSingle().then((r) => r.data ?? null) : Promise.resolve(null),
  ]);
  return { run, errors: errors ?? [], connection };
}

export interface SuggestionView {
  id: string;
  skuId: string;
  code: string;
  productName: string;
  variantName: string | null;
  confidence: number;
  method: string;
  reasons: string[];
}

export interface MappingListingRow extends ChannelListing {
  channel_name: string;
  pending_suggestions: number;
  sku_code: string | null;
  sku_product_name: string | null;
  sku_quantity_available: number | null;
}

export const MAPPING_PAGE_SIZE = 50;

/**
 * Filtre `or()` PostgREST de recherche texte sur les annonces (voir orFilterTerm : caractères
 * structurants neutralisés, valeur entre guillemets — la recherche ne peut ni casser la requête
 * ni y ajouter des conditions).
 */
export function listingSearchFilter(q: string): string | null {
  return orIlikeAny(["title", "external_sku", "external_listing_id"], q, { maxLength: 120 });
}

export async function listListingsForMapping(ctx: OrgContext, params: MappingParams) {
  const orgId = ctx.organization.id;
  const from = (params.page - 1) * MAPPING_PAGE_SIZE;
  const to = from + MAPPING_PAGE_SIZE - 1;

  const [unmappedCount, mappedCount, ignoredCount] = await Promise.all([
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("mapping_status", "mapped"),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("mapping_status", "ignored"),
  ]);
  const counts = { unmapped: unmappedCount.count ?? 0, mapped: mappedCount.count ?? 0, ignored: ignoredCount.count ?? 0 };

  let rows: MappingListingRow[] = [];
  let total = 0;
  let error: string | null = null;

  if (params.tab === "unmapped") {
    let q = ctx.supabase.from("v_unmapped_listings").select("*", { count: "exact" }).eq("organization_id", orgId);
    const search = params.q ? listingSearchFilter(params.q) : null;
    if (search) q = q.or(search);
    const res = await q.order("pending_suggestions", { ascending: false }).order("first_seen_at", { ascending: false }).range(from, to);
    if (res.error) error = toUserMessage(res.error);
    total = res.count ?? 0;
    rows = (res.data ?? []).filter((r): r is UnmappedListingRow & { id: string } => Boolean(r.id)).map((r) => ({ ...(r as unknown as ChannelListing), channel_name: r.channel_name ?? "", pending_suggestions: r.pending_suggestions ?? 0, sku_code: null, sku_product_name: null, sku_quantity_available: null }));
  } else {
    let q = ctx.supabase
      .from("channel_listings")
      .select("*, sales_channel:sales_channels(name), sku:skus(code, product:products(name), inventory(quantity_available))", { count: "exact" })
      .eq("organization_id", orgId)
      .eq("mapping_status", params.tab);
    const search = params.q ? listingSearchFilter(params.q) : null;
    if (search) q = q.or(search);
    const res = await q.order("last_synced_at", { ascending: false }).range(from, to);
    if (res.error) error = toUserMessage(res.error);
    total = res.count ?? 0;
    rows = (res.data ?? []).map((r) => {
      const { sales_channel, sku, ...listing } = r;
      const inv = Array.isArray(sku?.inventory) ? sku?.inventory[0] : sku?.inventory;
      return {
        ...listing,
        channel_name: sales_channel?.name ?? "",
        pending_suggestions: 0,
        sku_code: sku?.code ?? null,
        sku_product_name: sku?.product?.name ?? null,
        sku_quantity_available: inv?.quantity_available ?? null,
      };
    });
  }

  const suggestionsByListing: Record<string, SuggestionView[]> = {};
  const withSuggestions = rows.filter((r) => r.pending_suggestions > 0).map((r) => r.id);
  if (withSuggestions.length > 0) {
    const { data: suggestions } = await ctx.supabase
      .from("mapping_suggestions")
      .select("id, listing_id, sku_id, confidence, method, reasons, sku:skus(code, product:products(name), variant:product_variants(name))")
      .in("listing_id", withSuggestions)
      .eq("status", "pending")
      .order("confidence", { ascending: false });
    for (const s of suggestions ?? []) {
      const reasons = Array.isArray(s.reasons) ? s.reasons.filter((x): x is string => typeof x === "string") : [];
      (suggestionsByListing[s.listing_id] ??= []).push({
        id: s.id,
        skuId: s.sku_id,
        code: s.sku?.code ?? "",
        productName: s.sku?.product?.name ?? "",
        variantName: s.sku?.variant?.name ?? null,
        confidence: Number(s.confidence),
        method: s.method,
        reasons,
      });
    }
  }

  const { data: connections } = await ctx.supabase.from("channel_connections").select("id, status, provider, push_inventory").eq("organization_id", orgId);
  const connectionStatus = new Map<string, { status: string; provider: string; push_inventory: boolean }>();
  for (const c of connections ?? []) connectionStatus.set(c.id, { status: c.status, provider: c.provider, push_inventory: c.push_inventory });

  return { rows, total, page: params.page, pageSize: MAPPING_PAGE_SIZE, counts, suggestionsByListing, connectionStatus, error };
}

export interface SetupState {
  connection: ChannelConnection;
  channelName: string;
  listingsTotal: number;
  listingsActive: number;
  listingsWithSku: number;
  listingsWithoutSku: number;
  autoMapped: number;
  mappedTotal: number;
  suggested: number;
  pendingSuggestions: number;
  unmapped: number;
  ignored: number;
  ordersCount: number;
  initialRun: SyncRun | null;
  lastRun: SyncRun | null;
}

export async function getSetupState(ctx: OrgContext, connectionId: string): Promise<SetupState | null> {
  const orgId = ctx.organization.id;
  const { data: conn } = await ctx.supabase.from("channel_connections").select("*, sales_channel:sales_channels(name)").eq("organization_id", orgId).eq("id", connectionId).maybeSingle();
  if (!conn) return null;
  const { sales_channel, ...connection } = conn;
  const base = () => ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("connection_id", connectionId);
  const [total, active, withSku, autoMapped, mapped, suggested, unmapped, ignored, pendingSuggestions, orders, runs] = await Promise.all([
    base(),
    base().eq("status", "active"),
    base().eq("status", "active").not("external_sku", "is", null).neq("external_sku", ""),
    base().eq("mapping_status", "mapped").eq("mapping_source", "auto_sku_match"),
    base().eq("mapping_status", "mapped"),
    base().eq("status", "active").eq("mapping_status", "suggested"),
    base().eq("status", "active").eq("mapping_status", "unmapped"),
    base().eq("mapping_status", "ignored"),
    ctx.supabase.from("mapping_suggestions").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pending"),
    ctx.supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("connection_id", connectionId),
    ctx.supabase.from("sync_runs").select("*").eq("organization_id", orgId).eq("source_ref", connectionId).order("started_at", { ascending: false }).limit(10),
  ]);
  const listingsActive = active.count ?? 0;
  const listingsWithSku = withSku.count ?? 0;
  return {
    connection,
    channelName: sales_channel?.name ?? "",
    listingsTotal: total.count ?? 0,
    listingsActive,
    listingsWithSku,
    listingsWithoutSku: Math.max(0, listingsActive - listingsWithSku),
    autoMapped: autoMapped.count ?? 0,
    mappedTotal: mapped.count ?? 0,
    suggested: suggested.count ?? 0,
    pendingSuggestions: pendingSuggestions.count ?? 0,
    unmapped: unmapped.count ?? 0,
    ignored: ignored.count ?? 0,
    ordersCount: orders.count ?? 0,
    initialRun: (runs.data ?? []).find((r) => r.trigger === "initial") ?? null,
    lastRun: runs.data?.[0] ?? null,
  };
}
