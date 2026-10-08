import { describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { DEFAULT_MAX_EXPANSIONS, detectCategory, expandQuery, queriesFor, type ExpandedQuery } from "@/domain/sourcing/query-expansion";
import { normalizeText } from "@/domain/sourcing/normalizer";

const texts = (list: ExpandedQuery[]) => list.map((q) => q.text);
const expand = (q: string, opts?: Parameters<typeof expandQuery>[1]) => expandQuery(parseQuery(q), opts);

function assertInvariants(list: ExpandedQuery[], max = DEFAULT_MAX_EXPANSIONS) {
  expect(list.length).toBeLessThanOrEqual(max);
  const keys = list.map((q) => normalizeText(q.text).split(" ").sort().join(" "));
  expect(new Set(keys).size).toBe(keys.length);
  list.forEach((q, i) => expect(q.priority).toBe(i + 1));
  // les requêtes adaptateurs précèdent toujours les requêtes de découverte
  const firstDiscovery = list.findIndex((q) => q.useFor === "discovery");
  if (firstDiscovery >= 0) expect(list.slice(firstDiscovery).every((q) => q.useFor === "discovery")).toBe(true);
  for (const q of list) {
    if (q.purpose === "b2b_intent" || q.purpose === "liquidation") expect(q.useFor).toBe("discovery");
    else expect(q.useFor).toBe("adapter_search");
  }
}

describe("expandQuery — iPhone 13", () => {
  const list = expand("iPhone 13 128 Go Grade A");
  it("produit les formes canoniques EN et FR", () => {
    expect(list[0]).toMatchObject({ text: "Apple iPhone 13 128GB Grade A", purpose: "exact", language: "en", useFor: "adapter_search", priority: 1 });
    expect(list[1]).toMatchObject({ text: "iPhone 13 128 Go Grade A", purpose: "exact", language: "fr" });
  });
  it("ajoute la variante d'état (grade → reconditionné) en EN et FR", () => {
    expect(list.filter((q) => q.purpose === "condition").map((q) => q.text)).toEqual(["Apple iPhone 13 128GB refurbished", "iPhone 13 128 Go reconditionné"]);
  });
  it("réserve des requêtes B2B de découverte (au plus 3)", () => {
    const disc = queriesFor(list, "discovery");
    expect(disc.length).toBeGreaterThanOrEqual(2);
    expect(disc.length).toBeLessThanOrEqual(3);
    expect(disc).toContain("iPhone 13 grossiste reconditionné");
    expect(disc).toContain("Apple iPhone 13 wholesale refurbished B2B");
  });
  it("respecte les invariants (≤ 6, dédupliqué, priorités)", () => assertInvariants(list));
  it("est déterministe", () => expect(expand("iPhone 13 128 Go Grade A")).toEqual(list));
});

describe("expandQuery — autres modèles", () => {
  it("iPhone 13 Pro reconditionné : modèle exact conservé (Pro)", () => {
    const list = expand("iphone 13 pro 256GB reconditionné");
    expect(texts(list).slice(0, 4)).toEqual(["Apple iPhone 13 Pro 256GB", "iPhone 13 Pro 256 Go", "Apple iPhone 13 Pro 256GB refurbished", "iPhone 13 Pro 256 Go reconditionné"]);
    expect(texts(list).every((t) => /13 Pro/.test(t))).toBe(true);
    assertInvariants(list);
  });
  it("iPhone 14 neuf : variante « new / neuf », intentions B2B neuves", () => {
    const list = expand("iPhone 14 128GB neuf");
    expect(texts(list)).toContain("Apple iPhone 14 128GB new");
    expect(texts(list)).toContain("iPhone 14 128 Go neuf");
    expect(queriesFor(list, "discovery")).toEqual(["iPhone 14 grossiste", "Apple iPhone 14 wholesale B2B"]);
    assertInvariants(list);
  });
  it("Galaxy S22 grade B", () => {
    const list = expand("Samsung Galaxy S22 128GB Grade B");
    expect(list[0]!.text).toBe("Samsung Galaxy S22 128GB Grade B");
    expect(list[1]!.text).toBe("Galaxy S22 128 Go Grade B");
    expect(queriesFor(list, "discovery")[0]).toBe("Galaxy S22 grossiste reconditionné");
    assertInvariants(list);
  });
  it("Galaxy S23 Ultra sans état : pas de variante d'état, 3 requêtes de découverte dont déstockage", () => {
    const list = expand("Galaxy S23 Ultra 256 Go");
    expect(list.some((q) => q.purpose === "condition")).toBe(false);
    expect(texts(list)).toEqual(["Samsung Galaxy S23 Ultra 256GB", "Galaxy S23 Ultra 256 Go", "Galaxy S23 Ultra grossiste", "Samsung Galaxy S23 Ultra wholesale B2B", "lot Galaxy S23 Ultra déstockage"]);
    expect(list.find((q) => q.purpose === "liquidation")?.useFor).toBe("discovery");
    assertInvariants(list);
  });
  it("Pixel 7", () => {
    const list = expand("Google Pixel 7 128GB");
    expect(texts(list).slice(0, 2)).toEqual(["Google Pixel 7 128GB", "Pixel 7 128 Go"]);
    assertInvariants(list);
  });
  it("Redmi Note 12", () => {
    const list = expand("Xiaomi Redmi Note 12 128GB");
    expect(texts(list).slice(0, 2)).toEqual(["Xiaomi Redmi Note 12 128GB", "Redmi Note 12 128 Go"]);
    expect(queriesFor(list, "discovery")).toContain("lot Redmi Note 12 déstockage");
    assertInvariants(list);
  });
  it("iPad : variante Wi-Fi conservée, pas de guillemets de taille", () => {
    const list = expand("iPad 10 64GB wifi");
    expect(texts(list).slice(0, 2)).toEqual(["Apple iPad 10 64GB Wi-Fi", "iPad 10 64 Go Wi-Fi"]);
    expect(texts(list).some((t) => t.includes('"'))).toBe(false);
    expect(detectCategory(parseQuery("iPad 10 64GB wifi"))).toBe("tablet");
    assertInvariants(list);
  });
  it("couleur traduite en français dans la forme FR", () => {
    const list = expand("iphone 13 mini 128 bleu grade A+");
    expect(list[0]!.text).toBe("Apple iPhone 13 Mini 128GB Blue Grade A+");
    expect(list[1]!.text).toBe("iPhone 13 Mini 128 Go Bleu Grade A+");
  });
});

describe("expandQuery — identifiants et cas limites", () => {
  it("EAN seul : requête identifiant prioritaire", () => {
    const list = expand("0194252707289");
    expect(list[0]).toMatchObject({ text: "0194252707289", purpose: "identifier", useFor: "adapter_search", language: "neutral", priority: 1 });
    expect(list.filter((q) => q.useFor === "adapter_search")).toHaveLength(1);
    assertInvariants(list);
  });
  it("MPN seul", () => {
    const list = expand("MLPF3ZD/A");
    expect(list[0]).toMatchObject({ text: "MLPF3ZD/A", purpose: "identifier" });
  });
  it("EAN + modèle : identifiant d'abord, puis formes exactes", () => {
    const list = expand("iPhone 13 128 Go 0194252707289");
    expect(texts(list).slice(0, 3)).toEqual(["0194252707289", "Apple iPhone 13 128GB", "iPhone 13 128 Go"]);
    assertInvariants(list);
  });
  it("requête vide → aucune reformulation", () => {
    expect(expand("")).toEqual([]);
    expect(expand("   ")).toEqual([]);
  });
  it("texte libre non reconnu : requête telle quelle + 2 intentions B2B", () => {
    const list = expand("chargeur usb c 20w");
    expect(list[0]).toMatchObject({ text: "chargeur usb c 20w", purpose: "exact", language: "neutral" });
    expect(queriesFor(list, "discovery")).toEqual(["chargeur usb c 20w grossiste", "chargeur usb c 20w wholesale"]);
  });
  it("pas de doublon quand EN = FR (Apple Watch : la marque est déjà dans le modèle)", () => {
    const list = expand("Apple Watch Series 8");
    expect(list.filter((q) => q.purpose === "exact").map((q) => q.text)).toEqual(["Apple Watch Series 8"]);
    expect(texts(list).some((t) => /Apple Apple/.test(t))).toBe(false);
    expect(detectCategory(parseQuery("Apple Watch Series 8"))).toBe("wearable");
  });
  it("options : max et désactivation de la découverte", () => {
    const small = expand("iPhone 13 128 Go Grade A", { max: 3 });
    expect(small).toHaveLength(3);
    expect(small.filter((q) => q.useFor === "discovery")).toHaveLength(2);
    assertInvariants(small, 3);
    const noDisc = expand("iPhone 13 128 Go Grade A", { includeDiscovery: false });
    expect(noDisc.every((q) => q.useFor === "adapter_search")).toBe(true);
    expect(noDisc).toHaveLength(4);
    const one = expand("Galaxy S23 Ultra 256 Go", { maxDiscovery: 1 });
    expect(queriesFor(one, "discovery")).toEqual(["Galaxy S23 Ultra grossiste"]);
  });
  it("catégories", () => {
    expect(detectCategory(parseQuery("iPhone 13"))).toBe("smartphone");
    expect(detectCategory(parseQuery("Galaxy S22"))).toBe("smartphone");
    expect(detectCategory(parseQuery("Redmi Note 12"))).toBe("smartphone");
    expect(detectCategory(parseQuery("MacBook Air 13"))).toBe("computer");
    expect(detectCategory(parseQuery("PS5 slim"))).toBe("console");
    expect(detectCategory(parseQuery("chargeur"))).toBe("other");
  });
});
