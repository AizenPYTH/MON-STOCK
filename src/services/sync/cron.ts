import "server-only";
import type { ChannelConnection } from "@/db/types";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toUserMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { findConnectionsByExternalAccount, listDueConnections } from "@/services/channels/connection-store";
import { recoverAbandonedWebhookEvents, type StaleWebhookRecovery } from "@/services/sync/ebay-webhook";
import { RUNNING_STALE_MINUTES, runChannelSync, type RunChannelSyncOptions, type SyncRunResult, type SyncScope, type SyncStats } from "@/services/sync/engine";

const log = createLogger("CRON");

/**
 * Cron de synchronisation des canaux, UNIQUE pour l'Edge Function (`POST /api/cron/sync`, pg_cron
 * toutes les 15 min) et la route web (`/api/cron/sync`) : aucune divergence possible entre runtimes
 * (S-06 / I-22 : l'Edge ne reprenait pas les notifications eBay abandonnées).
 *
 *  1. runs « running » abandonnés (processus tué) → « failed », toutes sources (D-07) ;
 *  2. notifications eBay restées « received » → « failed » + synchronisation de rattrapage ;
 *  3. connexions dues, les moins récemment tentées d'abord, dans UN budget de temps partagé : chaque
 *     run reçoit l'échéance du cron (il s'arrête proprement et reprendra au passage suivant) ; aucun
 *     run n'est démarré s'il reste moins de CRON_MIN_RUN_START_MS.
 */

/** Edge Function Supabase : ~150 s d'horloge. Marge pour la finalisation du dernier run et la réponse. */
export const EDGE_CRON_SYNC_BUDGET_MS = 100_000;
/** Route web (Vercel, maxDuration 300 s). */
export const WEB_CRON_SYNC_BUDGET_MS = 200_000;
/** En deçà, un run n'aurait pas le temps de confirmer une étape : il est reporté au passage suivant. */
export const CRON_MIN_RUN_START_MS = 20_000;
/**
 * Runs d'autres sources (fournisseurs, flux, alertes) : leurs fonctions ne durent jamais plus de
 * quelques minutes ; au-delà de 30 min sans fin enregistrée, le run est abandonné (D-07 : runs
 * `supplier_source` restés « running » 9 jours).
 */
export const OTHER_RUNS_STALE_MINUTES = 30;

export const ABANDONED_RUN_MESSAGE = (minutes: number) => `Run interrompu (aucune fin enregistrée après ${minutes} min) : marqué en échec par le nettoyage planifié.`;

/**
 * D-07 : passe en « failed » les runs restés « running » au-delà du seuil (processus tué avant sa
 * finalisation). Mise à jour conditionnelle (status = 'running') : sans effet sur un run qui se
 * termine au même moment. Libère le verrou (index unique partiel sur les runs « running »).
 */
export async function reapAbandonedSyncRuns(admin: AdminSupabaseClient, now: Date = new Date()): Promise<{ channel: number; other: number }> {
  const channelCutoff = new Date(now.getTime() - RUNNING_STALE_MINUTES * 60_000).toISOString();
  const otherCutoff = new Date(now.getTime() - OTHER_RUNS_STALE_MINUTES * 60_000).toISOString();
  const finishedAt = now.toISOString();
  const { data: channel, error: channelError } = await admin
    .from("sync_runs")
    .update({ status: "failed", finished_at: finishedAt, error_summary: ABANDONED_RUN_MESSAGE(RUNNING_STALE_MINUTES) })
    .eq("status", "running")
    .eq("source_kind", "channel")
    .lt("started_at", channelCutoff)
    .select("id");
  if (channelError) throw new Error(`nettoyage des runs de synchronisation impossible : ${channelError.message}`);
  const { data: other, error: otherError } = await admin
    .from("sync_runs")
    .update({ status: "failed", finished_at: finishedAt, error_summary: ABANDONED_RUN_MESSAGE(OTHER_RUNS_STALE_MINUTES) })
    .eq("status", "running")
    .in("source_kind", ["supplier_feed", "supplier_source", "supplier_connection", "sourcing_alerts", "fx_rates"])
    .lt("started_at", otherCutoff)
    .select("id");
  if (otherError) throw new Error(`nettoyage des runs fournisseurs impossible : ${otherError.message}`);
  const result = { channel: channel?.length ?? 0, other: other?.length ?? 0 };
  if (result.channel + result.other > 0) log.warn("runs abandonnés marqués en échec", result);
  return result;
}

export interface CronSyncDeps {
  admin: AdminSupabaseClient;
  listDue: (now: Date) => Promise<ChannelConnection[]>;
  recover: (admin: AdminSupabaseClient) => Promise<StaleWebhookRecovery>;
  runSync: (connectionId: string, options: RunChannelSyncOptions) => Promise<SyncRunResult>;
  reap: (admin: AdminSupabaseClient, now: Date) => Promise<{ channel: number; other: number }>;
  /** Horloge (ms) ; Date.now par défaut. */
  clock: () => number;
}

