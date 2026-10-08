import { describe, expect, it } from "vitest";
import { adjustStockSchema, createProductSchema, stockListParamsSchema, STOCK_SORTS, updateSkuSchema } from "@/features/stock/schemas";
import { orSearchTerm } from "@/features/stock/queries";
import { stockErrorMessage } from "@/features/stock/db-errors";
import { computeRotation } from "@/domain/inventory/rotation";
import { computeReplenishment, formatVelocity } from "@/domain/replenishment/replenishment";

const base = { name: "iPhone 13", code: "IPH13-128", condition: "refurbished" };

describe("validation des formulaires de stock", () => {
  it("borne quantités, prix et délais (pas de dépassement d'entier ni de numeric(12,2))", () => {
    expect(createProductSchema.safeParse({ ...base, initial_quantity: "1000000" }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...base, initial_quantity: "1000001" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, initial_quantity: "99999999999" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, initial_quantity: "-1" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, initial_quantity: "1.5" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, cost_price: "10000000000" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, sale_price: "-5" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, lead_time_days: "400" }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ sku_id: crypto.randomUUID(), type: "adjustment", direction: "out", quantity: "2000000" }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ sku_id: crypto.randomUUID(), type: "adjustment", direction: "out", quantity: "0" }).success).toBe(false);
  });

  it("EAN / GTIN : 8, 12, 13 ou 14 chiffres", () => {
    for (const ok of ["", "12345678", "123456789012", "3700000000001", "12345678901234"]) expect(createProductSchema.safeParse({ ...base, ean: ok }).success).toBe(true);
    for (const ko of ["123", "12345678901", "37000000000A1", "123456789012345"]) expect(createProductSchema.safeParse({ ...base, ean: ko }).success).toBe(false);
  });

  it("code SKU : caractères sûrs uniquement", () => {
    expect(createProductSchema.safeParse({ ...base, code: "IPH13/128.BLK-A_2" }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...base, code: "IPH 13" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, code: "a,b" }).success).toBe(false);
  });

  it("édition de SKU : stockage / couleur et jeton de version acceptés", () => {
    const r = updateSkuSchema.safeParse({ sku_id: crypto.randomUUID(), storage: "256 Go", color: "Bleu", expected_updated_at: "2026-10-08 10:00:00.123456+00" });
    expect(r.success).toBe(true);
  });

  it("liste : chaque tri est connu, un paramètre invalide retombe sur les valeurs par défaut", () => {
    expect(STOCK_SORTS).toContain("oldest_sale");
    expect(stockListParamsSchema.safeParse({ sort: "oldest_sale" }).success).toBe(true);
    expect(stockListParamsSchema.safeParse({ sort: "drop table" }).success).toBe(false);
    expect(stockListParamsSchema.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("orSearchTerm (filtre or= PostgREST)", () => {
  it("neutralise la syntaxe or=() et les jokers", () => {
    expect(orSearchTerm("iPhone 13, Pro (bleu)")).toBe("iPhone 13 Pro bleu");
    expect(orSearchTerm('a"b*c')).toBe("a b c");
    expect(orSearchTerm("100%_x")).toBe("100\\%\\_x");
    expect(orSearchTerm("  ")).toBe("");
  });
});

describe("stockErrorMessage", () => {
  it("traduit les refus métier de la base", () => {
    expect(stockErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "skus_org_code_uidx"' })).toMatch(/existe déjà/);
    expect(stockErrorMessage({ message: "SKU_CODE_EXISTS" })).toMatch(/existe déjà/);
    expect(stockErrorMessage({ message: "INSUFFICIENT_STOCK" })).toMatch(/négatif/);
    expect(stockErrorMessage({ message: "SKU_HAS_HISTORY" })).toMatch(/archivez/);
    expect(stockErrorMessage({ message: "PURCHASE_ORDER_STALE" })).toMatch(/rien n'a été compté deux fois/);
    expect(stockErrorMessage({ message: "PURCHASE_ORDER_NOT_SENT" })).toMatch(/envoyée/);
    expect(stockErrorMessage({ message: "PURCHASE_ORDER_EMPTY" })).toMatch(/au moins une ligne/);
    expect(stockErrorMessage({ message: "MOVEMENT_QUANTITY_TOO_LARGE" })).toMatch(/1 000 000/);
    expect(stockErrorMessage({ code: "42501", message: "FORBIDDEN" })).toMatch(/droits/);
    expect(stockErrorMessage(null)).toBeTruthy();
  });
});

describe("computeRotation", () => {
  it("unités vendues / stock moyen sur la fenêtre", () => {
    const r = computeRotation({ unitsSold: 4, avgOnHand: 160 / 30, windowDays: 30 });
    expect(r.rotation).toBeCloseTo(0.75, 5);
    expect(r.averageDaysToSell).toBeCloseTo(40, 5);
    expect(r.explanation).toContain("4 unité(s) vendue(s) sur 30 jours");
  });

  it("jamais de valeur inventée : fenêtre courte ou stock moyen nul → non calculée", () => {
    expect(computeRotation({ unitsSold: 3, avgOnHand: 5, windowDays: 2 }).rotation).toBeNull();
    expect(computeRotation({ unitsSold: 3, avgOnHand: 0, windowDays: 30 }).rotation).toBeNull();
    expect(computeRotation({ unitsSold: 3, avgOnHand: -2, windowDays: 30 }).rotation).toBeNull();
    expect(computeRotation({ unitsSold: 3, avgOnHand: null, windowDays: 30 }).explanation).toMatch(/Pas assez de données/);
  });

  it("aucune vente : rotation 0 (un fait), sans durée d'écoulement", () => {
    const r = computeRotation({ unitsSold: 0, avgOnHand: 12, windowDays: 30 });
    expect(r.rotation).toBe(0);
    expect(r.averageDaysToSell).toBeNull();
  });
});

describe("explication du réapprovisionnement", () => {
  it("stock négatif : compensation explicite, pas de couverture négative affichée", () => {
    const r = computeReplenishment({ skuLabel: "X", availableStock: -3, dailyVelocity: 1, leadTimeDays: 5, safetyStock: 2 });
    expect(r.recommendedQuantity).toBe(5 + 14 + 2 + 3);
    expect(r.explanation).toContain("stock négatif : -3");
    expect(r.explanation).toContain("+ 3 (stock négatif à compenser)");
    expect(r.explanation).not.toMatch(/-\d+(\.\d+)? jour/);
  });

  it("vitesse lente lisible (0,03 et non 0,0)", () => {
    expect(formatVelocity(0.034)).toBe("0.03");
    expect(formatVelocity(2.345)).toBe("2.3");
    const r = computeReplenishment({ skuLabel: "X", availableStock: 0, dailyVelocity: 0.2, leadTimeDays: 10, safetyStock: 0 });
    expect(r.explanation).toContain("0.20/jour");
    expect(r.explanation).toContain("aucun jour (rupture)");
  });
});
