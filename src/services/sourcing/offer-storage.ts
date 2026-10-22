import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json, TablesInsert } from "@/db/database.types";
import type { SourceType, StockStatus, TaxType } from "@/db/types";
import { isIdentifyingProduct, normalizeProduct, type NormalizedProduct } from "@/domain/sourcing/normalizer";
import { detectKind, kindAllowsSkuInheritance, kindKeySuffix, type ProductKind } from "@/domain/sourcing/product-kind";
import { validateOffer, type ValidationResult } from "@/domain/sourcing/validation";
import type { RawOffer } from "@/domain/sourcing/types";
import { getFxRate, type FxQuote } from "@/services/sourcing/fx-rates";
import { suggestMatchesForOffer, suggestMatchesForOffers } from "@/services/sourcing/matching-service";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createLogger } from "@/lib/logger";

const log = createLogger("OFFER_STORAGE");

/**
 * OfferStorage — enregistre une offre normalisée et validée dans sourcing_offers.
 * Unicité : (organization_id, source_id, external_offer_id). Le prix original est
 * toujours conservé ; l'historique prix/stock est alimenté par le trigger SQL.
 */
export interface StorageContext {
  supabase: AdminSupabaseClient;
  organizationId: string;
  organizationCurrency: string;
  supplierId: string;
  sourceId: string;
  sourceType: SourceType;
  feedId?: string | null;
  defaultCurrency?: string | null;
  defaultTaxType?: TaxType;
  defaultCountry?: string | null;
  /** tente des suggestions de correspondance SKU après enregistrement */
  suggestMatches?: boolean;
  createdBy?: string | null;
  now?: Date;
  /** import à l'origine de l'écriture (historique des imports) */
  importJobId?: string | null;
}

export interface StoreOfferResult {
  outcome: "stored" | "rejected";
  offerId: string | null;
  created: boolean;
  /** prix, devise, stock, MOQ ou statut différents de la version enregistrée (toujours vrai à la création) */
  changed: boolean;
  /** marque ou modèle non reconnus : rapprochement automatique impossible, à vérifier */
  unrecognized: boolean;
  validation: ValidationResult;
  normalized: NormalizedProduct;
  fxUnavailable: boolean;
  matchedSkuId: string | null;
}

function stockStatusOf(raw: RawOffer, quantity: number | null): StockStatus {
  if (raw.stockStatus && raw.stockStatus !== "unknown") return raw.stockStatus;
  if (quantity === null) return raw.stockStatus ?? "unknown";
  return quantity > 0 ? "in_stock" : "out_of_stock";
}

function conditionOf(raw: RawOffer, normalized: NormalizedProduct): NormalizedProduct["condition"] {
  if (raw.condition === "new" || raw.condition === "refurbished" || raw.condition === "used") return raw.condition;
  return normalized.condition;
}

/**
 * Clé du produit normalisé : marque|modèle|capacité|couleur|état|grade, plus le TYPE de produit
 * pour tout ce qui n'est pas un appareil (I-18). Une coque ou un écran « iPhone 13 128 Go » n'a donc
 * jamais la clé — ni le SKU — du téléphone ; les clés des appareils restent inchangées.
 */
export function productKeyOf(normalized: Pick<NormalizedProduct, "normalizedKey">, kind: ProductKind): string {
  return `${normalized.normalizedKey}${kindKeySuffix(kind)}`;
}

/** Le SKU d'un produit normalisé peut-il être hérité automatiquement par une nouvelle offre ? */
export function canInheritSku(normalized: Pick<NormalizedProduct, "brand" | "model" | "storage">, kind: ProductKind): boolean {
  return isIdentifyingProduct(normalized) && kindAllowsSkuInheritance(kind);
}

function productInsert(organizationId: string, normalized: NormalizedProduct, key: string, kind: ProductKind): TablesInsert<"sourcing_products"> {
  return {
    organization_id: organizationId,
    normalized_key: key,
    brand: normalized.brand,
    model: normalized.model,
    storage: normalized.storage,
    color: normalized.color,
    condition: normalized.condition,
    grade: normalized.grade,
    variant: normalized.variant,
    ean: normalized.ean,
    mpn: normalized.mpn,
    title_display: normalized.displayTitle.slice(0, 300),
    attributes: { inferred: normalized.inferred, confidence: normalized.confidence, kind } as NonNullable<Json>,
  };
}

