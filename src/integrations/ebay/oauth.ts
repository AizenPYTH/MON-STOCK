import { z } from "zod";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";
import type { TokenSet } from "@/integrations/core/types";
import { EBAY_PROVIDER, ebayScopeList, type EbayConfig } from "@/integrations/ebay/config";

/**
 * OAuth 2.0 « authorization code grant » eBay.
 * Le vendeur s'authentifie CHEZ eBay ; nous ne voyons jamais son mot de passe.
 * Documentation : https://developer.ebay.com/api-docs/static/oauth-authorization-code-grant.html
 */

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});

const tokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export function buildAuthorizeUrl(config: EbayConfig, state: string, scopes: string[] = ebayScopeList()): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  // eBay attend le RuName (pas une URL) dans redirect_uri.
  url.searchParams.set("redirect_uri", config.ruName);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  // Force l'écran de consentement : évite de réutiliser silencieusement une session eBay.
  url.searchParams.set("prompt", "login");
  return url.toString();
}

function basicAuth(config: EbayConfig): string {
  return "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
}

async function tokenRequest(config: EbayConfig, body: URLSearchParams, label: string): Promise<z.infer<typeof tokenResponseSchema>> {
  const res = await fetchWithRetry(
    config.tokenUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(config), Accept: "application/json" },
      body: body.toString(),
    },
    { provider: EBAY_PROVIDER, label, retries: 2, timeoutMs: 20_000 },
  );
  const json = await readJson(res);
  if (!res.ok) {
    const err = tokenErrorSchema.safeParse(json);
    const code = err.success ? err.data.error : `http_${res.status}`;
    const description = err.success ? err.data.error_description : undefined;
    // invalid_client arrive aussi en HTTP 401 : il concerne l'application, pas le vendeur.
    if (code === "invalid_client" || code === "unauthorized_client") {
      throw new ConnectorError("NOT_CONFIGURED", EBAY_PROVIDER, "eBay refuse les identifiants de l'application (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET invalides ou environnement production/sandbox incohérent).", {
        httpStatus: res.status,
        details: { oauthError: code, description: description ?? null, step: label },
        retryable: false,
      });
    }
    if (code === "invalid_grant" || code === "invalid_token" || res.status === 401) {
      throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "L'autorisation eBay n'est plus valide (le token a expiré ou a été révoqué). Reconnectez votre compte eBay.", {
        httpStatus: res.status,
        details: { oauthError: code, description: description ?? null, step: label },
        retryable: false,
      });
    }
    throw new ConnectorError("API_ERROR", EBAY_PROVIDER, `eBay a refusé la demande de token (${code}${description ? ` : ${description}` : ""}).`, {
      httpStatus: res.status,
      details: { oauthError: code, description: description ?? null, step: label },
      retryable: false,
    });
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ConnectorError("INVALID_RESPONSE", EBAY_PROVIDER, "Réponse de token eBay inattendue (format non reconnu).", { details: { step: label, issues: parsed.error.issues.map((i) => i.path.join(".")) } });
  }
  return parsed.data;
}

function toTokenSet(data: z.infer<typeof tokenResponseSchema>, now: Date, previousRefresh?: { token: string | null; expiresAt: Date | null }): TokenSet {
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
    refreshToken: data.refresh_token ?? previousRefresh?.token ?? null,
    refreshTokenExpiresAt: data.refresh_token_expires_in ? new Date(now.getTime() + data.refresh_token_expires_in * 1000) : (previousRefresh?.expiresAt ?? null),
    tokenType: data.token_type ?? "User Access Token",
  };
}

/** Échange le code d'autorisation (callback) contre un access token + refresh token (~18 mois). */
export async function exchangeAuthorizationCode(config: EbayConfig, code: string, now: Date = new Date()): Promise<TokenSet> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.ruName });
  const data = await tokenRequest(config, body, "oauth:exchange_code");
  return toTokenSet(data, now);
}

/** Rafraîchit l'access token (durée ~2 h). eBay ne renvoie pas de nouveau refresh token. */
export async function refreshAccessToken(config: EbayConfig, refreshToken: string, scopes: string[] = ebayScopeList(), now: Date = new Date()): Promise<TokenSet> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, scope: scopes.join(" ") });
  const data = await tokenRequest(config, body, "oauth:refresh_token");
  return toTokenSet(data, now, { token: refreshToken, expiresAt: null });
}

/**
 * Token d'application (client_credentials, scope de base) : utilisé uniquement pour les
 * appels qui ne concernent pas un vendeur (ex. clés publiques des notifications).
 */
export async function getApplicationAccessToken(config: EbayConfig, now: Date = new Date()): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" });
  const data = await tokenRequest(config, body, "oauth:client_credentials");
  return { accessToken: data.access_token, expiresAt: new Date(now.getTime() + data.expires_in * 1000) };
}
