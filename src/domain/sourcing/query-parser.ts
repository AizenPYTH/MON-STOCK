/**
 * QueryParser — transforme une requête utilisateur en critères structurés
 * (via le ProductNormalizer) + texte libre résiduel. Détecte un EAN (8/13 chiffres)
 * ou une référence fabricant (MPN) pour une recherche exacte prioritaire.
 */
import { normalizeProduct, normalizeText, type NormalizedProduct, type ProductCondition } from "@/domain/sourcing/normalizer";
import { NOISE_TOKENS } from "@/domain/sourcing/dictionaries";

export type QueryKind = "empty" | "ean" | "mpn" | "structured" | "text";

export interface QueryCriteria {
  brand: string | null;
  model: string | null;
  storage: string | null;
  color: string | null;
  grade: string | null;
  condition: ProductCondition;
}

export interface ParsedQuery {
  raw: string;
  kind: QueryKind;
  ean: string | null;
  mpn: string | null;
  criteria: QueryCriteria;
  /** tokens significatifs (≥ 2 caractères, hors bruit) pour la recherche texte */
  tokens: string[];
  /** texte non interprété */
  freeText: string;
  normalized: NormalizedProduct;
}

export function parseQuery(input: string | null | undefined): ParsedQuery {
  const raw = (input ?? "").trim();
  const normalized = normalizeProduct(raw);
  const structuredModel = normalized.model && !normalized.inferred.includes("model") ? normalized.model : null;
  const criteria: QueryCriteria = {
    brand: normalized.brand,
    model: structuredModel,
    storage: normalized.storage,
    color: normalized.color,
    grade: normalized.grade,
    condition: normalized.inferred.includes("condition") ? "unknown" : normalized.condition,
  };
  const tokens = normalizeText(raw)
    .split(" ")
    .filter((t) => t.length >= 2 && !NOISE_TOKENS.has(t));

  let kind: QueryKind = "text";
  if (!raw) kind = "empty";
  else if (normalized.ean) kind = "ean";
  else if (normalized.mpn && !structuredModel) kind = "mpn";
  else if (structuredModel || (normalized.brand && (normalized.storage || normalized.color || normalized.grade))) kind = "structured";

  return {
    raw,
    kind,
    ean: normalized.ean,
    mpn: normalized.mpn,
    criteria,
    tokens,
    freeText: normalized.remainingText,
    normalized,
  };
}
