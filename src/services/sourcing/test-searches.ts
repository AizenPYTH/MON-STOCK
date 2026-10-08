/**
 * Banc de recherches de référence (scripts/sourcing-test-searches.ts) : exécute le VRAI pipeline
 * (executeLiveSearch → adaptateurs → filtre de pertinence → classement) pour une liste de requêtes,
 * SANS enregistrer d'offre (les offres récupérées restent en mémoire), et produit un rapport Markdown.
 *
 * Deux modes, toujours distingués dans le rapport :
 *   - « live »     : sources configurées en base pour l'organisation de test, fetch réel ;
 *   - « fixtures » : documents construits d'après les formats documentés (tests/fixtures/sourcing),
 *                    servis par un fetch simulé — « FIXTURES — pas des offres réelles ».
 */
import { parseQuery, type ParsedQuery } from "@/domain/sourcing/query-parser";
import { expandQuery, queriesFor } from "@/domain/sourcing/query-expansion";
import { criteriaFromParsedQuery } from "@/domain/sourcing/offer-filter";
import { dedupeOffers } from "@/domain/sourcing/dedupe";
import { rawOfferToPipelineOffer, runOfferPipeline, type PipelineResult, type RawPipelineOffer } from "@/domain/sourcing/search-pipeline";
import type { RawOffer } from "@/domain/sourcing/types";
import { formatRelativeFr } from "@/domain/sourcing/confidence";
import type { AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import { getSourceAdapter } from "@/integrations/sourcing/registry";
import { executeLiveSearch, liveSearchVariants, LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE, type LiveSearchRuntime, type LiveSourceCandidate } from "@/services/sourcing/live-search";
import type { LiveSearchSummary } from "@/services/sourcing/live-search.types";

export const TEST_SEARCH_QUERIES = ["iPhone 13 128 Go Grade A", "iPhone 13 Pro 256 Go Grade A", "iPhone 14 128 Go Grade A", "Samsung Galaxy S22 128 Go Grade A", "Samsung Galaxy S23 256 Go Grade A"] as const;
export const TEST_ORG_NAME = "TEST — recherches sourcing";
export const TEST_ORG_SLUG = "test-recherches-sourcing";

export type TestOffer = RawPipelineOffer & { lastSeenAt: string; supplierId: string; productKey: string | null; comparablePrice: number | null; sourceName: string; supplierName: string; adapterKey: string | null; url: string | null };

export interface TestSearchOutcome {
  query: string;
  parsed: ParsedQuery;
  variants: string[];
  summary: LiveSearchSummary;
  offers: TestOffer[];
  pipeline: PipelineResult<TestOffer>;
}

export type TestRuntimeBase = Omit<LiveSearchRuntime, "storeOffers" | "recordRun" | "cache">;

/** Une requête de bout en bout, sans écriture : les offres « enregistrées » restent en mémoire (stored = 0). */
export async function runTestSearch(query: string, candidates: LiveSourceCandidate[], base: TestRuntimeBase, options: { now: Date; currency?: string; requestedQuantity?: number }): Promise<TestSearchOutcome> {
  const parsed = parseQuery(query);
  const variants = queriesFor(expandQuery(parsed), "adapter_search");
  const collected: Array<{ c: LiveSourceCandidate; raw: RawOffer }> = [];
  const rt: LiveSearchRuntime = {
    ...base,
    cache: new Map(),
    storeOffers: async (c, offers) => {
      for (const raw of offers) collected.push({ c, raw });
      return { offerIds: offers.map((o) => `${c.sourceId}:${o.externalOfferId}`), stored: 0, rejected: 0 };
    },
    recordRun: async () => undefined,
  };
  const summary = await executeLiveSearch(candidates, { rawQuery: query, parsed, variants }, rt);
  const currency = options.currency ?? "EUR";
  const offers: TestOffer[] = collected.map(({ c, raw }) => {
    const p = rawOfferToPipelineOffer(raw, `${c.sourceId}:${raw.externalOfferId}`, { now: options.now, currency, supplierVerified: c.attested || c.adapter?.access === "account" });
    const productKey = p.model && !p.modelInferred ? [p.brand, p.model, p.storage, p.color, p.condition, p.grade].join("|") : null;
    return { ...p, lastSeenAt: (options.now).toISOString(), supplierId: c.supplierId, productKey, comparablePrice: p.unitPrice, sourceName: c.sourceName, supplierName: c.supplierName, adapterKey: c.adapterKey, url: raw.url ?? null };
  });
  const pipeline = runOfferPipeline(criteriaFromParsedQuery(parsed), offers, { now: options.now, requestedQuantity: options.requestedQuantity ?? 1, currency, dedupe: (kept) => dedupeOffers(kept).kept });
  return { query, parsed, variants: liveSearchVariants({ rawQuery: query, parsed, variants }, LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE).map((v) => v.text), summary, offers, pipeline };
}

// ---------------------------------------------------------------------------
// Fixtures (documents construits d'après les formats documentés) — aucun réseau
// ---------------------------------------------------------------------------

export type FixtureReader = (adapterKey: string, file: string) => string;

interface FixtureRoute {
  match: (url: URL) => boolean;
  adapter: string;
  file: string | null;
  contentType: string;
  status?: number;
}

const FIXTURE_ROUTES: FixtureRoute[] = [
  { adapter: "jsonld-public", file: "search-page.html", contentType: "text/html; charset=utf-8", match: (u) => u.hostname === "jsonld.fixture.example" && u.pathname === "/recherche" },
  { adapter: "shopify-storefront", file: "suggest.json", contentType: "application/json", match: (u) => u.hostname === "shopify.fixture.example" && u.pathname === "/search/suggest.json" },
  { adapter: "shopify-storefront", file: "product-detail.json", contentType: "application/json", match: (u) => u.hostname === "shopify.fixture.example" && u.pathname === "/products/iphone-13-128-go.json" },
  { adapter: "woocommerce-store", file: "products-search.json", contentType: "application/json", match: (u) => u.hostname === "woo.fixture.example" && u.pathname.startsWith("/wp-json/wc/store/v1/products") },
  { adapter: "google-merchant-feed", file: "feed-rss.xml", contentType: "application/xml", match: (u) => u.hostname === "gmc.fixture.example" && u.pathname === "/feeds/google.xml" },
  { adapter: "bigbuy", file: "productsinformation.json", contentType: "application/json", match: (u) => u.pathname.endsWith("/rest/catalog/productsinformation.json") },
  { adapter: "bigbuy", file: "productsstockavailable.json", contentType: "application/json", match: (u) => u.pathname.endsWith("/rest/catalog/productsstockavailable.json") },
  { adapter: "bigbuy", file: "manufacturers.json", contentType: "application/json", match: (u) => u.pathname.endsWith("/rest/catalog/manufacturers.json") },
  { adapter: "bigbuy", file: "products.json", contentType: "application/json", match: (u) => u.pathname.endsWith("/rest/catalog/products.json") },
  { adapter: "bigbuy", file: "user-purchase.json", contentType: "application/json", match: (u) => u.pathname.endsWith("/rest/user/purchase.json") },
  { adapter: "ingram-micro", file: "token.json", contentType: "application/json", match: (u) => u.pathname.endsWith("/oauth/oauth20/token") },
  { adapter: "ingram-micro", file: "priceandavailability.json", contentType: "application/json", match: (u) => u.pathname.endsWith("/resellers/v6/catalog/priceandavailability") },
  { adapter: "ingram-micro", file: "catalog.json", contentType: "application/json", match: (u) => u.pathname.endsWith("/resellers/v6/catalog") },
];

/** fetch simulé servant les fixtures (404 pour toute autre URL : rien n'est inventé). */
export function fixtureFetch(read: FixtureReader): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const route = FIXTURE_ROUTES.find((r) => r.match(url));
    if (!route || !route.file) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(read(route.adapter, route.file), { status: route.status ?? 200, headers: { "content-type": route.contentType } });
  }) as typeof fetch;
}

