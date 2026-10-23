/**
 * Vente d'EXEMPLE du hero et de la démo (handoff v2 §C0) : UNE seule vente, mêmes montants partout.
 * Aucune donnée réelle : tout est affiché dans un bloc « aperçu illustratif » ou avec ExampleTag.
 */

export const SALE = {
  order: "#E-10483",
  title: "iPhone 13 128 Go Noir · Grade A",
  short: "iPhone 13 128 Go",
  sku: "IP13-128-NR-A",
  price: "479,00 €",
  amount: 479,
  time: "10:42",
} as const;

/** État avant (étape 0) et après la vente (étapes 3 à 5). */
export const BEFORE = { stock: 2, cover: "≈ 5 j", revenue: 1486, sales: 6, toShip: 2, margin: "≈ 21 %", sales30: 11, dayPct: 49 } as const;
export const AFTER = { stock: 1, cover: "≈ 3 j", revenue: 1965, sales: 7, toShip: 3, margin: "≈ 22 %", sales30: 12, dayPct: 65 } as const;

/** Chronologie (ms) des étapes 1 à 5, remise à zéro, pause avant reprise, démarrage auto. */
export const STEP_AT = [500, 1600, 2400, 3100, 4000] as const;
export const RESET_AT = 9400;
export const RESTART_AFTER = 1500;
export const AUTOSTART_AFTER = 1800;

/** 14 jours de chiffre d'affaires d'exemple (le 14ᵉ = aujourd'hui : 1 486 € = 49 % du maximum). */
export const DAYS = [1340, 2110, 1720, 2860, 2400, 1180, 760, 2230, 2690, 1950, 3020, 2540, 2905] as const;
export const DAY_MAX = 3020;

export type StockLine = { name: string; sku: string; qty: number; cover: string; tone: "out" | "low" | "ok"; price: string; sales14: number[]; sale?: boolean };

export const STOCK_LINES: StockLine[] = [
  { name: "Écran iPhone 14 OLED", sku: "ECR-IP14-OLED", qty: 0, cover: "rupture", tone: "out", price: "89,00 €", sales14: [2, 1, 3, 2, 0, 2, 1, 3, 2, 2, 1, 0, 0, 0] },
  { name: SALE.title, sku: SALE.sku, qty: BEFORE.stock, cover: BEFORE.cover, tone: "low", price: SALE.price, sales14: [1, 0, 1, 1, 0, 2, 0, 1, 1, 0, 1, 2, 1, 0], sale: true },
  { name: "Batterie iPhone 12", sku: "BAT-IP12", qty: 18, cover: "≈ 64 j", tone: "ok", price: "24,90 €", sales14: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0] },
  { name: "Coque MagSafe iPhone 15", sku: "CQ-IP15-MS", qty: 9, cover: "≈ 21 j", tone: "ok", price: "14,90 €", sales14: [0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0] },
];

export const euro0 = (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n).replace(/[\u202f\u00a0]/g, "\u00a0")}\u00a0€`;
