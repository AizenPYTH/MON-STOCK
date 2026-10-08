import { z } from "zod";
import { ConnectorError } from "@/integrations/core/errors";
import type { ConnectorAuth } from "@/integrations/core/connector";
import { fetchWithRetry, readJson } from "@/integrations/core/http";
import { EBAY_PROVIDER } from "@/integrations/ebay/config";

/** Format d'erreur standard des API REST eBay. */
export const ebayRestErrorSchema = z.object({
  errors: z.array(
    z.object({
      errorId: z.number().optional(),
      domain: z.string().optional(),
      category: z.string().optional(),
      message: z.string().optional(),
      longMessage: z.string().optional(),
    }),
  ),
});

export function summarizeRestErrors(json: unknown): { message: string; errorIds: number[] } {
  const parsed = ebayRestErrorSchema.safeParse(json);
  if (!parsed.success || parsed.data.errors.length === 0) return { message: "", errorIds: [] };
  const first = parsed.data.errors[0];
  return {
    message: first?.longMessage ?? first?.message ?? "",
    errorIds: parsed.data.errors.map((e) => e.errorId).filter((x): x is number => typeof x === "number"),
  };
}

/**
 * Appel REST authentifié par le token utilisateur. En cas de 401, un rafraîchissement
 * forcé est tenté UNE fois ; un second 401 signifie que l'autorisation est révoquée.
 */
export async function ebayRestGet(auth: ConnectorAuth, url: string, label: string, options: { marketplaceId?: string } = {}): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await auth.getAccessToken({ forceRefresh: attempt > 0 });
    const res = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Language": "fr-FR",
          ...(options.marketplaceId ? { "X-EBAY-C-MARKETPLACE-ID": options.marketplaceId } : {}),
        },
      },
      { provider: EBAY_PROVIDER, label },
    );
    const json = await readJson(res);
    if (res.status === 401) {
      if (attempt === 0) continue;
      const { message, errorIds } = summarizeRestErrors(json);
      throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, "Impossible de synchroniser eBay : le token d'autorisation a expiré ou a été révoqué.", {
        httpStatus: 401,
        details: { label, ebayMessage: message || null, errorIds },
        retryable: false,
      });
    }
    if (res.status === 403) {
      const { message, errorIds } = summarizeRestErrors(json);
      throw new ConnectorError("AUTH_EXPIRED", EBAY_PROVIDER, `eBay refuse l'accès (${message || "scope insuffisant"}). Reconnectez votre compte pour accorder les autorisations nécessaires.`, {
        httpStatus: 403,
        details: { label, ebayMessage: message || null, errorIds },
        retryable: false,
      });
    }
    if (!res.ok) {
      const { message, errorIds } = summarizeRestErrors(json);
      throw new ConnectorError("API_ERROR", EBAY_PROVIDER, `Erreur de l'API eBay (HTTP ${res.status})${message ? ` : ${message}` : ""}.`, {
        httpStatus: res.status,
        details: { label, errorIds },
        retryable: res.status >= 500,
      });
    }
    return json;
  }
  throw new ConnectorError("API_ERROR", EBAY_PROVIDER, "Appel eBay interrompu.", { details: { label } });
}
