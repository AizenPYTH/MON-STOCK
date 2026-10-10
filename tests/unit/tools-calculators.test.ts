import { describe, expect, it } from "vitest";
import { dec, div, formatDec, formatMoneyDec, formatPercent, parseDecimal, sanitizeAmountInput, toCents } from "@/domain/tools/decimal";
import { computeVat, customRateOption, DEFAULT_VAT_RATES, evaluateVatForm, invertMode, parseVatRate } from "@/domain/tools/vat";
import { evaluateDiscount } from "@/domain/tools/discount";
import { evaluateEbayFees, EMPTY_EBAY_FEES, ebayFeesFromChannel } from "@/domain/tools/ebay-fees";
import { convertCurrency, latestRates, rateAgeDays } from "@/domain/tools/currency";
import { EMPTY_PROFIT_FORM, evaluateProfit, profitFormFromSettings, solveSellingPrice, type ProfitFormInput } from "@/domain/tools/profit";
import { computeUnitEconomics, EMPTY_COST_SETTINGS, evaluateRadarOffer, type RadarCostSettings } from "@/domain/sourcing/radar";
import { TOOLS, toolsByCategory } from "@/domain/tools/catalog";

const p = (s: string) => {
  const r = parseDecimal(s);
  if (!r.ok) throw new Error(`parse ${s}: ${r.error}`);
  return r.value;
};
const cents = (s: string) => toCents(p(s));

describe("decimal : saisie française et arrondi monétaire", () => {
  it("lit les formats français courants", () => {
    expect(toCents(p("129,90"))).toBe(12990n);
    expect(toCents(p("1 299,90"))).toBe(129990n);
    expect(toCents(p("1 299,90"))).toBe(129990n);
    expect(toCents(p("1.299,90"))).toBe(129990n);
    expect(toCents(p("129.90"))).toBe(12990n);
    expect(toCents(p("12 €"))).toBe(1200n);
    expect(toCents(p(",5"))).toBe(50n);
    expect(toCents(p("0"))).toBe(0n);
  });
  it("refuse les saisies vides, invalides et négatives", () => {
    expect(parseDecimal("")).toEqual({ ok: false, error: "empty" });
    expect(parseDecimal("   ")).toEqual({ ok: false, error: "empty" });
    expect(parseDecimal("12,3,4")).toEqual({ ok: false, error: "invalid" });
    expect(parseDecimal("abc")).toEqual({ ok: false, error: "invalid" });
    expect(parseDecimal("1,299.90")).toEqual({ ok: false, error: "invalid" });
    expect(parseDecimal("-5")).toEqual({ ok: false, error: "negative" });
    expect(parseDecimal("-5", { allowNegative: true }).ok).toBe(true);
    expect(parseDecimal("9999999999999")).toEqual({ ok: false, error: "too_large" });
  });
  it("arrondit au centime le plus proche, demi au-dessus, sans arrondi intermédiaire", () => {
    expect(toCents(p("0,005"))).toBe(1n);
    expect(toCents(p("0,0049"))).toBe(0n);
    expect(toCents(p("2,675"))).toBe(268n); // en flottant, 2.675 s'arrondit à 2.67
    expect(toCents(div(dec(1), dec(3)))).toBe(33n);
    expect(toCents(div(dec(2), dec(3)))).toBe(67n);
  });
  it("formate à la française", () => {
    expect(formatDec(p("1234567,891"))).toBe("1 234 567,89");
    expect(formatMoneyDec(p("19,99"))).toBe("19,99 €");
    expect(formatMoneyDec(p("19,99"), "USD")).toBe("19,99 $");
    expect(formatPercent(p("5,5"))).toBe("5,5 %");
    expect(formatPercent(p("20"))).toBe("20 %");
    expect(sanitizeAmountInput("12a,5€")).toBe("12,5");
    expect(sanitizeAmountInput("-3")).toBe("3");
  });
});

