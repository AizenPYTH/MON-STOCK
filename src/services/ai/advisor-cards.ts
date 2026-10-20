import type { AdvisorCardDTO, AdvisorCardRowDTO, AdvisorCardTone } from "@/features/mobile-api/contract";

/** Cartes affichées sous la réponse du conseiller : construites à partir des données, jamais par le modèle. */
export function card(kind: AdvisorCardDTO["kind"], title: string, rows: AdvisorCardRowDTO[], extra: Partial<AdvisorCardDTO> = {}): AdvisorCardDTO {
  return { kind, title, subtitle: null, rows: rows.slice(0, 12), warnings: [], action: null, text: null, ...extra };
}

export const row = (label: string, value: string, detail: string | null = null, tone: AdvisorCardTone = "neutral"): AdvisorCardRowDTO => ({ label, value, detail, tone });
