import { describe, expect, it } from "vitest";
import { formatDec, parseDecimal, type Dec } from "@/domain/tools/decimal";
import { bandPriceFor, ceilCents, portRows, quickCurrency, quickDiscount, quickEbayFees, quickMargin, quickSellingPrice, quickVat, readEntry, setBandPrice, toEntry } from "@/domain/tools/quick-calc";

const d = (s: string): Dec => {
  const p = parseDecimal(s);
  if (!p.ok) throw new Error(s);
  return p.value;
};
const f = (v: Dec | null | undefined) => (v ? formatDec(v) : null);

describe("outils simples : calcul exact", () => {
  it("lecture de saisie et reprise d'une valeur calculée", () => {
    expect(readEntry("")).toBeNull();
    expect(readEntry("12,")).not.toBeNull();
    expect(f(readEntry("129,9"))).toBe("129,90");
    expect(toEntry(d("1299.9"))).toBe("1299,9");
    expect(toEntry(d("120"))).toBe("120");
    expect(toEntry(d("21.095"))).toBe("21,1");
    expect(toEntry(null)).toBe("");
  });
  it("TVA dans les trois sens, taux 0 sans division par zéro", () => {
    expect(quickVat("ht", d("100"), d("20")).values).toMatchObject({ tva: d("20"), ttc: d("120") });
    expect(f(quickVat("ttc", d("120"), d("20")).values.ht)).toBe("100,00");
    expect(f(quickVat("tva", d("20"), d("20")).values.ttc)).toBe("120,00");
    expect(f(quickVat("ht", d("19.99"), d("5.5")).values.tva)).toBe("1,10");
    expect(quickVat("tva", d("5"), d("0")).values.ht).toBeNull();
    expect(quickVat("ht", null, d("20")).values.ttc).toBeNull();
  });
  it("marge : frais vides comptés 0 ; marge sur le prix de vente", () => {
    const r = quickMargin(d("289"), d("389"), d("47.86"));
    expect(f(r.values.res)).toBe("52,14");
    expect(r.sub).toMatch(/^marge 13,4\s%$/u);
    expect(f(quickMargin(d("100"), d("150"), null).values.res)).toBe("50,00");
    expect(quickMargin(null, d("150"), null).values.res).toBeNull();
  });
  it("prix de vente : arrondi au centime supérieur, marge ≥ 100 % impossible", () => {
    const r = quickSellingPrice(d("289"), d("40"), d("20"));
    expect(f(r.values.res)).toBe("411,25");
    expect(r.sub).toBe("bénéfice 82,25 €");
    expect(f(quickSellingPrice(d("10"), null, d("30")).values.res)).toBe("14,29"); // 14,2857… → 14,29
    expect(f(ceilCents(d("1.001")))).toBe("1,01");
    expect(quickSellingPrice(d("10"), null, d("100"))).toEqual({ values: { res: null }, sub: "marge impossible" });
  });
  it("frais eBay : aucun taux par défaut", () => {
    expect(quickEbayFees(d("389"), null)).toEqual({ values: { res: null }, sub: "entrez votre taux" });
    const r = quickEbayFees(d("389"), d("13"));
    expect(f(r.values.res)).toBe("338,43");
    expect(r.sub).toBe("frais 50,57 €");
    expect(quickEbayFees(d("10"), d("150")).values.res).toBeNull();
  });
  it("remise et devises", () => {
    expect(f(quickDiscount(d("389"), d("10")).values.res)).toBe("350,10");
    expect(quickDiscount(d("389"), d("10")).sub).toBe("− 38,90 €");
    expect(f(quickCurrency("dev", d("1250"), d("1.0842")).values.eur)).toBe("1\u202f152,92");
    expect(f(quickCurrency("eur", d("100"), d("0.8561")).values.dev)).toBe("85,61");
    expect(quickCurrency("dev", d("10"), null).values.eur).toBeNull();
  });
});

describe("outil Port : grille simple par poids", () => {
  const bands = [
    { maxWeightKg: 0.5, price: "4.95" },
    { maxWeightKg: 2, price: "8,10" },
  ];
  it("prix de la tranche couvrante, rien au-delà", () => {
    expect(f(bandPriceFor(bands, 0.25))).toBe("4,95");
    expect(f(bandPriceFor(bands, 1))).toBe("8,10");
    expect(bandPriceFor(bands, 5)).toBeNull();
  });
  it("modifier un prix : tranche exacte remplacée ou insérée, vide = retirée", () => {
    expect(setBandPrice(bands, 1, "6,9")).toEqual([{ maxWeightKg: 0.5, price: "4.95" }, { maxWeightKg: 1, price: "6.9" }, { maxWeightKg: 2, price: "8,10" }]);
    expect(setBandPrice(bands, 0.5, "5")).toEqual([{ maxWeightKg: 0.5, price: "5" }, { maxWeightKg: 2, price: "8,10" }]);
    expect(setBandPrice(bands, 0.5, "")).toEqual([{ maxWeightKg: 2, price: "8,10" }]);
  });
  it("le moins cher est marqué (au moins deux prix connus)", () => {
    const rows = portRows(
      [
        { id: "a", carrier: "Mondial Relay", service: "", bands: [{ maxWeightKg: 1, price: "4.4" }] },
        { id: "b", carrier: "Colissimo", service: "Domicile", bands: [{ maxWeightKg: 1, price: "6.9" }] },
        { id: "c", carrier: "Chronopost", service: "Chronopost", bands: [] },
      ],
      1,
    );
    expect(rows.map((r) => [r.label, r.cheapest])).toEqual([["Mondial Relay", true], ["Colissimo · Domicile", false], ["Chronopost", false]]);
    expect(portRows([{ id: "a", carrier: "X", service: "", bands: [{ maxWeightKg: 1, price: "4" }] }], 1)[0]!.cheapest).toBe(false);
  });
});

import { parcelDisplay, relativeFr } from "@/domain/tools/tracking";

describe("colis : statut affiché", () => {
  it("non vérifié tant qu'aucune API n'a répondu ; tonalités", () => {
    expect(parcelDisplay({ status: "unknown", provider: null, lastCheckedAt: null })).toEqual({ label: "Non vérifié", tone: "unverified", verified: false });
    expect(parcelDisplay({ status: "in_transit", provider: null, lastCheckedAt: "2026-10-12T08:00:00Z" }).label).toBe("Non vérifié");
    expect(parcelDisplay({ status: "delivered", provider: "laposte", lastCheckedAt: "x" })).toMatchObject({ label: "Livré", tone: "delivered" });
    expect(parcelDisplay({ status: "exception", provider: "dhl", lastCheckedAt: "x" })).toMatchObject({ label: "Incident", tone: "problem" });
    expect(parcelDisplay({ status: "out_for_delivery", provider: "ship24", lastCheckedAt: "x" })).toMatchObject({ label: "En livraison", tone: "progress" });
    expect(parcelDisplay({ status: "pending", provider: "ship24", lastCheckedAt: "x" }).tone).toBe("waiting");
  });
  it("heure relative", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(relativeFr("2026-10-12T09:59:40Z", now)).toBe("à l'instant");
    expect(relativeFr("2026-10-12T09:15:00Z", now)).toBe("il y a 45 min");
    expect(relativeFr("2026-10-12T08:00:00Z", now)).toBe("il y a 2 h");
    expect(relativeFr("2026-10-11T08:00:00Z", now)).toBe("hier");
    expect(relativeFr("2026-10-07T10:00:00Z", now)).toBe("il y a 5 j");
    expect(relativeFr(null, now)).toBeNull();
  });
});
