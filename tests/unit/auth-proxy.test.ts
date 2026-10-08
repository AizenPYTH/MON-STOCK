import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

const { isPublicPath, isMachinePath, isServerActionRequest, updateSession } = await import("@/lib/supabase/proxy");

/** Énumère les routes de pages du groupe (app) depuis le système de fichiers. */
function appRoutes(): string[] {
  const root = path.resolve(__dirname, "../../src/app/(app)");
  const out: string[] = [];
  const walk = (dir: string, route: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        const seg = entry.startsWith("(") ? "" : entry.startsWith("[") ? "123e4567-e89b-12d3-a456-426614174000" : entry;
        walk(full, seg ? `${route}/${seg}` : route);
      } else if (entry === "page.tsx") {
        out.push(route || "/");
      }
    }
  };
  walk(root, "");
  return out;
}

describe("Proxy : routes publiques", () => {
  it("aucune page de l'application (groupe (app)) n'est publique", () => {
    const routes = appRoutes();
    expect(routes.length).toBeGreaterThan(20);
    expect(routes.filter((r) => isPublicPath(r))).toEqual([]);
    expect(isPublicPath("/onboarding")).toBe(false);
    expect(isPublicPath("/api/integrations/ebay/connect")).toBe(false);
  });

  it("les routes publiques sont limitées à des segments complets", () => {
    for (const p of ["/login", "/signup", "/reset-password", "/update-password", "/auth/callback", "/invite/abc", "/api/webhooks/ebay", "/api/cron/sync", "/api/integrations/ebay/callback", "/"]) {
      expect(isPublicPath(p), p).toBe(true);
    }
    for (const p of ["/loginx", "/authentication", "/invitex", "/api/webhooksx", "/api/cron-admin", "/dashboard", "/settings/users"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
    expect(isMachinePath("/api/webhooks/ebay")).toBe(true);
    expect(isMachinePath("/api/webhooks-admin")).toBe(false);
  });

  it("détecte les appels de Server Actions", () => {
    expect(isServerActionRequest({ method: "POST", headers: new Headers({ "Next-Action": "abc" }) })).toBe(true);
    expect(isServerActionRequest({ method: "GET", headers: new Headers({ "Next-Action": "abc" }) })).toBe(false);
    expect(isServerActionRequest({ method: "POST", headers: new Headers() })).toBe(false);
  });
});

describe("Proxy : updateSession", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    getUser.mockReset();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("redirige un visiteur sans session vers /login en conservant la page demandée", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await updateSession(new NextRequest("https://app.example/stock?q=iphone"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/stock?q=iphone");
  });

  it("chaque page de l'application exige une session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const route of appRoutes()) {
      const res = await updateSession(new NextRequest(`https://app.example${route}`));
      expect(res.status, route).toBe(307);
    }
  });

  it("session expirée pendant une Server Action : la requête passe (l'action renvoie un message clair, pas une page HTML)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await updateSession(new NextRequest("https://app.example/stock/new", { method: "POST", headers: { "Next-Action": "7f00" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("formulaire sans JavaScript (POST sans en-tête Next-Action) : redirection 303 vers /login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await updateSession(new NextRequest("https://app.example/settings/users", { method: "POST" }));
    expect(res.status).toBe(303);
  });

  it("utilisateur connecté sur /login : redirigé vers `next` interne, jamais vers un domaine externe", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const ok = await updateSession(new NextRequest("https://app.example/login?next=/invite/abc"));
    expect(new URL(ok.headers.get("location")!).pathname).toBe("/invite/abc");
    for (const evil of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
      const res = await updateSession(new NextRequest(`https://app.example/login?next=${encodeURIComponent(evil)}`));
      const loc = new URL(res.headers.get("location")!);
      expect(loc.origin, evil).toBe("https://app.example");
      expect(loc.pathname).toBe("/dashboard");
    }
  });

  it("ne valide pas de session sur les routes machine (webhooks, cron)", async () => {
    const res = await updateSession(new NextRequest("https://app.example/api/webhooks/ebay", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("laisse passer un utilisateur connecté", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await updateSession(new NextRequest("https://app.example/dashboard"));
    expect(res.status).toBe(200);
  });
});
