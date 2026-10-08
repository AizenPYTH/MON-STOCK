import { describe, expect, it } from "vitest";
import { matchOfferToSkus, type MatchCandidate, MATCH_HIGH_THRESHOLD, MATCH_AMBIGUOUS_THRESHOLD } from "@/domain/sourcing/matching";

const base: MatchCandidate = {
  skuId: "sku-1",
  code: "IP13-128-BLK-A",
  productName: "iPhone 13",
  brand: "Apple",
  variantName: "128GB / Black / Grade A",
  attributes: { storage: "128GB", color: "Black", grade: "A" },
  condition: "refurbished",
  ean: "0194252707013",
  mpn: "MLPF3ZD/A",
  barcode: null,
};

describe("ProductMatchingService", () => {
  it("EAN exact → confiance 1, auto-confirmable", () => {
    const r = matchOfferToSkus({ title: "Apple iPhone 13 128GB", ean: "0194252707013", mpn: null, supplierSku: null }, [base]);
    expect(r[0]?.method).toBe("ean");
    expect(r[0]?.confidence).toBe(1);
    expect(r[0]?.autoConfirmable).toBe(true);
    expect(r[0]?.level).toBe("high");
  });

  it("MPN exact → high, auto-confirmable", () => {
    const r = matchOfferToSkus({ title: "iPhone 13", ean: null, mpn: "mlpf3zd/a", supplierSku: null }, [base]);
    expect(r[0]?.method).toBe("mpn");
    expect(r[0]?.confidence).toBeGreaterThanOrEqual(MATCH_HIGH_THRESHOLD);
  });

  it("référence fournisseur égale au code SKU → high", () => {
    const r = matchOfferToSkus({ title: "Téléphone", ean: null, mpn: null, supplierSku: "ip13-128-blk-a" }, [base]);
    expect(r[0]?.method).toBe("supplier_sku");
    expect(r[0]?.autoConfirmable).toBe(true);
  });

  it("attributs complets identiques → high mais jamais auto-confirmable", () => {
    const r = matchOfferToSkus({ title: "IPHONE13 128G BLACK A", ean: null, mpn: null, supplierSku: null }, [base]);
    expect(r[0]?.method).toBe("attributes");
    expect(r[0]?.level).toBe("high");
    expect(r[0]?.autoConfirmable).toBe(false);
    expect(r[0]?.reasons.join(" ")).toContain("Modèle identique");
  });

  it("stockage différent → ambigu ou rejeté, jamais high", () => {
    const r = matchOfferToSkus({ title: "Apple iPhone 13 256GB Black Grade A", ean: null, mpn: null, supplierSku: null }, [base]);
    expect(r[0] === undefined || r[0].confidence < MATCH_HIGH_THRESHOLD).toBe(true);
    if (r[0]) expect(r[0].reasons.join(" ")).toContain("Stockage différent");
  });

  it("modèle différent → aucune suggestion", () => {
    const r = matchOfferToSkus({ title: "Apple iPhone 14 128GB Black Grade A", ean: null, mpn: null, supplierSku: null }, [base]);
    expect(r.length).toBe(0);
  });

  it("couleur inconnue côté offre → ambigu (validation demandée)", () => {
    const r = matchOfferToSkus({ title: "iPhone 13 128GB Grade A", ean: null, mpn: null, supplierSku: null }, [base]);
    expect(r[0]).toBeDefined();
    expect(r[0]!.confidence).toBeGreaterThanOrEqual(MATCH_AMBIGUOUS_THRESHOLD);
    expect(r[0]!.confidence).toBeLessThan(MATCH_HIGH_THRESHOLD);
    expect(r[0]!.level).toBe("ambiguous");
  });

  it("classe plusieurs candidats par confiance décroissante", () => {
    const other: MatchCandidate = { ...base, skuId: "sku-2", code: "IP13-256-BLK-A", variantName: "256GB / Black / Grade A", attributes: { storage: "256GB", color: "Black", grade: "A" }, ean: null, mpn: null };
    const r = matchOfferToSkus({ title: "IPHONE13 128G BLACK A", ean: null, mpn: null, supplierSku: null }, [other, base]);
    expect(r[0]?.skuId).toBe("sku-1");
  });
});