describe("Calculateur de TVA", () => {
  const twenty = p("20");
  it("100 € HT → 20 € de TVA → 120 € TTC", () => {
    const r = computeVat(p("100"), twenty, "ht");
    expect([toCents(r.ht), toCents(r.vat), toCents(r.ttc)]).toEqual([10000n, 2000n, 12000n]);
  });
  it("120 € TTC → 100 € HT → 20 € de TVA", () => {
    const r = computeVat(p("120"), twenty, "ttc");
    expect([toCents(r.ht), toCents(r.vat), toCents(r.ttc)]).toEqual([10000n, 2000n, 12000n]);
  });
  it("19,99 € HT à 20 % : TVA 3,998 → 4,00 € ; TTC 23,988 → 23,99 €", () => {
    const r = computeVat(p("19,99"), twenty, "ht");
    expect(toCents(r.vat)).toBe(400n);
    expect(toCents(r.ttc)).toBe(2399n);
  });
  it("TTC → HT exact à 5,5 % puis retour sans dérive", () => {
    const r = computeVat(p("129,90"), p("5,5"), "ttc");
    expect(toCents(r.ht)).toBe(12313n); // 129,90 / 1,055 = 123,127…
    expect(toCents(r.vat)).toBe(677n);
    const back = computeVat(r.ht, p("5,5"), "ht"); // HT exact (fraction), pas l'arrondi
    expect(toCents(back.ttc)).toBe(12990n);
  });
  it("taux 10 % et 2,1 %, montant nul", () => {
    expect(toCents(computeVat(p("50"), p("10"), "ht").ttc)).toBe(5500n);
    expect(toCents(computeVat(p("100"), p("2,1"), "ht").vat)).toBe(210n);
    const zero = computeVat(p("0"), twenty, "ttc");
    expect([toCents(zero.ht), toCents(zero.vat), toCents(zero.ttc)]).toEqual([0n, 0n, 0n]);
  });
  it("mode TVA seule : la base choisie (HT ou TTC) est explicite", () => {
    const ht = evaluateVatForm({ mode: "vat_only", amount: "100", rate: "20", vatOnlyBasis: "ht" });
    const ttc = evaluateVatForm({ mode: "vat_only", amount: "100", rate: "20", vatOnlyBasis: "ttc" });
    expect(ht.state === "ok" && ht.result.inputBasis).toBe("ht");
    expect(ht.state === "ok" && toCents(ht.result.vat)).toBe(2000n);
    expect(ttc.state === "ok" && ttc.result.inputBasis).toBe("ttc");
    expect(ttc.state === "ok" && toCents(ttc.result.vat)).toBe(1667n);
  });
  it("champ vide : aucun résultat ; saisie invalide : erreur sur le bon champ", () => {
    expect(evaluateVatForm({ mode: "ht_to_ttc", amount: "", rate: "20", vatOnlyBasis: "ht" })).toEqual({ state: "empty" });
    expect(evaluateVatForm({ mode: "ht_to_ttc", amount: "12,,5", rate: "20", vatOnlyBasis: "ht" })).toEqual({ state: "error", field: "amount", error: "invalid" });
    expect(evaluateVatForm({ mode: "ht_to_ttc", amount: "-12", rate: "20", vatOnlyBasis: "ht" })).toEqual({ state: "error", field: "amount", error: "negative" });
    expect(evaluateVatForm({ mode: "ht_to_ttc", amount: "12", rate: "150", vatOnlyBasis: "ht" })).toEqual({ state: "error", field: "rate", error: "out_of_range" });
    expect(evaluateVatForm({ mode: "ht_to_ttc", amount: "12", rate: "", vatOnlyBasis: "ht" })).toEqual({ state: "error", field: "rate", error: "empty" });
  });
  it("taux proposés et personnalisés, inversion du sens", () => {
    expect(DEFAULT_VAT_RATES.map((r) => r.rate)).toEqual(["20", "10", "5,5", "2,1"]);
    expect(customRateOption("8.5")).toMatchObject({ rate: "8,5", label: "8,5 %", custom: true });
    expect(customRateOption("abc")).toBeNull();
    expect(parseVatRate("0").ok).toBe(true);
    expect(invertMode("ht_to_ttc")).toBe("ttc_to_ht");
    expect(invertMode("ttc_to_ht")).toBe("ht_to_ttc");
    expect(invertMode("vat_only")).toBe("vat_only");
  });
});

