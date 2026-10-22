import "server-only";
import type { OrgContext } from "@/features/auth/dal";

export type ShellAlert = { id: string; title: string; message: string; severity: string; href: string | null };

export interface ShellData {
  /**
   * compteurs réels affichés dans la navigation (jamais de pastille rouge : un simple nombre mono) ;
   * null si la lecture a échoué : affiché « — », jamais 0 (W-14)
   */
  counts: { outOfStock: number | null; openAlerts: number | null; unmappedListings: number | null; pendingMatches: number | null };
  /** dernière synchronisation eBay réussie (ISO) ou null si aucune */
  lastEbaySync: string | null;
  /** alertes ouvertes les plus graves (4 au plus) pour le menu « Alertes » */
  alerts: ShellAlert[];
}

/** Nombre d'alertes du menu « Alertes ». */
export const SHELL_ALERTS_SHOWN = 4;

const countOrNull = (r: { count: number | null; error: unknown }): number | null => (r.error ? null : (r.count ?? 0));

/** Données de la coquille (barre latérale, barre du haut), lues sous RLS. */
export async function getShellData(ctx: OrgContext): Promise<ShellData> {
  const orgId = ctx.organization.id;
  const [outOfStock, openAlerts, unmapped, matches, sync, alerts] = await Promise.all([
    ctx.supabase.from("inventory").select("sku_id, skus!inner(is_active)", { count: "exact", head: true }).eq("organization_id", orgId).eq("skus.is_active", true).lte("quantity_available", 0),
    ctx.supabase.from("alerts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open"),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]),
    ctx.supabase.from("product_matches").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "suggested"),
    ctx.supabase.from("sync_runs").select("finished_at").eq("organization_id", orgId).eq("source_kind", "channel").eq("status", "success").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    // Tri par gravité EN BASE (enum alert_severity : info < warning < critical), puis les plus
    // récentes : une alerte critique ancienne n'est plus masquée par 20 alertes récentes (W-14).
    ctx.supabase
      .from("alerts")
      .select("id, title, message, severity, action_href")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(SHELL_ALERTS_SHOWN),
  ]);
  const rows = (alerts.data ?? []).map((a) => ({ id: a.id, title: a.title, message: a.message, severity: a.severity, href: a.action_href }));
  return {
    counts: { outOfStock: countOrNull(outOfStock), openAlerts: countOrNull(openAlerts), unmappedListings: countOrNull(unmapped), pendingMatches: countOrNull(matches) },
    lastEbaySync: sync.data?.finished_at ?? null,
    alerts: rows,
  };
}
