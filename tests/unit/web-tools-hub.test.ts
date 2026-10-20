import { describe, expect, it } from "vitest";
import type { RateCard } from "@/domain/tools/shipping";
import { currencyHub, ebayHub, hubCopyText, marginHub, shippingByWeight, vatHub } from "@/features/tools/hub";

const card = (over: Partial<RateCard>): RateCard => ({
  id: "c1",
  carrier: "Colissimo",
  service: "Domicile",
  fromCountries: [],
  toCountries: [],
  bands: [
    { maxWeightKg: 0.5, price: "6,99" },
    { maxWeightKg: 1, price: "8,50" },
  ],
  currency: "EUR",
  maxLengthCm: null,
  maxDimensionsSumCm: null,
  volumetricDivisor: null,
  transitDaysMin: null,
  transitDaysMax: null,
  tracking: null,
  deliveryMode: null,
  notes: null,
  verifiedAt: "2026-10-01",
  ...over,
});

describe("page Outils : calculateurs côte à côte", () => {
  it("TVA : saisie marquée, total calculé, « — » sans saisie", () => {
    const v = vatHub("ht_to_ttc", "99,17", { rate: "20", label: "20 %" });
    expect(v.lines.map((l) => [l.label, l.kind])).toEqual([
      ["Montant HT", "input"],
      ["TVA (20 %)", "calc"],
      ["Montant TTC", "total"],
    ]);
    expect(v.lines[2]!.value.replace(/\s/g, " ")).toBe("119,00 €");
    expect(vatHub("ht_to_ttc", "", { rate: "20", label: "20 %" }).lines.every((l) => l.value === "—")).toBe(true);
    expect(vatHub("vat_only", "120", { rate: "20", label: "20 %" }).lines[2]!.value.replace(/\s/g, " ")).toBe("20,00 €");
    expect(vatHub("ht_to_ttc", "abc", { rate: "20", label: "20 %" }).error).toBeTruthy();
  });

  it("marge : frais non saisis jamais comptés en silence", () => {
    const m = marginHub("62,40", "119", "15,70");
    expect(m.lines.find((l) => l.kind === "total")!.value.replace(/\s/g, " ")).toBe("+40,90 €");
    expect(m.lines.find((l) => l.label.startsWith("Taux"))!.value.replace(/\s/g, " ")).toBe("34,4 %");
    const sansFrais = marginHub("62,40", "119", "");
    expect(sansFrais.lines.find((l) => l.label === "Frais")!.value).toBe("non saisis");
    expect(sansFrais.lines.find((l) => l.kind === "total")!.label).toBe("Bénéfice avant frais");
    expect(marginHub("", "119", "").lines.find((l) => l.kind === "total")!.value).toBe("—");
  });

  it("frais eBay : aucun taux par défaut, non renseignés listés", () => {
    const empty = ebayHub({ itemPrice: "149", shippingCharged: "", finalValueFeePercent: "", fixedFeePerOrder: "", promotedPercent: "" });
    expect(empty.notEntered).toEqual(["commission sur la valeur finale", "frais fixes par commande"]);
    const r = ebayHub({ itemPrice: "149", shippingCharged: "", finalValueFeePercent: "12,9", fixedFeePerOrder: "0,35", promotedPercent: "" });
    expect(r.notEntered).toEqual([]);
    expect(r.lines.at(-1)!.value.replace(/\s/g, " ")).toBe("129,43 €");
  });

  it("devises : taux daté, âge ambre au-delà de 7 jours, estimations « ≈ »", () => {
    const rates = [{ currency: "USD", rate: 1.0899, rateDate: "2026-10-01", source: "ecb" }];
    const c = currencyHub("100", "USD", "", rates, new Date("2026-10-20T12:00:00Z"));
    expect(c.lines[0]!.label).toContain("Taux BCE du 01/10/2026");
    expect(c.lines[0]!.aside).toEqual({ text: "il y a 18 j", tone: "warning" });
    expect(c.lines[1]!.approx).toBe(true);
    expect(c.lines[2]!.value).toBe("non saisis");
    expect(currencyHub("100", null, "", [], new Date()).lines[0]!.value).toBe("—");
  });

  it("port : tranche de poids des grilles saisies, « le moins cher » seulement en même devise", () => {
    const cards = [card({}), card({ id: "c2", carrier: "Mondial Relay", service: "Point Relais", bands: [{ maxWeightKg: 1, price: "4,40" }] })];
    const s = shippingByWeight(cards, 0.5);
    expect(s.rows.map((r) => [r.label, r.cheapest])).toEqual([
      ["Mondial Relay · Point Relais", true],
      ["Colissimo · Domicile", false],
    ]);
    expect(shippingByWeight(cards, 2).outOfRange).toBe(2);
    expect(shippingByWeight([card({}), card({ id: "c3", currency: "GBP" })], 0.5).rows.some((r) => r.cheapest)).toBe(false);
  });

  it("texte copié : valeurs saisies marquées", () => {
    expect(hubCopyText("TVA", [{ label: "Montant HT", value: "10,00 €", kind: "input" }, { label: "Coût", value: "12,00 €", kind: "total", approx: true }])).toBe("TVA\nMontant HT (saisi) : 10,00 €\nCoût : ≈ 12,00 €");
  });
});
