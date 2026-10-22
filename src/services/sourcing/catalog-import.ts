import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import { AppError, fromPostgrestError } from "@/lib/errors";
import type { CatalogFileFormat, CatalogImportDTO, CatalogPreviewDTO, ImportJobDTO, ImportJobDetailDTO } from "@/features/mobile-api/contract";
import { RAW_OFFER_FIELDS } from "@/domain/sourcing/types";
import { fieldMappingSchema, looseHeader, mapRow, parseFeedContent, previewFeed, suggestMappingDetailed, type FeedFormat, type FeedOptions, type FieldMapping, type MappingConfidence } from "@/services/sourcing/feed-parsers";
import { ingestFeed, type IngestResult } from "@/services/sourcing/feed-ingestion";
import { processImportJob } from "@/services/sourcing/import-jobs";
import { rowIdentity } from "@/domain/sourcing/import-quality";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { readXlsx, sheetToCsv, XlsxError } from "@/services/sourcing/xlsx";

/**
 * Import d'un catalogue / d'une grille tarifaire FOURNI PAR LE FOURNISSEUR (fichier CSV, Excel
 * .xlsx, XML ou JSON transmis par e-mail, téléchargé depuis son espace pro, etc.).
 *
 * 1. `previewCatalogFile` : lecture, détection des colonnes, mapping proposé, 10 lignes
 *    converties et comptage des lignes exploitables — rien n'est enregistré.
 * 2. `importCatalogFile` : fournisseur (existant ou créé), source « Import de catalogue »
 *    et flux sans URL réutilisés d'un import à l'autre, puis ingestion par le pipeline commun
 *    (validation, normalisation des devises, historique des prix, journal de synchronisation).
 *
 * Les prix enregistrés sont des « prix importés d'un catalogue » (date de l'import), jamais
 * présentés comme vérifiés en direct.
 */

export type { CatalogFileFormat, CatalogImportDTO, CatalogPreviewDTO };
export const MAX_CATALOG_BYTES = 15 * 1024 * 1024;
export const CATALOG_IMPORT_KIND = "catalog_file_import";

export const catalogFileSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  /** contenu du fichier encodé en base64 */
  contentBase64: z.string().min(4).max(Math.ceil((MAX_CATALOG_BYTES * 4) / 3) + 8, "Fichier trop volumineux (15 Mo maximum)."),
  format: z.enum(["csv", "xlsx", "xml", "json"]).optional(),
  sheet: z.string().max(100).optional(),
});

export const catalogDefaultsSchema = z.object({
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Devise sur 3 lettres (EUR, USD…).").transform((s) => s.toUpperCase()),
  taxType: z.enum(["ht", "ttc", "unknown"]).default("unknown"),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).nullish(),
});

export const catalogPreviewSchema = z.object({
  file: catalogFileSchema,
  mapping: fieldMappingSchema.optional(),
  defaults: catalogDefaultsSchema.partial({ currency: true }).optional(),
  /** fournisseur choisi : retrouve son mapping mémorisé et signale un fichier déjà importé */
  supplierId: z.string().uuid().optional(),
});

export const importModeSchema = z.enum(["partial", "snapshot"]);

export const catalogImportSchema = z
  .object({
    file: catalogFileSchema,
    mapping: fieldMappingSchema,
    defaults: catalogDefaultsSchema,
    supplierId: z.string().uuid().optional(),
    supplierName: z.string().trim().min(2).max(160).optional(),
    /** confirmation explicite après un import suspendu par le contrôle de qualité */
    force: z.boolean().optional(),
    /**
     * partial (défaut) : seules les lignes du fichier sont créées / mises à jour ;
     * snapshot : catalogue COMPLET, les offres absentes du fichier sont marquées « expirées ».
     */
    mode: importModeSchema.default("partial"),
    /** confirmation explicite pour réimporter un fichier identique à un import déjà réussi */
    allowSameFile: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.supplierId) !== Boolean(d.supplierName), { message: "Choisissez un fournisseur existant ou indiquez le nom d'un nouveau fournisseur." })
  .refine((d) => Boolean(d.mapping.title && d.mapping.price && (d.mapping.external_offer_id || d.mapping.supplier_sku || d.mapping.ean)), {
    message: "Associez au minimum la référence (ou l'EAN), la désignation et le prix.",
  });

