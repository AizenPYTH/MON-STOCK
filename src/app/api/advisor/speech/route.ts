import type { NextRequest } from "next/server";
import { requireOrgContextForAction } from "@/features/auth/dal";
import { relayAdvisorSpeech } from "@/features/advisor/relay";

export const maxDuration = 60;

/** Voix du conseiller (web) : relaie l'audio de l'Edge Function (même voix que l'iPhone). */
export async function GET(request: NextRequest): Promise<Response> {
  return relayAdvisorSpeech(request, { getContext: () => requireOrgContextForAction() });
}
