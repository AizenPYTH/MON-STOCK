/**
 * Bibliothèque de sources : vérifications par lots équitables (S-02 / I-06), conformité des
 * conditions d'utilisation et validation humaine tracée (I-05 / Q-19).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";
import { mockFetch, runCtx } from "./helpers/sourcing-adapters";

let db: MemoryDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => db.client }));

const lib = await import("@/services/sourcing/source-library");
const { SOURCE_LIBRARY, orderLibraryChecks, runLibraryChecks, libraryAdapterPlan, checkLibrarySourceDetect, checkLibrarySource, getLibrarySource, termsStatusOf, activateLibrarySourceFor, activationTrace, librarySourcesToRevalidate, termsUrlMatchesSite, LIBRARY_CHECK_BATCH } = lib;
const { buildSourcingUserAgent, botContact } = await import("@/lib/env");

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const eligible = SOURCE_LIBRARY.filter((s) => !s.blocked);

type CheckFn = NonNullable<Parameters<typeof runLibraryChecks>[0]> extends infer O ? (O extends { check?: infer C } ? NonNullable<C> : never) : never;

function okCheck(clock: { t: number }, costMs = 10_000, status: "ok" | "no_products" = "ok"): CheckFn {
  return (async (s) => {
    clock.t += costMs;
    return { key: s.key, status, adapter: s.adapter, robotsAllowed: true, httpStatus: 200, productCount: status === "ok" ? 3 : 0, sample: [], message: status, durationMs: costMs };
  }) as CheckFn;
}

beforeEach(() => {
  db = memoryDb({ sourcing_library_checks: [] });
});

describe("S-02 / I-06 : vérifications par lots équitables, budget global", () => {
  it("file : jamais vérifiées d'abord, puis les moins récemment prises en charge ; sources bloquées exclues ; ordre stable", () => {
    const [a, b, c] = eligible;
    const rows = [
      { key: a!.key, checked_at: "2026-10-20T00:00:00Z", last_attempt_at: null, status: "ok", adapter: null },
      { key: b!.key, checked_at: "2026-10-10T00:00:00Z", last_attempt_at: "2026-10-21T00:00:00Z", status: "unreachable", adapter: null },
      { key: c!.key, checked_at: "2026-10-01T00:00:00Z", last_attempt_at: null, status: "ok", adapter: null },
    ];
    const order = orderLibraryChecks(SOURCE_LIBRARY, rows).map((s) => s.key);
    expect(order).not.toContain("utopya");
    expect(order).toHaveLength(eligible.length);
    // les 44 jamais vérifiées passent avant, dans l'ordre de la bibliothèque
    expect(order.slice(0, eligible.length - 3)).toEqual(eligible.slice(3).map((s) => s.key));
    // puis c (01/10), a (20/10), b (tentative interrompue le 21/10 : en fin de file)
    expect(order.slice(-3)).toEqual([c!.key, a!.key, b!.key]);
  });

  it("un passage traite au plus un lot ; les sources de FIN de liste finissent toutes vérifiées en quelques passages", async () => {
    const clock = { t: 0 };
    const seen = new Set<string>();
    let passes = 0;
    while (seen.size < eligible.length && passes < 20) {
      const run = await runLibraryChecks({ check: okCheck(clock, 5_000), clock: () => clock.t });
      expect(run.results.length).toBeLessThanOrEqual(LIBRARY_CHECK_BATCH);
      for (const r of run.results) seen.add(r.key);
      clock.t += 86_400_000;
      passes++;
    }
    expect(seen.size).toBe(eligible.length);
    expect(passes).toBe(Math.ceil(eligible.length / LIBRARY_CHECK_BATCH));
    // les 16 sources ajoutées en fin de bibliothèque (a05affd) ont bien une preuve enregistrée
    for (const s of eligible.slice(-16)) expect(db.tables.sourcing_library_checks!.find((r) => r.key === s.key)).toMatchObject({ status: "ok" });
  });

  it("budget global : aucune source n'est commencée sans temps suffisant, les reportées passent en tête au passage suivant", async () => {
    const clock = { t: 0 };
    const run = await runLibraryChecks({ check: okCheck(clock, 40_000), clock: () => clock.t, budgetMs: 110_000 });
    // 0 s, 40 s, 80 s : à 80 s il reste 30 s ≥ 25 s → 3 vérifiées ; à 120 s le budget est dépassé
    expect(run.results).toHaveLength(3);
    expect(run.deferred).toHaveLength(LIBRARY_CHECK_BATCH - 3);
    clock.t += 3_600_000;
    const next = await runLibraryChecks({ check: okCheck(clock, 1_000), clock: () => clock.t });
    expect(next.results[0]!.key).toBe(run.deferred[0]);
  });

  it("vérification qui ne rend jamais la main : interrompue au budget, tentative marquée, la source passe en fin de file", async () => {
    const clock = { t: 0 };
    const hang: CheckFn = (() => new Promise(() => undefined)) as CheckFn;
    vi.useFakeTimers();
    try {
      const p = runLibraryChecks({ check: hang, batchSize: 1, budgetMs: 30_000, clock: () => clock.t });
      await vi.advanceTimersByTimeAsync(30_000);
      const run = await p;
      expect(run.results[0]).toMatchObject({ key: eligible[0]!.key, status: "unreachable", message: expect.stringMatching(/interrompue/) });
    } finally {
      vi.useRealTimers();
    }
    const row = db.tables.sourcing_library_checks!.find((r) => r.key === eligible[0]!.key)!;
    expect(row.last_attempt_at).toBeTruthy();
    const order = orderLibraryChecks(SOURCE_LIBRARY, db.tables.sourcing_library_checks as never);
    expect(order[order.length - 1]!.key).toBe(eligible[0]!.key);
  });

  it("une seule tentative d'adaptateur de repli par passage, en rotation d'un passage à l'autre", () => {
    const shop = getLibrarySource("foneday")!; // déclaré shopify-storefront
    expect(libraryAdapterPlan(shop, null)).toEqual(["shopify-storefront", "woocommerce-store"]);
    expect(libraryAdapterPlan(shop, { status: "no_products", adapter: "woocommerce-store" })).toEqual(["shopify-storefront", "sitemap-jsonld"]);
    expect(libraryAdapterPlan(shop, { status: "no_products", adapter: "sitemap-jsonld" })).toEqual(["shopify-storefront", "woocommerce-store"]);
    // l'adaptateur qui a réussi la dernière fois est essayé en premier
    expect(libraryAdapterPlan(shop, { status: "ok", adapter: "sitemap-jsonld" })).toEqual(["sitemap-jsonld", "shopify-storefront"]);
    expect(libraryAdapterPlan(getLibrarySource("ebay-fr")!, null)).toEqual(["ebay-browse"]);
  });

  it("détection : le 2e adaptateur de repli n'est PAS essayé dans le même passage", async () => {
    const s = getLibrarySource("mobileparts-shop")!;
    const { fetchImpl, calls } = mockFetch([["/robots.txt", { body: "User-agent: *\nAllow: /", contentType: "text/plain" }]]);
    const r = await checkLibrarySourceDetect(s, { fetchImpl, resolver: runCtx().resolver, sleep: async () => undefined });
    expect(r.status).not.toBe("ok");
    expect(r.adapter).toBe("woocommerce-store");
    expect(calls.some((c) => /wp-json|wc\/store/.test(c.url))).toBe(true);
    expect(calls.some((c) => /sitemap/.test(c.url))).toBe(false);
  });

  it("I-16 : le Crawl-delay de robots.txt est appliqué entre deux requêtes de la vérification", async () => {
    const s = getLibrarySource("foneday")!;
    const suggest = JSON.stringify({ resources: { results: { products: [{ id: 1, handle: "iphone-13-lcd", title: "iPhone 13 LCD", url: "/products/iphone-13-lcd", price: "39.95", available: true }] } } });
    const detail = JSON.stringify({ product: { id: 1, title: "iPhone 13 LCD", handle: "iphone-13-lcd", vendor: "F", body_html: "", product_type: "LCD", tags: [], variants: [{ id: 11, title: "Default Title", option1: "Default Title", option2: null, option3: null, price: "39.95", sku: "F-1", available: true, product_id: 1 }] } });
    const { fetchImpl } = mockFetch([
      ["/robots.txt", { body: "User-agent: *\nCrawl-delay: 7\nDisallow: /checkout", contentType: "text/plain" }],
      ["/search/suggest.json", { body: suggest }],
      ["/products/iphone-13-lcd.json", { body: detail }],
    ]);
    const sleeps: number[] = [];
    const r = await checkLibrarySource(s, { fetchImpl, resolver: runCtx().resolver, sleep: async (ms) => void sleeps.push(ms) });
    expect(r.status).toBe("ok");
    expect(Math.max(0, ...sleeps)).toBeGreaterThanOrEqual(6_000);
  });
});

describe("I-05 / Q-19 : conditions d'utilisation et validation humaine tracée", () => {
  it("page des conditions : confirmée seulement avec une preuve ; plus aucun chemin Shopify supposé pour un site non Shopify", () => {
    const confirmed = SOURCE_LIBRARY.filter((s) => termsStatusOf(s) === "confirmed").map((s) => s.key);
    expect(confirmed.sort()).toEqual(["ebay-fr", "utopya"]);
    for (const key of ["mobilesentrix-eu", "refreshed-apples", "pulled-mac-parts", "mobinova", "da-pieces", "bestellaptops"]) {
      const s = getLibrarySource(key)!;
      expect(s.termsUrl).not.toMatch(/policies\/terms-of-service/);
      expect(termsStatusOf(s)).toBe("unverified");
    }
    for (const s of SOURCE_LIBRARY.filter((x) => x.termsUrl.includes("/policies/terms-of-service"))) expect(s.adapter).toBe("shopify-storefront");
  });

  it("adresse de la page des conditions : https et même site que le fournisseur", () => {
    expect(termsUrlMatchesSite("https://www.foneday.shop/pages/cgv", "https://www.foneday.shop")).toBe(true);
    expect(termsUrlMatchesSite("https://foneday.shop/terms", "https://www.foneday.shop")).toBe(true);
    expect(termsUrlMatchesSite("https://help.foneday.shop/terms", "https://www.foneday.shop")).toBe(true);
    expect(termsUrlMatchesSite("http://www.foneday.shop/terms", "https://www.foneday.shop")).toBe(false);
    expect(termsUrlMatchesSite("https://evil.example/foneday.shop", "https://www.foneday.shop")).toBe(false);
    expect(termsUrlMatchesSite("https://user:pw@www.foneday.shop/terms", "https://www.foneday.shop")).toBe(false);
  });

  const review = { userId: USER, userLabel: "titulaire@example.test", channel: "web" as const, at: new Date("2026-10-22T10:00:00Z") };

  it("page non vérifiée : activation refusée sans l'adresse de la page lue ; acceptée avec, trace auteur + date + statut « déclarée »", async () => {
    db = memoryDb({ sourcing_library_checks: [{ key: "foneday", status: "ok", checked_at: "2026-10-21T04:23:00Z", adapter: "shopify-storefront" }], supplier_sources: [], suppliers: [] });
    await expect(activateLibrarySourceFor(db.client as never, ORG, "foneday", review)).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringMatching(/n'a pas été vérifiée par MON STOCK/) });
    await expect(activateLibrarySourceFor(db.client as never, ORG, "foneday", { ...review, termsUrl: "https://autre-site.example/cgv" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(db.tables.supplier_sources).toHaveLength(0);
    const r = await activateLibrarySourceFor(db.client as never, ORG, "foneday", { ...review, termsUrl: "https://www.foneday.shop/pages/terms" });
    expect(r.alreadyActive).toBe(false);
    const src = db.tables.supplier_sources![0]!;
    expect(src).toMatchObject({ access_reviewed_by: USER, access_reviewed_at: "2026-10-22T10:00:00.000Z", terms_url: "https://www.foneday.shop/pages/terms", terms_status: "user_declared", automated_access_confirmed: true });
    expect(src.access_conditions).toMatch(/Validation humaine : titulaire@example\.test .* NON vérifiée par MON STOCK/);
    expect(src.access_conditions).not.toMatch(/robots\.txt vérifié par le serveur/);
  });

  it("page confirmée (eBay) : l'attestation de l'utilisateur suffit, statut « confirmée »", async () => {
    db = memoryDb({ sourcing_library_checks: [{ key: "ebay-fr", status: "ok", checked_at: "2026-10-21T04:23:00Z", adapter: "ebay-browse" }], supplier_sources: [], suppliers: [] });
    await activateLibrarySourceFor(db.client as never, ORG, "ebay-fr", review);
    expect(db.tables.supplier_sources![0]).toMatchObject({ terms_status: "confirmed", terms_url: "https://developer.ebay.com/join/api-license-agreement", access_reviewed_by: USER });
  });

  it("aucune validation sans utilisateur identifié", async () => {
    await expect(activateLibrarySourceFor(db.client as never, ORG, "ebay-fr", { ...review, userId: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("trace : ne prétend jamais que le serveur a lu les conditions", () => {
    const t = activationTrace(getLibrarySource("brico-phone")!, { ...review, termsUrl: "https://www.brico-phone.com/cgv" }, "https://www.brico-phone.com/cgv", "2026-10-21T04:23:00Z");
    expect(t).toMatch(/déclare .* avoir lu/);
    expect(t).toMatch(/NON vérifiée par MON STOCK/);
    expect(t).not.toMatch(/robots\.txt vérifié par le serveur/);
  });

  it("route /cron/library-activate supprimée (410), même avec le secret des tâches planifiées", async () => {
    process.env.CRON_SECRET = "s".repeat(32);
    const { route } = await import("../../server/edge/api");
    const res = await route(new Request("https://x.supabase.co/functions/v1/api/cron/library-activate", { method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}`, "content-type": "application/json" }, body: JSON.stringify({ organizationId: ORG, keys: ["foneday"], requestedBy: "titulaire du compte" }) }));
    expect(res.status).toBe(410);
    expect(db.tables.supplier_sources ?? []).toHaveLength(0);
  });

  it("rapport : sources actives à revalider (attestation générée, sans validation tracée, page non confirmée) — rien n'est désactivé", async () => {
    db = memoryDb({
      supplier_sources: [
        { id: "s1", organization_id: ORG, name: "Brico-phone", status: "active", config: { adapter: "sitemap-jsonld", library_key: "brico-phone" }, access_conditions: "Titulaire. Conditions du fournisseur : https://www.brico-phone.com. robots.txt vérifié par le serveur. Activation enregistrée le 2026-10-21T10:00:00Z.", access_reviewed_by: null, access_reviewed_at: null, terms_url: null, terms_status: null },
        { id: "s2", organization_id: ORG, name: "eBay", status: "active", config: { adapter: "ebay-browse", library_key: "ebay-fr" }, access_conditions: "Validation humaine…", access_reviewed_by: USER, access_reviewed_at: "2026-10-22T10:00:00Z", terms_url: "https://developer.ebay.com/join/api-license-agreement", terms_status: "confirmed" },
        { id: "s3", organization_id: ORG, name: "Import", status: "active", config: { kind: "catalog_file_import" }, access_conditions: null, access_reviewed_by: null, access_reviewed_at: null, terms_url: null, terms_status: null },
      ],
    });
    const report = await librarySourcesToRevalidate(db.client as never);
    expect(report.map((r) => r.sourceId)).toEqual(["s1"]);
    expect(report[0]!.reasons).toEqual(["aucune validation humaine tracée (utilisateur, date)", "attestation générée par une tâche planifiée", "page des conditions non confirmée"]);
    expect(db.tables.supplier_sources!.find((s) => s.id === "s1")!.status).toBe("active");
  });

  it("Q-19 : User-Agent avec contact configurable, jamais de contact inventé ni d'exemple", () => {
    expect(buildSourcingUserAgent({})).toBe("MonStockBot/0.1");
    expect(buildSourcingUserAgent({ SOURCING_USER_AGENT: "MonStockBot/0.1 (+https://example.com/bot)" })).toBe("MonStockBot/0.1");
    expect(buildSourcingUserAgent({ SOURCING_BOT_CONTACT: "https://monstock.app/robot" })).toBe("MonStockBot/0.1 (+https://monstock.app/robot)");
    expect(buildSourcingUserAgent({ SOURCING_BOT_CONTACT: "robot@monstock.app" })).toBe("MonStockBot/0.1 (+robot@monstock.app)");
    expect(buildSourcingUserAgent({ SOURCING_USER_AGENT: "MonStockBot/0.2", SOURCING_BOT_CONTACT: "mailto:robot@monstock.app" })).toBe("MonStockBot/0.2 (+robot@monstock.app)");
    expect(botContact("contact@example.com")).toBeNull();
    expect(botContact("http://monstock.app/robot")).toBeNull();
    expect(botContact("pas un contact")).toBeNull();
  });
});
