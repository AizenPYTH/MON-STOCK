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

/** Attente maximale acceptée avant une nouvelle tentative (au-delà : on abandonne et on remonte RATE_LIMITED). */
export const MAX_RETRY_AFTER_MS = MAX_BACKOFF_MS * 4;

/** Délai demandé par l'en-tête Retry-After (secondes ou date HTTP), non borné. */
export function parseRetryAfterMs(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
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
    // Le délai couvre aussi la lecture du corps (le signal reste attaché à la réponse) :
    // le minuteur n'est annulé qu'en cas d'erreur ; il ne retient pas le processus (unref).
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        clearTimeout(timer);
        const requested = parseRetryAfterMs(res.headers.get("retry-after"));
        await res.body?.cancel().catch(() => undefined);
        // Quota épuisé pour longtemps (ex. limite journalière) : inutile d'attendre ni de réessayer.
        const tooLong = requested !== null && requested > MAX_RETRY_AFTER_MS;
        if (attempt < retries && !tooLong) {
          const wait = requested ?? backoff(attempt);
          log.warn("réponse transitoire, nouvelle tentative", { provider: options.provider, label, status: res.status, attempt: attempt + 1, waitMs: wait });
          await sleep(wait);
          continue;
        }
        const retryAfterSeconds = requested !== null ? Math.ceil(requested / 1000) : null;
        if (res.status === 429) {
          const when = retryAfterSeconds !== null && retryAfterSeconds > 60 ? `réessayez dans ${Math.ceil(retryAfterSeconds / 60)} min` : "réessayez dans quelques minutes";
          throw new ConnectorError("RATE_LIMITED", options.provider, `Quota API ${options.provider} atteint (HTTP 429) : ${when}.`, {
            httpStatus: 429,
            details: { label, retryAfterSeconds, attempts: attempt + 1 },
          });
        }
        throw new ConnectorError("API_ERROR", options.provider, `L'API ${options.provider} est indisponible (HTTP ${res.status}) après ${attempt + 1} tentative(s).`, {
          httpStatus: res.status,
          details: { label, attempts: attempt + 1 },
        });
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ConnectorError) throw e;
      lastError = e;
      const aborted = e instanceof Error && e.name === "AbortError";
      if (attempt < retries) {
        const wait = backoff(attempt);
        log.warn(aborted ? "délai dépassé, nouvelle tentative" : "erreur réseau, nouvelle tentative", { provider: options.provider, label, attempt: attempt + 1, waitMs: wait });
        await sleep(wait);
        continue;
      }
    }
  }

  const aborted = lastError instanceof Error && lastError.name === "AbortError";
  throw new ConnectorError(
    "API_ERROR",
    options.provider,
    aborted ? `L'API ${options.provider} n'a pas répondu dans le délai imparti (${Math.round(timeoutMs / 1000)} s).` : `Impossible de joindre l'API ${options.provider} (erreur réseau).`,
    { httpStatus: lastStatus, details: { label, attempts: retries + 1, reason: lastError instanceof Error ? lastError.message : String(lastError) }, cause: lastError },
  );
}

/**
 * Lit le corps texte d'une réponse. Une coupure (délai dépassé pendant la lecture, connexion
 * interrompue) devient une ConnectorError API_ERROR : jamais une erreur brute non typée.
 */
export async function readBodyText(res: Response, provider = "api", label = "body"): Promise<string> {
  try {
    return await res.text();
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ConnectorError(
      "API_ERROR",
      provider,
      aborted ? `L'API ${provider} n'a pas fini d'envoyer sa réponse dans le délai imparti.` : `Réponse de l'API ${provider} interrompue pendant la lecture.`,
      { httpStatus: res.status, details: { label, reason: e instanceof Error ? e.message : String(e) }, cause: e },
    );
  }
}

/** Lit un corps JSON (retourne null si vide ou invalide ; lève API_ERROR si la lecture est interrompue). */
export async function readJson(res: Response, provider = "api"): Promise<unknown> {
  const text = await readBodyText(res, provider);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
