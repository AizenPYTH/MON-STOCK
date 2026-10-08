/**
 * ProductMatchingService — rapproche une offre fournisseur des SKU internes.
 *
 * Seuils : ≥ 0,9 → « high » (suggestion forte, confirmation humaine requise sauf
 * identifiant exact EAN / MPN / code fournisseur), 0,6–0,9 → « ambiguous »
 * (validation demandée), < 0,6 → aucune suggestion. Une correspondance incertaine
 * n'est jamais liée automatiquement.
 */
import { normalizeProduct, normalizeText, type NormalizedProduct, type ProductCondition } from "@/domain/sourcing/normalizer";
import { NOISE_TOKENS } from "@/domain/sourcing/dictionaries";

export const MATCH_HIGH_THRESHOLD = 0.9;
export const MATCH_AMBIGUOUS_THRESHOLD = 0.6;

export type MatchMethod = "ean" | "mpn" | "supplier_sku" | "attributes" | "text";
export type MatchLevel = "high" | "ambiguous";

export interface MatchCandidate {
  skuId: string;
  code: string;
  productName: string;
  brand: string | null;
  variantName?: string | null;
  attributes: { storage?: string | null; color?: string | null; grade?: string | null };
  condition: ProductCondition | null;
  grade?: string | null;
  ean: string | null;
  mpn: string | null;
  barcode: string | null;
}

export interface OfferIdentity {
  title: string;
  normalized?: NormalizedProduct;
  ean: string | null;
  mpn: string | null;
  supplierSku: string | null;
}

export interface MatchResult {
  skuId: string;
  code: string;
  confidence: number;
  method: MatchMethod;
  level: MatchLevel;
  reasons: string[];
  /** vrai uniquement pour un identifiant exact (EAN / MPN / code SKU) */
  autoConfirmable: boolean;
}

