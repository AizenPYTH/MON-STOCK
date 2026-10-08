import "server-only";
import { createLogger } from "@/lib/logger";
import { refreshFxRates } from "@/services/sourcing/fx-rates";
import { runDueFeeds, type IngestResult } from "@/services/sourcing/feed-ingestion";
import { runDueCrawls, type CrawlRunResult } from "@/services/sourcing/crawler/crawler-manager";
import { evaluateSourcingAlerts, type AlertsRunSummary } from "@/services/sourcing/alerts";

const log = createLogger("SOURCING_SYNC");

export interface SourcingSyncSummary {
  startedAt: string;
  finishedAt: string;
  fx: { ok: boolean; date: string | null; count: number; error: string | null };
  feeds: IngestResult[];
  crawls: CrawlRunResult[];
  alerts: AlertsRunSummary | { error: string };
}

/**
 * Point d'entrée du cron : taux de change → flux échus → crawls échus → alertes.
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
  let feeds: IngestResult[] = [];
  try {
    feeds = await runDueFeeds(now);
  } catch (e) {
    log.error("due feeds failed", { error: e instanceof Error ? e.message : String(e) });
  }
  let crawls: CrawlRunResult[] = [];
  try {
    crawls = await runDueCrawls(now);
  } catch (e) {
    log.error("due crawls failed", { error: e instanceof Error ? e.message : String(e) });
  }
  let alerts: SourcingSyncSummary["alerts"];
  try {
    alerts = await evaluateSourcingAlerts(now);
  } catch (e) {
    alerts = { error: e instanceof Error ? e.message : String(e) };
    log.error("alerts evaluation failed", { error: alerts.error });
  }
  const summary: SourcingSyncSummary = { startedAt, finishedAt: new Date().toISOString(), fx, feeds, crawls, alerts };
  log.info("sourcing sync finished", { fx: fx.ok, feeds: feeds.length, crawls: crawls.length });
  return summary;
}
