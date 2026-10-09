import { listCatalogSources } from "@/integrations/sourcing/catalog";
import { isConnectedSource, type StatusSourceInput } from "@/services/sourcing/status-summary";
import type { MobileSupabase } from "~/lib/supabase";

/**
 * Sourcing — état RÉEL de l'organisation, mêmes définitions que le web (status-summary.ts) :
 * DOCUMENTÉ (catalogue) ≠ VÉRIFIÉ ≠ CONNECTÉ ≠ OFFRE DISPONIBLE. La recherche EN DIRECT auprès
 * des sources (robots.txt, limites de débit, comptes fournisseurs) s'exécute uniquement côté
 * serveur : elle n'est pas proposée tant que l'API web n'est pas déployée.
 */
export interface SourcingOverview {
  documented: number;
  verifiedFromOfficialSites: number;
  connectedSources: number;
  sourcesTotal: number;
  activeOffers: number;
  recentOffers: {
    id: string;
    title: string;
    supplierName: string | null;
    price: number | null;
    currency: string | null;
    normalizedPrice: number | null;
    normalizedCurrency: string | null;
    availableQuantity: number | null;
    moq: number | null;
    sourceType: string;
    sourceUrl: string | null;
    lastSeenAt: string | null;
  }[];
}

export async function fetchSourcingOverview(supabase: MobileSupabase, organizationId: string): Promise<SourcingOverview> {
  const [sources, connections, offersCount, offers] = await Promise.all([
    supabase.from("supplier_sources").select("id, source_type, status, automated_access_confirmed, robots_allowed, config").eq("organization_id", organizationId).limit(1000),
    supabase.from("supplier_connections").select("connector_key, status, source_id").eq("organization_id", organizationId).limit(200),
    supabase.from("sourcing_offers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
    supabase
      .from("sourcing_offers")
      .select("id, title_original, original_price, original_currency, normalized_price, normalized_currency, available_quantity, moq, source_type, source_url, last_seen_at, supplier:suppliers(name)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);
  if (sources.error) throw sources.error;
  if (connections.error) throw connections.error;
  if (offers.error) throw offers.error;

  const connBySource = new Map<string, string>();
  for (const c of connections.data ?? []) if (c.source_id && c.status !== "disconnected") connBySource.set(c.source_id, c.status);
  const inputs: StatusSourceInput[] = (sources.data ?? []).map((s) => {
    const cfg = (s.config ?? {}) as Record<string, unknown>;
    return {
      id: s.id,
      sourceType: s.source_type,
      status: s.status,
      attested: s.automated_access_confirmed,
      robotsAllowed: s.robots_allowed,
      adapterKey: typeof cfg.adapter === "string" ? cfg.adapter : null,
      discovered: cfg.discovered === true,
      discoveredAccess: typeof cfg.access === "string" ? cfg.access : null,
      connectionStatus: connBySource.get(s.id) ?? null,
    };
  });
  const catalog = listCatalogSources();
  return {
    documented: catalog.length,
    verifiedFromOfficialSites: catalog.filter((c) => c.status === "verified_official_snippets").length,
    connectedSources: inputs.filter(isConnectedSource).length,
    sourcesTotal: inputs.length,
    activeOffers: offersCount.count ?? 0,
    recentOffers: (offers.data ?? []).map((o) => ({
      id: o.id,
      title: o.title_original,
      supplierName: o.supplier?.name ?? null,
      price: o.original_price,
      currency: o.original_currency,
      normalizedPrice: o.normalized_price,
      normalizedCurrency: o.normalized_currency,
      availableQuantity: o.available_quantity,
      moq: o.moq,
      sourceType: o.source_type,
      sourceUrl: o.source_url,
      lastSeenAt: o.last_seen_at,
    })),
  };
}
