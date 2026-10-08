import "server-only";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import type { SyncTrigger, TaxType } from "@/db/types";
import { fetchText } from "@/services/sourcing/http";
import { fieldMappingSchema, feedOptionsSchema, mapRow, parseFeedContent, previewFeed, type FeedFormat, type FeedPreview, type FieldMapping, type FeedOptions, type MappingDefaults } from "@/services/sourcing/feed-parsers";
import { expireUnseenOffers, storeOffer } from "@/services/sourcing/offer-storage";
import { finishSyncRun, isDue, recordSyncErrors, startSyncRun, type SyncErrorInput } from "@/services/sourcing/sync-runs";

/** Lignes traitées au maximum par exécution (chaque ligne coûte plusieurs requêtes). */
export const MAX_ROWS_PER_RUN = 5_000;

const log = createLogger("FEED_INGESTION");

export const FEED_ACCEPT: Record<FeedFormat, string> = {
  csv: "text/csv,text/plain,application/csv;q=0.9,*/*;q=0.5",
  xml: "application/xml,text/xml,application/rss+xml;q=0.9,*/*;q=0.5",
  json: "application/json,text/json;q=0.9,*/*;q=0.5",
};

export interface IngestResult {
  feedId: string;
  runId: string | null;
  status: "success" | "partial" | "failed";
  processed: number;
  stored: number;
  rejected: number;
  invalidRows: number;
  expired: number;
  fxUnavailable: number;
  message: string;
}

export function parseFeedConfig(feed: { field_mapping: Json; options: Json }): { mapping: FieldMapping; options: FeedOptions } {
  const mapping = fieldMappingSchema.safeParse(feed.field_mapping ?? {});
  const options = feedOptionsSchema.safeParse(feed.options ?? {});
  return { mapping: mapping.success ? mapping.data : {}, options: options.success ? options.data : {} };
}

