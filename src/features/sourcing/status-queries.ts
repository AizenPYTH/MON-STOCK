import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { listCatalogSources } from "@/integrations/sourcing/catalog";
import { listSourceAdapters } from "@/integrations/sourcing/registry";
import { adapterKeyOf } from "@/services/sourcing/adapter-runtime";
import { computeSourcingStatus, type SourcingStatusItem, type StatusOfferStats } from "@/services/sourcing/status-summary";

export const STATUS_OFFER_SCAN_LIMIT = 10_000;

/** État des sources de l'organisation (catalogue + registre + base), calculé à chaque affichage. */
export async function loadSourcingStatus(ctx: OrgContext): Promise<{ items: SourcingStatusItem[]; offersTruncated: boolean }> {
  const orgId = ctx.organization.id;
  const [{ data: sources }, { data: connections }, { data: offers }] = await Promise.all([
    ctx.supabase.from("supplier_sources").select("id, source_type, status, automated_access_confirmed, robots_allowed, config").eq("organization_id", orgId).limit(1000),
    ctx.supabase.from("supplier_connections").select("id, connector_key, status, source_id").eq("organization_id", orgId).limit(200),
    ctx.supabase.from("sourcing_offers").select("source_id, original_price, available_quantity, stock_status").eq("organization_id", orgId).eq("status", "active").limit(STATUS_OFFER_SCAN_LIMIT),
  ]);
  const connectionBySource = new Map<string, { connector_key: string; status: string }>();
  const orphanConnections: Array<{ connectorKey: string; status: string }> = [];
  for (const c of connections ?? []) {
    if (c.status === "disconnected") continue;
    if (c.source_id) connectionBySource.set(c.source_id, c);
    else orphanConnections.push({ connectorKey: c.connector_key, status: c.status });
  }
  const offersBySource = new Map<string, StatusOfferStats>();
  for (const o of offers ?? []) {
    const s = offersBySource.get(o.source_id) ?? { withPrice: 0, withStock: 0 };
    if (Number(o.original_price) > 0) s.withPrice++;
    if (o.available_quantity !== null || o.stock_status !== "unknown") s.withStock++;
    offersBySource.set(o.source_id, s);
  }
  const items = computeSourcingStatus({
    catalog: listCatalogSources(),
    adapters: listSourceAdapters().map((a) => ({ key: a.key, access: a.access, method: a.method, verification: a.verification, search: a.capabilities.search })),
    sources: (sources ?? []).map((s) => {
      const cfg = (s.config ?? {}) as Record<string, unknown>;
      const conn = connectionBySource.get(s.id) ?? null;
      return {
        id: s.id,
        sourceType: s.source_type,
        status: s.status,
        attested: s.automated_access_confirmed,
        robotsAllowed: s.robots_allowed,
        adapterKey: conn?.connector_key ?? adapterKeyOf(s.config),
        discovered: cfg.discovered === true,
        discoveredAccess: typeof cfg.access === "string" ? cfg.access : null,
        connectionStatus: conn?.status ?? null,
      };
    }),
    orphanConnections,
    offersBySource,
  });
  return { items, offersTruncated: (offers ?? []).length >= STATUS_OFFER_SCAN_LIMIT };
}
