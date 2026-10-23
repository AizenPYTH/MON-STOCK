import type { AdvisorCardDTO, AdvisorCardRowDTO, AdvisorCardTone } from "@/features/mobile-api/contract";

/** Cartes affichées sous la réponse du conseiller : construites à partir des données, jamais par le modèle. */
export function card(kind: AdvisorCardDTO["kind"], title: string, rows: AdvisorCardRowDTO[], extra: Partial<AdvisorCardDTO> = {}): AdvisorCardDTO {
  return { kind, title, subtitle: null, rows: rows.slice(0, 12), warnings: [], action: null, text: null, ...extra };
}

export const row = (label: string, value: string, detail: string | null = null, tone: AdvisorCardTone = "neutral"): AdvisorCardRowDTO => ({ label, value, detail, tone });

/**
 * Ligne de compteur : un compteur inconnu (null, requête en échec) s'affiche « — » avec la mention
 * « compteur indisponible », jamais « 0 » (W-14). `positive` colore une valeur > 0, `zero` une valeur nulle.
 */
export const countRow = (label: string, value: number | null, positive: AdvisorCardTone, zero: AdvisorCardTone = "neutral"): AdvisorCardRowDTO =>
  value === null ? row(label, "—", "compteur indisponible pour le moment", "neutral") : row(label, String(value), null, value > 0 ? positive : zero);
