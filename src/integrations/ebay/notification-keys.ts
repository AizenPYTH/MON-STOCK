import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";
import { EBAY_PROVIDER, type EbayConfig } from "@/integrations/ebay/config";
import { getApplicationAccessToken } from "@/integrations/ebay/oauth";
import { ebayPublicKeySchema, type EbayPublicKey } from "@/integrations/ebay/webhook-verify";

/**
 * Clés publiques de signature des notifications eBay
 * (GET /commerce/notification/v1/public_key/{public_key_id}, token d'application).
 * - Clé connue : mise en cache 12 h.
 * - kid inconnu d'eBay (404, ou 400 dont le corps d'erreur eBay désigne explicitement l'identifiant
 *   de clé) : PublicKeyNotFoundError → la notification est REJETÉE (401), et le kid est mis en cache
 *   négatif 10 min (un attaquant ne peut pas faire appeler eBay en boucle).
 * - Tout autre 400 (requête refusée, p. ex. token d'application rejeté) : rien ne prouve que le kid
 *   est inconnu → erreur d'infrastructure (503, l'événement n'est pas consommé), token d'application
 *   oublié pour être redemandé, AUCUN cache négatif (une notification authentique n'est pas rejetée 10 min).
 * - Panne (réseau, 5xx, token d'application) : erreur d'infrastructure → 503, l'événement n'est pas consommé.
 */
export class PublicKeyNotFoundError extends Error {
  constructor(readonly kid: string) {
    super(`Clé de signature eBay inconnue (kid=${kid.slice(0, 64)}).`);
    this.name = "PublicKeyNotFoundError";
  }
}

const POSITIVE_TTL_MS = 12 * 3_600_000;
const NEGATIVE_TTL_MS = 10 * 60_000;
const MAX_KID_LENGTH = 200;

interface CacheEntry {
  key: EbayPublicKey | null;
  expiresAt: number;
}

/**
 * Corps d'erreur eBay bien formé ({ errors: [...] }) désignant explicitement l'identifiant de clé
 * publique (paramètre public_key_id, ou message « public key … invalid / not found »).
 */
export function isUnknownKeyError(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((e) => {
    if (!e || typeof e !== "object") return false;
    const err = e as { message?: unknown; longMessage?: unknown; parameters?: unknown };
    const params = Array.isArray(err.parameters) ? err.parameters : [];
    if (params.some((p) => p && typeof p === "object" && /^public_?key_?id$/i.test(String((p as { name?: unknown }).name ?? "")))) return true;
    const text = `${typeof err.message === "string" ? err.message : ""} ${typeof err.longMessage === "string" ? err.longMessage : ""}`;
    return /public[ _]?key/i.test(text) && /(invalid|not found|unknown|does not exist)/i.test(text) && !/token|authoriz|authentic/i.test(text);
  });
}

export class EbayNotificationKeyStore {
  private readonly cache = new Map<string, CacheEntry>();
  private appToken: { accessToken: string; expiresAt: number } | null = null;

  constructor(private readonly config: () => EbayConfig | null) {}

  private async getAppToken(config: EbayConfig): Promise<string> {
    if (this.appToken && this.appToken.expiresAt - Date.now() > 60_000) return this.appToken.accessToken;
    const t = await getApplicationAccessToken(config);
    this.appToken = { accessToken: t.accessToken, expiresAt: t.expiresAt.getTime() };
    return t.accessToken;
  }

  async getPublicKey(kid: string): Promise<EbayPublicKey> {
    if (!kid || kid.length > MAX_KID_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(kid)) throw new PublicKeyNotFoundError(kid);
    const now = Date.now();
    const cached = this.cache.get(kid);
    if (cached && cached.expiresAt > now) {
      if (!cached.key) throw new PublicKeyNotFoundError(kid);
      return cached.key;
    }
    const config = this.config();
    if (!config) throw new ConnectorError("NOT_CONFIGURED", EBAY_PROVIDER, "Intégration eBay non configurée : signature invérifiable.", { retryable: false });
    const token = await this.getAppToken(config);
    const res = await fetchWithRetry(
      `${config.apiBase}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`,
      { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
      { provider: EBAY_PROVIDER, label: "notification:public_key", retries: 2, timeoutMs: 10_000 },
    );
    const json = await readJson(res, EBAY_PROVIDER);
    if (res.status === 404 || (res.status === 400 && isUnknownKeyError(json))) {
      this.cache.set(kid, { key: null, expiresAt: now + NEGATIVE_TTL_MS });
      throw new PublicKeyNotFoundError(kid);
    }
    // 400 non attribuable au kid, 401 : le token d'application est peut-être en cause → redemandé au prochain appel.
    if (res.status === 400 || res.status === 401) this.appToken = null;
    const parsed = ebayPublicKeySchema.safeParse(json);
    if (!res.ok || !parsed.success) {
      throw new ConnectorError("API_ERROR", EBAY_PROVIDER, `Clé publique eBay indisponible pour le moment (HTTP ${res.status}).`, { httpStatus: res.status, details: { label: "notification:public_key" } });
    }
    this.cache.set(kid, { key: parsed.data, expiresAt: now + POSITIVE_TTL_MS });
    return parsed.data;
  }
}
