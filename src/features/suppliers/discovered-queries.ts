import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { isPendingDiscovered, readDiscoveredConfig, type DiscoveredSourceInfo } from "@/features/suppliers/discovered";

export interface PendingDiscoveredSource {
  id: string;
  name: string;
  baseUrl: string | null;
  supplierId: string;
  supplierName: string;
  robotsAllowed: boolean | null;
  robotsCheckedAt: string | null;
  createdAt: string;
  info: DiscoveredSourceInfo;
}

/** Sources découvertes en attente de validation (config.discovered = true, non attestées, non ignorées). */
export async function listPendingDiscoveredSources(ctx: OrgContext, options: { supplierId?: string; limit?: number } = {}): Promise<PendingDiscoveredSource[]> {
  let q = ctx.supabase
    .from("supplier_sources")
    .select("id, name, base_url, supplier_id, config, automated_access_confirmed, robots_allowed, robots_checked_at, created_at, supplier:suppliers(name, is_archived)")
    .eq("organization_id", ctx.organization.id)
    .eq("source_type", "PUBLIC_WEB")
    .eq("automated_access_confirmed", false)
    .eq("config->>discovered", "true")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);
  if (options.supplierId) q = q.eq("supplier_id", options.supplierId);
  const { data } = await q;
  return (data ?? [])
    .filter((s) => isPendingDiscovered(s) && !s.supplier?.is_archived)
    .map((s) => ({ id: s.id, name: s.name, baseUrl: s.base_url, supplierId: s.supplier_id, supplierName: s.supplier?.name ?? "Fournisseur", robotsAllowed: s.robots_allowed, robotsCheckedAt: s.robots_checked_at, createdAt: s.created_at, info: readDiscoveredConfig(s.config) }));
}
