import { ConnectorError } from "@/integrations/core/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("HTTP");

export interface FetchRetryOptions {
  provider: string;
  /** Délai maximal par tentative (ms). */
  timeoutMs?: number;
  /** Nombre de nouvelles tentatives (en plus de la première). */
  retries?: number;
  /** Étiquette lisible pour les journaux (jamais l'URL complète si elle contient des secrets). */
  label?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;
const MAX_BACKOFF_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_BACKOFF_MS * 4);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), MAX_BACKOFF_MS * 4));
  return null;
}

function backoff(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
  return base + Math.floor(Math.random() * 250);
}

/**
 * fetch avec délai d'attente et nouvelles tentatives bornées sur 429 / 5xx / erreur réseau.
 * Ne lève jamais pour un statut 4xx autre que 429 : l'appelant interprète la réponse.
 * Après épuisement des tentatives : RATE_LIMITED (dernier statut 429) ou API_ERROR.
 */
export async function fetchWithRetry(url: string, init: RequestInit, options: FetchRetryOptions): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const label = options.label ?? new URL(url).pathname;
  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const wait = retryAfterMs(res) ?? backoff(attempt);
          log.warn("réponse transitoire, nouvelle tentative", { provider: options.provider, label, status: res.status, attempt: attempt + 1, waitMs: wait });
          await res.body?.cancel().catch(() => undefined);
          await sleep(wait);
          continue;
        }
        if (res.status === 429) {
          throw new ConnectorError("RATE_LIMITED", options.provider, `Quota API ${options.provider} atteint (HTTP 429) : réessayez dans quelques minutes.`, {
            httpStatus: 429,
            details: { label },
          });
        }
        throw new ConnectorError("API_ERROR", options.provider, `L'API ${options.provider} est indisponible (HTTP ${res.status}).`, { httpStatus: res.status, details: { label } });
      }
      return res;
    } catch (e) {
      if (e instanceof ConnectorError) throw e;
      lastError = e;
      const aborted = e instanceof Error && e.name === "AbortError";
      if (attempt < retries) {
        const wait = backoff(attempt);
        log.warn(aborted ? "délai dépassé, nouvelle tentative" : "erreur réseau, nouvelle tentative", { provider: options.provider, label, attempt: attempt + 1, waitMs: wait });
        await sleep(wait);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const aborted = lastError instanceof Error && lastError.name === "AbortError";
  throw new ConnectorError(
    "API_ERROR",
    options.provider,
    aborted ? `L'API ${options.provider} n'a pas répondu dans le délai imparti (${Math.round(timeoutMs / 1000)} s).` : `Impossible de joindre l'API ${options.provider} (erreur réseau).`,
    { httpStatus: lastStatus, details: { label, reason: lastError instanceof Error ? lastError.message : String(lastError) }, cause: lastError },
  );
}

/** Lit un corps JSON sans lever (retourne null si vide ou invalide). */
export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
