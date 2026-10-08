import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { getEbayConnector } from "@/integrations/core/registry";
import { computeChallengeResponse } from "@/integrations/ebay/webhook-verify";
import { EbayNotificationKeyStore } from "@/integrations/ebay/notification-keys";
import { findConnectionsByExternalAccount } from "@/services/channels/connection-store";
import { runChannelSync } from "@/services/sync/engine";
import { handleEbayNotification } from "@/services/sync/ebay-webhook";

const log = createLogger("EBAY_WEBHOOK");
const WEBHOOK_PATH = "/api/webhooks/ebay";

/** Cache mémoire (par instance) des clés publiques eBay et du token d'application. */
const keyStore = new EbayNotificationKeyStore(() => getEbayConnector().config());

function endpointUrl(): string {
  return `${publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${WEBHOOK_PATH}`;
}

/**
 * GET ?challenge_code=… : validation de l'endpoint par eBay (Marketplace Account Deletion).
 * Réponse attendue : { challengeResponse: sha256(challengeCode + verificationToken + endpointUrl) }.
 */
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("challenge_code");
  if (!challenge) {
    return NextResponse.json({ ok: true, endpoint: WEBHOOK_PATH, usage: "eBay envoie GET ?challenge_code=… pour valider l'endpoint, puis des POST signés." });
  }
  const token = getEbayConnector().config()?.webhookVerificationToken ?? null;
  if (!token) {
    return NextResponse.json({ error: "EBAY_WEBHOOK_VERIFICATION_TOKEN n'est pas configuré (32 à 80 caractères) ou l'intégration eBay est incomplète : impossible de valider l'endpoint eBay." }, { status: 503 });
  }
  const challengeResponse = computeChallengeResponse(challenge, token, endpointUrl());
  log.info("challenge eBay validé", { endpoint: endpointUrl() });
  return NextResponse.json({ challengeResponse }, { headers: { "Content-Type": "application/json" } });
}

/**
 * POST : notification signée. Toute la logique (taille, signature, déduplication, suppression de
 * compte, synchronisation) est dans services/sync/ebay-webhook.ts (testée unitairement).
 */
export async function POST(request: NextRequest) {
  return handleEbayNotification(request, {
    admin: createAdminSupabaseClient(),
    isConfigured: () => getEbayConnector().isConfigured(),
    getPublicKey: (kid) => keyStore.getPublicKey(kid),
    findConnections: (account) => findConnectionsByExternalAccount("ebay", account),
    runSync: (connectionId, options) => runChannelSync(connectionId, options),
    schedule: (task) => after(task),
  });
}