export interface CronSyncResultEntry {
  connectionId: string;
  provider: string;
  status: string;
  runId?: string;
  durationMs?: number;
  stats?: SyncStats;
  errorSummary?: string | null;
  stoppedByBudget?: boolean;
  error?: string;
}

export interface CronSyncSummary {
  ok: boolean;
  due: number;
  webhookRecovered: number;
  abandonedRuns: { channel: number; other: number } | null;
  synced: number;
  deferred: number;
  durationMs: number;
  results: CronSyncResultEntry[];
}

function defaultDeps(): CronSyncDeps {
  return {
    admin: createAdminSupabaseClient(),
    listDue: (now) => listDueConnections(now),
    recover: (admin) => recoverAbandonedWebhookEvents(admin, { findConnections: (account) => findConnectionsByExternalAccount("ebay", account) }),
    runSync: (connectionId, options) => runChannelSync(connectionId, options),
    reap: (admin, now) => reapAbandonedSyncRuns(admin, now),
    clock: Date.now,
  };
}

export async function runSyncCron(options: { budgetMs: number }, overrides: Partial<CronSyncDeps> = {}): Promise<CronSyncSummary> {
  const deps: CronSyncDeps = { ...defaultDeps(), ...overrides };
  const startedAt = deps.clock();
  const deadlineAt = startedAt + options.budgetMs;

  let abandonedRuns: CronSyncSummary["abandonedRuns"] = null;
  try {
    abandonedRuns = await deps.reap(deps.admin, new Date(startedAt));
  } catch (e) {
    log.error("nettoyage des runs abandonnés impossible", { message: toUserMessage(e) });
  }

  // Une erreur de lecture des connexions dues est remontée (réponse 500) : jamais un « rien à faire » silencieux.
  const due = await deps.listDue(new Date(startedAt));

  // Notifications eBay dont le traitement a été interrompu (restées « received ») : marquées « failed »
  // et leurs connexions synchronisées ici (eBay a déjà reçu 2xx et ne redélivrera pas).
  type Job = { id: string; provider: string; trigger: "scheduled" | "webhook"; scope?: SyncScope };
  const recoveryJobs: Job[] = [];
  let webhookRecovered = 0;
  try {
    const recovery = await deps.recover(deps.admin);
    webhookRecovered = recovery.recovered;
    const dueIds = new Set(due.map((c) => c.id));
    for (const c of recovery.connections) {
      // Une connexion déjà due reçoit de toute façon une synchronisation complète.
      if (!dueIds.has(c.id)) recoveryJobs.push({ id: c.id, provider: "ebay", trigger: "webhook", scope: c.scope });
    }
    if (recovery.recovered > 0) log.warn("notifications eBay abandonnées reprises", { recovered: recovery.recovered, connections: recovery.connections.length });
  } catch (e) {
    log.error("reprise des notifications eBay abandonnées impossible", { message: toUserMessage(e) });
  }

  // Rattrapages d'abord (peu nombreux, la notification ne sera plus redélivrée) ; les connexions dues
  // reportées par le budget restent dues au passage suivant.
  const jobs: Job[] = [...recoveryJobs, ...due.map((c) => ({ id: c.id, provider: c.provider, trigger: "scheduled" as const }))];
  const results: CronSyncResultEntry[] = [];
  for (const job of jobs) {
    if (deadlineAt - deps.clock() < CRON_MIN_RUN_START_MS) {
      results.push({ connectionId: job.id, provider: job.provider, status: "deferred", error: "Reporté au prochain passage du cron (budget de temps atteint)." });
      continue;
    }
    try {
      const r = await deps.runSync(job.id, { trigger: job.trigger, deadlineAt, ...(job.scope ? { scope: job.scope } : {}) });
      results.push({ connectionId: job.id, provider: job.provider, runId: r.runId, status: r.status, durationMs: r.durationMs, stats: r.stats, errorSummary: r.errorSummary, stoppedByBudget: r.stoppedByBudget });
    } catch (e) {
      results.push({ connectionId: job.id, provider: job.provider, status: "skipped", error: toUserMessage(e) });
    }
  }
  const summary: CronSyncSummary = {
    ok: true,
    due: due.length,
    webhookRecovered,
    abandonedRuns,
    synced: results.filter((r) => r.runId).length,
    deferred: results.filter((r) => r.status === "deferred").length,
    durationMs: deps.clock() - startedAt,
    results,
  };
  log.info("cron de synchronisation terminé", { due: summary.due, synced: summary.synced, deferred: summary.deferred, webhookRecovered, durationMs: summary.durationMs });
  return summary;
}
