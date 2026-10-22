import "server-only";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { refreshFxRates } from "@/services/sourcing/fx-rates";
import { runDueSources } from "@/services/sourcing/source-sync";
import { evaluateSourcingAlerts, type AlertsRunSummary } from "@/services/sourcing/alerts";
import { runPendingImportJobs, type PendingImportJobsRun } from "@/services/sourcing/import-jobs";

const log = createLogger("SOURCING_SYNC");

/** Budget global d'un passage du cron (la fonction serveur est coupée à 150 s, requête pg_net comprise). */
export const SOURCING_SYNC_BUDGET_MS = 110_000;
/** Part du budget réservée aux alertes, évaluées EN PREMIER (jamais privées de temps par les sources). */
export const ALERTS_BUDGET_MS = 25_000;
/** Délai maximal du rafraîchissement des taux BCE. */
export const FX_TIMEOUT_MS = 10_000;
/** Part du budget laissée aux imports reprenables (catalogues et flux en cours). */
export const IMPORT_JOBS_BUDGET_MS = 25_000;

export type SourcingSyncPhase = "all" | "alerts" | "sources" | "imports";

export interface SourcingSyncSummary {
  startedAt: string;
  finishedAt: string;
  phase: SourcingSyncPhase;
  budgetMs: number;
  fx: { ok: boolean; date: string | null; count: number; error: string | null } | null;
  /** sources planifiées lancées (pages publiques attestées, flux distants, API) */
  sources: { sourceId: string; status: string; message: string }[];
  /** sources échues reportées faute de temps : en tête de file au prochain passage */
  deferredSources: string[];
  alerts: AlertsRunSummary | { error: string } | null;
  imports: PendingImportJobsRun | { error: string } | null;
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Point d'entrée du cron, dans un budget de temps GLOBAL :
 *   1. alertes (sur les offres connues) — en premier, avec leur propre part du budget ;
 *   2. taux de change (délai borné) ;
 *   3. imports reprenables en cours (catalogues / flux par lots) ;
 *   4. sources échues, file équitable et stable, budget vérifié avant chaque source.
 * `phase` permet de lancer une étape seule (cron séparé pour les alertes, par exemple).
 */
export async function runSourcingSync(now: Date = new Date(), options: { phase?: SourcingSyncPhase; budgetMs?: number; admin?: AdminSupabaseClient; clock?: () => number } = {}): Promise<SourcingSyncSummary> {
  const phase = options.phase ?? "all";
  const budgetMs = options.budgetMs ?? SOURCING_SYNC_BUDGET_MS;
  const clock = options.clock ?? Date.now;
  const admin = options.admin ?? createAdminSupabaseClient();
  const deadline = clock() + budgetMs;
  const remaining = () => Math.max(0, deadline - clock());
  const startedAt = now.toISOString();

  let alerts: SourcingSyncSummary["alerts"] = null;
  if (phase === "all" || phase === "alerts") {
    try {
      alerts = await evaluateSourcingAlerts(now, admin, undefined, { budgetMs: phase === "alerts" ? remaining() : Math.min(ALERTS_BUDGET_MS, remaining()), clock });
    } catch (e) {
      alerts = { error: e instanceof Error ? e.message : String(e) };
      log.error("alerts evaluation failed", { error: alerts.error });
    }
  }

  let fx: SourcingSyncSummary["fx"] = null;
  if (phase === "all" || phase === "sources") {
    try {
      const r = await withTimeout(refreshFxRates(), Math.min(FX_TIMEOUT_MS, remaining()), "Taux BCE : délai dépassé.");
      fx = { ok: true, date: r.date, count: r.count, error: null };
    } catch (e) {
      fx = { ok: false, date: null, count: 0, error: e instanceof Error ? e.message : String(e) };
      log.warn("fx refresh failed", { error: fx.error });
    }
  }

  let imports: SourcingSyncSummary["imports"] = null;
  if (phase === "all" || phase === "imports") {
    try {
      imports = await runPendingImportJobs({ admin, budgetMs: phase === "imports" ? remaining() : Math.min(IMPORT_JOBS_BUDGET_MS, remaining()), clock });
    } catch (e) {
      imports = { error: e instanceof Error ? e.message : String(e) };
      log.error("pending import jobs failed", { error: imports.error });
    }
  }

  let sources: SourcingSyncSummary["sources"] = [];
  let deferredSources: string[] = [];
  if (phase === "all" || phase === "sources") {
    try {
      const r = await runDueSources({ now, admin, budgetMs: remaining(), clock });
      sources = r.ran;
      deferredSources = r.deferred;
    } catch (e) {
      log.error("scheduled sources failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }
  const summary: SourcingSyncSummary = { startedAt, finishedAt: new Date(clock()).toISOString(), phase, budgetMs, fx, sources, deferredSources, alerts, imports };
  log.info("sourcing sync finished", { phase, fx: fx?.ok ?? null, sources: sources.length, deferred: deferredSources.length });
  return summary;
}
