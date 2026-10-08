import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import {
  BRAVE_ENDPOINT,
  DISCOVERY_DISABLED_MESSAGE,
  MAX_DISCOVERY_QUERIES,
  clearDiscoveryCache,
  createBraveProvider,
  createWebSearchProvider,
  parseBraveResponse,
  readDiscoveryConfig,
  runDiscoverySearches,
  type WebSearchProvider,
  type WebSearchResult,
} from "@/services/sourcing/discovery/web-search-providers";
import { analyzePage, candidateName, classifySupplierType, exclusionReason, probeCandidate, registrableDomain, screenSearchResults, suggestAdapter, type DiscoveryCandidate } from "@/services/sourcing/discovery/candidate-analyzer";
import { createSupabaseDiscoveryStore, discoverSources, type DiscoveryStore } from "@/services/sourcing/discovery/discovery-service";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

const UA = "MonStockBot/0.1 (+https://example.com/bot)";
const publicResolver = async () => [{ address: "93.184.216.34" }];
const noSleep = async () => undefined;
const NOW = new Date("2026-10-08T12:00:00Z");

type Route = { status?: number; body: string; contentType?: string } | ((url: string, init?: RequestInit) => Response);

/** fetch simulé : réponses par URL exacte, 404 sinon ; journalise les URLs appelées. */
function mockFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = routes[url];
    if (!r) return new Response("not found", { status: 404 });
    if (typeof r === "function") return r(url, init);
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.contentType ?? "text/html; charset=utf-8" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// --- fixtures construites d'après les formats documentés (aucun résultat réel) ---
const BRAVE_FIXTURE = {
  type: "search",
  query: { original: "iPhone 13 grossiste reconditionné" },
  web: {
    type: "search",
    results: [
      { title: "Grossiste iPhone reconditionné pour professionnels | PhoneGros", url: "https://www.phonegros.example/iphone-13", description: "<strong>Grossiste</strong> smartphones reconditionnés, vente en gros B2B, MOQ 10." },
      { title: "iPhone 13 128 Go - Amazon.fr", url: "https://www.amazon.fr/dp/B09G9", description: "Livraison gratuite" },
      { title: "Comparer les prix iPhone 13", url: "https://www.idealo.fr/prechcat.html?q=iphone+13", description: "Comparateur" },
      { title: "Back Market Pro — Marketplace B2B", url: "https://pro.backmarket.fr/", description: "The leading B2B marketplace for verified refurbished tech" },
      { title: "Lot déstockage smartphones — StockLots", url: "https://stocklots.example/lots/iphone", description: "Palettes et lots de déstockage" },
      { title: "Mon blog tech", url: "https://blog-tech.example/iphone-13-test", description: "Test complet de l'iPhone 13" },
      { title: "Invalid", url: "javascript:alert(1)" },
      { url: 42 },
    ],
  },
};

const SHOPIFY_HTML = `<!doctype html><html><head><link rel="stylesheet" href="https://cdn.shopify.com/s/files/theme.css"><script>window.Shopify = {};</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"iPhone 13 128GB Grade A","offers":{"@type":"Offer","price":"289.00","priceCurrency":"EUR"}}</script></head><body><h1>iPhone 13</h1></body></html>`;
const WOO_HTML = `<html><head><link rel="https://api.w.org/" href="https://shop.example/wp-json/"><script src="/wp-content/plugins/woocommerce/assets/js/frontend.js"></script></head><body class="woocommerce"><p>Produits</p></body></html>`;
const JSONLD_HTML = `<html><head><script type="application/ld+json">[{"@type":"Organization","name":"X"},{"@type":"Product","name":"Galaxy S22","offers":{"@type":"Offer","price":199,"priceCurrency":"EUR"}}]</script></head><body>Galaxy</body></html>`;
const LOGIN_PRICE_HTML = `<html><body><h1>iPhone 13 128 Go</h1><p>Connectez-vous pour voir les prix. Réservé aux professionnels.</p></body></html>`;
const CF_HTML = `<html><head><title>Just a moment...</title></head><body><div id="cf-challenge-running"></div></body></html>`;
const RECAPTCHA_CONTENT_HTML = `<html><head><script type="application/ld+json">{"@type":"Product","name":"Pixel 7","offers":{"price":"300"}}</script></head><body>${"Catalogue professionnel de smartphones. ".repeat(80)}<form><div class="g-recaptcha"></div></form></body></html>`;
const RECAPTCHA_THIN_HTML = `<html><body><p>Vérifiez que vous n'êtes pas un robot</p><div class="g-recaptcha" data-sitekey="x"></div></body></html>`;
const SHOPIFY_PRODUCTS_JSON = JSON.stringify({ products: [{ id: 1, title: "iPhone 13", handle: "iphone-13", variants: [{ id: 11, price: "289.00", available: true }] }] });

