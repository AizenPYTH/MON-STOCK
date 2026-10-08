import { describe, expect, it } from "vitest";
import { safeExternalUrl, safeInternalPath } from "@/lib/utils";
import { activeHref } from "@/components/layout/active-href";

describe("safeExternalUrl", () => {
  it("accepte http(s) et normalise", () => {
    expect(safeExternalUrl("https://fournisseur.example/produit?id=1")).toBe("https://fournisseur.example/produit?id=1");
    expect(safeExternalUrl("  http://exemple.fr  ")).toBe("http://exemple.fr/");
  });
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "/relatif",
    "//hote.example/x",
    "ftp://exemple.fr/fichier",
    "https://user:pass@exemple.fr/",
    "",
    "pas une url",
  ])("refuse %j", (raw) => {
    expect(safeExternalUrl(raw)).toBeNull();
  });
  it("refuse les valeurs non textuelles", () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl(42)).toBeNull();
    expect(safeExternalUrl("https://exemple.fr/" + "a".repeat(3000))).toBeNull();
  });
});

describe("safeInternalPath (paramètre next)", () => {
  it("conserve les chemins internes (avec requête et ancre)", () => {
    expect(safeInternalPath("/stock/alerts")).toBe("/stock/alerts");
    expect(safeInternalPath("/invite/abc?x=1#y")).toBe("/invite/abc?x=1#y");
  });
  it.each(["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example", "evil.example", "javascript:alert(1)", "", "/%0a"])(
    "rejette %j vers le repli",
    (raw) => {
      const out = safeInternalPath(raw, "/dashboard");
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(new URL(out, "https://app.example").origin).toBe("https://app.example");
    },
  );
  it("utilise le repli pour les valeurs absentes ou dangereuses", () => {
    expect(safeInternalPath(undefined)).toBe("/dashboard");
    expect(safeInternalPath("//evil.example", "/onboarding")).toBe("/onboarding");
    expect(safeInternalPath("/\\evil.example")).toBe("/dashboard");
  });
});

describe("activeHref (navigation latérale)", () => {
  const HREFS = ["/dashboard", "/stock", "/sales", "/sourcing", "/suppliers", "/stock/alerts", "/settings/integrations", "/settings/sync", "/settings/users"];
  it.each([
    ["/dashboard", "/dashboard"],
    ["/stock", "/stock"],
    ["/stock/ABC-1/edit", "/stock"],
    ["/stock/new", "/stock"],
    ["/stock/alerts", "/stock/alerts"],
    ["/suppliers/123/offers", "/suppliers"],
    ["/sourcing/offers/abc", "/sourcing"],
    ["/settings/sync/run-1", "/settings/sync"],
    ["/settings/integrations/ebay/setup", "/settings/integrations"],
    ["/sales/", "/sales"],
  ])("%s → %s", (path, expected) => {
    expect(activeHref(path, HREFS)).toBe(expected);
  });
  it("ne confond pas les préfixes partiels", () => {
    expect(activeHref("/stockage", HREFS)).toBeNull();
    expect(activeHref("/settings", HREFS)).toBeNull();
  });
});
