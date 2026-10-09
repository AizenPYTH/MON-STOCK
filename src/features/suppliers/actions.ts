"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgContextForAction, type OrgContext } from "@/features/auth/dal";
import { fail, ok, type ActionResult } from "@/lib/result";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { serverEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/db/database.types";
import { addPurchaseOrderItemSchema, connectAccountSchema, connectionIdSchema, createPurchaseOrderSchema, emptyToNull, feedSchema, fieldErrorsOf, fieldMappingFromFormData, manualOfferSchema, parseUrlLines, publicWebSourceSchema, purchaseOrderStatusSchema, receiptLineSchema, supplierSchema, updateSupplierSchema } from "@/features/suppliers/schemas";
import { stockErrorMessage } from "@/features/stock/db-errors";
import { adapterSourceConfigFromRow, attestationRequired, settingsFromFormData, urlsFromSettings } from "@/features/suppliers/adapter-config";
import { getSourceAdapter } from "@/integrations/sourcing/registry";
import { getConnectorDescriptor } from "@/integrations/suppliers/core";
import { getSupplierPerformance } from "@/features/suppliers/queries";
import { checkRobotsForUrls } from "@/services/sourcing/crawler/robots";
import { getParser } from "@/services/sourcing/crawler/parsers/registry";
import { runSourceCrawl } from "@/services/sourcing/crawler/crawler-manager";
import { ingestFeed, previewFeedSource } from "@/services/sourcing/feed-ingestion";
import { suggestMapping, type FeedPreview, type FieldMapping } from "@/services/sourcing/feed-parsers";
import { storeOffer } from "@/services/sourcing/offer-storage";
import { applyConfirmedMatch } from "@/services/sourcing/matching-service";
import { ensureManualSource } from "@/features/suppliers/manual-source";
import { connectorsStatusMessage, createSupplierConnection, syncSupplierConnection, testSupplierConnection } from "@/services/sourcing/supplier-connectors";
import type { RawOffer } from "@/domain/sourcing/types";

import { changePurchaseOrderStatus, receivePurchaseOrder } from "@/features/suppliers/purchase-order-service";

const log = createLogger("SUPPLIERS");

function supplierPath(id: string, tab?: string): string {
  return `/suppliers/${id}${tab ? `/${tab}` : ""}`;
}

async function assertSupplier(ctx: OrgContext, supplierId: string): Promise<{ id: string; name: string; currency: string }> {
  const { data } = await ctx.supabase.from("suppliers").select("id, name, currency").eq("organization_id", ctx.organization.id).eq("id", supplierId).maybeSingle();
  if (!data) throw new Error("Fournisseur introuvable.");
  return data;
}

function supplierPayload(d: ReturnType<typeof supplierSchema.parse>) {
  return {
    name: d.name,
    company: emptyToNull(d.company),
    country: emptyToNull(d.country),
    website: emptyToNull(d.website),
    email: emptyToNull(d.email),
    phone: emptyToNull(d.phone),
    contact_name: emptyToNull(d.contact_name),
    notes: emptyToNull(d.notes),
    payment_terms: emptyToNull(d.payment_terms),
    average_lead_time_days: emptyToNull(d.average_lead_time_days),
    default_moq: emptyToNull(d.default_moq),
    minimum_order_value: emptyToNull(d.minimum_order_value),
    currency: d.currency,
  };
}

// ---------------------------------------------------------------------------
// Fournisseur
// ---------------------------------------------------------------------------
export async function createSupplierAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const { data, error } = await ctx.supabase.from("suppliers").insert({ organization_id: ctx.organization.id, ...supplierPayload(parsed.data) }).select("id").single();
    if (error || !data) return fail(toUserMessage(fromPostgrestError(error ?? { message: "Fournisseur non créé" })));
    id = data.id;
  } catch (e) {
    return fail(toUserMessage(e));
  }
  revalidatePath("/suppliers");
  redirect(supplierPath(id));
}

