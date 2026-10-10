/**
 * Contrôle de qualité d'un import de catalogue AVANT toute écriture (module pur).
 *
 * But : ne jamais écraser un catalogue valide par un fichier défectueux (mauvaise colonne de
 * prix, devise erronée, fichier tronqué, export vide). En cas de doute, l'import est SUSPENDU :
 * rien n'est enregistré, aucune offre n'est expirée, le catalogue précédent reste intact, et
 * l'utilisateur peut confirmer explicitement après vérification.
 */

export interface ImportQualityInput {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  /** références présentes plusieurs fois dans le fichier (seule la première est retenue) */
  duplicateRows: number;
  /** nombre de lignes du dernier import réussi de ce flux (null = premier import) */
  previousRecordCount: number | null;
  /** pour les références déjà connues : rapport nouveau prix / ancien prix (même devise) */
  priceRatios: number[];
}

export type ImportQualityIssue = "too_many_invalid" | "catalog_shrank" | "price_shift" | "all_duplicates";

export interface ImportQualityResult {
  decision: "accept" | "quarantine";
  issues: { code: ImportQualityIssue; message: string }[];
  warnings: string[];
}

export const QUALITY_THRESHOLDS = {
  /** au-delà de cette part de lignes illisibles, l'import est suspendu */
  maxInvalidShare: 0.5,
  /** en dessous de cette part du dernier import, le catalogue est jugé tronqué */
  minShareOfPrevious: 0.5,
  /** variation de prix jugée anormale (± 60 %) */
  priceShift: 0.6,
  /** part des références connues dont le prix varie anormalement */
  maxShiftedShare: 0.5,
  /** échantillons minimaux pour appliquer chaque règle */
  minRows: 5,
  minPrevious: 20,
  minMatched: 5,
} as const;

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function assessImportQuality(i: ImportQualityInput, t = QUALITY_THRESHOLDS): ImportQualityResult {
  const issues: ImportQualityResult["issues"] = [];
  const warnings: string[] = [];
  if (i.totalRows >= t.minRows && i.invalidRows / i.totalRows > t.maxInvalidShare) {
    issues.push({ code: "too_many_invalid", message: `${pct(i.invalidRows / i.totalRows)} des lignes sont illisibles : la correspondance des colonnes est probablement erronée.` });
  }
  if (i.previousRecordCount !== null && i.previousRecordCount >= t.minPrevious && i.validRows < i.previousRecordCount * t.minShareOfPrevious) {
    issues.push({ code: "catalog_shrank", message: `${i.validRows} offre(s) lisible(s) contre ${i.previousRecordCount} lignes au dernier import : fichier tronqué ou mauvais fichier ?` });
  }
  if (i.priceRatios.length >= t.minMatched) {
    const shifted = i.priceRatios.filter((r) => !Number.isFinite(r) || r <= 0 || Math.abs(r - 1) > t.priceShift).length;
    if (shifted / i.priceRatios.length > t.maxShiftedShare) {
      issues.push({ code: "price_shift", message: `Le prix de ${shifted} référence(s) connue(s) sur ${i.priceRatios.length} varie de plus de ${pct(t.priceShift)} : mauvaise colonne de prix, HT/TTC ou devise ?` });
    }
  }
  if (i.totalRows > 0 && i.validRows > 0 && i.duplicateRows >= i.validRows) {
    issues.push({ code: "all_duplicates", message: "Chaque référence apparaît plusieurs fois : la colonne de référence choisie n'identifie pas les produits." });
  }
  if (i.duplicateRows > 0) warnings.push(`${i.duplicateRows} ligne(s) en double (même référence) : seule la première est retenue.`);
  return { decision: issues.length > 0 ? "quarantine" : "accept", issues, warnings };
}

/** Clé de déduplication d'une ligne : référence fournisseur, sinon EAN, sinon MPN. */
export function rowIdentity(offer: { externalOfferId?: string | null; supplierSku?: string | null; ean?: string | null; mpn?: string | null }): string | null {
  const k = offer.externalOfferId ?? offer.supplierSku ?? (offer.ean ? `ean:${offer.ean}` : null) ?? (offer.mpn ? `mpn:${offer.mpn.toUpperCase()}` : null);
  return k ? k.trim().toUpperCase() : null;
}