export async function fetchFeedContent(url: string, format: FeedFormat, encoding: string | null | undefined, fetchImpl?: typeof fetch): Promise<string> {
  const res = await fetchText(url, { userAgent: serverEnv().SOURCING_USER_AGENT, accept: FEED_ACCEPT[format], encoding, fetchImpl });
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

/**
 * Ingestion complète d'un flux : récupération (URL) ou contenu fourni (fichier importé),
 * parsing, mapping, validation, stockage, expiration des offres disparues, journal sync_runs.
 */
export async function ingestFeed(feedId: string, options: { trigger: SyncTrigger; createdBy?: string | null; content?: string | null; fetchImpl?: typeof fetch; admin?: AdminSupabaseClient } = { trigger: "manual" }): Promise<IngestResult> {
  const admin = options.admin ?? createAdminSupabaseClient();
  const { data: feed, error: feedErr } = await admin.from("supplier_feeds").select("*, source:supplier_sources(id, source_type, default_currency, default_tax_type, country, status), organization:organizations(default_currency)").eq("id", feedId).maybeSingle();
  if (feedErr || !feed) return { feedId, runId: null, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message: "Flux introuvable." };
  const source = feed.source;
  const organizationCurrency = feed.organization?.default_currency ?? "EUR";
  if (!source) return { feedId, runId: null, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message: "Source du flux introuvable." };

  const run = await startSyncRun(admin, { organizationId: feed.organization_id, sourceKind: "supplier_feed", sourceRef: feed.id, provider: feed.format, trigger: options.trigger, createdBy: options.createdBy ?? null });
  const { mapping, options: feedOptions } = parseFeedConfig(feed);
  const defaults: MappingDefaults = { currency: source.default_currency, taxType: source.default_tax_type as TaxType, country: source.country };
  const errors: SyncErrorInput[] = [];
  let processed = 0;
  let stored = 0;
  let rejected = 0;
  let invalidRows = 0;
  let fxUnavailable = 0;
  let expired = 0;

  try {
    let content = options.content ?? null;
    if (!content) {
      if (!feed.url) throw new Error("Ce flux n'a pas d'URL : importez un fichier manuellement.");
      content = await fetchFeedContent(feed.url, feed.format, feedOptions.encoding, options.fetchImpl);
    }
    const parsed = parseFeedContent(content, feed.format, feedOptions);
    for (const w of parsed.warnings) log.info("feed warning", { feedId, warning: w });

    const ctx = {
      supabase: admin,
      organizationId: feed.organization_id,
      organizationCurrency,
      supplierId: feed.supplier_id,
      sourceId: source.id,
      sourceType: source.source_type,
      feedId: feed.id,
      defaultCurrency: source.default_currency,
      defaultTaxType: source.default_tax_type as TaxType,
      defaultCountry: source.country,
      createdBy: options.createdBy ?? null,
      now: run.startedAt,
    };

    // Plafond par exécution : au-delà, le reste est ignoré et signalé (un run doit tenir dans le budget du cron).
    const truncated = parsed.rows.length > MAX_ROWS_PER_RUN;
    if (truncated) {
      errors.push({ code: "FEED_TRUNCATED", message: `Le flux contient ${parsed.rows.length} lignes : seules les ${MAX_ROWS_PER_RUN} premières ont été traitées lors de ce run. Scindez le flux ou filtrez-le côté fournisseur.`, entityType: "feed", entityRef: feed.id });
    }
    for (const [index, row] of parsed.rows.slice(0, MAX_ROWS_PER_RUN).entries()) {
      processed++;
      const mapped = mapRow(row, mapping, defaults);
      if (!mapped.offer) {
        invalidRows++;
        errors.push({ code: "ROW_INVALID", message: mapped.errors.join(" "), entityType: "feed_row", entityRef: String(index + 1) });
        continue;
      }
      try {
        const result = await storeOffer(ctx, mapped.offer);
        if (result.outcome === "stored") {
          stored++;
          if (result.fxUnavailable) fxUnavailable++;
        } else {
          rejected++;
          errors.push({ code: "OFFER_REJECTED", message: result.validation.anomalies.map((a) => a.message).join(" ; "), entityType: "offer", entityRef: mapped.offer.externalOfferId });
        }
      } catch (e) {
        rejected++;
        errors.push({ code: "OFFER_STORE_FAILED", message: e instanceof Error ? e.message : String(e), entityType: "offer", entityRef: mapped.offer.externalOfferId });
      }
    }

    // Expiration des offres absentes de ce flux (uniquement si le flux a livré quelque chose et a été lu en entier).
    if (stored > 0 && !truncated) expired = await expireUnseenOffers(ctx, run.startedAt);

    const status: IngestResult["status"] = stored === 0 && processed > 0 ? "failed" : errors.length > 0 ? "partial" : "success";
    const message = processed === 0 ? "Le flux ne contient aucune ligne." : `${stored} offre(s) enregistrée(s), ${invalidRows} ligne(s) illisible(s), ${rejected} offre(s) rejetée(s), ${expired} offre(s) expirée(s).`;
    await recordSyncErrors(admin, run, errors);
    await finishSyncRun(admin, run, { status, recordsProcessed: processed, errorCount: errors.length, stats: { stored, rejected, invalidRows, expired, fxUnavailable, truncated, totalRows: parsed.rows.length, columns: parsed.columns.slice(0, 50) } as Json, errorSummary: status === "failed" ? message : null });
    await admin
      .from("supplier_feeds")
      .update({ last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: status !== "failed" ? new Date().toISOString() : feed.last_successful_sync_at, last_record_count: processed, last_error: status === "failed" ? message : null, status: status === "failed" ? "error" : "active" })
      .eq("id", feed.id);
    if (status !== "failed") await admin.from("supplier_sources").update({ status: "active", last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
    return { feedId, runId: run.id, status, processed, stored, rejected, invalidRows, expired, fxUnavailable, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    log.error("feed ingestion failed", { feedId, error: message });
    await recordSyncErrors(admin, run, [...errors, { code: "FEED_FAILED", message }]);
    await finishSyncRun(admin, run, { status: "failed", recordsProcessed: processed, errorCount: errors.length + 1, errorSummary: message });
    await admin.from("supplier_feeds").update({ last_sync_at: run.startedAt.toISOString(), last_error: message, status: "error" }).eq("id", feed.id);
    await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", source.id);
    return { feedId, runId: run.id, status: "failed", processed, stored, rejected, invalidRows, expired, fxUnavailable, message };
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