export async function getOrCreateSourcingProduct(ctx: StorageContext, normalized: NormalizedProduct, kind: ProductKind = "device"): Promise<{ id: string; skuId: string | null }> {
  const { supabase, organizationId } = ctx;
  const key = productKeyOf(normalized, kind);
  const { data: existing } = await supabase.from("sourcing_products").select("id, sku_id").eq("organization_id", organizationId).eq("normalized_key", key).maybeSingle();
  if (existing) return { id: existing.id, skuId: existing.sku_id };
  const { data: inserted, error } = await supabase
    .from("sourcing_products")
    .insert(productInsert(organizationId, normalized, key, kind))
    .select("id, sku_id")
    .single();
  if (inserted) return { id: inserted.id, skuId: inserted.sku_id };
  // Course possible (même clé insérée en parallèle) : relecture.
  const { data: again } = await supabase.from("sourcing_products").select("id, sku_id").eq("organization_id", organizationId).eq("normalized_key", key).maybeSingle();
  if (again) return { id: again.id, skuId: again.sku_id };
  throw new Error(`Produit normalisé non enregistrable : ${error?.message ?? "inconnu"}`);
}

type ExistingOffer = { id: string; original_price: number | null; original_currency: string | null; sku_id: string | null; normalized_product_id: string | null; status: string; available_quantity: number | null; stock_status: string; moq: number | null; last_import_job_id?: string | null };

const EXISTING_COLUMNS = "id, external_offer_id, original_price, original_currency, sku_id, normalized_product_id, status, available_quantity, stock_status, moq, last_import_job_id";

function normalizeRaw(raw: RawOffer): { normalized: NormalizedProduct; kind: ProductKind } {
  const normalized = normalizeProduct(raw.title, { brand: raw.brand, model: raw.model, storage: raw.storage, color: raw.color, grade: raw.grade, condition: typeof raw.condition === "string" ? raw.condition : null, ean: raw.ean, mpn: raw.mpn });
  return { normalized, kind: detectKind(raw.title, normalized.storage) };
}

