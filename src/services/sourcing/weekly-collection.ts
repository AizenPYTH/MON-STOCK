import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { TaxType } from "@/db/types";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import type { AdapterRunContext, SourceAdapter } from "@/integrations/sourcing/core";
import { getSourceAdapter } from "@/integrations/sourcing/registry";
import { adapterConfigFromSource, adapterKeyOf, HostScheduler, withProvenance } from "@/services/sourcing/adapter-runtime";
import { checkRobotsForUrls } from "@/services/sourcing/crawler/robots";
import { MIN_DELAY_SECONDS } from "@/services/sourcing/crawler/source-crawler";
import { storeOffer } from "@/services/sourcing/offer-storage";
import { recordSourceOutcome } from "@/services/sourcing/source-health";
import { finishSyncRun, recordSyncErrors, startSyncRun, type SyncErrorInput, type SyncRunHandle } from "@/services/sourcing/sync-runs";
import { EMPTY_CURSOR, endOfCatalogResult, parseCursor, parseStats, weeklyDecision, type CollectCursor, type CollectionStats, type WeeklyDecision } from "@/domain/sourcing/weekly-schedule";
import type { SyncFrequency } from "@/domain/sourcing/schedule";
import { sourcingUserAgent } from "@/lib/env";

/**
 * Collecte hebdomadaire des catalogues publics, PAR TRANCHES avec reprise.
 *
 * Le cron appelle `runWeeklyCollection` toutes les 15 min. Chaque passage :
 * - choisit au plus 5 sources dues (collecte en cours d'abord, puis créneaux atteints), dont au
 *   plus 2 lues par plan du site (mémoire bornée du serveur) ;
 * - pour chacune, pose le verrou de synchronisation (index unique « un run en cours par source » :
 *   jamais deux passages simultanés sur la même source, même si deux crons se chevauchent) ;
 * - lit des pages de catalogue jusqu'à épuisement du budget (~100 s), enregistre les offres
 *   (upsert idempotent sur organisation + source + identifiant externe : aucun doublon) et
 *   sauvegarde le curseur après CHAQUE page ;
 * - en fin de catalogue : collecte « complète » seulement si aucune erreur et catalogue lisible en
 *   entier → `sourcing_close_full_collection` (une offre n'expire qu'après 2 collectes complètes
 *   sans elle) ; sinon « incomplete » : aucune offre déclarée absente.
 * - 3 pages de catalogue en échec d'affilée → collecte abandonnée (« failed ») : aucune offre
 *   touchée, nouvel essai plus tard (au plus 3 par créneau).
 * Le stock n'est jamais déduit d'une absence : une offre absente garde son état de stock.
 */
const log = createLogger("WEEKLY_COLLECTION");

/**
 * S-27 : la collecte hebdomadaire dépend de la migration supabase/pending/20261014000100 (colonnes
 * de reprise de supplier_sources, fonction sourcing_close_full_collection), PAS ENCORE APPLIQUÉE.
 * Tant qu'elle ne l'est pas, la route planifiée répond « désactivée » sans rien exécuter. Vrai dès que
 * les colonnes existent (aucun redéploiement nécessaire après l'application de la migration).
 */
export const WEEKLY_COLLECTION_DISABLED_MESSAGE =
  "Collecte hebdomadaire désactivée : la migration supabase/pending/20261014000100_sourcing_weekly_collection.sql n'est pas appliquée sur cette base. Aucune collecte n'a été lancée.";

const MISSING_SCHEMA_CODES = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

