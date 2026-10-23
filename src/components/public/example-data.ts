import type { BarcodeItem, WaterfallLine } from "@/components/instrument";

/**
 * Valeurs d'EXEMPLE du site public (accueil). Elles illustrent l'apparence des écrans avec les
 * vrais composants « Instrument » et sont TOUJOURS affichées sous l'étiquette « Exemple » :
 * aucune n'est présentée comme une donnée réelle ni ne provient d'une organisation.
 */

export const EXAMPLE_TODAY = {
  revenue: "1 486 €",
  sales: "6",
  toShip: "2 à expédier",
  margin: "21 %",
  yesterday: "2 905 €",
  references: 48,
  out: 3,
  low: 5,
};

/** 14 jours de chiffre d'affaires d'exemple (le dernier = jour en cours, incomplet). */
export const EXAMPLE_DAYS: { day: string; amount: number }[] = [1340, 2110, 1720, 2860, 2400, 1180, 760, 2230, 2690, 1950, 3020, 2540, 2905, 1486].map((amount, i) => ({ day: `Exemple J-${13 - i}`, amount }));

/** Une barre par référence : poids = ventes 30 j, niveau = rupture / faible / en stock. */
export const EXAMPLE_BARCODE: BarcodeItem[] = Array.from({ length: EXAMPLE_TODAY.references }, (_, i) => {
  const out = i === 1 || i === 6 || i === 11;
  const low = i === 3 || i === 9 || i === 15 || i === 22 || i === 30;
  const base = ((i * 37) % 23) / 23;
  return { id: `ex-${i}`, weight: Math.round((base * base * 26 + (out || low ? 5 : 0.6)) * 10) / 10, level: out ? "out" : low ? "low" : "ok" };
});

export const EXAMPLE_COVERAGE = [
  { name: "Écran iPhone 14 OLED", qty: 0, cover: "rupture", tone: "out" },
  { name: "iPhone 13 128 Go Noir · Grade A", qty: 2, cover: "≈ 5 j", tone: "low" },
  { name: "Batterie iPhone 12", qty: 18, cover: "≈ 64 j", tone: "ok" },
] as const;

export const EXAMPLE_OFFER = { title: "Écran iPhone 14 OLED", price: "58,90 €", cost: 58.9, market: 69.5, caption: "Coût 58,90 € · marché 69,50 € (9) · −15,3 % · prix il y a 3 h", profit: "≈ +31,40 € / u" };

export const EXAMPLE_WATERFALL: WaterfallLine[] = [
  { label: "Prix de vente", amount: 109, kind: "base" },
  { label: "Commission et frais", amount: -15.9, kind: "minus" },
  { label: "Coût d'achat rendu", amount: -61.7, kind: "minus" },
  { label: "Bénéfice estimé", amount: 31.4, kind: "result" },
];

export const EXAMPLE_IMPORT = [
  { label: "Nouvelles", value: 186, color: "var(--success)" },
  { label: "Mises à jour", value: 1640, color: "var(--inverse)" },
  { label: "Inchangées", value: 312, color: "var(--border-strong)" },
  { label: "Ignorées", value: 21, color: "var(--red)" },
];
