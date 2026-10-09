import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { authorizeCron } from "@/lib/cron-auth";
import { toUserMessage } from "@/lib/errors";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { findConnectionsByExternalAccount, listDueConnections } from "@/services/channels/connection-store";
import { runChannelSync, type SyncScope } from "@/services/sync/engine";
import { recoverAbandonedWebhookEvents } from "@/services/sync/ebay-webhook";

const log = createLogger("CRON");

/** Durée maximale (secondes) autorisée pour cette route sur Vercel (plan Pro/Enterprise ; 60 s en Hobby). */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Aucun nouveau run n'est démarré au-delà de ce délai : un run coupé par la limite de la plateforme
 * resterait « en cours » 15 min et bloquerait la connexion. Les connexions restantes sont reprises
 * au passage suivant du cron (elles restent « dues »).
 */
const START_BUDGET_MS = 200_000;

/**
 * Synchronisation planifiée : parcourt les connexions actives (auto_sync) dont la dernière
 * synchronisation est plus ancienne que leur intervalle, et les exécute séquentiellement.
 * Protégée par `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron l'envoie automatiquement).
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;

  const startedAt = Date.now();
  let due;
  try {
    due = await listDueConnections();
  } catch (e) {
    log.error("impossible de lister les connexions à synchroniser", { message: toUserMessage(e) });
    return NextResponse.json({ ok: false, error: toUserMessage(e) }, { status: 500 });
  }

  // Notifications eBay dont le traitement a été interrompu (restées « received ») : marquées « failed »
  // et leurs connexions synchronisées ici (eBay a déjà reçu 2xx et ne redélivrera pas).
  type Job = { id: string; provider: string; trigger: "scheduled" | "webhook"; scope?: SyncScope };
  const recoveryJobs: Job[] = [];
  let webhookRecovered = 0;
  try {
    const recovery = await recoverAbandonedWebhookEvents(createAdminSupabaseClient(), { findConnections: (account) => findConnectionsByExternalAccount("ebay", account) });
    webhookRecovered = recovery.recovered;
    const dueIds = new Set(due.map((c) => c.id));
    for (const c of recovery.connections) {
      // Une connexion déjà due reçoit de toute façon une synchronisation complète.
      if (!dueIds.has(c.id)) recoveryJobs.push({ id: c.id, provider: "ebay", trigger: "webhook", scope: c.scope });
    }
    if (recovery.recovered > 0) log.warn("notifications eBay abandonnées reprises", { recovered: recovery.recovered, connections: recovery.connections.length });
  } catch (e) {
    log.error("reprise des notifications eBay abandonnées impossible", { message: toUserMessage(e) });
  }

  // Rattrapages d'abord (peu nombreux, la notification ne sera plus redélivrée) ; les connexions dues
  // reportées par le budget restent dues au passage suivant.
  const jobs: Job[] = [...recoveryJobs, ...due.map((c) => ({ id: c.id, provider: c.provider, trigger: "scheduled" as const }))];
  const results: Array<Record<string, unknown>> = [];
  for (const connection of jobs) {
    if (Date.now() - startedAt > START_BUDGET_MS) {
      results.push({ connectionId: connection.id, provider: connection.provider, status: "deferred", error: "Reporté au prochain passage du cron (budget de temps atteint)." });
      continue;
    }
    try {
      const r = await runChannelSync(connection.id, connection.scope ? { trigger: connection.trigger, scope: connection.scope } : { trigger: connection.trigger });
      results.push({ connectionId: connection.id, provider: connection.provider, runId: r.runId, status: r.status, durationMs: r.durationMs, stats: r.stats, errorSummary: r.errorSummary });
    } catch (e) {
      results.push({ connectionId: connection.id, provider: connection.provider, status: "skipped", error: toUserMessage(e) });
    }
  }
  const summary = { ok: true, due: due.length, webhookRecovered, synced: results.filter((r) => r.runId).length, deferred: results.filter((r) => r.status === "deferred").length, durationMs: Date.now() - startedAt, results };
  log.info("cron terminé", { due: due.length, synced: summary.synced, durationMs: summary.durationMs });
  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
