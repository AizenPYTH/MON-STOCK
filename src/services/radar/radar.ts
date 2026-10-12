import "server-only";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import type { RadarDTO, RadarItemDTO, RadarOfferDetailDTO, RadarRestockDTO } from "@/features/mobile-api/contract";
import { assessOffer, quantityScenarios, type SourceHistory } from "@/domain/sourcing/assessment";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { compareRadar, evaluateRadarOffer, missingSettings, type PriceOrigin, type RadarCostSettings, type RadarOfferInput, type RadarSkuInput, type RadarSort } from "@/domain/sourcing/radar";
import { readCostSettings, radarSettingsSchema } from "@/domain/sourcing/radar-settings";

export { readCostSettings, radarSettingsSchema };

/**
 * Radar d'opportunités d'achat : offres fournisseurs RÉELLES rapprochées de vos SKU, évaluées
 * avec vos ventes réelles et vos paramètres de coûts. Lecture seule, sous la session de
 * l'utilisateur (RLS). Aucune commande n'est passée : un brouillon de commande reste une action
 * explicite de l'utilisateur.
 */

export function priceOriginOf(sourceType: string, sourceConfig: Json | null): PriceOrigin {
  const kind = (sourceConfig as { kind?: string } | null)?.kind;
  if (sourceType === "API") return "verified_live";
  if (sourceType === "PUBLIC_WEB") return "observed_public";
  if (sourceType === "MANUAL") return "manual_entry";
  if (kind === "catalog_file_import") return "catalog_import";
  if (["CSV", "XML", "JSON", "PARTNER_FEED", "SUPPLIER_ACCOUNT"].includes(sourceType)) return "supplier_communicated";
  return "unknown";
}

const OFFER_SELECT =
  "id, sku_id, supplier_id, title_original, source_url, normalized_price, normalized_currency, original_currency, fx_rate, tax_type, shipping_cost, shipping_currency, moq, available_quantity, stock_status, last_seen_at, country, ship_from_country, vat_regime, warranty_months, order_multiple, source_id, grade, condition, delivery_max_days, supplier:suppliers(name, country, internal_score), source:supplier_sources(source_type, config, consecutive_failures)";

/**
 * Frais de port dans la devise de l'organisation : même devise que le prix normalisé → tels quels ;
 * devise du prix d'origine → convertis au même taux daté ; autre devise → inconnus (jamais additionnés tels quels).
 */