beforeEach(() => clearDiscoveryCache());

describe("configuration", () => {
  it("aucun fournisseur → découverte désactivée, message honnête", () => {
    expect(readDiscoveryConfig({})).toEqual({ enabled: false, provider: "none", apiKey: null, message: DISCOVERY_DISABLED_MESSAGE });
    expect(readDiscoveryConfig({ SOURCING_DISCOVERY_PROVIDER: "none", BRAVE_SEARCH_API_KEY: "abcdefghij" }).enabled).toBe(false);
    expect(createWebSearchProvider({}).provider).toBeNull();
  });
  it("brave sans clé → désactivée", () => {
    const c = readDiscoveryConfig({ SOURCING_DISCOVERY_PROVIDER: "brave" });
    expect(c.enabled).toBe(false);
    expect(c.message).toBe(`${DISCOVERY_DISABLED_MESSAGE} (BRAVE_SEARCH_API_KEY manquante)`);
  });
  it("valeur invalide → désactivée sans exception", () => {
    const c = readDiscoveryConfig({ SOURCING_DISCOVERY_PROVIDER: "google" });
    expect(c.enabled).toBe(false);
    expect(c.message.startsWith(DISCOVERY_DISABLED_MESSAGE)).toBe(true);
  });
  it("brave + clé → activée (insensible à la casse)", () => {
    const c = readDiscoveryConfig({ SOURCING_DISCOVERY_PROVIDER: " Brave ", BRAVE_SEARCH_API_KEY: "BSA-test-key-123" });
    expect(c).toMatchObject({ enabled: true, provider: "brave", apiKey: "BSA-test-key-123" });
    expect(createWebSearchProvider({ SOURCING_DISCOVERY_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: "BSA-test-key-123" }).provider?.key).toBe("brave");
  });
});

describe("Brave Search API", () => {
  it("parseBraveResponse : web.results[] {url,title,description}, balises retirées, entrées invalides ignorées", () => {
    const results = parseBraveResponse(BRAVE_FIXTURE);
    expect(results).toHaveLength(6);
    expect(results[0]).toEqual({ url: "https://www.phonegros.example/iphone-13", title: "Grossiste iPhone reconditionné pour professionnels | PhoneGros", description: "Grossiste smartphones reconditionnés, vente en gros B2B, MOQ 10." });
    expect(parseBraveResponse({ type: "search" })).toEqual([]);
    expect(() => parseBraveResponse("oops")).toThrow(/inattendue/);
  });
  it("requête GET documentée : q, count=20, country=fr, en-têtes Accept et X-Subscription-Token", async () => {
    const { impl, calls } = mockFetch({});
    (impl as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(BRAVE_FIXTURE), { status: 200, headers: { "content-type": "application/json" } });
    });
    const provider = createBraveProvider("BSA-key-1234", { fetchImpl: impl, resolver: publicResolver, userAgent: UA });
    const results = await provider.search("iPhone 13 grossiste");
    expect(results).toHaveLength(6);
    const u = new URL(calls[0]!.url);
    expect(`${u.origin}${u.pathname}`).toBe(BRAVE_ENDPOINT);
    expect(u.searchParams.get("q")).toBe("iPhone 13 grossiste");
    expect(u.searchParams.get("count")).toBe("20");
    expect(u.searchParams.get("country")).toBe("fr");
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers["X-Subscription-Token"]).toBe("BSA-key-1234");
    expect(headers.Accept).toBe("application/json");
    expect(headers["User-Agent"]).toBe(UA);
  });
  it("erreurs HTTP explicites (clé refusée, quota)", async () => {
    const make = (status: number) => createBraveProvider("BSA-key-1234", { fetchImpl: (async () => new Response("{}", { status })) as unknown as typeof fetch, resolver: publicResolver });
    await expect(make(401).search("x")).rejects.toThrow(/clé API refusée/);
    await expect(make(429).search("x")).rejects.toThrow(/limite de requêtes/);
    await expect(make(500).search("x")).rejects.toThrow(/HTTP 500/);
  });
});

