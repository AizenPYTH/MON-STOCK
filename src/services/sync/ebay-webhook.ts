import "server-only";
import type { Json } from "@/db/database.types";
import type { ChannelConnection } from "@/db/types";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/crypto";
import { AppError, toUserMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { ebayNotificationSchema, notificationEventId, parseSignatureHeader, verifyNotificationSignature, type EbayNotification, type EbayPublicKey } from "@/integrations/ebay/webhook-verify";
import { PublicKeyNotFoundError } from "@/integrations/ebay/notification-keys";
import { connectionExpiredKey, upsertAlert } from "@/services/sync/alerts";
import { sanitizeMessage } from "@/services/sync/context";
import type { RunChannelSyncOptions, SyncRunResult } from "@/services/sync/engine";

const log = createLogger("EBAY_WEBHOOK");

/** Taille maximale acceptée d'une notification (les notifications eBay font quelques Ko). */
export const WEBHOOK_MAX_BODY_BYTES = 64 * 1024;
/** Une ligne « received » plus ancienne est considérée abandonnée (traitement interrompu) et peut être reprise. */
export const WEBHOOK_STALE_RECEIVED_MS = 5 * 60_000;
/** Synchronisation déjà en cours : nombre de nouvelles tentatives et délai entre elles. */
export const WEBHOOK_CONFLICT_RETRIES = 3;
export const WEBHOOK_CONFLICT_WAIT_MS = 15_000;

export const DELETED_ACCOUNT_LABEL = "[compte eBay supprimé]";

export interface EbayWebhookDeps {
  admin: AdminSupabaseClient;
  isConfigured: () => boolean;
  getPublicKey: (kid: string) => Promise<EbayPublicKey>;
  findConnections: (account: { userId: string | null; username: string | null }) => Promise<ChannelConnection[]>;
  runSync: (connectionId: string, options: RunChannelSyncOptions) => Promise<SyncRunResult>;
  /** Exécute une tâche après l'envoi de la réponse (next/server `after`). */
  schedule: (task: () => Promise<void>) => void;
  sleep?: (ms: number) => Promise<void>;
  conflictWaitMs?: number;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

/** Lit le corps brut en refusant tout dépassement de `limit` (Content-Length annoncé ou flux réel). */
export async function readBodyLimited(request: Request, limit: number): Promise<Buffer | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Copie de la notification sans donnée personnelle (pour MARKETPLACE_ACCOUNT_DELETION). */
function redactedDeletionPayload(n: EbayNotification): Json {
  return {
    metadata: n.metadata,
    notification: { notificationId: n.notification.notificationId ?? null, eventDate: n.notification.eventDate ?? null, publishDate: n.notification.publishDate ?? null, data: { redacted: true } },
  } as Json;
}

async function markEvent(admin: AdminSupabaseClient, id: string, patch: { status: "processed" | "ignored" | "failed" | "received"; error?: string | null; payload?: Json | null }) {
  const { error } = await admin
    .from("webhook_events")
    .update({ status: patch.status, processed_at: patch.status === "received" ? null : new Date().toISOString(), error: patch.error ? sanitizeMessage(patch.error, 1000) : null, ...(patch.payload !== undefined ? { payload: patch.payload } : {}) })
    .eq("id", id);
  if (error) log.error("mise à jour de la notification impossible", { eventRowId: id, error: error.message });
}

/**
 * Reprend un événement déjà enregistré lorsque son traitement précédent a échoué (eBay
 * redélivre après une réponse 5xx) ou a été interrompu. Mise à jour conditionnelle :
 * une seule livraison concurrente obtient le droit de retraiter.
 */
async function claimForRetry(admin: AdminSupabaseClient, eventId: string): Promise<string | null> {
  const { data: failed } = await admin.from("webhook_events").update({ status: "received", error: null, processed_at: null }).eq("provider", "ebay").eq("event_id", eventId).eq("status", "failed").select("id").maybeSingle();
  if (failed) return failed.id;
  const cutoff = new Date(Date.now() - WEBHOOK_STALE_RECEIVED_MS).toISOString();
  const { data: stale } = await admin
    .from("webhook_events")
    .update({ status: "received", error: null, received_at: new Date().toISOString() })
    .eq("provider", "ebay")
    .eq("event_id", eventId)
    .eq("status", "received")
    .lt("received_at", cutoff)
    .select("id")
    .maybeSingle();
  return stale?.id ?? null;
}

/**
 * POST /api/webhooks/ebay : notification signée.
 *  1. corps borné (413), intégration configurée (503), JSON + schéma (400) ;
 *  2. signature ECDSA (clé publique eBay) : absente / invalide / kid inconnu → 401 (journalisée
 *     sous un identifiant distinct, l'identifiant réel reste disponible) ; vérification
 *     impossible (panne eBay) → 503 sans consommer l'identifiant (eBay redélivrera) ;
 *  3. déduplication sur (provider, event_id) : doublon → 200 « duplicate », sauf si le
 *     traitement précédent a échoué (il est alors repris) ;
 *  4. MARKETPLACE_ACCOUNT_DELETION : anonymisation + déconnexion, 500 si une écriture échoue
 *     (eBay redélivre, l'événement est repris) ;
 *  5. sujets commandes / annonces : synchronisation de chaque connexion active du compte, après la réponse.
 */
export async function handleEbayNotification(request: Request, deps: EbayWebhookDeps): Promise<Response> {
  const { admin } = deps;
  const raw = await readBodyLimited(request, WEBHOOK_MAX_BODY_BYTES);
  if (raw === null) {
    log.warn("notification refusée : corps trop volumineux", { limit: WEBHOOK_MAX_BODY_BYTES });
    return json({ error: `Notification trop volumineuse (limite ${Math.round(WEBHOOK_MAX_BODY_BYTES / 1024)} Ko).` }, 413);
  }
  if (!deps.isConfigured()) {
    return json({ error: "Intégration eBay non configurée sur ce serveur : signature invérifiable." }, 503);
  }
  const payloadHash = sha256Hex(raw);

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }
  const notification = ebayNotificationSchema.safeParse(parsedBody);
  if (!notification.success) return json({ error: "Notification eBay au format inattendu." }, 400);
  const topic = notification.data.metadata.topic;
  const eventId = notificationEventId(notification.data, payloadHash);
  const isDeletion = topic === "MARKETPLACE_ACCOUNT_DELETION";

  // --- Signature ---------------------------------------------------------------------------
  const header = parseSignatureHeader(request.headers.get("x-ebay-signature"));
  let signatureValid = false;
  let signatureError: string | null = null;
  if (!header) {
    signatureError = "En-tête x-ebay-signature absent ou illisible.";
  } else {
    try {
      const key = await deps.getPublicKey(header.kid);
      signatureValid = verifyNotificationSignature(raw, header, key);
      if (!signatureValid) signatureError = "Signature invalide.";
    } catch (e) {
      if (e instanceof PublicKeyNotFoundError) {
        signatureError = "Clé de signature inconnue d'eBay (kid).";
      } else {
        log.warn("vérification de signature impossible, nouvelle tentative attendue", { eventId, topic, reason: toUserMessage(e) });
        return json({ status: "retry", error: "Vérification de signature temporairement impossible : réessayez plus tard." }, 503);
      }
    }
  }

  if (!signatureValid) {
    // Journalisé sous un identifiant distinct : l'identifiant réel reste disponible pour une livraison valide.
    const { error } = await admin.from("webhook_events").insert({
      provider: "ebay",
      event_id: `rejected:${payloadHash.slice(0, 32)}`,
      event_type: topic.slice(0, 200),
      payload_hash: payloadHash,
      payload: null,
      signature_valid: false,
      status: "failed",
      error: signatureError,
    });
    if (error && error.code !== "23505") log.error("impossible de journaliser la notification rejetée", { error: error.message });
    log.warn("notification eBay rejetée", { topic, reason: signatureError, duplicate: error?.code === "23505" });
    return json({ status: error?.code === "23505" ? "duplicate" : "rejected", error: signatureError }, 401);
  }

  // --- Connexions concernées -----------------------------------------------------------------
  const data = notification.data.notification.data ?? {};
  const username = typeof data.username === "string" && data.username ? data.username : null;
  const userId = typeof data.userId === "string" && data.userId ? data.userId : null;
  let connections: ChannelConnection[];
  try {
    connections = await deps.findConnections({ userId, username });
  } catch (e) {
    // Base indisponible : on ne consomme pas l'événement (eBay redélivrera).
    log.error("recherche des connexions impossible", { eventId, topic, reason: toUserMessage(e) });
    return json({ status: "retry", error: "Traitement temporairement impossible." }, 503);
  }
  const primary = connections[0] ?? null;

  // --- Déduplication -------------------------------------------------------------------------
  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      provider: "ebay",
      event_id: eventId,
      event_type: topic.slice(0, 200),
      organization_id: primary?.organization_id ?? null,
      connection_id: primary?.id ?? null,
      payload_hash: payloadHash,
      payload: isDeletion ? redactedDeletionPayload(notification.data) : (parsedBody as Json),
      signature_valid: true,
      status: "received",
      error: null,
    })
    .select("id")
    .maybeSingle();

  let eventRowId: string | null = inserted?.id ?? null;
  if (insertError) {
    if (insertError.code !== "23505") {
      log.error("impossible d'enregistrer la notification", { eventId, error: insertError.message });
      return json({ error: "Enregistrement impossible." }, 500);
    }
    eventRowId = await claimForRetry(admin, eventId);
    if (!eventRowId) {
      log.info("notification dupliquée ignorée", { eventId, topic });
      return json({ status: "duplicate" }, 200);
    }
    log.info("notification déjà reçue mais non traitée : reprise", { eventId, topic });
  }
  if (!eventRowId) return json({ error: "Enregistrement impossible." }, 500);

  // --- Traitement ------------------------------------------------------------------------------
  if (isDeletion) {
    try {
      const result = await handleAccountDeletion(admin, { username, userId }, connections);
      await markEvent(admin, eventRowId, { status: "processed" });
      log.info("demande de suppression de compte eBay traitée", { eventId, ...result });
      return json({ status: "processed", topic, ...result });
    } catch (e) {
      await markEvent(admin, eventRowId, { status: "failed", error: `Suppression de compte non appliquée : ${toUserMessage(e)}` });
      log.error("suppression de compte eBay non appliquée : eBay redélivrera la notification", { eventId, reason: toUserMessage(e) });
      return json({ status: "retry", error: "Traitement de la suppression impossible pour le moment." }, 500);
    }
  }

  const active = connections.filter((c) => c.status === "connected" || c.status === "error");
  if (active.length > 0 && /ORDER|ITEM|LISTING|OFFER|INVENTORY/i.test(topic)) {
    // Réponse immédiate à eBay ; la synchronisation (périmètre limité au type d'événement)
    // s'exécute après l'envoi de la réponse, pour CHAQUE connexion active de ce compte eBay.
    const scope = /ORDER/i.test(topic) ? "orders" : "listings";
    const rowId = eventRowId;
    deps.schedule(async () => {
      const failures: string[] = [];
      for (const c of active) {
        const outcome = await runWithConflictRetry(deps, c.id, scope);
        if (!outcome.ok) failures.push(outcome.message);
        else log.info("synchronisation déclenchée par webhook", { eventId, connectionId: c.id, runId: outcome.runId, status: outcome.status });
      }
      if (failures.length === 0) await markEvent(admin, rowId, { status: "processed" });
      else await markEvent(admin, rowId, { status: "failed", error: failures.join(" ; ") });
    });
    return json({ status: "accepted", topic, connections: active.length });
  }

  await markEvent(admin, eventRowId, { status: "ignored", error: connections.length === 0 ? "Aucune connexion MON STOCK pour ce compte eBay." : active.length === 0 ? "Connexion inactive (expirée ou déconnectée)." : null });
  return json({ status: "ignored", topic });
}

