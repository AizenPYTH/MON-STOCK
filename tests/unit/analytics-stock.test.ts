import { describe, expect, it } from "vitest";
import type { StockOverviewRow } from "@/db/types";
import { enrichStockRow } from "@/features/stock/model";
import { groupStockViews, isDeadStock } from "@/features/analytics/stock.pure";
import { buildRecommendation, draftToInsert, onOrderBySku, pickCheapestOffer, resolveLeadTime, shouldSnapshot } from "@/features/analytics/replenishment.pure";

const NOW = new Date("2026-10-07T12:00:00Z");
const CTX = { feePercent: 10, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null };

function row(over: Partial<StockOverviewRow>): StockOverviewRow {
  return {
    active_listings_count: 0,
    avg_sale_price_30d: null,
    barcode: null,
    best_supplier_price: null,
    brand: null,
    category: null,
    code: "SKU",
    condition: "unknown",
    cost_price: 50,
    currency: "EUR",
    default_supplier_id: null,
    first_sale_at: null,
    grade: null,
    image_url: null,
    is_active: true,
    last_movement_at: null,
    last_sale_at: null,
    lead_time_days: null,
    location: null,
    organization_id: "org",
    product_id: "p",
    product_name: "Produit",
    quantity_available: 10,
    quantity_on_hand: 10,
    quantity_reserved: 0,
    reorder_point: 0,
    revenue_30d: 0,
    safety_stock: 0,
    sale_price: 100,
    sku_id: "sku",
    stock_value: null,
    supplier_offers_count: 0,
    unit_margin: null,
    units_30d: 0,
    units_7d: 0,
    units_90d: 0,
    units_prev_30d: 0,
    units_prev_7d: 0,
    variant_id: "v",
    variant_name: "Standard",
    ...over,
  };
}

const view = (over: Partial<StockOverviewRow>) => enrichStockRow(row(over), CTX, NOW);

describe("groupStockViews", () => {
  it("regroupe par niveau et valorise uniquement les coûts connus", () => {
    const views = [
      view({ sku_id: "a", code: "A", quantity_available: 0, quantity_on_hand: 0 }), // rupture
      view({ sku_id: "b", code: "B", quantity_available: 3, quantity_on_hand: 3, units_7d: 7, units_30d: 20, units_90d: 30, first_sale_at: "2026-06-01T00:00:00Z", last_sale_at: "2026-10-06T00:00:00Z" }), // 1/j → 3 j de couverture → risque
      view({ sku_id: "c", code: "C", quantity_available: 100, quantity_on_hand: 100, cost_price: null, last_sale_at: "2026-10-01T00:00:00Z" }), // normal, coût inconnu
      view({ sku_id: "d", code: "D", quantity_available: -2, quantity_on_hand: -2 }), // négatif
      view({ sku_id: "e", code: "E", quantity_available: 20, quantity_on_hand: 20, cost_price: 4, last_sale_at: "2026-07-01T00:00:00Z" }), // dormant
    ];
    const a = groupStockViews(views, NOW);
    expect(a.counts).toEqual({ out_of_stock: 2, at_risk: 1, low: 0, normal: 2 });
    expect(a.totals.stockValueKnown).toBe(10 * 0 + 3 * 50 + 20 * 4); // A et D sans stock positif
    expect(a.totals.skusValued).toBe(2);
    expect(a.totals.skusUnknownCost).toBe(1);
    expect(a.totals.skusUnknownCostWithStock).toBe(1);
    expect(a.negativeStock.map((v) => v.row.code)).toEqual(["D"]);
    expect(a.deadStock.map((v) => v.row.code)).toEqual(["E"]);
    expect(a.topSellers.map((v) => v.row.code)).toEqual(["B"]);
    // Rupture : le SKU au stock négatif (couverture inconnue) vient après celui dont la vitesse est connue ? Les deux sans vente → ordre par nom.
    expect(a.byLevel.out_of_stock.map((v) => v.row.code)).toEqual(["A", "D"]);
  });

  it("ne considère pas comme dormant un SKU sans stock", () => {
    expect(isDeadStock(view({ quantity_available: 0 }), NOW)).toBe(false);
    expect(isDeadStock(view({ quantity_available: 5, last_sale_at: null }), NOW)).toBe(true);
  });
});

