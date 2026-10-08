/**
 * Récupération HTTP bornée (timeout, taille maximale, User-Agent explicite).
 * Aucune gestion de cookies, de session ou de contournement : une requête GET publique.
 */
export interface FetchTextOptions {
  userAgent: string;
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
  fetchImpl?: typeof fetch;
}

export interface FetchTextResult {
  ok: boolean;
  status: number;
  text: string;
  contentType: string | null;
  bytes: number;
  finalUrl: string;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export function decodeBytes(buffer: ArrayBuffer, encoding: string | null | undefined): string {
  const enc = (encoding ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(enc, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

export function assertPublicHttpUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`URL non supportée (${u.protocol}) : seuls http et https sont acceptés.`);
  if (u.username || u.password) throw new Error("Les identifiants dans l'URL ne sont pas acceptés.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::1") {
    throw new Error("Les adresses locales ou privées ne sont pas accessibles.");
  }
  return u;
}

export async function fetchText(url: string, options: FetchTextOptions & { encoding?: string | null }): Promise<FetchTextResult> {
  const target = assertPublicHttpUrl(url);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": options.userAgent, Accept: options.accept ?? "text/html,application/xhtml+xml,application/xml,text/csv,application/json;q=0.9,*/*;q=0.8" },
      signal: controller.signal,
    });
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) throw new Error(`Réponse trop volumineuse (${declared} octets, maximum ${maxBytes}).`);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error(`Réponse trop volumineuse (${buffer.byteLength} octets, maximum ${maxBytes}).`);
    const contentType = res.headers.get("content-type");
    const charset = contentType?.match(/charset=([\w-]+)/i)?.[1] ?? null;
    return { ok: res.ok, status: res.status, text: decodeBytes(buffer, options.encoding ?? charset), contentType, bytes: buffer.byteLength, finalUrl: res.url || target.toString() };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`Délai dépassé (${timeoutMs / 1000} s) pour ${target.hostname}.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
