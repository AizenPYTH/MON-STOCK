import "server-only";
import { randomUUID } from "node:crypto";
import type { Json } from "@/db/database.types";
import type { SourceType, SyncTrigger, TaxType } from "@/db/types";
import type { RawOffer } from "@/domain/sourcing/types";
import type { ImportQualityResult } from "@/domain/sourcing/import-quality";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { expireUnseenOffers, storeOffersBatch, type StorageContext } from "@/services/sourcing/offer-storage";
import { finishSyncRun, recordSyncErrors, type SyncErrorInput, type SyncRunHandle } from "@/services/sourcing/sync-runs";
import type { FeedFormat } from "@/services/sourcing/feed-parsers";

/**
 * =============================================================================
 * IMPORTS REPRENABLES (catalogues de fichiers et flux distants) — audit S-04.
 *
 * Un import n'est plus traité ligne à ligne dans une seule requête (5 à 8 allers-retours par
 * ligne, 150 s de durée et 2 s de CPU au plus sur l'Edge) :
 *   1. les lignes lues, validées et dédoublonnées sont découpées en LOTS durables
 *      (sourcing_import_chunks) rattachés au job (sourcing_import_jobs : progression, bail) ;
 *   2. chaque lot est écrit EN MASSE (`storeOffersBatch` : un nombre de requêtes indépendant du
 *      nombre de lignes), puis marqué « fait » avec ses compteurs et ses lignes en erreur ;
 *   3. le traitement s'arrête avant le budget de temps (et de calcul) de la requête ; la suite est
 *      reprise par l'utilisateur (« reprendre ») ou par la tâche planifiée, qui prend un BAIL sur
 *      le job (compare-and-set) : jamais deux traitements simultanés du même job ;
 *   4. un lot interrompu est rejoué sans doublon (upsert sur la clé unique des offres, incidents
 *      de ses lignes remplacés) ; un lot terminé n'est jamais rejoué ;
 *   5. le job se clôt une seule fois (compteurs agrégés, expiration « catalogue complet »,
 *      journal) ; un job abandonné, bloqué ou remplacé est clos « failed » : aucun job ne reste
 *      « running » indéfiniment.
 * =============================================================================
 */

const log = createLogger("IMPORT_JOBS");

/** Lignes par lot (une écriture groupée par lot). */
export const IMPORT_CHUNK_ROWS = 250;
/** Lignes lues au maximum par import (au-delà : signalé « tronqué », comme avant mais 10× plus). */
export const MAX_IMPORT_ROWS = 50_000;
/** Durée du bail d'un traitement (renouvelé après chaque lot). */
export const IMPORT_LEASE_MS = 3 * 60_000;
/** Prises en charge successives sans qu'aucun lot n'avance avant d'abandonner le job. */
export const IMPORT_MAX_IDLE_ATTEMPTS = 5;
/** Sans activité depuis ce délai, un job est clos « failed » (abandonné). */
export const IMPORT_ABANDON_MS = 24 * 3_600_000;
/** Job jamais découpé en lots (création interrompue) : clos après ce délai. */
export const IMPORT_UNSPLIT_STALE_MS = 15 * 60_000;
/** Temps minimal restant pour commencer un lot. */
export const IMPORT_MIN_CHUNK_MS = 8_000;
/** Lignes en erreur conservées au maximum par import. */
export const MAX_IMPORT_ISSUES = 500;
/** Lots insérés par requête à la création. */
const CHUNKS_PER_INSERT = 10;

export type IngestMode = "partial" | "snapshot";

export interface IngestIssue {
  line: number | null;
  kind: "invalid" | "duplicate" | "rejected" | "unrecognized" | "warning";
  reference: string | null;
  message: string;
  excerpt: Record<string, unknown> | null;
}

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
  /** import découpé en lots, pas encore terminé : la suite est reprise automatiquement */
  pending?: boolean;
  jobId?: string | null;
  progress?: ImportProgress;
}

export interface ImportProgress {
  rowsProcessed: number;
  rowsTotal: number;
  chunksDone: number;
  chunksTotal: number;
}

/** Extrait borné d'une ligne d'origine (12 colonnes, 120 caractères par valeur). */
export function rowExcerpt(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row).slice(0, 12)) out[k.slice(0, 60)] = v === null || v === undefined ? null : String(v).slice(0, 120);
  return out;
}

/** Ligne d'un lot : offre lue (ou erreurs de lecture), doublon éventuel, extrait de la ligne d'origine. */
export interface ChunkRow {
  /** index (0-based) de la ligne de données dans le fichier */
  i: number;
  offer?: RawOffer;
  errors?: string[];
  warnings?: string[];
  dup?: true;
  excerpt?: Record<string, unknown> | null;
}

