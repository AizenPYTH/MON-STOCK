import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { Alert } from "@/db/types";
import { fromPostgrestError } from "@/lib/errors";

/** Alertes événementielles (sync échouée, connexion expirée, stock négatif…) non résolues. */
export async function listEventAlerts(ctx: OrgContext, limit = 100): Promise<Alert[]> {
  const { data, error } = await ctx.supabase
    .from("alerts")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .in("status", ["open", "acknowledged"])
    .order("status", { ascending: true })
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw fromPostgrestError(error);
  return data ?? [];
}
