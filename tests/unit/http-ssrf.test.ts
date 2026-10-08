import { describe, expect, it, vi } from "vitest";
import { assertPublicHttpUrl, assertResolvesToPublicAddress, fetchText, isPrivateAddress } from "@/services/sourcing/http";

describe("isPrivateAddress", () => {
  it("détecte les plages privées, locales et réservées", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.5", "172.31.255.255", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("accepte les adresses publiques", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "93.184.216.34", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("assertPublicHttpUrl", () => {
  it("refuse les hôtes locaux, les IP privées et les formes numériques déguisées", () => {
    for (const u of ["http://localhost/x", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://2130706433/", "http://0x7f000001/", "http://127.1/", "http://foo.local/", "ftp://example.com/", "http://user:pw@example.com/"]) {
      expect(() => assertPublicHttpUrl(u), u).toThrow();
    }
  });
  it("accepte une URL publique", () => {
    expect(assertPublicHttpUrl("https://example.com/feed.csv").hostname).toBe("example.com");
  });
});

describe("fetchText (anti-SSRF)", () => {
  const publicResolver = async () => [{ address: "93.184.216.34" }];
  it("refuse un nom d'hôte qui résout vers une adresse privée", async () => {
    await expect(assertResolvesToPublicAddress(new URL("https://internal.example"), async () => [{ address: "10.0.0.5" }])).rejects.toThrow(/privées/);
  });
  it("suit les redirections mais refuse un rebond vers une adresse interne", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === "https://attacker.example/feed") return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
      return new Response("secret", { status: 200 });
    }) as unknown as typeof fetch;
    await expect(fetchText("https://attacker.example/feed", { userAgent: "test", fetchImpl, resolver: publicResolver })).rejects.toThrow(/privées/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("suit une redirection publique et renvoie l'URL finale", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === "https://a.example/feed") return new Response(null, { status: 301, headers: { location: "https://b.example/feed.csv" } });
      return new Response("sku;price\nA;1", { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } });
    }) as unknown as typeof fetch;
    const r = await fetchText("https://a.example/feed", { userAgent: "test", fetchImpl, resolver: publicResolver });
    expect(r.finalUrl).toBe("https://b.example/feed.csv");
    expect(r.text).toContain("sku;price");
  });
  it("borne la taille même sans Content-Length", async () => {
    const big = "x".repeat(2048);
    const fetchImpl = vi.fn(async () => new Response(big, { status: 200 })) as unknown as typeof fetch;
    await expect(fetchText("https://a.example/big", { userAgent: "test", fetchImpl, resolver: publicResolver, maxBytes: 1024 })).rejects.toThrow(/volumineuse/);
  });
});
