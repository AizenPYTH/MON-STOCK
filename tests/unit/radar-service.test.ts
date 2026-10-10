import { describe, expect, it } from "vitest";
import { buildRadar, priceOriginOf, readCostSettings, saveCostSettings } from "@/services/radar/radar";
import { fakeSupabase } from "./helpers/fake-supabase";

/** Radar côté serveur : assemblage des vraies lignes (stock, offres, historique, canaux), filtres par organisation. */
const ORG = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-10T12:00:00Z");

function ctxWith(responses: Parameters<typeof fakeSupabase>[0], settings: unknown = {}) {
  const { client, queries } = fakeSupabase(responses);
  return { ctx: { supabase: client, organization: { id: ORG, name: "Org", default_currency: "EUR", settings }, user: { id: "u1" }, role: "admin" } as never, queries };
}

const stock = [
  { sku_id: "s1", code: "IP13-128-NR-A", product_name: "Apple iPhone 13", variant_name: "128 Go Noir", currency: "EUR", avg_sale_price_30d: 600, sale_price: 620, cost_price: 330, units_30d: 6, quantity_available: 1, reorder_point: 2 },
  { sku_id: "s2", code: "S22-128", product_name: "Galaxy S22", variant_name: "Standard", currency: "EUR", avg_sale_price_30d: null, sale_price: null, cost_price: null, units_30d: 0, quantity_available: 3, reorder_point: null },
];
const offers = [
  { id: "o1", sku_id: "s1", title_original: "iPhone 13 128 Noir A", source_url: "https://x.example/p/1", normalized_price: 300, normalized_currency: "EUR", tax_type: "ht", shipping_cost: 20, moq: 2, available_quantity: 5, stock_status: "in_stock", last_seen_at: "2026-10-10T08:00:00Z", country: "FR", supplier: { name: "Grossiste A", country: "FR" }, source: { source_type: "CSV", config: { kind: "catalog_file_import" } } },
  { id: "o2", sku_id: "s1", title_original: "iPhone 13 128 Noir A", source_url: null, normalized_price: 340, normalized_currency: "EUR", tax_type: "ht", shipping_cost: null, moq: 1, available_quantity: null, stock_status: "unknown", last_seen_at: "2026-09-01T08:00:00Z", country: null, supplier: { name: "Grossiste B", country: "NL" }, source: { source_type: "API", config: {} } },
  { id: "o3", sku_id: "s2", title_original: "Galaxy S22", source_url: null, normalized_price: 200, normalized_currency: "EUR", tax_type: "ht", shipping_cost: 0, moq: 1, available_quantity: 2, stock_status: "in_stock", last_seen_at: "2026-10-09T08:00:00Z", country: "FR", supplier: { name: "Grossiste A", country: "FR" }, source: { source_type: "MANUAL", config: {} } },
];
const channels = [{ provider: "ebay", fee_percent: 12, payment_fee_percent: 0, payment_fee_fixed: 0.35, default_shipping_cost: 8, is_active: true }];

