import { describe, expect, it } from "vitest";
import { computeSourcingStatus, isConnectedSource, isUsableNow, type StatusSourceInput } from "@/services/sourcing/status-summary";
import { SOURCING_CATALOG } from "@/integrations/sourcing/catalog";
import { SOURCE_ADAPTERS } from "@/integrations/sourcing/registry";

const adapters = SOURCE_ADAPTERS.map((a) => ({ key: a.key, access: a.access, method: a.method, verification: a.verification, search: a.capabilities.search }));
const src = (o: Partial<StatusSourceInput> & { id: string }): StatusSourceInput => ({ sourceType: "PUBLIC_WEB", status: "active", attested: true, robotsAllowed: true, adapterKey: "shopify-storefront", discovered: false, discoveredAccess: null, connectionStatus: null, ...o });

function value(items: ReturnType<typeof computeSourcingStatus>, key: string): number {
  return items.find((i) => i.key === key)!.value;
}

describe("état des sources (calculé, jamais codé en dur)", () => {
  it("catalogue et registre : chiffres issus du code", () => {
    const items = computeSourcingStatus({ catalog: SOURCING_CATALOG, adapters, sources: [], offersBySource: new Map() });
    expect(value(items, "documented")).toBe(SOURCING_CATALOG.length);
    expect(value(items, "verified")).toBe(SOURCING_CATALOG.filter((c) => c.status === "verified_official_snippets").length);
    expect(value(items, "adapters")).toBe(SOURCE_ADAPTERS.length);
    expect(items.find((i) => i.key === "adapters")!.detail).toMatch(/0 testé\(s\) en conditions réelles/);
    expect(value(items, "connected")).toBe(0);
    expect(value(items, "usable_now")).toBe(0);
    for (const i of items) expect(i.definition.length).toBeGreaterThan(20);
  });

  it("organisation : connecté ≠ offre disponible ; compte requis ; API / flux ; utilisable", () => {
    const sources = [
      src({ id: "shop" }),
      src({ id: "shop-not-attested", attested: false }),
      src({ id: "robots-ko", robotsAllowed: false }),
      src({ id: "paused", status: "paused" }),
      src({ id: "discovered", attested: false, status: "not_connected", adapterKey: null, discovered: true, discoveredAccess: "account" }),
      src({ id: "feed", sourceType: "CSV", adapterKey: null }),
      src({ id: "bigbuy", sourceType: "SUPPLIER_ACCOUNT", adapterKey: "bigbuy", connectionStatus: "connected" }),
      src({ id: "ingram", sourceType: "SUPPLIER_ACCOUNT", adapterKey: "ingram-micro", connectionStatus: "pending" }),
    ];
    const offers = new Map([
      ["shop", { withPrice: 3, withStock: 0 }],
      ["bigbuy", { withPrice: 2, withStock: 2 }],
      ["shop-not-attested", { withPrice: 5, withStock: 5 }],
    ]);
    const items = computeSourcingStatus({ catalog: [], adapters, sources, offersBySource: offers, orphanConnections: [{ connectorKey: "bigbuy", status: "pending" }] });
    expect(value(items, "connected")).toBe(sources.filter(isConnectedSource).length);
    expect(value(items, "connected")).toBe(4); // shop, robots-ko, feed, bigbuy (ingram : compte non testé)
    expect(value(items, "with_prices")).toBe(2); // une source non attestée ne compte pas
    expect(value(items, "with_stock")).toBe(1);
    expect(value(items, "account_required")).toBe(4); // bigbuy, ingram, découverte « compte », connexion orpheline
    expect(value(items, "api_or_feed")).toBe(2); // feed, bigbuy (official_api)
    expect(value(items, "usable_now")).toBe(2); // shop + bigbuy (connecté) ; ingram non testé
    const map = new Map(adapters.map((a) => [a.key, a] as const));
    expect(isUsableNow(src({ id: "x", adapterKey: "google-merchant-feed", attested: false }), map)).toBe(true); // flux public : pas d'attestation exigée
  });
});
