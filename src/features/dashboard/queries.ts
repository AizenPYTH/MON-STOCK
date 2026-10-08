import "server-only";
import type { OrgContext } from "@/features/auth/dal";

/** Compteurs affichés dans la sidebar (requêtes HEAD, peu coûteuses). */
export async function getSidebarCounts(ctx: OrgContext): Promise<Partial<Record<string, number>>> {
  const orgId = ctx.organization.id;
  const [outOfStock, openAlerts, unmapped] = await Promise.all([
    // Ruptures des SKU actifs uniquement (un SKU archivé à zéro n'est pas une alerte).
    ctx.supabase.from("inventory").select("sku_id, skus!inner(is_active)", { count: "exact", head: true }).eq("organization_id", orgId).eq("skus.is_active", true).lte("quantity_available", 0),
    ctx.supabase.from("alerts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open"),
    ctx.supabase.from("channel_listings").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").in("mapping_status", ["unmapped", "suggested"]),
  ]);
  const alerts = (outOfStock.count ?? 0) + (openAlerts.count ?? 0);
  return {
    "/stock/alerts": alerts || undefined,
    "/settings/integrations": unmapped.count || undefined,
  };
}