describe("radar d'opportunités (serveur)", () => {
  it("évalue chaque offre avec les ventes réelles, signale la meilleure, l'origine et l'ancienneté des prix", async () => {
    const { ctx, queries } = ctxWith(
      {
        v_stock_overview: { data: stock },
        sourcing_offers: { data: offers, count: 4 },
        sourcing_saved_offers: { data: [{ offer_id: "o1", price_at_save: 310, note: null, created_at: "2026-10-09T10:00:00Z" }] },
        sales_channels: { data: channels },
        supplier_price_history: { data: [{ offer_id: "o1", normalized_price: 300, recorded_at: "2026-10-10" }, { offer_id: "o1", normalized_price: 345, recorded_at: "2026-10-01" }] },
      },
      { radar: { vatRegime: "normal", vatRate: 20, vatRecoverable: true, packagingCost: 1.5, returnProvisionPercent: 2 } },
    );
    const r = await buildRadar(ctx, { now: NOW });
    expect(r.settingsFromChannel).toEqual(["commission marketplace", "frais de paiement", "expédition au client"]);
    expect(r.missingSettings).toEqual([]);
    const first = r.items[0]!;
    expect(first.offer.offerId).toBe("o1");
    expect(first.evaluation.status).toBe("profitable");
    expect(first.evaluation.estimatedProfit).toBe(96.15);
    expect(first.offer.priceOrigin).toBe("catalog_import");
    expect(first.savedAt).toBe("2026-10-09T10:00:00Z");
    expect(first.evaluation.reasons[0]).toMatch(/Meilleur prix parmi 2 offres \(écart 40\.00\)/);
    expect(first.evaluation.reasons.join(" ")).toMatch(/baisse de 13 %/);
    const o2 = r.items.find((i) => i.offer.offerId === "o2")!;
    expect(o2.offer.priceOrigin).toBe("verified_live");
    expect(o2.evaluation.freshness).toBe("stale");
    expect(o2.evaluation.missing).toContain("transport fournisseur");
    // sans prix de vente : données insuffisantes, jamais une opportunité
    expect(r.items.find((i) => i.offer.offerId === "o3")!.evaluation.status).toBe("insufficient_data");
    // réapprovisionnement : iPhone 13 (1 en stock, 6 ventes / 30 j), meilleure offre proposée
    expect(r.restock).toEqual([{ skuId: "s1", code: "IP13-128-NR-A", name: "Apple iPhone 13 · 128 Go Noir", quantityAvailable: 1, units30d: 6, daysOfCover: 5, bestOfferId: "o1", bestPrice: 300, bestSupplier: "Grossiste A" }]);
    // toutes les lectures sont filtrées sur l'organisation
    for (const q of queries.filter((x) => !x.target.startsWith("rpc:"))) expect(q.calls, q.target).toContainEqual({ method: "eq", args: ["organization_id", ORG] });
  });

  it("origine du prix selon la source", () => {
    expect(priceOriginOf("API", {})).toBe("verified_live");
    expect(priceOriginOf("PUBLIC_WEB", {})).toBe("observed_public");
    expect(priceOriginOf("CSV", { kind: "catalog_file_import" })).toBe("catalog_import");
    expect(priceOriginOf("XML", { kind: "feed" })).toBe("supplier_communicated");
    expect(priceOriginOf("MANUAL", null)).toBe("manual_entry");
  });

  it("paramètres : réglage explicite prioritaire sur le canal ; valeurs invalides ignorées", () => {
    const { settings, fromChannel } = readCostSettings({ radar: { marketplaceFeePercent: 10, vatRate: 999 } }, channels[0]!);
    expect(settings.marketplaceFeePercent).toBe(10);
    expect(settings.vatRate).toBeNull();
    expect(fromChannel).toEqual(["frais de paiement", "expédition au client"]);
  });

  it("enregistrement des paramètres : fusion avec les autres réglages, refus explicite si non administrateur", async () => {
    const s = { vatRegime: "margin" as const, vatRate: 20, vatRecoverable: false, marketplaceFeePercent: 12.9, paymentFeePercent: null, paymentFeeFixed: 0.3, shippingToCustomer: 6.5, packagingCost: 1, returnProvisionPercent: 3, importDutyPercent: null };
    const { ctx, queries } = ctxWith({ organizations: { data: { settings: { default_shipping_cost: 5 } } } });
    await saveCostSettings(ctx, s);
    const update = queries.filter((q) => q.target === "organizations").flatMap((q) => q.calls).find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ settings: { default_shipping_cost: 5, radar: s } });
    const denied = ctxWith({ organizations: { data: { settings: {} }, error: null } });
    // erreur RLS simulée sur la mise à jour
    const { ctx: c2 } = ctxWith({ organizations: { data: { settings: {} }, error: { message: "new row violates row-level security policy" } } });
    await expect(saveCostSettings(c2, s)).rejects.toThrow();
    expect(denied).toBeTruthy();
  });
});
