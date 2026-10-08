/**
 * Sécurité de l'intégration eBay : nettoyage des secrets, codes d'erreur OAuth (pas de texte
 * libre dans l'URL), anti-CSRF du démarrage OAuth, filtre de recherche PostgREST, cron.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scrubDeep, scrubSecrets } from "@/integrations/core/sanitize";
import { sanitizeDetails, sanitizeMessage } from "@/services/sync/context";
import { describeError, ConnectorError } from "@/integrations/core/errors";
import { isCrossSiteRequest, isUuid, oauthErrorCodeFor, oauthErrorMessage, OAUTH_GENERIC_ERROR } from "@/features/integrations/oauth-flow";
import { listingSearchFilter } from "@/features/integrations/queries";
import { authorizeCron } from "@/lib/cron-auth";

const TOKEN = "v^1.1#i^1#r^1#p^3#I^3#f^0#t^Ul4xMF8yOjEyMzQ1Njc4OUFCQ0RFRg==";

describe("nettoyage des secrets", () => {
  it("masque tokens eBay, Bearer/Basic, JWT, paramètres d'URL et secrets chiffrés", () => {
    const text = [
      `Authorization: Bearer ${TOKEN}`,
      "Basic YXBwLWlkOmNlcnQtaWQtc2VjcmV0",
      "https://api.ebay.com/x?access_token=abc123&limit=10",
      "grant_type=refresh_token&refresh_token=zzz999",
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ",
      "v1:AAAAAAAAAAAAAAAA:QUJDREVGRw==:AAAAAAAAAAAAAAAAAAAAAA==",
      '{"access_token":"plain-secret","ok":1}',
    ].join(" | ");
    const out = scrubSecrets(text);
    for (const leak of [TOKEN, "YXBwLWlkOmNlcnQtaWQtc2VjcmV0", "abc123", "zzz999", "c2lnbmF0dXJlLXNpZ25hdHVyZQ", "QUJDREVGRw==", "plain-secret"]) expect(out).not.toContain(leak);
    expect(out).toContain("limit=10");
    expect(scrubSecrets("Commande 12-34567-89012 : quantité invalide")).toBe("Commande 12-34567-89012 : quantité invalide");
  });

  it("sanitizeDetails : clés sensibles masquées + valeurs scrubées en profondeur + taille bornée", () => {
    const d = sanitizeDetails({ refreshToken: "x", nested: { list: [`Bearer ${TOKEN}`], label: "fulfillment:getOrders" }, big: "y".repeat(5000) });
    expect(JSON.stringify(d)).not.toContain(TOKEN);
    expect(d).toMatchObject({ truncated: true });
    const small = sanitizeDetails({ refreshToken: "x", nested: { list: [`Bearer ${TOKEN}`], label: "fulfillment:getOrders" } });
    expect(small).toEqual({ refreshToken: "[REDACTED]", nested: { list: ["Bearer [REDACTED]"], label: "fulfillment:getOrders" } });
    expect(scrubDeep({ authorization: "Bearer abcdefgh" })).toEqual({ authorization: "[REDACTED]" });
  });

  it("sanitizeMessage borne la longueur et nettoie ; describeError n'expose pas de token", () => {
    expect(sanitizeMessage(`x access_token=${"a".repeat(3000)}`, 100).length).toBeLessThanOrEqual(100);
    const e = new ConnectorError("API_ERROR", "ebay", "Erreur HTTP 500", { details: { label: "trading:GetMyeBaySelling" } });
    expect(JSON.stringify(describeError(e))).not.toMatch(/v\^1\.1/);
  });
});

describe("flux OAuth : codes d'erreur et CSRF", () => {
  it("un texte arbitraire dans ?error= n'est jamais recopié dans la page", () => {
    expect(oauthErrorMessage("access_denied")).toMatch(/refusé l'autorisation/);
    expect(oauthErrorMessage("Appelez le 0800 000 000 pour débloquer votre compte")).toBe(OAUTH_GENERIC_ERROR);
    expect(oauthErrorMessage("constructor")).toBe(OAUTH_GENERIC_ERROR);
    expect(oauthErrorMessage(null)).toBeNull();
  });

  it("chaque type d'échec d'échange a un code (et un message en français)", () => {
    expect(oauthErrorCodeFor(new ConnectorError("AUTH_EXPIRED", "ebay", "x"))).toBe("exchange_denied");
    expect(oauthErrorCodeFor(new ConnectorError("NOT_CONFIGURED", "ebay", "x"))).toBe("app_credentials");
    expect(oauthErrorCodeFor(new ConnectorError("RATE_LIMITED", "ebay", "x"))).toBe("rate_limited");
    expect(oauthErrorCodeFor(new ConnectorError("INVALID_RESPONSE", "ebay", "x"))).toBe("ebay_unavailable");
    expect(oauthErrorCodeFor(new Error("boom"))).toBe("internal");
    for (const code of ["exchange_denied", "app_credentials", "rate_limited", "ebay_unavailable", "internal"]) expect(oauthErrorMessage(code)).not.toBe(OAUTH_GENERIC_ERROR);
  });

  it("isCrossSiteRequest : Origin étrangère, Sec-Fetch-Site cross-site et Origin null refusées", () => {
    const allowed = ["https://app.monstock.fr"];
    expect(isCrossSiteRequest(new Headers({ origin: "https://app.monstock.fr", "sec-fetch-site": "same-origin" }), allowed)).toBe(false);
    expect(isCrossSiteRequest(new Headers({}), allowed)).toBe(false);
    expect(isCrossSiteRequest(new Headers({ origin: "https://evil.example" }), allowed)).toBe(true);
    expect(isCrossSiteRequest(new Headers({ "sec-fetch-site": "cross-site" }), allowed)).toBe(true);
    expect(isCrossSiteRequest(new Headers({ origin: "null" }), allowed)).toBe(true);
  });

  it("isUuid", () => {
    expect(isUuid("6f1c1c4e-2b7a-4c55-9e0a-8f6b1d2c3e4f")).toBe(true);
    expect(isUuid("6f1c1c4e-2b7a-4c55-9e0a-8f6b1d2c3e4f&x=1")).toBe(false);
  });
});

describe("recherche d'annonces : filtre PostgREST", () => {
  it("neutralise les caractères structurants (aucune condition injectée)", () => {
    const f = listingSearchFilter("iphone,organization_id.neq.x),(\"a\\");
    expect(f).toBe('title.ilike."%iphone organization_id.neq.x a%",external_sku.ilike."%iphone organization_id.neq.x a%",external_listing_id.ilike."%iphone organization_id.neq.x a%"');
    expect(listingSearchFilter("  ,()  ")).toBeNull();
    expect(listingSearchFilter("IPH13_128")).toContain('"%IPH13_128%"');
  });
});

describe("authorizeCron (temps constant, longueur incluse)", () => {
  const prev = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "0123456789abcdef0123456789abcdef";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });
  it("refuse préfixe, suffixe, casse différente et en-tête absent ; accepte le bon secret", () => {
    const req = (h?: string) => new Request("http://x/api/cron/sync", h ? { headers: { authorization: h } } : {});
    for (const bad of [undefined, "Bearer 0123456789abcdef", "Bearer 0123456789abcdef0123456789abcdef0", "bearer 0123456789abcdef0123456789abcdef", "0123456789abcdef0123456789abcdef"]) {
      const r = authorizeCron(req(bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    }
    expect(authorizeCron(req("Bearer 0123456789abcdef0123456789abcdef")).ok).toBe(true);
  });
});
