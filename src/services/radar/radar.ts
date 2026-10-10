import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import type { RadarDTO, RadarItemDTO, RadarRestockDTO } from "@/features/mobile-api/contract";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { compareRadar, EMPTY_COST_SETTINGS, evaluateRadarOffer, missingSettings, type PriceOrigin, type RadarCostSettings, type RadarOfferInput, type RadarSkuInput, type RadarSort } from "@/domain/sourcing/radar";

/**
 * Radar d'opportunités d'achat : offres fournisseurs RÉELLES rapprochées de vos SKU, évaluées
 * avec vos ventes réelles et vos paramètres de coûts. Lecture seule, sous la session de
 * l'utilisateur (RLS). Aucune commande n'est passée : un brouillon de commande reste une action
 * explicite de l'utilisateur.
 */

const nullableNumber = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();

export const radarSettingsSchema = z.object({
  vatRegime: z.enum(["normal", "margin", "franchise"]).nullable(),
  vatRate: nullableNumber(0, 30),
  vatRecoverable: z.boolean().nullable(),
  marketplaceFeePercent: nullableNumber(0, 50),
  paymentFeePercent: nullableNumber(0, 20),
  paymentFeeFixed: nullableNumber(0, 50),
  shippingToCustomer: nullableNumber(0, 500),
  packagingCost: nullableNumber(0, 100),
  returnProvisionPercent: nullableNumber(0, 50),
  importDutyPercent: nullableNumber(0, 100),
});

/** Paramètres enregistrés dans organizations.settings.radar ; commission / paiement / port repris du canal eBay s'ils manquent. */
export function readCostSettings(orgSettings: unknown, channel: { fee_percent: number | null; payment_fee_percent: number | null; payment_fee_fixed: number | null; default_shipping_cost: number | null } | null): { settings: RadarCostSettings; fromChannel: string[] } {
  // Validation champ par champ : une valeur invalide est ignorée sans écarter les autres réglages.
  const raw = ((orgSettings as { radar?: unknown } | null)?.radar ?? {}) as Record<string, unknown>;
  const s: RadarCostSettings = { ...EMPTY_COST_SETTINGS };
  for (const [key, schema] of Object.entries(radarSettingsSchema.shape) as [keyof RadarCostSettings, z.ZodTypeAny][]) {
    if (!(key in raw)) continue;
    const parsed = schema.safeParse(raw[key]);
    if (parsed.success) (s as unknown as Record<string, unknown>)[key] = parsed.data;
  }
  const fromChannel: string[] = [];
  if (channel) {
    if (s.marketplaceFeePercent === null && channel.fee_percent !== null) {
      s.marketplaceFeePercent = channel.fee_percent;
      fromChannel.push("commission marketplace");
    }
    if (s.paymentFeePercent === null && s.paymentFeeFixed === null && (channel.payment_fee_percent !== null || channel.payment_fee_fixed !== null)) {
      s.paymentFeePercent = channel.payment_fee_percent;
      s.paymentFeeFixed = channel.payment_fee_fixed;
      fromChannel.push("frais de paiement");
    }
    if (s.shippingToCustomer === null && channel.default_shipping_cost !== null) {
      s.shippingToCustomer = channel.default_shipping_cost;
      fromChannel.push("expédition au client");
    }
  }
  return { settings: s, fromChannel };
}

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
  "id, sku_id, supplier_id, title_original, source_url, normalized_price, normalized_currency, tax_type, shipping_cost, moq, available_quantity, stock_status, last_seen_at, country, supplier:suppliers(name, country), source:supplier_sources(source_type, config)";

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

  const items: RadarItemDTO[] = offers.map((o) => {
    const sku = skus.get(o.sku_id!)!;
    const supplier = one(o.supplier);
    const source = one(o.source);
    const input: RadarOfferInput = {
      offerId: o.id,
      supplierName: supplier?.name ?? "Fournisseur",
      supplierCountry: supplier?.country ?? o.country ?? null,
      title: o.title_original,
      sourceUrl: o.source_url,
      price: o.normalized_price,
      currency: o.normalized_currency,
      taxType: o.tax_type,
      shippingCost: o.shipping_cost,
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
    return { supplierId: o.supplier_id, sku: { id: sku.skuId, code: sku.code, name: sku.name, currency: sku.currency, units30d: sku.units30d, quantityAvailable: sku.quantityAvailable }, offer: input, savedAt: s?.created_at ?? null, priceAtSave: s?.price_at_save ?? null, evaluation, offersForSku: competing.length };
  });
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
