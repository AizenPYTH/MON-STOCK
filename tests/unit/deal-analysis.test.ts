import { describe, expect, it } from "vitest";
import { analyzeDeal, compareDeals, detectKind, detectQuality, isEquivalent, productSignature, quantile, type DealComparable, type DealOfferInput } from "@/domain/sourcing/deal-analysis";
import { EMPTY_COST_SETTINGS, type RadarCostSettings } from "@/domain/sourcing/radar";

/**
 * Analyse « bonne affaire » : une offre n'est intéressante que si elle est comparée à des produits
 * RÉELLEMENT équivalents et que la marge reste positive après les coûts. Montants vérifiés à la main.
 */
const NOW = new Date("2026-10-14T12:00:00Z");
const FULL: RadarCostSettings = {
  vatRegime: "margin",
  vatRate: 20,
  vatRecoverable: false,
  marketplaceFeePercent: 10,
  paymentFeePercent: 0,
  paymentFeeFixed: 0,
  shippingToCustomer: 5,
  packagingCost: 1,
  returnProvisionPercent: 0,
  importDutyPercent: 0,
};

const offer = (o: Partial<DealOfferInput> = {}): DealOfferInput => ({
  offerId: "o1",
  supplierId: "s1",
  title: "Apple iPhone 13 128GB Noir Grade A reconditionné",
  price: 300,
  originalCurrency: "EUR",
  orgCurrency: "EUR",
  taxType: "ttc",
  shippingCost: 0,
  moq: 1,
  supplierCountry: "FR",
  stockStatus: "in_stock",
  availableQuantity: 5,
  lastSeenAt: "2026-10-14T08:00:00Z",
  marketplace: false,
  publicPrice: true,
  ...o,
});

const listing = (id: string, price: number, title = "iPhone 13 128 Go Bleu Grade A reconditionné"): DealComparable => ({ offerId: id, supplierId: "ebay", title, price, marketplace: true });

describe("identification du produit", () => {
  it("distingue les types de pièces", () => {
    expect(detectKind("Pantalla LCD Táctil para iPhone 13 Pro SOFT OLED Negro")).toBe("screen");
    expect(detectKind("Batterie iPhone 13 3227mAh")).toBe("battery");
    expect(detectKind("Vitre arrière iPhone 13 bleu")).toBe("back_glass");
    expect(detectKind("Flex Flash para iPhone 13")).toBe("flex");
    expect(detectKind("Verre trempé iPhone 13")).toBe("screen_protector");
    expect(detectKind("Lote de 10 iPhone 13 grade B")).toBe("lot");
    expect(detectKind("Apple iPhone 13 128GB Midnight")).toBe("device");
  });

  it("détecte la qualité de pièce (et garde la plus précise)", () => {
    expect(detectQuality("Écran iPhone 13 Soft OLED")).toEqual(["soft_oled"]);
    expect(detectQuality("LCD displej pro Apple iPhone 13 (JK In-cell)")).toEqual(["incell"]);
  });
});

describe("équivalence stricte", () => {
  const sig = (title: string) => productSignature({ title });

  it("un écran OLED n'est pas équivalent à un écran Incell", () => {
    expect(isEquivalent(sig("Écran iPhone 13 OLED"), sig("Écran iPhone 13 Incell"))).toBe(false);
    expect(isEquivalent(sig("Écran iPhone 13 OLED"), sig("Display iPhone 13 OLED"))).toBe(true);
  });

  it("un écran n'est pas équivalent à une batterie du même modèle", () => {
    expect(isEquivalent(sig("Écran iPhone 13"), sig("Batterie iPhone 13"))).toBe(false);
  });

  it("deux nappes de fonctions différentes ne sont pas équivalentes", () => {
    expect(isEquivalent(sig("Flex Flash para iPhone 13"), sig("Flex auricular iPhone 13"))).toBe(false);
    expect(isEquivalent(sig("Flex Flash para iPhone 13"), sig("Flex Flash iPhone 13 negro"))).toBe(true);
  });

  it("modèles différents (13 / 13 Pro) jamais équivalents", () => {
    expect(isEquivalent(sig("Batterie iPhone 13"), sig("Batterie iPhone 13 Pro"))).toBe(false);
  });

  it("un appareil exige capacité, état et grade identiques et connus", () => {
    const a = sig("iPhone 13 128GB grade A reconditionné");
    expect(isEquivalent(a, sig("iPhone 13 128 Go grade A reconditionné bleu"))).toBe(true);
    expect(isEquivalent(a, sig("iPhone 13 256GB grade A reconditionné"))).toBe(false);
    expect(isEquivalent(a, sig("iPhone 13 128GB grade B reconditionné"))).toBe(false);
    expect(isEquivalent(sig("iPhone 13 bleu"), sig("iPhone 13 bleu"))).toBe(false); // capacité inconnue
  });

  it("un lot n'est jamais comparable", () => {
    const lot = sig("Lote de 10 iPhone 13 128GB grade B");
    expect(lot.identified).toBe(false);
    expect(isEquivalent(lot, lot)).toBe(false);
  });
});