describe("Calculateur de remise", () => {
  it("prix après remise, pourcentage, prix initial", () => {
    const a = evaluateDiscount({ mode: "final_price", initialPrice: "129,90", finalPrice: "", percent: "15" });
    expect(a.state === "ok" && toCents(a.result.finalPrice)).toBe(11042n); // 110,415
    expect(a.state === "ok" && toCents(a.result.saving)).toBe(1949n);
    const b = evaluateDiscount({ mode: "discount_rate", initialPrice: "200", finalPrice: "150", percent: "" });
    expect(b.state === "ok" && toCents(b.result.percent)).toBe(2500n);
    const c = evaluateDiscount({ mode: "initial_price", initialPrice: "", finalPrice: "80", percent: "20" });
    expect(c.state === "ok" && toCents(c.result.initialPrice)).toBe(10000n);
  });
  it("cas limites", () => {
    expect(evaluateDiscount({ mode: "final_price", initialPrice: "", finalPrice: "", percent: "10" })).toEqual({ state: "empty" });
    expect(evaluateDiscount({ mode: "final_price", initialPrice: "10", finalPrice: "", percent: "120" }).state).toBe("invalid");
    expect(evaluateDiscount({ mode: "initial_price", initialPrice: "", finalPrice: "10", percent: "100" }).state).toBe("invalid");
    expect(evaluateDiscount({ mode: "discount_rate", initialPrice: "0", finalPrice: "0", percent: "" }).state).toBe("invalid");
    expect(evaluateDiscount({ mode: "discount_rate", initialPrice: "10", finalPrice: "12", percent: "" }).state).toBe("invalid");
  });
});

describe("Calculateur de frais eBay (aucun taux codé en dur)", () => {
  it("commission sur objet + port, frais fixes, reste après envoi et achat", () => {
    const r = evaluateEbayFees({ ...EMPTY_EBAY_FEES, itemPrice: "100", shippingCharged: "10", finalValueFeePercent: "12", fixedFeePerOrder: "0,35", actualShippingCost: "7,50", purchaseCost: "60" });
    if (r.state !== "ok") throw new Error(r.state);
    expect(toCents(r.result.totalFees)).toBe(1355n); // 12 % de 110 = 13,20 + 0,35
    expect(toCents(r.result.netAfterFees)).toBe(9645n);
    expect(toCents(r.result.netAfterShipping!)).toBe(8895n);
    expect(toCents(r.result.profit!)).toBe(2895n);
    expect(r.result.notEntered).toEqual([]);
  });
  it("commission sur l'objet seul si demandé ; éléments non saisis listés, jamais supposés", () => {
    const r = evaluateEbayFees({ ...EMPTY_EBAY_FEES, itemPrice: "100", shippingCharged: "10", finalValueFeePercent: "10", feeOnShipping: false });
    if (r.state !== "ok") throw new Error(r.state);
    expect(toCents(r.result.totalFees)).toBe(1000n);
    expect(r.result.profit).toBeNull();
    expect(r.result.notEntered).toEqual(["frais fixes par commande", "coût réel de l'envoi", "coût d'achat"]);
    const none = evaluateEbayFees({ ...EMPTY_EBAY_FEES, itemPrice: "50" });
    expect(none.state === "ok" && none.result.notEntered).toContain("commission sur la valeur finale");
  });
  it("vide / invalide ; préremplissage depuis le canal eBay", () => {
    expect(evaluateEbayFees(EMPTY_EBAY_FEES)).toEqual({ state: "empty" });
    expect(evaluateEbayFees({ ...EMPTY_EBAY_FEES, itemPrice: "10", finalValueFeePercent: "130" }).state).toBe("invalid");
    expect(ebayFeesFromChannel({ fee_percent: 12.9, payment_fee_fixed: null }).input.finalValueFeePercent).toBe("12,9");
    expect(ebayFeesFromChannel(null).prefilled).toEqual([]);
  });
});

