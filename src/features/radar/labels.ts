/**
 * Radar d'opportunités d'achat (web) — libellés et logique d'affichage PURE, repris de
 * l'application iPhone (apps/mobile/src/data/radar.ts, écrans radar/*). Les montants viennent du
 * calcul du serveur (`buildRadar`) ; un coût inconnu n'est jamais compté pour 0.
 */
import type { RadarItemDTO, RadarSort } from "@/features/mobile-api/contract";
import type { BadgeVariant } from "@/components/ui/badge";

export { PRICE_ORIGIN_LABEL } from "@/domain/sourcing/radar";

type Status = RadarItemDTO["evaluation"]["status"];
type Freshness = RadarItemDTO["evaluation"]["freshness"];
export type OfferVerdict = RadarItemDTO["assessment"]["verdict"];
type AppraisalLabel = RadarItemDTO["assessment"]["competitiveness"]["label"];

export const STATUS_LABEL: Record<Status, string> = {
  profitable: "Rentable (coûts complets)",
  estimated: "Estimation partielle",
  unprofitable: "Non rentable",
  insufficient_data: "Données insuffisantes",
};

export const STATUS_VARIANT: Record<Status, BadgeVariant> = {
  profitable: "success",
  estimated: "warning",
  unprofitable: "danger",
  insufficient_data: "neutral",
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: "Prix récent",
  recent: "Prix de moins de 7 jours",
  stale: "Prix ancien",
  unknown: "Date du prix inconnue",
};

export const VERDICT_LABEL: Record<OfferVerdict, string> = {
  opportunity: "Opportunité",
  to_verify: "À vérifier",
  risky: "Risquée",
  insufficient_data: "Données insuffisantes",
};

export const VERDICT_VARIANT: Record<OfferVerdict, BadgeVariant> = {
  opportunity: "success",
  to_verify: "warning",
  risky: "danger",
  insufficient_data: "neutral",
};

export const APPRAISAL_LABEL: Record<AppraisalLabel, string> = {
  excellent: "Excellente",
  good: "Bonne",
  fair: "Moyenne",
  weak: "Faible",
  insufficient_data: "Données insuffisantes",
};

/** « 72 / 100 · Bonne » ou « Données insuffisantes » (jamais 0 par défaut). */
export function appraisalText(a: { score: number | null; label: AppraisalLabel }): string {
  return a.score === null ? APPRAISAL_LABEL.insufficient_data : `${Math.round(a.score)} / 100 · ${APPRAISAL_LABEL[a.label]}`;
}

export const SORT_OPTIONS: { value: RadarSort; label: string }[] = [
  { value: "score", label: "Pertinence" },
  { value: "profit", label: "Bénéfice" },
  { value: "margin", label: "Marge" },
  { value: "availability", label: "Disponibilité" },
  { value: "freshness", label: "Fraîcheur" },
];

export type RadarFilter = "all" | "profitable" | "estimated" | "saved";

export const FILTER_OPTIONS: { value: RadarFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "profitable", label: "Rentables" },
  { value: "estimated", label: "Estimations" },
  { value: "saved", label: "Enregistrées" },
];

const SORTS = new Set<string>(SORT_OPTIONS.map((o) => o.value));
const FILTERS = new Set<string>(FILTER_OPTIONS.map((o) => o.value));

/** Paramètres d'URL du radar (valeurs inconnues → valeurs par défaut). */
export function parseRadarParams(raw: Record<string, string | string[] | undefined>): { sort: RadarSort; filter: RadarFilter } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const sort = one(raw.sort);
  const filter = one(raw.filter);
  return { sort: (SORTS.has(sort) ? sort : "score") as RadarSort, filter: (FILTERS.has(filter) ? filter : "all") as RadarFilter };
}

export function filterItems<T extends Pick<RadarItemDTO, "evaluation" | "savedAt">>(items: T[], filter: RadarFilter): T[] {
  if (filter === "profitable") return items.filter((i) => i.evaluation.status === "profitable");
  if (filter === "estimated") return items.filter((i) => i.evaluation.status === "estimated");
  if (filter === "saved") return items.filter((i) => i.savedAt);
  return items;
}

/** Bénéfice affiché : exact si rentable avec coûts complets, sinon « ≈ » ; « — » si inconnu. */
export function profitPrefix(status: Status): string {
  return status === "profitable" ? "" : "≈ ";
}

export type BreakdownKind = "revenue" | "cost" | "subtotal" | "deduction" | "result";

/**
 * Lignes du calcul du serveur (`evaluation.breakdown`) classées pour l'affichage :
 * prix de vente / CA HT (revenue), prix d'achat, transport, douane (cost), coût d'achat rendu et
 * marge brute (subtotal), TVA sur marge et frais de vente (deduction), bénéfice (result).
 */
