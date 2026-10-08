import { describe, expect, it } from "vitest";
import { normalizeProduct, normalizeStorage, normalizeColor, normalizeGrade, normalizeCondition, normalizeText, isValidGtin, extractMpn } from "@/domain/sourcing/normalizer";

const SPEC_EXAMPLES = ["Apple iPhone 13 128GB Black Grade A", "IPHONE13 128G BLACK A", "Apple iPhone 13 128 Go Noir A", "iPhone 13 128GB A Grade", "iphone 13 128 a", "iphone 13 noir 128 grade a"];

describe("ProductNormalizer", () => {
  it("ramène toutes les variantes de la spec à la même identité brand/model/storage/grade", () => {
    const results = SPEC_EXAMPLES.map((s) => normalizeProduct(s));
    for (const r of results) {
      expect(r.brand).toBe("apple");
      expect(r.model).toBe("iphone 13");
      expect(r.storage).toBe("128GB");
      expect(r.grade).toBe("A");
    }
    const withColor = results.filter((r) => r.color !== null);
    expect(withColor.length).toBe(4);
    for (const r of withColor) expect(r.color).toBe("black");
    const keys = new Set(withColor.map((r) => r.normalizedKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("apple|iphone 13|128gb|black|refurbished|a");
  });

  it("produit un titre d'affichage lisible", () => {
    expect(normalizeProduct("IPHONE13 128G BLACK A").displayTitle).toBe("Apple iPhone 13 128GB Black Grade A");
  });

  it("signale la déduction de l'état à partir du grade", () => {
    const r = normalizeProduct("iphone 13 128 a");
    expect(r.condition).toBe("refurbished");
    expect(r.inferred).toContain("condition");
    const explicit = normalizeProduct("iPhone 13 128GB Grade A reconditionné");
    expect(explicit.inferred).not.toContain("condition");
  });

  it("normalise les stockages", () => {
    expect(normalizeStorage("128GB")).toBe("128GB");
    expect(normalizeStorage("128 GB")).toBe("128GB");
    expect(normalizeStorage("128 Go")).toBe("128GB");
    expect(normalizeStorage("128G")).toBe("128GB");
    expect(normalizeStorage("1 To")).toBe("1TB");
    expect(normalizeStorage("1TB")).toBe("1TB");
    expect(normalizeStorage("13")).toBeNull();
  });

  it("normalise les couleurs FR/EN", () => {
    expect(normalizeColor("Noir")?.key).toBe("black");
    expect(normalizeColor("Space Grey")?.key).toBe("gray");
    expect(normalizeColor("gris sidéral")?.key).toBe("gray");
    expect(normalizeColor("Bleu")?.key).toBe("blue");
    expect(normalizeColor("Argent")?.key).toBe("silver");
    expect(normalizeColor("Or")?.key).toBe("gold");
    expect(normalizeColor("Violet")?.key).toBe("purple");
    expect(normalizeColor("Rose")?.key).toBe("pink");
    expect(normalizeColor("Inconnue")).toBeNull();
  });

  it("normalise les grades et états", () => {
    expect(normalizeGrade("Grade A")).toBe("A");
    expect(normalizeGrade("Gr. A")).toBe("A");
    expect(normalizeGrade("A Grade")).toBe("A");
    expect(normalizeGrade("A+")).toBe("A+");
    expect(normalizeGrade("Grade B")).toBe("B");
    expect(normalizeCondition("Neuf")).toBe("new");
    expect(normalizeCondition("sealed")).toBe("new");
    expect(normalizeCondition("Reconditionné")).toBe("refurbished");
    expect(normalizeCondition("refurb")).toBe("refurbished");
    expect(normalizeCondition("Occasion")).toBe("used");
    expect(normalizeCondition("second hand")).toBe("used");
    expect(normalizeCondition("")).toBe("unknown");
  });

  it("reconnaît d'autres marques et modèles", () => {
    const s = normalizeProduct("Samsung Galaxy S23 Ultra 256GB Phantom Black Neuf");
    expect(s.brand).toBe("samsung");
    expect(s.model).toBe("galaxy s23 ultra");
    expect(s.storage).toBe("256GB");
    expect(s.color).toBe("black");
    expect(s.condition).toBe("new");
    const p = normalizeProduct("Google Pixel 7a 128 Go reconditionné Gr. B");
    expect(p.brand).toBe("google");
    expect(p.model).toBe("pixel 7a");
    expect(p.grade).toBe("B");
    const z = normalizeProduct("Galaxy Z Fold 5 512GB");
    expect(z.model).toBe("galaxy z fold 5");
    const x = normalizeProduct("Xiaomi Redmi Note 12 Pro 5G 8GB/256GB Bleu");
    expect(x.brand).toBe("xiaomi");
    expect(x.model).toBe("redmi note 12 pro");
    expect(x.storage).toBe("256GB");
    expect(x.variant).toBe("8gb ram");
    const d = normalizeProduct("Dyson V11 Absolute occasion");
    expect(d.brand).toBe("dyson");
    expect(d.model).toBe("v11 absolute");
    expect(d.condition).toBe("used");
    const ipad = normalizeProduct("iPad Pro 12.9 2022 256GB WiFi Space Gray");
    expect(ipad.model).toBe("ipad pro 12.9 2022");
    expect(ipad.variant).toBe("wifi");
    expect(ipad.color).toBe("gray");
  });

  it("extrait EAN et MPN", () => {
    const r = normalizeProduct("3456789012345 iPhone 13 128GB");
    expect(r.ean).toBe("3456789012345");
    expect(r.eanValid).toBe(false);
    const ok = normalizeProduct("4006381333931 Stabilo");
    expect(ok.eanValid).toBe(true);
    expect(isValidGtin("4006381333931")).toBe(true);
    expect(normalizeProduct("Apple MacBook Air 13 M2 8GB 256GB Midnight MLY33FN/A").mpn).toBe("MLY33FN/A");
    expect(extractMpn("iPhone 13 128GB")).toBeNull();
    expect(extractMpn("Galaxy S23 SM-S911B")).toBe("SM-S911B");
    expect(extractMpn("Redmi 8GB/256GB")).toBeNull();
  });

  it("ne prend pas un article ou USB-C pour un grade sans modèle reconnu", () => {
    const r = normalizeProduct("Chargeur USB-C 20W");
    expect(r.grade).toBeNull();
    expect(r.condition).toBe("unknown");
    expect(r.inferred).toContain("model");
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("applique les indices structurés en priorité", () => {
    const r = normalizeProduct("Téléphone reconditionné", { brand: "Apple", model: "iPhone 14 Pro", storage: "256 Go", color: "Violet intense", grade: "grade a", condition: "refurbished" });
    expect(r.normalizedKey).toBe("apple|iphone 14 pro|256gb|purple|refurbished|a");
  });

  it("normalise accents, casse et espaces", () => {
    expect(normalizeText("  Téléphone   Reconditionné, 128 Go ")).toBe("telephone reconditionne 128 go");
  });
});