type SyncOutcome = { ok: true; runId: string; status: string } | { ok: false; conflict: boolean; message: string };

/**
 * Lance la synchronisation ; si une autre est déjà en cours (CONFLICT), attend qu'elle se termine
 * puis réessaie (borné). La fenêtre de commandes chevauchant le curseur, une commande non prise
 * par le run en cours est de toute façon reprise par la synchronisation suivante.
 */
async function runWithConflictRetry(deps: EbayWebhookDeps, connectionId: string, scope: "orders" | "listings"): Promise<SyncOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const wait = deps.conflictWaitMs ?? WEBHOOK_CONFLICT_WAIT_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await deps.runSync(connectionId, { trigger: "webhook", scope });
      return { ok: true, runId: r.runId, status: r.status };
    } catch (e) {
      const conflict = e instanceof AppError && e.code === "CONFLICT";
      if (conflict && attempt < WEBHOOK_CONFLICT_RETRIES) {
        await sleep(wait);
        continue;
      }
      if (conflict) {
        return {
          ok: false,
          conflict: true,
          message: "Une synchronisation était déjà en cours : cette notification sera prise en compte par la prochaine synchronisation (planifiée ou manuelle), aucune commande n'est perdue.",
        };
      }
      return { ok: false, conflict: false, message: toUserMessage(e) };
    }
  }
}

