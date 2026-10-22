/**
 * Helpers de lecture TOLÉRANTE des réponses eBay (REST JSON) pour le conseiller :
 * un champ absent ou au format inattendu devient `null` (jamais une valeur inventée).
 * Aucune fonction de ce module n'appelle le réseau.
 */

export type Json = Record<string, unknown>;

export interface MoneyValue {
  value: number | null;
  currency: string | null;
}

export function rec(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

export function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}

export function recs(v: unknown): Json[] {
  return list(v).map(rec).filter((x): x is Json => x !== null);
}

export function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

/** Date ISO normalisée, ou null. */
export function iso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Montant REST eBay { value: "12.50", currency: "EUR" } → { value: 12.5, currency: "EUR" } (null si absent). */
export function amount(v: unknown): MoneyValue | null {
  const r = rec(v);
  if (!r) return null;
  const value = num(r.value);
  const currency = str(r.currency);
  if (value === null && !currency) return null;
  return { value, currency: currency && currency.length === 3 ? currency.toUpperCase() : null };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ajoute un montant à un total par devise (montants inconnus ignorés, jamais comptés à 0). */
export function addTo(totals: Record<string, number>, m: MoneyValue | null, sign = 1): void {
  if (!m || m.value === null) return;
  const c = m.currency ?? "?";
  totals[c] = round2((totals[c] ?? 0) + sign * m.value);
}

export function clip(s: string | null, max: number): string | null {
  if (s === null) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Numéros de téléphone commençant par « 0 » ou un indicatif « +33 » : séparateurs espace / point, ou
// tirets par paires (06-12-34-56-78, +33-6-12-34-56-78 ; audit I-26). Ni les numéros d'objet eBay
// (12 chiffres, jamais en 0) ni les numéros de commande (xx-xxxxx-xxxxx, même commençant par 0).
const PHONE = /(?<![\w-])(?:(?:\+\d{1,3}[ .]?|0)\d(?:[ .]?\d){7,10}|(?:\+\d{1,3}-|0)\d(?:-\d{2}){4})(?![\w-])/g;

/**
 * Masque les coordonnées (e-mails, téléphones) d'un texte libre écrit par un acheteur avant de
 * l'envoyer au modèle : elles ne sont jamais utiles à l'analyse.
 */
export function maskPersonalData(s: string | null): string | null {
  if (s === null) return null;
  return s.replace(EMAIL, "[e-mail masqué]").replace(PHONE, "[téléphone masqué]");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** HTML (corps de message eBay) → texte brut lisible. */
export function htmlToText(html: string | null): string | null {
  if (html === null) return null;
  const t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith("#") && /^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
  return t === "" ? null : t;
}

/** Date au format eBay Analytics (yyyyMMdd, UTC). */
export function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
