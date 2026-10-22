import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { ChannelConnection, SyncStatus, SyncTrigger } from "@/db/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { describeError, isConnectorError, RECONNECT_ACTION } from "@/integrations/core/errors";
import { isDeadlineExceeded } from "@/integrations/core/deadline";
import { getConnector } from "@/integrations/core/registry";
import { computeOrdersWindow, ORDERS_SLICE_HOURS, resolveOrdersCursor } from "@/integrations/ebay/cursor";
import { connectorAuthFor, markConnectionExpired } from "@/services/channels/connection-store";
import { connectionExpiredKey, ordersBlockedKey, resolveAlerts, syncFailedKey, upsertAlert } from "@/services/sync/alerts";
import { chunk, sanitizeDetails, sanitizeMessage, timeLeftMs, type SyncContext, type SyncErrorInput } from "@/services/sync/context";
import { emptyListingsResult, listingsPassStateSchema, syncListings, type ListingsPassState } from "@/services/sync/listings";
import { emptyOrdersResult, ORDERS_MIN_SLICE_HOURS, ORDERS_PAGE_MIN_REMAINING_MS, syncOrders, type OrdersPhaseResult, type SyncOrdersOptions } from "@/services/sync/orders";
import { pushInventory, PUSH_MIN_REMAINING_MS } from "@/services/sync/inventory-push";

const log = createLogger("SYNC");

/**
 * Un run « running » plus ancien que ce délai est considéré interrompu (processus tué par la
 * plateforme) : il est marqué « failed » et le verrou est libéré. Doit rester SUPÉRIEUR à la durée
 * maximale d'un run (budget borné par MAX_SYNC_RUN_BUDGET_MS + finalisation) et INFÉRIEUR à la
 * période du cron (15 min) : un run réellement mort est récupéré dès le passage suivant (D-01, D-07).
 */
export const RUNNING_STALE_MINUTES = 10;

/**
 * Budget de temps d'un run (échéance interne). L'Edge Function Supabase est coupée à ~150 s
 * d'horloge : 100 s laissent la marge de finalisation (erreurs, run, connexion) et d'un dernier
 * appel réseau borné par le temps restant. Configurable : option `budgetMs` / `deadlineAt`, ou
 * variable d'environnement SYNC_RUN_BUDGET_MS (bornée).
 */
export const DEFAULT_SYNC_RUN_BUDGET_MS = 100_000;
export const MIN_SYNC_RUN_BUDGET_MS = 5_000;
export const MAX_SYNC_RUN_BUDGET_MS = 8 * 60_000;
/** Part maximale du budget accordée aux annonces dans un run complet : les ventes restent prioritaires. */
export const LISTINGS_BUDGET_SHARE = 0.5;

export const BUDGET_REACHED_CODE = "SYNC_BUDGET_REACHED";
export const BUDGET_REACHED_MESSAGE = "Budget de temps atteint, reprise au prochain passage : la synchronisation s'est arrêtée proprement après la dernière étape confirmée (aucune donnée perdue).";

export function syncRunBudgetMs(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.SYNC_RUN_BUDGET_MS ?? "");
  const value = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SYNC_RUN_BUDGET_MS;
  return Math.min(MAX_SYNC_RUN_BUDGET_MS, Math.max(MIN_SYNC_RUN_BUDGET_MS, Math.trunc(value)));
}

export type SyncScope = "full" | "listings" | "orders";

export interface RunChannelSyncOptions {
  trigger: SyncTrigger;
  userId?: string | null;
  scope?: SyncScope;
  /** Réglages de l'import des commandes (tests, CLI). */
  orders?: SyncOrdersOptions;
  /** Réglages du parcours des annonces (tests, CLI). */
  listings?: { maxPagesPerRun?: number };
  /** Budget de temps du run (ms) ; défaut : syncRunBudgetMs(). Ignoré si `deadlineAt` est fourni. */
  budgetMs?: number;
  /** Échéance absolue (ms depuis l'époque, même horloge que `clock`) : cron et webhook partagent la leur. */
  deadlineAt?: number;
  /** Horloge métier et d'échéance (ms), injectable (tests déterministes) ; Date.now par défaut. */
  clock?: () => number;
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
  /** true si le run s'est arrêté à son échéance interne (« partial », reprise au passage suivant). */
  stoppedByBudget: boolean;
}

