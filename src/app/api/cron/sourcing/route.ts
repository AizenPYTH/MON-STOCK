import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runSourcingSync } from "@/services/sourcing/sync";
import { legacyWebRouteDisabled } from "@/lib/legacy-web-routes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron du moteur de sourcing : `Authorization: Bearer ${CRON_SECRET}`.
 * 503 si le secret n'est pas configuré, 401 si l'en-tête ne correspond pas.
 * W-18 : doublon de l'Edge, désactivée (404) sauf MONSTOCK_WEB_LEGACY_ROUTES=1 (src/lib/legacy-web-routes.ts).
 */
async function handle(request: Request): Promise<Response> {
  const disabled = legacyWebRouteDisabled();
  if (disabled) return disabled;
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;
  try {
    const summary = await runSourcingSync();
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
