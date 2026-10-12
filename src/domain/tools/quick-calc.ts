import { add, cmp, dec, div, formatDec, formatPercent, HUNDRED, isZero, mul, ONE, parseDecimal, percentOf, sub, ZERO, type Dec } from "@/domain/tools/decimal";
import type { RateBand, RateCard } from "@/domain/tools/shipping";

/**
 * Outils « version simple » (maquette v3 Outils) : 2 à 4 cases, un onglet (taux, marge voulue,
 * remise ou devise) et un résultat calculé pendant la frappe. Calcul décimal exact (aucun
 * flottant) ; une case vide n'est jamais lue comme 0, sauf les frais facultatifs, comptés 0
 * et signalés comme tels. Module pur, partagé avec l'application mobile.
 */

export type QuickValues = Record<string, Dec | null>;
export interface QuickResult {
  /** valeur affichée par case (null = « — ») */
  values: QuickValues;
  /** ligne sous le libellé du résultat (« marge 25 % », « frais 12,90 € »…) */
  sub: string | null;
}

/** Lit une saisie de clavier intégré (« 129,9 ») ; vide ou invalide → null. */
export function readEntry(entry: string | undefined): Dec | null {
  if (!entry) return null;
  const p = parseDecimal(entry);
  return p.ok ? p.value : null;
}

/** Saisie reprise d'une valeur calculée (champ touché en mode bidirectionnel) : « 129,9 », sans espace. */
export function toEntry(value: Dec | null): string {
  if (!value) return "";
  return formatDec(value).replace(/\s/g, "").replace(/,00$/, "").replace(/(,\d)0$/, "$1");
}

const pctOf = (part: Dec, whole: Dec): Dec | null => (isZero(whole) ? null : div(mul(part, HUNDRED), whole));

/** Arrondi au centime SUPÉRIEUR (prix de vente : la cible doit être atteinte). */
export function ceilCents(a: Dec): Dec {
  const scaled = a.n * 100n;
  let q = scaled / a.d;
  if (scaled % a.d !== 0n && a.n > 0n) q += 1n;
  return dec(q, 100n);
}

/** TVA : saisie HT, TVA ou TTC ; les deux autres cases suivent. Taux en % (« 5,5 »). */
export function quickVat(active: "ht" | "tva" | "ttc", value: Dec | null, ratePercent: Dec): QuickResult {
  const r = div(ratePercent, HUNDRED);
  if (!value) return { values: { ht: null, tva: null, ttc: null }, sub: null };
  if (active === "ht") return { values: { ht: value, tva: mul(value, r), ttc: mul(value, add(ONE, r)) }, sub: null };
  if (active === "tva") {
    if (isZero(r)) return { values: { ht: null, tva: value, ttc: null }, sub: null };
    const ht = div(value, r);
    return { values: { ht, tva: value, ttc: add(ht, value) }, sub: null };
  }
  const ht = div(value, add(ONE, r));
  return { values: { ht, tva: sub(value, ht), ttc: value }, sub: null };
}

/** Marge : vente − achat − frais (frais vides = 0). Marge exprimée sur le prix de vente. */
export function quickMargin(achat: Dec | null, vente: Dec | null, frais: Dec | null): QuickResult {
  if (!achat || !vente) return { values: { res: null }, sub: null };
  const benefit = sub(sub(vente, achat), frais ?? ZERO);
  const rate = pctOf(benefit, vente);
  return { values: { res: benefit }, sub: rate ? `marge ${formatPercent(rate, 1)}` : null };
}

/** Prix de vente pour une marge voulue (en % du prix de vente) : (achat + frais) ÷ (1 − marge). */
export function quickSellingPrice(achat: Dec | null, frais: Dec | null, marginPercent: Dec): QuickResult {
  if (!achat) return { values: { res: null }, sub: null };
  const cost = add(achat, frais ?? ZERO);
  const keep = sub(ONE, div(marginPercent, HUNDRED));
  if (cmp(keep, ZERO) <= 0) return { values: { res: null }, sub: "marge impossible" };
  const price = ceilCents(div(cost, keep));
  return { values: { res: price }, sub: `bénéfice ${formatDec(sub(price, cost))} €` };
}

