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
import type { SupplierSource } from "@/db/types";
import { addPurchaseOrderItemSchema, createPurchaseOrderSchema, emptyToNull, feedSchema, fieldErrorsOf, fieldMappingFromFormData, manualOfferSchema, parseUrlLines, publicWebSourceSchema, purchaseOrderStatusSchema, supplierSchema, updateSupplierSchema } from "@/features/suppliers/schemas";
import { getSupplierPerformance } from "@/features/suppliers/queries";
import { checkRobotsForUrls } from "@/services/sourcing/crawler/robots";
import { getParser } from "@/services/sourcing/crawler/parsers/registry";
import { runSourceCrawl } from "@/services/sourcing/crawler/crawler-manager";
import { ingestFeed, previewFeedSource } from "@/services/sourcing/feed-ingestion";
import { suggestMapping, type FeedPreview, type FieldMapping } from "@/services/sourcing/feed-parsers";
import { storeOffer } from "@/services/sourcing/offer-storage";
import { applyConfirmedMatch } from "@/services/sourcing/matching-service";
import { connectorsStatusMessage } from "@/services/sourcing/supplier-connectors";
import type { RawOffer } from "@/domain/sourcing/types";

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

export async function archiveSupplierAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const id = String(formData.get("supplier_id") ?? "");
  const archive = String(formData.get("archive") ?? "true") === "true";
  await ctx.supabase.from("suppliers").update({ is_archived: archive }).eq("id", id).eq("organization_id", ctx.organization.id);
  revalidatePath("/suppliers");
  redirect(archive ? "/suppliers" : supplierPath(id));
}

export async function recomputeSupplierScoreAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const id = String(formData.get("supplier_id") ?? "");
  const { data: supplier } = await ctx.supabase.from("suppliers").select("*").eq("organization_id", ctx.organization.id).eq("id", id).maybeSingle();
  if (!supplier) return;
  const perf = await getSupplierPerformance(ctx, supplier);
  await ctx.supabase
    .from("suppliers")
    .update({ internal_score: perf.score.score, score_breakdown: (perf.score.breakdown ?? { reason: perf.score.reason }) as unknown as NonNullable<Json>, score_computed_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(supplierPath(id, "performance"));
  revalidatePath("/suppliers");
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
    if (d.automated_access_confirmed !== "on") {
      return fail("Attestation requise.", { fieldErrors: { automated_access_confirmed: ["Vous devez attester avoir vérifié que l'accès automatisé est autorisé par les conditions d'utilisation du site."] } });
    }
    const { urls, invalid } = parseUrlLines(d.urls);
    if (invalid.length > 0) return fail("Certaines URLs sont invalides.", { fieldErrors: { urls: [`URL(s) invalide(s) : ${invalid.slice(0, 3).join(", ")}`] } });
    if (urls.length === 0) return fail("Indiquez au moins une URL.", { fieldErrors: { urls: ["Indiquez au moins une URL de page à lire."] } });
    const baseHost = new URL(d.base_url).host;
    const foreign = urls.filter((u) => new URL(u).host !== baseHost);
    if (foreign.length > 0) return fail("Les URLs doivent appartenir au domaine de la source.", { fieldErrors: { urls: [`Hôte différent de ${baseHost} : ${foreign.slice(0, 3).join(", ")}`] } });
    const parserKey = d.parser || "jsonld";
    if (!getParser(parserKey)) return fail("Parser inconnu.", { fieldErrors: { parser: ["Parser inconnu."] } });
    await assertSupplier(ctx, d.supplier_id);

    const robots = await checkRobotsForUrls(d.base_url, urls, serverEnv().SOURCING_USER_AGENT);
    const config = { urls, parser: parserKey, max_pages: emptyToNull(d.max_pages) ?? 20 } as unknown as NonNullable<Json>;
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
        automated_access_confirmed: true,
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
    log.info("public web source created", { orgId: ctx.organization.id, sourceId: data.id, robotsAllowed: robots.allowed });
    revalidatePath(supplierPath(d.supplier_id, "sources"));
    return ok({ robots: robots.details });
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

export async function toggleSourceAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const sourceId = String(formData.get("source_id") ?? "");
  const paused = String(formData.get("paused") ?? "false") === "true";
  const { data } = await ctx.supabase.from("supplier_sources").select("supplier_id, status").eq("organization_id", ctx.organization.id).eq("id", sourceId).maybeSingle();
  if (!data) return;
  await ctx.supabase.from("supplier_sources").update({ status: paused ? "paused" : data.status === "paused" ? "not_connected" : data.status }).eq("id", sourceId);
  revalidatePath(supplierPath(data.supplier_id, "sources"));
}

export async function deleteSourceAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const sourceId = String(formData.get("source_id") ?? "");
  const { data } = await ctx.supabase.from("supplier_sources").select("supplier_id").eq("organization_id", ctx.organization.id).eq("id", sourceId).maybeSingle();
  if (!data) return;
  // Les offres de la source sont conservées (expirées), jamais supprimées : on met la source en pause définitive.
  await ctx.supabase.from("sourcing_offers").update({ status: "expired", expired_at: new Date().toISOString() }).eq("source_id", sourceId).in("status", ["active", "suspicious"]);
  await ctx.supabase.from("supplier_sources").update({ status: "paused", sync_frequency: "manual", automated_access_confirmed: false }).eq("id", sourceId);
  revalidatePath(supplierPath(data.supplier_id, "sources"));
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
    if (fErr || !feed) return fail(toUserMessage(fromPostgrestError(fErr ?? { message: "Flux non créé" })));
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

export async function toggleFeedAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const feedId = String(formData.get("feed_id") ?? "");
  const paused = String(formData.get("paused") ?? "false") === "true";
  const { data } = await ctx.supabase.from("supplier_feeds").select("supplier_id, status").eq("organization_id", ctx.organization.id).eq("id", feedId).maybeSingle();
  if (!data) return;
  await ctx.supabase.from("supplier_feeds").update({ status: paused ? "paused" : data.status === "paused" ? "not_connected" : data.status }).eq("id", feedId);
  revalidatePath(supplierPath(data.supplier_id, "sources"));
}