export function shippingInOrgCurrency(o: { shipping_cost: number | null; shipping_currency: string | null; original_currency: string | null; normalized_currency: string | null; fx_rate: number | null }): number | null {
  if (o.shipping_cost === null || o.shipping_cost === undefined) return null;
  const cur = (o.shipping_currency ?? o.original_currency ?? "").toUpperCase();
  if (o.normalized_currency && cur === o.normalized_currency.toUpperCase()) return o.shipping_cost;
  if (o.original_currency && cur === o.original_currency.toUpperCase() && o.fx_rate) return Math.round(o.shipping_cost * o.fx_rate * 100) / 100;
  return null;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function buildRadar(ctx: OrgContext, options: { sort?: RadarSort; now?: Date } = {}): Promise<RadarDTO> {
  const orgId = ctx.organization.id;
  const now = options.now ?? new Date();
  const [stockRes, offersRes, savedRes, channelsRes, unlinkedRes] = await Promise.all([
    ctx.supabase
      .from("v_stock_overview")
      .select("sku_id, code, product_name, variant_name, currency, avg_sale_price_30d, sale_price, cost_price, units_30d, quantity_available, reorder_point")
      .eq("organization_id", orgId)
      .eq("product_archived", false)
      .limit(5000),
    ctx.supabase.from("sourcing_offers").select(OFFER_SELECT).eq("organization_id", orgId).eq("status", "active").not("sku_id", "is", null).limit(3000),
    ctx.supabase.from("sourcing_saved_offers").select("offer_id, price_at_save, note, created_at").eq("organization_id", orgId).limit(1000),
    ctx.supabase.from("sales_channels").select("provider, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost, is_active").eq("organization_id", orgId),
    ctx.supabase.from("sourcing_offers").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active").is("sku_id", null),
  ]);
  for (const r of [stockRes, offersRes, savedRes, channelsRes]) if (r.error) throw fromPostgrestError(r.error);

  const channels = channelsRes.data ?? [];
  const channel = channels.find((c) => c.provider === "ebay") ?? channels.find((c) => c.provider !== "manual") ?? channels[0] ?? null;
  const { settings, fromChannel } = readCostSettings(ctx.organization.settings, channel);

  const skus = new Map<string, RadarSkuInput>();
  for (const r of stockRes.data ?? []) {
    if (!r.sku_id) continue;
    skus.set(r.sku_id, {
      skuId: r.sku_id,
      code: r.code ?? "",
      name: [r.product_name, r.variant_name && r.variant_name !== "Standard" ? r.variant_name : null].filter(Boolean).join(" · "),
      currency: r.currency ?? ctx.organization.default_currency,
      avgSalePrice30d: r.avg_sale_price_30d,
      salePrice: r.sale_price,
      currentCost: r.cost_price,
      units30d: r.units_30d ?? 0,
      quantityAvailable: r.quantity_available ?? 0,
      reorderPoint: r.reorder_point,
    });
  }
  const saved = new Map((savedRes.data ?? []).map((s) => [s.offer_id, s]));
  const offers = (offersRes.data ?? []).filter((o) => o.sku_id && skus.has(o.sku_id));

  // prix précédent (historique réel) des offres retenues
  const previous = new Map<string, number>();
  const ids = offers.map((o) => o.id).slice(0, 1000);
  if (ids.length) {
    const { data: hist } = await ctx.supabase.from("supplier_price_history").select("offer_id, normalized_price, recorded_at").eq("organization_id", orgId).in("offer_id", ids).order("recorded_at", { ascending: false }).limit(5000);
    const byOffer = new Map<string, number[]>();
    for (const h of hist ?? []) if (h.normalized_price !== null) byOffer.set(h.offer_id, [...(byOffer.get(h.offer_id) ?? []), h.normalized_price]);
    for (const o of offers) {
      const prices = byOffer.get(o.id) ?? [];
      const prev = prices.find((p) => p !== o.normalized_price);
      if (prev !== undefined) previous.set(o.id, prev);
    }
  }

  const perSku = new Map<string, number[]>();
  for (const o of offers) if (o.normalized_price !== null) perSku.set(o.sku_id!, [...(perSku.get(o.sku_id!) ?? []), o.normalized_price]);

  // source, score fournisseur et échecs consécutifs par offre (pour l'appréciation)
  const meta = new Map<string, { sourceId: string; supplierScore: number | null; failures: number }>();
  const items: RadarItemDTO[] = offers.map((o) => {
    const sku = skus.get(o.sku_id!)!;
    const supplier = one(o.supplier);
    const source = one(o.source);
    const input: RadarOfferInput = {
      offerId: o.id,
      supplierName: supplier?.name ?? "Fournisseur",
      // pays d'expédition déclaré d'abord (droits de douane hors UE), sinon pays du fournisseur
      supplierCountry: o.ship_from_country ?? supplier?.country ?? o.country ?? null,
      title: o.title_original,
      sourceUrl: o.source_url,
      price: o.normalized_price,
      currency: o.normalized_currency,
      taxType: o.tax_type,
      shippingCost: shippingInOrgCurrency(o),
      moq: o.moq,
      availableQuantity: o.available_quantity,
      stockStatus: o.stock_status,
      lastSeenAt: o.last_seen_at,
      priceOrigin: priceOriginOf(source?.source_type ?? "", source?.config ?? null),
      previousPrice: previous.get(o.id) ?? null,
      saved: saved.has(o.id),
    };
    const evaluation = evaluateRadarOffer(input, sku, settings, now);
    const competing = perSku.get(sku.skuId) ?? [];
    if (competing.length > 1 && o.normalized_price !== null) {
      const min = Math.min(...competing);
      const max = Math.max(...competing);
      if (o.normalized_price === min && max > min) evaluation.reasons.unshift(`Meilleur prix parmi ${competing.length} offres (écart ${(max - min).toFixed(2)}).`);
    }
    const s = saved.get(o.id);
    const details = { shipFromCountry: o.ship_from_country ?? null, warrantyMonths: o.warranty_months ?? null, vatRegime: o.vat_regime ?? null, orderMultiple: o.order_multiple ?? null, condition: o.condition ?? null, grade: o.grade ?? null, deliveryMaxDays: o.delivery_max_days ?? null };
    meta.set(o.id, { sourceId: o.source_id, supplierScore: supplier?.internal_score ?? null, failures: source?.consecutive_failures ?? 0 });
    // l'appréciation est calculée plus bas, une fois toutes les offres du même produit connues
    return { supplierId: o.supplier_id, sku: { id: sku.skuId, code: sku.code, name: sku.name, currency: sku.currency, units30d: sku.units30d, quantityAvailable: sku.quantityAvailable }, offer: input, savedAt: s?.created_at ?? null, priceAtSave: s?.price_at_save ?? null, evaluation, offersForSku: competing.length, details, assessment: undefined as unknown as RadarItemDTO["assessment"] };
  });

  // Appréciation en trois notes : coûts rendus des autres offres du même produit + historique de la source.
  const history = await loadSourceHistory(ctx, [...new Set(offers.map((o) => o.source_id))], [...new Set(offers.map((o) => o.supplier_id))]);
  for (const raw of items) {
    const peers = items.filter((x) => x.sku.id === raw.sku.id && x.offer.offerId !== raw.offer.offerId).map((x) => x.evaluation.landedCost).filter((c): c is number => c !== null);
    const m = meta.get(raw.offer.offerId)!;
    const h = history.get(m.sourceId);
    const source: SourceHistory = { runs: h?.runs ?? 0, successfulRuns: h?.success ?? 0, consecutiveFailures: m.failures, receivedPurchaseOrders: history.get(`po:${raw.supplierId}`)?.runs ?? 0, supplierScore: m.supplierScore };
    raw.assessment = assessOffer({
      landedUnitCost: raw.evaluation.landedCost,
      peerLandedCosts: peers,
      estimatedProfit: raw.evaluation.estimatedProfit,
      marginPercent: raw.evaluation.marginPercent,
      availableQuantity: raw.offer.availableQuantity,
      stockStatus: raw.offer.stockStatus,
      moq: raw.offer.moq,
      ageDays: raw.evaluation.ageDays,
      priceOrigin: raw.offer.priceOrigin,
      taxType: raw.offer.taxType,
      vatRegime: raw.details.vatRegime,
      shippingKnown: raw.offer.shippingCost !== null,
      deliveryKnown: raw.details.deliveryMaxDays !== null,
      gradeOrCondition: Boolean(raw.details.grade) || (raw.details.condition !== null && raw.details.condition !== "unknown"),
      warrantyKnown: raw.details.warrantyMonths !== null,
      source,
    });
  }
  items.sort(compareRadar(options.sort ?? "score"));

  // réapprovisionnement : produits vendus dont le stock couvre moins de 14 jours
  const restock: RadarRestockDTO[] = [];
  for (const sku of skus.values()) {
    if (sku.units30d <= 0) continue;
    const daily = sku.units30d / 30;
    const daysOfCover = daily > 0 ? Math.floor(sku.quantityAvailable / daily) : null;
    const low = sku.quantityAvailable <= Math.max(sku.reorderPoint ?? 0, 0) || (daysOfCover !== null && daysOfCover < 14);
    if (!low) continue;
    const best = items.filter((i) => i.sku.id === sku.skuId && i.offer.price !== null).sort((a, b) => (a.offer.price ?? 0) - (b.offer.price ?? 0))[0];
    restock.push({ skuId: sku.skuId, code: sku.code, name: sku.name, quantityAvailable: sku.quantityAvailable, units30d: sku.units30d, daysOfCover, bestOfferId: best?.offer.offerId ?? null, bestPrice: best?.offer.price ?? null, bestSupplier: best?.offer.supplierName ?? null });
  }
  restock.sort((a, b) => (a.daysOfCover ?? 0) - (b.daysOfCover ?? 0));

  return {
    items: items.slice(0, 300),
    restock: restock.slice(0, 100),
    settings,
    settingsFromChannel: fromChannel,
    missingSettings: missingSettings(settings),
    counts: {
      profitable: items.filter((i) => i.evaluation.status === "profitable").length,
      estimated: items.filter((i) => i.evaluation.status === "estimated").length,
      unprofitable: items.filter((i) => i.evaluation.status === "unprofitable").length,
      insufficient: items.filter((i) => i.evaluation.status === "insufficient_data").length,
      unlinkedOffers: unlinkedRes.count ?? 0,
      skus: skus.size,
    },
    computedAt: now.toISOString(),
  };
}

/**
 * Historique de fiabilité : synchronisations / imports terminés des 60 derniers jours par source
 * (journal sync_runs, réf. = source ou flux) et commandes fournisseur reçues (« po:<fournisseur> »).
 */
async function loadSourceHistory(ctx: OrgContext, sourceIds: string[], supplierIds: string[]): Promise<Map<string, { runs: number; success: number }>> {
  const out = new Map<string, { runs: number; success: number }>();
  if (sourceIds.length === 0) return out;
  const orgId = ctx.organization.id;
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: feeds } = await ctx.supabase.from("supplier_feeds").select("id, source_id").eq("organization_id", orgId).in("source_id", sourceIds.slice(0, 200));
  const refToSource = new Map<string, string>(sourceIds.map((id) => [id, id]));
  for (const f of feeds ?? []) refToSource.set(f.id, f.source_id);
  const { data: runs } = await ctx.supabase.from("sync_runs").select("source_ref, status").eq("organization_id", orgId).in("source_ref", [...refToSource.keys()].slice(0, 400)).in("status", ["success", "partial", "failed"]).gte("started_at", since).limit(5000);
  for (const r of runs ?? []) {
    const src = r.source_ref ? refToSource.get(r.source_ref) : null;
    if (!src) continue;
    const e = out.get(src) ?? { runs: 0, success: 0 };
    e.runs++;
    if (r.status !== "failed") e.success++;
    out.set(src, e);
  }
  if (supplierIds.length) {
    const { data: pos } = await ctx.supabase.from("purchase_orders").select("supplier_id").eq("organization_id", orgId).eq("status", "received").in("supplier_id", supplierIds.slice(0, 200)).limit(5000);
    for (const po of pos ?? []) {
      const k = `po:${po.supplier_id}`;
      const e = out.get(k) ?? { runs: 0, success: 0 };
      e.runs++;
      out.set(k, e);
    }
  }
  return out;
}