export async function updateSupplierAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = updateSupplierSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const { error } = await ctx.supabase.from("suppliers").update(supplierPayload(parsed.data)).eq("id", parsed.data.supplier_id).eq("organization_id", ctx.organization.id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath("/suppliers");
    revalidatePath(supplierPath(parsed.data.supplier_id));
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

type MessageResult = ActionResult<{ message: string }>;

export async function archiveSupplierAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  let id: string;
  let archive: boolean;
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    id = String(formData.get("supplier_id") ?? "");
    archive = String(formData.get("archive") ?? "true") === "true";
    const { data, error } = await ctx.supabase.from("suppliers").update({ is_archived: archive }).eq("id", id).eq("organization_id", ctx.organization.id).select("id");
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    if (!data || data.length === 0) return fail("Fournisseur introuvable.");
  } catch (e) {
    return fail(toUserMessage(e));
  }
  revalidatePath("/suppliers");
  redirect(archive ? "/suppliers" : supplierPath(id));
}

export async function recomputeSupplierScoreAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const id = String(formData.get("supplier_id") ?? "");
    const { data: supplier } = await ctx.supabase.from("suppliers").select("*").eq("organization_id", ctx.organization.id).eq("id", id).maybeSingle();
    if (!supplier) return fail("Fournisseur introuvable.");
    const perf = await getSupplierPerformance(ctx, supplier);
    const { error } = await ctx.supabase
      .from("suppliers")
      .update({ internal_score: perf.score.score, score_breakdown: (perf.score.breakdown ?? { reason: perf.score.reason }) as unknown as NonNullable<Json>, score_computed_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath(supplierPath(id, "performance"));
    revalidatePath("/suppliers");
    return ok({ message: perf.score.score === null ? `Score non calculable : ${perf.score.reason ?? "données insuffisantes"}.` : `Score recalculé : ${Math.round(perf.score.score)}/100.` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Sources publiques (PUBLIC_WEB)
// ---------------------------------------------------------------------------
export async function createPublicWebSourceAction(_prev: ActionResult<{ robots: string }> | null, formData: FormData): Promise<ActionResult<{ robots: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = publicWebSourceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const adapter = getSourceAdapter(d.adapter);
    if (!adapter || adapter.access !== "public") return fail("Adaptateur inconnu.", { fieldErrors: { adapter: ["Choisissez un adaptateur public disponible."] } });
    const needsAttestation = attestationRequired(adapter.method);
    if (needsAttestation && d.automated_access_confirmed !== "on") {
      return fail("Attestation requise.", { fieldErrors: { automated_access_confirmed: ["Vous devez attester avoir vérifié que l'accès automatisé est autorisé par les conditions d'utilisation du site."] } });
    }
    const { settings, errors: settingErrors } = settingsFromFormData(formData, adapter.configFields);
    if (Object.keys(settingErrors).length > 0) return fail("Complétez la configuration de l'adaptateur.", { fieldErrors: settingErrors });
    const { urls, invalid } = parseUrlLines(d.urls ?? "");
    if (invalid.length > 0) return fail("Certaines URLs sont invalides.", { fieldErrors: { urls: [`URL(s) invalide(s) : ${invalid.slice(0, 3).join(", ")}`] } });
    const settingUrls = urlsFromSettings(settings);
    // Pages HTML : il faut au moins une URL (catalogue ou gabarit de recherche). JSON public / flux : l'URL de base ou le réglage requis suffit.
    if (adapter.method === "public_html" && urls.length === 0 && settingUrls.length === 0) return fail("Indiquez au moins une URL.", { fieldErrors: { urls: ["Indiquez au moins une URL de page à lire, ou renseignez l'URL de recherche de l'adaptateur (avec {query})."] } });
    const baseHost = new URL(d.base_url).host;
    const foreign = [...urls, ...settingUrls].filter((u) => new URL(u).host !== baseHost);
    if (foreign.length > 0) return fail("Les URLs doivent appartenir au domaine de la source.", { fieldErrors: { urls: [`Hôte différent de ${baseHost} : ${foreign.slice(0, 3).join(", ")}`] } });
    // Parser HTML du crawler de catalogue : celui exposé par l'adaptateur, sinon le JSON-LD générique.
    const parserKey = adapter.htmlParser?.key ?? (d.parser || "jsonld");
    if (!getParser(parserKey)) return fail("Parser inconnu.", { fieldErrors: { parser: ["Parser inconnu."] } });
    await assertSupplier(ctx, d.supplier_id);

    // robots.txt : pages de catalogue + URLs de recherche / de flux déclarées pour l'adaptateur.
    const robotsUrls = Array.from(new Set([...urls, ...settingUrls]));
    const robots = await checkRobotsForUrls(d.base_url, robotsUrls.length > 0 ? robotsUrls : [d.base_url], serverEnv().SOURCING_USER_AGENT);
    const config = { adapter: adapter.key, ...settings, urls, parser: parserKey, max_pages: emptyToNull(d.max_pages) ?? 20 } as unknown as NonNullable<Json>;
    const { data, error } = await ctx.supabase
      .from("supplier_sources")
      .insert({
        organization_id: ctx.organization.id,
        supplier_id: d.supplier_id,
        name: d.name,
        source_type: "PUBLIC_WEB",
        base_url: d.base_url,
        country: emptyToNull(d.country),
        default_currency: emptyToNull(d.default_currency),
        default_tax_type: d.default_tax_type,
        access_conditions: emptyToNull(d.access_conditions),
        automated_access_confirmed: needsAttestation ? true : d.automated_access_confirmed === "on",
        robots_checked_at: new Date().toISOString(),
        robots_allowed: robots.allowed,
        crawl_delay_seconds: robots.crawlDelay === null ? null : Math.ceil(robots.crawlDelay),
        sync_frequency: d.sync_frequency,
        status: robots.allowed ? "not_connected" : "error",
        last_error: robots.allowed ? null : robots.details,
        config,
      })
      .select("id")
      .single();
    if (error || !data) return fail(toUserMessage(fromPostgrestError(error ?? { message: "Source non créée" })));
    log.info("public web source created", { orgId: ctx.organization.id, sourceId: data.id, adapter: adapter.key, robotsAllowed: robots.allowed });
    revalidatePath(supplierPath(d.supplier_id, "sources"));
    revalidatePath("/sourcing");
    return ok({ robots: robots.details });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** « Tester » une source publique : adapter.testConnection (sans effet de bord, aucune offre enregistrée). */
export async function testSourceAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const sourceId = String(formData.get("source_id") ?? "");
    const { data: source } = await ctx.supabase.from("supplier_sources").select("id, supplier_id, base_url, config, default_currency, default_tax_type, country, automated_access_confirmed, robots_allowed").eq("organization_id", ctx.organization.id).eq("id", sourceId).maybeSingle();
    if (!source) return fail("Source introuvable.");
    const stored = (source.config ?? {}) as { adapter?: unknown };
    const adapter = getSourceAdapter(typeof stored.adapter === "string" ? stored.adapter : null);
    if (!adapter) return fail("Aucun adaptateur n'est associé à cette source : recréez-la en choisissant un adaptateur.");
    if (attestationRequired(adapter.method) && !source.automated_access_confirmed) return fail("Accès automatisé non attesté : attestez l'autorisation avant de tester cette source.");
    if (source.robots_allowed === false) return fail("robots.txt interdit l'accès aux URLs de cette source : test non effectué.");
    const started = Date.now();
    const result = await adapter.testConnection(adapterSourceConfigFromRow(source), { userAgent: serverEnv().SOURCING_USER_AGENT, timeoutMs: 15_000 });
    const message = `${result.message} (${Date.now() - started} ms)`;
    await ctx.supabase.from("supplier_sources").update({ last_error: result.ok ? null : result.message, status: result.ok ? "active" : "error" }).eq("id", source.id);
    revalidatePath(supplierPath(source.supplier_id, "sources"));
    revalidatePath("/sourcing");
    return result.ok ? ok({ message }) : fail(message);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function checkRobotsAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const sourceId = String(formData.get("source_id") ?? "");
    const { data: source } = await ctx.supabase.from("supplier_sources").select("id, supplier_id, base_url, config").eq("organization_id", ctx.organization.id).eq("id", sourceId).maybeSingle();
    if (!source) return fail("Source introuvable.");
    const cfg = (source.config ?? {}) as { urls?: string[] };
    const urls = Array.isArray(cfg.urls) ? cfg.urls : [];
    if (!source.base_url) return fail("Cette source n'a pas d'URL de base.");
    const robots = await checkRobotsForUrls(source.base_url, urls, serverEnv().SOURCING_USER_AGENT);
    await ctx.supabase.from("supplier_sources").update({ robots_checked_at: new Date().toISOString(), robots_allowed: robots.allowed, crawl_delay_seconds: robots.crawlDelay === null ? null : Math.ceil(robots.crawlDelay) }).eq("id", source.id);
    revalidatePath(supplierPath(source.supplier_id, "sources"));
    return robots.allowed ? ok({ message: robots.details }) : fail(robots.details);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function toggleSourceAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const sourceId = String(formData.get("source_id") ?? "");
    const paused = String(formData.get("paused") ?? "false") === "true";
    const { data } = await ctx.supabase.from("supplier_sources").select("supplier_id, status").eq("organization_id", ctx.organization.id).eq("id", sourceId).maybeSingle();
    if (!data) return fail("Source introuvable.");
    const { error } = await ctx.supabase.from("supplier_sources").update({ status: paused ? "paused" : data.status === "paused" ? "not_connected" : data.status }).eq("organization_id", ctx.organization.id).eq("id", sourceId);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath(supplierPath(data.supplier_id, "sources"));
    return ok({ message: paused ? "Source mise en pause." : "Source réactivée." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function deleteSourceAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const sourceId = String(formData.get("source_id") ?? "");
    const { data } = await ctx.supabase.from("supplier_sources").select("supplier_id").eq("organization_id", ctx.organization.id).eq("id", sourceId).maybeSingle();
    if (!data) return fail("Source introuvable.");
    // Les offres de la source sont conservées (expirées), jamais supprimées : on met la source en pause définitive.
    const expired = await ctx.supabase.from("sourcing_offers").update({ status: "expired", expired_at: new Date().toISOString() }).eq("organization_id", ctx.organization.id).eq("source_id", sourceId).in("status", ["active", "suspicious"]);
    if (expired.error) return fail(toUserMessage(fromPostgrestError(expired.error)));
    const { error } = await ctx.supabase.from("supplier_sources").update({ status: "paused", sync_frequency: "manual", automated_access_confirmed: false }).eq("organization_id", ctx.organization.id).eq("id", sourceId);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath(supplierPath(data.supplier_id, "sources"));
    return ok({ message: "Source désactivée (offres conservées, marquées expirées)." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function runSourceCrawlAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const sourceId = String(formData.get("source_id") ?? "");
    const { data: source } = await ctx.supabase.from("supplier_sources").select("id, supplier_id").eq("organization_id", ctx.organization.id).eq("id", sourceId).maybeSingle();
    if (!source) return fail("Source introuvable.");
    const result = await runSourceCrawl(source.id, { trigger: "manual", createdBy: ctx.user.id });
    revalidatePath(supplierPath(source.supplier_id, "sources"));
    revalidatePath(supplierPath(source.supplier_id, "offers"));
    revalidatePath("/sourcing");
    return result.status === "failed" || result.status === "refused" ? fail(result.message) : ok({ message: result.message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Flux CSV / XML / JSON
// ---------------------------------------------------------------------------
async function readUploadedFile(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (!file || typeof file === "string") return null;
  if (file.size === 0) return null;
  if (file.size > 20 * 1024 * 1024) throw new Error("Fichier trop volumineux (maximum 20 Mo).");
  return await file.text();
}

export interface FeedPreviewResult {
  preview: FeedPreview;
  suggestedMapping: FieldMapping;
}

export async function previewFeedAction(_prev: ActionResult<FeedPreviewResult> | null, formData: FormData): Promise<ActionResult<FeedPreviewResult>> {
  try {
    await requireOrgContextForAction({ write: true });
    const parsed = feedSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const content = await readUploadedFile(formData);
    if (!content && !d.url) return fail("Indiquez une URL de flux ou choisissez un fichier.", { fieldErrors: { url: ["URL ou fichier requis."] } });
    let mapping = fieldMappingFromFormData(formData);
    const options = { delimiter: emptyToNull(d.delimiter) ?? undefined, encoding: emptyToNull(d.encoding) ?? undefined, root_path: emptyToNull(d.root_path) ?? undefined, header_row: d.header_row === "true" };
    const defaults = { currency: emptyToNull(d.default_currency), taxType: d.default_tax_type, country: emptyToNull(d.country) };
    let preview = await previewFeedSource({ url: emptyToNull(d.url), content, format: d.format, mapping, options, defaults });
    const suggested = suggestMapping(preview.columns);
    if (Object.keys(mapping).length === 0) {
      mapping = suggested;
      preview = await previewFeedSource({ url: emptyToNull(d.url), content, format: d.format, mapping, options, defaults });
    }
    const serializable: FeedPreview = { ...preview, sample: preview.sample.map((s) => ({ ...s, row: JSON.parse(JSON.stringify(s.row)) as Record<string, unknown>, offer: s.offer ? ({ ...s.offer, raw: undefined } as RawOffer) : null })) };
    return ok({ preview: serializable, suggestedMapping: mapping });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function createFeedAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = feedSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    await assertSupplier(ctx, d.supplier_id);
    const content = await readUploadedFile(formData);
    if (!content && !d.url) return fail("Indiquez une URL de flux ou choisissez un fichier.", { fieldErrors: { url: ["URL ou fichier requis."] } });
    const mapping = fieldMappingFromFormData(formData);
    if (!mapping.title || !mapping.price || !(mapping.external_offer_id || mapping.supplier_sku || mapping.ean)) {
      return fail("Le mapping doit définir au minimum l'identifiant (ou référence / EAN), le titre et le prix.", { fieldErrors: { map_title: ["Mapping incomplet."] } });
    }
    const sourceType = d.format.toUpperCase() as "CSV" | "XML" | "JSON";
    const { data: source, error: sErr } = await ctx.supabase
      .from("supplier_sources")
      .insert({ organization_id: ctx.organization.id, supplier_id: d.supplier_id, name: d.name, source_type: sourceType, base_url: emptyToNull(d.url), country: emptyToNull(d.country), default_currency: emptyToNull(d.default_currency), default_tax_type: d.default_tax_type, automated_access_confirmed: true, access_conditions: "Flux fourni par le fournisseur (URL ou fichier transmis).", sync_frequency: d.url ? d.sync_frequency : "manual", status: "not_connected", config: { kind: "feed" } })
      .select("id")
      .single();
    if (sErr || !source) return fail(toUserMessage(fromPostgrestError(sErr ?? { message: "Source non créée" })));
    const options = { delimiter: emptyToNull(d.delimiter), encoding: emptyToNull(d.encoding), root_path: emptyToNull(d.root_path), header_row: d.header_row === "true" };
    const { data: feed, error: fErr } = await ctx.supabase
      .from("supplier_feeds")
      .insert({ organization_id: ctx.organization.id, supplier_id: d.supplier_id, source_id: source.id, type: d.type, url: emptyToNull(d.url), format: d.format, field_mapping: mapping as unknown as NonNullable<Json>, options: options as unknown as NonNullable<Json>, sync_frequency: d.url ? d.sync_frequency : "manual", status: "not_connected" })
      .select("id")
      .single();
    if (fErr || !feed) {
      // Compensation : pas de source orpheline si le flux n'a pas pu être créé.
      await ctx.supabase.from("supplier_sources").delete().eq("id", source.id).eq("organization_id", ctx.organization.id);
      return fail(toUserMessage(fromPostgrestError(fErr ?? { message: "Flux non créé" })));
    }
    const result = await ingestFeed(feed.id, { trigger: "initial", createdBy: ctx.user.id, content });
    revalidatePath(supplierPath(d.supplier_id, "sources"));
    revalidatePath(supplierPath(d.supplier_id, "offers"));
    revalidatePath("/sourcing");
    return result.status === "failed" ? fail(`Flux enregistré mais première synchronisation en échec : ${result.message}`) : ok({ message: `Flux enregistré. ${result.message}` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function runFeedSyncAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const feedId = String(formData.get("feed_id") ?? "");
    const { data: feed } = await ctx.supabase.from("supplier_feeds").select("id, supplier_id, url").eq("organization_id", ctx.organization.id).eq("id", feedId).maybeSingle();
    if (!feed) return fail("Flux introuvable.");
    const content = await readUploadedFile(formData);
    if (!feed.url && !content) return fail("Ce flux n'a pas d'URL : choisissez un fichier à importer.");
    const result = await ingestFeed(feed.id, { trigger: "manual", createdBy: ctx.user.id, content });
    revalidatePath(supplierPath(feed.supplier_id, "sources"));
    revalidatePath(supplierPath(feed.supplier_id, "offers"));
    revalidatePath("/sourcing");
    return result.status === "failed" ? fail(result.message) : ok({ message: result.message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function toggleFeedAction(_prev: MessageResult | null, formData: FormData): Promise<MessageResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const feedId = String(formData.get("feed_id") ?? "");
    const paused = String(formData.get("paused") ?? "false") === "true";
    const { data } = await ctx.supabase.from("supplier_feeds").select("supplier_id, status").eq("organization_id", ctx.organization.id).eq("id", feedId).maybeSingle();
    if (!data) return fail("Flux introuvable.");
    const { error } = await ctx.supabase.from("supplier_feeds").update({ status: paused ? "paused" : data.status === "paused" ? "not_connected" : data.status }).eq("organization_id", ctx.organization.id).eq("id", feedId);
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath(supplierPath(data.supplier_id, "sources"));
    return ok({ message: paused ? "Flux mis en pause." : "Flux réactivé." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Compte fournisseur (connecteurs) : identifiants chiffrés côté serveur, jamais renvoyés au client
// ---------------------------------------------------------------------------
export async function connectSupplierAccountAction(_prev: ActionResult<{ connectionId: string; message: string }> | null, formData: FormData): Promise<ActionResult<{ connectionId: string; message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = connectAccountSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const descriptor = getConnectorDescriptor(parsed.data.connector_key);
    if (!descriptor) return fail(connectorsStatusMessage(), { code: "NOT_IMPLEMENTED", fieldErrors: { connector_key: ["Connecteur inconnu."] } });
    const credentials: Record<string, string> = {};
    const fieldErrors: Record<string, string[]> = {};
    for (const f of descriptor.credentialFields) {
      const v = String(formData.get(`cred_${f.name}`) ?? "").trim();
      if (!v) fieldErrors[`cred_${f.name}`] = [`${f.label} : champ requis.`];
      else credentials[f.name] = v.slice(0, 2000);
    }
    if (Object.keys(fieldErrors).length > 0) return fail("Renseignez tous les identifiants demandés par le connecteur.", { fieldErrors });
    const supplier = await assertSupplier(ctx, parsed.data.supplier_id);
    const connectionId = await createSupplierConnection({ organizationId: ctx.organization.id, supplierId: supplier.id, connectorKey: descriptor.key, credentials });
    log.info("supplier connection created", { orgId: ctx.organization.id, supplierId: supplier.id, connectionId, connector: descriptor.key });
    revalidatePath(supplierPath(supplier.id, "sources"));
    revalidatePath("/sourcing");
    return ok({ connectionId, message: `Connexion « ${descriptor.label} » créée (statut : en attente). Testez la connexion pour vérifier vos identifiants : rien n'est supposé fonctionner avant ce test.` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

async function assertConnection(ctx: OrgContext, connectionId: string): Promise<{ id: string; supplier_id: string; connector_key: string }> {
  const { data } = await ctx.supabase.from("supplier_connections").select("id, supplier_id, connector_key").eq("organization_id", ctx.organization.id).eq("id", connectionId).maybeSingle();
  if (!data) throw new Error("Connexion introuvable.");
  return data;
}

/** « Tester la connexion » : vérifie les identifiants auprès du fournisseur (sans synchroniser). */
export async function testSupplierConnectionAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = connectionIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Connexion invalide.");
    const connection = await assertConnection(ctx, parsed.data.connection_id);
    const result = await testSupplierConnection(connection.id);
    revalidatePath(supplierPath(connection.supplier_id, "sources"));
    revalidatePath("/sourcing");
    return result.ok ? ok({ message: result.message }) : fail(result.message);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

/** « Synchroniser le catalogue » : récupère les offres via le compte fournisseur (run tracé dans sync_runs). */
export async function syncSupplierConnectionAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = connectionIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Connexion invalide.");
    const connection = await assertConnection(ctx, parsed.data.connection_id);
    const result = await syncSupplierConnection(connection.id);
    revalidatePath(supplierPath(connection.supplier_id, "sources"));
    revalidatePath(supplierPath(connection.supplier_id, "offers"));
    revalidatePath("/sourcing");
    return result.status === "failed" || result.status === "refused" ? fail(result.message) : ok({ message: result.message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Offre saisie manuellement (source MANUAL créée à la demande)
// ---------------------------------------------------------------------------
export async function createManualOfferAction(_prev: ActionResult<{ offerId: string; warnings: string[] }> | null, formData: FormData): Promise<ActionResult<{ offerId: string; warnings: string[] }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = manualOfferSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const supplier = await assertSupplier(ctx, d.supplier_id);
    const source = await ensureManualSource(ctx, supplier.id, supplier.name);
    const raw: RawOffer = {
      externalOfferId: emptyToNull(d.external_offer_id) ?? `manual-${Date.now().toString(36)}`,
      externalProductId: emptyToNull(d.supplier_sku),
      title: d.title,
      price: d.price,
      currency: d.currency,
      taxType: d.tax_type,
      moq: emptyToNull(d.moq),
      minimumOrderValue: emptyToNull(d.minimum_order_value),
      availableQuantity: emptyToNull(d.available_quantity),
      shippingCost: emptyToNull(d.shipping_cost),
      deliveryMinDays: emptyToNull(d.delivery_min_days),
      deliveryMaxDays: emptyToNull(d.delivery_max_days),
      country: emptyToNull(d.country),
      url: emptyToNull(d.source_url),
      ean: emptyToNull(d.ean),
      mpn: emptyToNull(d.mpn),
      brand: emptyToNull(d.brand),
      model: emptyToNull(d.model),
      storage: emptyToNull(d.storage),
      color: emptyToNull(d.color),
      grade: emptyToNull(d.grade),
      condition: d.condition === "unknown" ? null : d.condition,
      supplierSku: emptyToNull(d.supplier_sku),
    };
    const admin = createAdminSupabaseClient();
    const result = await storeOffer({ supabase: admin, organizationId: ctx.organization.id, organizationCurrency: ctx.organization.default_currency, supplierId: supplier.id, sourceId: source.id, sourceType: "MANUAL", suggestMatches: !d.sku_id, createdBy: ctx.user.id }, raw);
    if (result.outcome !== "stored" || !result.offerId) return fail(`Offre refusée : ${result.validation.anomalies.map((a) => a.message).join(" ; ")}`);
    const skuId = emptyToNull(d.sku_id);
    if (skuId) {
      const { data: sku } = await ctx.supabase.from("skus").select("id").eq("organization_id", ctx.organization.id).eq("id", skuId).maybeSingle();
      if (!sku) return fail("SKU introuvable.");
      await applyConfirmedMatch(ctx.supabase, ctx.organization.id, { offerId: result.offerId, skuId, sourcingProductId: null });
      await ctx.supabase.from("product_matches").insert({ organization_id: ctx.organization.id, offer_id: result.offerId, sku_id: skuId, confidence: 1, method: "supplier_sku", reasons: ["Association manuelle à la saisie"], status: "confirmed", created_by: ctx.user.id, decided_by: ctx.user.id, decided_at: new Date().toISOString() });
    }
    const warnings = result.validation.anomalies.map((a) => a.message);
    if (result.fxUnavailable) warnings.push(`Conversion ${d.currency} → ${ctx.organization.default_currency} indisponible : prix original conservé.`);
    revalidatePath(supplierPath(supplier.id, "offers"));
    revalidatePath("/sourcing");
    return ok({ offerId: result.offerId, warnings });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Commandes fournisseurs
// Règles métier appliquées EN BASE (migration 20261008002000) : total dérivé des lignes,
// machine à états, lignes figées après confirmation, réception idempotente. Les actions
// ci-dessous traduisent les refus en messages et donnent un retour à chaque clic.
// ---------------------------------------------------------------------------
export async function createPurchaseOrderAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let supplierId: string;
  let poId: string;
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = createPurchaseOrderSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const skuId = emptyToNull(d.sku_id);
    const qty = emptyToNull(d.quantity);
    if ((skuId && !qty) || (!skuId && qty)) {
      return fail("Vérifiez les champs du formulaire.", { fieldErrors: skuId ? { quantity: ["Indiquez la quantité de la première ligne."] } : { sku_id: ["Choisissez le SKU de la première ligne."] } });
    }
    await assertSupplier(ctx, d.supplier_id);
    const { data: po, error } = await ctx.supabase
      .from("purchase_orders")
      .insert({ organization_id: ctx.organization.id, supplier_id: d.supplier_id, reference: emptyToNull(d.reference), currency: d.currency, expected_at: emptyToNull(d.expected_at), notes: emptyToNull(d.notes), status: "draft", created_by: ctx.user.id })
      .select("id")
      .single();
    if (error || !po) return fail(stockErrorMessage(error ?? { message: "Commande non créée" }));
    if (skuId && qty) {
      const { error: iErr } = await ctx.supabase.from("purchase_order_items").insert({ organization_id: ctx.organization.id, purchase_order_id: po.id, sku_id: skuId, offer_id: emptyToNull(d.offer_id), quantity_ordered: qty, unit_cost: emptyToNull(d.unit_cost), currency: d.currency });
      if (iErr) {
        // Pas de brouillon orphelin : la commande vide est retirée (un brouillon est supprimable).
        await ctx.supabase.from("purchase_orders").delete().eq("id", po.id).eq("organization_id", ctx.organization.id);
        return fail(stockErrorMessage(iErr));
      }
    }
    supplierId = d.supplier_id;
    poId = po.id;
  } catch (e) {
    return fail(toUserMessage(e));
  }
  revalidatePath(supplierPath(supplierId, "orders"));
  redirect(`${supplierPath(supplierId, "orders")}?po=${poId}`);
}

export async function addPurchaseOrderItemAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = addPurchaseOrderItemSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    const { data: po } = await ctx.supabase.from("purchase_orders").select("id, supplier_id, status, currency").eq("organization_id", ctx.organization.id).eq("id", d.purchase_order_id).maybeSingle();
    if (!po) return fail("Commande introuvable.");
    if (po.status !== "draft") return fail("Seule une commande en brouillon peut être modifiée.");
    const { error } = await ctx.supabase.from("purchase_order_items").insert({ organization_id: ctx.organization.id, purchase_order_id: po.id, sku_id: d.sku_id, offer_id: emptyToNull(d.offer_id), quantity_ordered: d.quantity, unit_cost: emptyToNull(d.unit_cost), currency: po.currency });
    if (error) return fail(stockErrorMessage(error));
    revalidatePath(supplierPath(po.supplier_id, "orders"));
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function removePurchaseOrderItemAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const itemId = String(formData.get("item_id") ?? "");
    const { data: item } = await ctx.supabase.from("purchase_order_items").select("id, purchase_order_id, purchase_order:purchase_orders(supplier_id, status)").eq("organization_id", ctx.organization.id).eq("id", itemId).maybeSingle();
    if (!item || !item.purchase_order) return fail("Ligne introuvable (déjà retirée ?).");
    if (item.purchase_order.status !== "draft") return fail("Seule une commande en brouillon peut être modifiée.");
    const { error } = await ctx.supabase.from("purchase_order_items").delete().eq("id", itemId).eq("organization_id", ctx.organization.id);
    if (error) return fail(stockErrorMessage(error));
    revalidatePath(supplierPath(item.purchase_order.supplier_id, "orders"));
    return ok({ message: "Ligne retirée." });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function updatePurchaseOrderStatusAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = purchaseOrderStatusSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Statut invalide.");
    const { supplierId, message, changed } = await changePurchaseOrderStatus(ctx, parsed.data.purchase_order_id, parsed.data.status);
    if (changed) {
      revalidatePath(supplierPath(supplierId, "orders"));
      revalidatePath(supplierPath(supplierId, "performance"));
      revalidatePath("/insights");
    }
    return ok({ message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function receivePurchaseOrderAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const poId = String(formData.get("purchase_order_id") ?? "");
    const receipts: Array<{ item_id: string; quantity: number; expected_received?: number }> = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("receive_")) continue;
      const itemId = key.slice("receive_".length);
      const expectedRaw = formData.get(`expected_${itemId}`);
      const line = receiptLineSchema.safeParse({ item_id: itemId, quantity: value, expected_received: expectedRaw === null || expectedRaw === "" ? undefined : expectedRaw });
      if (!line.success) return fail("Quantité reçue invalide (nombre entier entre 0 et 100 000).");
      if (line.data.quantity > 0) receipts.push(line.data);
    }
    const { supplierId, message } = await receivePurchaseOrder(ctx, poId, receipts);
    revalidatePath(supplierPath(supplierId, "orders"));
    revalidatePath(supplierPath(supplierId, "performance"));
    revalidatePath("/stock");
    revalidatePath("/dashboard");
    revalidatePath("/insights");
    return ok({ message });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
