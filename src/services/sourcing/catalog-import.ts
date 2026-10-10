import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import { AppError, fromPostgrestError } from "@/lib/errors";
import type { CatalogFileFormat, CatalogImportDTO, CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { RAW_OFFER_FIELDS } from "@/domain/sourcing/types";
import { fieldMappingSchema, looseHeader, previewFeed, suggestMapping, type FeedFormat, type FeedOptions, type FieldMapping } from "@/services/sourcing/feed-parsers";
import { ingestFeed } from "@/services/sourcing/feed-ingestion";
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
});

export const catalogImportSchema = z
  .object({
    file: catalogFileSchema,
    mapping: fieldMappingSchema,
    defaults: catalogDefaultsSchema,
    supplierId: z.string().uuid().optional(),
    supplierName: z.string().trim().min(2).max(160).optional(),
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
  format: CatalogFileFormat;
  /** format du flux enregistré (xlsx → csv « ; ») */
  feedFormat: FeedFormat;
  content: string;
  options: FeedOptions;
  notes: string[];
}

export function loadCatalogFile(file: CatalogFileInput): LoadedCatalog {
  const bytes = decodeBase64(file.contentBase64);
  const format = file.format ?? detectCatalogFormat(file.fileName, bytes);
  const notes: string[] = [];
  if (format === "xlsx") {
    try {
      const sheet = readXlsx(bytes, file.sheet);
      notes.push(`Feuille lue : « ${sheet.name} » (${sheet.rows.length} lignes, en-têtes en première ligne).`);
      return { format, feedFormat: "csv", content: sheetToCsv(sheet), options: { delimiter: ";" }, notes };
    } catch (e) {
      if (e instanceof XlsxError) throw new AppError("VALIDATION", e.message);
      throw e;
    }
  }
  const { text, encoding } = decodeText(bytes);
  if (encoding !== "utf-8") notes.push("Fichier encodé en Windows-1252 (export Excel) : converti en UTF-8.");
  return { format, feedFormat: format, content: text, options: {}, notes };
}

/** Mapping proposé + type de prix déduit de l'en-tête de la colonne prix (« Prix HT », « Prix TTC »). */
export function suggestCatalogMapping(columns: string[]): FieldMapping {
  const mapping = suggestMapping(columns);
  const priceCol = typeof mapping.price === "string" ? looseHeader(mapping.price) : "";
  if (!mapping.tax_type && priceCol) {
    if (/ (ht|hors taxes?|excl|ex vat|net) /.test(priceCol)) mapping.tax_type = { const: "ht" };
    else if (/ (ttc|toutes taxes|incl|inc vat) /.test(priceCol)) mapping.tax_type = { const: "ttc" };
  }
  return mapping;
}

export function previewCatalogFile(input: z.infer<typeof catalogPreviewSchema>, organizationCurrency: string): CatalogPreviewDTO {
  const loaded = loadCatalogFile(input.file);
  const first = previewFeed(loaded.content, loaded.feedFormat, {}, loaded.options, {}, 1);
  const suggested = suggestCatalogMapping(first.columns);
  const mapping = input.mapping && Object.keys(input.mapping).length > 0 ? input.mapping : suggested;
  const defaults = { currency: input.defaults?.currency ?? organizationCurrency, taxType: input.defaults?.taxType ?? "unknown", country: input.defaults?.country ?? null };
  const preview = previewFeed(loaded.content, loaded.feedFormat, mapping, loaded.options, defaults, 10);
  return {
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
      errors: s.errors,
    })),
    fields: RAW_OFFER_FIELDS,
  };
}