describe("Convertisseur de devises", () => {
  const rows = [
    { base_currency: "EUR", quote_currency: "USD", rate: 1.1, rate_date: "2026-10-08", source: "ecb" },
    { base_currency: "EUR", quote_currency: "USD", rate: 1.08, rate_date: "2026-10-09", source: "ecb" },
    { base_currency: "EUR", quote_currency: "GBP", rate: "0.85", rate_date: "2026-10-09", source: "ecb" },
  ];
  const rates = latestRates(rows);
  it("garde le dernier taux par devise", () => {
    expect(rates.find((r) => r.currency === "USD")).toMatchObject({ rate: 1.08, rateDate: "2026-10-09" });
  });
  it("USD → EUR avec frais séparés et date du taux", () => {
    const r = convertCurrency({ amount: "108", from: "USD", to: "EUR", bankFeePercent: "2", bankFeeFixed: "1" }, rates);
    if (r.state !== "ok") throw new Error(r.state);
    expect(toCents(r.result.converted)).toBe(10000n);
    expect(toCents(r.result.bankFees)).toBe(300n);
    expect(toCents(r.result.totalWithFees)).toBe(10300n);
    expect(r.result.rateDate).toBe("2026-10-09");
    expect(r.result.feesEntered).toBe(true);
  });
  it("conversion croisée USD → GBP et devise sans taux", () => {
    const r = convertCurrency({ amount: "108", from: "USD", to: "GBP", bankFeePercent: "", bankFeeFixed: "" }, rates);
    expect(r.state === "ok" && toCents(r.result.converted)).toBe(8500n);
    expect(r.state === "ok" && r.result.feesEntered).toBe(false);
    expect(convertCurrency({ amount: "1", from: "CNY", to: "EUR", bankFeePercent: "", bankFeeFixed: "" }, rates).state).toBe("invalid");
    expect(rateAgeDays("2026-10-09", new Date("2026-10-12T08:00:00Z"))).toBe(2);
  });
});

const settings: RadarCostSettings = { ...EMPTY_COST_SETTINGS, vatRegime: "normal", vatRate: 20, vatRecoverable: true, marketplaceFeePercent: 10, paymentFeePercent: 0, paymentFeeFixed: 0.35, shippingToCustomer: 6, packagingCost: 1, returnProvisionPercent: 2, importDutyPercent: null };
const form: ProfitFormInput = { ...profitFormFromSettings(settings), purchasePrice: "300", purchaseBasis: "ht", supplierShipping: "5", origin: "eu" };

describe("Calculateur de marge = calcul du radar", () => {
  it("donne exactement le bénéfice du radar pour les mêmes données", () => {
    const tool = evaluateProfit(form, "479");
    if (tool.state !== "ok") throw new Error(tool.state);
    const radar = evaluateRadarOffer(
      { offerId: "o", supplierName: "F", supplierCountry: "FR", title: "t", sourceUrl: null, price: 300, currency: "EUR", taxType: "ht", shippingCost: 5, moq: 1, availableQuantity: 1, stockStatus: "in_stock", lastSeenAt: new Date().toISOString(), priceOrigin: "verified_live", previousPrice: null, saved: false },
      { skuId: "s", code: "C", name: "n", currency: "EUR", avgSalePrice30d: null, salePrice: 479, currentCost: null, units30d: 0, quantityAvailable: 0, reorderPoint: null },
      settings,
    );
    expect(tool.result.economics.estimatedProfit).toBe(radar.estimatedProfit);
    expect(tool.result.economics.landedCost).toBe(305);
    // 479/1,2 = 399,17 − 305 = 94,17 − (47,90 + 0,35 + 6 + 1 + 9,58) = 29,34
    expect(tool.result.economics.estimatedProfit).toBe(29.34);
    expect(tool.result.marginOnCostPercent).toBe(9.62);
    expect(tool.result.marginOnRevenuePercent).toBe(7.35);
    expect(tool.result.partial).toBe(false);
  });
  it("frais non saisis : estimation partielle, jamais comptés à 0 en silence", () => {
    const r = evaluateProfit({ ...EMPTY_PROFIT_FORM, purchasePrice: "100" }, "150");
    if (r.state !== "ok") throw new Error(r.state);
    expect(r.result.partial).toBe(true);
    expect(r.result.economics.missing).toEqual(expect.arrayContaining(["commission marketplace", "expédition au client", "régime de TVA (normal, marge ou franchise)"]));
  });
  it("vide, invalide", () => {
    expect(evaluateProfit(EMPTY_PROFIT_FORM, "10")).toEqual({ state: "empty" });
    const bad = evaluateProfit({ ...form, marketplaceFeePercent: "abc" }, "10");
    expect(bad.state === "invalid" && bad.errors.marketplaceFeePercent).toBeTruthy();
  });
  it("TVA sur marge : même résultat que le moteur partagé", () => {
    const margin: RadarCostSettings = { ...settings, vatRegime: "margin", vatRecoverable: false };
    const r = evaluateProfit({ ...profitFormFromSettings(margin), purchasePrice: "200", purchaseBasis: "ttc", supplierShipping: "0", origin: "eu" }, "300");
    const eco = computeUnitEconomics({ salePrice: 300, saleLabel: "Prix de vente", purchasePrice: 200, purchaseTaxType: "ttc", supplierShipping: 0, moq: 1, supplierOrigin: "eu" }, margin);
    expect(r.state === "ok" && r.result.economics.estimatedProfit).toBe(eco.estimatedProfit);
  });
});

