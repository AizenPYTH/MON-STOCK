import "server-only";
import type { Json } from "@/db/database.types";
import type { ChannelConnection, SyncStatus, SyncTrigger } from "@/db/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { describeError, isConnectorError, RECONNECT_ACTION } from "@/integrations/core/errors";
import { getConnector } from "@/integrations/core/registry";
import { computeOrdersWindow, nextOrdersCursor } from "@/integrations/ebay/cursor";
import { connectorAuthFor, markConnectionExpired } from "@/services/channels/connection-store";
import { connectionExpiredKey, resolveAlerts, syncFailedKey, upsertAlert } from "@/services/sync/alerts";
import { chunk, sanitizeDetails, type SyncContext, type SyncErrorInput } from "@/services/sync/context";
import { syncListings } from "@/services/sync/listings";
import { syncOrders } from "@/services/sync/orders";
import { pushInventory } from "@/services/sync/inventory-push";

const log = createLogger("SYNC");

/** Un run « running » plus ancien que ce délai est considéré interrompu. */
export const RUNNING_STALE_MINUTES = 15;

export type SyncScope = "full" | "listings" | "orders";

export interface RunChannelSyncOptions {
  trigger: SyncTrigger;
  userId?: string | null;
  scope?: SyncScope;
}

export interface SyncStats {
  listings_fetched: number;
  listings_upserted: number;
  listings_ended: number;
  listings_auto_mapped: number;
  suggestions_created: number;
  orders_fetched: number;
  orders_created: number;
  orders_updated: number;
  items_unmapped: number;
  inventory_changes: number;
  inventory_pushed: number;
  errors: number;
}

export interface SyncRunResult {
  runId: string;
  status: SyncStatus;
  stats: SyncStats;
  durationMs: number;
  errorSummary: string | null;
  connectionId: string;
}

export function emptyStats(): SyncStats {
  return {
    listings_fetched: 0,
    listings_upserted: 0,
    listings_ended: 0,
    listings_auto_mapped: 0,
    suggestions_created: 0,
    orders_fetched: 0,
    orders_created: 0,
    orders_updated: 0,
    items_unmapped: 0,
    inventory_changes: 0,
    inventory_pushed: 0,
    errors: 0,
  };
}

const PROVIDER_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Ventes manuelles" };

/**
 * Exécute une synchronisation complète d'une connexion : annonces → commandes → (option) envoi des
 * quantités. Chaque run est tracé dans sync_runs ; rien n'est supposé réussi : les statistiques sont
 * les compteurs réellement traités. Lève une AppError si le run ne peut pas démarrer.
 */