function cleanId(s: string | null | undefined): string {
  return (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function levelOf(confidence: number): MatchLevel | null {
  if (confidence >= MATCH_HIGH_THRESHOLD) return "high";
  if (confidence >= MATCH_AMBIGUOUS_THRESHOLD) return "ambiguous";
  return null;
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeText(s)
      .split(" ")
      .filter((t) => t.length >= 2 && !NOISE_TOKENS.has(t)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function normalizeCandidate(c: MatchCandidate): NormalizedProduct {
  return normalizeProduct(`${c.brand ?? ""} ${c.productName} ${c.variantName ?? ""}`, {
    brand: c.brand,
    storage: c.attributes.storage ?? null,
    color: c.attributes.color ?? null,
    grade: c.attributes.grade ?? c.grade ?? null,
    condition: c.condition,
    ean: c.ean,
    mpn: c.mpn,
  });
}

interface AttributeComparison {
  score: number;
  cap: number;
  reasons: string[];
}

function compareAttributes(o: NormalizedProduct, c: NormalizedProduct): AttributeComparison {
  let score = 0;
  let cap = 0.95;
  const reasons: string[] = [];

  // Une comparaison incomplète (attribut distinctif inconnu d'un côté) ne peut jamais
  // atteindre le niveau « high » : la validation humaine reste requise.
  const UNKNOWN_CAP = MATCH_HIGH_THRESHOLD - 0.01;
  const cmp = (label: string, a: string | null, b: string | null, equalPts: number, unknownPts: number, mismatchCap: number, unknownCap: number) => {
    if (a && b) {
      if (a === b) {
        score += equalPts;
        reasons.push(`${label} identique (${a})`);
      } else {
        cap = Math.min(cap, mismatchCap);
        reasons.push(`${label} différent (${a} vs ${b})`);
      }
    } else {
      score += unknownPts;
      cap = Math.min(cap, unknownCap);
      reasons.push(`${label} non renseigné${!a && !b ? " des deux côtés" : !a ? " côté offre" : " côté SKU"}`);
    }
  };

  cmp("Marque", o.brand, c.brand, 0.2, 0.1, 0.2, UNKNOWN_CAP);
  const oModel = o.inferred.includes("model") ? null : o.model;
  const cModel = c.inferred.includes("model") ? null : c.model;
  cmp("Modèle", oModel, cModel, 0.45, 0.15, 0.2, 0.55);
  cmp("Stockage", o.storage, c.storage, 0.15, 0.07, 0.5, UNKNOWN_CAP);
  cmp("Couleur", o.color, c.color, 0.1, 0.05, 0.75, UNKNOWN_CAP);
  cmp("Grade", o.grade, c.grade, 0.07, 0.035, 0.8, UNKNOWN_CAP);
  const oCond = o.condition === "unknown" ? null : o.condition;
  const cCond = c.condition === "unknown" ? null : c.condition;
  cmp("État", oCond, cCond, 0.03, 0.015, 0.8, 0.95);

  return { score: Math.min(score, cap), cap, reasons };
}

export function matchOfferToSkus(offer: OfferIdentity, candidates: MatchCandidate[]): MatchResult[] {
  const normalizedOffer = offer.normalized ?? normalizeProduct(offer.title, { ean: offer.ean, mpn: offer.mpn });
  const offerEan = cleanId(offer.ean ?? normalizedOffer.ean);
  const offerMpn = cleanId(offer.mpn ?? normalizedOffer.mpn);
  const offerSku = cleanId(offer.supplierSku);
  const offerTokens = tokenSet(offer.title);
  const results: MatchResult[] = [];

  for (const c of candidates) {
    let best: MatchResult | null = null;
    const push = (r: MatchResult) => {
      if (!best || r.confidence > best.confidence) best = r;
    };

    if (offerEan && (cleanId(c.ean) === offerEan || cleanId(c.barcode) === offerEan)) {
      push({ skuId: c.skuId, code: c.code, confidence: 1, method: "ean", level: "high", reasons: [`EAN identique (${offer.ean ?? normalizedOffer.ean})`], autoConfirmable: true });
    }
    if (offerMpn && cleanId(c.mpn) === offerMpn) {
      push({ skuId: c.skuId, code: c.code, confidence: 0.97, method: "mpn", level: "high", reasons: [`Référence fabricant identique (${offer.mpn ?? normalizedOffer.mpn})`], autoConfirmable: true });
    }
    if (offerSku && (cleanId(c.code) === offerSku || (c.barcode && cleanId(c.barcode) === offerSku))) {
      push({ skuId: c.skuId, code: c.code, confidence: 0.95, method: "supplier_sku", level: "high", reasons: [`Référence fournisseur identique au code SKU (${c.code})`], autoConfirmable: true });
    }

    if (!best) {
      const normalizedCandidate = normalizeCandidate(c);
      const attr = compareAttributes(normalizedOffer, normalizedCandidate);
      const attrLevel = levelOf(attr.score);
      if (attrLevel) {
        push({ skuId: c.skuId, code: c.code, confidence: round3(attr.score), method: "attributes", level: attrLevel, reasons: attr.reasons, autoConfirmable: false });
      }
      const sim = jaccard(offerTokens, tokenSet(`${c.brand ?? ""} ${c.productName} ${c.variantName ?? ""}`));
      const textScore = round3(sim * 0.8);
      const textLevel = levelOf(textScore);
      if (textLevel && (!best || textScore > (best as MatchResult).confidence)) {
        push({ skuId: c.skuId, code: c.code, confidence: textScore, method: "text", level: textLevel, reasons: [`Similarité textuelle ${(sim * 100).toFixed(0)} %`], autoConfirmable: false });
      }
    }

    if (best) results.push(best);
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const MATCH_METHOD_LABEL: Record<MatchMethod, string> = {
  ean: "EAN identique",
  mpn: "Référence fabricant",
  supplier_sku: "Référence fournisseur",
  attributes: "Attributs produit",
  text: "Similarité du titre",
};