/** Frais eBay : net = prix − prix × taux. Aucun taux par défaut (taux vide → « — »). */
export function quickEbayFees(prix: Dec | null, taux: Dec | null): QuickResult {
  if (!prix || !taux) return { values: { res: null }, sub: taux ? null : "entrez votre taux" };
  if (cmp(taux, HUNDRED) > 0) return { values: { res: null }, sub: "taux supérieur à 100 %" };
  const fees = percentOf(prix, taux);
  return { values: { res: sub(prix, fees) }, sub: `frais ${formatDec(fees)} €` };
}

/** Remise : prix × (1 − remise). */
export function quickDiscount(prix: Dec | null, discountPercent: Dec): QuickResult {
  if (!prix) return { values: { res: null }, sub: null };
  const off = percentOf(prix, discountPercent);
  return { values: { res: sub(prix, off) }, sub: `− ${formatDec(off)} €` };
}

/** Devises : 1 € = `rate` devise (taux BCE). Saisie dans la devise ou en euros. */
export function quickCurrency(active: "dev" | "eur", value: Dec | null, rate: Dec | null): QuickResult {
  if (!value || !rate || isZero(rate)) return { values: { dev: active === "dev" ? value : null, eur: active === "eur" ? value : null }, sub: null };
  return active === "dev" ? { values: { dev: value, eur: div(value, rate) }, sub: null } : { values: { dev: mul(value, rate), eur: value }, sub: null };
}

/* ───────── Port : grille simple par poids ───────── */

/** Onglets de poids de l'outil Port (kg). */
export const PORT_WEIGHTS: { kg: number; label: string }[] = [
  { kg: 0.25, label: "250 g" },
  { kg: 0.5, label: "500 g" },
  { kg: 1, label: "1 kg" },
  { kg: 2, label: "2 kg" },
];

/** Transporteurs proposés quand aucune grille n'existe encore (prix à saisir, jamais inventés). */
export const PORT_DEFAULT_CARRIERS = ["Mondial Relay", "Colissimo", "Chronopost"];

/** Prix de la tranche qui couvre ce poids (la plus petite tranche ≥ poids) ; null si aucune. */
export function bandPriceFor(bands: RateBand[], weightKg: number): Dec | null {
  const band = [...bands].sort((a, b) => a.maxWeightKg - b.maxWeightKg).find((b) => b.maxWeightKg >= weightKg);
  return band ? readEntry(band.price) : null;
}

/**
 * Fixe le prix pour un poids : remplace la tranche de ce poids exact, sinon l'insère (les
 * autres tranches sont conservées). Prix vide → tranche de ce poids retirée.
 */
export function setBandPrice(bands: RateBand[], weightKg: number, price: string): RateBand[] {
  const others = bands.filter((b) => b.maxWeightKg !== weightKg);
  const p = readEntry(price);
  const next = p ? [...others, { maxWeightKg: weightKg, price: toEntry(p).replace(",", ".") }] : others;
  return next.sort((a, b) => a.maxWeightKg - b.maxWeightKg);
}

/** Cases de l'outil Port pour un poids : une par grille, la moins chère marquée. */
export function portRows(cards: Pick<RateCard, "id" | "carrier" | "service" | "bands">[], weightKg: number): { id: string; label: string; price: Dec | null; cheapest: boolean }[] {
  const rows = cards.map((c) => ({ id: c.id, label: c.service && c.service !== c.carrier ? `${c.carrier} · ${c.service}` : c.carrier, price: bandPriceFor(c.bands, weightKg) }));
  const priced = rows.filter((r) => r.price !== null);
  const min = priced.reduce<Dec | null>((m, r) => (m === null || cmp(r.price!, m) < 0 ? r.price : m), null);
  return rows.map((r) => ({ ...r, cheapest: priced.length > 1 && min !== null && r.price !== null && cmp(r.price, min) === 0 }));
}
