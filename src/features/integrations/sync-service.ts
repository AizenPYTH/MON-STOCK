import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { runChannelSync, type SyncRunResult } from "@/services/sync/engine";
import { formatRunSummary } from "@/features/integrations/format";

export interface SyncNowResult {
  result: SyncRunResult;
  summary: string;
}

/**
 * [Synchroniser maintenant] (web et mobile) : vérifie que la connexion appartient à
 * l'organisation de l'utilisateur (lecture sous RLS), puis exécute RÉELLEMENT le moteur de
 * synchronisation côté serveur (tokens eBay déchiffrés uniquement ici, jamais renvoyés).
 */
export async function syncConnectionNow(
  ctx: OrgContext,
  connectionId: string,
  options: { trigger: "manual" | "initial"; scope: "full" | "listings" | "orders" },
): Promise<SyncNowResult> {
  const { data: connection } = await ctx.supabase.from("channel_connections").select("id").eq("id", connectionId).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!connection) throw new AppError("NOT_FOUND", "Connexion introuvable dans votre organisation.");
  const result = await runChannelSync(connection.id, { trigger: options.trigger, userId: ctx.user.id, scope: options.scope });
  const summary = formatRunSummary({ status: result.status, stats: result.stats as unknown as Record<string, number>, error_count: result.stats.errors });
  return { result, summary };
}
