/**
 * Calculs purs des composants « Instrument » v5 (mêmes règles que l'application iPhone,
 * apps/mobile/src/components/ui/instrument.tsx). Aucune donnée inventée : une valeur inconnue
 * reste inconnue (« — »), jamais 0.
 */

/** Découpe « ≈ 9 152 € » en préfixe « ≈ », nombre « 9 152 » et unité « € ». */
export function splitFigure(value: string): { approx: boolean; number: string; unit: string } {
  let v = value.trim();
  const approx = v.startsWith("≈");
  if (approx) v = v.slice(1).trim();
  const m = /^(.*?)[\s  ]*([€$£%]|CHF|[A-Z]{3})$/.exec(v);
  if (m && m[1] && /\d/.test(m[1])) return { approx, number: m[1].trim(), unit: m[2] ?? "" };
  return { approx, number: v, unit: "" };
}

export type BarcodeLevel = "ok" | "low" | "out";
export type BarcodeItem = { id: string; weight: number; level: BarcodeLevel };
export const MAX_BARCODE_BARS = 60;

/**
 * Barres du code-barres du stock : tri par ventes décroissantes ; une référence sans vente garde
 * une barre fine (poids 0,4) ; au-delà de 60 barres, les plus petites forment une barre « autres »
 * (couleur de leur pire niveau).
 */
export function barcodeBars(items: BarcodeItem[]): BarcodeItem[] {
  const sorted = [...items].sort((a, b) => b.weight - a.weight).map((i) => ({ ...i, weight: Math.max(i.weight, 0.4) }));
  if (sorted.length <= MAX_BARCODE_BARS) return sorted;
  const head = sorted.slice(0, MAX_BARCODE_BARS - 1);
  const tail = sorted.slice(MAX_BARCODE_BARS - 1);
  const worst: BarcodeLevel = tail.some((t) => t.level === "out") ? "out" : tail.some((t) => t.level === "low") ? "low" : "ok";
  return [...head, { id: "others", weight: tail.reduce((a, t) => a + t.weight, 0), level: worst }];
}

/** Position (0–1) d'un prix face au marché sur l'échelle −40 % … +20 % (marché aux 2/3). */
export function rulerPosition(cost: number, market: number): number {
  if (!(market > 0) || !Number.isFinite(cost)) return 2 / 3;
  return Math.max(0, Math.min(1, (cost / market - 1 + 0.4) / 0.6));
}

/** Hauteurs relatives (0–1) des barres d'une série ; série vide ou nulle → hauteurs nulles. */
export function relativeHeights(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.max(0, v) / max : 0));
}

/** Parts (0–1) d'une répartition ; total nul → parts nulles (jamais de division par zéro). */
export function shares(values: number[]): number[] {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  return values.map((v) => (total > 0 ? Math.max(0, v) / total : 0));
}

/** Initiales d'un nom (2 lettres) : « Atelier Mobile Lyon » → « AM ». */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0]![0], words[1]![0]] : [words[0]?.[0], words[0]?.[1]]).filter(Boolean).join("");
  return letters.toUpperCase() || "?";
}