describe("replenishment helpers", () => {
  it("choisit l'offre la moins chère au prix normalisé", () => {
    expect(pickCheapestOffer([{ normalized_price: null }, { normalized_price: 12 }, { normalized_price: 9 }])?.normalized_price).toBe(9);
    expect(pickCheapestOffer([])).toBeNull();
  });

  it("résout le délai dans l'ordre SKU → offre → fournisseur → inconnu", () => {
    expect(resolveLeadTime({ skuLeadTimeDays: 3, offerDeliveryMaxDays: 5, supplierAverageLeadTimeDays: 9 })).toEqual({ leadTimeDays: 3, source: "sku" });
    expect(resolveLeadTime({ skuLeadTimeDays: null, offerDeliveryMaxDays: 5, supplierAverageLeadTimeDays: 9 })).toEqual({ leadTimeDays: 5, source: "offer" });
    expect(resolveLeadTime({ skuLeadTimeDays: null, offerDeliveryMaxDays: null, supplierAverageLeadTimeDays: 9 })).toEqual({ leadTimeDays: 9, source: "supplier" });
    expect(resolveLeadTime({ skuLeadTimeDays: null, offerDeliveryMaxDays: null, supplierAverageLeadTimeDays: null })).toEqual({ leadTimeDays: null, source: null });
  });

  it("ne compte en commande que les commandes fournisseur en cours et non reçues", () => {
    const m = onOrderBySku([
      { sku_id: "a", quantity_ordered: 10, quantity_received: 4, status: "sent" },
      { sku_id: "a", quantity_ordered: 5, quantity_received: 5, status: "confirmed" },
      { sku_id: "b", quantity_ordered: 8, quantity_received: 0, status: "draft" },
      { sku_id: "c", quantity_ordered: 8, quantity_received: 2, status: "partially_received" },
    ]);
    expect(m.get("a")).toBe(6);
    expect(m.has("b")).toBe(false);
    expect(m.get("c")).toBe(6);
  });

  it("construit une recommandation expliquée et un instantané persistable", () => {
    const v = view({ sku_id: "b", code: "B", quantity_available: 3, quantity_on_hand: 3, units_7d: 7, units_30d: 20, units_90d: 30, first_sale_at: "2026-06-01T00:00:00Z", last_sale_at: "2026-10-06T00:00:00Z", safety_stock: 2 });
    const offer = { id: "o1", sku_id: "b", supplier_id: "s1", normalized_price: 40, normalized_currency: "EUR", moq: 10, available_quantity: 100, delivery_min_days: 2, delivery_max_days: 4, shipping_cost: null, last_seen_at: NOW.toISOString() };
    const supplier = { id: "s1", name: "Grossiste", average_lead_time_days: 9, default_moq: null };
    const draft = buildRecommendation(v, { offer, offerSupplier: supplier, defaultSupplier: null, onOrder: 1 });
    expect(draft.leadTimeDays).toBe(4);
    expect(draft.leadTimeSource).toBe("offer");
    expect(draft.moq).toBe(10);
    expect(draft.supplier?.name).toBe("Grossiste");
    // vitesse 1/j : cible = 4 + 14 + 2 = 20 ; brut = 20 − 3 − 1 = 16 ; MOQ 10 → 20
    expect(draft.result.recommendedQuantity).toBe(20);
    expect(draft.result.explanation).toContain("MOQ");
    expect(shouldSnapshot(draft)).toBe(true);
    const insert = draftToInsert(draft, "org", "2026-10-07T12:00:00.000Z");
    expect(insert).toMatchObject({ organization_id: "org", sku_id: "b", recommended_quantity: 20, supplier_id: "s1", offer_id: "o1", status: "open", lead_time_days: 4, safety_stock: 2 });
    expect(insert.days_of_cover).toBe(3);
    expect((insert.inputs as { on_order: number }).on_order).toBe(1);
  });

  it("n'instantanéise pas un SKU normal sans besoin et n'invente rien sans ventes", () => {
    const draft = buildRecommendation(view({ quantity_available: 500, quantity_on_hand: 500 }), { offer: null, offerSupplier: null, defaultSupplier: null, onOrder: 0 });
    expect(draft.result.recommendedQuantity).toBeNull();
    expect(draft.result.explanation).toContain("Pas assez de données");
    expect(shouldSnapshot(draft)).toBe(false);
  });
});
