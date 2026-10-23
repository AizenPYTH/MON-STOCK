import "server-only";
import { hasExtendedEbayScopes } from "@/integrations/ebay/config";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { skuLabel } from "@/features/stock/model";
import { getIntegrationsOverview } from "@/features/integrations/queries";
import { loadSourcingStatus } from "@/features/sourcing/status-queries";
import { sourcingSearchParamsSchema, toOfferFilters } from "@/features/sourcing/schemas";
import { searchOffers, type SearchOfferView } from "@/services/sourcing/search";
import type { IntegrationsDTO, SourcingOfferDTO, SourcingSearchDTO, SourcingSearchQuery, SourcingStatusDTO } from "@/features/mobile-api/contract";

/**
 * Projection des requêtes EXISTANTES (les mêmes que les pages web) vers le contrat de l'API
 * mobile. Aucun calcul métier n'est réimplémenté ici : seule la forme des données change.
 *
 * Seules les projections servies par l'Edge Function sont ici (recherche d'offres, état du
 * sourcing, intégrations). Le stock, les ventes, le tableau de bord, les fournisseurs et les bons de
 * commande sont lus par l'application iPhone directement sous RLS (apps/mobile/src/data) ; leurs
 * anciennes projections serveur, inutilisées, ont été retirées (audit S-26).
 */

// ---------------------------------------------------------------------------------------------
// Sourcing
// ---------------------------------------------------------------------------------------------
export function sourcingOfferDTO(v: SearchOfferView): SourcingOfferDTO {
  const o = v.offer;
  return {
    id: o.id,
    title: o.title_original,
    supplierId: o.supplier_id,
    supplierName: v.supplierName,
    supplierCountry: v.supplierCountry,
    sourceUrl: o.source_url,
    price: o.original_price,
    currency: o.original_currency,
    comparableUnitPrice: v.comparableUnitPrice,
    comparableNote: v.comparableNote,
    landedUnitCost: v.landedCost?.unitLandedCost ?? null,
    shippingCost: o.shipping_cost,
    shippingCurrency: o.shipping_currency,
    taxType: o.tax_type,
    lastSeenAt: o.last_seen_at,
    quantityAvailable: o.available_quantity,
    stockStatus: o.stock_status,
    moq: o.moq,
    deliveryDays: o.delivery_max_days,
    condition: o.condition,
    grade: o.grade,
    rank: v.ranking.rank,
    score: v.ranking.score,
    why: v.ranking.why,
    unknownFactors: v.ranking.unknownFactors,
    awards: v.ranking.awards,
    confidence: v.confidenceBadge,
    freshnessLabel: v.freshness.label,
    procurement: v.ranking.procurement,
    savings: v.savings,
    marginNetProfit: v.margin?.result.netProfit ?? null,
    marginUnavailableReason: v.marginUnavailableReason,
    warnings: v.filterWarnings,
    provenance: v.provenance ? { method: v.provenance.method, adapterKey: v.provenance.adapterKey, retrievedAt: v.provenance.retrievedAt } : null,
    usualPriceNote: v.priceInsights?.opportunity?.message ?? v.priceInsights?.reason ?? null,
    duplicatesCollapsed: v.duplicatesCollapsed,
  };
}

export async function sourcingSearch(ctx: OrgContext, q: SourcingSearchQuery): Promise<SourcingSearchDTO> {
  const params = sourcingSearchParamsSchema.parse({ q: q.q, sku: q.sku, qty: q.qty, max_price: q.max_price, page: q.page, live: q.live });
  const live = params.live !== "0";
  const r = await searchOffers(ctx, { query: params.q ?? "", skuCode: params.sku ?? null, filters: toOfferFilters(params), live });
  return {
    query: params.q ?? "",
    sku: r.sku
      ? { id: r.sku.id, code: r.sku.code, label: skuLabel({ product_name: `${r.sku.brand ? `${r.sku.brand} ` : ""}${r.sku.productName}`, variant_name: r.sku.variantName }), costPrice: r.sku.costPrice, currency: r.sku.currency }
      : null,
    requestedQuantity: r.requestedQuantity,
    currency: ctx.organization.default_currency,
    offers: r.views.map(sourcingOfferDTO),
    total: r.total,
    page: r.page,
    pageSize: r.pageSize,
    podium: r.podium,
    highlights: r.highlights,
    awardOffers: r.awardOffers,
    currentUnitCost: r.currentUnitCost,
    bestSavings: r.bestSavings,
    priceBasisNote: r.priceBasisNote,
    rejected: { count: r.rejected.count, groups: r.rejected.groups.map((g) => ({ code: g.code, label: g.label, count: g.count })) },
    connectedSources: r.connectedSources,
    live: r.live
      ? {
          queried: r.live.queried,
          found: r.live.found,
          stored: r.live.stored,
          durationMs: r.live.durationMs,
          sources: r.live.sources.map((s) => ({ name: s.sourceName, supplierName: s.supplierName, status: s.status, message: s.message, found: s.found })),
        }
      : null,
    discovery: { state: r.discovery.state, message: r.discovery.message },
  };
}

export async function sourcingStatus(ctx: OrgContext): Promise<SourcingStatusDTO> {
  const s = await loadSourcingStatus(ctx);
  return { items: s.items.map((i) => ({ key: i.key, label: i.label, value: i.value, scope: i.scope, hint: i.detail })), offerCountsIncomplete: s.offerCountsIncomplete };
}

// ---------------------------------------------------------------------------------------------
// Intégrations
// ---------------------------------------------------------------------------------------------
export async function integrations(ctx: OrgContext): Promise<IntegrationsDTO> {
  const o = await getIntegrationsOverview(ctx);
  if (o.queryError) throw new AppError("INTERNAL", o.queryError);
  return {
    ebay: { configured: o.ebay.configured, environment: o.ebay.environment },
    connections: o.connections.map(({ connection: c, channelName, lastRun }) => ({
      connectionId: c.id,
      provider: c.provider,
      channelName,
      status: c.status,
      environment: c.environment,
      externalUsername: c.external_username,
      lastSyncAt: c.last_sync_at,
      lastSuccessfulSyncAt: c.last_successful_sync_at,
      lastError: c.last_error,
      autoSync: c.auto_sync,
      lastRun: lastRun ? { id: lastRun.id, status: lastRun.status, startedAt: lastRun.started_at, finishedAt: lastRun.finished_at, errorCount: lastRun.error_count } : null,
      extendedAnalysis: c.provider === "ebay" && hasExtendedEbayScopes(c.scopes),
    })),
    unmappedCount: o.unmappedCount,
    comingSoon: o.catalog.filter((c) => !c.available).map((c) => c.label),
  };
}
