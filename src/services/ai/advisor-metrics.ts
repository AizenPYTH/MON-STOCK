import { dec, formatMoneyDec, formatPercent } from "@/domain/tools/decimal";

/**
 * Calculs du conseiller (module pur, testé) : chiffre d'affaires, coût d'achat, frais, marges.
 *
 * Montants en CENTIMES entiers (aucun arrondi flottant cumulé). Définitions (citées au modèle et
 * à l'écran) :
 *   - chiffre d'affaires (CA)   = somme des lignes de commande (prix × quantité), hors frais de
 *                                 port facturés à l'acheteur ; commandes annulées / remboursées exclues ;
 *   - coût d'achat              = quantité × prix d'achat ACTUEL du SKU (pas le prix historique) ;
 *                                 inconnu si la ligne n'est pas liée au stock ou si le SKU n'a pas de prix d'achat ;
 *   - marge brute               = CA − coût d'achat, calculée UNIQUEMENT sur les lignes dont le coût est connu ;
 *   - frais de vente            = frais renvoyés par le canal (fee_total des commandes eBay) ;
 *   - bénéfice estimé (net)     = marge brute − frais de vente des mêmes lignes (frais répartis au
 *                                 prorata du montant de chaque ligne dans sa commande). Les frais
 *                                 d'expédition payés par le vendeur, les retours et les remboursements
 *                                 partiels ne sont PAS connus de MON STOCK : le bénéfice reste une estimation.
 * Rien n'est extrapolé : une donnée absente est comptée et signalée, jamais complétée.
 */

export interface MetricOrder {
  id: string;
  currency: string;
  /** frais du canal en centimes (null = non communiqués) */
  feeCents: number | null;
}

export interface MetricLine {
  orderId: string;
  skuId: string | null;
  sku: string | null;
  title: string;
  quantity: number;
  /** montant de la ligne en centimes (null = inconnu) */
  totalCents: number | null;
  currency: string;
  /** prix d'achat unitaire actuel en centimes (null = inconnu) */
  unitCostCents: number | null;
}

export interface Profitability {
  currency: string;
  orders: number;
  units: number;
  revenueCents: number;
  /** CA des lignes dont le coût d'achat est connu */
  revenueWithCostCents: number;
  costCents: number;
  grossMarginCents: number | null;
  grossMarginRate: number | null;
  /** frais connus, toutes commandes de la période */
  feesCents: number;
  /** frais répartis sur les lignes dont le coût est connu */
  feesOnCostedLinesCents: number;
  netProfitEstimateCents: number | null;
  netMarginRate: number | null;
  coverage: {
    linesWithoutCost: number;
    unitsWithoutCost: number;
    revenueWithoutCostCents: number;
    linesWithoutAmount: number;
    ordersWithoutFees: number;
  };
  /** lignes dans une autre devise que `currency` : exclues des totaux */
  otherCurrencies: Record<string, number>;
  missing: string[];
}

export function toCents(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function money(cents: number, currency: string): string {
  return formatMoneyDec(dec(cents, 100), currency);
}

export function percent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return formatPercent(dec(Math.round(rate * 10000), 100), 1);
}

function lineAmount(l: MetricLine): number | null {
  return l.totalCents;
}

/** Part de chaque ligne dans les frais de sa commande (prorata du montant ; à parts égales si montants inconnus). */
function allocateFees(lines: MetricLine[], orders: Map<string, MetricOrder>): Map<MetricLine, number | null> {
  const byOrder = new Map<string, MetricLine[]>();
  for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]);
  const out = new Map<MetricLine, number | null>();
  for (const [orderId, ls] of byOrder) {
    const fee = orders.get(orderId)?.feeCents ?? null;
    if (fee === null) {
      for (const l of ls) out.set(l, null);
      continue;
    }
    const amounts = ls.map(lineAmount);
    const known = amounts.every((a) => a !== null) && amounts.reduce<number>((s, a) => s + (a ?? 0), 0) > 0;
    const total = known ? amounts.reduce<number>((s, a) => s + (a ?? 0), 0) : ls.length;
    let allocated = 0;
    ls.forEach((l, i) => {
      const share = known ? (amounts[i] ?? 0) / total : 1 / total;
      const part = i === ls.length - 1 ? fee - allocated : Math.round(fee * share);
      allocated += part;
      out.set(l, part);
    });
  }
  return out;
}