// ---------------------------------------------------------------------------
// Compte fournisseur (connecteurs) : aucun connecteur disponible
// ---------------------------------------------------------------------------
export async function connectSupplierAccountAction(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  try {
    await requireOrgContextForAction({ write: true });
    return fail(connectorsStatusMessage(), { code: "NOT_IMPLEMENTED" });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Offre saisie manuellement (source MANUAL créée à la demande)
// ---------------------------------------------------------------------------
export async function ensureManualSource(ctx: OrgContext, supplierId: string, supplierName: string): Promise<SupplierSource> {
  const { data: existing } = await ctx.supabase.from("supplier_sources").select("*").eq("supplier_id", supplierId).eq("source_type", "MANUAL").maybeSingle();
  if (existing) return existing;
  const { data, error } = await ctx.supabase
    .from("supplier_sources")
    .insert({ organization_id: ctx.organization.id, supplier_id: supplierId, name: `Saisie manuelle — ${supplierName}`, source_type: "MANUAL", automated_access_confirmed: true, access_conditions: "Données saisies par l'utilisateur.", status: "active", sync_frequency: "manual" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Source manuelle non créée : ${error?.message ?? "inconnu"}`);
  return data;
}

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
// ---------------------------------------------------------------------------
async function refreshPurchaseOrderTotal(ctx: OrgContext, poId: string): Promise<void> {
  const { data: items } = await ctx.supabase.from("purchase_order_items").select("quantity_ordered, unit_cost").eq("purchase_order_id", poId);
  const list = items ?? [];
  const allKnown = list.every((i) => i.unit_cost !== null);
  const total = allKnown && list.length > 0 ? list.reduce((s, i) => s + i.quantity_ordered * Number(i.unit_cost ?? 0), 0) : null;
  await ctx.supabase.from("purchase_orders").update({ total: total === null ? null : Math.round(total * 100) / 100 }).eq("id", poId);
}

export async function createPurchaseOrderAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let supplierId: string;
  let poId: string;
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const parsed = createPurchaseOrderSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail("Vérifiez les champs du formulaire.", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
    const d = parsed.data;
    await assertSupplier(ctx, d.supplier_id);
    const { data: po, error } = await ctx.supabase
      .from("purchase_orders")
      .insert({ organization_id: ctx.organization.id, supplier_id: d.supplier_id, reference: emptyToNull(d.reference), currency: d.currency, expected_at: emptyToNull(d.expected_at), notes: emptyToNull(d.notes), status: "draft", created_by: ctx.user.id })
      .select("id")
      .single();
    if (error || !po) return fail(toUserMessage(fromPostgrestError(error ?? { message: "Commande non créée" })));
    const skuId = emptyToNull(d.sku_id);
    const qty = emptyToNull(d.quantity);
    if (skuId && qty) {
      const { error: iErr } = await ctx.supabase.from("purchase_order_items").insert({ organization_id: ctx.organization.id, purchase_order_id: po.id, sku_id: skuId, offer_id: emptyToNull(d.offer_id), quantity_ordered: qty, unit_cost: emptyToNull(d.unit_cost), currency: d.currency });
      if (iErr) return fail(toUserMessage(fromPostgrestError(iErr)));
      await refreshPurchaseOrderTotal(ctx, po.id);
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
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    await refreshPurchaseOrderTotal(ctx, po.id);
    revalidatePath(supplierPath(po.supplier_id, "orders"));
    return ok(undefined);
  } catch (e) {
    return fail(toUserMessage(e));
  }
}

export async function removePurchaseOrderItemAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const itemId = String(formData.get("item_id") ?? "");
  const { data: item } = await ctx.supabase.from("purchase_order_items").select("id, purchase_order_id, purchase_order:purchase_orders(supplier_id, status)").eq("organization_id", ctx.organization.id).eq("id", itemId).maybeSingle();
  if (!item || item.purchase_order?.status !== "draft") return;
  await ctx.supabase.from("purchase_order_items").delete().eq("id", itemId);
  await refreshPurchaseOrderTotal(ctx, item.purchase_order_id);
  revalidatePath(supplierPath(item.purchase_order.supplier_id, "orders"));
}

export async function updatePurchaseOrderStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgContextForAction({ write: true });
  const parsed = purchaseOrderStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { data: po } = await ctx.supabase.from("purchase_orders").select("id, supplier_id, status").eq("organization_id", ctx.organization.id).eq("id", parsed.data.purchase_order_id).maybeSingle();
  if (!po) return;
  const allowed: Record<string, string[]> = { draft: ["sent", "cancelled"], sent: ["confirmed", "cancelled", "draft"], confirmed: ["cancelled"], partially_received: ["cancelled"] };
  if (!(allowed[po.status] ?? []).includes(parsed.data.status)) return;
  await ctx.supabase.from("purchase_orders").update({ status: parsed.data.status, ...(parsed.data.status === "sent" ? { sent_at: new Date().toISOString() } : {}) }).eq("id", po.id);
  revalidatePath(supplierPath(po.supplier_id, "orders"));
}

export async function receivePurchaseOrderAction(_prev: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireOrgContextForAction({ write: true });
    const poId = String(formData.get("purchase_order_id") ?? "");
    const { data: po } = await ctx.supabase.from("purchase_orders").select("id, supplier_id, status").eq("organization_id", ctx.organization.id).eq("id", poId).maybeSingle();
    if (!po) return fail("Commande introuvable.");
    const receipts: Array<{ item_id: string; quantity: number }> = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("receive_")) continue;
      const qty = Number(value);
      if (Number.isInteger(qty) && qty > 0) receipts.push({ item_id: key.slice("receive_".length), quantity: qty });
    }
    if (receipts.length === 0) return fail("Indiquez au moins une quantité reçue.");
    const { data, error } = await ctx.supabase.rpc("receive_purchase_order_items", { p_purchase_order_id: po.id, p_receipts: receipts });
    if (error) return fail(toUserMessage(fromPostgrestError(error)));
    revalidatePath(supplierPath(po.supplier_id, "orders"));
    revalidatePath(supplierPath(po.supplier_id, "performance"));
    revalidatePath("/stock");
    return ok({ message: `Réception enregistrée : stock mis à jour. Statut de la commande : ${data?.status ?? "mis à jour"}.` });
  } catch (e) {
    return fail(toUserMessage(e));
  }
}
