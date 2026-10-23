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
 * W-10 : « Synchroniser maintenant » lancé depuis une Server Action du site. La durée maximale de la
 * fonction est celle de la PAGE qui héberge le formulaire (`export const maxDuration = 120` sur
 * /settings/integrations, /settings/integrations/ebay/setup et /settings/sync/[runId] — valeur
 * littérale exigée par Next.js, vérifiée par test). Le moteur reçoit une échéance absolue calculée dès
 * l'entrée dans l'action : il s'arrête proprement (« budget atteint, reprise au prochain passage ») et
 * finalise le run AVANT que la plateforme ne coupe la fonction — jamais de run laissé « en cours ».
 */
export const WEB_SYNC_ACTION_MAX_DURATION_S = 120;
/** Marge sous la limite de la plateforme : finalisation du run, revalidation et réponse. */
export const WEB_SYNC_ACTION_MARGIN_MS = 30_000;
/** Budget du moteur pour une synchronisation lancée depuis le site (90 s). */
export const WEB_SYNC_ACTION_BUDGET_MS = WEB_SYNC_ACTION_MAX_DURATION_S * 1000 - WEB_SYNC_ACTION_MARGIN_MS;

/** Échéance absolue du moteur pour une action démarrée à `startedAt` (ms). */
export function webSyncActionDeadline(startedAt: number): number {
  return startedAt + WEB_SYNC_ACTION_BUDGET_MS;
}

/**
 * [Synchroniser maintenant] (web et mobile) : vérifie que la connexion appartient à
 * l'organisation de l'utilisateur (lecture sous RLS), puis exécute RÉELLEMENT le moteur de
 * synchronisation côté serveur (tokens eBay déchiffrés uniquement ici, jamais renvoyés).
 * `deadlineAt` : échéance absolue du run (ms) ; absente, le budget par défaut du moteur s'applique
 * (Edge Function).
 */
export async function syncConnectionNow(
  ctx: OrgContext,
  connectionId: string,
  options: { trigger: "manual" | "initial"; scope: "full" | "listings" | "orders"; deadlineAt?: number },
): Promise<SyncNowResult> {
  const { data: connection } = await ctx.supabase.from("channel_connections").select("id").eq("id", connectionId).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!connection) throw new AppError("NOT_FOUND", "Connexion introuvable dans votre organisation.");
  const result = await runChannelSync(connection.id, { trigger: options.trigger, userId: ctx.user.id, scope: options.scope, ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }) });
  const summary = formatRunSummary({ status: result.status, stats: result.stats as unknown as Record<string, number>, error_count: result.stats.errors });
  return { result, summary };
}
