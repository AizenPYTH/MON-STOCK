import type { NextRequest } from "next/server";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { relayAdvisorChat } from "@/features/advisor/relay";
import { publicEnv } from "@/lib/env";

/** Le tour du conseiller est borné à 100 s côté Edge : marge pour l'établissement du flux. */
export const maxDuration = 150;

/**
 * Conseiller IA (web) : relaie le flux NDJSON de l'Edge Function au navigateur, sans tampon.
 * Authentification ici (session + organisation active), jamais dans le navigateur.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL;
  return relayAdvisorChat(request, {
    getContext: () => requireOrgContextForAction(),
    allowedOrigins: [request.nextUrl.origin, ...(appUrl ? [appUrl] : [])],
  });
}
