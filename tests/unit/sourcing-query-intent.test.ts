import { describe, expect, it } from "vitest";
import { criteriaFromParsedQuery, filterOffers, queryItemIntent, type CandidateOffer } from "@/domain/sourcing/offer-filter";
import { parseQuery } from "@/domain/sourcing/query-parser";

const now = new Date("2026-10-10T10:00:00Z");
function offer(id: string, title: string, brand: string | null = null): CandidateOffer {
  return { id, title, brand, model: "iphone 13", storage: null, color: null, grade: null, condition: "new", price: 50, currency: "EUR", status: "active", lastSeenAt: "2026-10-10T09:00:00Z", expiresAt: null, anomalies: [] } as unknown as CandidateOffer;
}

describe("intention de la requête (appareil, pièce, accessoire, lot)", () => {
  it("détecte la pièce ou l'accessoire cherché", () => {
    expect(queryItemIntent("écran iPhone 13 de remplacement")).toEqual({ kind: "spare_part", label: "écran" });
    expect(queryItemIntent("batterie iPhone 12")).toEqual({ kind: "spare_part", label: "batterie" });
    expect(queryItemIntent("coque iPhone 13")).toEqual({ kind: "accessory", label: "coque" });
    expect(queryItemIntent("lots de smartphones Samsung en gros")).toEqual({ kind: "lot", label: null });
    expect(queryItemIntent("iPhone 13 128 Go reconditionné grade B")).toEqual({ kind: "device", label: null });
  });

  it("« écran iPhone 13 » : les écrans sont retenus, les autres pièces et les appareils écartés ; marque du fabricant = avertissement", () => {
    const q = "ecran iphone 13";
    const criteria = criteriaFromParsedQuery(parseQuery(q), q);
    const r = filterOffers(criteria, [offer("ecran", "Ecran Soft Oled pour iPhone 13 - Premium", "Brico-phone"), offer("rack", "Rack SIM iPhone 13 Bleu"), offer("bat", "Batterie pour iPhone 13"), offer("tel", "Apple iPhone 13 128 Go Noir")], { now });
    expect(r.kept.map((k) => k.offer.id)).toEqual(["ecran"]);
    expect(r.kept[0]!.warnings.map((w) => w.code)).toContain("brand_mismatch");
  });

  it("recherche d'appareil inchangée : écrans et pièces toujours écartés", () => {
    const q = "iphone 13";
    const r = filterOffers(criteriaFromParsedQuery(parseQuery(q), q), [offer("ecran", "Ecran pour iPhone 13"), offer("tel", "Apple iPhone 13 128 Go")], { now });
    expect(r.kept.map((k) => k.offer.id)).toEqual(["tel"]);
  });
});