export function computeProfitability(lines: MetricLine[], orders: MetricOrder[], currency: string): Profitability {
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const otherCurrencies: Record<string, number> = {};
  const main = lines.filter((l) => {
    if (l.currency === currency) return true;
    if (l.totalCents !== null) otherCurrencies[l.currency] = (otherCurrencies[l.currency] ?? 0) + l.totalCents;
    return false;
  });
  const fees = allocateFees(main, orderMap);
  const orderIds = new Set(main.map((l) => l.orderId));
  let revenue = 0;
  let revenueWithCost = 0;
  let cost = 0;
  let feesOnCosted = 0;
  let feesUnknownOnCosted = false;
  let units = 0;
  const coverage = { linesWithoutCost: 0, unitsWithoutCost: 0, revenueWithoutCostCents: 0, linesWithoutAmount: 0, ordersWithoutFees: 0 };
  for (const l of main) {
    units += l.quantity;
    if (l.totalCents === null) {
      coverage.linesWithoutAmount += 1;
      continue;
    }
    revenue += l.totalCents;
    if (l.unitCostCents === null) {
      coverage.linesWithoutCost += 1;
      coverage.unitsWithoutCost += l.quantity;
      coverage.revenueWithoutCostCents += l.totalCents;
      continue;
    }
    revenueWithCost += l.totalCents;
    cost += l.unitCostCents * l.quantity;
    const f = fees.get(l);
    if (f === null || f === undefined) feesUnknownOnCosted = true;
    else feesOnCosted += f;
  }
  let feesTotal = 0;
  for (const id of orderIds) {
    const o = orderMap.get(id);
    if (!o || o.feeCents === null) coverage.ordersWithoutFees += 1;
    else feesTotal += o.feeCents;
  }
  const gross = revenueWithCost > 0 ? revenueWithCost - cost : null;
  const net = gross !== null && !feesUnknownOnCosted ? gross - feesOnCosted : null;
  const missing: string[] = [];
  if (coverage.linesWithoutCost > 0) missing.push(`Prix d'achat inconnu pour ${coverage.linesWithoutCost} ligne(s) (${coverage.unitsWithoutCost} unité(s), ${money(coverage.revenueWithoutCostCents, currency)} de CA) : exclues des marges.`);
  if (coverage.linesWithoutAmount > 0) missing.push(`Montant inconnu pour ${coverage.linesWithoutAmount} ligne(s) de commande.`);
  if (coverage.ordersWithoutFees > 0) missing.push(`Frais de vente non communiqués pour ${coverage.ordersWithoutFees} commande(s)${feesUnknownOnCosted ? " : bénéfice net non calculable sur ces ventes" : ""}.`);
  missing.push("Frais d'expédition payés par vous, retours et remboursements partiels : non enregistrés dans MON STOCK (non déduits).");
  missing.push("Coût d'achat = prix d'achat actuel du SKU, pas le prix payé au moment de l'achat.");
  for (const [c, v] of Object.entries(otherCurrencies)) missing.push(`Ventes en ${c} (${money(v, c)}) exclues des totaux en ${currency}.`);
  return {
    currency,
    orders: orderIds.size,
    units,
    revenueCents: revenue,
    revenueWithCostCents: revenueWithCost,
    costCents: cost,
    grossMarginCents: gross,
    grossMarginRate: gross !== null && revenueWithCost > 0 ? gross / revenueWithCost : null,
    feesCents: feesTotal,
    feesOnCostedLinesCents: feesOnCosted,
    netProfitEstimateCents: net,
    netMarginRate: net !== null && revenueWithCost > 0 ? net / revenueWithCost : null,
    coverage,
    otherCurrencies,
    missing,
  };
}

export interface ProductProfit {
  key: string;
  skuId: string | null;
  sku: string | null;
  title: string;
  units: number;
  revenueCents: number;
  costCents: number | null;
  feesCents: number | null;
  profitCents: number | null;
  marginRate: number | null;
}

/** Bénéfice estimé par produit (même règles que computeProfitability). */
export function productProfits(lines: MetricLine[], orders: MetricOrder[], currency: string): ProductProfit[] {
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const main = lines.filter((l) => l.currency === currency && l.totalCents !== null);
  const fees = allocateFees(main, orderMap);
  const groups = new Map<string, ProductProfit & { costKnown: boolean; feesKnown: boolean }>();
  for (const l of main) {
    const key = l.skuId ? `sku:${l.skuId}` : `title:${l.title.trim().toLowerCase()}`;
    const g = groups.get(key) ?? { key, skuId: l.skuId, sku: l.sku, title: l.title, units: 0, revenueCents: 0, costCents: 0, feesCents: 0, profitCents: null, marginRate: null, costKnown: true, feesKnown: true };
    g.units += l.quantity;
    g.revenueCents += l.totalCents ?? 0;
    if (l.unitCostCents === null) g.costKnown = false;
    else g.costCents = (g.costCents ?? 0) + l.unitCostCents * l.quantity;
    const f = fees.get(l);
    if (f === null || f === undefined) g.feesKnown = false;
    else g.feesCents = (g.feesCents ?? 0) + f;
    groups.set(key, g);
  }
  return [...groups.values()].map(({ costKnown, feesKnown, ...g }) => {
    const costCents = costKnown ? g.costCents : null;
    const feesCents = feesKnown ? g.feesCents : null;
    const profitCents = costCents !== null && feesCents !== null ? g.revenueCents - costCents - feesCents : null;
    return { ...g, costCents, feesCents, profitCents, marginRate: profitCents !== null && g.revenueCents > 0 ? profitCents / g.revenueCents : null };
  });
}

