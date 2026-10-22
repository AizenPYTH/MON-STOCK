import "server-only";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import type { SyncTrigger, TaxType } from "@/db/types";
import { fetchText } from "@/services/sourcing/http";
import { loadFeedAuthHeaders } from "@/services/sourcing/feed-secrets";
import { fieldMappingSchema, feedOptionsSchema, mapRow, parseFeedContent, previewFeed, type FeedFormat, type FeedPreview, type FieldMapping, type FeedOptions, type MappingDefaults } from "@/services/sourcing/feed-parsers";
import { finishSyncRun, isDue, recordSyncErrors, startSyncRun } from "@/services/sourcing/sync-runs";
import { assessImportQuality, rowIdentity } from "@/domain/sourcing/import-quality";
import { createImportJob, MAX_IMPORT_ROWS, pendingIngestResult, processImportJob, rowExcerpt, type ChunkRow, type ImportJobParams, type IngestIssue, type IngestMode, type IngestResult } from "@/services/sourcing/import-jobs";

export { MAX_IMPORT_ISSUES, rowExcerpt, type IngestIssue, type IngestMode, type IngestResult } from "@/services/sourcing/import-jobs";

/** Lignes lues au maximum par import : traitées par lots reprenables (voir import-jobs). */
export const MAX_ROWS_PER_RUN = MAX_IMPORT_ROWS;
/** Budget de durée par défaut d'une ingestion dans la requête qui la lance (la suite est reprise). */
export const INGEST_DEFAULT_BUDGET_MS = 60_000;

const log = createLogger("FEED_INGESTION");

export const FEED_ACCEPT: Record<FeedFormat, string> = {
  csv: "text/csv,text/plain,application/csv;q=0.9,*/*;q=0.5",
  xml: "application/xml,text/xml,application/rss+xml;q=0.9,*/*;q=0.5",
  json: "application/json,text/json;q=0.9,*/*;q=0.5",
};

export function parseFeedConfig(feed: { field_mapping: Json; options: Json }): { mapping: FieldMapping; options: FeedOptions } {
  const mapping = fieldMappingSchema.safeParse(feed.field_mapping ?? {});
  const options = feedOptionsSchema.safeParse(feed.options ?? {});
  return { mapping: mapping.success ? mapping.data : {}, options: options.success ? options.data : {} };
}

export async function fetchFeedContent(url: string, format: FeedFormat, encoding: string | null | undefined, fetchImpl?: typeof fetch, headers?: Record<string, string>, resolver?: (host: string) => Promise<Array<{ address: string }>>): Promise<string> {
  const res = await fetchText(url, { userAgent: serverEnv().SOURCING_USER_AGENT, accept: FEED_ACCEPT[format], encoding, fetchImpl, headers, resolver });
  if (!res.ok) throw new Error(`Le flux a répondu HTTP ${res.status}.`);
  return res.text;
}

/** Prévisualisation (20 premières lignes mappées) depuis une URL ou un contenu déjà chargé. */
export async function previewFeedSource(input: { url?: string | null; content?: string | null; format: FeedFormat; mapping: FieldMapping; options: FeedOptions; defaults: MappingDefaults; fetchImpl?: typeof fetch }): Promise<FeedPreview> {
  let content = input.content ?? null;
  if (!content) {
    if (!input.url) throw new Error("Aucune URL ni fichier fourni.");
    content = await fetchFeedContent(input.url, input.format, input.options.encoding, input.fetchImpl);
  }
  return previewFeed(content, input.format, input.mapping, input.options, input.defaults, 20);
}

/** Rapport nouveau prix / prix connu pour les références déjà présentes (même devise uniquement). */
async function knownPriceRatios(admin: AdminSupabaseClient, sourceId: string, offers: { externalOfferId: string; price: number | null; currency?: string | null }[]): Promise<number[]> {
  const byId = new Map(offers.filter((o) => o.price !== null && o.price > 0).map((o) => [o.externalOfferId, o]));
  const ids = [...byId.keys()].slice(0, 1000);
  const ratios: number[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("sourcing_offers").select("external_offer_id, original_price, original_currency").eq("source_id", sourceId).in("external_offer_id", ids.slice(i, i + 200));
    for (const row of data ?? []) {
      const next = byId.get(row.external_offer_id);
      if (!next || row.original_price === null || Number(row.original_price) <= 0) continue;
      if (next.currency && row.original_currency && next.currency.toUpperCase() !== row.original_currency.toUpperCase()) continue;
      ratios.push((next.price as number) / Number(row.original_price));
    }
  }
  return ratios;
}

