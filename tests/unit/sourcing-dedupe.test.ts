import { describe, expect, it } from "vitest";
import { dedupeOffers, dedupeKey } from "@/domain/sourcing/dedupe";
import { parseStoredProvenance, withProvenance } from "@/services/sourcing/adapter-runtime";

const item = (id: string, supplierId: string, productKey: string | null, comparablePrice: number | null, lastSeenAt = "2026-10-08T10:00:00Z") => ({ id, supplierId, productKey, comparablePrice, lastSeenAt });

describe("déduplication des offres", () => {
  it("conserve une offre par (fournisseur, produit) : la moins chère, et compte les doublons", () => {
    const { kept, collapsed } = dedupeOffers([item("a", "s1", "p1", 230), item("b", "s1", "p1", 229), item("c", "s1", "p1", 231), item("d", "s2", "p1", 240)]);
    expect(kept.map((k) => k.id)).toEqual(["b", "d"]);
    expect(collapsed.get("b")).toBe(2);
    expect(collapsed.has("d")).toBe(false);
  });

  it("un prix inconnu perd face à un prix connu ; à prix égal, la plus récente est conservée", () => {
    const r1 = dedupeOffers([item("a", "s1", "p1", null), item("b", "s1", "p1", 300)]);
    expect(r1.kept.map((k) => k.id)).toEqual(["b"]);
    const r2 = dedupeOffers([item("old", "s1", "p1", 100, "2026-10-01T00:00:00Z"), item("new", "s1", "p1", 100, "2026-10-08T00:00:00Z")]);
    expect(r2.kept.map((k) => k.id)).toEqual(["new"]);
    expect(r2.collapsed.get("new")).toBe(1);
  });

  it("une offre sans clé produit n'est jamais fusionnée et l'ordre d'apparition est préservé", () => {
    const { kept, collapsed } = dedupeOffers([item("x", "s1", null, 10), item("y", "s1", null, 10), item("a", "s1", "p1", 5), item("z", "s1", "p2", 1)]);
    expect(kept.map((k) => k.id)).toEqual(["x", "y", "a", "z"]);
    expect(collapsed.size).toBe(0);
    expect(dedupeKey({ supplierId: "s", productKey: null })).toBeNull();
    expect(dedupeKey({ supplierId: "s", productKey: "p" })).toBe("s|p");
  });
});

describe("provenance des offres", () => {
  it("enveloppe puis relit la provenance (méthode, adaptateur, horodatage, URL de requête)", () => {
    const traced = withProvenance({ externalOfferId: "1", title: "x", price: 1, currency: "EUR", url: null, raw: { request_url: "https://h.example/api?q=1", foo: "bar" } }, { adapterKey: "shopify-storefront", method: "public_json", retrievedAt: "2026-10-08T10:00:00.000Z", requestUrl: null, sourceUrl: "https://h.example/p/1" });
    expect(traced.url).toBe("https://h.example/p/1");
    const raw = traced.raw as { provenance: Record<string, unknown>; payload: unknown };
    expect(raw.provenance).toEqual({ adapter: "shopify-storefront", adapter_key: "shopify-storefront", method: "public_json", retrieved_at: "2026-10-08T10:00:00.000Z", request_url: "https://h.example/api?q=1", source_url: "https://h.example/p/1" });
    expect(raw.payload).toEqual({ request_url: "https://h.example/api?q=1", foo: "bar" });
    expect(parseStoredProvenance(traced.raw as never)).toEqual({ method: "public_json", adapterKey: "shopify-storefront", retrievedAt: "2026-10-08T10:00:00.000Z", requestUrl: "https://h.example/api?q=1" });
    expect(parseStoredProvenance({ foo: 1 })).toBeNull();
    expect(parseStoredProvenance(null)).toBeNull();
  });
});