describe("Calculateur de prix de vente (résolution vérifiée par le calcul du radar)", () => {
  it("bénéfice visé : le prix trouvé atteint la cible au centime", () => {
    const r = solveSellingPrice(form, { kind: "profit", amount: "50" });
    if (r.state !== "ok") throw new Error(r.state);
    expect(r.result.economics.estimatedProfit!).toBeGreaterThanOrEqual(50);
    const below = evaluateProfit(form, (r.salePrice - 0.01).toFixed(2).replace(".", ","));
    expect(below.state === "ok" && below.result.economics.estimatedProfit!).toBeLessThan(50);
  });
  it("taux de marge et taux de marque visés", () => {
    const m = solveSellingPrice(form, { kind: "margin_on_cost", percent: "30" });
    expect(m.state === "ok" && m.result.marginOnCostPercent!).toBeGreaterThanOrEqual(30);
    const k = solveSellingPrice(form, { kind: "margin_on_revenue", percent: "20" });
    expect(k.state === "ok" && k.result.marginOnRevenuePercent!).toBeGreaterThanOrEqual(20);
  });
  it("régimes marge et franchise", () => {
    const margin = { ...form, vatRegime: "margin" as const, vatRecoverable: false };
    const r = solveSellingPrice(margin, { kind: "profit", amount: "40" });
    expect(r.state === "ok" && r.result.economics.estimatedProfit!).toBeGreaterThanOrEqual(40);
    const fr = solveSellingPrice({ ...form, vatRegime: "franchise" as const }, { kind: "profit", amount: "40" });
    expect(fr.state === "ok" && fr.result.economics.estimatedProfit!).toBeGreaterThanOrEqual(40);
  });
  it("cible impossible (frais ≥ 100 %) et saisies vides", () => {
    expect(solveSellingPrice({ ...form, marketplaceFeePercent: "99" }, { kind: "margin_on_revenue", percent: "50" }).state).toBe("impossible");
    expect(solveSellingPrice(form, { kind: "profit", amount: "" })).toEqual({ state: "empty" });
  });
});

describe("Catalogue des outils", () => {
  it("outils disponibles routés, outils à venir sans route", () => {
    for (const t of TOOLS) {
      if (t.availability === "available") expect(t.route).toMatch(/^\//);
      else expect(t.route).toBeNull();
    }
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    expect(toolsByCategory().flatMap((g) => g.tools)).toHaveLength(TOOLS.length);
    expect(TOOLS.find((t) => t.id === "vat")?.usesServer).toBe(false);
  });
});

describe("cents helper", () => {
  it("sanity", () => expect(cents("1,005")).toBe(101n));
});