describe("analyse d'une offre", () => {
  const market = [listing("e1", 400), listing("e2", 420), listing("e3", 440), listing("e4", 460)];

  it("très intéressant : comparaison équivalente, coûts complets, marge et écart suffisants", () => {
    const d = analyzeDeal(offer(), market, FULL, null, NOW);
    expect(d.comparable).toBe(true);
    expect(d.marketBasis).toBe("marketplace");
    expect(d.marketCount).toBe(4);
    expect(d.marketPrice).toBe(430); // médiane 400/420/440/460
    expect(d.resalePrice).toBe(415); // 1er quartile
    expect(d.resaleBasis).toBe("marketplace_low");
    expect(d.totalCost).toBe(300);
    // marge (régime de la marge) : 415 − 300 = 115 ; TVA sur marge 115×20/120 = 19,17 ;
    // frais 41,5 + 5 + 1 = 47,5 → 115 − 19,17 − 47,5 = 48,33
    expect(d.margin).toBe(48.33);
    expect(d.marginPercent).toBe(11.65);
    expect(d.discountPercent).toBe(30.23); // (430 − 300) / 430
    expect(d.provisional).toBe(false);
    expect(d.level).toBe("good"); // marge 11,65 % < 20 %
    expect(d.score).toBeGreaterThan(0);
  });

  it("très intéressant quand la marge dépasse 20 % et l'écart 20 %", () => {
    const d = analyzeDeal(offer({ price: 250 }), market, FULL, null, NOW);
    expect(d.marginPercent).toBeGreaterThanOrEqual(20);
    expect(d.level).toBe("very_good");
  });

  it("non compétitif quand le coût total dépasse le marché", () => {
    const d = analyzeDeal(offer({ price: 450 }), market, FULL, null, NOW);
    expect(d.level).toBe("not_competitive");
    expect(d.margin!).toBeLessThanOrEqual(0);
  });

  it("non compétitif si la marge est négative après les coûts, même sous le marché", () => {
    const d = analyzeDeal(offer({ price: 395 }), market, FULL, null, NOW);
    expect(d.discountPercent!).toBeGreaterThan(0);
    expect(d.margin!).toBeLessThanOrEqual(0);
    expect(d.level).toBe("not_competitive");
  });

  it("aucune comparaison avec des produits non équivalents → données insuffisantes", () => {
    const other = [listing("e1", 600, "iPhone 13 256GB grade A reconditionné"), listing("e2", 650, "iPhone 13 256GB grade A reconditionné"), listing("e3", 700, "iPhone 13 256GB grade A reconditionné")];
    const d = analyzeDeal(offer(), other, FULL, null, NOW);
    expect(d.level).toBe("insufficient_data");
    expect(d.comparable).toBe(false);
    expect(d.margin).toBeNull();
  });

  it("coûts inconnus : jamais supposés nuls, marge provisoire, au mieux « moyen »", () => {
    const d = analyzeDeal(offer({ price: 250 }), market, EMPTY_COST_SETTINGS, null, NOW);
    expect(d.provisional).toBe(true);
    expect(d.missingCosts).toContain("commission marketplace");
    expect(d.level).toBe("average");
    expect(d.summary).toMatch(/provisoire, coûts à compléter/);
  });

  it("vos ventes réelles priment sur le marché pour le prix de revente", () => {
    const d = analyzeDeal(offer(), market, FULL, { avgSalePrice30d: 500, salePrice: 480 }, NOW);
    expect(d.resalePrice).toBe(500);
    expect(d.resaleBasis).toBe("own_sales");
  });

  it("à défaut d'annonces : autres fournisseurs (prix de gros, signalé), pas de revente inventée", () => {
    const sup: DealComparable[] = [
      { offerId: "x1", supplierId: "s2", title: "Batterie iPhone 13", price: 20, marketplace: false },
      { offerId: "x2", supplierId: "s3", title: "Batterie iPhone 13", price: 24, marketplace: false },
      { offerId: "x3", supplierId: "s1", title: "Batterie iPhone 13", price: 10, marketplace: false }, // même fournisseur : ignoré
    ];
    const d = analyzeDeal(offer({ title: "Batterie iPhone 13", price: 15 }), sup, FULL, null, NOW);
    expect(d.marketBasis).toBe("suppliers");
    expect(d.marketPrice).toBe(22);
    expect(d.discountPercent).toBe(31.82);
    expect(d.resalePrice).toBeNull();
    expect(d.level).toBe("insufficient_data");
    expect(d.uncertainties.join(" ")).toMatch(/autres fournisseurs/);
  });

  it("signale les données incertaines (HT/TTC, stock, occasion, devise, ancienneté, lot)", () => {
    const d = analyzeDeal(offer({ taxType: "unknown", stockStatus: "unknown", availableQuantity: null, originalCurrency: "PLN", lastSeenAt: "2026-09-01T00:00:00Z" }), market, FULL, null, NOW);
    const text = d.uncertainties.join(" | ");
    expect(text).toMatch(/HT ou TTC/);
    expect(text).toMatch(/Stock non communiqué/);
    expect(text).toMatch(/grade A/);
    expect(text).toMatch(/PLN/);
    expect(text).toMatch(/il y a 43 jours/);
    expect(d.level).not.toBe("very_good");

    const lot = analyzeDeal(offer({ title: "Lote de 10 iPhone 13 128GB grade B" }), market, FULL, null, NOW);
    expect(lot.level).toBe("insufficient_data");
    expect(lot.uncertainties.join(" ")).toMatch(/lot/i);
  });

  it("une rupture de stock n'est jamais « très intéressant »", () => {
    const d = analyzeDeal(offer({ price: 250, stockStatus: "out_of_stock", availableQuantity: 0 }), market, FULL, null, NOW);
    expect(d.level).toBe("good");
  });

  it("écarte les prix aberrants du marché", () => {
    const d = analyzeDeal(offer(), [...market, listing("e5", 5), listing("e6", 5000)], FULL, null, NOW);
    expect(d.marketCount).toBe(4);
    expect(d.marketPrice).toBe(430);
  });

  it("frais de port fournisseur et douane hors UE entrent dans le coût total", () => {
    const d = analyzeDeal(offer({ shippingCost: 20, moq: 2, supplierCountry: "CN" }), market, { ...FULL, importDutyPercent: 10 }, null, NOW);
    expect(d.totalCost).toBe(340); // 300 + 20/2 + 30
  });
});