/** Ligne sourcing_offers (pure) : mêmes règles pour l'écriture unitaire et l'écriture en masse. */
function buildOfferRow(
  ctx: StorageContext,
  raw: RawOffer,
  a: { normalized: NormalizedProduct; kind: ProductKind; existing: ExistingOffer | null; validation: ValidationResult; price: number; currency: string; fx: FxQuote | null; product: { id: string; skuId: string | null }; nowIso: string },
): TablesInsert<"sourcing_offers"> {
  const { normalized, kind, existing, validation, price, currency, fx, product, nowIso } = a;
  const normalizedPrice = fx ? Math.round(price * fx.rate * 10000) / 10000 : null;
  const quantity = validation.effectiveQuantity;
  const stockStatus = stockStatusOf(raw, quantity);
  const condition = conditionOf(raw, normalized);
  const taxType: TaxType = raw.taxType && raw.taxType !== "unknown" ? raw.taxType : ctx.defaultTaxType ?? "unknown";
  const confidence: Record<string, number> = {
    product: normalized.confidence,
    price: validation.priceRejected ? 0.3 : validation.anomalyCodes.includes("price_too_low") || validation.anomalyCodes.includes("price_too_high") ? 0.5 : 1,
    stock: quantity !== null ? 0.9 : stockStatus !== "unknown" ? 0.6 : 0,
    grade: raw.grade ? 1 : normalized.grade ? 0.8 : 0,
    condition: raw.condition === "new" || raw.condition === "refurbished" || raw.condition === "used" ? 1 : normalized.inferred.includes("condition") ? 0.6 : condition !== "unknown" ? 0.9 : 0,
    delivery: raw.deliveryMaxDays !== null && raw.deliveryMaxDays !== undefined ? 0.9 : 0,
    tax: taxType === "unknown" ? 0 : raw.taxType && raw.taxType !== "unknown" ? 1 : 0.7,
  };
  const row: TablesInsert<"sourcing_offers"> = {
    organization_id: ctx.organizationId,
    supplier_id: ctx.supplierId,
    source_id: ctx.sourceId,
    feed_id: ctx.feedId ?? null,
    source_type: ctx.sourceType,
    external_product_id: raw.externalProductId ?? raw.supplierSku ?? null,
    external_offer_id: raw.externalOfferId,
    title_original: raw.title.slice(0, 500),
    normalized_product_id: product.id,
    // Correspondance héritée du produit normalisé seulement si sa clé identifie un APPAREIL précis
    // (marque, modèle, capacité) : jamais pour une pièce ou un accessoire (I-18).
    sku_id: existing?.sku_id ?? (canInheritSku(normalized, kind) ? product.skuId : null) ?? null,
    brand: normalized.brand,
    model: normalized.model,
    storage: normalized.storage,
    color: normalized.color,
    condition,
    grade: normalized.grade,
    ean: normalized.ean,
    mpn: normalized.mpn,
    original_price: price,
    original_currency: currency,
    normalized_price: normalizedPrice,
    normalized_currency: fx ? ctx.organizationCurrency.toUpperCase() : null,
    fx_rate: fx?.rate ?? null,
    fx_rate_date: fx?.date ?? null,
    tax_type: taxType,
    vat_rate: raw.vatRate ?? null,
    moq: validation.effectiveMoq,
    minimum_order_value: raw.minimumOrderValue ?? null,
    available_quantity: quantity,
    stock_status: stockStatus,
    shipping_cost: raw.shippingCost ?? null,
    shipping_currency: raw.shippingCost !== null && raw.shippingCost !== undefined ? (raw.shippingCurrency ?? currency).toUpperCase() : null,
    delivery_min_days: raw.deliveryMinDays ?? null,
    delivery_max_days: raw.deliveryMaxDays ?? null,
    country: raw.country?.toUpperCase().slice(0, 2) ?? ctx.defaultCountry ?? null,
    source_url: validation.effectiveUrl,
    confidence: confidence as NonNullable<Json>,
    anomalies: validation.anomalyCodes,
    status: validation.status,
    last_seen_at: nowIso,
    expired_at: null,
    raw: (raw.raw ?? null) as Json,
    order_multiple: raw.orderMultiple ?? null,
    vat_regime: raw.vatRegime ?? null,
    ship_from_country: raw.shipFromCountry ?? null,
    warranty_months: raw.warrantyMonths ?? null,
    available_from: raw.availableFrom ?? null,
    supplier_updated_at: raw.supplierUpdatedAt ?? null,
    ...(ctx.importJobId ? { last_import_job_id: ctx.importJobId } : {}),
  };
  if (!existing) {
    row.first_seen_at = nowIso;
    row.last_price_at = nowIso;
    row.last_stock_at = quantity !== null || stockStatus !== "unknown" ? nowIso : null;
  }
  return row;
}

function changedFrom(existing: ExistingOffer | null, row: TablesInsert<"sourcing_offers">): boolean {
  return (
    !existing ||
    Number(existing.original_price) !== row.original_price ||
    existing.original_currency !== row.original_currency ||
    (existing.available_quantity ?? null) !== (row.available_quantity ?? null) ||
    existing.stock_status !== row.stock_status ||
    (existing.moq ?? null) !== (row.moq ?? null) ||
    existing.status !== row.status
  );
}

