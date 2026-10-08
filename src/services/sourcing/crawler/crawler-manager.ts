import "server-only";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import type { SyncTrigger, TaxType } from "@/db/types";
import type { AdapterRunContext, SourceAdapter } from "@/integrations/sourcing/core";
import { getSourceAdapter } from "@/integrations/sourcing/registry";
import { adapterConfigFromSource, adapterKeyOf, HostScheduler, withProvenance } from "@/services/sourcing/adapter-runtime";
import { checkRobotsForUrls } from "@/services/sourcing/crawler/robots";
import { getParser } from "@/services/sourcing/crawler/parsers/registry";
import { crawlSource, MIN_DELAY_SECONDS, parseCrawlConfig, type CrawlPageResult } from "@/services/sourcing/crawler/source-crawler";
import { expireUnseenOffers, storeOffer } from "@/services/sourcing/offer-storage";
import { finishSyncRun, isDue, recordSyncErrors, startSyncRun, type SyncErrorInput } from "@/services/sourcing/sync-runs";

/**
 * CrawlerManager — planifie et exécute les crawls des sources PUBLIC_WEB dont l'accès
 * automatisé a été attesté. Concurrence : 1 requête à la fois par hôte, sources d'hôtes
 * différents traitées séquentiellement par lot (prudence par défaut).
 */
const log = createLogger("CRAWLER");

export interface CrawlRunResult {
  sourceId: string;
  runId: string | null;
  status: "success" | "partial" | "failed" | "refused";
  pages: number;
  found: number;
  stored: number;
  rejected: number;
  expired: number;
  message: string;
}

