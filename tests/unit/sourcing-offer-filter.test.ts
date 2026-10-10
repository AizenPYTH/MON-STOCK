import { describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { criteriaFromParsedQuery, detectTitleIssue, filterOffers, gradeRank, type CandidateOffer, type FilterCriteria } from "@/domain/sourcing/offer-filter";

const NOW = new Date("2026-10-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

let seq = 0;
function offer(partial: Partial<CandidateOffer> = {}): CandidateOffer {
  seq++;
  return {
    id: partial.id ?? `o${seq}`,
    title: "Apple iPhone 13 128GB Grade A",
    brand: "apple",
    model: "iphone 13",
    storage: "128GB",
    color: null,
    grade: "A",
    condition: "refurbished",
    price: 300,
    status: "active",
    anomalies: [],
    lastSeenAt: hoursAgo(2),
    supplierVerified: true,
    ...partial,
  };
}

const iphone13: FilterCriteria = criteriaFromParsedQuery(parseQuery("iPhone 13 128 Go Grade A"));
const run = (offers: CandidateOffer[], criteria: FilterCriteria = iphone13) => filterOffers(criteria, offers, { now: NOW });
const reasonsOf = (r: ReturnType<typeof run>, id: string) => r.rejected.find((x) => x.offer.id === id)?.reasons.map((x) => x.code) ?? [];
const warningsOf = (r: ReturnType<typeof run>, id: string) => [...r.kept, ...r.rejected].find((x) => x.offer.id === id)?.warnings.map((x) => x.code) ?? [];

describe("criteriaFromParsedQuery", () => {
  it("l'état déduit d'un grade n'est pas un état explicitement demandé", () => {
    expect(iphone13).toEqual({ brand: "apple", model: "iphone 13", storage: "128GB", color: null, grade: "A", condition: "unknown", itemKind: "device", itemLabel: null });
    expect(criteriaFromParsedQuery(parseQuery("iPhone 13 128GB neuf")).condition).toBe("new");
  });
});

describe("identité produit", () => {
  it("rejette iPhone 13 Pro et iPhone 13 mini pour une recherche iPhone 13", () => {
    const r = run([offer({ id: "ok" }), offer({ id: "pro", model: "iphone 13 pro", title: "iPhone 13 Pro 128GB Grade A" }), offer({ id: "mini", model: "iphone 13 mini", title: "iPhone 13 mini 128GB" })]);
    expect(r.kept.map((k) => k.offer.id)).toEqual(["ok"]);
    expect(reasonsOf(r, "pro")).toEqual(["model_mismatch"]);
    expect(r.rejected.find((x) => x.offer.id === "pro")!.reasons[0]!.message).toBe("Modèle différent : iPhone 13 Pro au lieu de iPhone 13");
    expect(reasonsOf(r, "mini")).toEqual(["model_mismatch"]);
    expect(r.rejectionCounts.model_mismatch).toBe(2);
  });
  it("rejette une marque différente", () => {
    const r = run([offer({ id: "s", brand: "samsung", model: "iphone 13" })]);
    expect(reasonsOf(r, "s")).toContain("brand_mismatch");
  });
  it("modèle non identifié : conservé avec avertissement", () => {
    const r = run([offer({ id: "x", model: "telephone reconditionne", modelInferred: true, title: "Téléphone reconditionné 128GB" })]);
    expect(r.kept).toHaveLength(1);
    expect(warningsOf(r, "x")).toContain("model_unknown");
  });
  it("rejette un stockage différent, avertit si inconnu", () => {
    const r = run([offer({ id: "256", storage: "256GB" }), offer({ id: "nul", storage: null })]);
    expect(reasonsOf(r, "256")).toEqual(["storage_mismatch"]);
    expect(r.rejected[0]!.reasons[0]!.message).toBe("Stockage différent : 256GB au lieu de 128GB");
    expect(warningsOf(r, "nul")).toContain("storage_unknown");
  });
  it("couleur différente : simple avertissement", () => {
    const r = run([offer({ id: "c", color: "red" })], { ...iphone13, color: "blue" });
    expect(r.kept).toHaveLength(1);
    expect(warningsOf(r, "c")).toContain("color_mismatch");
  });
});

describe("grade et état", () => {
  it("gradeRank", () => {
    expect(gradeRank("A+")).toBe(0.5);
    expect(gradeRank("A")).toBe(1);
    expect(gradeRank("b")).toBe(2);
    expect(gradeRank("A/B")).toBe(2);
    expect(gradeRank("C")).toBe(3);
    expect(gradeRank("Premium")).toBeNull();
    expect(gradeRank(null)).toBeNull();
  });
  it("rejette un grade inférieur, garde un grade supérieur, signale un grade inconnu", () => {
    const r = run([offer({ id: "B", grade: "B" }), offer({ id: "A+", grade: "A+" }), offer({ id: "unk", grade: null }), offer({ id: "AB", grade: "A/B" })]);
    expect(reasonsOf(r, "B")).toEqual(["grade_lower"]);
    expect(r.rejected.find((x) => x.offer.id === "B")!.reasons[0]!.message).toBe("Grade inférieur : B au lieu de A minimum");
    expect(reasonsOf(r, "AB")).toEqual(["grade_lower"]);
    expect(r.kept.map((k) => k.offer.id)).toEqual(["A+", "unk"]);
    const unk = r.kept.find((k) => k.offer.id === "unk")!;
    expect(unk.warnings.map((w) => w.message)).toContain("Grade non communiqué");
  });
  it("produit neuf sans grade : conservé, grade non applicable", () => {
    const r = run([offer({ id: "n", grade: null, condition: "new" })]);
    expect(r.kept).toHaveLength(1);
    expect(warningsOf(r, "n")).toContain("grade_not_applicable");
  });
  it("état explicitement demandé : neuf ≠ reconditionné ; état inconnu signalé", () => {
    const crit = criteriaFromParsedQuery(parseQuery("iPhone 13 128GB neuf"));
    const r = filterOffers(crit, [offer({ id: "ref", grade: null }), offer({ id: "new", condition: "new", grade: null }), offer({ id: "unk", condition: "unknown", grade: null })], { now: NOW });
    expect(reasonsOf(r, "ref")).toEqual(["condition_mismatch"]);
    expect(r.rejected[0]!.reasons[0]!.message).toBe("État différent : Reconditionné au lieu de Neuf");
    expect(r.kept.map((k) => k.offer.id)).toEqual(["new", "unk"]);
    expect(warningsOf(r, "unk")).toContain("condition_unknown");
  });
  it("état non demandé : aucun contrôle d'état", () => {
    const r = run([offer({ id: "new", condition: "new", grade: null })], { ...iphone13, grade: null });
    expect(r.kept).toHaveLength(1);
  });
});

describe("accessoires, pièces et appareils inutilisables", () => {
  const cases: Array<[string, string]> = [
    ["Coque silicone iPhone 13", "accessory"],
    ["iPhone 13 Case MagSafe", "accessory"],
    ["Écran OLED pour iPhone 13", "spare_part"],
    ["Vitre arrière iPhone 13 bleu", "spare_part"],
    ["Batterie iPhone 13 3227 mAh", "spare_part"],
    ["Câble USB-C vers Lightning iPhone 13", "accessory"],
    ["Boîte vide iPhone 13 128GB", "empty_box"],
    ["iPhone 13 128GB for parts", "defective"],
    ["iPhone 13 128GB HS", "defective"],
    ["iPhone 13 128 Go pour pièces", "defective"],
    ["iPhone 13 iCloud lock 128GB", "locked"],
    ["iPhone 13 128GB bloqué", "locked"],
    ["iPhone 13 écran cassé", "defective"],
  ];
  for (const [title, issue] of cases) {
    it(`« ${title} » → ${issue}`, () => {
      expect(detectTitleIssue(title, "iphone 13")?.issue).toBe(issue);
      const r = run([offer({ id: "t", title })]);
      expect(reasonsOf(r, "t")).toContain(issue);
    });
  }
  const safe = ["Apple iPhone 13 128GB Grade A - batterie 89 %", "iPhone 13 128 Go écran 6,1 pouces Super Retina", "iPhone 13 128GB débloqué tout opérateur", "iPhone 13 128GB unlocked", "Apple iPhone 13 128GB Grade A Gorilla Glass"];
  for (const title of safe) {
    it(`« ${title} » reste un téléphone`, () => {
      expect(detectTitleIssue(title, "iphone 13")).toBeNull();
      expect(run([offer({ title })]).kept).toHaveLength(1);
    });
  }
  it("message explicite", () => {
    const r = run([offer({ id: "c", title: "Coque iPhone 13" })]);
    expect(r.rejected[0]!.reasons[0]!.message).toBe("Accessoire détecté dans le titre (« coque ») : ce n'est pas le produit recherché");
  });
});

describe("statut, anomalies, fraîcheur", () => {
  it("offre expirée (statut ou date d'expiration)", () => {
    const r = run([offer({ id: "e1", status: "expired" }), offer({ id: "e2", expiresAt: hoursAgo(1) }), offer({ id: "ok", expiresAt: new Date(NOW.getTime() + 3_600_000) })]);
    expect(reasonsOf(r, "e1")).toEqual(["expired"]);
    expect(reasonsOf(r, "e2")).toEqual(["expired"]);
    expect(r.kept.map((k) => k.offer.id)).toEqual(["ok"]);
  });
  it("statut rejeté", () => {
    expect(reasonsOf(run([offer({ id: "r", status: "rejected" })]), "r")).toContain("status_rejected");
  });
  it("anomalies suspectes → rejet ; anomalies mineures → avertissement", () => {
    const r = run([
      offer({ id: "low", status: "suspicious", anomalies: [{ code: "price_too_low", severity: "warning", message: "Prix anormalement bas par rapport à l'historique" }] }),
      offer({ id: "blk", anomalies: [{ code: "title_missing", severity: "blocking" }] }),
      offer({ id: "url", status: "suspicious", anomalies: [{ code: "url_invalid", severity: "warning", message: "URL invalide" }] }),
      offer({ id: "flag", status: "suspicious" }),
    ]);
    expect(reasonsOf(r, "low")).toEqual(["suspicious"]);
    expect(r.rejected.find((x) => x.offer.id === "low")!.reasons[0]!.message).toBe("Anomalie suspecte : Prix anormalement bas par rapport à l'historique");
    expect(reasonsOf(r, "blk")).toEqual(["suspicious"]);
    expect(reasonsOf(r, "flag")).toEqual(["suspicious"]);
    expect(r.kept.map((k) => k.offer.id)).toEqual(["url"]);
    expect(warningsOf(r, "url")).toContain("anomaly_warning");
  });
  it("donnée > 30 jours rejetée ; date inconnue signalée", () => {
    const r = run([offer({ id: "old", lastSeenAt: hoursAgo(31 * 24) }), offer({ id: "edge", lastSeenAt: hoursAgo(29 * 24) }), offer({ id: "nul", lastSeenAt: null })]);
    expect(reasonsOf(r, "old")).toEqual(["stale"]);
    expect(r.rejected[0]!.reasons[0]!.message).toBe("Donnée trop ancienne : vue il y a 31 jours (maximum 30 jours)");
    expect(r.kept.map((k) => k.offer.id)).toEqual(["edge", "nul"]);
    expect(warningsOf(r, "nul")).toContain("last_seen_unknown");
  });
  it("cumule plusieurs raisons", () => {
    const r = run([offer({ id: "m", model: "iphone 13 pro", storage: "256GB", grade: "C", status: "expired" })]);
    expect(reasonsOf(r, "m")).toEqual(expect.arrayContaining(["expired", "model_mismatch", "storage_mismatch", "grade_lower"]));
  });
});

describe("prix aberrants (médiane du résultat)", () => {
  const base = () => [offer({ id: "a", price: 300 }), offer({ id: "b", price: 310 }), offer({ id: "c", price: 290 }), offer({ id: "d", price: 305 })];
  it("< 40 % de la médiane chez un fournisseur vérifié : conservé avec avertissement", () => {
    const r = run([...base(), offer({ id: "cheap", price: 100, supplierVerified: true })]);
    expect(r.referenceMedian).toBe(300);
    expect(r.kept.map((k) => k.offer.id)).toContain("cheap");
    expect(r.kept.find((k) => k.offer.id === "cheap")!.warnings[0]!.message).toBe("Prix anormalement bas, à vérifier : 33 % de la médiane du résultat");
  });
  it("< 40 % chez un fournisseur non vérifié : rejeté", () => {
    const r = run([...base(), offer({ id: "cheap", price: 100, supplierVerified: false })]);
    expect(reasonsOf(r, "cheap")).toEqual(["price_low_unverified"]);
  });
  it("> 250 % de la médiane : rejeté ; 228 % : conservé", () => {
    const r = run([...base(), offer({ id: "hi", price: 800 }), offer({ id: "ok", price: 700 })]);
    expect(r.referenceMedian).toBe(307.5);
    expect(reasonsOf(r, "hi")).toEqual(["price_high"]);
    expect(r.kept.map((k) => k.offer.id)).toContain("ok");
  });
  it("la médiane ignore les offres déjà rejetées (coques à 10 €)", () => {
    const r = run([...base(), offer({ id: "case1", title: "Coque iPhone 13", price: 10 }), offer({ id: "case2", title: "Coque iPhone 13", price: 12 }), offer({ id: "case3", title: "Coque iPhone 13", price: 9 })]);
    expect(r.referenceMedian).toBe(302.5);
  });
  it("moins de 3 prix : pas de détection (aucune médiane inventée)", () => {
    const r = run([offer({ id: "a", price: 300 }), offer({ id: "b", price: 50, supplierVerified: false })]);
    expect(r.referenceMedian).toBeNull();
    expect(r.kept).toHaveLength(2);
  });
  it("prix inconnu : conservé, non comparable", () => {
    const r = run([...base(), offer({ id: "np", price: null })]);
    expect(warningsOf(r, "np")).toContain("price_unknown");
  });
  it("résultat vide", () => {
    expect(run([])).toEqual({ kept: [], rejected: [], referenceMedian: null, rejectionCounts: {} });
  });
});