/** Détail d'une offre du radar : appréciation, scénarios de quantité et offres concurrentes. */
export async function buildRadarOffer(ctx: OrgContext, offerId: string, extraQuantities: number[] = [], now: Date = new Date()): Promise<RadarOfferDetailDTO> {
  const radar = await buildRadar(ctx, { now });
  const item = radar.items.find((i) => i.offer.offerId === offerId);
  if (!item) throw new AppError("NOT_FOUND", "Offre absente du radar (non rapprochée d'un SKU, expirée ou d'une autre organisation).");
  const { data: sku } = await ctx.supabase.from("v_stock_overview").select("avg_sale_price_30d, sale_price").eq("organization_id", ctx.organization.id).eq("sku_id", item.sku.id).maybeSingle();
  const sale = sku?.avg_sale_price_30d ?? sku?.sale_price ?? null;
  const country = item.offer.supplierCountry?.toUpperCase() ?? null;
  const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);
  const scenarios = quantityScenarios(
    {
      salePrice: sale,
      saleLabel: sku?.avg_sale_price_30d !== null && sku?.avg_sale_price_30d !== undefined ? "Prix de vente moyen constaté (30 j)" : "Prix de vente du SKU",
      purchasePrice: item.offer.price,
      purchaseTaxType: item.offer.taxType,
      supplierShipping: item.offer.shippingCost,
      moq: item.offer.moq,
      orderMultiple: item.details.orderMultiple,
      availableQuantity: item.offer.availableQuantity,
      supplierOrigin: country ? (EU.has(country) ? "eu" : "non_eu") : "unknown",
      originLabel: country,
    },
    radar.settings,
    extraQuantities,
  );
  const peers = radar.items
    .filter((i) => i.sku.id === item.sku.id && i.offer.offerId !== offerId)
    .map((i) => ({ offerId: i.offer.offerId, supplierName: i.offer.supplierName, price: i.offer.price, landedCost: i.evaluation.landedCost, availableQuantity: i.offer.availableQuantity, stockStatus: i.offer.stockStatus, ageDays: i.evaluation.ageDays, verdict: i.assessment.verdict }))
    .sort((a, b) => (a.landedCost ?? Infinity) - (b.landedCost ?? Infinity));
  return { item, scenarios, peers, settings: radar.settings };
}

/** Enregistre les paramètres de coûts (administrateur), sans toucher aux autres réglages de l'organisation. */
export async function saveCostSettings(ctx: OrgContext, input: RadarCostSettings): Promise<RadarCostSettings> {
  const parsed = radarSettingsSchema.parse(input);
  const { data: org, error } = await ctx.supabase.from("organizations").select("settings").eq("id", ctx.organization.id).single();
  if (error || !org) throw fromPostgrestError(error ?? { message: "Organisation introuvable" });
  const current = (org.settings ?? {}) as Record<string, Json>;
  const { error: upErr } = await ctx.supabase
    .from("organizations")
    .update({ settings: { ...current, radar: parsed as unknown as Json } as NonNullable<Json> })
    .eq("id", ctx.organization.id);
  if (upErr) {
    if (/row-level security|permission/i.test(upErr.message)) throw new AppError("FORBIDDEN", "Seul un administrateur peut modifier les paramètres de coûts.");
    throw fromPostgrestError(upErr);
  }
  return parsed;
}