/**
 * Obligation eBay : à la suppression d'un compte eBay (vendeur OU acheteur), effacer les données
 * personnelles détenues : pseudo acheteur des commandes, notifications déjà stockées qui le
 * mentionnent, et pour un compte vendeur connecté : suppression des tokens, déconnexion,
 * anonymisation du compte et du nom du canal. Toute erreur d'écriture est levée (→ 500, eBay redélivre).
 */
export async function handleAccountDeletion(admin: AdminSupabaseClient, account: { username: string | null; userId: string | null }, connections: Array<Pick<ChannelConnection, "id" | "organization_id" | "sales_channel_id">>) {
  const fail = (step: string, message: string) => {
    throw new Error(`${step} : ${message}`);
  };
  let ordersAnonymized = 0;
  let eventsPurged = 0;
  if (account.username) {
    const { data, error } = await admin.from("orders").update({ buyer_username: DELETED_ACCOUNT_LABEL }).eq("provider", "ebay").eq("buyer_username", account.username).select("id");
    if (error) fail("anonymisation des commandes", error.message);
    ordersAnonymized = data?.length ?? 0;
    const { data: purged, error: purgeError } = await admin.from("webhook_events").update({ payload: null }).eq("provider", "ebay").eq("payload->notification->data->>username", account.username).select("id");
    if (purgeError) fail("purge des notifications", purgeError.message);
    eventsPurged += purged?.length ?? 0;
  }
  if (account.userId) {
    const { data: purged, error: purgeError } = await admin.from("webhook_events").update({ payload: null }).eq("provider", "ebay").eq("payload->notification->data->>userId", account.userId).select("id");
    if (purgeError) fail("purge des notifications", purgeError.message);
    eventsPurged += purged?.length ?? 0;
  }
  for (const c of connections) {
    const { error: secretsError } = await admin.from("channel_connection_secrets").delete().eq("connection_id", c.id);
    if (secretsError) fail("suppression des tokens", secretsError.message);
    const { error: connError } = await admin
      .from("channel_connections")
      .update({ status: "disconnected", disconnected_at: new Date().toISOString(), external_username: DELETED_ACCOUNT_LABEL, external_account_id: null, token_expires_at: null, refresh_token_expires_at: null, last_error: "Compte eBay supprimé par son titulaire (notification eBay)." })
      .eq("id", c.id);
    if (connError) fail("déconnexion", connError.message);
    const { error: channelError } = await admin.from("sales_channels").update({ name: `eBay · ${DELETED_ACCOUNT_LABEL}` }).eq("id", c.sales_channel_id);
    if (channelError) fail("anonymisation du canal", channelError.message);
    // Les alertes déjà émises pour cette connexion citaient le pseudo du vendeur.
    const { error: alertsError } = await admin
      .from("alerts")
      .update({ message: "Message anonymisé : le compte eBay concerné a été supprimé par son titulaire." })
      .eq("organization_id", c.organization_id)
      .eq("entity_type", "channel_connection")
      .eq("entity_id", c.id);
    if (alertsError) fail("anonymisation des alertes", alertsError.message);
    await upsertAlert(admin, {
      organizationId: c.organization_id,
      type: "connection_expired",
      severity: "critical",
      title: "Compte eBay supprimé",
      // Aucun pseudo dans l'alerte : la donnée personnelle ne doit pas survivre à la suppression.
      message: "eBay nous a notifié la suppression du compte vendeur connecté. La connexion a été fermée et ses tokens supprimés. Les annonces et commandes déjà importées sont conservées ; connectez un autre compte eBay pour reprendre la synchronisation.",
      dedupeKey: connectionExpiredKey(c.id),
      entityType: "channel_connection",
      entityId: c.id,
      actionHref: "/settings/integrations",
    });
  }
  return { ordersAnonymized, eventsPurged, connectionsDisconnected: connections.length };
}