/** Progression reprenable enregistrée dans channel_connections.sync_state. */
const syncStateSchema = z
  .object({
    listingsPass: listingsPassStateSchema.nullable().optional(),
    ordersSliceHours: z.number().int().min(1).max(ORDERS_SLICE_HOURS).optional(),
  })
  .strip();
type SyncState = z.infer<typeof syncStateSchema>;

function readSyncState(raw: unknown): SyncState {
  const parsed = syncStateSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    log.warn("progression de synchronisation illisible : reprise depuis le début", { issues: parsed.error.issues.map((i) => i.path.join(".")) });
    return {};
  }
  return parsed.data;
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
 * Exécute une synchronisation d'une connexion : annonces → commandes → (option) envoi des quantités,
 * dans un BUDGET DE TEMPS borné (échéance interne, D-01 / S-05 / I-03). Chaque run est tracé dans
 * sync_runs ; rien n'est supposé réussi : les statistiques sont les compteurs réellement traités.
 *
 * Reprise : la progression est enregistrée durablement après chaque étape CONFIRMÉE (page d'annonces
 * écrite, tranche de commandes lue et ingérée en entier → curseur). À l'échéance, le run se termine
 * proprement en « partial » (« budget atteint, reprise au prochain passage ») et libère le verrou ;
 * le passage suivant repart du dernier point confirmé. last_sync_at n'avance que lorsqu'une passe
 * complète est finie (la connexion reste « due » tant que ce n'est pas le cas).
 * Statuts : success (tout lu, aucune erreur) · partial (erreurs non fatales ou échéance atteinte) ·
 * failed (erreur fatale, ou aucune étape menée à bien) · running (en cours / verrou).
 * Lève une AppError si le run ne peut pas démarrer.
 */
export async function runChannelSync(connectionId: string, options: RunChannelSyncOptions): Promise<SyncRunResult> {
  const admin = createAdminSupabaseClient();
  const clock = options.clock ?? Date.now;
  const scope = options.scope ?? "full";
  const startedMs = clock();
  const budgetMs = Math.min(MAX_SYNC_RUN_BUDGET_MS, Math.max(MIN_SYNC_RUN_BUDGET_MS, Math.trunc(options.budgetMs ?? syncRunBudgetMs())));
  const deadlineAt = options.deadlineAt ?? startedMs + budgetMs;

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
  if (runError) {
    // Index unique partiel (une seule ligne « running » par source) : verrou atomique contre les runs concurrents.
    if (runError.code === "23505") throw new AppError("CONFLICT", `Une synchronisation ${label} est déjà en cours pour cette connexion. Patientez avant d'en relancer une.`);
    throw fromPostgrestError(runError);
  }
  const runId = run.id;

  log.info(`${label} sync started`, { runId, connectionId, orgId: connection.organization_id, trigger: options.trigger, scope, username: connection.external_username, budgetMs: deadlineAt - startedMs });

  // Tentative enregistrée tout de suite (même si le run est tué ensuite) : ordre de service du cron.
  const { error: attemptError } = await admin.from("channel_connections").update({ last_sync_attempt_at: new Date().toISOString() }).eq("id", connection.id).neq("status", "disconnected");
  if (attemptError) log.warn("tentative de synchronisation non enregistrée", { runId, error: attemptError.message });

  const stats = emptyStats();
  const errors: SyncErrorInput[] = [];
  const state: { fatal: SyncErrorInput | null; authExpired: boolean; phasesCompleted: number; newCursor: Date | null; budgetStopped: boolean; passComplete: boolean } = {
    fatal: null,
    authExpired: false,
    phasesCompleted: 0,
    newCursor: null,
    budgetStopped: false,
    passComplete: true,
  };
  const progress: Record<string, Json> = {};
  let syncState = readSyncState(connection.sync_state);

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
    deadlineAt,
    clock,
  };

  /** Progression reprenable (jamais sur une connexion déconnectée entre-temps). */
  const persistSyncState = async (next: SyncState): Promise<void> => {
    const { error } = await admin
      .from("channel_connections")
      .update({ sync_state: next as unknown as NonNullable<Json> })
      .eq("id", connection.id)
      .neq("status", "disconnected");
    if (error) throw fromPostgrestError(error);
    syncState = next;
  };
  const persistSyncStateOrRecord = async (next: SyncState, step: string): Promise<void> => {
    try {
      await persistSyncState(next);
    } catch (e) {
      const d = describeError(e);
      ctx.recordError({ code: "SYNC_PROGRESS_NOT_SAVED", message: `Progression non enregistrée (${step}) : ${d.message}`, entityType: "phase", entityRef: step });
    }
  };

  const runPhase = async (name: string, fn: () => Promise<void>): Promise<boolean> => {
    if (state.fatal) return false;
    try {
      await fn();
      state.phasesCompleted++;
      return true;
    } catch (e) {
      if (isDeadlineExceeded(e)) {
        // Échéance atteinte dans un appel non découpé : arrêt propre, ce n'est pas une panne.
        state.budgetStopped = true;
        log.info(`phase ${name} arrêtée à l'échéance`, { runId });
        return false;
      }
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

  try {
    if (scope === "full" || scope === "listings") {
      // Accumulateur : si la phase est interrompue (API indisponible à la page 3…), les compteurs
      // de ce qui a réellement été écrit restent exacts dans le run.
      const r = emptyListingsResult();
      // Run complet : les annonces ne consomment pas tout le budget (les ventes restent prioritaires).
      const listingsDeadline = scope === "full" ? Math.min(deadlineAt, startedMs + Math.floor((deadlineAt - startedMs) * LISTINGS_BUDGET_SHARE)) : deadlineAt;
      const resumedPass: ListingsPassState | null = syncState.listingsPass ?? null;
      await runPhase("listings", async () => {
        await syncListings({ ...ctx, deadlineAt: listingsDeadline }, r, {
          pass: resumedPass,
          maxPagesPerRun: options.listings?.maxPagesPerRun,
          onPageComplete: (pass) => persistSyncState({ ...syncState, listingsPass: pass }),
        });
        log.info(`${label} listings synced`, { runId, fetched: r.fetched, upserted: r.upserted, ended: r.ended, autoMapped: r.autoMapped, suggestions: r.suggestionsCreated, invalid: r.invalid, pages: r.pagesRead, passFinished: r.passFinished });
      });
      stats.listings_fetched = r.fetched;
      stats.listings_upserted = r.upserted;
      stats.listings_ended = r.ended;
      stats.listings_auto_mapped = r.autoMapped;
      stats.suggestions_created = r.suggestionsCreated;
      // Parcours terminé ET annonces non revues traitées : le prochain parcours repartira de la page 1.
      if (r.passFinished && r.pass === null && syncState.listingsPass) await persistSyncStateOrRecord({ ...syncState, listingsPass: null }, "listings");
      if (r.stoppedByDeadline) state.budgetStopped = true;
      if (!r.passFinished) state.passComplete = false;
      progress.listings = { pagesRead: r.pagesRead, passFinished: r.passFinished, nextPage: r.pass?.nextPage ?? null, resumed: resumedPass !== null };
    }

    let ordersResult: OrdersPhaseResult | null = null;
    let ordersPhaseOk = false;
    if (scope === "full" || scope === "orders") {
      if (state.fatal) {
        state.passComplete = false;
      } else if (timeLeftMs(ctx) < ORDERS_PAGE_MIN_REMAINING_MS) {
        // Plus le temps de lire une page : la phase est reportée au passage suivant.
        state.budgetStopped = true;
        state.passComplete = false;
      } else {
        const previousCursor = connection.last_orders_cursor;
        const window = computeOrdersWindow(previousCursor, new Date(clock()));
        const sliceHours = options.orders?.sliceHours ?? syncState.ordersSliceHours ?? ORDERS_SLICE_HOURS;
        const r = emptyOrdersResult();
        ordersResult = r;
        let savedCursor = previousCursor ? new Date(previousCursor).toISOString() : null;
        // Curseur enregistré après CHAQUE tranche lue et ingérée en entier (jamais au-delà d'un échec).
        const saveCursor = async (): Promise<void> => {
          const cursor = resolveOrdersCursor(window, r, previousCursor);
          if (!cursor || cursor.toISOString() === savedCursor) return;
          const { error } = await admin.from("channel_connections").update({ last_orders_cursor: cursor.toISOString() }).eq("id", connection.id).neq("status", "disconnected");
          if (error) throw fromPostgrestError(error);
          savedCursor = cursor.toISOString();
        };
        log.info(`${label} orders window`, { runId, since: window.since.toISOString(), until: window.until.toISOString(), initial: window.initial, sliceHours });
        ordersPhaseOk = await runPhase("orders", async () => {
          await syncOrders(ctx, window, r, { ...options.orders, sliceHours, onSliceComplete: saveCursor });
          log.info(`${label} orders synced`, { runId, fetched: r.fetched, created: r.created, updated: r.updated, itemsUnmapped: r.itemsUnmapped, movements: r.movements, failed: r.failed, invalid: r.invalid, truncated: r.truncated, pages: r.pages, stoppedByDeadline: r.stoppedByDeadline });
        });
        stats.orders_fetched = r.fetched;
        stats.orders_created = r.created;
        stats.orders_updated = r.updated;
        stats.items_unmapped = r.itemsUnmapped;
        stats.inventory_changes = r.movements;
        // Curseur : jamais au-delà d'une commande en échec ni d'une tranche non lue en entier,
        // y compris si la phase a été interrompue (on garde la progression acquise).
        state.newCursor = resolveOrdersCursor(window, r, previousCursor);
        if (r.stoppedByDeadline) state.budgetStopped = true;
        if (!r.windowComplete) state.passComplete = false;
        // Tranche trop longue pour le budget (aucune tranche finie) : tranches deux fois plus courtes au
        // prochain passage, jusqu'à ORDERS_MIN_SLICE_HOURS ; taille par défaut dès la fenêtre complète.
        const nextSliceHours = r.windowComplete ? undefined : r.stoppedByDeadline && r.slicesCompleted === 0 ? Math.max(ORDERS_MIN_SLICE_HOURS, Math.floor(sliceHours / 2)) : syncState.ordersSliceHours;
        if (nextSliceHours !== syncState.ordersSliceHours) {
          const next: SyncState = { ...syncState };
          if (nextSliceHours === undefined) delete next.ordersSliceHours;
          else next.ordersSliceHours = nextSliceHours;
          await persistSyncStateOrRecord(next, "orders");
        }
        progress.orders = { pages: r.pages, slicesCompleted: r.slicesCompleted, windowComplete: r.windowComplete, sliceHours, cursor: state.newCursor?.toISOString() ?? savedCursor };
        await reportOrdersBlocked(ctx, r, label);
      }
    }

    if (scope === "full" && connection.push_inventory && !state.fatal) {
      // I-01 : n'envoyer des quantités à eBay que si les ventes sont À JOUR. Sinon le stock local n'a pas
      // encore été décrémenté des ventes récentes et eBay recevrait une quantité trop élevée (survente).
      const reasons = pushBlockers(ordersResult, ordersPhaseOk);
      if (reasons.length > 0) {
        ctx.recordError({
          code: "INVENTORY_PUSH_SKIPPED",
          message: `Quantités non envoyées à eBay : ${reasons.join(" ; ")}. Le stock local pourrait ne pas refléter des ventes récentes (risque de survente) : l'envoi reprendra après un import des commandes complet et sans erreur.`,
          entityType: "phase",
          entityRef: "inventory_push",
        });
      } else if (timeLeftMs(ctx) < PUSH_MIN_REMAINING_MS) {
        state.budgetStopped = true;
        state.passComplete = false;
      } else {
        await runPhase("inventory_push", async () => {
          const r = await pushInventory(ctx);
          stats.inventory_pushed = r.pushed;
          if (r.stoppedByDeadline) {
            state.budgetStopped = true;
            state.passComplete = false;
          }
          log.info(`${label} inventory pushed`, { runId, checked: r.checked, changed: r.changed, pushed: r.pushed, failed: r.failed, refusedSharedSku: r.refusedSharedSku });
        });
      }
    }
  } catch (e) {
    // Garde-fou : quoi qu'il arrive, le run est finalisé (jamais laissé « running »).
    const d = describeError(e);
    const entry: SyncErrorInput = { code: d.code, message: d.message, entityType: "run", entityRef: null, details: d.details };
    errors.push(entry);
    state.fatal = entry;
    state.passComplete = false;
    log.error("run interrompu par une erreur inattendue", { runId, code: d.code, message: d.message });
  }

  if (state.budgetStopped && !state.fatal) {
    // En tête : c'est la raison principale du statut « partial » (error_summary).
    errors.unshift({ code: BUDGET_REACHED_CODE, message: BUDGET_REACHED_MESSAGE, entityType: "run", entityRef: null, details: { budgetMs: deadlineAt - startedMs, progress } });
  }

  stats.errors = errors.length;
  const finishedMs = clock();
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedMs - startedMs);
  const status: SyncStatus = state.fatal ? "failed" : state.budgetStopped ? "partial" : state.phasesCompleted === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
  const errorSummary = errors.length === 0 ? null : sanitizeMessage(`${errors[0]?.message ?? "Erreur"}${errors.length > 1 ? ` (+${errors.length - 1} autre(s))` : ""}`, 1000);

  // Persistance des erreurs (jamais de secret dans le message ni dans details).
  for (const part of chunk(errors, 200)) {
    const { error } = await admin.from("sync_errors").insert(
      part.map((e) => ({
        organization_id: connection.organization_id,
        sync_run_id: runId,
        code: e.code,
        message: sanitizeMessage(e.message),
        entity_type: e.entityType ?? null,
        entity_ref: e.entityRef ?? null,
        details: sanitizeDetails(e.details) as NonNullable<Json>,
      })),
    );
    if (error) log.error("impossible d'enregistrer les erreurs de sync", { runId, error: error.message });
  }

  // Fin du run = libération du verrou (la ligne quitte l'état « running »).
  const { error: finishError } = await admin
    .from("sync_runs")
    .update({
      status,
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      records_processed: stats.listings_fetched + stats.orders_fetched,
      error_count: errors.length,
      error_summary: errorSummary,
      stats: { ...stats, budget_reached: state.budgetStopped, pass_complete: state.passComplete, progress } as unknown as NonNullable<Json>,
    })
    .eq("id", runId);
  if (finishError) log.error("impossible de finaliser le run", { runId, error: finishError.message });

  // État de la connexion + alertes. Une connexion déconnectée PENDANT le run n'est jamais « réveillée ».
  // last_sync_at : uniquement quand une passe COMPLÈTE est finie (sinon la connexion reste « due » et le
  // passage suivant reprend) ; jamais pour un run déclenché par webhook (périmètre partiel, fréquent).
  const connectionPatch: Partial<ChannelConnection> = { last_error: errorSummary };
  if (options.trigger !== "webhook" && state.passComplete && !state.budgetStopped && !state.fatal) connectionPatch.last_sync_at = finishedAt.toISOString();
  if (status === "success") connectionPatch.last_successful_sync_at = finishedAt.toISOString();
  if (state.newCursor) connectionPatch.last_orders_cursor = state.newCursor.toISOString();
  if (state.authExpired) {
    // Le statut 'expired' et l'alerte critique ont été posés par le gestionnaire de tokens ; on s'assure qu'ils le sont.
    await markConnectionExpired(connection.id, state.fatal?.message ?? "Token d'autorisation expiré.");
  }
  const { data: patched, error: patchError } = await admin.from("channel_connections").update(connectionPatch).eq("id", connection.id).neq("status", "disconnected").select("id").maybeSingle();
  if (patchError) log.error("impossible de mettre à jour la connexion", { connectionId, error: patchError.message });
  const stillActive = Boolean(patched) || Boolean(patchError);
  if (stillActive && !state.authExpired) {
    // Statut : seulement depuis connected/error (jamais par-dessus 'expired' posé entre-temps).
    const nextStatus = status === "failed" ? "error" : "connected";
    const { error: statusError } = await admin.from("channel_connections").update({ status: nextStatus }).eq("id", connection.id).in("status", ["connected", "error"]);
    if (statusError) log.error("impossible de mettre à jour le statut de la connexion", { connectionId, error: statusError.message });
  }

  if (!stillActive) {
    log.warn("connexion déconnectée pendant le run : état et alertes inchangés", { runId, connectionId });
  } else if (status === "success") {
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

  log.info(`${label} sync finished`, { runId, status, durationMs, budgetReached: state.budgetStopped, passComplete: state.passComplete, ...stats });
  return { runId, status, stats, durationMs, errorSummary, connectionId: connection.id, stoppedByBudget: state.budgetStopped };
}

/** Raisons de NE PAS envoyer les quantités (I-01) : phase commandes absente, en échec ou incomplète. */
export function pushBlockers(orders: OrdersPhaseResult | null, ordersPhaseOk: boolean): string[] {
  if (!orders) return ["l'import des commandes n'a pas pu être lancé pendant ce run"];
  const reasons: string[] = [];
  if (!ordersPhaseOk) reasons.push("l'import des commandes a échoué");
  if (orders.stoppedByDeadline) reasons.push("l'import des commandes a été interrompu (budget de temps)");
  if (orders.truncated) reasons.push("l'import des commandes a été tronqué");
  if (orders.failed > 0) reasons.push(`${orders.failed} commande(s) n'ont pas pu être importées`);
  if (orders.invalid > 0) reasons.push(`${orders.invalid} commande(s) illisible(s)`);
  if (!orders.windowComplete && reasons.length === 0) reasons.push("la fenêtre de commandes n'a pas été lue en entier");
  return reasons;
}

/** I-10 : commandes illisibles → import bloqué à leur date → alerte explicite (résolue dès que tout passe). */
async function reportOrdersBlocked(ctx: SyncContext, r: OrdersPhaseResult, label: string): Promise<void> {
  const key = ordersBlockedKey(ctx.connection.id);
  if (r.invalid > 0) {
    await upsertAlert(ctx.admin, {
      organizationId: ctx.organizationId,
      type: "sync_orders_blocked",
      severity: "warning",
      title: `Commandes ${label} illisibles : import bloqué`,
      message: `${r.invalid} commande(s) ${label} n'ont pas pu être lues (format inattendu). L'import des commandes ne dépasse pas leur date tant qu'elles ne sont pas importées ; l'envoi des quantités vers ${label} est suspendu. Consultez l'historique des synchronisations.`,
      dedupeKey: key,
      entityType: "channel_connection",
      entityId: ctx.connection.id,
      actionHref: "/settings/sync",
    });
  } else if (r.windowComplete && r.failed === 0) {
    await resolveAlerts(ctx.admin, ctx.organizationId, [key]);
  }
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
  // Horloge murale (pas l'horloge métier injectable) : le verrou porte sur des durées réelles.
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
      .in("id", staleIds)
      .eq("status", "running");
    log.warn("runs interrompus marqués en échec", { connectionId: connection.id, count: staleIds.length });
  }
}
