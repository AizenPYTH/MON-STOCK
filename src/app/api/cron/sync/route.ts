import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { authorizeCron } from "@/lib/cron-auth";
import { toUserMessage } from "@/lib/errors";
import { runSyncCron, WEB_CRON_SYNC_BUDGET_MS } from "@/services/sync/cron";
import { legacyWebRouteDisabled } from "@/lib/legacy-web-routes";

const log = createLogger("CRON");

/** Durée maximale (secondes) autorisée pour cette route sur Vercel (plan Pro/Enterprise ; 60 s en Hobby). */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Synchronisation planifiée : même service que l'Edge Function (src/services/sync/cron.ts) —
 * nettoyage des runs abandonnés, reprise des notifications eBay abandonnées, puis connexions dues
 * dans un budget de temps partagé (chaque run s'arrête proprement à l'échéance et reprend au passage
 * suivant). Protégée par `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron l'envoie automatiquement).
 * W-18 : doublon de l'Edge, désactivée (404) sauf MONSTOCK_WEB_LEGACY_ROUTES=1 (src/lib/legacy-web-routes.ts).
 */
async function handle(request: NextRequest): Promise<Response> {
  const disabled = legacyWebRouteDisabled();
  if (disabled) return disabled;
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await runSyncCron({ budgetMs: WEB_CRON_SYNC_BUDGET_MS }));
  } catch (e) {
    log.error("cron de synchronisation impossible", { message: toUserMessage(e) });
    return NextResponse.json({ ok: false, error: toUserMessage(e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