export async function storeOffer(ctx: StorageContext, raw: RawOffer): Promise<StoreOfferResult> {
  const { supabase, organizationId } = ctx;
  const now = ctx.now ?? new Date();
  const nowIso = now.toISOString();
  const currency = (raw.currency ?? ctx.defaultCurrency ?? "").toUpperCase() || null;
  const { normalized, kind } = normalizeRaw(raw);

  const { data: existingRow } = await supabase
    .from("sourcing_offers")
    .select(EXISTING_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("source_id", ctx.sourceId)
    .eq("external_offer_id", raw.externalOfferId)
    .maybeSingle();
  const existing = (existingRow ?? null) as ExistingOffer | null;

  let prices30d: number[] = [];
  if (existing && currency && existing.original_currency === currency) {
    const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const { data: hist } = await supabase.from("supplier_price_history").select("original_price").eq("offer_id", existing.id).eq("original_currency", currency).gte("recorded_at", since).order("recorded_at", { ascending: false }).limit(200);
    prices30d = (hist ?? []).map((h) => Number(h.original_price)).filter((n) => Number.isFinite(n) && n > 0);
  }
  const previousPrice = existing && currency && existing.original_currency === currency ? Number(existing.original_price) : null;

  const validation = validateOffer(
    { title: raw.title, price: raw.price, currency, moq: raw.moq ?? null, availableQuantity: raw.availableQuantity ?? null, sourceUrl: raw.url ?? null },
    { previousPrice, prices30d },
  );

  if (!validation.valid || validation.effectivePrice === null || !currency) {
    if (existing) {
      await supabase
        .from("sourcing_offers")
        .update({ status: "suspicious", anomalies: validation.anomalyCodes, last_seen_at: nowIso })
        .eq("id", existing.id);
    }
    return { outcome: "rejected", offerId: existing?.id ?? null, created: false, changed: false, unrecognized: !normalized.brand || !normalized.model, validation, normalized, fxUnavailable: false, matchedSkuId: null };
  }

  const fx = await getFxRate(currency, ctx.organizationCurrency);
  const product = await getOrCreateSourcingProduct(ctx, normalized, kind);
  const row = buildOfferRow(ctx, raw, { normalized, kind, existing, validation, price: validation.effectivePrice, currency, fx, product, nowIso });

  const { data: saved, error } = await supabase.from("sourcing_offers").upsert(row, { onConflict: "organization_id,source_id,external_offer_id" }).select("id, sku_id").single();
  if (error || !saved) {
    log.error("offer upsert failed", { externalOfferId: raw.externalOfferId, error: error?.message });
    throw new Error(`Offre non enregistrée (${raw.externalOfferId}) : ${error?.message ?? "inconnu"}`);
  }

  let matchedSkuId = saved.sku_id;
  if (ctx.suggestMatches !== false && !saved.sku_id) {
    try {
      const r = await suggestMatchesForOffer(supabase, organizationId, { id: saved.id, title_original: raw.title, ean: normalized.ean, mpn: normalized.mpn, external_product_id: row.external_product_id ?? null, brand: normalized.brand, normalized_product_id: product.id, sku_id: null }, { autoConfirmExact: true, createdBy: ctx.createdBy ?? null });
      matchedSkuId = r.confirmedSkuId;
    } catch (e) {
      log.warn("match suggestion failed", { offerId: saved.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { outcome: "stored", offerId: saved.id, created: !existing, changed: changedFrom(existing, row), unrecognized: !normalized.brand || !normalized.model, validation, normalized, fxUnavailable: fx === null, matchedSkuId };
}

/** Taille des listes `in(...)` envoyées à PostgREST (longueur d'URL bornée). */
const IN_BATCH = 100;

function chunksOf<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface BatchStoreItemResult extends Omit<StoreOfferResult, "matchedSkuId"> {
  externalOfferId: string;
  /** offre créée par CE job lors d'une tentative interrompue (relue comme existante) */
  createdByThisJob: boolean;
  error?: string;
}

export interface BatchStoreResult {
  items: BatchStoreItemResult[];
  /** temps de calcul (normalisation, validation, construction des lignes), en ms */
  computeMs: number;
  /** nombre de requêtes base de données émises (contrôle du N+1) */
  queries: number;
}

/**
 * Enregistrement EN MASSE d'un lot d'offres (imports de catalogues et de flux, S-04) : mêmes règles
 * que `storeOffer`, mais un nombre de requêtes indépendant du nombre de lignes : lecture groupée des
 * offres existantes et de leur historique 30 j, taux de change mémorisés par devise, produits
 * normalisés lus / créés en une fois, upsert multi-lignes, suggestions de rapprochement groupées
 * (offres nouvelles seulement). Idempotent : rejouer le même lot ne crée aucun doublon (clé unique
 * organisation + source + référence).
 */
export async function storeOffersBatch(ctx: StorageContext, raws: RawOffer[], opts: { clock?: () => number } = {}): Promise<BatchStoreResult> {
  const { supabase, organizationId } = ctx;
  const clock = opts.clock ?? (() => performance.now());
  let computeMs = 0;
  let queries = 0;
  const timed = <T>(fn: () => T): T => {
    const t0 = clock();
    try {
      return fn();
    } finally {
      computeMs += clock() - t0;
    }
  };
  const now = ctx.now ?? new Date();
  const nowIso = now.toISOString();
  if (raws.length === 0) return { items: [], computeMs, queries };

  // 1. normalisation (calcul pur)
  const prepared = timed(() =>
    raws.map((raw) => {
      const currency = (raw.currency ?? ctx.defaultCurrency ?? "").toUpperCase() || null;
      const { normalized, kind } = normalizeRaw(raw);
      return { raw, currency, normalized, kind };
    }),
  );

  // 2. offres existantes (lecture groupée)
  const existingById = new Map<string, ExistingOffer>();
  const ids = [...new Set(raws.map((r) => r.externalOfferId))];
  for (const part of chunksOf(ids, IN_BATCH)) {
    queries++;
    const { data, error } = await supabase.from("sourcing_offers").select(EXISTING_COLUMNS).eq("organization_id", organizationId).eq("source_id", ctx.sourceId).in("external_offer_id", part);
    if (error) throw new Error(`Lecture des offres existantes impossible : ${error.message}`);
    for (const r of (data ?? []) as unknown as (ExistingOffer & { external_offer_id: string })[]) existingById.set(r.external_offer_id, r);
  }

  // 3. historique 30 j des offres existantes (lecture groupée et paginée, ordre stable)
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const history = new Map<string, { price: number; currency: string | null }[]>();
  const existingIds = [...existingById.values()].map((e) => e.id);
  for (const part of chunksOf(existingIds, IN_BATCH)) {
    const rows = await fetchAllRows<{ offer_id: string; original_price: number; original_currency: string | null }>(
      (from, to) => {
        queries++;
        return supabase.from("supplier_price_history").select("offer_id, original_price, original_currency").in("offer_id", part).gte("recorded_at", since).order("recorded_at", { ascending: false }).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { offer_id: string; original_price: number; original_currency: string | null }[] | null; error: { message: string } | null }>;
      },
      { maxRows: part.length * 200 },
    );
    for (const h of rows) {
      const list = history.get(h.offer_id) ?? [];
      if (list.length < 200) list.push({ price: Number(h.original_price), currency: h.original_currency });
      history.set(h.offer_id, list);
    }
  }

  // 4. validation (calcul pur)
  const validated = timed(() =>
    prepared.map((p) => {
      const existing = existingById.get(p.raw.externalOfferId) ?? null;
      const sameCurrency = Boolean(existing && p.currency && existing.original_currency === p.currency);
      const prices30d = sameCurrency ? (history.get(existing!.id) ?? []).filter((h) => h.currency === p.currency).map((h) => h.price).filter((n) => Number.isFinite(n) && n > 0) : [];
      const previousPrice = sameCurrency ? Number(existing!.original_price) : null;
      const validation = validateOffer({ title: p.raw.title, price: p.raw.price, currency: p.currency, moq: p.raw.moq ?? null, availableQuantity: p.raw.availableQuantity ?? null, sourceUrl: p.raw.url ?? null }, { previousPrice, prices30d });
      return { ...p, existing, validation, ok: validation.valid && validation.effectivePrice !== null && Boolean(p.currency) };
    }),
  );

  const items: BatchStoreItemResult[] = [];
  const createdByThisJob = (e: ExistingOffer | null) => Boolean(e && ctx.importJobId && e.last_import_job_id === ctx.importJobId && !e.sku_id);

  // 5. offres rejetées : les existantes passent « suspectes », une requête par ensemble d'anomalies
  const rejectedByAnomalies = new Map<string, { anomalies: string[]; ids: string[] }>();
  for (const v of validated) {
    if (v.ok || !v.existing) continue;
    const k = JSON.stringify(v.validation.anomalyCodes);
    const g = rejectedByAnomalies.get(k) ?? { anomalies: v.validation.anomalyCodes, ids: [] };
    g.ids.push(v.existing.id);
    rejectedByAnomalies.set(k, g);
  }
  for (const g of rejectedByAnomalies.values()) {
    for (const part of chunksOf(g.ids, IN_BATCH)) {
      queries++;
      await supabase.from("sourcing_offers").update({ status: "suspicious", anomalies: g.anomalies, last_seen_at: nowIso }).in("id", part);
    }
  }
  for (const v of validated.filter((x) => !x.ok)) {
    items.push({ externalOfferId: v.raw.externalOfferId, outcome: "rejected", offerId: v.existing?.id ?? null, created: false, createdByThisJob: false, changed: false, unrecognized: !v.normalized.brand || !v.normalized.model, validation: v.validation, normalized: v.normalized, fxUnavailable: false });
  }
  const accepted = validated.filter((v) => v.ok);
  if (accepted.length === 0) return { items, computeMs, queries };

  // 6. taux de change mémorisés par devise
  const fxByCurrency = new Map<string, FxQuote | null>();
  for (const cur of new Set(accepted.map((v) => v.currency!))) {
    queries++;
    fxByCurrency.set(cur, await getFxRate(cur, ctx.organizationCurrency));
  }

  // 7. produits normalisés : lecture groupée, création des manquants en une fois
  const keyed = timed(() => accepted.map((v) => ({ ...v, key: productKeyOf(v.normalized, v.kind) })));
  const products = new Map<string, { id: string; skuId: string | null }>();
  const keys = [...new Set(keyed.map((k) => k.key))];
  const readProducts = async (list: string[]) => {
    for (const part of chunksOf(list, IN_BATCH)) {
      queries++;
      const { data, error } = await supabase.from("sourcing_products").select("id, sku_id, normalized_key").eq("organization_id", organizationId).in("normalized_key", part);
      if (error) throw new Error(`Lecture des produits normalisés impossible : ${error.message}`);
      for (const p of data ?? []) products.set(p.normalized_key, { id: p.id, skuId: p.sku_id });
    }
  };
  await readProducts(keys);
  const missingKeys = keys.filter((k) => !products.has(k));
  if (missingKeys.length > 0) {
    const firstByKey = new Map<string, (typeof keyed)[number]>();
    for (const k of keyed) if (!firstByKey.has(k.key)) firstByKey.set(k.key, k);
    for (const part of chunksOf(missingKeys, IN_BATCH)) {
      queries++;
      const { error } = await supabase
        .from("sourcing_products")
        .upsert(part.map((key) => { const k = firstByKey.get(key)!; return productInsert(organizationId, k.normalized, key, k.kind); }), { onConflict: "organization_id,normalized_key", ignoreDuplicates: true });
      if (error) throw new Error(`Création des produits normalisés impossible : ${error.message}`);
    }
    await readProducts(missingKeys);
  }

  // 8. lignes d'offres (calcul pur), puis upsert multi-lignes : nouvelles et existantes séparément
  //    (une ligne existante ne renvoie jamais first_seen_at / last_price_at, conservés en base)
  const built = timed(() =>
    keyed.map((k) => {
      const product = products.get(k.key);
      if (!product) return { k, row: null as TablesInsert<"sourcing_offers"> | null };
      const price = k.validation.effectivePrice;
      if (price === null || !k.currency) return { k, row: null as TablesInsert<"sourcing_offers"> | null };
      return { k, row: buildOfferRow(ctx, k.raw, { normalized: k.normalized, kind: k.kind, existing: k.existing, validation: k.validation, price, currency: k.currency, fx: fxByCurrency.get(k.currency) ?? null, product, nowIso }) };
    }),
  );
  const saved = new Map<string, { id: string; sku_id: string | null }>();
  const writeErrors = new Map<string, string>();
  for (const group of [built.filter((b) => b.row && !b.k.existing), built.filter((b) => b.row && b.k.existing)]) {
    for (const part of chunksOf(group, IN_BATCH)) {
      queries++;
      const { data, error } = await supabase.from("sourcing_offers").upsert(part.map((b) => b.row!), { onConflict: "organization_id,source_id,external_offer_id" }).select("id, sku_id, external_offer_id");
      if (error) {
        log.error("bulk offer upsert failed", { count: part.length, error: error.message });
        for (const b of part) writeErrors.set(b.k.raw.externalOfferId, `Offre non enregistrée : ${error.message}`);
        continue;
      }
      for (const r of (data ?? []) as { id: string; sku_id: string | null; external_offer_id: string }[]) saved.set(r.external_offer_id, { id: r.id, sku_id: r.sku_id });
    }
  }

  // 9. suggestions de rapprochement groupées : offres NOUVELLES (ou créées par ce job avant une interruption) sans SKU
  if (ctx.suggestMatches !== false) {
    const toMatch = built.flatMap((b) => {
      const s = saved.get(b.k.raw.externalOfferId);
      if (!s || s.sku_id || !b.row || (b.k.existing && !createdByThisJob(b.k.existing))) return [];
      return [{ id: s.id, title_original: b.k.raw.title, ean: b.k.normalized.ean, mpn: b.k.normalized.mpn, external_product_id: b.row.external_product_id ?? null, brand: b.k.normalized.brand, normalized_product_id: products.get(b.k.key)?.id ?? null, sku_id: null }];
    });
    if (toMatch.length > 0) {
      try {
        const r = await suggestMatchesForOffers(supabase, organizationId, toMatch, { autoConfirmExact: true, createdBy: ctx.createdBy ?? null });
        queries += r.queries;
      } catch (e) {
        log.warn("bulk match suggestion failed", { count: toMatch.length, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  for (const b of built) {
    const id = b.k.raw.externalOfferId;
    const s = saved.get(id);
    const error = writeErrors.get(id) ?? (b.row ? (s ? undefined : "Offre non enregistrée (aucune ligne renvoyée).") : "Produit normalisé non enregistré.");
    if (error || !s || !b.row) {
      items.push({ externalOfferId: id, outcome: "rejected", offerId: b.k.existing?.id ?? null, created: false, createdByThisJob: false, changed: false, unrecognized: !b.k.normalized.brand || !b.k.normalized.model, validation: b.k.validation, normalized: b.k.normalized, fxUnavailable: false, error: error ?? "Offre non enregistrée." });
      continue;
    }
    items.push({ externalOfferId: id, outcome: "stored", offerId: s.id, created: !b.k.existing, createdByThisJob: createdByThisJob(b.k.existing), changed: changedFrom(b.k.existing, b.row), unrecognized: !b.k.normalized.brand || !b.k.normalized.model, validation: b.k.validation, normalized: b.k.normalized, fxUnavailable: (fxByCurrency.get(b.k.currency!) ?? null) === null });
  }
  return { items, computeMs, queries };
}

/** Marque « expired » les offres actives d'une source non revues depuis le début d'une synchronisation. Jamais de suppression. */
export async function expireUnseenOffers(ctx: Pick<StorageContext, "supabase" | "organizationId" | "sourceId">, since: Date): Promise<number> {
  const { data, error } = await ctx.supabase
    .from("sourcing_offers")
    .update({ status: "expired", expired_at: new Date().toISOString() })
    .eq("organization_id", ctx.organizationId)
    .eq("source_id", ctx.sourceId)
    .in("status", ["active", "suspicious"])
    .lt("last_seen_at", since.toISOString())
    .select("id");
  if (error) {
    log.warn("expire unseen offers failed", { sourceId: ctx.sourceId, error: error.message });
    return 0;
  }
  return data?.length ?? 0;
}
