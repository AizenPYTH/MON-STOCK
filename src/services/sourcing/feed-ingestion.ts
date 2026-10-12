import "server-only";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import type { SyncTrigger, TaxType } from "@/db/types";
import { fetchText } from "@/services/sourcing/http";
import { loadFeedAuthHeaders } from "@/services/sourcing/feed-secrets";
import { fieldMappingSchema, feedOptionsSchema, mapRow, parseFeedContent, previewFeed, type FeedFormat, type FeedPreview, type FieldMapping, type FeedOptions, type MappingDefaults } from "@/services/sourcing/feed-parsers";
import { expireUnseenOffers, storeOffer } from "@/services/sourcing/offer-storage";
import { finishSyncRun, isDue, recordSyncErrors, startSyncRun, type SyncErrorInput } from "@/services/sourcing/sync-runs";
import { assessImportQuality, rowIdentity, type ImportQualityResult } from "@/domain/sourcing/import-quality";

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
  /** lignes ignorées car leur référence apparaît déjà plus haut dans le fichier */
  duplicates?: number;
  /** import suspendu par le contrôle de qualité : rien n'a été écrit */
  quarantined?: boolean;
  quality?: ImportQualityResult;
  /** détail pour l'historique des imports */
  created?: number;
  updated?: number;
  unchanged?: number;
  unrecognized?: number;
  totalRows?: number;
  truncated?: boolean;
  mode?: IngestMode;
  issues?: IngestIssue[];
}

/**
 * partial : seules les lignes reçues sont créées / mises à jour (aucune expiration) ;
 * snapshot : catalogue complet, les offres de la source absentes sont marquées « expirées ».
 */
export type IngestMode = "partial" | "snapshot";

export interface IngestIssue {
  line: number | null;
  kind: "invalid" | "duplicate" | "rejected" | "unrecognized" | "warning";
  reference: string | null;
  message: string;
  excerpt: Record<string, unknown> | null;
}

/** Lignes problématiques conservées au maximum par import. */
export const MAX_IMPORT_ISSUES = 500;

/** Extrait borné d'une ligne d'origine (12 colonnes, 120 caractères par valeur). */
export function rowExcerpt(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row).slice(0, 12)) out[k.slice(0, 60)] = v === null || v === undefined ? null : String(v).slice(0, 120);
  return out;
}

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

/**
 * Ingestion complète d'un flux : récupération (URL) ou contenu fourni (fichier importé),
 * parsing, mapping, validation, stockage, expiration des offres disparues, journal sync_runs.
 */
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