/** résolveur DNS simulé (adresse publique documentaire) : la protection anti-SSRF reste active */
export const fixtureResolver = async (): Promise<Array<{ address: string }>> => [{ address: "93.184.216.34" }];

export const FIXTURE_CREDENTIALS: Record<string, Record<string, string>> = {
  bigbuy: { api_key: "fixture-key" },
  "ingram-micro": { client_id: "fixture", client_secret: "fixture", customer_number: "20-222222", country_code: "FR" },
};

function fixtureConfig(overrides: Partial<AdapterSourceConfig>): AdapterSourceConfig {
  return { baseUrl: null, settings: {}, defaultCurrency: null, defaultTaxType: "unknown", defaultCountry: null, ...overrides };
}

/** Une source simulée par adaptateur du registre, configurée comme dans les tests d'adaptateurs. */
export function fixtureCandidates(): LiveSourceCandidate[] {
  const specs: Array<{ key: string; config: AdapterSourceConfig; connection?: boolean }> = [
    { key: "jsonld-public", config: fixtureConfig({ baseUrl: "https://jsonld.fixture.example", settings: { search_url: "https://jsonld.fixture.example/recherche?q={query}" }, defaultCurrency: "EUR", defaultTaxType: "ttc", defaultCountry: "FR" }) },
    { key: "shopify-storefront", config: fixtureConfig({ baseUrl: "https://shopify.fixture.example", defaultCurrency: "EUR", defaultTaxType: "ttc" }) },
    { key: "woocommerce-store", config: fixtureConfig({ baseUrl: "https://woo.fixture.example", defaultTaxType: "ttc", defaultCountry: "FR" }) },
    { key: "google-merchant-feed", config: fixtureConfig({ baseUrl: "https://gmc.fixture.example", settings: { feed_url: "https://gmc.fixture.example/feeds/google.xml" }, defaultTaxType: "ttc", defaultCountry: "FR" }) },
    { key: "bigbuy", config: fixtureConfig({ settings: { iso_code: "fr" } }), connection: true },
    { key: "ingram-micro", config: fixtureConfig({ defaultTaxType: "ht", defaultCountry: "FR" }), connection: true },
  ];
  return specs.map((s) => {
    const adapter: SourceAdapter | null = getSourceAdapter(s.key);
    return { sourceId: `fixture-${s.key}`, sourceName: `FIXTURE ${s.key}`, supplierId: `fixture-supplier-${s.key}`, supplierName: `Fournisseur fictif (${s.key})`, sourceType: s.connection ? "SUPPLIER_ACCOUNT" : "PUBLIC_WEB", adapter, adapterKey: s.key, config: s.config, attested: true, connectionId: s.connection ? `fixture-connection-${s.key}` : null };
  });
}