export type CatalogFileInput = z.infer<typeof catalogFileSchema>;

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new AppError("VALIDATION", "Fichier illisible (encodage invalide).");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (out.byteLength > MAX_CATALOG_BYTES) throw new AppError("VALIDATION", "Fichier trop volumineux (15 Mo maximum).");
  if (out.byteLength === 0) throw new AppError("VALIDATION", "Le fichier est vide.");
  return out;
}

/** Format d'après l'extension, sinon d'après le contenu. */
export function detectCatalogFormat(fileName: string, bytes: Uint8Array): CatalogFileFormat {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "xls") throw new AppError("VALIDATION", "Les anciens fichiers Excel .xls ne sont pas pris en charge : enregistrez-le en .xlsx ou .csv.");
  if (ext === "csv" || ext === "txt" || ext === "tsv") return "csv";
  if (ext === "xml") return "xml";
  if (ext === "json") return "json";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx";
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 200)).replace(/^﻿/, "").trimStart();
  if (head.startsWith("<")) return "xml";
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  return "csv";
}

/** Texte UTF-8 ; à défaut Windows-1252 (exports Excel « CSV » français). */
export function decodeText(bytes: Uint8Array): { text: string; encoding: "utf-8" | "windows-1252" } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    return { text: decodeWindows1252(bytes), encoding: "windows-1252" };
  }
}

/** Plage 0x80–0x9F de Windows-1252 (€, guillemets, tirets…) ; ailleurs identique à Latin-1. */
const CP1252_HIGH = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd,
  0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178,
];

/**
 * Décodage Windows-1252 explicite : le TextDecoder de Node le traite comme du Latin-1 (« € »,
 * « – », « ’ » perdus), celui de Deno non — la table garantit le même résultat partout.
 */
export function decodeWindows1252(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.subarray(i, i + 8192);
    out += String.fromCharCode(...Array.from(chunk, (b) => (b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80]! : b)));
  }
  return out.replace(/^\uFEFF/, "");
}

export interface LoadedCatalog {
  /** empreinte SHA-256 du fichier reçu (détection d'un réimport identique) */
  sha256: string;
  size: number;
  format: CatalogFileFormat;
  /** format du flux enregistré (xlsx → csv « ; ») */
  feedFormat: FeedFormat;
  content: string;
  options: FeedOptions;
  notes: string[];
}

export function loadCatalogFile(file: CatalogFileInput): LoadedCatalog {
  const bytes = decodeBase64(file.contentBase64);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const size = bytes.byteLength;
  const format = file.format ?? detectCatalogFormat(file.fileName, bytes);
  const notes: string[] = [];
  if (format === "xlsx") {
    try {
      const sheet = readXlsx(bytes, file.sheet);
      notes.push(`Feuille lue : « ${sheet.name} » (${sheet.rows.length} lignes, en-têtes en première ligne).`);
      if (sheet.truncated) notes.push(`Feuille tronquée : seules les ${sheet.rows.length - 1} premières lignes de données sont lues.`);
      return { sha256, size, format, feedFormat: "csv", content: sheetToCsv(sheet), options: { delimiter: ";" }, notes };
    } catch (e) {
      if (e instanceof XlsxError) throw new AppError("VALIDATION", e.message);
      throw e;
    }
  }
  const { text, encoding } = decodeText(bytes);
  if (encoding !== "utf-8") notes.push("Fichier encodé en Windows-1252 (export Excel) : converti en UTF-8.");
  return { sha256, size, format, feedFormat: format, content: text, options: {}, notes };
}

/** Signature d'un modèle de fichier : en-têtes normalisés (sans accents, casse, ponctuation), triés. */
export function headerSignature(columns: string[]): string {
  const norm = [...new Set(columns.map((c) => looseHeader(c).trim()).filter(Boolean))].sort();
  return createHash("sha256").update(norm.join("|"), "utf8").digest("hex");
}

/** Mapping proposé + type de prix déduit de l'en-tête de la colonne prix (« Prix HT », « Prix TTC »). */
export function suggestCatalogMapping(columns: string[]): FieldMapping {
  return suggestCatalogMappingDetailed(columns).mapping;
}

export function suggestCatalogMappingDetailed(columns: string[]): { mapping: FieldMapping; confidence: Partial<Record<string, MappingConfidence>> } {
  const { mapping, confidence } = suggestMappingDetailed(columns);
  const priceCol = typeof mapping.price === "string" ? looseHeader(mapping.price) : "";
  if (!mapping.tax_type && priceCol) {
    if (/ (ht|hors taxes?|excl|ex vat|net) /.test(priceCol)) mapping.tax_type = { const: "ht" };
    else if (/ (ttc|toutes taxes|incl|inc vat) /.test(priceCol)) mapping.tax_type = { const: "ttc" };
  }
  return { mapping, confidence };
}

