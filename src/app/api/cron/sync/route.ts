import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { authorizeCron } from "@/lib/cron-auth";
import { toUserMessage } from "@/lib/errors";
import { listDueConnections } from "@/services/channels/connection-store";
import { runChannelSync } from "@/services/sync/engine";

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

  const results: Array<Record<string, unknown>> = [];
  for (const connection of due) {
    if (Date.now() - startedAt > START_BUDGET_MS) {
      results.push({ connectionId: connection.id, provider: connection.provider, status: "deferred", error: "Reporté au prochain passage du cron (budget de temps atteint)." });
      continue;
    }
    try {
      const r = await runChannelSync(connection.id, { trigger: "scheduled" });
      results.push({ connectionId: connection.id, provider: connection.provider, runId: r.runId, status: r.status, durationMs: r.durationMs, stats: r.stats, errorSummary: r.errorSummary });
    } catch (e) {
      results.push({ connectionId: connection.id, provider: connection.provider, status: "skipped", error: toUserMessage(e) });
    }
  }
  const summary = { ok: true, due: due.length, synced: results.filter((r) => r.runId).length, deferred: results.filter((r) => r.status === "deferred").length, durationMs: Date.now() - startedAt, results };
  log.info("cron terminé", { due: due.length, synced: summary.synced, durationMs: summary.durationMs });
  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