export async function runSourceCrawl(sourceId: string, options: { trigger: SyncTrigger; createdBy?: string | null; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; admin?: AdminSupabaseClient } = { trigger: "manual" }): Promise<CrawlRunResult> {
  const admin = options.admin ?? createAdminSupabaseClient();
  const userAgent = serverEnv().SOURCING_USER_AGENT;
  const { data: source } = await admin.from("supplier_sources").select("*, organization:organizations(default_currency)").eq("id", sourceId).maybeSingle();
  if (!source) return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: "Source introuvable." };
  if (source.source_type !== "PUBLIC_WEB") return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: "Cette source n'est pas une page publique." };
  if (!source.automated_access_confirmed) {
    return { sourceId, runId: null, status: "refused", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: "Accès automatisé non attesté : le crawl est refusé tant que vous n'avez pas confirmé que les conditions d'utilisation l'autorisent." };
  }
  const config = parseCrawlConfig(source.config);
  // Source pilotée par un adaptateur (config.adapter) : catalogue de l'adaptateur si disponible, sinon crawl d'URLs avec son parser HTML.
  const adapterKey = adapterKeyOf(source.config);
  const adapter: SourceAdapter | null = adapterKey ? getSourceAdapter(adapterKey) : null;
  if (adapterKey && !adapter) return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: `Adaptateur « ${adapterKey} » inconnu.` };
  const adapterConfig = adapter ? adapterConfigFromSource(source) : null;
  const useAdapterCatalog = Boolean(adapter && adapterConfig && adapter.capabilities.catalog && adapter.fetchCatalog);
  const robotsUrls = Array.from(new Set([...(adapter && adapterConfig && useAdapterCatalog ? adapter.urlsForCatalog?.(adapterConfig) ?? [] : []), ...config.urls]));
  if (robotsUrls.length === 0) return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: "Aucune URL configurée pour cette source." };
  const parser = useAdapterCatalog ? null : (adapter?.htmlParser ?? getParser(config.parser));
  if (!useAdapterCatalog && !parser) return { sourceId, runId: null, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message: `Parser « ${config.parser} » inconnu.` };

  const run = await startSyncRun(admin, { organizationId: source.organization_id, sourceKind: "supplier_source", sourceRef: source.id, provider: adapter?.key ?? "public_web", trigger: options.trigger, createdBy: options.createdBy ?? null });
  const errors: SyncErrorInput[] = [];
  try {
    const robots = await checkRobotsForUrls(source.base_url ?? robotsUrls[0]!, robotsUrls, userAgent, options.fetchImpl);
    await admin.from("supplier_sources").update({ robots_checked_at: new Date().toISOString(), robots_allowed: robots.allowed, crawl_delay_seconds: robots.crawlDelay === null ? source.crawl_delay_seconds : Math.ceil(robots.crawlDelay) }).eq("id", source.id);
    if (!robots.allowed) {
      const message = `robots.txt : ${robots.details}`;
      await recordSyncErrors(admin, run, [{ code: "ROBOTS_DISALLOW", message, details: { disallowed: robots.disallowedUrls } }]);
      await finishSyncRun(admin, run, { status: "failed", recordsProcessed: 0, errorCount: 1, errorSummary: message });
      await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", source.id);
      return { sourceId, runId: run.id, status: "refused", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message };
    }

    const crawl = useAdapterCatalog && adapter && adapterConfig
      ? await crawlWithAdapter(adapter, adapterConfig, { userAgent, fetchImpl: options.fetchImpl, sleep: options.sleep, robotsCrawlDelay: robots.crawlDelay, configDelay: config.delay_seconds ?? 0, maxPages: config.max_pages ?? 20, disallowedUrls: robots.disallowedUrls })
      : await crawlSource({ baseUrl: source.base_url, config, robotsCrawlDelay: robots.crawlDelay, parser: parser!, userAgent, fetchImpl: options.fetchImpl, sleep: options.sleep, disallowedUrls: robots.disallowedUrls });
    for (const p of crawl.pages) if (p.error) errors.push({ code: "PAGE_FAILED", message: p.error, entityType: "page", entityRef: p.url });
    for (const u of crawl.skippedUrls) errors.push({ code: "URL_SKIPPED", message: "URL ignorée (hôte différent, interdite ou au-delà de la limite de pages).", entityType: "page", entityRef: u });

    const ctx = {
      supabase: admin,
      organizationId: source.organization_id,
      organizationCurrency: source.organization?.default_currency ?? "EUR",
      supplierId: source.supplier_id,
      sourceId: source.id,
      sourceType: source.source_type,
      defaultCurrency: source.default_currency,
      defaultTaxType: source.default_tax_type as TaxType,
      defaultCountry: source.country,
      createdBy: options.createdBy ?? null,
      now: run.startedAt,
    };
    let stored = 0;
    let rejected = 0;
    for (const offer of crawl.offers) {
      try {
        const r = await storeOffer(ctx, offer);
        if (r.outcome === "stored") stored++;
        else {
          rejected++;
          errors.push({ code: "OFFER_REJECTED", message: r.validation.anomalies.map((a) => a.message).join(" ; "), entityType: "offer", entityRef: offer.externalOfferId });
        }
      } catch (e) {
        rejected++;
        errors.push({ code: "OFFER_STORE_FAILED", message: e instanceof Error ? e.message : String(e), entityType: "offer", entityRef: offer.externalOfferId });
      }
    }
    const expired = stored > 0 ? await expireUnseenOffers(ctx, run.startedAt) : 0;
    const okPages = crawl.pages.filter((p) => !p.error).length;
    const status: CrawlRunResult["status"] = okPages === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
    const message = `${okPages}/${crawl.pages.length} page(s) lue(s), ${crawl.offers.length} offre(s) trouvée(s), ${stored} enregistrée(s), ${rejected} rejetée(s), ${expired} expirée(s).`;
    await recordSyncErrors(admin, run, errors);
    await finishSyncRun(admin, run, { status, recordsProcessed: crawl.offers.length, errorCount: errors.length, stats: { pages: crawl.pages, stored, rejected, expired, delaySeconds: crawl.delaySeconds, parser: parser?.key ?? null, adapter: adapter?.key ?? null, method: adapter?.method ?? "public_html" } as unknown as NonNullable<Json>, errorSummary: status === "failed" ? message : null });
    await admin
      .from("supplier_sources")
      .update({ status: status === "failed" ? "error" : "active", last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: status !== "failed" ? new Date().toISOString() : source.last_successful_sync_at, last_error: status === "failed" ? message : null })
      .eq("id", source.id);
    return { sourceId, runId: run.id, status, pages: crawl.pages.length, found: crawl.offers.length, stored, rejected, expired, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    log.error("crawl failed", { sourceId, error: message });
    await recordSyncErrors(admin, run, [...errors, { code: "CRAWL_FAILED", message }]);
    await finishSyncRun(admin, run, { status: "failed", recordsProcessed: 0, errorCount: errors.length + 1, errorSummary: message });
    await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", source.id);
    return { sourceId, runId: run.id, status: "failed", pages: 0, found: 0, stored: 0, rejected: 0, expired: 0, message };
  }
}

