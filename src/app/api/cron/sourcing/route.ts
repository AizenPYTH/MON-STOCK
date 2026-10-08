import { NextResponse } from "next/server";
import { serverEnv, EnvError } from "@/lib/env";
import { runSourcingSync } from "@/services/sourcing/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron du moteur de sourcing : `Authorization: Bearer ${CRON_SECRET}`.
 * 503 si le secret n'est pas configuré, 401 si l'en-tête ne correspond pas.
 */
async function handle(request: Request): Promise<Response> {
  let secret: string | undefined;
  try {
    secret = serverEnv().CRON_SECRET;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof EnvError ? e.message : "Configuration serveur invalide." }, { status: 503 });
  }
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET n'est pas configuré : le cron de sourcing est désactivé. Ajoutez CRON_SECRET (voir .env.example)." }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Non autorisé : en-tête Authorization Bearer invalide." }, { status: 401 });
  }
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