export function previewCatalogFile(input: z.infer<typeof catalogPreviewSchema>, organizationCurrency: string, saved?: { mapping: FieldMapping } | null): CatalogPreviewDTO {
  const loaded = loadCatalogFile(input.file);
  const first = previewFeed(loaded.content, loaded.feedFormat, {}, loaded.options, {}, 1);
  const detailed = suggestCatalogMappingDetailed(first.columns);
  const suggested = detailed.mapping;
  // Ordre : mapping envoyé par l'utilisateur > mapping mémorisé pour ce modèle de fichier > proposition.
  const userMapping = input.mapping && Object.keys(input.mapping).length > 0 ? input.mapping : null;
  const savedUsable = saved && Object.values(saved.mapping).every((v) => typeof v !== "string" || first.columns.includes(v)) ? saved.mapping : null;
  const mapping = userMapping ?? savedUsable ?? suggested;
  const defaults = { currency: input.defaults?.currency ?? organizationCurrency, taxType: input.defaults?.taxType ?? "unknown", country: input.defaults?.country ?? null };
  const preview = previewFeed(loaded.content, loaded.feedFormat, mapping, loaded.options, defaults, 20);
  // Doublons de référence dans le fichier (même logique que l'import, sans écrire).
  const seen = new Set<string>();
  let duplicates = 0;
  for (const s of fullMapped(loaded, mapping, defaults)) {
    if (!s) continue;
    if (seen.has(s)) duplicates++;
    else seen.add(s);
  }
  return {
    fileSha256: loaded.sha256,
    fileSize: loaded.size,
    headerSignature: headerSignature(first.columns),
    mappingSource: userMapping ? "user" : savedUsable ? "saved" : "suggested",
    mappingConfidence: detailed.confidence,
    duplicates,
    alreadyImported: null,
    format: loaded.format,
    columns: preview.columns,
    suggestedMapping: suggested,
    mapping,
    total: preview.total,
    validCount: preview.validCount,
    invalidCount: preview.invalidCount,
    warnings: [...loaded.notes, ...preview.warnings],
    sample: preview.sample.map((s) => ({
      line: s.index + 2,
      title: s.offer?.title ?? null,
      reference: s.offer?.supplierSku ?? s.offer?.externalOfferId ?? null,
      price: s.offer?.price ?? null,
      currency: s.offer?.currency ?? null,
      taxType: s.offer?.taxType ?? null,
      quantity: s.offer?.availableQuantity ?? null,
      ean: s.offer?.ean ?? null,
      brand: s.offer?.brand ?? null,
      condition: s.offer?.condition ?? null,
      grade: s.offer?.grade ?? null,
      moq: s.offer?.moq ?? null,
      errors: s.errors,
      warnings: s.warnings ?? [],
    })),
    fields: RAW_OFFER_FIELDS,
  };
}

/** Identités de toutes les lignes mappées (doublons de l'aperçu), sans écriture. */
function fullMapped(loaded: LoadedCatalog, mapping: FieldMapping, defaults: { currency: string; taxType: "ht" | "ttc" | "unknown"; country: string | null }): (string | null)[] {
  const parsed = parseFeedContent(loaded.content, loaded.feedFormat, loaded.options);
  return parsed.rows.map((row) => {
    const m = mapRow(row, mapping, defaults);
    return m.offer ? rowIdentity(m.offer) : null;
  });
}

/**
 * Aperçu pour une organisation : mapping mémorisé du fournisseur pour ce modèle de fichier,
 * et dernier import réussi du MÊME fichier (empreinte identique) pour ce fournisseur.
 */
