/**
 * W-33 / Q-22 (web) : CSP du site. Le navigateur ne se connecte qu'au site lui-même (aucun client
 * Supabase navigateur) ; images https (photos fournisseurs) + data, sans blob.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

const ROOT = path.resolve(import.meta.dirname, "../..");

async function cspDirectives(): Promise<Map<string, string[]>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const value = rules.flatMap((r) => r.headers).find((h) => h.key === "Content-Security-Policy")?.value ?? "";
  return new Map(
    value
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...sources]) => [name!, sources]),
  );
}

describe("CSP du site web", () => {
  it("connect-src limité à la même origine (production)", async () => {
    const csp = await cspDirectives();
    expect(csp.get("connect-src")).toEqual(["'self'"]);
  });

  it("img-src : même origine, data et https (photos produit), sans blob", async () => {
    const csp = await cspDirectives();
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "https:"]);
  });

  it("garde-fous inchangés : pas d'iframe, objets interdits, formulaires vers le site ou eBay", async () => {
    const csp = await cspDirectives();
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'self'", "https://*.ebay.com"]);
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("aucun client Supabase navigateur ni connexion directe depuis un composant client", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (/createBrowserClient|supabase\.co|new WebSocket\(|new EventSource\(/.test(src) && /^["']use client["']/m.test(src)) offenders.push(path.relative(ROOT, p));
          if (/createBrowserClient/.test(src)) offenders.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});
