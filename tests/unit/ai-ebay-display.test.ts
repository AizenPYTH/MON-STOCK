import { describe, expect, it } from "vitest";
import { dedupeRows, ebayServiceName, frDuration, frHandlingTime, frQuantity } from "@/services/ai/ebay-display";

describe("affichage des données de compte eBay", () => {
  it("quantités au format français", () => {
    expect(frQuantity(9992720)).toMatch(/^9\s992\s720$/);
    expect(frQuantity(null)).toBe("—");
  });

  it("durées traduites, singulier/pluriel, inconnu laissé tel quel", () => {
    expect(frDuration("14 DAY")).toBe("14 jours");
    expect(frDuration("1 DAY")).toBe("1 jour");
    expect(frDuration("2 BUSINESS_DAY")).toBe("2 jours ouvrés");
    expect(frDuration("1 MONTH")).toBe("1 mois");
    expect(frDuration("3 FORTNIGHT")).toBe("3 FORTNIGHT");
    expect(frDuration(null)).toBeNull();
    expect(frHandlingTime("0 DAY")).toBe("le jour même");
  });

  it("services eBay : noms connus, sinon code nettoyé (jamais inventé)", () => {
    expect(ebayServiceName("FR_ColiposteColissimo")).toBe("Colissimo");
    expect(ebayServiceName("FR_Chronopost")).toBe("Chronopost");
    expect(ebayServiceName("FR_PostOfficeLetterFollowed")).toBe("Lettre suivie");
    expect(ebayServiceName("FR_LaPosteColissimoExpert")).toBe("La Poste Colissimo Expert");
    expect(ebayServiceName("DE_Express_Paket")).toBe("Express Paket");
    expect(ebayServiceName(null)).toBeNull();
  });

  it("lignes en double retirées", () => {
    const r = { label: "Retours", value: "14 jours", sub: "x" };
    expect(dedupeRows([r, { ...r }, { ...r, value: "30 jours" }])).toHaveLength(2);
  });
});