export async function previewCatalogFileForOrg(ctx: OrgContext, input: z.infer<typeof catalogPreviewSchema>, admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<CatalogPreviewDTO> {
  const orgId = ctx.organization.id;
  let saved: { mapping: FieldMapping } | null = null;
  const loaded = loadCatalogFile(input.file);
  const columns = previewFeed(loaded.content, loaded.feedFormat, {}, loaded.options, {}, 1).columns;
  if (input.supplierId) {
    const { data } = await ctx.supabase.from("sourcing_mapping_profiles").select("mapping").eq("organization_id", orgId).eq("supplier_id", input.supplierId).eq("header_signature", headerSignature(columns)).maybeSingle();
    const parsed = data ? fieldMappingSchema.safeParse(data.mapping) : null;
    if (parsed?.success) saved = { mapping: parsed.data };
  }
  const dto = previewCatalogFile(input, ctx.organization.default_currency, saved);
  if (input.supplierId) {
    const { data: prior } = await admin
      .from("sourcing_import_jobs")
      .select("id, started_at, file_name")
      .eq("organization_id", orgId)
      .eq("supplier_id", input.supplierId)
      .eq("file_sha256", loaded.sha256)
      .in("status", ["completed", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior) dto.alreadyImported = { jobId: prior.id, at: prior.started_at, fileName: prior.file_name };
  }
  return dto;
}

/** Budgets d'exécution d'un import dans la requête qui le lance (la suite est reprise par lots). */
export interface ImportRunBudget {
  /** durée maximale du traitement dans cette requête (défaut 90 s) */
  budgetMs?: number;
  /** calcul maximal (Edge : ~2 s de CPU par requête) */
  cpuBudgetMs?: number;
}

/**
 * Fournisseur → source « Import de catalogue » → flux sans URL, en UNE transaction (RPC, RLS de
 * l'utilisateur) : recherche du fournisseur par égalité insensible à la casse (aucun joker, S-18),
 * verrou contre deux imports simultanés, aucun objet orphelin en cas d'échec.
 */
async function prepareCatalogImport(ctx: OrgContext, input: z.infer<typeof catalogImportSchema>, loaded: LoadedCatalog): Promise<{ supplierId: string; supplierName: string; sourceId: string; feedId: string }> {
  const { data, error } = await ctx.supabase.rpc("sourcing_prepare_catalog_import", {
    p_organization_id: ctx.organization.id,
    p_supplier_id: input.supplierId ?? null,
    p_supplier_name: input.supplierId ? null : (input.supplierName ?? "").trim(),
    p_source_type: loaded.feedFormat.toUpperCase(),
    p_currency: input.defaults.currency,
    p_tax_type: input.defaults.taxType,
    p_country: input.defaults.country ?? null,
    p_feed_format: loaded.feedFormat,
    p_field_mapping: input.mapping as unknown as Json,
    p_options: loaded.options as unknown as Json,
  });
  if (error) {
    if (error.code === "P0002") throw new AppError("NOT_FOUND", "Fournisseur introuvable dans cette organisation.");
    throw fromPostgrestError(error);
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new AppError("INTERNAL", "Préparation de l'import impossible (aucun fournisseur renvoyé).");
  return { supplierId: row.supplier_id, supplierName: row.supplier_name, sourceId: row.source_id, feedId: row.feed_id };
}

/** Import réel (rôle rédacteur requis par l'appelant ; écritures sous RLS pour fournisseur, source, flux). */
export async function importCatalogFile(ctx: OrgContext, input: z.infer<typeof catalogImportSchema>, budget: ImportRunBudget = {}): Promise<CatalogImportDTO> {
  const orgId = ctx.organization.id;
  const loaded = loadCatalogFile(input.file);

  // 1 à 3. Fournisseur, source et flux (transaction unique)
  const { supplierId, sourceId, feedId } = await prepareCatalogImport(ctx, input, loaded);

  // 4. Fichier identique déjà importé avec succès pour ce fournisseur : aucun réimport sans confirmation.
  const admin = createAdminSupabaseClient();
  if (!input.allowSameFile) {
    const { data: prior } = await admin
      .from("sourcing_import_jobs")
      .select("id, started_at")
      .eq("organization_id", orgId)
      .eq("source_id", sourceId)
      .eq("file_sha256", loaded.sha256)
      .in("status", ["completed", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior) {
      const message = "Ce fichier (contenu identique) a déjà été importé pour ce fournisseur : rien n'a été modifié. Confirmez pour le réimporter quand même.";
      const job = await createImportJob(admin, ctx, { supplierId, sourceId, feedId, loaded, input, status: "skipped_duplicate", message });
      return { supplierId, sourceId, feedId, importJobId: job, alreadyImported: { jobId: prior.id, at: prior.started_at }, result: { runId: null, status: "failed", processed: 0, stored: 0, rejected: 0, invalidRows: 0, expired: 0, fxUnavailable: 0, message } };
    }
  }

  // 5. Journal de l'import, puis ingestion par lots reprenables (journal sync_runs). Le mapping est
  //    mémorisé à la clôture du job s'il réussit (y compris quand la fin est traitée par une reprise).
  const jobId = await createImportJob(admin, ctx, { supplierId, sourceId, feedId, loaded, input, status: "running", message: null });
  const columns = previewFeed(loaded.content, loaded.feedFormat, {}, loaded.options, {}, 1).columns;
  let result: IngestResult;
  try {
    result = await ingestFeed(feedId, {
      trigger: "manual",
      createdBy: ctx.user.id,
      content: loaded.content,
      force: input.force === true,
      mode: input.mode,
      importJobId: jobId,
      admin,
      origin: "file",
      budgetMs: budget.budgetMs ?? 90_000,
      cpuBudgetMs: budget.cpuBudgetMs,
      remember: { headerSignature: headerSignature(columns), columns: columns.slice(0, 200), mapping: input.mapping as unknown as Json, defaults: input.defaults as unknown as Json, updatedBy: ctx.user.id },
    });
  } catch (e) {
    await admin.from("sourcing_import_jobs").update({ status: "failed", message: (e instanceof Error ? e.message : String(e)).slice(0, 2000), finished_at: new Date().toISOString() }).eq("id", jobId).eq("status", "running");
    throw e;
  }
  // Import suspendu (qualité) ou en échec avant son découpage : le job est clos ici. Sinon le
  // moteur de lots tient le job à jour (progression, compteurs, incidents, clôture).
  if (result.quarantined || (result.status === "failed" && !result.jobId)) await finishImportJob(admin, orgId, jobId, result);
  const { feedId: _ignored, issues: _issues, ...rest } = result;
  return { supplierId, sourceId, feedId, importJobId: jobId, alreadyImported: null, result: rest };
}

/** Reprise d'un import en cours par l'utilisateur (rédacteur) : traite les lots suivants dans le budget. */
export async function resumeImportJob(ctx: OrgContext, jobId: string, budget: ImportRunBudget = {}, admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<ImportJobDTO> {
  // appartenance vérifiée sous la session de l'utilisateur (RLS)
  const { data, error } = await ctx.supabase.from("sourcing_import_jobs").select("id, status").eq("organization_id", ctx.organization.id).eq("id", jobId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw new AppError("NOT_FOUND", "Import introuvable dans cette organisation.");
  if (data.status === "running") await processImportJob(jobId, { admin, budgetMs: budget.budgetMs ?? 90_000, cpuBudgetMs: budget.cpuBudgetMs });
  return getImportJob(ctx, jobId);
}

async function createImportJob(
  admin: AdminSupabaseClient,
  ctx: OrgContext,
  j: { supplierId: string; sourceId: string; feedId: string; loaded: LoadedCatalog; input: z.infer<typeof catalogImportSchema>; status: "running" | "skipped_duplicate"; message: string | null },
): Promise<string> {
  const { data, error } = await admin
    .from("sourcing_import_jobs")
    .insert({
      organization_id: ctx.organization.id,
      supplier_id: j.supplierId,
      source_id: j.sourceId,
      feed_id: j.feedId,
      origin: "file",
      file_name: j.input.file.fileName.slice(0, 200),
      file_sha256: j.loaded.sha256,
      file_size: j.loaded.size,
      format: j.loaded.format,
      sheet: j.input.file.sheet ?? null,
      mode: j.input.mode,
      mapping: j.input.mapping as unknown as Json,
      defaults: j.input.defaults as unknown as Json,
      status: j.status,
      message: j.message,
      created_by: ctx.user.id,
      finished_at: j.status === "running" ? null : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw fromPostgrestError(error ?? { message: "Import non journalisé" });
  return data.id;
}

async function finishImportJob(admin: AdminSupabaseClient, organizationId: string, jobId: string, r: IngestResult): Promise<void> {
  const status = r.quarantined ? "quarantined" : r.status === "success" ? "completed" : r.status;
  await admin
    .from("sourcing_import_jobs")
    .update({
      sync_run_id: r.runId,
      status,
      rows_read: r.totalRows ?? r.processed,
      rows_valid: Math.max(0, r.processed - r.invalidRows - (r.duplicates ?? 0)),
      offers_created: r.created ?? 0,
      offers_updated: r.updated ?? 0,
      offers_unchanged: r.unchanged ?? 0,
      duplicates: r.duplicates ?? 0,
      rows_invalid: r.invalidRows,
      offers_rejected: r.rejected,
      products_unrecognized: r.unrecognized ?? 0,
      offers_expired: r.expired,
      truncated: r.truncated ?? false,
      message: r.message.slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  const issues = (r.issues ?? []).map((i) => ({ organization_id: organizationId, job_id: jobId, line: i.line, kind: i.kind, reference: i.reference?.slice(0, 200) ?? null, message: i.message.slice(0, 1000), excerpt: (i.excerpt ?? null) as Json }));
  for (let k = 0; k < issues.length; k += 200) await admin.from("sourcing_import_issues").insert(issues.slice(k, k + 200));
}

const JOB_COLUMNS =
  "id, supplier_id, source_id, origin, file_name, file_size, format, mode, status, rows_read, rows_valid, offers_created, offers_updated, offers_unchanged, duplicates, rows_invalid, offers_rejected, products_unrecognized, offers_expired, truncated, message, created_by, started_at, finished_at, rows_total, rows_processed, chunks_total, chunks_done, lease_expires_at, supplier:suppliers(name)";

type JobRow = {
  id: string;
  supplier_id: string | null;
  source_id: string | null;
  origin: string;
  file_name: string | null;
  file_size: number | null;
  format: string;
  mode: string;
  status: string;
  rows_read: number;
  rows_valid: number;
  offers_created: number;
  offers_updated: number;
  offers_unchanged: number;
  duplicates: number;
  rows_invalid: number;
  offers_rejected: number;
  products_unrecognized: number;
  offers_expired: number;
  truncated: boolean;
  message: string | null;
  created_by: string | null;
  started_at: string;
  finished_at: string | null;
  rows_total: number | null;
  rows_processed: number;
  chunks_total: number;
  chunks_done: number;
  lease_expires_at: string | null;
  supplier: { name: string } | null;
};

function toJobDTO(r: JobRow): ImportJobDTO {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: r.supplier?.name ?? null,
    sourceId: r.source_id,
    origin: r.origin as ImportJobDTO["origin"],
    fileName: r.file_name,
    fileSize: r.file_size,
    format: r.format as CatalogFileFormat,
    mode: r.mode as ImportJobDTO["mode"],
    status: r.status as ImportJobDTO["status"],
    counts: { read: r.rows_read, valid: r.rows_valid, created: r.offers_created, updated: r.offers_updated, unchanged: r.offers_unchanged, duplicates: r.duplicates, invalid: r.rows_invalid, rejected: r.offers_rejected, unrecognized: r.products_unrecognized, expired: r.offers_expired },
    truncated: r.truncated,
    message: r.message,
    createdBy: r.created_by,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    progress: r.chunks_total > 0 ? { rowsProcessed: r.rows_processed, rowsTotal: r.rows_total ?? 0, chunksDone: r.chunks_done, chunksTotal: r.chunks_total } : null,
    resumable: r.status === "running" && r.chunks_total > 0 && (!r.lease_expires_at || new Date(r.lease_expires_at).getTime() <= Date.now()),
  };
}

/** Historique des imports de l'organisation (RLS : membres uniquement). */
export async function listImportJobs(ctx: OrgContext, opts: { supplierId?: string | null; limit?: number } = {}): Promise<ImportJobDTO[]> {
  let q = ctx.supabase.from("sourcing_import_jobs").select(JOB_COLUMNS).eq("organization_id", ctx.organization.id).order("started_at", { ascending: false }).limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  if (opts.supplierId) q = q.eq("supplier_id", opts.supplierId);
  const { data, error } = await q;
  if (error) throw fromPostgrestError(error);
  return ((data ?? []) as unknown as JobRow[]).map(toJobDTO);
}

/** Détail d'un import et ses lignes ignorées (500 au maximum). */
export async function getImportJob(ctx: OrgContext, jobId: string): Promise<ImportJobDetailDTO> {
  const { data, error } = await ctx.supabase.from("sourcing_import_jobs").select(JOB_COLUMNS).eq("organization_id", ctx.organization.id).eq("id", jobId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw new AppError("NOT_FOUND", "Import introuvable dans cette organisation.");
  const { data: issues, error: iErr } = await ctx.supabase.from("sourcing_import_issues").select("line, kind, reference, message, excerpt").eq("job_id", jobId).order("line", { ascending: true, nullsFirst: true }).limit(500);
  if (iErr) throw fromPostgrestError(iErr);
  return { ...toJobDTO(data as unknown as JobRow), issues: (issues ?? []).map((i) => ({ line: i.line, kind: i.kind as ImportJobDetailDTO["issues"][number]["kind"], reference: i.reference, message: i.message, excerpt: (i.excerpt ?? null) as Record<string, unknown> | null })) };
}
