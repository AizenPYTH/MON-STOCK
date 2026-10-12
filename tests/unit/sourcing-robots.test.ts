import { describe, expect, it, vi } from "vitest";
import { parseRobotsTxt, evaluateRobots, checkRobotsForUrls, fetchRobots, userAgentToken } from "@/services/sourcing/crawler/robots";

const PUBLIC = async () => [{ address: "93.184.216.34" }];

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
    const ok = await checkRobotsForUrls("https://example.com", ["https://example.com/products/1"], "MonStockBot/0.1", fetchImpl, PUBLIC);
    expect(ok.allowed).toBe(true);
    expect(ok.crawlDelay).toBe(2);
    const ko = await checkRobotsForUrls("https://example.com", ["https://example.com/catalog/export"], "MonStockBot/0.1", fetchImpl, PUBLIC);
    expect(ko.allowed).toBe(false);
    expect(ko.disallowedUrls.length).toBe(1);
  });
  it("refuse par prudence si robots.txt est inaccessible, autorise s'il est absent", async () => {
    const err = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect((await checkRobotsForUrls("https://example.com", ["https://example.com/a"], "MonStockBot", err, PUBLIC)).allowed).toBe(false);
    const missing = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const r = await checkRobotsForUrls("https://example.com", ["https://example.com/a"], "MonStockBot", missing, PUBLIC);
    expect(r.allowed).toBe(true);
    expect(r.robotsStatus).toBe("missing");
  });
});

describe("robots.txt : protection SSRF", () => {
  it("adresse privée refusée (aucune requête), redirection vers les métadonnées cloud refusée", async () => {
    const fetchImpl = vi.fn(async () => new Response("User-agent: *\nAllow: /", { status: 200 }));
    const internal = await fetchRobots("https://intranet.example", "MonStockBot", fetchImpl as never, 5_000, async () => [{ address: "10.0.0.5" }]);
    expect(internal.status).toBe("error");
    expect(fetchImpl).not.toHaveBeenCalled();
    const literal = await fetchRobots("http://169.254.169.254", "MonStockBot", fetchImpl as never, 5_000, PUBLIC);
    expect(literal.status).toBe("error");
    const redirect = vi.fn(async (url: string) => (url.includes("example.com") ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }) : new Response("x")));
    const bounced = await fetchRobots("https://example.com", "MonStockBot", redirect as never, 5_000, PUBLIC);
    expect(bounced.status).toBe("error");
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
