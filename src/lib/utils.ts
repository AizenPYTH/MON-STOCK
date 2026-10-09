import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export { slugify } from "@/lib/slug";

export function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * URL externe affichable (lien « Voir la source », annonce eBay, image produit…).
 * Les URL proviennent de données tierces (flux fournisseurs, pages publiques, API) :
 * seules http(s) sont acceptées — jamais `javascript:`, `data:`, `vbscript:`, ni URL
 * relative ou avec identifiants intégrés. Retourne `null` si l'URL n'est pas sûre.
 */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url.href;
}

/**
 * Chemin interne sûr pour une redirection (`?next=`). Refuse toute URL absolue ou
 * protocol-relative, y compris les variantes que les navigateurs normalisent en `//`
 * (`/\evil.com`, tabulations / retours à la ligne). Retourne `fallback` sinon.
 */
export function safeInternalPath(raw: unknown, fallback = "/dashboard"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 0x5c /* \\ */ || c < 0x20 || c === 0x7f) return fallback;
  }
  try {
    const base = "https://internal.invalid";
    const resolved = new URL(raw, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