export function fixtureRuntime(read: FixtureReader, now: () => Date): TestRuntimeBase {
  return {
    userAgent: "MonStockBot/0.1 (+fixtures)",
    now,
    fetchImpl: fixtureFetch(read),
    resolver: fixtureResolver,
    sleep: async () => undefined,
    checkRobots: async (_c, urls) => ({ allowed: true, robotsStatus: "ok", crawlDelay: null, disallowedUrls: [], details: `fixtures : robots.txt non applicable (${urls.length} URL)` }),
    loadCredentials: async (connectionId) => FIXTURE_CREDENTIALS[connectionId.replace(/^fixture-connection-/, "")] ?? null,
    perSourceTimeoutMs: 8_000,
    maxSources: 10,
    parallelism: 10,
    publicMinDelayMs: 0,
    accountMinDelayMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Rapport Markdown
// ---------------------------------------------------------------------------

function money(n: number | null, currency = "EUR"): string {
  if (n === null || !Number.isFinite(n)) return "Non communiqué";
  return `${n.toFixed(2).replace(".", ",")} ${currency === "EUR" ? "€" : currency}`;
}

function criteriaLine(p: ParsedQuery): string {
  const c = p.criteria;
  const parts = [c.brand ? `marque ${c.brand}` : null, c.model ? `modèle ${c.model}` : null, c.storage ? `stockage ${c.storage}` : null, c.color ? `couleur ${c.color}` : null, c.grade ? `grade ${c.grade}` : null, c.condition !== "unknown" ? `état ${c.condition}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "aucun critère structuré";
}

const STATUS_FR: Record<string, string> = { ok: "interrogée", cached: "cache", no_search: "pas de recherche en direct", account_required: "compte requis", not_attested: "accès non attesté", robots_disallowed: "interdit par robots.txt", error: "erreur", timeout: "délai dépassé", skipped: "hors budget" };

export function renderOutcome(o: TestSearchOutcome, index: number, now: Date): string {
  const lines: string[] = [];
  const r = o.pipeline;
  lines.push(`### ${index}. « ${o.query} »`, "");
  lines.push(`- Requête analysée : ${criteriaLine(o.parsed)} (type ${o.parsed.kind})`);
  lines.push(`- Reformulations envoyées à chaque source (≤ ${LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE}) : ${o.variants.map((v) => `« ${v} »`).join(", ")}`);
  const s = o.summary;
  lines.push(`- Sources : ${s.sources.length} candidate(s), ${s.queried} interrogée(s)`);
  for (const src of s.sources) {
    lines.push(`  - ${src.sourceName} (${src.adapterKey ?? "sans adaptateur"}) : ${STATUS_FR[src.status] ?? src.status} — ${src.found} offre(s), ${src.requests.length} requête(s)${src.message ? ` — ${src.message}` : ""}`);
  }
  lines.push(`- Offres trouvées : ${s.found} · conservées : ${r.filter.kept.length} (${r.unique.length} après déduplication) · écartées : ${r.rejection.count}`);
  if (r.rejection.count > 0) {
    lines.push(`- Raisons des rejets : ${r.rejection.groups.map((g) => `${g.label} (${g.count})`).join(", ")}`);
    for (const x of r.filter.rejected) lines.push(`  - « ${x.offer.title} » (${x.offer.sourceName}) : ${x.reasons.map((m) => m.message).join(" ; ")}`);
  }
  const best = r.ranking.ranked[0];
  if (!best) lines.push("- Meilleure offre : **Aucune offre**");
  else {
    const b = best.offer;
    const stock = b.outOfStock || b.availableQuantity === 0 ? "rupture de stock" : b.availableQuantity !== null ? `${b.availableQuantity} unité(s)` : b.stockKnown ? "en stock (quantité non communiquée)" : "Non communiqué";
    const age = b.freshnessHours === null ? "inconnue" : formatRelativeFr(b.freshnessHours * 3_600_000);
    lines.push(`- Meilleure offre : « ${b.title} » — prix ${money(b.unitPrice)} · MOQ ${b.moq ?? "Non communiqué"} · disponibilité ${stock} · source ${b.sourceName} (${b.supplierName}) · fraîcheur : récupérée ${age} · score ${best.score}/100`);
    lines.push(`  - Pourquoi : ${best.why.slice(0, 4).join(" ; ")}`);
  }
  void now;
  return lines.join("\n");
}

export interface TestSearchReportInput {
  generatedAt: Date;
  database: string;
  organization: { id: string; name: string; created: boolean };
  liveSourceCount: number;
  live: TestSearchOutcome[];
  fixtures: TestSearchOutcome[];
  networkNote: string;
}

export function renderTestSearchReport(input: TestSearchReportInput): string {
  const out: string[] = [];
  out.push("# Recherches de référence du sourcing", "");
  out.push(`Généré par \`npm run sourcing:test-searches\` le ${input.generatedAt.toISOString()} — base \`${input.database}\`, organisation « ${input.organization.name} » (\`${input.organization.id}\`${input.organization.created ? ", créée par ce script" : ""}).`, "");
  out.push("Pipeline réel : `executeLiveSearch` (adaptateurs du registre, robots.txt, budget de 8 s par source, ≤ 2 reformulations) → normalisation / validation (`rawOfferToPipelineOffer`) → filtre de pertinence (`filterOffers`) → déduplication → classement (`rankOpportunities`). **Aucune offre n'est enregistrée** par ce script.", "");
  out.push("## 1. Sources configurées (conditions réelles)", "");
  out.push(`${input.liveSourceCount} source(s) configurée(s) pour l'organisation de test. ${input.networkNote}`, "");
  input.live.forEach((o, i) => out.push(renderOutcome(o, i + 1, input.generatedAt), ""));
  out.push("## 2. FIXTURES — pas des offres réelles", "");
  out.push("> Documents construits à la main d'après les formats documentés (`tests/fixtures/sourcing/<adaptateur>/`), servis par un fetch simulé (aucun réseau), robots.txt non applicable, fournisseurs fictifs. Le serveur simulé renvoie le **même document quelle que soit la requête** (sauf les adaptateurs qui filtrent localement : flux Google Merchant, BigBuy) : les offres hors sujet sont donc écartées par le filtre de pertinence — c'est ce que cette section démontre. Ces prix ne sont **pas** des offres réelles.", "");
  input.fixtures.forEach((o, i) => out.push(renderOutcome(o, i + 1, input.generatedAt), ""));
  return `${out.join("\n").trimEnd()}\n`;
}
