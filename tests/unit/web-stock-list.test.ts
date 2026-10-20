import { describe, expect, it } from "vitest";
import type { StockOverviewRow } from "@/db/types";
import { enrichStockRow, type MarginContext } from "@/features/stock/model";
import { categoryGlyph, channelDisplay, coverDisplay, csvCell, filterViews, levelDisplay, marginDisplay, matchesSearch, paginate, sortViews, stockCsv } from "@/features/stock-web/list.pure";
import { parseStockWebParams, stockHref } from "@/features/stock-web/params";

const NOW = new Date("2026-10-20T10:00:00Z");
const CTX: MarginContext = { feePercent: 10, paymentFeePercent: 0, paymentFeeFixed: 0, shippingCost: null };

function row(over: Partial<StockOverviewRow>): StockOverviewRow {
  return {
    active_listings_count: 1, avg_sale_price_30d: null, barcode: null, best_supplier_price: null, brand: "Apple", category: "Smartphones", channel_providers: ["ebay"], code: "SKU", condition: "new",
    cost_price: 100, currency: "EUR", default_supplier_id: null, first_sale_at: "2026-01-01T00:00:00Z", foreign_currency_units_30d: 0, grade: null, image_url: null, is_active: true, last_movement_at: null,
    last_sale_at: "2026-10-19T00:00:00Z", lead_time_days: 5, location: null, organization_id: "o", product_archived: false, product_id: "p", product_name: "Produit", quantity_available: 10, quantity_on_hand: 10,
    quantity_reserved: 0, reorder_point: 2, revenue_30d: 0, safety_stock: 0, sale_price: 200, sku_id: "s", stock_value: 1000, supplier_ids: [], supplier_offers_count: 0, unit_margin: 100, units_30d: 30, units_7d: 7,
    units_90d: 90, units_prev_30d: 30, units_prev_7d: 7, variant_id: "v", variant_name: "Standard",
    ...over,
  } as StockOverviewRow;
}
const view = (over: Partial<StockOverviewRow>) => enrichStockRow(row(over), CTX, NOW);

const views = [
  view({ sku_id: "a", code: "A-OUT", product_name: "Batterie iPhone 12", quantity_available: 0, quantity_on_hand: 0, units_30d: 18 }),
  view({ sku_id: "b", code: "B-LOW", product_name: "iPhone 13", quantity_available: 2, quantity_on_hand: 2, units_30d: 9, units_7d: 2, units_90d: 27, units_prev_7d: 2 }),
  view({ sku_id: "c", code: "C-OK", product_name: "Chargeur", quantity_available: 40, quantity_on_hand: 40, units_30d: 3, units_7d: 1, units_90d: 9, cost_price: null, active_listings_count: 0, channel_providers: [] }),
];

describe("écran Stock web : paramètres", () => {
  it("reprend les filtres existants et ajoute niveau / densité / fiche", () => {
    const p = parseStockWebParams({ q: "iphone", niveau: "faible", densite: "compacte", sku: "B-LOW", sort: "cover", page: "2" });
    expect(p.base.q).toBe("iphone");
    expect(p.base.page).toBe(2);
    expect(p.niveau).toBe("faible");
    expect(p.density).toBe("compacte");
    expect(p.sku).toBe("B-LOW");
    expect(p.sort).toBe("cover");
  });
  it("valeurs inconnues → défauts (alertes d'abord, confort)", () => {
    const p = parseStockWebParams({ niveau: "x", sort: "y", densite: "z" });
    expect(p.niveau).toBeNull();
    expect(p.sort).toBe("urgency");
    expect(p.density).toBe("confort");
  });
  it("un changement de filtre revient en page 1 et ferme la fiche ; l'ouverture garde la page", () => {
    expect(stockHref({ q: "a", page: "3", sku: "X" }, { niveau: "rupture" })).toBe("/stock?q=a&niveau=rupture");
    expect(stockHref({ q: "a", page: "3" }, { sku: "X" }, { keepPage: true })).toBe("/stock?q=a&page=3&sku=X");
    expect(stockHref({}, { niveau: null })).toBe("/stock");
  });
});

describe("écran Stock web : filtres, tris, pagination", () => {
  it("recherche nom / SKU sans tenir compte de la casse", () => {
    expect(matchesSearch(views[1]!.row, "IPHONE")).toBe(true);
    expect(matchesSearch(views[1]!.row, "c-ok")).toBe(false);
  });
  it("puces : rupture, faible (risque + faible), sans annonce, sans coût", () => {
    const base = parseStockWebParams({}).base;
    expect(filterViews(views, { base, niveau: "rupture" }).map((v) => v.row.code)).toEqual(["A-OUT"]);
    expect(filterViews(views, { base, niveau: "faible" }).map((v) => v.row.code)).toEqual(["B-LOW"]);
    expect(filterViews(views, { base, niveau: "sans_annonce" }).map((v) => v.row.code)).toEqual(["C-OK"]);
    expect(filterViews(views, { base, niveau: "sans_cout" }).map((v) => v.row.code)).toEqual(["C-OK"]);
  });
  it("tri alertes d'abord puis A → Z ; inconnus en dernier", () => {
    expect(sortViews(views, "urgency").map((v) => v.row.code)).toEqual(["A-OUT", "B-LOW", "C-OK"]);
    expect(sortViews(views, "name").map((v) => v.row.code)).toEqual(["A-OUT", "C-OK", "B-LOW"]);
    expect(sortViews(views, "best_sellers")[0]!.row.code).toBe("A-OUT");
  });
  it("pagination 1–50", () => {
    const p = paginate(Array.from({ length: 115 }, (_, i) => i), 3, 50);
    expect(p.rows).toHaveLength(15);
    expect([p.from, p.to, p.pageCount]).toEqual([101, 115, 3]);
  });
});

describe("écran Stock web : libellés honnêtes", () => {
  it("couverture : rupture / ≈ N j / —", () => {
    expect(coverDisplay(views[0]!).text).toBe("rupture");
    expect(coverDisplay(views[2]!).text).toMatch(/^≈ \d+ j$/);
    const unknown = view({ units_90d: 0, units_30d: 0, units_7d: 0, first_sale_at: null, last_sale_at: null });
    expect(coverDisplay(unknown).text).toBe("—");
  });
  it("marge : « ≈ N % » ou « — » si coût inconnu (jamais 0)", () => {
    expect(marginDisplay(views[0]!.margin).text).toMatch(/^≈ \d+ %$/);
    expect(marginDisplay(views[0]!.margin).provisional).toBe(true);
    expect(marginDisplay(views[2]!.margin).text).toBe("—");
  });
  it("niveau, canal, pictogramme", () => {
    expect(levelDisplay("at_risk").tone).toBe("low");
    expect(channelDisplay(views[2]!.row)).toEqual({ text: "Sans annonce", muted: true });
    expect(channelDisplay(views[0]!.row).text).toBe("eBay");
    expect(categoryGlyph("Pièces détachées", "Écran OLED iPhone 13")).toBe("screen");
    expect(categoryGlyph("Pièces détachées", "Batterie iPhone 12")).toBe("battery");
    expect(categoryGlyph(null)).toBe("generic");
  });
  it("CSV : « ; », formules neutralisées, inconnu = vide", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
    expect(csvCell(null)).toBe("");
    const csv = stockCsv([views[2]!]);
    expect(csv.startsWith("﻿SKU;")).toBe(true);
    const line = csv.split("\r\n")[1]!.split(";");
    expect(line[10]).toBe(""); // coût inconnu : cellule vide, pas 0
  });
});