export async function weeklyCollectionSchemaReady(admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<boolean> {
  const { error } = await admin.from("supplier_sources").select("id, collection_started_at, collect_cursor").limit(1);
  if (!error) return true;
  if (MISSING_SCHEMA_CODES.has(error.code ?? "")) return false;
  throw new Error(`contrôle du schéma de la collecte hebdomadaire impossible : ${error.message}`);
}

export const WEEKLY_PASS_BUDGET_MS = 100_000;
export const WEEKLY_MAX_SOURCES_PER_PASS = 5;
export const WEEKLY_MAX_SITEMAP_SOURCES_PER_PASS = 2;
/** marge gardée avant la fin du budget pour finir proprement (une page de catalogue ≈ 20 s au plus) */
const PAGE_MARGIN_MS = 25_000;
const ABORT_AFTER_FAILURES = 3;
/** écritures d'offres en parallèle (base de données ; la politesse envers le site ne change pas) */
const STORE_CONCURRENCY = 4;
/** marge avant la fin du budget pendant les écritures */
const STORE_MARGIN_MS = 8_000;

export const weeklyRunSchema = z.object({
  /** démarrer tout de suite, sans attendre le créneau (collecte demandée explicitement) */
  force: z.boolean().optional(),
  sourceIds: z.array(z.string().uuid()).max(100).optional(),
  maxSources: z.number().int().min(1).max(WEEKLY_MAX_SOURCES_PER_PASS).optional(),
  budgetMs: z.number().int().min(20_000).max(110_000).optional(),
});

type SourceRow = {
  id: string;
  organization_id: string;
  supplier_id: string;
  name: string;
  source_type: string;
  base_url: string | null;
  country: string | null;
  config: Json;
  default_currency: string | null;
  default_tax_type: TaxType;
  automated_access_confirmed: boolean;
  sync_frequency: SyncFrequency;
  status: string;
  crawl_delay_seconds: number | null;
  consecutive_failures: number;
  last_successful_sync_at: string | null;
  schedule_weekday: number | null;
  schedule_hour_utc: number | null;
  collect_cursor: Json | null;
  collection_started_at: string | null;
  last_full_collection_at: string | null;
  last_collection_stats: Json;
  organization: { default_currency: string | null } | null;
};

const COLUMNS =
  "id, organization_id, supplier_id, name, source_type, base_url, country, config, default_currency, default_tax_type, automated_access_confirmed, sync_frequency, status, crawl_delay_seconds, consecutive_failures, last_successful_sync_at, schedule_weekday, schedule_hour_utc, collect_cursor, collection_started_at, last_full_collection_at, last_collection_stats, organization:organizations(default_currency)";

export interface PassResult {
  sourceId: string;
  name: string;
  action: "continued" | "started" | "skipped";
  result: CollectionStats["result"] | "locked" | "refused" | null;
  pagesThisPass: number;
  storedThisPass: number;
  totals: Pick<CollectCursor, "pages" | "offers" | "stored" | "rejected" | "requestErrors"> | null;
  message: string;
}

export interface WeeklyDeps {
  admin?: AdminSupabaseClient;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
  /** horloge du budget de temps (tests) */
  clock?: () => number;
}

function catalogAdapter(s: Pick<SourceRow, "config">): SourceAdapter | null {
  const key = adapterKeyOf(s.config);
  const adapter = key ? getSourceAdapter(key) : null;
  return adapter && adapter.access === "public" && adapter.capabilities.catalog && adapter.fetchCatalog ? adapter : null;
}

/** Passage du cron : sources dues traitées en parallèle (hôtes différents), chacune dans son budget. */
export async function runWeeklyCollection(input: z.infer<typeof weeklyRunSchema> = {}, deps: WeeklyDeps = {}): Promise<{ passes: PassResult[]; due: number; waiting: { sourceId: string; reason: string }[] }> {
  const admin = deps.admin ?? createAdminSupabaseClient();
  const now = (deps.now ?? (() => new Date()))();
  let query = admin.from("supplier_sources").select(COLUMNS).eq("source_type", "PUBLIC_WEB").eq("automated_access_confirmed", true).neq("status", "paused");
  if (input.sourceIds?.length) query = query.in("id", input.sourceIds);
  else if (!input.force) query = query.eq("sync_frequency", "weekly");
  const { data, error } = await query.limit(500);
  if (error) throw new Error(`Sources illisibles : ${error.message}`);
  const sources = ((data ?? []) as unknown as SourceRow[]).filter((s) => catalogAdapter(s));

  const waiting: { sourceId: string; reason: string }[] = [];
  const due: { source: SourceRow; decision: Exclude<WeeklyDecision, { action: "wait" }> }[] = [];
  for (const s of sources) {
    const d = weeklyDecision(s, now, { force: input.force });
    if (d.action === "wait") waiting.push({ sourceId: s.id, reason: d.reason });
    else due.push({ source: s, decision: d });
  }
  // collectes en cours d'abord (la plus ancienne en premier), puis nouveaux démarrages
  due.sort((a, b) => (a.decision.action === b.decision.action ? (a.source.collection_started_at ?? "").localeCompare(b.source.collection_started_at ?? "") : a.decision.action === "continue" ? -1 : 1));
  const picked: typeof due = [];
  const hosts = new Set<string>();
  let sitemaps = 0;
  const max = input.maxSources ?? WEEKLY_MAX_SOURCES_PER_PASS;
  for (const d of due) {
    if (picked.length >= max) break;
    const host = safeHost(d.source.base_url);
    if (host && hosts.has(host)) continue; // une source à la fois par hôte
    const isSitemap = adapterKeyOf(d.source.config) === "sitemap-jsonld";
    if (isSitemap && sitemaps >= WEEKLY_MAX_SITEMAP_SOURCES_PER_PASS) continue;
    if (isSitemap) sitemaps++;
    if (host) hosts.add(host);
    picked.push(d);
  }
  const deadline = (deps.clock ?? Date.now)() + (input.budgetMs ?? WEEKLY_PASS_BUDGET_MS);
  const passes = await Promise.all(picked.map((d) => collectionPass(admin, d.source, d.decision, deadline, deps)));
  log.info("weekly pass", { due: due.length, ran: passes.length, waiting: waiting.length });
  return { passes, due: due.length, waiting };
}

function safeHost(url: string | null): string | null {
  try {
    return url ? new URL(url).host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Un passage sur une source : reprise au curseur, pages lues tant que le budget le permet. */
export async function collectionPass(admin: AdminSupabaseClient, source: SourceRow, decision: Exclude<WeeklyDecision, { action: "wait" }>, deadline: number, deps: WeeklyDeps = {}): Promise<PassResult> {
  const nowFn = deps.now ?? (() => new Date());
  const clock = deps.clock ?? Date.now;
  const adapter = catalogAdapter(source)!;
  const base: PassResult = { sourceId: source.id, name: source.name, action: decision.action === "continue" ? "continued" : "started", result: null, pagesThisPass: 0, storedThisPass: 0, totals: null, message: "" };

  let run: SyncRunHandle;
  try {
    run = await startSyncRun(admin, { organizationId: source.organization_id, sourceKind: "supplier_source", sourceRef: source.id, provider: adapter.key, trigger: "scheduled" });
  } catch (e) {
    // verrou : un autre passage traite déjà cette source → on ne fait rien
    return { ...base, action: "skipped", result: "locked", message: e instanceof Error ? e.message : String(e) };
  }

  let startedAt = source.collection_started_at;
  let stats = parseStats(source.last_collection_stats);
  let cursor = decision.action === "continue" ? parseCursor(source.collect_cursor) : { ...EMPTY_CURSOR };
  if (decision.action === "start") {
    startedAt = nowFn().toISOString();
    stats = { slot: decision.slot, attempts: decision.attempt, result: "running", attemptStartedAt: startedAt, finishedAt: null, message: null };
    // démarrage conditionnel : seulement si aucune collecte n'a été démarrée entre-temps
    const { data: claimed } = await admin
      .from("supplier_sources")
      .update({ collection_started_at: startedAt, collect_cursor: cursor as unknown as Json, last_collection_stats: stats as unknown as NonNullable<Json> })
      .eq("id", source.id)
      .is("collection_started_at", null)
      .select("id");
    if (!claimed?.length) {
      await finishSyncRun(admin, run, { status: "failed", recordsProcessed: 0, errorCount: 0, errorSummary: "Collecte déjà démarrée par un autre passage." });
      return { ...base, action: "skipped", result: "locked", message: "Collecte déjà démarrée par un autre passage." };
    }
  }

  const errors: SyncErrorInput[] = [];
  const userAgent = deps.userAgent ?? sourcingUserAgent();
  const config = adapterConfigFromSource(source);
  const storageCtx = {
    supabase: admin,
    organizationId: source.organization_id,
    organizationCurrency: source.organization?.default_currency ?? "EUR",
    supplierId: source.supplier_id,
    sourceId: source.id,
    sourceType: "PUBLIC_WEB" as const,
    defaultCurrency: source.default_currency,
    defaultTaxType: source.default_tax_type,
    defaultCountry: source.country,
  };

  const saveCursor = () => admin.from("supplier_sources").update({ collect_cursor: cursor as unknown as Json, last_sync_at: nowFn().toISOString() }).eq("id", source.id);

  try {
    const urls = adapter.urlsForCatalog?.(config) ?? [];
    const robots = await checkRobotsForUrls(config.baseUrl ?? urls[0] ?? "", urls.length ? urls : [`${config.baseUrl}/`], userAgent, deps.fetchImpl);
    if (!robots.allowed) {
      return await abortCollection(admin, source, run, stats, cursor, `robots.txt : ${robots.details}`, [...errors, { code: "ROBOTS_DISALLOW", message: robots.details }], nowFn, base);
    }
    const delaySeconds = Math.max(MIN_DELAY_SECONDS, robots.crawlDelay ?? 0, source.crawl_delay_seconds ?? 0);
    const scheduler = new HostScheduler(delaySeconds * 1000, deps.sleep);
    const ctxBase: AdapterRunContext = { userAgent, fetchImpl: scheduler.wrapFetch(deps.fetchImpl), sleep: deps.sleep, minDelayMs: delaySeconds * 1000, disallowedUrls: robots.disallowedUrls };

    let finished = false;
    while (clock() < deadline - PAGE_MARGIN_MS) {
      let page;
      try {
        page = await adapter.fetchCatalog!(config, cursor.cursor, { ...ctxBase, timeoutMs: Math.max(5_000, deadline - clock() - 5_000) });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        cursor = { ...cursor, consecutiveFailures: cursor.consecutiveFailures + 1, requestErrors: cursor.requestErrors + 1 };
        errors.push({ code: "CATALOG_PAGE_FAILED", message, entityType: "page", entityRef: cursor.cursor ?? "début" });
        await saveCursor();
        if (cursor.consecutiveFailures >= ABORT_AFTER_FAILURES) return await abortCollection(admin, source, run, stats, cursor, `${ABORT_AFTER_FAILURES} pages de catalogue en échec d'affilée : ${message}`, errors, nowFn, base);
        break; // nouvel essai au prochain passage, au même curseur
      }
      const retrievedAt = nowFn().toISOString();
      const requestUrl = page.requests.find((q) => q.offers > 0)?.url ?? page.requests[0]?.url ?? null;
      // une même offre ne figure qu'une fois par page (écritures en parallèle sans conflit)
      const unique = [...new Map(page.offers.map((o) => [o.externalOfferId, o])).values()];
      const todo = unique.slice(cursor.pageOffset);
      let stored = 0;
      let rejected = 0;
      let done = 0;
      let storeFailures = 0;
      let outOfTime = false;
      for (let i = 0; i < todo.length; i += STORE_CONCURRENCY) {
        // budget épuisé au milieu d'une page : on s'arrête proprement, la suite de la page au prochain passage
        if (i > 0 && clock() > deadline - STORE_MARGIN_MS) {
          outOfTime = true;
          break;
        }
        const batch = todo.slice(i, i + STORE_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (o) => {
            try {
              const r = await storeOffer({ ...storageCtx, now: nowFn() }, withProvenance(o, { adapterKey: adapter.key, method: page.method, retrievedAt, requestUrl, sourceUrl: o.url ?? null }));
              return r.outcome;
            } catch (e) {
              errors.push({ code: "OFFER_STORE_FAILED", message: e instanceof Error ? e.message : String(e), entityType: "offer", entityRef: o.externalOfferId });
              return "failed" as const;
            }
          }),
        );
        for (const r of results) {
          if (r === "stored") stored++;
          else rejected++;
          // une offre non enregistrée (erreur) n'a pas été « revue » : la collecte ne pourra pas être complète
          if (r === "failed") storeFailures++;
        }
        done += batch.length;
      }
      base.storedThisPass += stored;
      if (outOfTime) {
        cursor = { ...cursor, offers: cursor.offers + done, stored: cursor.stored + stored, rejected: cursor.rejected + rejected, requestErrors: cursor.requestErrors + storeFailures, pageOffset: cursor.pageOffset + done, consecutiveFailures: 0 };
        break; // même page au prochain passage, à partir de pageOffset (enregistrement idempotent)
      }
      const failedRequests = page.requests.filter((q) => q.error);
      for (const q of failedRequests.slice(0, 20)) errors.push({ code: "PAGE_FAILED", message: q.error ?? "erreur", entityType: "page", entityRef: q.url });
      cursor = {
        cursor: page.nextCursor,
        pages: cursor.pages + 1,
        offers: cursor.offers + done,
        stored: cursor.stored + stored,
        rejected: cursor.rejected + rejected,
        requestErrors: cursor.requestErrors + failedRequests.length + storeFailures,
        consecutiveFailures: 0,
        incomplete: cursor.incomplete ?? page.incomplete ?? null,
        pageOffset: 0,
      };
      base.pagesThisPass++;
      if (!page.nextCursor) {
        finished = true;
        break;
      }
      await saveCursor();
    }

    if (!finished) {
      await saveCursor();
      stats = { ...stats, result: "running", pages: cursor.pages, offers: cursor.offers, stored: cursor.stored, rejected: cursor.rejected, requestErrors: cursor.requestErrors };
      await admin.from("supplier_sources").update({ last_collection_stats: stats as unknown as NonNullable<Json>, status: "active", last_error: null }).eq("id", source.id);
      await recordSyncErrors(admin, run, errors);
      await finishSyncRun(admin, run, { status: errors.length ? "partial" : "success", recordsProcessed: base.storedThisPass, errorCount: errors.length, stats: { weekly: true, pass: "continue", cursor } as unknown as NonNullable<Json> });
      return { ...base, result: "running", totals: totals(cursor), message: `Passage terminé (collecte en cours) : ${base.pagesThisPass} page(s), ${base.storedThisPass} offre(s) enregistrée(s) ; total ${cursor.stored}.` };
    }

    // fin de catalogue
    const previous = parseStats(source.last_collection_stats);
    const verdict = endOfCatalogResult(cursor, previous.result === "complete" && typeof previous.seen === "number" ? previous.seen : null);
    const finishedAt = nowFn().toISOString();
    let closing: { seen: number; missed: number; expired: number } | null = null;
    if (verdict.result === "complete") {
      const { data: rows, error } = await admin.rpc("sourcing_close_full_collection", { p_source_id: source.id, p_started_at: startedAt! });
      if (error) throw new Error(`Clôture impossible : ${error.message}`);
      const row = Array.isArray(rows) ? rows[0] : rows;
      closing = { seen: Number(row?.seen ?? 0), missed: Number(row?.missed ?? 0), expired: Number(row?.expired ?? 0) };
    }
    stats = {
      ...stats,
      result: verdict.result,
      finishedAt,
      pages: cursor.pages,
      offers: cursor.offers,
      stored: cursor.stored,
      rejected: cursor.rejected,
      requestErrors: cursor.requestErrors,
      incomplete: verdict.reason,
      ...(closing ?? {}),
      message: verdict.result === "complete" ? `Collecte complète : ${cursor.stored} offres, ${closing!.missed} absente(s), ${closing!.expired} expirée(s).` : `Collecte terminée mais incomplète (${verdict.reason}) : aucune offre déclarée absente.`,
    };
    // la clôture (fonction SQL) a déjà remis le curseur à zéro pour une collecte complète ; sinon on le fait ici
    await admin
      .from("supplier_sources")
      .update({ collection_started_at: null, collect_cursor: null, last_collection_stats: stats as unknown as NonNullable<Json>, status: "active", last_error: null, last_sync_at: finishedAt, last_successful_sync_at: finishedAt })
      .eq("id", source.id);
    await recordSourceOutcome(admin, { sourceId: source.id, organizationId: source.organization_id, sourceName: source.name, frequency: source.sync_frequency, previousFailures: source.consecutive_failures, ok: true });
    await recordSyncErrors(admin, run, errors);
    await finishSyncRun(admin, run, { status: verdict.result === "complete" && errors.length === 0 ? "success" : "partial", recordsProcessed: base.storedThisPass, errorCount: errors.length, stats: { weekly: true, pass: "end", result: verdict.result, cursor, closing } as unknown as NonNullable<Json> });
    return { ...base, result: verdict.result, totals: totals(cursor), message: stats.message ?? "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("weekly pass failed", { sourceId: source.id, error: message });
    // erreur inattendue : le curseur déjà sauvegardé est conservé, nouvel essai au prochain passage
    await recordSyncErrors(admin, run, [...errors, { code: "PASS_FAILED", message }]);
    await finishSyncRun(admin, run, { status: "failed", recordsProcessed: base.storedThisPass, errorCount: errors.length + 1, errorSummary: message });
    return { ...base, result: "running", totals: totals(cursor), message: `Passage interrompu : ${message}` };
  }
}

function totals(c: CollectCursor): PassResult["totals"] {
  return { pages: c.pages, offers: c.offers, stored: c.stored, rejected: c.rejected, requestErrors: c.requestErrors };
}

/** Abandon : la collecte n'est PAS complète, aucune offre n'est touchée ; nouvel essai plus tard. */
async function abortCollection(admin: AdminSupabaseClient, source: SourceRow, run: SyncRunHandle, stats: CollectionStats, cursor: CollectCursor, message: string, errors: SyncErrorInput[], nowFn: () => Date, base: PassResult): Promise<PassResult> {
  const finishedAt = nowFn().toISOString();
  const next: CollectionStats = { ...stats, result: "failed", finishedAt, pages: cursor.pages, offers: cursor.offers, stored: cursor.stored, rejected: cursor.rejected, requestErrors: cursor.requestErrors, message };
  await admin.from("supplier_sources").update({ collection_started_at: null, collect_cursor: null, last_collection_stats: next as unknown as NonNullable<Json>, last_error: message.slice(0, 1000), last_sync_at: finishedAt }).eq("id", source.id);
  await recordSourceOutcome(admin, { sourceId: source.id, organizationId: source.organization_id, sourceName: source.name, frequency: source.sync_frequency, previousFailures: source.consecutive_failures, ok: false, error: message });
  await recordSyncErrors(admin, run, errors);
  await finishSyncRun(admin, run, { status: "failed", recordsProcessed: base.storedThisPass, errorCount: errors.length, errorSummary: message.slice(0, 1000) });
  return { ...base, result: errors.some((e) => e.code === "ROBOTS_DISALLOW") ? "refused" : "failed", totals: totals(cursor), message };
}
