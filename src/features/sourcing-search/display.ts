/**
 * Recherche fournisseurs (web) — logique d'affichage PURE, reprise de l'onglet Sourcing de
 * l'application iPhone (apps/mobile/src/app/(app)/(tabs)/sourcing.tsx, offer-result.tsx,
 * offer-analysis.tsx). Aucun montant n'est inventé : tout vient de la réponse du serveur
 * (`simpleSupplierSearch`) ; une estimation est marquée « ≈ », un inconnu « — ».
 */
import type { SimpleDealDTO, SimpleOfferDTO, SimpleRankedOfferDTO, SimpleSearchDTO } from "@/features/mobile-api/contract";
import { categoryOf, OFFER_CATEGORIES, OFFER_CATEGORY_LABEL, queryTargetsDevice, shortSupplierName, type OfferCategory } from "@/domain/sourcing/offer-display";
import { formatMoney, formatNumber } from "@/lib/format";

export const MIN_QUERY_LENGTH = 2;
export const SEARCH_EXAMPLES = ["iPhone 13", "iPhone 15 Pro", "Écran iPhone 12", "Batterie iPhone 11"];
/** au-delà de 7 jours, l'âge du prix est signalé */
export const STALE_PRICE_DAYS = 7;

export type SearchSort = "price" | "deals" | "supplier";

export const SORT_LABEL: Record<SearchSort, string> = { price: "Prix", deals: "Opportunités", supplier: "Fournisseurs" };
export const SORT_HINT: Record<SearchSort, string> = {
  price: "Vos comptes d'abord, puis du moins cher au plus cher, par catégorie détectée.",
  deals: "Meilleure rentabilité estimée d'abord, par catégorie détectée.",
  supplier: "Regroupées par fournisseur, du moins cher au plus cher.",
};

export const STOCK_TEXT: Record<SimpleOfferDTO["stock"], string> = {
  in_stock: "En stock",
  low: "Stock faible",
  out_of_stock: "En rupture",
  unknown: "Stock non indiqué",
};

export const ACCESS_LABEL = { account: "Votre compte", public: "Source publique", marketplace: "Place de marché" } as const;

/** Variante de badge par niveau d'affaire. */
export const DEAL_VARIANT: Record<SimpleDealDTO["level"], "success" | "info" | "neutral" | "danger" | "outline"> = {
  very_good: "success",
  good: "info",
  average: "neutral",
  not_competitive: "danger",
  insufficient_data: "outline",
};

