import { filterCatalog, groupByProduct, summarizeProduct } from "~/data/catalog";

const ctx = { feePercent: null, paymentFeePercent: null, paymentFeeFixed: null, shippingCost: null };
function row(o: Record<string, unknown>) {
  return {
    sku_id: "s",
    product_id: "p",
    product_name: "iPhone 13",
    variant_name: "Standard",
    code: "IP13",
    barcode: null,
    brand: "Apple",
    category: null,
    image_url: null,
    quantity_available: 5,
    quantity_on_hand: 5,
    quantity_reserved: 0,
    reorder_point: 2,
    safety_stock: 0,
    lead_time_days: null,
    units_7d: 0,
    units_30d: 0,
    units_90d: 0,
    units_prev_7d: 0,
    units_prev_30d: 0,
    first_sale_at: null,
    last_sale_at: null,
    sale_price: 489,
    cost_price: 320,
    currency: "EUR",
    active_listings_count: 0,
    ...o,
  } as never;
}

describe("catalogue produit → variantes", () => {
  const rows = [
    row({ sku_id: "a1", product_id: "A", product_name: "AirPods Pro 2", code: "APP2", quantity_available: 0, quantity_on_hand: 0 }),
    row({ sku_id: "i1", product_id: "I", product_name: "iPhone 13 128 Go", code: "IPH13-128-MN", variant_name: "Minuit · Bon état", quantity_available: 2, active_listings_count: 3 }),
    row({ sku_id: "i2", product_id: "I", product_name: "iPhone 13 128 Go", code: "IPH13-128-LS", variant_name: "Lumière stellaire", quantity_available: 1, active_listings_count: 1 }),
    row({ sku_id: "g1", product_id: "G", product_name: "Galaxy S22", code: "GS22", quantity_available: 9, reorder_point: 0, units_30d: 3, units_90d: 9 }),
  ];
  const products = groupByProduct(rows, ctx);

  it("regroupe les SKU par produit et totalise la quantité", () => {
    const iphone = products.find((p) => p.productId === "I")!;
    expect(iphone.skus).toHaveLength(2);
    expect(iphone.totalAvailable).toBe(3);
    expect(iphone.activeListings).toBe(4);
  });

  it("niveau : rupture si total ≤ 0, faible si une variante est sous son seuil, trié alertes d'abord", () => {
    expect(products.map((p) => [p.productId, p.level])).toEqual([
      ["A", "out"],
      ["I", "low"],
      ["G", "ok"],
    ]);
  });

  it("recherche locale sans accents ni casse, par code variante, et filtres", () => {
    expect(filterCatalog(products, "all", "iphone ls").map((p) => p.productId)).toEqual(["I"]);
    expect(filterCatalog(products, "all", "IPH13-128-mn").map((p) => p.productId)).toEqual(["I"]);
    expect(filterCatalog(products, "out", "").map((p) => p.productId)).toEqual(["A"]);
    expect(filterCatalog(products, "unlisted", "").map((p) => p.productId)).toEqual(["A", "G"]);
  });

  it("fiche produit : coût moyen pondéré par le stock, marge nette calculée par le domaine", () => {
    const s = summarizeProduct(products.find((p) => p.productId === "I")!, ctx, "EUR");
    expect(s.price).toEqual({ min: 489, max: 489 });
    expect(s.averageCost).toBe(320);
    // Frais du canal inconnus : non déduits (signalés par le domaine), marge = (489 − 320) / 489.
    expect(s.netMarginPercent).toBeCloseTo(34.56, 1);
    const withFees = summarizeProduct(products.find((p) => p.productId === "I")!, { feePercent: 12.9, paymentFeePercent: 0, paymentFeeFixed: 0.3, shippingCost: 0 }, "EUR");
    expect(withFees.netMarginPercent!).toBeLessThan(s.netMarginPercent!);
  });
});
