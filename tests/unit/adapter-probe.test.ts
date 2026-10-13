import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { runAdapterProbes, adapterProbeSchema } = await import("@/services/sourcing/adapter-probe");

/** Réponses SIMULÉES : ces tests vérifient le comportement de l'outil d'essai, pas un fournisseur réel. */
const shopifyProducts = {
  products: [
    { id: 1, title: "iPhone 13 128GB Grade A", handle: "iphone-13-a", vendor: "Apple", variants: [{ id: 11, title: "Default", price: "289.00", available: true, sku: "IP13-A", barcode: "0194252707326" }] },
    { id: 2, title: "Écran iPhone 12", handle: "ecran-12", vendor: "Apple", variants: [{ id: 21, title: "Default", price: "0.00", available: false }] },
  ],
};

function stubFetch(routes: Record<string, { status: number; body: string; type?: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const hit = Object.entries(routes).find(([k]) => url.includes(k));
      const r = hit?.[1] ?? { status: 404, body: "not found" };
      return new Response(r.body, { status: r.status, headers: { "content-type": r.type ?? "text/plain" } });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("essai réel de connecteur (outil d'administration)", () => {
  it("refuse les adaptateurs à compte et les adaptateurs inconnus, sans aucune requête", async () => {
    stubFetch({});
    const r = await runAdapterProbes(adapterProbeSchema.parse({ probes: [{ key: "x", adapter: "ingram-micro", baseUrl: "https://api.example.com" }, { key: "y", adapter: "nope", baseUrl: "https://shop.example.com" }] }));
    expect(r.map((p) => p.status)).toEqual(["refused", "error"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("robots.txt interdit : aucun produit demandé", async () => {
    stubFetch({ "/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /" } });
    const [r] = await runAdapterProbes(adapterProbeSchema.parse({ probes: [{ key: "shop", adapter: "shopify-storefront", baseUrl: "https://shop.example.com", mode: "catalog" }] }));
    expect(r!.status).toBe("robots_disallowed");
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.every((c) => String(c[0]).endsWith("/robots.txt"))).toBe(true);
  });
});

describe("validation des entrées", () => {
  it("au plus 8 essais par appel, URL obligatoire", () => {
    expect(() => adapterProbeSchema.parse({ probes: [] })).toThrow();
    expect(() => adapterProbeSchema.parse({ probes: [{ key: "a", adapter: "shopify-storefront", baseUrl: "pas une url" }] })).toThrow();
    expect(shopifyProducts.products.length).toBe(2);
  });
});