/** Texte de la recherche : espaces normalisés, 120 caractères au plus (limite du serveur). */
export function normalizeQuery(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Toutes les offres du moins cher au plus cher (serveur récent : `offers` ; sinon reconstitué). */
export function rankedOffers(data: Pick<SimpleSearchDTO, "suppliers"> & { offers?: SimpleRankedOfferDTO[] }): SimpleRankedOfferDTO[] {
  if (data.offers) return data.offers;
  const key = (o: SimpleOfferDTO) => o.priceConverted ?? o.price ?? Number.POSITIVE_INFINITY;
  return data.suppliers.flatMap((s) => s.offers.map((o) => ({ ...o, supplierId: s.supplierId, supplierName: s.supplierName, country: s.country, domain: s.domain ?? null }))).sort((a, b) => key(a) - key(b));
}

const DEAL_ORDER: Record<SimpleDealDTO["level"], number> = { very_good: 0, good: 1, average: 2, not_competitive: 3, insufficient_data: 4 };

/** « Meilleures affaires » : niveau, puis score, puis marge ; offres sans analyse en dernier. */
export function bestDeals<T extends SimpleOfferDTO>(offers: T[]): T[] {
  const lvl = (o: T) => (o.deal ? DEAL_ORDER[o.deal.level] : 5);
  return [...offers].sort((a, b) => lvl(a) - lvl(b) || (b.deal?.score ?? -1) - (a.deal?.score ?? -1) || (b.deal?.margin ?? -Infinity) - (a.deal?.margin ?? -Infinity));
}

/** « Moins cher » : vos comptes fournisseurs d'abord (prix pro), puis le reste ; ordre de prix conservé. */
export function splitByAccess<T extends SimpleOfferDTO>(offers: T[]): { account: T[]; other: T[] } {
  return { account: offers.filter((o) => o.access === "account"), other: offers.filter((o) => o.access !== "account") };
}

/** Offres rangées par catégorie détectée dans le titre (ordre conservé). */
export function groupByCategory<T extends { title: string }>(offers: T[]): Map<OfferCategory, T[]> {
  const m = new Map<OfferCategory, T[]>();
  for (const o of offers) {
    const c = categoryOf(o.title);
    const list = m.get(c);
    if (list) list.push(o);
    else m.set(c, [o]);
  }
  return m;
}

/** Catégorie ouverte par défaut : les appareils quand on cherche un modèle (et qu'il y en a), sinon tout. */
export function defaultCategory(query: string, byCategory: Map<OfferCategory, unknown[]>): OfferCategory | "all" {
  return queryTargetsDevice(query) && (byCategory.get("devices")?.length ?? 0) > 0 ? "devices" : "all";
}

/** Offres affichées pour une catégorie et un tri (« Fournisseurs » garde l'ordre de prix). */
export function visibleOffers(ranked: SimpleRankedOfferDTO[], category: OfferCategory | "all", sort: SearchSort): SimpleRankedOfferDTO[] {
  const inCategory = category === "all" ? ranked : ranked.filter((o) => categoryOf(o.title) === category);
  return sort === "deals" ? bestDeals(inCategory) : inCategory;
}

export interface OfferGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

/**
 * Groupes du tableau : par catégorie détectée (Prix : vos comptes d'abord puis du moins cher au plus
 * cher ; Opportunités : ordre de rentabilité), ou par fournisseur (ordre d'apparition au prix).
 * `limit` coupe la liste après N lignes au total (pagination « Afficher plus »).
 */
export function offerGroups<T extends SimpleRankedOfferDTO>(offers: T[], sort: SearchSort, limit = Number.POSITIVE_INFINITY): OfferGroup<T>[] {
  let groups: OfferGroup<T>[];
  if (sort === "supplier") {
    const m = new Map<string, OfferGroup<T>>();
    for (const o of offers) {
      const g = m.get(o.supplierId);
      if (g) g.rows.push(o);
      else m.set(o.supplierId, { key: `s-${o.supplierId}`, label: shortSupplierName(o.supplierName), rows: [o] });
    }
    groups = [...m.values()];
  } else {
    const byCat = groupByCategory(offers);
    groups = OFFER_CATEGORIES.filter((c) => (byCat.get(c)?.length ?? 0) > 0).map((c) => {
      const rows = byCat.get(c) ?? [];
      const ordered = sort === "price" ? [...splitByAccess(rows).account, ...splitByAccess(rows).other] : rows;
      return { key: `c-${c}`, label: OFFER_CATEGORY_LABEL[c], rows: ordered };
    });
  }
  const out: OfferGroup<T>[] = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    const rows = g.rows.slice(0, left);
    left -= rows.length;
    out.push({ ...g, rows });
  }
  return out;
}

/** Meilleure opportunité : la première offre « intéressante » (ou mieux) dont la marge est calculée. */
export function bestOpportunity(offers: SimpleRankedOfferDTO[]): SimpleRankedOfferDTO | null {
  return bestDeals(offers).find((o) => o.deal && (o.deal.level === "very_good" || o.deal.level === "good") && o.deal.margin !== null) ?? null;
}

export interface PriceView {
  /** prix tel que relevé chez le fournisseur, ou « Prix non indiqué » */
  price: string;
  /** « HT », « TTC » ou null si inconnu */
  tax: "HT" | "TTC" | null;
  /** « ≈ 123,00 € » si la devise diffère de celle de l'organisation et que la conversion existe */
  converted: string | null;
}

export function priceView(o: Pick<SimpleOfferDTO, "price" | "currency" | "priceConverted" | "taxType">, orgCurrency: string): PriceView {
  const price = o.price !== null && o.currency ? formatMoney(o.price, o.currency) : "Prix non indiqué";
  const tax = o.price === null ? null : o.taxType === "ht" ? "HT" : o.taxType === "ttc" ? "TTC" : null;
  const converted = o.currency && o.currency.toUpperCase() !== orgCurrency.toUpperCase() && o.priceConverted !== null ? `≈ ${formatMoney(o.priceConverted, orgCurrency)}` : null;
  return { price, tax, converted };
}

export function taxLabel(taxType: SimpleOfferDTO["taxType"]): string {
  return taxType === "ht" ? "HT" : taxType === "ttc" ? "TTC" : "HT/TTC ?";
}

/** Âge court d'un prix : « 3 min », « 5 h », « 2 j » ; null si la date est inconnue. */
export function shortAge(seenAt: string | null, now: Date = new Date()): string | null {
  if (!seenAt) return null;
  const t = new Date(seenAt).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (min < 60) return `${Math.max(1, min)} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} j`;
}

