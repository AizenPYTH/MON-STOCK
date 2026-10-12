import "server-only";
import { createLogger } from "@/lib/logger";
import { refreshFxRates } from "@/services/sourcing/fx-rates";
import { runScheduledSources } from "@/services/sourcing/source-sync";
import { evaluateSourcingAlerts, type AlertsRunSummary } from "@/services/sourcing/alerts";

const log = createLogger("SOURCING_SYNC");

export interface SourcingSyncSummary {
  startedAt: string;
  finishedAt: string;
  fx: { ok: boolean; date: string | null; count: number; error: string | null };
  /** sources planifiées échues (pages publiques attestées, flux distants, API), avec reprise progressive */
  sources: { sourceId: string; status: string; message: string }[];
  alerts: AlertsRunSummary | { error: string };
}

/**
 * Point d'entrée du cron : taux de change → sources échues (crawl, flux, API) → alertes.
 * Chaque flux / crawl / évaluation d'alertes écrit sa propre ligne sync_runs (par organisation).
 * Le rafraîchissement des taux est global (table fx_rates sans organisation) : journalisé ici.
 */
export async function runSourcingSync(now: Date = new Date()): Promise<SourcingSyncSummary> {
  const startedAt = now.toISOString();
  let fx: SourcingSyncSummary["fx"] = { ok: false, date: null, count: 0, error: null };
  try {
    const r = await refreshFxRates();
    fx = { ok: true, date: r.date, count: r.count, error: null };
  } catch (e) {
    fx = { ok: false, date: null, count: 0, error: e instanceof Error ? e.message : String(e) };
    log.warn("fx refresh failed", { error: fx.error });
  }
  let sources: SourcingSyncSummary["sources"] = [];
  try {
    sources = await runScheduledSources(now);
  } catch (e) {
    log.error("scheduled sources failed", { error: e instanceof Error ? e.message : String(e) });
  }
  let alerts: SourcingSyncSummary["alerts"];
  try {
    alerts = await evaluateSourcingAlerts(now);
  } catch (e) {
    alerts = { error: e instanceof Error ? e.message : String(e) };
    log.error("alerts evaluation failed", { error: alerts.error });
  }
  const summary: SourcingSyncSummary = { startedAt, finishedAt: new Date().toISOString(), fx, sources, alerts };
  log.info("sourcing sync finished", { fx: fx.ok, sources: sources.length });
  return summary;
}