/** Contexte figé à la création du job (aucune relecture du fichier lors des reprises). */
export interface ImportJobParams {
  v: 1;
  organizationId: string;
  supplierId: string;
  sourceId: string;
  feedId: string;
  sourceType: SourceType;
  organizationCurrency: string;
  defaultCurrency: string | null;
  defaultTaxType: TaxType;
  defaultCountry: string | null;
  feedFormat: FeedFormat;
  mode: IngestMode;
  trigger: SyncTrigger;
  createdBy: string | null;
  runId: string;
  runStartedAt: string;
  totalRows: number;
  truncated: boolean;
  quality: ImportQualityResult | null;
  columns: string[];
  previousSuccessfulSyncAt: string | null;
  previousRecordCount: number | null;
  /** mapping à mémoriser pour le fournisseur à la fin d'un import de fichier réussi */
  remember?: { headerSignature: string; columns: string[]; mapping: Json; defaults: Json; updatedBy: string | null } | null;
}

export interface ChunkStats {
  processed: number;
  stored: number;
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  invalid: number;
  duplicates: number;
  unrecognized: number;
  fxUnavailable: number;
  /** premières erreurs du lot (journal de synchronisation) */
  errors: SyncErrorInput[];
}

const EMPTY_STATS: ChunkStats = { processed: 0, stored: 0, created: 0, updated: 0, unchanged: 0, rejected: 0, invalid: 0, duplicates: 0, unrecognized: 0, fxUnavailable: 0, errors: [] };
const MAX_ERRORS_PER_CHUNK = 20;

/** Découpe les lignes lues en lots (pur). */
export function splitChunks(rows: ChunkRow[], size = IMPORT_CHUNK_ROWS): { index: number; firstIndex: number; rows: ChunkRow[] }[] {
  const out: { index: number; firstIndex: number; rows: ChunkRow[] }[] = [];
  for (let i = 0; i < rows.length; i += size) out.push({ index: out.length, firstIndex: rows[i]!.i, rows: rows.slice(i, i + size) });
  return out;
}

/** Numéro de ligne affiché : ligne du fichier (en-tête = ligne 1) pour un CSV / XLSX. */
export function lineOf(format: FeedFormat, index: number): number {
  return format === "csv" ? index + 2 : index + 1;
}

export interface CreateJobInput {
  admin: AdminSupabaseClient;
  params: ImportJobParams;
  rows: ChunkRow[];
  /** job déjà journalisé par l'appelant (import de fichier) ; sinon créé ici (flux distant) */
  jobId?: string | null;
  origin: "file" | "remote_feed";
  job?: { mapping: Json; fileName?: string | null; fileSha256?: string | null; fileSize?: number | null; format?: "csv" | "xlsx" | "xml" | "json"; sheet?: string | null; defaults?: Json };
  /** remarques globales (contrôle qualité) enregistrées comme incidents sans ligne */
  warnings?: string[];
}

