import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { listCatalogSources } from "@/integrations/sourcing/catalog";
import { listSourceAdapters } from "@/integrations/sourcing/registry";
import { adapterKeyOf } from "@/services/sourcing/adapter-runtime";
import type { DbClient } from "@/services/sourcing/offer-query";
import { computeSourcingStatus, isConnectedSource, type SourcingStatusItem, type StatusOfferStats, type StatusSourceInput } from "@/services/sourcing/status-summary";

/** Requêtes de comptage simultanées au plus. */
const STATUS_COUNT_CONCURRENCY = 8;

export interface OfferStatsBySource {
  stats: Map<string, StatusOfferStats>;
  /** Sources dont le comptage a échoué (base indisponible) : leurs offres ne sont pas comptées. */
  failedSourceIds: string[];
}

/**
 * Offres actives « avec prix » / « avec stock » par source, par comptages exacts côté base
 * (count=exact, head : aucune ligne transférée). Un parcours des offres (.limit(10 000)) était
 * silencieusement plafonné à 1 000 lignes par PostgREST : les sources au-delà n'étaient jamais
 * comptées et la troncature n'était jamais signalée.
 */
export async function countOfferStatsBySource(supabase: DbClient, organizationId: string, sourceIds: readonly string[], concurrency = STATUS_COUNT_CONCURRENCY): Promise<OfferStatsBySource> {
  const ids = [...new Set(sourceIds)];
  const out: OfferStatsBySource = { stats: new Map(), failedSourceIds: [] };
  const base = (sourceId: string) => supabase.from("sourcing_offers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("source_id", sourceId).eq("status", "active");
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const sourceId = ids[next++]!;
      const [withPrice, withStock] = await Promise.all([base(sourceId).gt("original_price", 0), base(sourceId).or("available_quantity.not.is.null,stock_status.neq.unknown")]);
      if (withPrice.error || withStock.error || withPrice.count === null || withStock.count === null) {
        out.failedSourceIds.push(sourceId);
        continue;
      }
      out.stats.set(sourceId, { withPrice: withPrice.count, withStock: withStock.count });
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), ids.length) }, worker));
  return out;
}

/** État des sources de l'organisation (catalogue + registre + base), calculé à chaque affichage. */
export async function loadSourcingStatus(ctx: OrgContext): Promise<{ items: SourcingStatusItem[]; offerCountsIncomplete: boolean }> {
  const orgId = ctx.organization.id;
  const [{ data: sources }, { data: connections }] = await Promise.all([
    ctx.supabase.from("supplier_sources").select("id, source_type, status, automated_access_confirmed, robots_allowed, config").eq("organization_id", orgId).limit(1000),
    ctx.supabase.from("supplier_connections").select("id, connector_key, status, source_id").eq("organization_id", orgId).limit(200),
  ]);
  const connectionBySource = new Map<string, { connector_key: string; status: string }>();
  const orphanConnections: Array<{ connectorKey: string; status: string }> = [];
  for (const c of connections ?? []) {
    if (c.status === "disconnected") continue;
    if (c.source_id) connectionBySource.set(c.source_id, c);
    else orphanConnections.push({ connectorKey: c.connector_key, status: c.status });
  }
  const sourceInputs: StatusSourceInput[] = (sources ?? []).map((s) => {
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
  });
  // « Avec prix » / « Avec stock » ne portent que sur les sources connectées : seules celles-ci sont comptées.
  const counts = await countOfferStatsBySource(ctx.supabase, orgId, sourceInputs.filter(isConnectedSource).map((s) => s.id));
  const items = computeSourcingStatus({
    catalog: listCatalogSources(),
    adapters: listSourceAdapters().map((a) => ({ key: a.key, access: a.access, method: a.method, verification: a.verification, search: a.capabilities.search })),
    sources: sourceInputs,
    orphanConnections,
    offersBySource: counts.stats,
  });
  return { items, offerCountsIncomplete: counts.failedSourceIds.length > 0 };
}
