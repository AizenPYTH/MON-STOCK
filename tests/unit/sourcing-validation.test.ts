import { describe, expect, it } from "vitest";
import { validateOffer } from "@/domain/sourcing/validation";

const ok = { title: "iPhone 13 128GB", price: 229, currency: "EUR", moq: 10, availableQuantity: 50, sourceUrl: "https://example.com/p/1" };

describe("DataValidationService", () => {
  it("accepte une offre propre", () => {
    const r = validateOffer(ok);
    expect(r.valid).toBe(true);
    expect(r.status).toBe("active");
    expect(r.anomalies).toEqual([]);
    expect(r.effectivePrice).toBe(229);
  });

  it("un prix à 0 n'est jamais enregistré : prix précédent conservé et offre suspecte", () => {
    const r = validateOffer({ ...ok, price: 0 }, { previousPrice: 229, prices30d: [229] });
    expect(r.valid).toBe(true);
    expect(r.effectivePrice).toBe(229);
    expect(r.priceRejected).toBe(true);
    expect(r.status).toBe("suspicious");
    expect(r.anomalyCodes).toContain("price_zero");
  });

  it("un prix à 0 sans historique bloque l'offre", () => {
    const r = validateOffer({ ...ok, price: 0 });
    expect(r.valid).toBe(false);
    expect(r.effectivePrice).toBeNull();
  });

  it("détecte un prix anormalement bas ou haut par rapport à la médiane 30 j", () => {
    const low = validateOffer({ ...ok, price: 50 }, { previousPrice: 229, prices30d: [229, 231, 228] });
    expect(low.anomalyCodes).toContain("price_too_low");
    expect(low.status).toBe("suspicious");
    expect(low.valid).toBe(true);
    const high = validateOffer({ ...ok, price: 900 }, { previousPrice: 229, prices30d: [229, 231, 228] });
    expect(high.anomalyCodes).toContain("price_too_high");
  });

  it("neutralise stock négatif, MOQ impossible et URL invalide", () => {
    const r = validateOffer({ ...ok, availableQuantity: -3, moq: 0, sourceUrl: "ftp://x" });
    expect(r.anomalyCodes).toEqual(expect.arrayContaining(["negative_stock", "moq_invalid", "url_invalid"]));
    expect(r.effectiveQuantity).toBeNull();
    expect(r.effectiveMoq).toBeNull();
    expect(r.effectiveUrl).toBeNull();
    expect(r.valid).toBe(true);
  });

  it("bloque devise inconnue et titre manquant", () => {
    const r = validateOffer({ ...ok, currency: "XXX", title: "  " });
    expect(r.valid).toBe(false);
    expect(r.anomalyCodes).toEqual(expect.arrayContaining(["currency_unknown", "title_missing"]));
  });
});
