import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { sha256Hex } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { toUserMessage } from "@/lib/errors";
import { getEbayConnector } from "@/integrations/core/registry";
import { getApplicationAccessToken } from "@/integrations/ebay/oauth";
import { fetchWithRetry, readJson } from "@/integrations/core/http";
import {
  computeChallengeResponse,
  ebayNotificationSchema,
  ebayPublicKeySchema,
  notificationEventId,
  parseSignatureHeader,
  verifyNotificationSignature,
  type EbayPublicKey,
} from "@/integrations/ebay/webhook-verify";
import { findConnectionsByExternalAccount } from "@/services/channels/connection-store";
import { runChannelSync } from "@/services/sync/engine";
import { upsertAlert } from "@/services/sync/alerts";

const log = createLogger("EBAY_WEBHOOK");
const WEBHOOK_PATH = "/api/webhooks/ebay";

/** Cache mémoire des clés publiques eBay (par kid) et du token d'application. */
const publicKeyCache = new Map<string, { key: EbayPublicKey; fetchedAt: number }>();
const PUBLIC_KEY_TTL_MS = 12 * 3_600_000;
let appToken: { accessToken: string; expiresAt: number } | null = null;

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
  const token = process.env.EBAY_WEBHOOK_VERIFICATION_TOKEN;
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "EBAY_WEBHOOK_VERIFICATION_TOKEN n'est pas configuré (32 à 80 caractères) : impossible de valider l'endpoint eBay." }, { status: 503 });
  }
  const challengeResponse = computeChallengeResponse(challenge, token, endpointUrl());
  log.info("challenge eBay validé", { endpoint: endpointUrl() });
  return NextResponse.json({ challengeResponse }, { headers: { "Content-Type": "application/json" } });
}

async function getAppToken(): Promise<string> {
  const config = getEbayConnector().config();
  if (!config) throw new Error("Intégration eBay non configurée : impossible d'obtenir un token d'application.");
  if (appToken && appToken.expiresAt - Date.now() > 60_000) return appToken.accessToken;
  const t = await getApplicationAccessToken(config);
  appToken = { accessToken: t.accessToken, expiresAt: t.expiresAt.getTime() };
  return t.accessToken;
}

