import "server-only";
import type { OrgContext } from "@/features/auth/dal";

export type ShellAlert = { id: string; title: string; message: string; severity: string; href: string | null };

export interface ShellData {
  /** compteurs réels affichés dans la navigation (jamais de pastille rouge : un simple nombre mono) */
  counts: { outOfStock: number; openAlerts: number; unmappedListings: number; pendingMatches: number };
  /** dernière synchronisation eBay réussie (ISO) ou null si aucune */
  lastEbaySync: string | null;
  /** alertes ouvertes les plus graves (4 au plus) pour le menu « Alertes » */
  alerts: ShellAlert[];
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/** Données de la coquille (barre latérale, barre du haut), lues sous RLS. */
export async function getShellData(ctx: OrgContext): Promise<ShellData> {
  const orgId = ctx.organization.id;
  const [outOfStock, openAlerts, unmapped, matches, sync, alerts] = await Promise.all([
    ctx.supabase.from("inventory").select("sku_id, skus!inner(is_active)", { count: "exact", head: true }).eq("organization_id", orgId).eq("skus.is_active", true).lte("quantity_available", 0),
    ctx.supabase.from("alerts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open"),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]),
    ctx.supabase.from("product_matches").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "suggested"),
    ctx.supabase.from("sync_runs").select("finished_at").eq("organization_id", orgId).eq("source_kind", "channel").eq("status", "success").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.from("alerts").select("id, title, message, severity, action_href").eq("organization_id", orgId).eq("status", "open").order("created_at", { ascending: false }).limit(20),
  ]);
  const rows = (alerts.data ?? [])
    .map((a) => ({ id: a.id, title: a.title, message: a.message, severity: a.severity, href: a.action_href }))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
    .slice(0, 4);
  return {
    counts: { outOfStock: outOfStock.count ?? 0, openAlerts: openAlerts.count ?? 0, unmappedListings: unmapped.count ?? 0, pendingMatches: matches.count ?? 0 },
    lastEbaySync: sync.data?.finished_at ?? null,
    alerts: rows,
  };
}