interface AdapterCrawlParams {
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  robotsCrawlDelay: number | null;
  configDelay: number;
  maxPages: number;
  disallowedUrls: string[];
}

/** Parcours du catalogue d'un adaptateur (pages bornées, délai ≥ max(2 s, Crawl-delay, config), provenance par offre). */
async function crawlWithAdapter(adapter: SourceAdapter, config: ReturnType<typeof adapterConfigFromSource>, params: AdapterCrawlParams) {
  const delaySeconds = Math.max(MIN_DELAY_SECONDS, params.robotsCrawlDelay ?? 0, params.configDelay);
  const scheduler = new HostScheduler(delaySeconds * 1000, params.sleep);
  const ctx: AdapterRunContext = { userAgent: params.userAgent, fetchImpl: scheduler.wrapFetch(params.fetchImpl), sleep: params.sleep, minDelayMs: delaySeconds * 1000, disallowedUrls: params.disallowedUrls };
  const pages: CrawlPageResult[] = [];
  const offers: ReturnType<typeof withProvenance>[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  const maxPages = Math.min(Math.max(1, params.maxPages), 50);
  for (let i = 0; i < maxPages; i++) {
    const page = await adapter.fetchCatalog!(config, cursor, ctx);
    const retrievedAt = new Date().toISOString();
    const requestUrl = page.requests.find((q) => q.offers > 0)?.url ?? page.requests[0]?.url ?? null;
    for (const q of page.requests) pages.push({ url: q.url, status: q.status, offers: q.offers, error: q.error });
    for (const o of page.offers) {
      if (seen.has(o.externalOfferId)) continue;
      seen.add(o.externalOfferId);
      offers.push(withProvenance(o, { adapterKey: adapter.key, method: page.method, retrievedAt, requestUrl, sourceUrl: o.url ?? null }));
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return { offers, pages, skippedUrls: [] as string[], delaySeconds };
}

/** Sources PUBLIC_WEB attestées dont la fréquence est échue, regroupées par hôte (1 à la fois par hôte). */
export async function runDueCrawls(now: Date = new Date(), admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<CrawlRunResult[]> {
  const { data: sources } = await admin.from("supplier_sources").select("id, base_url, config, sync_frequency, last_sync_at, status").eq("source_type", "PUBLIC_WEB").eq("automated_access_confirmed", true).neq("sync_frequency", "manual").neq("status", "paused").limit(200);
  const due = (sources ?? []).filter((s) => isDue(s.sync_frequency, s.last_sync_at, now));
  const byHost = new Map<string, string[]>();
  for (const s of due) {
    const cfg = parseCrawlConfig(s.config);
    let host = "unknown";
    try {
      host = new URL(s.base_url ?? cfg.urls[0] ?? "").host;
    } catch {
      // hôte illisible : traité seul
    }
    byHost.set(host, [...(byHost.get(host) ?? []), s.id]);
  }
  const results: CrawlRunResult[] = [];
  // Hôtes traités séquentiellement, sources d'un même hôte séquentielles aussi (1 requête/hôte).
  for (const ids of byHost.values()) {
    for (const id of ids) results.push(await runSourceCrawl(id, { trigger: "scheduled", admin }));
  }
  return results;
}