/** Crée (ou complète) le job et enregistre ses lots. Renvoie l'identifiant du job. */
export async function createImportJob(input: CreateJobInput): Promise<string> {
  const { admin, params, rows } = input;
  const chunks = splitChunks(rows);
  const now = new Date().toISOString();
  const state = {
    status: "running" as const,
    sync_run_id: params.runId,
    rows_total: rows.length,
    rows_read: params.totalRows,
    rows_processed: 0,
    chunks_total: chunks.length,
    chunks_done: 0,
    attempts: 0,
    heartbeat_at: now,
    lease_owner: null,
    lease_expires_at: null,
    truncated: params.truncated,
    params: params as unknown as Json,
  };
  let jobId = input.jobId ?? null;
  if (jobId) {
    const { error } = await admin.from("sourcing_import_jobs").update(state).eq("id", jobId).eq("organization_id", params.organizationId);
    if (error) throw new Error(`Import non préparé : ${error.message}`);
  } else {
    const { data, error } = await admin
      .from("sourcing_import_jobs")
      .insert({
        organization_id: params.organizationId,
        supplier_id: params.supplierId,
        source_id: params.sourceId,
        feed_id: params.feedId,
        origin: input.origin,
        format: input.job?.format ?? params.feedFormat,
        file_name: input.job?.fileName ?? null,
        file_sha256: input.job?.fileSha256 ?? null,
        file_size: input.job?.fileSize ?? null,
        sheet: input.job?.sheet ?? null,
        mode: params.mode,
        mapping: input.job?.mapping ?? {},
        defaults: input.job?.defaults ?? {},
        created_by: params.createdBy,
        ...state,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Import non journalisé : ${error?.message ?? "inconnu"}`);
    jobId = data.id;
  }
  for (let k = 0; k < chunks.length; k += CHUNKS_PER_INSERT) {
    const { error } = await admin.from("sourcing_import_chunks").insert(
      chunks.slice(k, k + CHUNKS_PER_INSERT).map((c) => ({ job_id: jobId!, organization_id: params.organizationId, chunk_index: c.index, first_index: c.firstIndex, row_count: c.rows.length, rows: c.rows as unknown as Json, status: "pending" })),
    );
    if (error) {
      await failImportJob(admin, { id: jobId, organization_id: params.organizationId, params: params as unknown as Json }, `Import non préparé (enregistrement des lots impossible : ${error.message}).`);
      throw new Error(`Enregistrement des lots impossible : ${error.message}`);
    }
  }
  const warnings = (input.warnings ?? []).slice(0, 20);
  if (warnings.length) await admin.from("sourcing_import_issues").insert(warnings.map((w) => ({ organization_id: params.organizationId, job_id: jobId!, line: null, kind: "warning", reference: null, message: w.slice(0, 1000), excerpt: null })));
  return jobId;
}

type JobRow = {
  id: string;
  organization_id: string;
  status: string;
  params: Json;
  rows_total: number | null;
  rows_processed: number;
  chunks_total: number;
  chunks_done: number;
  attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  started_at: string;
  sync_run_id: string | null;
};

const JOB_STATE_COLUMNS = "id, organization_id, status, params, rows_total, rows_processed, chunks_total, chunks_done, attempts, lease_owner, lease_expires_at, heartbeat_at, started_at, sync_run_id";

function paramsOf(job: Pick<JobRow, "params">): ImportJobParams | null {
  const p = job.params as unknown as Partial<ImportJobParams> | null;
  return p && p.v === 1 && typeof p.feedId === "string" && typeof p.runId === "string" ? (p as ImportJobParams) : null;
}

/** Clôt un job en échec (journal compris) et purge ses lots : jamais de « running » orphelin. */
export async function failImportJob(admin: AdminSupabaseClient, job: Pick<JobRow, "id" | "organization_id" | "params">, message: string): Promise<void> {
  const finishedAt = new Date().toISOString();
  const { data } = await admin.from("sourcing_import_jobs").update({ status: "failed", message: message.slice(0, 2000), finished_at: finishedAt, lease_owner: null, lease_expires_at: null }).eq("id", job.id).eq("status", "running").select("id");
  await admin.from("sourcing_import_chunks").delete().eq("job_id", job.id);
  if (!data || data.length === 0) return;
  const p = paramsOf(job);
  if (p) {
    await admin.from("sync_runs").update({ status: "failed", finished_at: finishedAt, error_summary: message.slice(0, 2000) }).eq("id", p.runId).eq("status", "running");
    await admin.from("supplier_feeds").update({ last_sync_at: p.runStartedAt, last_error: message.slice(0, 2000), status: "error" }).eq("id", p.feedId);
  }
  log.warn("import clos en échec", { jobId: job.id, message: message.slice(0, 200) });
}

export interface ProcessOptions {
  admin?: AdminSupabaseClient;
  /** budget de durée de ce traitement */
  budgetMs?: number;
  /** budget de calcul (normalisation, validation) : ~2 s de CPU par requête sur l'Edge */
  cpuBudgetMs?: number;
  clock?: () => number;
  /** horloge de calcul (tests) */
  cpuClock?: () => number;
  /** identifiant du traitement (bail) */
  owner?: string;
  /** coupure simulée après N lots (tests d'interruption) */
  crashAfterChunks?: number;
}

export interface ProcessOutcome {
  jobId: string;
  /** le traitement a-t-il pu prendre le job (sinon : déjà en cours ailleurs, ou terminé) */
  claimed: boolean;
  status: string;
  done: boolean;
  progress: ImportProgress;
  chunksThisRun: number;
  /** résultat final quand le job vient de se terminer */
  result: IngestResult | null;
  message: string | null;
}

function progressOf(job: Pick<JobRow, "rows_processed" | "rows_total" | "chunks_done" | "chunks_total">): ImportProgress {
  return { rowsProcessed: job.rows_processed, rowsTotal: job.rows_total ?? 0, chunksDone: job.chunks_done, chunksTotal: job.chunks_total };
}

async function loadJob(admin: AdminSupabaseClient, jobId: string): Promise<JobRow | null> {
  const { data, error } = await admin.from("sourcing_import_jobs").select(JOB_STATE_COLUMNS).eq("id", jobId).maybeSingle();
  if (error) throw new Error(`Lecture de l'import impossible : ${error.message}`);
  return (data ?? null) as JobRow | null;
}

/** Prise du bail (compare-and-set sur la valeur observée) : un seul traitement à la fois par job. */
async function claimJob(admin: AdminSupabaseClient, job: JobRow, owner: string, nowMs: number): Promise<boolean> {
  if (job.status !== "running") return false;
  if (job.lease_expires_at && new Date(job.lease_expires_at).getTime() > nowMs) return false;
  const patch = { lease_owner: owner, lease_expires_at: new Date(nowMs + IMPORT_LEASE_MS).toISOString(), heartbeat_at: new Date(nowMs).toISOString(), attempts: job.attempts + 1 };
  const q = admin.from("sourcing_import_jobs").update(patch).eq("id", job.id).eq("status", "running");
  const { data, error } = await (job.lease_expires_at ? q.eq("lease_expires_at", job.lease_expires_at) : q.is("lease_expires_at", null)).select("id");
  if (error) throw new Error(`Prise en charge de l'import impossible : ${error.message}`);
  return Boolean(data && data.length === 1);
}

function storageContextOf(admin: AdminSupabaseClient, p: ImportJobParams, jobId: string, now: Date): StorageContext {
  return {
    supabase: admin,
    organizationId: p.organizationId,
    organizationCurrency: p.organizationCurrency,
    supplierId: p.supplierId,
    sourceId: p.sourceId,
    sourceType: p.sourceType,
    feedId: p.feedId,
    defaultCurrency: p.defaultCurrency,
    defaultTaxType: p.defaultTaxType,
    defaultCountry: p.defaultCountry,
    createdBy: p.createdBy,
    now,
    importJobId: jobId,
  };
}

/** Traite UN lot : écriture groupée, incidents de ses lignes (remplacés en cas de reprise), compteurs. */
async function processChunk(admin: AdminSupabaseClient, jobId: string, p: ImportJobParams, chunk: { chunk_index: number; first_index: number; row_count: number; rows: Json }, issuesLeft: number, cpuClock: () => number): Promise<{ stats: ChunkStats; issues: IngestIssue[]; computeMs: number }> {
  const rows = (Array.isArray(chunk.rows) ? chunk.rows : []) as unknown as ChunkRow[];
  const stats: ChunkStats = { ...EMPTY_STATS, errors: [] };
  const issues: IngestIssue[] = [];
  const issue = (i: IngestIssue) => {
    if (issues.length < issuesLeft) issues.push(i);
  };
  const err = (e: SyncErrorInput) => {
    if (stats.errors.length < MAX_ERRORS_PER_CHUNK) stats.errors.push(e);
  };
  const toStore: { row: ChunkRow; offer: RawOffer }[] = [];
  for (const r of rows) {
    stats.processed++;
    const line = lineOf(p.feedFormat, r.i);
    if (r.dup) {
      stats.duplicates++;
      err({ code: "ROW_DUPLICATE", message: "Référence déjà présente plus haut dans le fichier : ligne ignorée.", entityType: "feed_row", entityRef: String(r.i + 1) });
      issue({ line, kind: "duplicate", reference: r.offer?.externalOfferId ?? null, message: "Référence déjà présente plus haut dans le fichier : ligne ignorée.", excerpt: r.excerpt ?? rowExcerpt(r.offer?.raw as Record<string, unknown> | undefined) });
      continue;
    }
    if (!r.offer) {
      stats.invalid++;
      const message = (r.errors ?? []).join(" ");
      err({ code: "ROW_INVALID", message, entityType: "feed_row", entityRef: String(r.i + 1) });
      issue({ line, kind: "invalid", reference: null, message: message.slice(0, 1000), excerpt: r.excerpt ?? null });
      continue;
    }
    for (const w of r.warnings ?? []) issue({ line, kind: "warning", reference: r.offer.externalOfferId, message: w, excerpt: null });
    toStore.push({ row: r, offer: r.offer });
  }
  const batch = await storeOffersBatch(storageContextOf(admin, p, jobId, new Date(p.runStartedAt)), toStore.map((t) => t.offer), { clock: cpuClock });
  const byId = new Map(batch.items.map((it) => [it.externalOfferId, it]));
  for (const t of toStore) {
    const line = lineOf(p.feedFormat, t.row.i);
    const it = byId.get(t.offer.externalOfferId);
    if (it && it.outcome === "stored") {
      stats.stored++;
      if (it.created || it.createdByThisJob) stats.created++;
      else if (it.changed) stats.updated++;
      else stats.unchanged++;
      if (it.fxUnavailable) stats.fxUnavailable++;
      if (it.unrecognized) {
        stats.unrecognized++;
        issue({ line, kind: "unrecognized", reference: t.offer.externalOfferId, message: "Marque ou modèle non reconnus : offre enregistrée, rapprochement avec votre stock à faire manuellement.", excerpt: null });
      }
      continue;
    }
    stats.rejected++;
    const why = it?.error ?? (it ? it.validation.anomalies.map((a) => a.message).join(" ; ") : "Offre non traitée.");
    err({ code: it?.error ? "OFFER_STORE_FAILED" : "OFFER_REJECTED", message: why, entityType: "offer", entityRef: t.offer.externalOfferId });
    issue({ line, kind: "rejected", reference: t.offer.externalOfferId, message: why.slice(0, 1000) || "Offre rejetée par la validation.", excerpt: it?.error ? null : rowExcerpt(t.offer.raw as Record<string, unknown> | undefined) });
  }
  return { stats, issues, computeMs: batch.computeMs };
}

function sumStats(list: ChunkStats[]): ChunkStats {
  const total: ChunkStats = { ...EMPTY_STATS, errors: [] };
  for (const s of list) {
    for (const k of ["processed", "stored", "created", "updated", "unchanged", "rejected", "invalid", "duplicates", "unrecognized", "fxUnavailable"] as const) total[k] += Number(s[k] ?? 0);
    total.errors.push(...(s.errors ?? []));
  }
  return total;
}

/** Clôture unique du job : agrégats, expiration « catalogue complet », journal, état du flux et de la source. */
async function finalizeJob(admin: AdminSupabaseClient, job: JobRow, p: ImportJobParams, owner: string): Promise<IngestResult | null> {
  const { data: chunks, error } = await admin.from("sourcing_import_chunks").select("chunk_index, status, stats").eq("job_id", job.id).order("chunk_index", { ascending: true });
  if (error) throw new Error(`Lecture des lots impossible : ${error.message}`);
  if ((chunks ?? []).some((c) => c.status !== "done")) return null;
  const total = sumStats((chunks ?? []).map((c) => c.stats as unknown as ChunkStats));
  const runStartedAt = new Date(p.runStartedAt);
  let expired = 0;
  // Catalogue complet uniquement : expiration des offres absentes (fichier livré et lu en entier).
  if (p.mode === "snapshot" && total.stored > 0 && !p.truncated) expired = await expireUnseenOffers({ supabase: admin, organizationId: p.organizationId, sourceId: p.sourceId }, runStartedAt);
  const errors: SyncErrorInput[] = [...(p.truncated ? [{ code: "FEED_TRUNCATED", message: `Le flux contient ${p.totalRows} lignes : seules les ${MAX_IMPORT_ROWS} premières ont été traitées. Scindez le fichier ou filtrez-le côté fournisseur.`, entityType: "feed", entityRef: p.feedId }] : []), ...total.errors];
  const errorCount = (p.truncated ? 1 : 0) + total.duplicates + total.invalid + total.rejected;
  const status: IngestResult["status"] = total.stored === 0 && total.processed > 0 ? "failed" : errorCount > 0 ? "partial" : "success";
  const message =
    total.processed === 0
      ? "Le flux ne contient aucune ligne."
      : `${total.created} nouvelle(s) offre(s), ${total.updated} mise(s) à jour, ${total.unchanged} inchangée(s), ${total.invalid} ligne(s) illisible(s), ${total.rejected} rejetée(s)${total.duplicates ? `, ${total.duplicates} doublon(s) ignoré(s)` : ""}${p.mode === "snapshot" ? `, ${expired} expirée(s) (absentes du catalogue complet)` : ""}.`;
  // Clôture du job d'abord (compare-and-set : une seule clôture même si deux traitements terminent ensemble).
  const finishedAt = new Date().toISOString();
  const jobStatus = status === "success" ? "completed" : status;
  const { data: closed } = await admin
    .from("sourcing_import_jobs")
    .update({
      status: jobStatus,
      rows_processed: total.processed,
      rows_valid: Math.max(0, total.processed - total.invalid - total.duplicates),
      offers_created: total.created,
      offers_updated: total.updated,
      offers_unchanged: total.unchanged,
      duplicates: total.duplicates,
      rows_invalid: total.invalid,
      offers_rejected: total.rejected,
      products_unrecognized: total.unrecognized,
      offers_expired: expired,
      truncated: p.truncated,
      message: message.slice(0, 2000),
      finished_at: finishedAt,
      lease_owner: null,
      lease_expires_at: null,
      heartbeat_at: finishedAt,
    })
    .eq("id", job.id)
    .eq("status", "running")
    .eq("lease_owner", owner)
    .select("id");
  if (!closed || closed.length === 0) return null;
  const run: SyncRunHandle = { id: p.runId, organizationId: p.organizationId, startedAt: runStartedAt };
  await recordSyncErrors(admin, run, errors);
  await finishSyncRun(admin, run, { status, recordsProcessed: total.processed, errorCount, stats: { stored: total.stored, created: total.created, updated: total.updated, unchanged: total.unchanged, unrecognized: total.unrecognized, rejected: total.rejected, invalidRows: total.invalid, expired, fxUnavailable: total.fxUnavailable, truncated: p.truncated, mode: p.mode, totalRows: p.totalRows, columns: p.columns.slice(0, 50), importJobId: job.id, chunks: job.chunks_total } as Json, errorSummary: status === "failed" ? message : null });
  await admin
    .from("supplier_feeds")
    .update({ last_sync_at: p.runStartedAt, last_successful_sync_at: status !== "failed" ? finishedAt : p.previousSuccessfulSyncAt, last_record_count: status !== "failed" ? total.processed : p.previousRecordCount, last_error: status === "failed" ? message : null, status: status === "failed" ? "error" : "active" })
    .eq("id", p.feedId);
  if (status !== "failed") await admin.from("supplier_sources").update({ status: "active", last_sync_at: p.runStartedAt, last_successful_sync_at: finishedAt, last_error: null }).eq("id", p.sourceId);
  if (status !== "failed" && p.remember) await rememberMapping(admin, p);
  await admin.from("sourcing_import_chunks").delete().eq("job_id", job.id);
  return { feedId: p.feedId, runId: p.runId, status, processed: total.processed, stored: total.stored, rejected: total.rejected, invalidRows: total.invalid, expired, fxUnavailable: total.fxUnavailable, message, duplicates: total.duplicates, quarantined: false, quality: p.quality ?? undefined, created: total.created, updated: total.updated, unchanged: total.unchanged, unrecognized: total.unrecognized, totalRows: p.totalRows, truncated: p.truncated, mode: p.mode, pending: false, jobId: job.id, progress: { rowsProcessed: total.processed, rowsTotal: job.rows_total ?? total.processed, chunksDone: job.chunks_total, chunksTotal: job.chunks_total } };
}

/** Mapping mémorisé pour ce fournisseur et ce modèle de fichier (proposé au prochain import). */
async function rememberMapping(admin: AdminSupabaseClient, p: ImportJobParams): Promise<void> {
  const r = p.remember;
  if (!r) return;
  const { data: existing } = await admin.from("sourcing_mapping_profiles").select("id, use_count").eq("organization_id", p.organizationId).eq("supplier_id", p.supplierId).eq("header_signature", r.headerSignature).maybeSingle();
  const patch = { mapping: r.mapping, defaults: r.defaults, columns: r.columns.slice(0, 200), updated_by: r.updatedBy };
  if (existing) await admin.from("sourcing_mapping_profiles").update({ ...patch, use_count: existing.use_count + 1 }).eq("id", existing.id);
  else await admin.from("sourcing_mapping_profiles").insert({ organization_id: p.organizationId, supplier_id: p.supplierId, header_signature: r.headerSignature, ...patch });
}

/**
 * Traite les lots en attente d'un job dans le budget donné, puis le clôt s'il est terminé.
 * Sûr à appeler plusieurs fois et en parallèle (bail + compare-and-set) : idempotent.
 */
export async function processImportJob(jobId: string, options: ProcessOptions = {}): Promise<ProcessOutcome> {
  const admin = options.admin ?? createAdminSupabaseClient();
  const clock = options.clock ?? Date.now;
  const cpuClock = options.cpuClock ?? (() => performance.now());
  const owner = options.owner ?? randomUUID();
  const deadline = clock() + (options.budgetMs ?? 90_000);
  const cpuBudget = options.cpuBudgetMs ?? Number.POSITIVE_INFINITY;
  let cpuUsed = 0;
  const job = await loadJob(admin, jobId);
  if (!job) throw new Error("Import introuvable.");
  const base = (j: JobRow, extra: Partial<ProcessOutcome> = {}): ProcessOutcome => ({ jobId, claimed: false, status: j.status, done: j.status !== "running", progress: progressOf(j), chunksThisRun: 0, result: null, message: null, ...extra });
  if (job.status !== "running") return base(job);
  const p = paramsOf(job);
  if (!p) {
    // job d'une version précédente (sans lots) : jamais repris, clos s'il est ancien
    if (clock() - new Date(job.started_at).getTime() > IMPORT_UNSPLIT_STALE_MS) await failImportJob(admin, job, "Import interrompu avant son découpage en lots (fonction coupée) : relancez l'import.");
    return base((await loadJob(admin, jobId)) ?? job);
  }
  if (!(await claimJob(admin, job, owner, clock()))) return base(job, { message: "Import déjà en cours de traitement ailleurs." });
  if (job.attempts + 1 > IMPORT_MAX_IDLE_ATTEMPTS) {
    await failImportJob(admin, job, `Import interrompu à ${job.attempts} reprises sans avancer (lot ${job.chunks_done + 1}/${job.chunks_total}) : relancez l'import ou scindez le fichier.`);
    return base((await loadJob(admin, jobId)) ?? job, { claimed: true });
  }
  // Journal remplacé (run « running » clos par un import plus récent) : ce job ne doit plus écrire.
  const { data: run } = await admin.from("sync_runs").select("status").eq("id", p.runId).maybeSingle();
  if (run && run.status !== "running") {
    await failImportJob(admin, job, "Import interrompu : un import plus récent a démarré sur ce flux (ou le journal a été clos).");
    return base((await loadJob(admin, jobId)) ?? job, { claimed: true });
  }

  let state = job;
  let chunksThisRun = 0;
  for (;;) {
    if (deadline - clock() < IMPORT_MIN_CHUNK_MS || cpuUsed >= cpuBudget) break;
    if (options.crashAfterChunks !== undefined && chunksThisRun >= options.crashAfterChunks) throw new Error("Coupure simulée du traitement.");
    const { data: next, error: nextErr } = await admin.from("sourcing_import_chunks").select("chunk_index, first_index, row_count, rows").eq("job_id", jobId).eq("status", "pending").order("chunk_index", { ascending: true }).limit(1).maybeSingle();
    if (nextErr) throw new Error(`Lecture du lot suivant impossible : ${nextErr.message}`);
    if (!next) break;
    const { count: issueCount } = await admin.from("sourcing_import_issues").select("id", { count: "exact", head: true }).eq("job_id", jobId);
    // reprise d'un lot interrompu : ses incidents déjà écrits sont remplacés (pas de doublon)
    const firstLine = lineOf(p.feedFormat, next.first_index);
    const lastLine = lineOf(p.feedFormat, next.first_index + next.row_count - 1);
    await admin.from("sourcing_import_issues").delete().eq("job_id", jobId).gte("line", firstLine).lte("line", lastLine);
    const { stats, issues, computeMs } = await processChunk(admin, jobId, p, next, Math.max(0, MAX_IMPORT_ISSUES - (issueCount ?? 0)), cpuClock);
    cpuUsed += computeMs;
    if (issues.length) {
      const rows = issues.map((i) => ({ organization_id: p.organizationId, job_id: jobId, line: i.line, kind: i.kind, reference: i.reference?.slice(0, 200) ?? null, message: i.message.slice(0, 1000), excerpt: (i.excerpt ?? null) as Json }));
      for (let k = 0; k < rows.length; k += 200) await admin.from("sourcing_import_issues").insert(rows.slice(k, k + 200));
    }
    const { data: marked } = await admin.from("sourcing_import_chunks").update({ status: "done", stats: stats as unknown as Json, processed_at: new Date(clock()).toISOString() }).eq("job_id", jobId).eq("chunk_index", next.chunk_index).eq("status", "pending").select("chunk_index");
    if (!marked || marked.length === 0) break;
    const nowMs = clock();
    const { data: beat } = await admin
      .from("sourcing_import_jobs")
      .update({ rows_processed: state.rows_processed + next.row_count, chunks_done: state.chunks_done + 1, attempts: 0, heartbeat_at: new Date(nowMs).toISOString(), lease_expires_at: new Date(nowMs + IMPORT_LEASE_MS).toISOString() })
      .eq("id", jobId)
      .eq("lease_owner", owner)
      .select(JOB_STATE_COLUMNS);
    // bail perdu (repris ailleurs après expiration) : on s'arrête sans rien écraser
    if (!beat || beat.length === 0) return base(state, { claimed: true, chunksThisRun, message: "Bail perdu : le traitement continue ailleurs." });
    state = beat[0] as JobRow;
    chunksThisRun++;
  }

  if (state.chunks_done >= state.chunks_total) {
    const result = await finalizeJob(admin, state, p, owner);
    const after = (await loadJob(admin, jobId)) ?? state;
    return { jobId, claimed: true, status: after.status, done: after.status !== "running", progress: progressOf(after), chunksThisRun, result, message: result?.message ?? null };
  }
  // Libère le bail : la suite peut être reprise immédiatement (utilisateur ou tâche planifiée).
  await admin.from("sourcing_import_jobs").update({ lease_owner: null, lease_expires_at: null }).eq("id", jobId).eq("lease_owner", owner);
  return { jobId, claimed: true, status: "running", done: false, progress: progressOf(state), chunksThisRun, result: null, message: `Import en cours : ${state.rows_processed} / ${state.rows_total ?? "?"} lignes traitées ; la suite est reprise automatiquement.` };
}

/** Résultat « en cours » (contrat IngestResult) d'un job non terminé. */
export function pendingIngestResult(p: Pick<ImportJobParams, "feedId" | "runId" | "totalRows" | "truncated" | "mode" | "quality">, outcome: ProcessOutcome): IngestResult {
  const pr = outcome.progress;
  return {
    feedId: p.feedId,
    runId: p.runId,
    status: "partial",
    processed: pr.rowsProcessed,
    stored: 0,
    rejected: 0,
    invalidRows: 0,
    expired: 0,
    fxUnavailable: 0,
    message: `Import en cours : ${pr.rowsProcessed} / ${pr.rowsTotal} lignes traitées (${pr.chunksDone} / ${pr.chunksTotal} lots). La suite est traitée automatiquement ; suivez l'avancement dans l'historique des imports.`,
    quality: p.quality ?? undefined,
    totalRows: p.totalRows,
    truncated: p.truncated,
    mode: p.mode,
    pending: true,
    jobId: outcome.jobId,
    progress: pr,
  };
}

/** Clôt les jobs abandonnés ou jamais découpés (aucun « running » indéfini). */
export async function reapStaleImportJobs(admin: AdminSupabaseClient, nowMs: number = Date.now()): Promise<number> {
  const { data, error } = await admin.from("sourcing_import_jobs").select(JOB_STATE_COLUMNS).eq("status", "running").order("started_at", { ascending: true }).limit(200);
  if (error) throw new Error(`Lecture des imports en cours impossible : ${error.message}`);
  let reaped = 0;
  for (const j of (data ?? []) as JobRow[]) {
    const leaseActive = j.lease_expires_at !== null && new Date(j.lease_expires_at).getTime() > nowMs;
    if (leaseActive) continue;
    const lastActivity = new Date(j.heartbeat_at ?? j.started_at).getTime();
    const unsplit = !paramsOf(j) && nowMs - new Date(j.started_at).getTime() > IMPORT_UNSPLIT_STALE_MS;
    if (unsplit) await failImportJob(admin, j, "Import interrompu avant son découpage en lots (fonction coupée) : relancez l'import.");
    else if (nowMs - lastActivity > IMPORT_ABANDON_MS) await failImportJob(admin, j, "Import abandonné : aucune reprise depuis 24 h. Relancez l'import.");
    else if (j.attempts >= IMPORT_MAX_IDLE_ATTEMPTS) await failImportJob(admin, j, `Import interrompu à ${j.attempts} reprises sans avancer : relancez l'import ou scindez le fichier.`);
    else continue;
    reaped++;
  }
  return reaped;
}

export interface PendingImportJobsRun {
  reaped: number;
  resumed: { jobId: string; status: string; chunks: number; rowsProcessed: number; rowsTotal: number }[];
  /** jobs en attente non repris faute de temps */
  waiting: number;
}

/** Tâche planifiée : clôt les jobs abandonnés puis reprend les jobs en attente (bail libre ou expiré), dans le budget. */
export async function runPendingImportJobs(options: { admin?: AdminSupabaseClient; budgetMs?: number; cpuBudgetMs?: number; clock?: () => number } = {}): Promise<PendingImportJobsRun> {
  const admin = options.admin ?? createAdminSupabaseClient();
  const clock = options.clock ?? Date.now;
  const deadline = clock() + (options.budgetMs ?? 60_000);
  const reaped = await reapStaleImportJobs(admin, clock());
  const { data, error } = await admin.from("sourcing_import_jobs").select("id, lease_expires_at, started_at").eq("status", "running").order("lease_expires_at", { ascending: true, nullsFirst: true }).order("started_at", { ascending: true }).limit(50);
  if (error) throw new Error(`Lecture des imports en attente impossible : ${error.message}`);
  const nowMs = clock();
  const ready = (data ?? []).filter((j) => !j.lease_expires_at || new Date(j.lease_expires_at).getTime() <= nowMs);
  const resumed: PendingImportJobsRun["resumed"] = [];
  let waiting = 0;
  for (const j of ready) {
    const remaining = deadline - clock();
    if (remaining < IMPORT_MIN_CHUNK_MS) {
      waiting++;
      continue;
    }
    try {
      const r = await processImportJob(j.id, { admin, budgetMs: remaining, cpuBudgetMs: options.cpuBudgetMs, clock });
      if (r.claimed) resumed.push({ jobId: j.id, status: r.status, chunks: r.chunksThisRun, rowsProcessed: r.progress.rowsProcessed, rowsTotal: r.progress.rowsTotal });
    } catch (e) {
      log.error("reprise d'import en échec", { jobId: j.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { reaped, resumed, waiting };
}
