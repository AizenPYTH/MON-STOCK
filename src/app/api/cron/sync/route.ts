import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { toUserMessage } from "@/lib/errors";
import { listDueConnections } from "@/services/channels/connection-store";
import { runChannelSync } from "@/services/sync/engine";

const log = createLogger("CRON");

/** Durée maximale (secondes) autorisée pour cette route sur Vercel (plan Pro/Enterprise ; 60 s en Hobby). */
export const maxDuration = 300;

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * Synchronisation planifiée : parcourt les connexions actives (auto_sync) dont la dernière
 * synchronisation est plus ancienne que leur intervalle, et les exécute séquentiellement.
 * Protégée par `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron l'envoie automatiquement).
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET n'est pas configuré sur ce serveur (au moins 16 caractères) : la synchronisation planifiée est désactivée." }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

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
    try {
      const r = await runChannelSync(connection.id, { trigger: "scheduled" });
      results.push({ connectionId: connection.id, provider: connection.provider, runId: r.runId, status: r.status, durationMs: r.durationMs, stats: r.stats, errorSummary: r.errorSummary });
    } catch (e) {
      results.push({ connectionId: connection.id, provider: connection.provider, status: "skipped", error: toUserMessage(e) });
    }
  }
  const summary = { ok: true, due: due.length, synced: results.filter((r) => r.runId).length, durationMs: Date.now() - startedAt, results };
  log.info("cron terminé", { due: due.length, synced: summary.synced, durationMs: summary.durationMs });
  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