export interface IngestOptions {
  trigger: SyncTrigger;
  createdBy?: string | null;
  content?: string | null;
  fetchImpl?: typeof fetch;
  admin?: AdminSupabaseClient;
  force?: boolean;
  mode?: IngestMode;
  importJobId?: string | null;
  resolver?: (host: string) => Promise<Array<{ address: string }>>;
  /** budget de durée du traitement dans cette requête (la suite est reprise par lots) */
  budgetMs?: number;
  /** budget de calcul (Edge : ~2 s de CPU par requête) */
  cpuBudgetMs?: number;
  /** mapping à mémoriser à la fin d'un import de fichier réussi */
  remember?: ImportJobParams["remember"];
  /** informations du fichier pour l'historique (flux distant : aucune) */
  origin?: "file" | "remote_feed";
}

/**
 * Ingestion d'un flux : récupération (URL) ou contenu fourni (fichier importé), lecture, mapping,
 * doublons et contrôle de qualité AVANT toute écriture, puis découpage en lots durables et
 * écriture en masse dans le budget de la requête (S-04). Un import plus long que le budget est
 * renvoyé « en cours » (`pending`) : la suite est reprise par la tâche planifiée ou l'utilisateur.
 */
export async function ingestFeed(feedId: string, options: IngestOptions = { trigger: "manual" }): Promise<IngestResult> {
  // Flux à URL : catalogue complet par défaut (comportement historique) ; fichier importé : choix explicite.
  const mode: IngestMode = options.mode ?? "snapshot";
  const admin = options.admin ?? createAdminSupabaseClient();
  const cpuClock = () => performance.now();
  const { data: feed, error: feedErr } = await admin.from("supplier_feeds").select("*, source:supplier_sources(id, source_type, default_currency, default_tax_type, country, status), organization:organizations(default_currency)").eq("id", feedId).maybeSingle();
  if (feedErr || !feed) return { feedId, runId: null, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message: "Flux introuvable." };
  const source = feed.source;
  const organizationCurrency = feed.organization?.default_currency ?? "EUR";
  if (!source) return { feedId, runId: null, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message: "Source du flux introuvable." };

  const run = await startSyncRun(admin, { organizationId: feed.organization_id, sourceKind: "supplier_feed", sourceRef: feed.id, provider: feed.format, trigger: options.trigger, createdBy: options.createdBy ?? null });
  const { mapping, options: feedOptions } = parseFeedConfig(feed);
  const defaults: MappingDefaults = { currency: source.default_currency, taxType: source.default_tax_type as TaxType, country: source.country };
  let cpuUsed = 0;

  try {
    let content = options.content ?? null;
    if (!content) {
      if (!feed.url) throw new Error("Ce flux n'a pas d'URL : importez un fichier manuellement.");
      // identifiants éventuels du flux, déchiffrés côté serveur uniquement
      content = await fetchFeedContent(feed.url, feed.format, feedOptions.encoding, options.fetchImpl, await loadFeedAuthHeaders(admin, feed.id), options.resolver);
    }
    const t0 = cpuClock();
    const parsed = parseFeedContent(content, feed.format, feedOptions);
    for (const w of parsed.warnings) log.info("feed warning", { feedId, warning: w });

    // Plafond par import : au-delà, le reste est ignoré et signalé.
    const truncated = parsed.rows.length > MAX_ROWS_PER_RUN;
    // Pré-lecture complète : doublons et contrôle de qualité AVANT toute écriture.
    const mappedRows = parsed.rows.slice(0, MAX_ROWS_PER_RUN).map((row) => mapRow(row, mapping, defaults));
    const seenIds = new Set<string>();
    const duplicateIdx = new Set<number>();
    mappedRows.forEach((m, i) => {
      const id = m.offer ? rowIdentity(m.offer) : null;
      if (!id) return;
      if (seenIds.has(id)) duplicateIdx.add(i);
      else seenIds.add(id);
    });
    const validOffers = mappedRows.flatMap((m, i) => (m.offer && !duplicateIdx.has(i) ? [m.offer] : []));
    const invalidCount = mappedRows.filter((m) => !m.offer).length;
    cpuUsed += cpuClock() - t0;
    const quality = assessImportQuality({
      totalRows: mappedRows.length,
      validRows: validOffers.length,
      invalidRows: invalidCount,
      duplicateRows: duplicateIdx.size,
      previousRecordCount: feed.last_successful_sync_at ? feed.last_record_count : null,
      priceRatios: await knownPriceRatios(admin, source.id, validOffers),
    });
    if (quality.decision === "quarantine" && !options.force) {
      const message = `Import suspendu, rien n'a été modifié (le catalogue précédent est conservé) : ${quality.issues.map((q) => q.message).join(" ")}`;
      await recordSyncErrors(admin, run, quality.issues.map((q) => ({ code: `IMPORT_${q.code.toUpperCase()}`, message: q.message, entityType: "feed", entityRef: feed.id })));
      await finishSyncRun(admin, run, { status: "failed", recordsProcessed: 0, errorCount: quality.issues.length, stats: { quarantined: true, totalRows: mappedRows.length, valid: validOffers.length, duplicates: duplicateIdx.size } as Json, errorSummary: message });
      await admin.from("supplier_feeds").update({ last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", feed.id);
      return { feedId, runId: run.id, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: invalidCount, expired: 0, fxUnavailable: 0, message, duplicates: duplicateIdx.size, quarantined: true, quality, created: 0, updated: 0, unchanged: 0, unrecognized: 0, totalRows: parsed.rows.length, truncated, mode, issues: quality.issues.map((q) => ({ line: null, kind: "warning" as const, reference: null, message: q.message, excerpt: null })) };
    }

    // Lots durables : lignes lues (offre ou erreurs), doublons, extraits des lignes illisibles.
    const rows: ChunkRow[] = mappedRows.map((m, i) => {
      const r: ChunkRow = { i };
      if (m.offer) r.offer = m.offer;
      if (m.errors.length) r.errors = m.errors;
      if (m.warnings?.length) r.warnings = m.warnings;
      if (duplicateIdx.has(i)) r.dup = true;
      if (!m.offer) r.excerpt = rowExcerpt(parsed.rows[i]);
      return r;
    });
    const params: ImportJobParams = {
      v: 1,
      organizationId: feed.organization_id,
      supplierId: feed.supplier_id,
      sourceId: source.id,
      feedId: feed.id,
      sourceType: source.source_type,
      organizationCurrency,
      defaultCurrency: source.default_currency,
      defaultTaxType: source.default_tax_type as TaxType,
      defaultCountry: source.country,
      feedFormat: feed.format,
      mode,
      trigger: options.trigger,
      createdBy: options.createdBy ?? null,
      runId: run.id,
      runStartedAt: run.startedAt.toISOString(),
      totalRows: parsed.rows.length,
      truncated,
      quality,
      columns: parsed.columns.slice(0, 50),
      previousSuccessfulSyncAt: feed.last_successful_sync_at,
      previousRecordCount: feed.last_record_count,
      remember: options.remember ?? null,
    };
    const jobId = await createImportJob({ admin, params, rows, jobId: options.importJobId ?? null, origin: options.origin ?? (feed.url ? "remote_feed" : "file"), job: { mapping: feed.field_mapping as Json, format: feed.format }, warnings: quality.warnings });
    const outcome = await processImportJob(jobId, { admin, budgetMs: options.budgetMs ?? INGEST_DEFAULT_BUDGET_MS, cpuBudgetMs: options.cpuBudgetMs === undefined ? undefined : Math.max(100, options.cpuBudgetMs - cpuUsed) });
    if (outcome.result) return outcome.result;
    if (outcome.done) {
      const { data: closed } = await admin.from("sourcing_import_jobs").select("status, message").eq("id", jobId).maybeSingle();
      return { ...pendingIngestResult(params, outcome), status: "failed", pending: false, message: closed?.message ?? "Import interrompu." };
    }
    return pendingIngestResult(params, outcome);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    log.error("feed ingestion failed", { feedId, error: message });
    await recordSyncErrors(admin, run, [{ code: "FEED_FAILED", message }]);
    await finishSyncRun(admin, run, { status: "failed", recordsProcessed: 0, errorCount: 1, errorSummary: message });
    await admin.from("supplier_feeds").update({ last_sync_at: run.startedAt.toISOString(), last_error: message, status: "error" }).eq("id", feed.id);
    await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", source.id);
    if (options.importJobId) await admin.from("sourcing_import_jobs").update({ status: "failed", message: message.slice(0, 2000), finished_at: new Date().toISOString() }).eq("id", options.importJobId).eq("status", "running");
    return { feedId, runId: run.id, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message, mode, issues: [] satisfies IngestIssue[] };
  }
}

/** Flux à URL dont la fréquence est échue. */
export async function runDueFeeds(now: Date = new Date(), admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<IngestResult[]> {
  const { data: feeds } = await admin.from("supplier_feeds").select("id, sync_frequency, last_sync_at, status, url").not("url", "is", null).neq("sync_frequency", "manual").neq("status", "paused").limit(500);
  const due = (feeds ?? []).filter((f) => isDue(f.sync_frequency, f.last_sync_at, now));
  const results: IngestResult[] = [];
  for (const f of due) results.push(await ingestFeed(f.id, { trigger: "scheduled", admin }));
  return results;
}