/** Variation relative ; null si la base est nulle (jamais « +∞ % »). */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

// ---------------------------------------------------------------------------
// Périodes (calendrier de Paris)
// ---------------------------------------------------------------------------

export const ADVISOR_PERIODS = ["today", "yesterday", "7d", "this_week", "last_week", "30d", "this_month", "last_month", "90d", "this_year"] as const;
export type AdvisorPeriod = (typeof ADVISOR_PERIODS)[number];

export interface PeriodRange {
  period: AdvisorPeriod;
  label: string;
  /** bornes ISO (UTC) : [from, to[ */
  from: string;
  to: string;
  /** période précédente de même nature, pour comparaison */
  previous: { from: string; to: string; label: string };
}

const PARIS = "Europe/Paris";

/** Date calendaire à Paris (AAAA-MM-JJ) d'un instant. */
export function parisDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Décalage (minutes) de Paris par rapport à UTC à un instant donné. */
function parisOffsetMinutes(d: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: PARIS, timeZoneName: "shortOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Minuit à Paris du jour AAAA-MM-JJ, en instant UTC. */
export function parisMidnight(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  const offset = parisOffsetMinutes(new Date(guess.getTime() - 12 * 3_600_000 + 24 * 3_600_000));
  return new Date(guess.getTime() - offset * 60_000);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const frDay = (day: string) => day.split("-").reverse().join("/");

export function periodRange(period: AdvisorPeriod, now: Date): PeriodRange {
  const today = parisDay(now);
  const tomorrow = addDays(today, 1);
  const iso = (day: string) => parisMidnight(day).toISOString();
  const range = (fromDay: string, toDayExcl: string, label: string, prevFrom: string, prevTo: string, prevLabel: string): PeriodRange => ({
    period,
    label,
    from: iso(fromDay),
    to: iso(toDayExcl),
    previous: { from: iso(prevFrom), to: iso(prevTo), label: prevLabel },
  });
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // lundi = 0
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthStart = (() => {
    const d = new Date(`${monthStart}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  switch (period) {
    case "today":
      return range(today, tomorrow, `aujourd'hui (${frDay(today)})`, addDays(today, -1), today, "hier");
    case "yesterday":
      return range(addDays(today, -1), today, `hier (${frDay(addDays(today, -1))})`, addDays(today, -2), addDays(today, -1), "avant-hier");
    case "7d":
      return range(addDays(today, -6), tomorrow, `7 derniers jours (du ${frDay(addDays(today, -6))} au ${frDay(today)})`, addDays(today, -13), addDays(today, -6), "les 7 jours précédents");
    case "this_week": {
      const monday = addDays(today, -weekday);
      // comparaison à durée égale : même nombre de jours de la semaine précédente
      return range(monday, tomorrow, `cette semaine (depuis le lundi ${frDay(monday)})`, addDays(monday, -7), addDays(tomorrow, -7), "la même période de la semaine précédente");
    }
    case "last_week": {
      const monday = addDays(today, -weekday - 7);
      return range(monday, addDays(monday, 7), `la semaine dernière (du ${frDay(monday)} au ${frDay(addDays(monday, 6))})`, addDays(monday, -7), monday, "la semaine d'avant");
    }
    case "30d":
      return range(addDays(today, -29), tomorrow, `30 derniers jours (du ${frDay(addDays(today, -29))} au ${frDay(today)})`, addDays(today, -59), addDays(today, -29), "les 30 jours précédents");
    case "this_month": {
      const elapsed = Math.round((new Date(`${tomorrow}T12:00:00Z`).getTime() - new Date(`${monthStart}T12:00:00Z`).getTime()) / 86_400_000);
      return range(monthStart, tomorrow, `ce mois-ci (depuis le ${frDay(monthStart)})`, prevMonthStart, addDays(prevMonthStart, elapsed), "le même nombre de jours du mois précédent");
    }
    case "last_month": {
      const prevPrev = (() => {
        const d = new Date(`${prevMonthStart}T12:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - 1);
        return d.toISOString().slice(0, 10);
      })();
      return range(prevMonthStart, monthStart, `le mois dernier (du ${frDay(prevMonthStart)} au ${frDay(addDays(monthStart, -1))})`, prevPrev, prevMonthStart, "le mois d'avant");
    }
    case "90d":
      return range(addDays(today, -89), tomorrow, `90 derniers jours`, addDays(today, -179), addDays(today, -89), "les 90 jours précédents");
    case "this_year": {
      const jan1 = `${today.slice(0, 4)}-01-01`;
      const prevJan1 = `${Number(today.slice(0, 4)) - 1}-01-01`;
      const elapsed = Math.round((new Date(`${tomorrow}T12:00:00Z`).getTime() - new Date(`${jan1}T12:00:00Z`).getTime()) / 86_400_000);
      return range(jan1, tomorrow, `cette année (depuis le ${frDay(jan1)})`, prevJan1, addDays(prevJan1, elapsed), "la même période de l'an dernier");
    }
  }
}