describe("tri et utilitaires", () => {
  it("quantile", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });

  it("meilleures affaires d'abord", () => {
    const mk = (level: "very_good" | "good" | "average" | "not_competitive" | "insufficient_data", score: number) => ({ deal: { level, score, margin: score } as never });
    const sorted = [mk("average", 90), null, mk("very_good", 50), mk("good", 80), mk("good", 60)].map((x) => x ?? { deal: null }).sort(compareDeals);
    expect(sorted.map((x) => (x.deal as { level?: string } | null)?.level ?? null)).toEqual(["very_good", "good", "good", "average", null]);
  });
});

describe("cas relevés sur les données réelles (14/10/2026)", () => {
  const sig = (title: string, over: Record<string, string | null> = {}) => productSignature({ title, ...over });
  it("« (100% battery) » décrit un téléphone, pas une batterie", () => {
    expect(sig("iPhone 13 d’occasion - 512 Go / Blue / A+ (100% battery)").kind).toBe("device");
    expect(sig("Batterie iPhone 13 3227 mAh").kind).toBe("battery");
  });
  it("tiroirs SIM, blindages et verres trempés reconnus comme pièces", () => {
    expect(sig("Šuplík na SIM iPhone 12 bílý").kind).toBe("sim_tray");
    expect(sig("Tiroir carte SIM compatible iPhone 13 Vert| Brico-phone").kind).toBe("sim_tray");
    expect(sig("Blindaje Metálico para iPhone 13 PRO").kind).toBe("other_part");
    expect(sig("Protector de cristal templado completo Iphone 13 / 13 PRO / 14").kind).toBe("screen_protector");
  });
  it("grade mixte « A/B » jamais équivalent au grade A", () => {
    const mixed = sig("iPhone 13 Pro Used (HSO) - 128 GB / Silver / A/B", { brand: "apple", model: "iphone 13 pro", storage: "128gb", condition: "used", grade: "a" });
    const single = sig("iPhone 13 Pro reconditionné 128 Go grade A", { brand: "apple", model: "iphone 13 pro", storage: "128gb", condition: "used", grade: "a" });
    expect(mixed.grade).toBe("mix:a/b");
    expect(single.grade).toBe("a");
    expect(isEquivalent(mixed, single)).toBe(false);
  });
  it("pièce neuve : un état non précisé chez un grossiste de pièces vaut neuf ; batterie haute capacité à part", () => {
    expect(isEquivalent(sig("Baterie REPART pro iPhone 13", { condition: "new" }), sig("Batería para iPhone 13", { condition: "unknown" }))).toBe(false); // REPART = compatible
    expect(isEquivalent(sig("Baterie pro iPhone 13", { condition: "new" }), sig("Batería para iPhone 13", { condition: "unknown" }))).toBe(true);
    expect(isEquivalent(sig("Batería para iPhone 13 Capacidad Aumentada"), sig("Batería para iPhone 13"))).toBe(false);
    expect(isEquivalent(sig("Batterie iPhone 13 reconditionnée grade B"), sig("Batterie iPhone 13 neuve"))).toBe(false);
  });
});

