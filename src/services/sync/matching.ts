/**
 * Suggestions de correspondance annonce ↔ SKU (module pur, testé unitairement).
 * Une suggestion n'est JAMAIS appliquée automatiquement : seule la correspondance exacte
 * de SKU (gérée par le moteur) est déterministe. Ici on calcule une confiance 0–1 et
 * les raisons, pour validation humaine.
 */

export interface ListingForMatching {
  title: string;
  externalSku: string | null;
  variationAttributes: Record<string, string>;
  ean?: string | null;
}

export interface SkuCandidate {
  skuId: string;
  code: string;
  barcode: string | null;
  productName: string;
  brand: string | null;
  variantName: string | null;
  attributes: Record<string, string>;
  ean: string | null;
  mpn: string | null;
}

export type SuggestionMethod = "ean" | "sku_partial" | "attributes" | "title_similarity";

export interface SuggestionScore {
  skuId: string;
  confidence: number;
  method: SuggestionMethod;
  reasons: string[];
}

const STOPWORDS = new Set(["de", "la", "le", "les", "et", "en", "pour", "avec", "du", "des", "un", "une", "the", "and", "with", "for", "of", "a", "an", "neuf", "new", "lot"]);
const COLORS: Record<string, string> = {
  noir: "black", black: "black", blanc: "white", white: "white", bleu: "blue", blue: "blue", rouge: "red", red: "red", vert: "green", green: "green",
  gris: "gray", gray: "gray", grey: "gray", argent: "silver", silver: "silver", or: "gold", gold: "gold", rose: "pink", pink: "pink", violet: "purple", purple: "purple",
  jaune: "yellow", yellow: "yellow", orange: "orange", marron: "brown", brown: "brown", graphite: "graphite", minuit: "midnight", midnight: "midnight",
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Normalise capacités (128 Go → 128gb, 1 To → 1tb) et découpe en tokens significatifs. */
export function tokenize(text: string): string[] {
  const lower = stripAccents(text.toLowerCase())
    .replace(/(\d+)\s*(go|gb|gib)\b/g, "$1gb")
    .replace(/(\d+)\s*(to|tb|tib)\b/g, "$1tb")
    .replace(/(\d+)\s*(mo|mb)\b/g, "$1mb");
  const out: string[] = [];
  for (const raw of lower.split(/[^a-z0-9]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    if (raw.length < 2 && !/^\d$/.test(raw)) continue;
    out.push(COLORS[raw] ?? raw);
  }
  return out;
}

export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}

const STORAGE_RE = /^\d+(gb|tb|mb)$/;
const EAN_RE = /^\d{8,14}$/;

function normalizeSku(s: string): string {
  return stripAccents(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const candidateTokenCache = new WeakMap<SkuCandidate, Set<string>>();

/** Tokens d'un SKU candidat, calculés une seule fois par objet (un run compare des centaines d'annonces aux mêmes SKU). */
function candidateTokens(c: SkuCandidate): Set<string> {
  const cached = candidateTokenCache.get(c);
  if (cached) return cached;
  const parts = [c.brand ?? "", c.productName, c.variantName ?? "", ...Object.values(c.attributes), c.mpn ?? ""];
  const set = new Set(tokenize(parts.join(" ")));
  candidateTokenCache.set(c, set);
  return set;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listingTokens(l: ListingForMatching): Set<string> {
  return new Set(tokenize([l.title, ...Object.values(l.variationAttributes)].join(" ")));
}

function storageTokens(tokens: Set<string>): Set<string> {
  return new Set([...tokens].filter((t) => STORAGE_RE.test(t)));
}
function colorTokens(tokens: Set<string>): Set<string> {
  const known = new Set(Object.values(COLORS));
  return new Set([...tokens].filter((t) => known.has(t)));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function scoreCandidate(listing: ListingForMatching, candidate: SkuCandidate): SuggestionScore | null {
  const reasons: string[] = [];

  // 1. EAN / code-barres (identifiant universel) : confiance très élevée.
  const listingEan = listing.ean?.trim() || (listing.externalSku && EAN_RE.test(listing.externalSku.trim()) ? listing.externalSku.trim() : null);
  if (listingEan && (candidate.ean === listingEan || candidate.barcode === listingEan)) {
    return { skuId: candidate.skuId, confidence: 0.95, method: "ean", reasons: [`EAN identique (${listingEan})`] };
  }

  // 2. SKU partiel : l'un contient l'autre (ex. « IPH13-128-BLK » vs « IPH13-128-BLK-A »).
  if (listing.externalSku) {
    const a = normalizeSku(listing.externalSku);
    const b = normalizeSku(candidate.code);
    const shorter = Math.min(a.length, b.length);
    if (a && b && shorter >= 4 && a !== b && (a.includes(b) || b.includes(a))) {
      const closeness = Math.abs(a.length - b.length) <= 3 ? 0.85 : 0.7;
      return { skuId: candidate.skuId, confidence: closeness, method: "sku_partial", reasons: [`SKU eBay « ${listing.externalSku} » proche du code « ${candidate.code} »`] };
    }
  }

  // 3. Similarité de titre + attributs de variante.
  const lt = listingTokens(listing);
  const ct = candidateTokens(candidate);
  const dice = diceCoefficient(lt, ct);
  if (dice === 0) return null;

  let bonus = 0;
  let penalty = 0;
  let attributeMatches = 0;
  const lStorage = storageTokens(lt);
  const cStorage = storageTokens(ct);
  if (cStorage.size > 0 && lStorage.size > 0) {
    const common = [...cStorage].some((t) => lStorage.has(t));
    if (common) {
      attributeMatches++;
      bonus += 0.08;
      reasons.push("capacité identique");
    } else {
      penalty += 0.35;
      reasons.push("capacité différente");
    }
  }
  const lColor = colorTokens(lt);
  const cColor = colorTokens(ct);
  if (cColor.size > 0 && lColor.size > 0) {
    const common = [...cColor].some((t) => lColor.has(t));
    if (common) {
      attributeMatches++;
      bonus += 0.06;
      reasons.push("couleur identique");
    } else {
      penalty += 0.25;
      reasons.push("couleur différente");
    }
  }
  const grade = candidate.attributes.grade ?? candidate.attributes.Grade;
  if (grade && lt.has(stripAccents(grade.toLowerCase())) && new RegExp(`grade\\s*${escapeRegExp(grade)}`, "i").test(listing.title)) {
    attributeMatches++;
    bonus += 0.04;
    reasons.push(`grade ${grade} mentionné`);
  }
  if (candidate.brand && lt.has(tokenize(candidate.brand)[0] ?? "")) reasons.push("marque présente dans le titre");

  const confidence = round3(Math.max(0, Math.min(0.9, dice + Math.min(bonus, 0.15) - penalty)));
  if (confidence <= 0) return null;
  reasons.unshift(`similarité du titre ${Math.round(dice * 100)} %`);
  return { skuId: candidate.skuId, confidence, method: attributeMatches > 0 && penalty === 0 ? "attributes" : "title_similarity", reasons };
}

export function suggestSkusForListing(listing: ListingForMatching, candidates: SkuCandidate[], options: { limit?: number; minConfidence?: number } = {}): SuggestionScore[] {
  const limit = options.limit ?? 3;
  const min = options.minConfidence ?? 0.5;
  const scored: SuggestionScore[] = [];
  for (const c of candidates) {
    const s = scoreCandidate(listing, c);
    if (s && s.confidence >= min) scored.push(s);
  }
  scored.sort((a, b) => b.confidence - a.confidence || a.skuId.localeCompare(b.skuId));
  return scored.slice(0, limit);
}