export async function ingestFeed(feedId: string, options: { trigger: SyncTrigger; createdBy?: string | null; content?: string | null; fetchImpl?: typeof fetch; admin?: AdminSupabaseClient; force?: boolean; mode?: IngestMode; importJobId?: string | null; resolver?: (host: string) => Promise<Array<{ address: string }>> } = { trigger: "manual" }): Promise<IngestResult> {
  // Flux à URL : catalogue complet par défaut (comportement historique) ; fichier importé : choix explicite.
  const mode: IngestMode = options.mode ?? "snapshot";
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
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let unrecognized = 0;
  const issues: IngestIssue[] = [];
  const issue = (i: IngestIssue) => {
    if (issues.length < MAX_IMPORT_ISSUES) issues.push(i);
  };

  try {
    let content = options.content ?? null;
    if (!content) {
      if (!feed.url) throw new Error("Ce flux n'a pas d'URL : importez un fichier manuellement.");
      // identifiants éventuels du flux, déchiffrés côté serveur uniquement
      content = await fetchFeedContent(feed.url, feed.format, feedOptions.encoding, options.fetchImpl, await loadFeedAuthHeaders(admin, feed.id), options.resolver);
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
      importJobId: options.importJobId ?? null,
    };

    // Plafond par exécution : au-delà, le reste est ignoré et signalé (un run doit tenir dans le budget du cron).
    const truncated = parsed.rows.length > MAX_ROWS_PER_RUN;
    if (truncated) {
      errors.push({ code: "FEED_TRUNCATED", message: `Le flux contient ${parsed.rows.length} lignes : seules les ${MAX_ROWS_PER_RUN} premières ont été traitées lors de ce run. Scindez le flux ou filtrez-le côté fournisseur.`, entityType: "feed", entityRef: feed.id });
    }
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
    const quality = assessImportQuality({
      totalRows: mappedRows.length,
      validRows: validOffers.length,
      invalidRows: mappedRows.filter((m) => !m.offer).length,
      duplicateRows: duplicateIdx.size,
      previousRecordCount: feed.last_successful_sync_at ? feed.last_record_count : null,
      priceRatios: await knownPriceRatios(admin, source.id, validOffers),
    });
    if (quality.decision === "quarantine" && !options.force) {
      const message = `Import suspendu, rien n'a été modifié (le catalogue précédent est conservé) : ${quality.issues.map((q) => q.message).join(" ")}`;
      await recordSyncErrors(admin, run, quality.issues.map((q) => ({ code: `IMPORT_${q.code.toUpperCase()}`, message: q.message, entityType: "feed", entityRef: feed.id })));
      await finishSyncRun(admin, run, { status: "failed", recordsProcessed: 0, errorCount: quality.issues.length, stats: { quarantined: true, totalRows: mappedRows.length, valid: validOffers.length, duplicates: duplicateIdx.size } as Json, errorSummary: message });
      await admin.from("supplier_feeds").update({ last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", feed.id);
      return { feedId, runId: run.id, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: mappedRows.filter((m) => !m.offer).length, expired: 0, fxUnavailable: 0, message, duplicates: duplicateIdx.size, quarantined: true, quality, created: 0, updated: 0, unchanged: 0, unrecognized: 0, totalRows: parsed.rows.length, truncated, mode, issues: quality.issues.map((q) => ({ line: null, kind: "warning" as const, reference: null, message: q.message, excerpt: null })) };
    }

    // Numéro de ligne affiché : ligne du fichier (en-tête = ligne 1) pour un CSV / XLSX.
    const lineOf = (index: number) => (feed.format === "csv" ? index + 2 : index + 1);
    for (const [index, mapped] of mappedRows.entries()) {
      processed++;
      const sourceRow = parsed.rows[index];
      if (duplicateIdx.has(index)) {
        errors.push({ code: "ROW_DUPLICATE", message: "Référence déjà présente plus haut dans le fichier : ligne ignorée.", entityType: "feed_row", entityRef: String(index + 1) });
        issue({ line: lineOf(index), kind: "duplicate", reference: mapped.offer?.externalOfferId ?? null, message: "Référence déjà présente plus haut dans le fichier : ligne ignorée.", excerpt: rowExcerpt(sourceRow) });
        continue;
      }
      if (!mapped.offer) {
        invalidRows++;
        errors.push({ code: "ROW_INVALID", message: mapped.errors.join(" "), entityType: "feed_row", entityRef: String(index + 1) });
        issue({ line: lineOf(index), kind: "invalid", reference: null, message: mapped.errors.join(" ").slice(0, 1000), excerpt: rowExcerpt(sourceRow) });
        continue;
      }
      for (const w of mapped.warnings ?? []) issue({ line: lineOf(index), kind: "warning", reference: mapped.offer.externalOfferId, message: w, excerpt: null });
      try {
        const result = await storeOffer(ctx, mapped.offer);
        if (result.outcome === "stored") {
          stored++;
          if (result.created) created++;
          else if (result.changed) updated++;
          else unchanged++;
          if (result.fxUnavailable) fxUnavailable++;
          if (result.unrecognized) {
            unrecognized++;
            issue({ line: lineOf(index), kind: "unrecognized", reference: mapped.offer.externalOfferId, message: "Marque ou modèle non reconnus : offre enregistrée, rapprochement avec votre stock à faire manuellement.", excerpt: null });
          }
        } else {
          rejected++;
          const why = result.validation.anomalies.map((a) => a.message).join(" ; ");
          errors.push({ code: "OFFER_REJECTED", message: why, entityType: "offer", entityRef: mapped.offer.externalOfferId });
          issue({ line: lineOf(index), kind: "rejected", reference: mapped.offer.externalOfferId, message: why.slice(0, 1000) || "Offre rejetée par la validation.", excerpt: rowExcerpt(sourceRow) });
        }
      } catch (e) {
        rejected++;
        const why = e instanceof Error ? e.message : String(e);
        errors.push({ code: "OFFER_STORE_FAILED", message: why, entityType: "offer", entityRef: mapped.offer.externalOfferId });
        issue({ line: lineOf(index), kind: "rejected", reference: mapped.offer.externalOfferId, message: why.slice(0, 1000), excerpt: null });
      }
    }

    // Catalogue complet uniquement : expiration des offres absentes (si le fichier a livré
    // quelque chose et a été lu en entier). En mise à jour partielle, rien n'expire.
    if (mode === "snapshot" && stored > 0 && !truncated) expired = await expireUnseenOffers(ctx, run.startedAt);

    const status: IngestResult["status"] = stored === 0 && processed > 0 ? "failed" : errors.length > 0 ? "partial" : "success";
    const message =
      processed === 0
        ? "Le flux ne contient aucune ligne."
        : `${created} nouvelle(s) offre(s), ${updated} mise(s) à jour, ${unchanged} inchangée(s), ${invalidRows} ligne(s) illisible(s), ${rejected} rejetée(s)${duplicateIdx.size ? `, ${duplicateIdx.size} doublon(s) ignoré(s)` : ""}${mode === "snapshot" ? `, ${expired} expirée(s) (absentes du catalogue complet)` : ""}.`;
    await recordSyncErrors(admin, run, errors);
    await finishSyncRun(admin, run, { status, recordsProcessed: processed, errorCount: errors.length, stats: { stored, created, updated, unchanged, unrecognized, rejected, invalidRows, expired, fxUnavailable, truncated, mode, totalRows: parsed.rows.length, columns: parsed.columns.slice(0, 50) } as Json, errorSummary: status === "failed" ? message : null });
    await admin
      .from("supplier_feeds")
      .update({ last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: status !== "failed" ? new Date().toISOString() : feed.last_successful_sync_at, last_record_count: status !== "failed" ? processed : feed.last_record_count, last_error: status === "failed" ? message : null, status: status === "failed" ? "error" : "active" })
      .eq("id", feed.id);
    if (status !== "failed") await admin.from("supplier_sources").update({ status: "active", last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
    return { feedId, runId: run.id, status, processed, stored, rejected, invalidRows, expired, fxUnavailable, message, duplicates: duplicateIdx.size, quarantined: false, quality, created, updated, unchanged, unrecognized, totalRows: parsed.rows.length, truncated, mode, issues };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    log.error("feed ingestion failed", { feedId, error: message });
    await recordSyncErrors(admin, run, [...errors, { code: "FEED_FAILED", message }]);
    await finishSyncRun(admin, run, { status: "failed", recordsProcessed: processed, errorCount: errors.length + 1, errorSummary: message });
    await admin.from("supplier_feeds").update({ last_sync_at: run.startedAt.toISOString(), last_error: message, status: "error" }).eq("id", feed.id);
    await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", source.id);
    return { feedId, runId: run.id, status: "failed", processed, stored, rejected, invalidRows, expired, fxUnavailable, message, created, updated, unchanged, unrecognized, mode, issues };
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