describe("produits hors service (relevé eBay du 14/10/2026)", () => {
  const sig = (title: string) => productSignature({ title, brand: "apple", model: "iphone 13", storage: "128gb", condition: "used" });
  it("hors service, pour pièces, iCloud, « as is » : jamais comparés à un produit fonctionnel", () => {
    for (const t of ["Apple iPhone 13 bleu foncé 128GB (hors service)", "iPhone 13 128 Go HS écran cassé", "iPhone 13 128GB for parts", "iPhone 13 128 Go bloqué iCloud", "iPhone 13 d’occasion - 128GB / Mixed Color / Apple ASIS", "iPhone 13 128GB para piezas"]) {
      expect(sig(t).damaged).toBe(true);
      expect(isEquivalent(sig(t), sig("Apple iPhone 13 - 128 Go - Bleu (Déverrouillé)"))).toBe(false);
    }
  });
  it("pas de faux positif sur « Déverrouillé », « débloqué », « (HSO) », « 81 % »", () => {
    for (const t of ["Apple iPhone 13 - 128 Go - Bleu (Déverrouillé)", "Apple iPhone 13 128 Go Starlight débloqué excellent état 81 %", "iPhone 13 Used (HSO) - 128 GB / Black / B", "iPhone 13 128GB unlocked"]) expect(sig(t).damaged).toBe(false);
  });
});

describe("annonces multi-modèles (relevé eBay du 14/10/2026)", () => {
  it("« Écran pour iPhone X XS XR 11 12 13 14… » n'est comparable à rien", () => {
    const s = productSignature({ title: "Ecran Pour iPhone X XS XR 11 12 13 14 15 16 PRO MAX PLUS MINI LCD OLED +Outils", brand: "apple", model: "iphone 12" });
    expect(s.multiModel).toBe(true);
    expect(s.identified).toBe(false);
    expect(productSignature({ title: "Protector de cristal templado completo Iphone 13 / 13 PRO / 14", brand: "apple", model: "iphone 13" }).multiModel).toBe(true);
  });
  it("un seul modèle (capacité, mini, pro, %) reste comparable", () => {
    for (const t of ["Apple iPhone 13 128 Go Starlight débloqué excellent état 81 %", "Flex JC V1S para iPhone 13, 13 Mini", "Écran iPhone 12 Pro OLED", "iPhone 13 d’occasion - 512 Go / Blue / A+ (100% battery)"])
      expect(productSignature({ title: t, brand: "apple", model: "iphone 13" }).multiModel).toBe(false);
  });
});