async function getPublicKey(kid: string): Promise<EbayPublicKey> {
  const cached = publicKeyCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < PUBLIC_KEY_TTL_MS) return cached.key;
  const config = getEbayConnector().config();
  if (!config) throw new Error("Intégration eBay non configurée.");
  const token = await getAppToken();
  const res = await fetchWithRetry(
    `${config.apiBase}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    { provider: "ebay", label: "notification:public_key", retries: 2 },
  );
  const json = await readJson(res);
  const parsed = ebayPublicKeySchema.safeParse(json);
  if (!res.ok || !parsed.success) throw new Error(`Clé publique eBay introuvable pour kid=${kid} (HTTP ${res.status}).`);
  publicKeyCache.set(kid, { key: parsed.data, fetchedAt: Date.now() });
  return parsed.data;
}

/**
 * POST : notification signée. Vérifie la signature ECDSA (clé publique eBay), déduplique sur
 * (provider, event_id), traite MARKETPLACE_ACCOUNT_DELETION (anonymisation) et déclenche une
 * synchronisation pour les sujets liés aux commandes/annonces d'une connexion identifiée.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const payloadHash = sha256Hex(rawBody);
  const admin = createAdminSupabaseClient();

  if (!getEbayConnector().isConfigured()) {
    return NextResponse.json({ error: "Intégration eBay non configurée sur ce serveur : signature invérifiable." }, { status: 503 });
  }

  let parsedBody: unknown = null;
  try {
    parsedBody = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const notification = ebayNotificationSchema.safeParse(parsedBody);
  if (!notification.success) {
    return NextResponse.json({ error: "Notification eBay au format inattendu." }, { status: 400 });
  }
  const topic = notification.data.metadata.topic;
  const eventId = notificationEventId(notification.data, payloadHash);

  const header = parseSignatureHeader(request.headers.get("x-ebay-signature"));
  let signatureValid = false;
  let signatureError: string | null = null;
  if (!header) {
    signatureError = "En-tête x-ebay-signature absent ou illisible.";
  } else {
    try {
      const key = await getPublicKey(header.kid);
      signatureValid = verifyNotificationSignature(rawBody, header, key);
      if (!signatureValid) signatureError = "Signature invalide.";
    } catch (e) {
      signatureError = toUserMessage(e);
    }
  }

  const data = notification.data.notification.data ?? {};
  const username = typeof data.username === "string" ? data.username : null;
  const userId = typeof data.userId === "string" ? data.userId : null;
  const connections = signatureValid ? await findConnectionsByExternalAccount("ebay", { userId, username }).catch(() => []) : [];
  const primary = connections[0] ?? null;

  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      provider: "ebay",
      event_id: eventId,
      event_type: topic,
      organization_id: primary?.organization_id ?? null,
      connection_id: primary?.id ?? null,
      payload_hash: payloadHash,
      payload: signatureValid ? (parsedBody as never) : null,
      signature_valid: signatureValid,
      status: signatureValid ? "received" : "failed",
      error: signatureError,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      log.info("notification dupliquée ignorée", { eventId, topic });
      return NextResponse.json({ status: "duplicate" }, { status: signatureValid ? 200 : 401 });
    }
    log.error("impossible d'enregistrer la notification", { eventId, error: insertError.message });
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
  if (!signatureValid) {
    log.warn("notification eBay rejetée", { eventId, topic, reason: signatureError });
    return NextResponse.json({ status: "rejected", error: signatureError }, { status: 401 });
  }
  const eventRowId = inserted?.id ?? null;

  if (topic === "MARKETPLACE_ACCOUNT_DELETION") {
    const result = await handleAccountDeletion(admin, { username, userId }, connections);
    if (eventRowId) await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", eventRowId);
    log.info("demande de suppression de compte eBay traitée", { eventId, ...result });
    return NextResponse.json({ status: "processed", topic, ...result });
  }

  if (primary && /ORDER|ITEM|LISTING|OFFER|INVENTORY/i.test(topic)) {
    // Réponse immédiate à eBay ; la synchronisation s'exécute après l'envoi de la réponse.
    after(async () => {
      try {
        const r = await runChannelSync(primary.id, { trigger: "webhook" });
        if (eventRowId) await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", eventRowId);
        log.info("synchronisation déclenchée par webhook", { eventId, runId: r.runId, status: r.status });
      } catch (e) {
        if (eventRowId) await admin.from("webhook_events").update({ status: "failed", processed_at: new Date().toISOString(), error: toUserMessage(e) }).eq("id", eventRowId);
        log.warn("synchronisation par webhook impossible", { eventId, message: toUserMessage(e) });
      }
    });
    return NextResponse.json({ status: "accepted", topic });
  }

  if (eventRowId) await admin.from("webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", eventRowId);
  return NextResponse.json({ status: "ignored", topic });
}

/**
 * Obligation eBay : à la suppression d'un compte eBay (vendeur OU acheteur), effacer les données
 * personnelles détenues. Ici : pseudo acheteur dans les commandes, et si c'est un compte vendeur
 * connecté : suppression des tokens, déconnexion et anonymisation du compte.
 */
async function handleAccountDeletion(admin: ReturnType<typeof createAdminSupabaseClient>, account: { username: string | null; userId: string | null }, connections: Array<{ id: string; organization_id: string; external_username: string | null }>) {
  let ordersAnonymized = 0;
  if (account.username) {
    const { data } = await admin.from("orders").update({ buyer_username: "[compte eBay supprimé]" }).eq("provider", "ebay").eq("buyer_username", account.username).select("id");
    ordersAnonymized = data?.length ?? 0;
  }
  for (const c of connections) {
    await admin.from("channel_connection_secrets").delete().eq("connection_id", c.id);
    await admin
      .from("channel_connections")
      .update({ status: "disconnected", disconnected_at: new Date().toISOString(), external_username: "[compte eBay supprimé]", external_account_id: null, token_expires_at: null, refresh_token_expires_at: null, last_error: "Compte eBay supprimé par son titulaire (notification eBay)." })
      .eq("id", c.id);
    await upsertAlert(admin, {
      organizationId: c.organization_id,
      type: "connection_expired",
      severity: "critical",
      title: "Compte eBay supprimé",
      message: `eBay nous a notifié la suppression du compte vendeur ${c.external_username ?? ""}. La connexion a été fermée et ses tokens supprimés. Les annonces et commandes déjà importées sont conservées ; connectez un autre compte eBay pour reprendre la synchronisation.`,
      dedupeKey: `connection_expired:${c.id}`,
      entityType: "channel_connection",
      entityId: c.id,
      actionHref: "/settings/integrations",
    });
  }
  return { ordersAnonymized, connectionsDisconnected: connections.length };
}