describe("runDiscoverySearches", () => {
  const fakeProvider = (impl: (q: string) => Promise<WebSearchResult[]>): WebSearchProvider & { search: ReturnType<typeof vi.fn> } => ({ key: "fake", label: "Fake", search: vi.fn(impl) });

  it("au plus 6 requêtes, dédupliquées, espacées", async () => {
    const p = fakeProvider(async (q) => [{ url: `https://x.example/${encodeURIComponent(q)}`, title: q, description: null }]);
    const sleep = vi.fn(noSleep);
    const queries = ["a", "A ", "b", "c", "d", "e", "f", "g", "h"];
    const runs = await runDiscoverySearches(p, queries, { sleep, minIntervalMs: 1100 });
    expect(runs.map((r) => r.query)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(runs).toHaveLength(MAX_DISCOVERY_QUERIES);
    expect(p.search).toHaveBeenCalledTimes(6);
    expect(sleep).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledWith(1100);
  });
  it("cache mémoire 24 h par requête", async () => {
    let t = NOW.getTime();
    const now = () => new Date(t);
    const p = fakeProvider(async () => [{ url: "https://x.example/", title: "x", description: null }]);
    await runDiscoverySearches(p, ["iphone 13 grossiste"], { now, sleep: noSleep });
    const second = await runDiscoverySearches(p, ["iPhone 13  grossiste"], { now, sleep: noSleep });
    expect(second[0]!.cached).toBe(true);
    expect(p.search).toHaveBeenCalledTimes(1);
    t += 24 * 3_600_000 + 1;
    const third = await runDiscoverySearches(p, ["iphone 13 grossiste"], { now, sleep: noSleep });
    expect(third[0]!.cached).toBe(false);
    expect(p.search).toHaveBeenCalledTimes(2);
  });
  it("une erreur isolée n'arrête pas les autres ; quota atteint → arrêt", async () => {
    const p = fakeProvider(async (q) => {
      if (q === "b") throw new Error("Brave Search : HTTP 500.");
      if (q === "c") throw new Error("Brave Search : limite de requêtes atteinte (HTTP 429), réessayez plus tard.");
      return [];
    });
    const runs = await runDiscoverySearches(p, ["a", "b", "c", "d"], { sleep: noSleep });
    expect(runs.map((r) => r.error === null)).toEqual([true, false, false, false]);
    expect(p.search).toHaveBeenCalledTimes(3);
    expect(runs[3]!.error).toMatch(/limite de requêtes/);
  });
});

describe("domaines et exclusions", () => {
  it("registrableDomain", () => {
    expect(registrableDomain("www.phonegros.example")).toBe("phonegros.example");
    expect(registrableDomain("shop.grossiste.fr")).toBe("grossiste.fr");
    expect(registrableDomain("https://www.amazon.co.uk/dp/1")).toBe("amazon.co.uk");
    expect(registrableDomain("pro.backmarket.fr")).toBe("backmarket.fr");
    expect(registrableDomain("93.184.216.34")).toBeNull();
    expect(registrableDomain("localhost")).toBeNull();
  });
  it("exclut marketplaces grand public, comparateurs, moteurs, réseaux sociaux, médias (toutes extensions)", () => {
    for (const host of ["www.amazon.fr", "amazon.de", "www.amazon.co.uk", "www.ebay.fr", "www.backmarket.fr", "www.leboncoin.fr", "www.google.fr", "facebook.com", "www.youtube.com", "fr.wikipedia.org", "www.idealo.fr", "ledenicheur.fr", "www.cdiscount.com"]) {
      expect(exclusionReason(host), host).not.toBeNull();
    }
    expect(exclusionReason("www.idealo.fr")).toBe("Comparateur de prix / bons plans");
  });
  it("Back Market Pro (B2B) n'est pas exclu ; un grossiste inconnu non plus", () => {
    expect(exclusionReason("pro.backmarket.fr")).toBeNull();
    expect(exclusionReason("www.grossiste-phone.fr")).toBeNull();
  });
  it("nom du candidat", () => {
    expect(candidateName("Grossiste iPhone reconditionné | PhoneGros", "phonegros.fr")).toBe("PhoneGros");
    expect(candidateName("Accueil", "grossiste-phone.fr")).toBe("Grossiste Phone");
  });
});

describe("classifySupplierType", () => {
  it("grossiste / distributeur / reconditionneur / déstockage / broker / marketplace B2B", () => {
    expect(classifySupplierType("Grossiste téléphonie", "Vente en gros aux professionnels", "https://a.fr/").type).toBe("wholesaler");
    expect(classifySupplierType("Distributeur IT", "Distribution B2B", "https://a.fr/").type).toBe("distributor");
    expect(classifySupplierType("Reconditionneur smartphones", "Refurbisher certifié, revendeurs", "https://a.fr/").type).toBe("refurbisher");
    expect(classifySupplierType("Lots de déstockage", "Palettes, surplus", "https://a.fr/").type).toBe("liquidation");
    expect(classifySupplierType("Phone broker", "Global traders", "https://a.com/").type).toBe("broker");
    expect(classifySupplierType("Marketplace B2B", "Plateforme B2B pour revendeurs", "https://a.com/").type).toBe("b2b_marketplace");
  });
  it("confiance croissante avec les indices ; URL prise en compte", () => {
    const one = classifySupplierType("Grossiste", null, "https://a.fr/");
    const many = classifySupplierType("Grossiste vente en gros", "B2B, revendeurs, MOQ", "https://a.fr/wholesale");
    expect(many.confidence).toBeGreaterThan(one.confidence);
    expect(many.signals).toEqual(expect.arrayContaining(["grossiste", "vente en gros", "wholesale", "b2b", "moq"]));
    expect(classifySupplierType("Accueil", null, "https://site.fr/grossiste-iphone").type).toBe("wholesaler");
  });
  it("aucun indice B2B → non pertinent ; « reconditionné » seul → boutique grand public probable", () => {
    expect(classifySupplierType("Test iPhone 13", "Notre avis", "https://blog.fr/").b2bRelevant).toBe(false);
    const weak = classifySupplierType("iPhone 13 reconditionné pas cher", null, "https://shop.fr/");
    expect(weak.type).toBe("refurbisher");
    expect(weak.b2bRelevant).toBe(false);
  });
});

describe("screenSearchResults", () => {
  it("garde les domaines B2B, un candidat par domaine, rejets expliqués", () => {
    const results = parseBraveResponse(BRAVE_FIXTURE).map((r) => ({ ...r, query: "iPhone 13 grossiste reconditionné" }));
    results.push({ url: "https://www.phonegros.example/autre", title: "Autre page", description: null, query: "q2" });
    const { candidates, rejected } = screenSearchResults(results);
    expect(candidates.map((c) => c.domain).sort()).toEqual(["phonegros.example", "pro.backmarket.fr", "stocklots.example"]);
    const pg = candidates.find((c) => c.domain === "phonegros.example")!;
    expect(pg).toMatchObject({ origin: "https://www.phonegros.example", supplierType: "wholesaler", name: "PhoneGros", sampleUrl: "https://www.phonegros.example/iphone-13" });
    expect(candidates.find((c) => c.domain === "pro.backmarket.fr")!.supplierType).toBe("b2b_marketplace");
    expect(candidates.find((c) => c.domain === "stocklots.example")!.supplierType).toBe("liquidation");
    expect(rejected.map((r) => [r.domain, r.reason])).toEqual([
      ["amazon.fr", "Exclu : Marketplace / enseigne grand public"],
      ["idealo.fr", "Exclu : Comparateur de prix / bons plans"],
      ["blog-tech.example", "Aucun indice B2B (grossiste, distributeur, reconditionneur, déstockage, broker…)"],
    ]);
  });
});

describe("analyzePage", () => {
  const page = (text: string, status = 200, contentType = "text/html") => analyzePage({ status, text, contentType });
  it("Shopify (cdn.shopify.com) + JSON-LD prix public → shopify-storefront", () => {
    const a = page(SHOPIFY_HTML);
    expect(a).toMatchObject({ platform: "shopify", access: "public", priceVisibility: "public", jsonLdProduct: true });
    expect(suggestAdapter(a.platform, a.access)).toBe("shopify-storefront");
  });
  it("Shopify via la forme /products.json", () => {
    expect(page(SHOPIFY_PRODUCTS_JSON, 200, "application/json")).toMatchObject({ platform: "shopify", priceVisibility: "public" });
  });
  it("WooCommerce → woocommerce-store", () => {
    const a = page(WOO_HTML);
    expect(a.platform).toBe("woocommerce");
    expect(suggestAdapter(a.platform, a.access)).toBe("woocommerce-store");
  });
  it("JSON-LD Product seul → jsonld-public", () => {
    const a = page(JSONLD_HTML);
    expect(a).toMatchObject({ platform: "jsonld", priceVisibility: "public" });
    expect(suggestAdapter(a.platform, a.access)).toBe("jsonld-public");
  });
  it("« connectez-vous pour voir les prix » → Compte requis, prix après connexion, aucun adaptateur", () => {
    const a = page(LOGIN_PRICE_HTML);
    expect(a).toMatchObject({ access: "account", priceVisibility: "after_login" });
    expect(suggestAdapter("shopify", a.access)).toBeNull();
  });
  it("défi Cloudflare → protégé, jamais contourné", () => {
    const a = page(CF_HTML, 503);
    expect(a.access).toBe("protected");
    expect(a.signals[0]).toBe("Protection détectée : défi Cloudflare (aucun contournement)");
  });
  it("reCAPTCHA sur un formulaire d'une page riche ≠ protection ; page CAPTCHA seule = protégée", () => {
    expect(page(RECAPTCHA_CONTENT_HTML)).toMatchObject({ access: "public", platform: "jsonld" });
    expect(page(RECAPTCHA_THIN_HTML).access).toBe("protected");
  });
  it("HTTP 401 / 403", () => {
    expect(page("", 401).access).toBe("account");
    expect(page("Forbidden", 403).access).toBe("protected");
  });
});

describe("probeCandidate", () => {
  const candidate: DiscoveryCandidate = { domain: "shop.example", host: "shop.example", origin: "https://shop.example", name: "Shop", sampleUrl: "https://shop.example/collections/iphone", title: "Grossiste", description: null, query: "q", supplierType: "wholesaler", typeConfidence: 0.6, signals: ["grossiste"] };

  it("robots.txt interdit → aucune requête de page", async () => {
    const { impl, calls } = mockFetch({ "https://shop.example/robots.txt": { body: "User-agent: *\nDisallow: /collections/", contentType: "text/plain" } });
    const p = await probeCandidate(candidate, { userAgent: UA, fetchImpl: impl, resolver: publicResolver, sleep: noSleep });
    expect(p.robots).toBe("disallowed");
    expect(p.robotsDetail).toBe("robots.txt interdit (Disallow: /collections/) : aucune requête effectuée.");
    expect(p.probed).toBe(false);
    expect(p.access).toBe("unknown");
    expect(calls.map((c) => c.url)).toEqual(["https://shop.example/robots.txt"]);
  });
  it("robots.txt absent (404) → une seule page sondée", async () => {
    const { impl, calls } = mockFetch({ "https://shop.example/collections/iphone": { body: SHOPIFY_HTML } });
    const p = await probeCandidate(candidate, { userAgent: UA, fetchImpl: impl, resolver: publicResolver, sleep: noSleep });
    expect(p).toMatchObject({ robots: "missing", probed: true, httpStatus: 200, platform: "shopify", access: "public", suggestedAdapter: "shopify-storefront" });
    expect(calls.map((c) => c.url)).toEqual(["https://shop.example/robots.txt", "https://shop.example/collections/iphone"]);
  });
  it("robots.txt en erreur → prudence, aucune requête de page", async () => {
    const { impl, calls } = mockFetch({ "https://shop.example/robots.txt": { status: 500, body: "err" } });
    const p = await probeCandidate(candidate, { userAgent: UA, fetchImpl: impl, resolver: publicResolver });
    expect(p.robots).toBe("error");
    expect(calls).toHaveLength(1);
  });
  it("Crawl-delay respecté ; trop long → sonde reportée", async () => {
    const sleep = vi.fn(noSleep);
    const ok = mockFetch({ "https://shop.example/robots.txt": { body: "User-agent: *\nCrawl-delay: 2\nAllow: /", contentType: "text/plain" }, "https://shop.example/collections/iphone": { body: WOO_HTML } });
    const p = await probeCandidate(candidate, { userAgent: UA, fetchImpl: ok.impl, resolver: publicResolver, sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(p).toMatchObject({ robots: "allowed", platform: "woocommerce", crawlDelaySeconds: 2 });
    const slow = mockFetch({ "https://shop.example/robots.txt": { body: "User-agent: *\nCrawl-delay: 60", contentType: "text/plain" } });
    const q = await probeCandidate(candidate, { userAgent: UA, fetchImpl: slow.impl, resolver: publicResolver, sleep });
    expect(q.probed).toBe(false);
    expect(slow.calls).toHaveLength(1);
  });
  it("anti-SSRF : un domaine résolu vers une adresse privée n'est jamais contacté", async () => {
    const { impl, calls } = mockFetch({});
    const p = await probeCandidate(candidate, { userAgent: UA, fetchImpl: impl, resolver: async () => [{ address: "10.0.0.8" }] });
    expect(p.robots).toBe("error");
    expect(p.robotsDetail).toMatch(/privées/);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Service complet
// ---------------------------------------------------------------------------

function fakeStore(known: string[] = []): DiscoveryStore & { created: Array<{ organizationId: string; domain: string; robots: string; access: string; adapter: string | null }> } {
  const created: Array<{ organizationId: string; domain: string; robots: string; access: string; adapter: string | null }> = [];
  return {
    created,
    async listKnownDomains() {
      return new Set(known);
    },
    async createDiscoveredSource(organizationId, { candidate }) {
      created.push({ organizationId, domain: candidate.domain, robots: candidate.robots, access: candidate.access, adapter: candidate.suggestedAdapter });
      return { supplierId: `sup-${created.length}`, sourceId: `src-${created.length}` };
    },
  };
}

describe("discoverSources", () => {
  const parsed = parseQuery("iPhone 13 128 Go Grade A");

  it("sans API configurée : désactivée, aucune requête, aucun enregistrement", async () => {
    const store = fakeStore();
    const report = await discoverSources({ organizationId: "org-1", provider: null, store, userAgent: UA }, parsed);
    expect(report).toMatchObject({ enabled: false, provider: null, message: DISCOVERY_DISABLED_MESSAGE, queries: [], candidates: [] });
    const fromEnv = await discoverSources({ organizationId: "org-1", env: {}, store, userAgent: UA }, parsed);
    expect(fromEnv.enabled).toBe(false);
    expect(store.created).toHaveLength(0);
  });

  it("pipeline complet : requêtes de découverte → tri → déjà connus → sonde → enregistrement", async () => {
    const provider: WebSearchProvider & { search: ReturnType<typeof vi.fn> } = {
      key: "brave",
      label: "Brave Search API",
      search: vi.fn(async (q: string) => (q.includes("grossiste") ? parseBraveResponse(BRAVE_FIXTURE) : [{ url: "https://known-supplier.fr/b2b", title: "Grossiste connu", description: "B2B" }])),
    };
    const { impl, calls } = mockFetch({
      "https://www.phonegros.example/robots.txt": { body: "User-agent: *\nAllow: /", contentType: "text/plain" },
      "https://www.phonegros.example/iphone-13": { body: SHOPIFY_HTML },
      "https://pro.backmarket.fr/robots.txt": { body: "User-agent: *\nDisallow: /", contentType: "text/plain" },
      "https://stocklots.example/lots/iphone": { body: LOGIN_PRICE_HTML },
    });
    const store = fakeStore(["known-supplier.fr"]);
    const report = await discoverSources({ organizationId: "org-1", provider, store, userAgent: UA, fetchImpl: impl, resolver: publicResolver, sleep: noSleep, now: () => NOW }, parsed);

    expect(report.enabled).toBe(true);
    expect(report.provider).toBe("brave");
    expect(report.queries.map((q) => q.query)).toEqual(["iPhone 13 grossiste reconditionné", "Apple iPhone 13 wholesale refurbished B2B"]);
    expect(provider.search).toHaveBeenCalledTimes(2);

    const byDomain = Object.fromEntries(report.candidates.map((c) => [c.domain, c]));
    expect(byDomain["phonegros.example"]).toMatchObject({ status: "new", type: "wholesaler", platform: "shopify", access: "public", priceVisibility: "public", robots: "allowed", suggestedAdapter: "shopify-storefront", supplierId: "sup-1", sourceId: "src-1" });
    expect(byDomain["phonegros.example"]!.reason).toContain("Découverte — à valider avant toute interrogation");
    expect(byDomain["pro.backmarket.fr"]).toMatchObject({ status: "new", robots: "disallowed", platform: "unknown", access: "unknown", accessLabel: "Accès non vérifié", suggestedAdapter: null });
    expect(byDomain["pro.backmarket.fr"]!.reason).toContain("robots.txt interdit");
    expect(byDomain["stocklots.example"]).toMatchObject({ status: "new", access: "account", accessLabel: "Compte requis", priceVisibility: "after_login", priceVisibilityLabel: "Prix après connexion", robots: "missing" });
    expect(byDomain["known-supplier.fr"]).toMatchObject({ status: "already_known" });
    expect(byDomain["amazon.fr"]).toMatchObject({ status: "rejected" });
    expect(byDomain["idealo.fr"]).toMatchObject({ status: "rejected" });
    expect(report.counts).toEqual({ new: 3, already_known: 1, rejected: 3, skipped: 0 });

    // aucune requête vers un domaine exclu, déjà connu ou interdit par robots.txt
    const contacted = calls.map((c) => new URL(c.url).hostname);
    expect(contacted).not.toContain("www.amazon.fr");
    expect(contacted).not.toContain("known-supplier.fr");
    expect(calls.filter((c) => c.url.startsWith("https://pro.backmarket.fr")).map((c) => c.url)).toEqual(["https://pro.backmarket.fr/robots.txt"]);
    expect(store.created.every((c) => c.organizationId === "org-1")).toBe(true);
  });

  it("budget de candidats : au-delà, « skipped » sans requête", async () => {
    const results: WebSearchResult[] = Array.from({ length: 4 }, (_, i) => ({ url: `https://grossiste${i}.fr/`, title: `Grossiste ${i}`, description: "vente en gros B2B" }));
    const provider: WebSearchProvider = { key: "fake", label: "Fake", search: async () => results };
    const { impl } = mockFetch({});
    const store = fakeStore();
    const report = await discoverSources({ organizationId: "org-1", provider, store, userAgent: UA, fetchImpl: impl, resolver: publicResolver, sleep: noSleep, maxCandidates: 2, now: () => NOW }, parsed);
    expect(report.counts.new).toBe(2);
    expect(report.counts.skipped).toBe(2);
    expect(report.candidates.find((c) => c.status === "skipped")!.reason).toBe("Non analysé : limite de 2 candidats par recherche");
  });

  it("requête vide : aucune requête de découverte", async () => {
    const provider: WebSearchProvider & { search: ReturnType<typeof vi.fn> } = { key: "fake", label: "Fake", search: vi.fn(async () => []) };
    const report = await discoverSources({ organizationId: "org-1", provider, store: fakeStore(), userAgent: UA }, parseQuery(""));
    expect(report.queries).toEqual([]);
    expect(provider.search).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Store Supabase : payloads d'insertion (client simulé)
// ---------------------------------------------------------------------------

function fakeSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  const deletes: string[] = [];
  let id = 0;
  const client = {
    from(table: string) {
      return {
        select() {
          const q = {
            eq(column: string, value: unknown) {
              filters.push({ table, column, value });
              return q;
            },
            then(resolve: (v: { data: unknown; error: null }) => unknown) {
              return Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
            },
          };
          return q;
        },
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return { select: () => ({ single: async () => ({ data: { id: `${table}-${++id}` }, error: null }) }) };
        },
        delete() {
          deletes.push(table);
          const q = { eq: () => q, then: (r: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(r) };
          return q;
        },
      };
    },
  };
  return { client: client as unknown as AdminSupabaseClient, inserts, filters, deletes };
}

describe("createSupabaseDiscoveryStore", () => {
  it("domaines connus : sites fournisseurs, URL de base et URLs de config, filtrés par organisation", async () => {
    const { client, filters } = fakeSupabase({
      suppliers: [{ website: "https://www.grossiste-a.fr" }, { website: null }],
      supplier_sources: [{ base_url: "https://shop.b.com/collections", config: { sample_url: "https://c.fr/x", urls: ["https://d.de/p"] } }],
    });
    const known = await createSupabaseDiscoveryStore(client).listKnownDomains("org-9");
    expect([...known].sort()).toEqual(["b.com", "c.fr", "d.de", "grossiste-a.fr", "shop.b.com"]);
    expect(filters.every((f) => f.column === "organization_id" && f.value === "org-9")).toBe(true);
  });

  it("enregistre fournisseur + source PUBLIC_WEB non connectée, SANS attestation ni adaptateur actif", async () => {
    const { client, inserts } = fakeSupabase({});
    const candidate = {
      domain: "phonegros.example", host: "www.phonegros.example", origin: "https://www.phonegros.example", name: "PhoneGros", sampleUrl: "https://www.phonegros.example/iphone-13", title: "t", description: null, query: "iPhone 13 grossiste reconditionné",
      supplierType: "wholesaler" as const, typeConfidence: 0.75, signals: ["grossiste"], robots: "allowed" as const, robotsDetail: "robots.txt lu.", crawlDelaySeconds: null, probed: true, httpStatus: 200,
      platform: "shopify" as const, access: "public" as const, priceVisibility: "public" as const, suggestedAdapter: "shopify-storefront", probeSignals: [], probeError: null,
    };
    const ids = await createSupabaseDiscoveryStore(client).createDiscoveredSource("org-1", { candidate, provider: "brave", discoveredAt: NOW.toISOString() });
    expect(ids).toEqual({ supplierId: "suppliers-1", sourceId: "supplier_sources-2" });
    const supplier = inserts.find((i) => i.table === "suppliers")!.row;
    expect(supplier).toMatchObject({ organization_id: "org-1", name: "PhoneGros", website: "https://www.phonegros.example" });
    const source = inserts.find((i) => i.table === "supplier_sources")!.row;
    expect(source).toMatchObject({ organization_id: "org-1", supplier_id: "suppliers-1", source_type: "PUBLIC_WEB", status: "not_connected", automated_access_confirmed: false, base_url: "https://www.phonegros.example", robots_allowed: true, robots_checked_at: NOW.toISOString() });
    const config = source.config as Record<string, unknown>;
    expect(config).toMatchObject({ discovered: true, discovered_at: NOW.toISOString(), discovered_via: "brave", discovery_query: "iPhone 13 grossiste reconditionné", supplier_type: "wholesaler", platform: "shopify", suggested_adapter: "shopify-storefront", access: "public", price_visibility: "public", robots_allowed: true, sample_url: "https://www.phonegros.example/iphone-13" });
    // jamais de clé « adapter » : la source n'est pas interrogée avant validation
    expect(config).not.toHaveProperty("adapter");
  });
});
