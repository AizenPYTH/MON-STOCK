import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import type { CatalogPreviewDTO } from "@/features/mobile-api/contract";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { currentKeyVersion, encryptSecret } from "@/lib/crypto";
import { authHeaders, feedAuthSchema as authSchema } from "@/services/sourcing/feed-secrets";
import { serverEnv } from "@/lib/env";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { RAW_OFFER_FIELDS } from "@/domain/sourcing/types";
import { assertPublicHttpUrl, fetchText } from "@/services/sourcing/http";
import { fieldMappingSchema, previewFeed, type FeedFormat } from "@/services/sourcing/feed-parsers";
import { FEED_ACCEPT } from "@/services/sourcing/feed-ingestion";
import { catalogDefaultsSchema, headerSignature, suggestCatalogMappingDetailed } from "@/services/sourcing/catalog-import";

/**
 * Flux distant AUTORISÉ : lien CSV / XML / JSON fourni par le fournisseur (lien « live » d'un
 * partenaire, flux acheteur d'une plateforme, export CSV d'un tableur partagé avec accord écrit).
 *
 * Garde-fous :
 * - attestation obligatoire (accord du fournisseur), enregistrée avec la date et l'utilisateur ;
 * - HTTPS public uniquement (adresses privées, internes et métadonnées refusées, y compris après
 *   redirection), taille bornée à 20 Mo, délai borné ;
 * - en-tête d'authentification éventuel chiffré (AES-256-GCM) dans supplier_feed_secrets, lisible
 *   par le seul serveur, jamais renvoyé à l'application ni journalisé.
 */

const urlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => {
    try {
      const parsed = assertPublicHttpUrl(u);
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Adresse HTTPS publique requise (aucune adresse locale, interne ni identifiant dans l'URL).");

export const remoteFeedPreviewSchema = z.object({
  url: urlSchema,
  format: z.enum(["csv", "xml", "json"]),
  auth: authSchema.default({ kind: "none" }),
  mapping: fieldMappingSchema.optional(),
  defaults: catalogDefaultsSchema.partial({ currency: true }).optional(),
  rootPath: z.string().max(200).optional(),
});

export const remoteFeedCreateSchema = remoteFeedPreviewSchema
  .extend({
    mapping: fieldMappingSchema,
    defaults: catalogDefaultsSchema,
    supplierId: z.string().uuid().optional(),
    supplierName: z.string().trim().min(2).max(160).optional(),
    mode: z.enum(["partial", "snapshot"]).default("snapshot"),
    frequency: z.enum(["manual", "hourly", "every_6_hours", "daily"]).default("daily"),
    /** l'utilisateur atteste disposer de l'accord du fournisseur pour la lecture automatisée */
    attest: z.literal(true, { message: "Confirmez disposer de l'accord du fournisseur pour lire ce flux automatiquement." }),
  })
  .refine((d) => Boolean(d.supplierId) !== Boolean(d.supplierName), { message: "Choisissez un fournisseur existant ou indiquez le nom d'un nouveau fournisseur." })
  .refine((d) => Boolean(d.mapping.title && d.mapping.price && (d.mapping.external_offer_id || d.mapping.supplier_sku || d.mapping.ean)), { message: "Associez au minimum la référence (ou l'EAN), la désignation et le prix." });

export async function fetchRemoteFeed(url: string, format: FeedFormat, headers: Record<string, string>, fetchImpl?: typeof fetch, resolver?: (host: string) => Promise<Array<{ address: string }>>): Promise<string> {
  const res = await fetchText(url, { userAgent: serverEnv().SOURCING_USER_AGENT, accept: FEED_ACCEPT[format], headers, fetchImpl, resolver, timeoutMs: 30_000 });
  if (res.status === 401 || res.status === 403) throw new AppError("VALIDATION", `Le fournisseur refuse l'accès (HTTP ${res.status}) : vérifiez le lien ou les identifiants fournis.`);
  if (!res.ok) throw new AppError("VALIDATION", `Le flux a répondu HTTP ${res.status}.`);
  if (/text\/html/i.test(res.contentType ?? "") && format !== "xml") throw new AppError("VALIDATION", "Le lien renvoie une page web, pas un fichier de données : demandez au fournisseur le lien direct du CSV / XML / JSON.");
  return res.text;
}

/** Aperçu d'un flux distant : rien n'est enregistré. */
export async function previewRemoteFeed(ctx: OrgContext, input: z.infer<typeof remoteFeedPreviewSchema>, runtime: { fetchImpl?: typeof fetch; resolver?: (host: string) => Promise<Array<{ address: string }>> } = {}): Promise<CatalogPreviewDTO> {
  const content = await fetchRemoteFeed(input.url, input.format, authHeaders(input.auth), runtime.fetchImpl, runtime.resolver);
  const options = input.rootPath ? { root_path: input.rootPath } : {};
  const first = previewFeed(content, input.format, {}, options, {}, 1);
  const detailed = suggestCatalogMappingDetailed(first.columns);
  const userMapping = input.mapping && Object.keys(input.mapping).length > 0 ? input.mapping : null;
  const mapping = userMapping ?? detailed.mapping;
  const defaults = { currency: input.defaults?.currency ?? ctx.organization.default_currency, taxType: input.defaults?.taxType ?? "unknown", country: input.defaults?.country ?? null };
  const preview = previewFeed(content, input.format, mapping, options, defaults, 20);
  return {
    fileSha256: "",
    fileSize: content.length,
    headerSignature: headerSignature(first.columns),
    mappingSource: userMapping ? "user" : "suggested",
    mappingConfidence: detailed.confidence,
    duplicates: 0,
    alreadyImported: null,
    format: input.format,
    columns: preview.columns,
    suggestedMapping: detailed.mapping,
    mapping,
    total: preview.total,
    validCount: preview.validCount,
    invalidCount: preview.invalidCount,
    warnings: preview.warnings,
    sample: preview.sample.map((s) => ({
      line: s.index + (input.format === "csv" ? 2 : 1),
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

/**
 * Crée le flux : fournisseur (existant ou nouveau), source « flux distant » attestée, flux à URL
 * (mapping, mode, fréquence) et identifiants chiffrés. La première synchronisation est lancée
 * ensuite par l'utilisateur (« Synchroniser maintenant ») ou par la planification.
 */
export async function createRemoteFeed(ctx: OrgContext, input: z.infer<typeof remoteFeedCreateSchema>, admin: AdminSupabaseClient = createAdminSupabaseClient(), now: Date = new Date()): Promise<{ supplierId: string; sourceId: string; feedId: string }> {
  const orgId = ctx.organization.id;
  authHeaders(input.auth); // valide l'en-tête (noms interdits) avant toute écriture
  let supplierId = input.supplierId ?? null;
  let supplierName = input.supplierName ?? "";
  if (supplierId) {
    const { data, error } = await ctx.supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("id", supplierId).maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!data) throw new AppError("NOT_FOUND", "Fournisseur introuvable dans cette organisation.");
    supplierName = data.name;
  } else {
    const { data: existing } = await ctx.supabase.from("suppliers").select("id").eq("organization_id", orgId).ilike("name", supplierName).limit(1).maybeSingle();
    if (existing) supplierId = existing.id;
    else {
      const { data, error } = await ctx.supabase.from("suppliers").insert({ organization_id: orgId, name: supplierName, currency: input.defaults.currency, country: input.defaults.country ?? null }).select("id").single();
      if (error || !data) throw fromPostgrestError(error ?? { message: "Fournisseur non créé" });
      supplierId = data.id;
    }
  }
  const host = new URL(input.url).host;
  const attestation = `Accord du fournisseur attesté par l'utilisateur ${ctx.user.id} le ${now.toISOString()} pour la lecture automatisée du flux ${host}.`;
  const { data: source, error: srcErr } = await ctx.supabase
    .from("supplier_sources")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      name: `Flux ${input.format.toUpperCase()} — ${supplierName}`.slice(0, 200),
      source_type: input.format.toUpperCase() as "CSV" | "XML" | "JSON",
      base_url: `https://${host}`,
      default_currency: input.defaults.currency,
      default_tax_type: input.defaults.taxType,
      country: input.defaults.country ?? null,
      automated_access_confirmed: true,
      access_conditions: attestation,
      sync_frequency: input.frequency,
      status: "not_connected",
      next_run_at: input.frequency === "manual" ? null : now.toISOString(),
      config: { kind: "remote_feed", mode: input.mode } as unknown as NonNullable<Json>,
    })
    .select("id")
    .single();
  if (srcErr || !source) throw fromPostgrestError(srcErr ?? { message: "Source non créée" });
  const options = { mode: input.mode, ...(input.rootPath ? { root_path: input.rootPath } : {}) };
  const { data: feed, error: feedErr } = await ctx.supabase
    .from("supplier_feeds")
    .insert({ organization_id: orgId, supplier_id: supplierId, source_id: source.id, type: "catalog", url: input.url, format: input.format, field_mapping: input.mapping as unknown as NonNullable<Json>, options: options as unknown as NonNullable<Json>, sync_frequency: input.frequency, status: "not_connected" })
    .select("id")
    .single();
  if (feedErr || !feed) throw fromPostgrestError(feedErr ?? { message: "Flux non créé" });
  if (input.auth.kind !== "none") {
    const { error } = await admin.from("supplier_feed_secrets").upsert({ feed_id: feed.id, organization_id: orgId, credentials_enc: encryptSecret(JSON.stringify(input.auth)), key_version: currentKeyVersion(), updated_at: now.toISOString() });
    if (error) throw new AppError("INTERNAL", "Identifiants du flux non enregistrés.");
  }
  return { supplierId: supplierId!, sourceId: source.id, feedId: feed.id };
}