export async function runChannelSync(connectionId: string, options: RunChannelSyncOptions): Promise<SyncRunResult> {
  const admin = createAdminSupabaseClient();
  const scope = options.scope ?? "full";
  const startedAt = new Date();

  const { data: connection, error: connError } = await admin.from("channel_connections").select("*").eq("id", connectionId).maybeSingle();
  if (connError) throw fromPostgrestError(connError);
  if (!connection) throw new AppError("NOT_FOUND", "Connexion introuvable.");
  const label = PROVIDER_LABEL[connection.provider] ?? connection.provider;

  if (connection.status === "disconnected") {
    throw new AppError("CONNECTION_EXPIRED", `Cette connexion ${label} a été déconnectée. Reconnectez votre compte pour synchroniser.`, { action: RECONNECT_ACTION });
  }
  if (connection.status === "expired") {
    throw new AppError("CONNECTION_EXPIRED", `Impossible de synchroniser ${label} : le token d'autorisation a expiré.`, { action: RECONNECT_ACTION });
  }
  if (connection.status === "pending") {
    throw new AppError("CONNECTION_EXPIRED", `La connexion ${label} n'a pas été finalisée. Relancez la connexion.`, { action: RECONNECT_ACTION });
  }

  await guardConcurrency(admin, connection);

  const connector = getConnector(connection.provider);
  if (!connector.available) throw new AppError("NOT_IMPLEMENTED", `Le connecteur ${label} n'est pas encore disponible.`);
  if (!connector.isConfigured()) {
    throw new AppError("NOT_CONFIGURED", `Intégration ${label} non configurée sur ce serveur : ${connector.configurationIssues().join(" ; ")}`);
  }

  const { data: run, error: runError } = await admin
    .from("sync_runs")
    .insert({ organization_id: connection.organization_id, source_kind: "channel", source_ref: connection.id, provider: connection.provider, trigger: options.trigger, status: "running", created_by: options.userId ?? null, stats: {} })
    .select("id")
    .single();
  if (runError) throw fromPostgrestError(runError);
  const runId = run.id;

  log.info(`${label} sync started`, { runId, connectionId, orgId: connection.organization_id, trigger: options.trigger, scope, username: connection.external_username });

  const stats = emptyStats();
  const errors: SyncErrorInput[] = [];
  const state: { fatal: SyncErrorInput | null; authExpired: boolean; phasesCompleted: number; newCursor: Date | null } = { fatal: null, authExpired: false, phasesCompleted: 0, newCursor: null };

  const ctx: SyncContext = {
    admin,
    connection,
    organizationId: connection.organization_id,
    salesChannelId: connection.sales_channel_id,
    connector,
    auth: connectorAuthFor(connection.id),
    log,
    recordError: (e) => {
      errors.push(e);
      log.warn("erreur de synchronisation", { runId, code: e.code, entity: e.entityRef ?? null, message: e.message });
    },
  };

  const runPhase = async (name: string, fn: () => Promise<void>): Promise<boolean> => {
    if (state.fatal) return false;
    try {
      await fn();
      state.phasesCompleted++;
      return true;
    } catch (e) {
      const d = describeError(e);
      const entry: SyncErrorInput = { code: d.code, message: d.message, entityType: "phase", entityRef: name, details: d.details };
      errors.push(entry);
      if (isConnectorError(e) && (e.code === "AUTH_EXPIRED" || e.code === "NOT_CONFIGURED" || e.code === "NOT_IMPLEMENTED")) {
        state.fatal = entry;
        state.authExpired = e.code === "AUTH_EXPIRED";
      } else if (!isConnectorError(e) && !(e instanceof AppError)) {
        // Erreur inattendue (bug, base de données) : on arrête le run plutôt que de continuer à l'aveugle.
        state.fatal = entry;
      }
      log.error(`phase ${name} échouée`, { runId, code: d.code, message: d.message, fatal: state.fatal !== null });
      return false;
    }
  };

  if (scope === "full" || scope === "listings") {
    await runPhase("listings", async () => {
      const r = await syncListings(ctx);
      stats.listings_fetched = r.fetched;
      stats.listings_upserted = r.upserted;
      stats.listings_ended = r.ended;
      stats.listings_auto_mapped = r.autoMapped;
      stats.suggestions_created = r.suggestionsCreated;
      log.info(`${label} listings synced`, { runId, fetched: r.fetched, upserted: r.upserted, ended: r.ended, autoMapped: r.autoMapped, suggestions: r.suggestionsCreated, invalid: r.invalid });
    });
  }

  if (scope === "full" || scope === "orders") {
    await runPhase("orders", async () => {
      const window = computeOrdersWindow(connection.last_orders_cursor, startedAt);
      log.info(`${label} orders window`, { runId, since: window.since.toISOString(), until: window.until.toISOString(), initial: window.initial });
      const r = await syncOrders(ctx, window);
      stats.orders_fetched = r.fetched;
      stats.orders_created = r.created;
      stats.orders_updated = r.updated;
      stats.items_unmapped = r.itemsUnmapped;
      stats.inventory_changes = r.movements;
      if (r.failed === 0) state.newCursor = nextOrdersCursor(window, r.maxModifiedSeen, { truncated: r.truncated });
      else if (r.maxModifiedSeen) state.newCursor = r.maxModifiedSeen;
      log.info(`${label} orders synced`, { runId, fetched: r.fetched, created: r.created, updated: r.updated, itemsUnmapped: r.itemsUnmapped, movements: r.movements, failed: r.failed, invalid: r.invalid, truncated: r.truncated });
    });
  }

  if (scope === "full" && connection.push_inventory) {
    await runPhase("inventory_push", async () => {
      const r = await pushInventory(ctx);
      stats.inventory_pushed = r.pushed;
      log.info(`${label} inventory pushed`, { runId, checked: r.checked, changed: r.changed, pushed: r.pushed, failed: r.failed });
    });
  }

  stats.errors = errors.length;
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const status: SyncStatus = state.fatal || state.phasesCompleted === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
  const errorSummary = errors.length === 0 ? null : `${errors[0]?.message ?? "Erreur"}${errors.length > 1 ? ` (+${errors.length - 1} autre(s))` : ""}`;

  // Persistance des erreurs (jamais de secret dans details).
  for (const part of chunk(errors, 200)) {
    const { error } = await admin.from("sync_errors").insert(
      part.map((e) => ({
        organization_id: connection.organization_id,
        sync_run_id: runId,
        code: e.code,
        message: e.message.slice(0, 2000),
        entity_type: e.entityType ?? null,
        entity_ref: e.entityRef ?? null,
        details: sanitizeDetails(e.details) as NonNullable<Json>,
      })),
    );
    if (error) log.error("impossible d'enregistrer les erreurs de sync", { runId, error: error.message });
  }

  const { error: finishError } = await admin
    .from("sync_runs")
    .update({
      status,
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      records_processed: stats.listings_fetched + stats.orders_fetched,
      error_count: errors.length,
      error_summary: errorSummary,
      stats: stats as unknown as NonNullable<Json>,
    })
    .eq("id", runId);
  if (finishError) log.error("impossible de finaliser le run", { runId, error: finishError.message });

  // État de la connexion + alertes.
  const connectionPatch: Partial<ChannelConnection> = { last_sync_at: finishedAt.toISOString(), last_error: errorSummary };
  if (status === "success") {
    connectionPatch.last_successful_sync_at = finishedAt.toISOString();
    connectionPatch.status = "connected";
  } else if (status === "partial") {
    connectionPatch.status = "connected";
  } else if (!state.authExpired) {
    connectionPatch.status = "error";
  }
  if (state.newCursor) connectionPatch.last_orders_cursor = state.newCursor.toISOString();
  if (state.authExpired) {
    // Le statut 'expired' et l'alerte critique ont été posés par le gestionnaire de tokens ; on s'assure qu'ils le sont.
    await markConnectionExpired(connection.id, state.fatal?.message ?? "Token d'autorisation expiré.");
    delete connectionPatch.status;
  }
  const { error: patchError } = await admin.from("channel_connections").update(connectionPatch).eq("id", connection.id);
  if (patchError) log.error("impossible de mettre à jour la connexion", { connectionId, error: patchError.message });

  if (status === "success") {
    await resolveAlerts(admin, connection.organization_id, [connectionExpiredKey(connection.id), syncFailedKey(connection.id)]);
  } else if (status === "partial") {
    await resolveAlerts(admin, connection.organization_id, [connectionExpiredKey(connection.id)]);
  } else if (!state.authExpired) {
    await upsertAlert(admin, {
      organizationId: connection.organization_id,
      type: "sync_failed",
      severity: "warning",
      title: `Synchronisation ${label} échouée`,
      message: errorSummary ?? "La synchronisation a échoué sans détail.",
      dedupeKey: syncFailedKey(connection.id),
      entityType: "channel_connection",
      entityId: connection.id,
      actionHref: `/settings/sync/${runId}`,
    });
  }

  log.info(`${label} sync finished`, { runId, status, durationMs, ...stats });
  return { runId, status, stats, durationMs, errorSummary, connectionId: connection.id };
}

async function guardConcurrency(admin: ReturnType<typeof createAdminSupabaseClient>, connection: ChannelConnection): Promise<void> {
  const { data: running, error } = await admin
    .from("sync_runs")
    .select("id, started_at")
    .eq("source_ref", connection.id)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(5);
  if (error) throw fromPostgrestError(error);
  const now = Date.now();
  const staleIds: string[] = [];
  for (const r of running ?? []) {
    const ageMin = (now - new Date(r.started_at).getTime()) / 60_000;
    if (ageMin < RUNNING_STALE_MINUTES) {
      throw new AppError("CONFLICT", `Une synchronisation est déjà en cours pour cette connexion (démarrée il y a ${Math.max(1, Math.round(ageMin))} min). Patientez avant d'en relancer une.`);
    }
    staleIds.push(r.id);
  }
  if (staleIds.length > 0) {
    await admin
      .from("sync_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error_summary: `Run interrompu (aucune fin enregistrée après ${RUNNING_STALE_MINUTES} min).` })
      .in("id", staleIds);
    log.warn("runs interrompus marqués en échec", { connectionId: connection.id, count: staleIds.length });
  }
}
