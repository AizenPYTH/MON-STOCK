import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanEnvValue, normalizeBaseUrl, siteUrl } from "@/lib/site";

describe("valeurs d'environnement collées", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("retire espaces, retours à la ligne et guillemets", () => {
    expect(cleanEnvValue('  "sb_publishable_x"\n')).toBe("sb_publishable_x");
    expect(cleanEnvValue("   ")).toBeUndefined();
    expect(cleanEnvValue(undefined)).toBeUndefined();
  });

  it("ajoute https:// et retire le / final", () => {
    expect(normalizeBaseUrl("mon-stock.vercel.app/")).toBe("https://mon-stock.vercel.app");
    expect(normalizeBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("siteUrl : NEXT_PUBLIC_APP_URL, sinon l'adresse Vercel", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "mon-stock-abc.vercel.app");
    expect(siteUrl()).toBe("https://mon-stock-abc.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", " monstock.fr ");
    expect(siteUrl()).toBe("https://monstock.fr");
  });
});
