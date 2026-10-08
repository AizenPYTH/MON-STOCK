import { describe, expect, it } from "vitest";
import { diceCoefficient, scoreCandidate, suggestSkusForListing, tokenize, type SkuCandidate } from "@/services/sync/matching";
import { aspectsKey, variationKey } from "@/integrations/core/variation";

const iphone128: SkuCandidate = { skuId: "sku-128", code: "IPH13-128-BLK-A", barcode: null, productName: "iPhone 13", brand: "Apple", variantName: "128 Go / Noir / Grade A", attributes: { storage: "128 Go", color: "Noir", grade: "A" }, ean: "0194252707869", mpn: null };
const iphone256: SkuCandidate = { ...iphone128, skuId: "sku-256", code: "IPH13-256-BLK-A", variantName: "256 Go / Noir / Grade A", attributes: { storage: "256 Go", color: "Noir", grade: "A" }, ean: "0194252707999" };
const iphoneBlue: SkuCandidate = { ...iphone128, skuId: "sku-128-blue", code: "IPH13-128-BLU-A", variantName: "128 Go / Bleu / Grade A", attributes: { storage: "128 Go", color: "Bleu", grade: "A" }, ean: null };
const coque: SkuCandidate = { skuId: "sku-coque", code: "COQUE-SIL-RED", barcode: "3700000000001", productName: "Coque silicone", brand: null, variantName: "Rouge", attributes: { color: "Rouge" }, ean: null, mpn: null };

describe("tokenize", () => {
  it("normalise accents, capacités et couleurs", () => {
    expect(tokenize("Apple iPhone 13 128 Go Noir reconditionné")).toEqual(["apple", "iphone", "13", "128gb", "black", "reconditionne"]);
    expect(tokenize("SSD 1 To gris sidéral")).toEqual(["ssd", "1tb", "gray", "sideral"]);
  });
  it("coefficient de Dice", () => {
    expect(diceCoefficient(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(diceCoefficient(new Set(["a", "b"]), new Set(["c"]))).toBe(0);
    expect(diceCoefficient(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("scoreCandidate", () => {
  it("EAN identique → confiance 0.95, méthode ean", () => {
    const s = scoreCandidate({ title: "Téléphone", externalSku: null, variationAttributes: {}, ean: "0194252707869" }, iphone128);
    expect(s).toMatchObject({ skuId: "sku-128", confidence: 0.95, method: "ean" });
    const viaSku = scoreCandidate({ title: "Coque", externalSku: "3700000000001", variationAttributes: {} }, coque);
    expect(viaSku?.method).toBe("ean");
  });

  it("SKU partiel : l'un contient l'autre (jamais l'égalité stricte, réservée à l'auto-association)", () => {
    const s = scoreCandidate({ title: "x", externalSku: "IPH13-128-BLK", variationAttributes: {} }, iphone128);
    expect(s).toMatchObject({ method: "sku_partial", confidence: 0.85 });
    const far = scoreCandidate({ title: "x", externalSku: "IPH13", variationAttributes: {} }, iphone128);
    expect(far).toMatchObject({ method: "sku_partial", confidence: 0.7 });
  });

  it("le titre discrimine les variantes : capacité différente pénalisée, identique bonifiée", () => {
    const listing = { title: "Apple iPhone 13 128 Go Noir reconditionné Grade A", externalSku: null, variationAttributes: {} };
    const good = scoreCandidate(listing, iphone128)!;
    const wrongStorage = scoreCandidate(listing, iphone256)!;
    const wrongColor = scoreCandidate(listing, iphoneBlue)!;
    expect(good.method).toBe("attributes");
    expect(good.confidence).toBeGreaterThan(0.6);
    expect(good.confidence).toBeLessThanOrEqual(0.9);
    expect(good.reasons).toContain("capacité identique");
    expect(wrongStorage.confidence).toBeLessThan(good.confidence - 0.3);
    expect(wrongStorage.reasons).toContain("capacité différente");
    expect(wrongStorage.method).toBe("title_similarity");
    expect(wrongColor.confidence).toBeLessThan(good.confidence);
  });

  it("aucun point commun → null", () => {
    expect(scoreCandidate({ title: "Lampe de bureau", externalSku: null, variationAttributes: {} }, iphone128)).toBeNull();
  });
});

describe("suggestSkusForListing", () => {
  it("trie par confiance, applique le seuil et la limite, de façon déterministe", () => {
    const listing = { title: "Apple iPhone 13 128 Go Noir reconditionné", externalSku: null, variationAttributes: {} };
    const all = suggestSkusForListing(listing, [coque, iphone256, iphoneBlue, iphone128], { minConfidence: 0.3 });
    expect(all[0]?.skuId).toBe("sku-128");
    expect(all.map((s) => s.skuId)).not.toContain("sku-coque");
    expect(all).toHaveLength(3);
    const strict = suggestSkusForListing(listing, [coque, iphone256, iphoneBlue, iphone128], { limit: 1 });
    expect(strict).toHaveLength(1);
    expect(strict[0]?.skuId).toBe("sku-128");
    expect(suggestSkusForListing(listing, [coque])).toEqual([]);
  });

  it("utilise les attributs de variation de l'annonce", () => {
    const listing = { title: "Coque silicone", externalSku: null, variationAttributes: { Couleur: "Rouge" } };
    const s = suggestSkusForListing(listing, [coque, iphone128], { minConfidence: 0.4 });
    expect(s[0]?.skuId).toBe("sku-coque");
    expect(s[0]?.reasons).toContain("couleur identique");
  });
});

describe("variationKey", () => {
  it("SKU prioritaire, sinon caractéristiques triées, sinon identifiant de repli", () => {
    expect(variationKey({ sku: " ABC ", aspects: { Color: "Red" } })).toBe("ABC");
    expect(variationKey({ sku: null, aspects: { Size: "M", Color: "Red" } })).toBe("Color=Red|Size=M");
    expect(variationKey({ sku: "", aspects: [{ name: "Size", value: "M" }], fallbackId: "9" })).toBe("Size=M");
    expect(variationKey({ sku: null, aspects: {}, fallbackId: "9" })).toBe("9");
    expect(variationKey({ sku: null })).toBe("");
    expect(aspectsKey({ " b ": " 2 ", a: "1", empty: "" })).toBe("a=1|b=2");
  });
});
