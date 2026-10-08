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
  /** méthode HTTP (GET par défaut ; POST uniquement pour les API officielles authentifiées) */
  method?: "GET" | "POST";
  /** en-têtes supplémentaires (Authorization, en-têtes propres à une API…) ; jamais de cookie de session */
  headers?: Record<string, string>;
  /** corps de requête (POST) */
  body?: string;
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

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/** Adresse IPv4/IPv6 privée, locale ou réservée (jamais crawlée). */
export function isPrivateAddress(address: string): boolean {
  const a = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(a) === 4) {
    const parts = a.split(".").map(Number);
    const [p0 = 0, p1 = 0] = parts;
    if (p0 === 10 || p0 === 127 || p0 === 0) return true;
    if (p0 === 169 && p1 === 254) return true;
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    if (p0 === 192 && p1 === 168) return true;
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true; // CGNAT
    if (p0 >= 224) return true; // multicast / réservé
    return false;
  }
  if (isIP(a) === 6) {
    if (a === "::" || a === "::1") return true;
    if (a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true; // link-local, ULA
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return false;
  }
  return false;
}

/** Vrai si le nom d'hôte est une adresse IP littérale (y compris formes décimales/hexadécimales/octales). */
function isIpLiteralLike(host: string): boolean {
  if (isIP(host.replace(/^\[|\]$/g, ""))) return true;
  return /^(0x[0-9a-f]+|\d+)$/i.test(host) || /^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){1,3}$/i.test(host);
}

export function assertPublicHttpUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`URL non supportée (${u.protocol}) : seuls http et https sont acceptés.`);
  if (u.username || u.password) throw new Error("Les identifiants dans l'URL ne sont pas acceptés.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Les adresses locales ou privées ne sont pas accessibles.");
  }
  if (isIpLiteralLike(host)) {
    // Les formes décimales/hexadécimales (ex. 2130706433) sont refusées ; les IP classiques sont vérifiées.
    if (!isIP(host.replace(/^\[|\]$/g, "")) || isPrivateAddress(host)) throw new Error("Les adresses locales ou privées ne sont pas accessibles.");
  }
  return u;
}

/** Résout le nom d'hôte et refuse toute adresse privée (protection SSRF, y compris DNS pointant vers le réseau interne). */
export async function assertResolvesToPublicAddress(u: URL, resolver: (host: string) => Promise<Array<{ address: string }>> = (h) => lookup(h, { all: true })): Promise<void> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Les adresses locales ou privées ne sont pas accessibles.");
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolver(host);
  } catch {
    throw new Error(`Nom d'hôte introuvable : ${host}.`);
  }
  if (addresses.length === 0) throw new Error(`Nom d'hôte introuvable : ${host}.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("Les adresses locales ou privées ne sont pas accessibles.");
}

const MAX_REDIRECTS = 5;

async function readBounded(res: Response, maxBytes: number): Promise<ArrayBuffer> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error(`Réponse trop volumineuse (${declared} octets, maximum ${maxBytes}).`);
  if (!res.body) return new ArrayBuffer(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Réponse trop volumineuse (plus de ${maxBytes} octets).`);
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

export async function fetchText(url: string, options: FetchTextOptions & { encoding?: string | null; resolver?: (host: string) => Promise<Array<{ address: string }>> }): Promise<FetchTextResult> {
  let target = assertPublicHttpUrl(url);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response | null = null;
    // Redirections suivies manuellement : chaque saut est revalidé (pas de rebond vers une adresse interne).
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertResolvesToPublicAddress(target, options.resolver);
      res = await doFetch(target.toString(), {
        method: options.method ?? "GET",
        redirect: "manual",
        headers: { "User-Agent": options.userAgent, Accept: options.accept ?? "text/html,application/xhtml+xml,application/xml,text/csv,application/json;q=0.9,*/*;q=0.8", ...(options.headers ?? {}) },
        body: options.method === "POST" ? options.body ?? "" : undefined,
        signal: controller.signal,
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop === MAX_REDIRECTS) throw new Error("Trop de redirections.");
        await res.body?.cancel().catch(() => undefined);
        target = assertPublicHttpUrl(new URL(location, target).toString());
        continue;
      }
      break;
    }
    if (!res) throw new Error("Aucune réponse.");
    const buffer = await readBounded(res, maxBytes);
    const contentType = res.headers.get("content-type");
    const charset = contentType?.match(/charset=([\w-]+)/i)?.[1] ?? null;
    return { ok: res.ok, status: res.status, text: decodeBytes(buffer, options.encoding ?? charset), contentType, bytes: buffer.byteLength, finalUrl: target.toString() };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`Délai dépassé (${timeoutMs / 1000} s) pour ${target.hostname}.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
