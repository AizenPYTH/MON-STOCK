import { describe, expect, it, vi } from "vitest";
import { assertPublicHttpUrl, assertResolvesToPublicAddress, fetchText, isPrivateAddress, nodePinnedFetch } from "@/services/sourcing/http";

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

// ---------------------------------------------------------------------------
// Régressions S-01 / I-32 / I-15 (audit du 22/10/2026)
// ---------------------------------------------------------------------------

describe("isPrivateAddress — analyse octet par octet (S-01, I-32)", () => {
  it("refuse les IPv4 embarquées dans IPv6 sous forme normalisée, NAT64, 6to4, Teredo, ULA (métadonnées)", () => {
    for (const ip of [
      "::ffff:7f00:1",
      "[::ffff:7f00:1]",
      "::ffff:a9fe:a9fe",
      "::ffff:a00:1",
      "::FFFF:C0A8:0101",
      "0:0:0:0:0:ffff:7f00:1",
      "::7f00:1",
      "::127.0.0.1",
      "::ffff:0:7f00:1",
      "64:ff9b::a9fe:a9fe",
      "64:ff9b::7f00:1",
      "64:ff9b::808:808",
      "64:ff9b:1::a00:1",
      "2002:7f00:1::",
      "2002:a9fe:a9fe::1",
      "2001:0:4136:e378:8000:63bf:3fff:fdd2",
      "2001:db8::1",
      "3fff::1",
      "fd00:ec2::254",
      "fe80::1",
      "fe80::1%eth0",
      "fec0::1",
      "ff02::1",
      "100::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("refuse les plages IPv4 réservées manquantes et les formes numériques déguisées", () => {
    for (const ip of ["198.18.0.1", "198.19.255.255", "192.0.0.192", "192.0.2.1", "198.51.100.7", "203.0.113.9", "240.0.0.1", "255.255.255.255", "100.100.100.200", "168.63.129.16", "2130706433", "0x7f000001", "0177.0.0.1", "127.1", "0x7f.1", "pas-une-ip", ""]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("accepte les adresses unicast publiques, y compris IPv4 publique mappée", () => {
    for (const ip of ["1.1.1.1", "198.20.0.1", "172.32.0.1", "2606:4700:4700::1111", "2a00:1450:4007:80a::200e", "::ffff:808:808", "[2606:4700::1111]"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("assertPublicHttpUrl — formes normalisées par l'URL WHATWG (S-01)", () => {
  it("refuse les contournements vérifiés par l'audit et les hôtes internes", () => {
    for (const u of [
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:169.254.169.254]/latest/meta-data/",
      "http://[::ffff:10.0.0.1]/",
      "http://[64:ff9b::a9fe:a9fe]/",
      "http://[fd00:ec2::254]/latest/meta-data/",
      "http://[::]/",
      "http://0177.0.0.1/",
      "http://0x7f.1/",
      "http://127.0.0.1./",
      "http://localhost./",
      "http://metadata/computeMetadata/v1/",
      "http://metadata.google.internal/",
      "http://printer.lan/",
      "http://router.home.arpa/",
      "http://198.18.0.1/",
      "file:///etc/passwd",
      "gopher://example.com/",
      "pas une url",
    ]) {
      expect(() => assertPublicHttpUrl(u), u).toThrow();
    }
  });
  it("n'accepte que les ports web ou applicatifs (≥ 1024) hors services internes", () => {
    for (const u of ["http://example.com:22/", "http://example.com:25/", "http://example.com:6379/", "https://example.com:5432/", "http://example.com:2375/"]) {
      expect(() => assertPublicHttpUrl(u), u).toThrow(/Port/);
    }
    for (const u of ["https://example.com/", "http://example.com:80/", "https://example.com:8443/feed.csv", "https://example.com:8080/x"]) {
      expect(assertPublicHttpUrl(u).hostname, u).toBe("example.com");
    }
  });
});

describe("assertResolvesToPublicAddress — chaque adresse résolue est vérifiée", () => {
  it("refuse si UNE des adresses est interne (y compris sous forme IPv6 normalisée)", async () => {
    await expect(assertResolvesToPublicAddress(new URL("https://mixed.example"), async () => [{ address: "93.184.216.34" }, { address: "::ffff:7f00:1" }])).rejects.toThrow(/privées/);
    await expect(assertResolvesToPublicAddress(new URL("https://nat64.example"), async () => [{ address: "64:ff9b::a9fe:a9fe" }])).rejects.toThrow(/privées/);
  });
  it("renvoie les adresses vérifiées (épinglées ensuite pour la connexion)", async () => {
    await expect(assertResolvesToPublicAddress(new URL("https://ok.example"), async () => [{ address: "93.184.216.34" }, { address: "2606:2800:220:1::1" }])).resolves.toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ]);
  });
});

describe("fetchText — redirections (I-15) et DNS rebinding (I-32)", () => {
  const publicResolver = async () => [{ address: "93.184.216.34" }];
  type Call = { url: string; headers: Record<string, string>; method: string; body: unknown };
  function recorder(routes: Record<string, () => Response>) {
    const calls: Call[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: { ...(init?.headers as Record<string, string>) }, method: init?.method ?? "GET", body: init?.body });
      const route = routes[url];
      return route ? route() : new Response("introuvable", { status: 404 });
    }) as typeof fetch;
    return { calls, fetchImpl };
  }
  const secrets = { Authorization: "Basic c2VjcmV0", Cookie: "session=abc", "X-Api-Key": "k-123" };

  it("retire Authorization, Cookie et clés d'API lors d'une redirection vers un autre hôte", async () => {
    const { calls, fetchImpl } = recorder({
      "https://feeds.supplier.example/catalog.csv": () => new Response(null, { status: 302, headers: { location: "https://cdn.other.example/catalog.csv" } }),
      "https://cdn.other.example/catalog.csv": () => new Response("sku;price\nA;1", { status: 200 }),
    });
    const r = await fetchText("https://feeds.supplier.example/catalog.csv", { userAgent: "test", fetchImpl, resolver: publicResolver, headers: secrets });
    expect(r.text).toContain("sku;price");
    expect(calls[0]!.headers).toMatchObject(secrets);
    const second = Object.keys(calls[1]!.headers).map((k) => k.toLowerCase());
    expect(second).not.toContain("authorization");
    expect(second).not.toContain("cookie");
    expect(second).not.toContain("x-api-key");
    expect(calls[1]!.headers["User-Agent"]).toBe("test");
  });

  it("conserve les en-têtes sur une redirection de même origine", async () => {
    const { calls, fetchImpl } = recorder({
      "https://feeds.supplier.example/a": () => new Response(null, { status: 301, headers: { location: "/b" } }),
      "https://feeds.supplier.example/b": () => new Response("ok", { status: 200 }),
    });
    await fetchText("https://feeds.supplier.example/a", { userAgent: "test", fetchImpl, resolver: publicResolver, headers: secrets });
    expect(calls[1]!.headers).toMatchObject(secrets);
  });

  it("ne renvoie plus les en-têtes même si la chaîne revient ensuite sur l'origine de départ", async () => {
    const { calls, fetchImpl } = recorder({
      "https://a.example/start": () => new Response(null, { status: 302, headers: { location: "https://b.example/hop" } }),
      "https://b.example/hop": () => new Response(null, { status: 302, headers: { location: "https://a.example/end" } }),
      "https://a.example/end": () => new Response("fin", { status: 200 }),
    });
    await fetchText("https://a.example/start", { userAgent: "test", fetchImpl, resolver: publicResolver, headers: secrets });
    expect(calls[2]!.headers.Authorization).toBeUndefined();
  });

  it("refuse le passage https → http (même hôte)", async () => {
    const { calls, fetchImpl } = recorder({
      "https://feeds.supplier.example/catalog.csv": () => new Response(null, { status: 302, headers: { location: "http://feeds.supplier.example/catalog.csv" } }),
      "http://feeds.supplier.example/catalog.csv": () => new Response("en clair", { status: 200 }),
    });
    await expect(fetchText("https://feeds.supplier.example/catalog.csv", { userAgent: "test", fetchImpl, resolver: publicResolver, headers: secrets })).rejects.toThrow(/HTTPS à HTTP/);
    expect(calls).toHaveLength(1);
  });

  it("refuse une redirection vers une IPv6 « IPv4-mappée » normalisée ou un port interne", async () => {
    for (const location of ["http://[::ffff:7f00:1]/admin", "https://[::ffff:a9fe:a9fe]/latest/meta-data/", "https://cache.example:6379/"]) {
      const { calls, fetchImpl } = recorder({ "https://a.example/x": () => new Response(null, { status: 302, headers: { location } }) });
      await expect(fetchText("https://a.example/x", { userAgent: "test", fetchImpl, resolver: publicResolver }), location).rejects.toThrow();
      expect(calls).toHaveLength(1);
    }
  });

  it("307 POST vers une autre origine refusé ; 303 transforme en GET sans corps", async () => {
    const a = recorder({ "https://api.example/token": () => new Response(null, { status: 307, headers: { location: "https://evil.example/collect" } }) });
    await expect(fetchText("https://api.example/token", { userAgent: "test", fetchImpl: a.fetchImpl, resolver: publicResolver, method: "POST", body: "client_secret=s" })).rejects.toThrow(/POST/);
    expect(a.calls).toHaveLength(1);
    const b = recorder({
      "https://api.example/form": () => new Response(null, { status: 303, headers: { location: "https://api.example/result" } }),
      "https://api.example/result": () => new Response("ok", { status: 200 }),
    });
    await fetchText("https://api.example/form", { userAgent: "test", fetchImpl: b.fetchImpl, resolver: publicResolver, method: "POST", body: "x=1" });
    expect(b.calls[1]).toMatchObject({ method: "GET", body: undefined });
  });

  it("borne le nombre de redirections", async () => {
    let n = 0;
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: `https://a.example/${++n}` } })) as typeof fetch;
    await expect(fetchText("https://a.example/0", { userAgent: "test", fetchImpl, resolver: publicResolver })).rejects.toThrow(/Trop de redirections/);
    expect(n).toBe(6);
  });

  it("sans épinglage (fetch injecté / Deno) : un rebinding DNS entre contrôle et connexion fait rejeter la réponse", async () => {
    const answers = ["93.184.216.34", "169.254.169.254"];
    const resolver = vi.fn(async () => [{ address: answers.shift() ?? "169.254.169.254" }]);
    const fetchImpl = vi.fn(async () => new Response("ami-id: secret", { status: 200 })) as unknown as typeof fetch;
    await expect(fetchText("https://rebind.example/latest/meta-data/", { userAgent: "test", fetchImpl, resolver })).rejects.toThrow(/privées/);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("avec épinglage : la connexion reçoit exactement les adresses vérifiées, sans seconde résolution", async () => {
    const resolver = vi.fn(async () => [{ address: "93.184.216.34" }]);
    const pinnedFetch = vi.fn(async (_url: URL, _init: unknown, _addresses: unknown) => new Response("sku;price", { status: 200 }));
    const fetchImpl = vi.fn(async () => new Response("ne doit pas servir")) as unknown as typeof fetch;
    const r = await fetchText("https://feeds.supplier.example/c.csv", { userAgent: "test", resolver, pinnedFetch, fetchImpl });
    expect(r.text).toBe("sku;price");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(pinnedFetch.mock.calls[0]![2]).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});

describe("nodePinnedFetch — connexion épinglée (Node)", () => {
  it("se connecte à l'adresse vérifiée sans résolution DNS du nom, Host conservé, gzip décodé", async () => {
    const { createServer } = await import("node:http");
    const { gzipSync } = await import("node:zlib");
    const seen: Array<{ host: string | undefined; auth: string | undefined }> = [];
    const server = createServer((req, res) => {
      seen.push({ host: req.headers.host, auth: req.headers.authorization });
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-encoding": "gzip" });
      res.end(gzipSync(Buffer.from("sku;price\nA;1")));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      // « .invalid » ne se résout jamais : la réponse prouve que l'adresse épinglée a été utilisée.
      const url = new URL(`http://feeds.supplier.invalid:${port}/c.csv`);
      const controller = new AbortController();
      const res = await nodePinnedFetch(url, { method: "GET", headers: { Authorization: "Bearer t" }, signal: controller.signal }, [{ address: "127.0.0.1", family: 4 }]);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("sku;price\nA;1");
      expect(seen).toEqual([{ host: `feeds.supplier.invalid:${port}`, auth: "Bearer t" }]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