export function classifyBreakdown(lines: { label: string; amount: number | null }[]): { label: string; amount: number | null; kind: BreakdownKind }[] {
  let afterLanded = false;
  return lines.map((l, i) => {
    let kind: BreakdownKind;
    if (/^Bénéfice/.test(l.label)) kind = "result";
    else if (/^(Coût d'achat rendu|Marge brute)/.test(l.label)) kind = "subtotal";
    else if (i === 0 || /^CA hors TVA/.test(l.label)) kind = "revenue";
    else if (!afterLanded && /^(Prix d'achat|Transport fournisseur|Douane)/.test(l.label)) kind = "cost";
    else kind = "deduction";
    if (/^Coût d'achat rendu/.test(l.label)) afterLanded = true;
    return { ...l, kind };
  });
}

/** Champs numériques des paramètres de coûts (mêmes libellés et bornes que le serveur). */
export const COST_FIELDS = [
  { key: "vatRate", label: "Taux de TVA (%)", hint: "20 en France métropolitaine.", max: 30 },
  { key: "marketplaceFeePercent", label: "Commission marketplace (%)", hint: "Frais de vente eBay de votre catégorie.", max: 50 },
  { key: "paymentFeePercent", label: "Frais de paiement (%)", hint: "Inclus dans les frais eBay : 0 si c'est votre cas.", max: 20 },
  { key: "paymentFeeFixed", label: "Frais fixes par commande", hint: "Ex. 0,35.", max: 50 },
  { key: "shippingToCustomer", label: "Expédition au client (par unité)", hint: "Coût moyen réel de vos envois.", max: 500 },
  { key: "packagingCost", label: "Emballage (par unité)", hint: "Carton, protection, étiquette.", max: 100 },
  { key: "returnProvisionPercent", label: "Provision retours / garantie (%)", hint: "Part du prix de vente mise de côté pour retours et SAV.", max: 50 },
  { key: "importDutyPercent", label: "Douane / import hors UE (%)", hint: "Appliqué uniquement aux fournisseurs hors UE.", max: 100 },
] as const;

export type CostFieldKey = (typeof COST_FIELDS)[number]["key"];

/** Texte de paramètre numérique → nombre (« 12,9 » accepté) ; vide → null (inconnu, jamais 0). */
export function parseSetting(text: string): number | null | "invalid" {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

/** Affichage d'un paramètre dans un champ : « 12,9 » ; inconnu → champ vide. */
export function settingText(v: number | null): string {
  return v === null ? "" : String(v).replace(".", ",");
}

/** Âge d'un prix en jours : « aujourd'hui », « il y a 3 j », « date inconnue ». */
export function ageDaysText(days: number | null): string {
  if (days === null) return "date inconnue";
  return days <= 0 ? "aujourd'hui" : `il y a ${days} j`;
}

/** Origine du prix en quelques mots (cartes du radar). */
export const PRICE_ORIGIN_SHORT: Record<RadarItemDTO["offer"]["priceOrigin"], string> = {
  verified_live: "Prix vérifié en direct",
  observed_public: "Site public",
  catalog_import: "Catalogue importé",
  supplier_communicated: "Communiqué par le fournisseur",
  manual_entry: "Saisie manuelle",
  unknown: "Origine inconnue",
};

/** Scène du radar : offres à bénéfice positif (rentables + estimations) sur l'ensemble des offres évaluées. */
export function radarFigure(c: { profitable: number; estimated: number; unprofitable: number; insufficient: number }): { positive: number; evaluated: number } {
  return { positive: c.profitable + c.estimated, evaluated: c.profitable + c.estimated + c.unprofitable + c.insufficient };
}

/** Bénéfice signé : « ≈ +38,20 € » (estimation) ou « +38,20 € » (coûts complets) ; « — » si inconnu. */
export function signedProfit(profit: number | null, status: Status, format: (n: number) => string): string {
  if (profit === null) return "—";
  return `${profitPrefix(status)}${profit >= 0 ? "+" : "−"}${format(Math.abs(profit))}`;
}

/** Lien vers une offre du radar en conservant le tri et le filtre (`?offer=` ouvre le détail à droite). */
export function radarHref(params: { sort: RadarSort; filter: RadarFilter; offer?: string | null }): string {
  const sp = new URLSearchParams();
  if (params.sort !== "score") sp.set("sort", params.sort);
  if (params.filter !== "all") sp.set("filter", params.filter);
  if (params.offer) sp.set("offer", params.offer);
  const q = sp.toString();
  return `/radar${q ? `?${q}` : ""}`;
}
