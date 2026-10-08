import { describe, expect, it, vi } from "vitest";
import { parseRobotsTxt, evaluateRobots, checkRobotsForUrls, userAgentToken } from "@/services/sourcing/crawler/robots";

const ROBOTS = `# commentaire
User-agent: *
Disallow: /private/
Allow: /private/public-page
Crawl-delay: 5

User-agent: MonStockBot
Disallow: /catalog/export
Crawl-delay: 2

Sitemap: https://example.com/sitemap.xml`;

describe("robots.txt", () => {
  it("parse les groupes, délais et sitemaps", () => {
    const r = parseRobotsTxt(ROBOTS);
    expect(r.groups.length).toBe(2);
    expect(r.groups[0]?.crawlDelay).toBe(5);
    expect(r.groups[1]?.agents).toEqual(["monstockbot"]);
    expect(r.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });
  it("sélectionne le groupe le plus spécifique pour notre UA", () => {
    const r = parseRobotsTxt(ROBOTS);
    const ua = "MonStockBot/0.1 (+https://example.com/bot)";
    expect(userAgentToken(ua)).toBe("monstockbot");
    expect(evaluateRobots(r, ua, "/catalog/export").allowed).toBe(false);
    expect(evaluateRobots(r, ua, "/private/x").allowed).toBe(true);
    expect(evaluateRobots(r, ua, "/").crawlDelay).toBe(2);
    expect(evaluateRobots(r, "OtherBot/1.0", "/private/x").allowed).toBe(false);
    expect(evaluateRobots(r, "OtherBot/1.0", "/private/public-page").allowed).toBe(true);
  });
  it("gère * et $", () => {
    const r = parseRobotsTxt("User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*");
    expect(evaluateRobots(r, "x", "/doc/a.pdf").allowed).toBe(false);
    expect(evaluateRobots(r, "x", "/doc/a.pdfx").allowed).toBe(true);
    expect(evaluateRobots(r, "x", "/tmpfile").allowed).toBe(false);
  });
  it("vérifie une liste d'URLs sans réseau (fetch simulé)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(String(url).endsWith("/robots.txt") ? ROBOTS : "", { status: 200 })) as unknown as typeof fetch;
    const ok = await checkRobotsForUrls("https://example.com", ["https://example.com/products/1"], "MonStockBot/0.1", fetchImpl);
    expect(ok.allowed).toBe(true);
    expect(ok.crawlDelay).toBe(2);
    const ko = await checkRobotsForUrls("https://example.com", ["https://example.com/catalog/export"], "MonStockBot/0.1", fetchImpl);
    expect(ko.allowed).toBe(false);
    expect(ko.disallowedUrls.length).toBe(1);
  });
  it("refuse par prudence si robots.txt est inaccessible, autorise s'il est absent", async () => {
    const err = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect((await checkRobotsForUrls("https://example.com", ["https://example.com/a"], "MonStockBot", err)).allowed).toBe(false);
    const missing = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const r = await checkRobotsForUrls("https://example.com", ["https://example.com/a"], "MonStockBot", missing);
    expect(r.allowed).toBe(true);
    expect(r.robotsStatus).toBe("missing");
  });
});