/** Import réel (rôle rédacteur requis par l'appelant ; écritures sous RLS pour fournisseur, source, flux). */
export async function importCatalogFile(ctx: OrgContext, input: z.infer<typeof catalogImportSchema>): Promise<CatalogImportDTO> {
  const orgId = ctx.organization.id;
  const loaded = loadCatalogFile(input.file);

  // 1. Fournisseur
  let supplierId = input.supplierId ?? null;
  let supplierName = input.supplierName ?? "";
  if (supplierId) {
    const { data, error } = await ctx.supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("id", supplierId).maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!data) throw new AppError("NOT_FOUND", "Fournisseur introuvable dans cette organisation.");
    supplierName = data.name;
  } else {
    const { data: existing } = await ctx.supabase.from("suppliers").select("id, name").eq("organization_id", orgId).ilike("name", supplierName).limit(1).maybeSingle();
    if (existing) supplierId = existing.id;
    else {
      const { data, error } = await ctx.supabase
        .from("suppliers")
        .insert({ organization_id: orgId, name: supplierName, currency: input.defaults.currency, country: input.defaults.country ?? null })
        .select("id")
        .single();
      if (error || !data) throw fromPostgrestError(error ?? { message: "Fournisseur non créé" });
      supplierId = data.id;
    }
  }

  // 2. Source « Import de catalogue » de ce fournisseur (réutilisée)
  const sourceType = loaded.feedFormat.toUpperCase() as "CSV" | "XML" | "JSON";
  const { data: sources, error: srcErr } = await ctx.supabase
    .from("supplier_sources")
    .select("id, config")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .eq("source_type", sourceType)
    .limit(20);
  if (srcErr) throw fromPostgrestError(srcErr);
  let sourceId = (sources ?? []).find((s) => (s.config as { kind?: string } | null)?.kind === CATALOG_IMPORT_KIND)?.id ?? null;
  if (!sourceId) {
    const { data, error } = await ctx.supabase
      .from("supplier_sources")
      .insert({
        organization_id: orgId,
        supplier_id: supplierId,
        name: `Import de catalogue — ${supplierName}`,
        source_type: sourceType,
        default_currency: input.defaults.currency,
        default_tax_type: input.defaults.taxType,
        country: input.defaults.country ?? null,
        automated_access_confirmed: true,
        access_conditions: "Fichier transmis par le fournisseur et importé manuellement par l'utilisateur.",
        sync_frequency: "manual",
        status: "not_connected",
        config: { kind: CATALOG_IMPORT_KIND } as unknown as NonNullable<Json>,
      })
      .select("id")
      .single();
    if (error || !data) throw fromPostgrestError(error ?? { message: "Source non créée" });
    sourceId = data.id;
  } else {
    await ctx.supabase.from("supplier_sources").update({ default_currency: input.defaults.currency, default_tax_type: input.defaults.taxType }).eq("id", sourceId).eq("organization_id", orgId);
  }

  // 3. Flux sans URL (mapping mis à jour à chaque import)
  const { data: feeds, error: feedErr } = await ctx.supabase.from("supplier_feeds").select("id").eq("organization_id", orgId).eq("source_id", sourceId).is("url", null).limit(1);
  if (feedErr) throw fromPostgrestError(feedErr);
  let feedId = feeds?.[0]?.id ?? null;
  const feedPatch = { format: loaded.feedFormat, field_mapping: input.mapping as unknown as NonNullable<Json>, options: loaded.options as unknown as NonNullable<Json>, sync_frequency: "manual" as const };
  if (!feedId) {
    const { data, error } = await ctx.supabase
      .from("supplier_feeds")
      .insert({ organization_id: orgId, supplier_id: supplierId, source_id: sourceId, type: "catalog", url: null, status: "not_connected", ...feedPatch })
      .select("id")
      .single();
    if (error || !data) throw fromPostgrestError(error ?? { message: "Flux non créé" });
    feedId = data.id;
  } else {
    const { error } = await ctx.supabase.from("supplier_feeds").update(feedPatch).eq("id", feedId).eq("organization_id", orgId);
    if (error) throw fromPostgrestError(error);
  }

  // 4. Ingestion (pipeline commun, journal sync_runs)
  const result = await ingestFeed(feedId, { trigger: "manual", createdBy: ctx.user.id, content: loaded.content });
  const { feedId: _ignored, ...rest } = result;
  return { supplierId, sourceId, feedId, result: rest };
}