export function stockText(o: Pick<SimpleOfferDTO, "quantity" | "stock">): string {
  return o.quantity !== null && o.stock !== "out_of_stock" ? `${formatNumber(o.quantity)} en stock` : STOCK_TEXT[o.stock];
}

/** Âge du prix en jours entiers (null si date inconnue ou invalide). */
export function priceAgeDays(seenAt: string | null, now: Date = new Date()): number | null {
  if (!seenAt) return null;
  const t = new Date(seenAt).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function isStale(seenAt: string | null, now: Date = new Date()): boolean {
  const age = priceAgeDays(seenAt, now);
  return age !== null && age > STALE_PRICE_DAYS;
}

/** Montant signé « ≈ +12,00 € » / « ≈ −3,00 € » ; « — » si inconnu. */
export function signedEstimate(v: number | null, currency: string): string {
  if (v === null) return "—";
  return `≈ ${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v), currency)}`;
}

export interface CascadeLine {
  label: string;
  note?: string;
  amount: number | null;
  /** start = montant de départ ; add = s'ajoute ; subtotal = total intermédiaire ; minus = se déduit ; result = marge */
  kind: "start" | "add" | "subtotal" | "minus" | "result";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cascade de marge d'une offre, à partir de l'analyse du serveur uniquement :
 * prix fournisseur → frais d'achat → coût rendu → revente → frais de vente → marge.
 * Les frais ne sont affichés que s'ils se déduisent des montants du serveur (jamais supposés).
 */
export function dealCascade(d: SimpleDealDTO): CascadeLine[] {
  const lines: CascadeLine[] = [];
  lines.push({ label: "Prix fournisseur", note: "HT, devise de l'organisation", amount: d.supplierPrice, kind: "start" });
  if (d.totalCost !== null && d.supplierPrice !== null && d.totalCost - d.supplierPrice > 0.005) lines.push({ label: "Frais d'achat", note: "port, change", amount: r2(d.totalCost - d.supplierPrice), kind: "add" });
  lines.push({ label: "Coût rendu", amount: d.totalCost, kind: "subtotal" });
  const resaleNote = d.resaleBasis === "own_sales" ? "vos ventes 30 j" : d.resaleBasis === "own_price" ? "votre prix" : d.resaleBasis === "marketplace_low" ? "bas du marché" : undefined;
  lines.push({ label: "Revente", note: resaleNote, amount: d.resalePrice, kind: "start" });
  if (d.resalePrice !== null && d.totalCost !== null && d.margin !== null) {
    const rest = r2(d.resalePrice - d.totalCost - d.margin);
    if (rest > 0.005) lines.push({ label: "Frais de vente et taxes", note: "vos paramètres de coûts", amount: rest, kind: "minus" });
  }
  lines.push({ label: "Marge estimée", amount: d.margin, kind: "result" });
  return lines;
}

export interface RulerMarks {
  /** positions en % de la largeur (0–100) ; null si la valeur est inconnue */
  cost: number | null;
  market: number | null;
  resale: number | null;
  /** maximum de l'échelle (devise de l'organisation) */
  max: number;
}

/**
 * Règle de marché : coût rendu, médiane des offres équivalentes et revente sur une même échelle
 * (0 → plus grande valeur + 15 %). Null si ni coût ni marché ne sont connus.
 */
export function rulerMarks(cost: number | null, market: number | null, resale: number | null = null): RulerMarks | null {
  if (cost === null || market === null) return null;
  const values = [cost, market, resale].filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);
  const top = Math.max(...values);
  if (!(top > 0)) return null;
  const max = top * 1.15;
  const pos = (v: number | null) => (v === null || !Number.isFinite(v) || v < 0 ? null : Math.round((v / max) * 1000) / 10);
  return { cost: pos(cost), market: pos(market), resale: pos(resale), max };
}

/** Légende de la règle : « Coût 120 € · marché 150 € (6) · −20 % ». */
export function rulerCaption(d: Pick<SimpleDealDTO, "totalCost" | "marketPrice" | "marketCount">, orgCurrency: string): string | null {
  if (d.totalCost === null || d.marketPrice === null) return null;
  const gap = d.marketPrice > 0 ? Math.round((d.totalCost / d.marketPrice - 1) * 1000) / 10 : null;
  return `Coût ${formatMoney(d.totalCost, orgCurrency)} · marché ${formatMoney(d.marketPrice, orgCurrency)} (${d.marketCount})${gap !== null ? ` · ${gap > 0 ? "+" : "−"}${formatNumber(Math.abs(gap), 1)} %` : ""}`;
}

/** Légende courte de la règle (tableau) : « −8 % · 14 offres » ou « 2 offres équivalentes ». */
export function rulerShortCaption(d: Pick<SimpleDealDTO, "totalCost" | "marketPrice" | "marketCount">): string {
  const n = d.marketCount;
  if (d.totalCost === null || d.marketPrice === null || !(d.marketPrice > 0)) return `${n} offre${n > 1 ? "s" : ""} équivalente${n > 1 ? "s" : ""}`;
  const gap = Math.round((d.totalCost / d.marketPrice - 1) * 100);
  return `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${Math.abs(gap)} % · ${n} offre${n > 1 ? "s" : ""}`;
}

/** « 32 % sous la médiane de 7 offres équivalentes » (coût rendu face au marché) ; null si incomparable. */
export function marketGapText(d: Pick<SimpleDealDTO, "totalCost" | "marketPrice" | "marketCount">): string | null {
  if (d.totalCost === null || d.marketPrice === null || !(d.marketPrice > 0)) return null;
  const gap = Math.round((1 - d.totalCost / d.marketPrice) * 100);
  const of = `de ${d.marketCount} offre${d.marketCount > 1 ? "s" : ""} équivalente${d.marketCount > 1 ? "s" : ""}`;
  if (gap === 0) return `Au niveau de la médiane ${of}`;
  return gap > 0 ? `${gap} % sous la médiane ${of}` : `${Math.abs(gap)} % au-dessus de la médiane ${of}`;
}

export interface WaterfallStep {
  label: string;
  note?: string;
  amount: number | null;
  kind: "base" | "minus" | "subtotal" | "result";
}

const RESALE_NOTE: Record<NonNullable<SimpleDealDTO["resaleBasis"]>, string> = { own_sales: "vos ventes 30 j", own_price: "votre prix", marketplace_low: "bas du marché" };

/**
 * Cascade du panneau d'analyse (handoff v5) : Revente → Achat → Frais d'achat → Coût rendu →
 * Frais de vente et taxes → Marge. Uniquement si la marge est calculée par le serveur ; les frais ne
 * sont affichés que s'ils se déduisent des montants du serveur (jamais supposés).
 */
export function analysisWaterfall(d: SimpleDealDTO, taxType: SimpleOfferDTO["taxType"]): WaterfallStep[] {
  if (d.margin === null) return [];
  const lines: WaterfallStep[] = [{ label: "Revente", note: d.resaleBasis ? RESALE_NOTE[d.resaleBasis] : undefined, amount: d.resalePrice, kind: "base" }];
  lines.push({ label: "Achat", note: taxLabel(taxType), amount: d.supplierPrice, kind: "minus" });
  if (d.totalCost !== null && d.supplierPrice !== null && d.totalCost - d.supplierPrice > 0.005) lines.push({ label: "Frais d'achat", note: "port, change", amount: r2(d.totalCost - d.supplierPrice), kind: "minus" });
  lines.push({ label: "Coût rendu", note: "achat + frais", amount: d.totalCost, kind: "subtotal" });
  if (d.resalePrice !== null && d.totalCost !== null) {
    const rest = r2(d.resalePrice - d.totalCost - d.margin);
    if (rest > 0.005) lines.push({ label: "Frais de vente et taxes", note: "vos paramètres", amount: rest, kind: "minus" });
  }
  lines.push({ label: "Marge estimée", amount: d.margin, kind: "result" });
  return lines;
}

export function rulerEmptyCaption(d: Pick<SimpleDealDTO, "marketCount">): string {
  return `Pas assez d'offres équivalentes (${d.marketCount} trouvée${d.marketCount > 1 ? "s" : ""})`;
}

/** Rien trouvé : proposition d'une recherche plus courte (deux premiers mots) si la recherche en a plus. */
export function simplerQuery(query: string): string | null {
  const words = query.split(/\s+/).filter(Boolean);
  return words.length > 2 ? words.slice(0, 2).join(" ") : null;
}

/** Fournisseurs consultés : ceux qui ont répondu et ceux sans réponse. */
export function checkedSummary(checked: SimpleSearchDTO["checked"]): { answered: SimpleSearchDTO["checked"]; failed: SimpleSearchDTO["checked"] } {
  return { answered: checked.filter((c) => c.ok), failed: checked.filter((c) => !c.ok) };
}
