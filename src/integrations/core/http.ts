import { ConnectorError } from "@/integrations/core/errors";
import { DeadlineExceededError, MIN_CALL_REMAINING_MS, isDeadlineExceeded, remainingMs } from "@/integrations/core/deadline";
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
  /**
   * Échéance absolue (ms depuis l'époque) du traitement appelant : le délai de chaque tentative est
   * réduit au temps restant, aucune nouvelle tentative (ni attente) ne dépasse l'échéance, et un
   * appel qui ne peut plus démarrer ou qui est coupé par elle lève DeadlineExceededError.
   */
  deadline?: number | null;
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
  let attemptsMade = retries + 1;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const remaining = remainingMs(options.deadline);
    if (remaining < MIN_CALL_REMAINING_MS) throw new DeadlineExceededError(label);
    // Délai de la tentative borné par le temps restant avant l'échéance du traitement appelant.
    const attemptTimeoutMs = Math.min(timeoutMs, remaining);
    const cutByDeadline = attemptTimeoutMs < timeoutMs;
    const controller = new AbortController();
    // Le délai couvre aussi la lecture du corps (le signal reste attaché à la réponse) :
    // le minuteur n'est annulé qu'en cas d'erreur ; il ne retient pas le processus (unref).
    const timer = setTimeout(() => controller.abort(cutByDeadline ? new DeadlineExceededError(label) : undefined), attemptTimeoutMs);
    (timer as { unref?: () => void }).unref?.();
    // Une nouvelle tentative n'est faite que si l'attente ET un appel utile tiennent avant l'échéance.
    const canRetryAfter = (wait: number) => attempt < retries && remainingMs(options.deadline) - wait >= MIN_CALL_REMAINING_MS;
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        clearTimeout(timer);
        const requested = parseRetryAfterMs(res.headers.get("retry-after"));
        await res.body?.cancel().catch(() => undefined);
        // Quota épuisé pour longtemps (ex. limite journalière) : inutile d'attendre ni de réessayer.
        const tooLong = requested !== null && requested > MAX_RETRY_AFTER_MS;
        const wait = requested ?? backoff(attempt);
        if (!tooLong && canRetryAfter(wait)) {
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
      if (e instanceof ConnectorError || isDeadlineExceeded(e)) throw e;
      lastError = e;
      const aborted = e instanceof Error && e.name === "AbortError";
      // Délai réduit au temps restant puis dépassé : c'est l'échéance du traitement, pas une panne distante.
      if (aborted && cutByDeadline) throw new DeadlineExceededError(label);
      const wait = backoff(attempt);
      if (canRetryAfter(wait)) {
        log.warn(aborted ? "délai dépassé, nouvelle tentative" : "erreur réseau, nouvelle tentative", { provider: options.provider, label, attempt: attempt + 1, waitMs: wait });
        await sleep(wait);
        continue;
      }
      // Plus de nouvelle tentative possible (nombre épuisé, ou échéance trop proche pour réessayer).
      attemptsMade = attempt + 1;
      break;
    }
  }

  const aborted = lastError instanceof Error && lastError.name === "AbortError";
  throw new ConnectorError(
    "API_ERROR",
    options.provider,
    aborted ? `L'API ${options.provider} n'a pas répondu dans le délai imparti (${Math.round(timeoutMs / 1000)} s).` : `Impossible de joindre l'API ${options.provider} (erreur réseau).`,
    { httpStatus: lastStatus, details: { label, attempts: attemptsMade, reason: lastError instanceof Error ? lastError.message : String(lastError) }, cause: lastError },
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
    // Lecture coupée par l'échéance du traitement appelant (voir fetchWithRetry) : propagée telle quelle.
    if (isDeadlineExceeded(e)) throw e;
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
