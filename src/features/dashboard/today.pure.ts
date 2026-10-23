/**
 * Écran « Aujourd'hui » (web v5) — calculs PURS repris de l'application iPhone
 * (apps/mobile/src/data/intelligence.ts, apps/mobile/src/data/catalog.ts,
 * apps/mobile/src/components/dashboard.tsx). Une valeur non calculable vaut `null` : l'écran
 * affiche « — » ou masque l'élément, jamais une estimation inventée.
 */
import type { StockLevel } from "@/domain/inventory/alerts";
import type { BarcodeLevel } from "@/components/instrument/pure";
import { dayKey, shiftDayKey, ANALYTICS_TIME_ZONE } from "@/features/analytics/series.pure";

// ---------------------------------------------------------------------------------------------
// Ventes du jour
// ---------------------------------------------------------------------------------------------

export interface MarginOrderLike {
  currency: string | null;
  fee_total: number | null;
  placed_at: string | null;
  items: { quantity: number; unit_price: number | null; sku: { cost_price: number | null; currency: string | null } | null }[];
}

const sameCurrency = (c: string | null | undefined, currency: string) => !c || c.toUpperCase() === currency.toUpperCase();

/**
 * Marge du jour en % du CA : uniquement si CHAQUE commande du jour a ses frais connus et chaque
 * ligne un prix et un coût d'achat connus dans la devise de l'organisation (règle iPhone).
 */
export function marginTodayPercent(orders: readonly MarginOrderLike[], currency: string, now: Date): number | null {
  const today = dayKey(now, ANALYTICS_TIME_ZONE);
  const todays = orders.filter((o) => o.placed_at && dayKey(new Date(o.placed_at), ANALYTICS_TIME_ZONE) === today);
  let revenue = 0;
  let cost = 0;
  let fees = 0;
  let complete = todays.length > 0;
  for (const o of todays) {
    if (!sameCurrency(o.currency, currency)) complete = false;
    if (o.fee_total === null) complete = false;
    fees += Number(o.fee_total ?? 0);
    for (const it of o.items) {
      if (it.unit_price === null || !it.sku || it.sku.cost_price === null || !sameCurrency(it.sku.currency, currency)) {
        complete = false;
        continue;
      }
      revenue += it.unit_price * it.quantity;
      cost += it.sku.cost_price * it.quantity;
    }
  }
  return complete && revenue > 0 ? Math.round(((revenue - cost - fees) / revenue) * 1000) / 10 : null;
}

/** « MAR. 20 OCT. » (jour civil Europe/Paris). */
export function sceneDateLabel(now: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: ANALYTICS_TIME_ZONE, weekday: "short", day: "numeric", month: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
  return `${cap(get("weekday"))} ${get("day")} ${get("month")}`.replace(/\s+/g, " ").trim();
}

/** « 7 oct. » pour une clé AAAA-MM-JJ. */
export function shortDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

/** Heure d'une vente : « 09:12 » aujourd'hui, « hier 22:14 », sinon « 18 oct. ». */
export function saleTimeLabel(placedAt: string | null, now: Date): string {
  if (!placedAt) return "—";
  const d = new Date(placedAt);
  if (Number.isNaN(d.getTime())) return "—";
  const key = dayKey(d, ANALYTICS_TIME_ZONE);
  const today = dayKey(now, ANALYTICS_TIME_ZONE);
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: ANALYTICS_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(d);
  if (key === today) return time;
  if (key === shiftDayKey(today, -1)) return `hier ${time}`;
  return shortDayLabel(key);
}

export type SaleTone = "warning" | "neutral" | "success" | "danger";

/** Statut d'une vente récente : « À expédier » seulement pour une vente marketplace payée. */
export function saleStatus(status: string, provider: string): { label: string; tone: SaleTone } {
  switch (status) {
    case "paid":
      return provider === "manual" ? { label: "Payée", tone: "neutral" } : { label: "À expédier", tone: "warning" };
    case "pending":
      return { label: "En attente", tone: "warning" };
    case "shipped":
      return { label: "Expédiée", tone: "neutral" };
    case "delivered":
      return { label: "Livrée", tone: "success" };
    case "cancelled":
      return { label: "Annulée", tone: "neutral" };
    case "refunded":
      return { label: "Remboursée", tone: "danger" };
    default:
      return { label: "Statut inconnu", tone: "neutral" };
  }
}

// ---------------------------------------------------------------------------------------------
// Stock : code-barres, part des ventes en rupture
// ---------------------------------------------------------------------------------------------

export interface StockSkuLike {
  skuId: string;
  units30d: number;
  available: number;
  level: StockLevel;
}

export function barcodeLevel(level: StockLevel): BarcodeLevel {
  return level === "out_of_stock" ? "out" : level === "normal" ? "ok" : "low";
}

/** Lien du stock filtré sur un niveau (puces de /stock : `niveau=rupture|faible`). */
export function stockLevelHref(level: StockLevel | "all"): string {
  if (level === "all" || level === "normal") return "/stock";
  return level === "out_of_stock" ? "/stock?niveau=rupture" : "/stock?niveau=faible";
}

/**
 * Part des ventes 30 j portée par des SKU en rupture (en %, arrondie). `null` si aucune vente
 * sur 30 jours (rien à rapporter, jamais « 0 % » inventé).
 */
export function outOfStockSalesShare(skus: readonly StockSkuLike[]): number | null {
  let total = 0;
  let lost = 0;
  for (const s of skus) {
    const u = Math.max(0, s.units30d);
    total += u;
    if (s.available <= 0) lost += u;
  }
  return total > 0 ? Math.round((lost / total) * 100) : null;
}

// ---------------------------------------------------------------------------------------------
// À faire maintenant : la rupture la plus coûteuse et sa meilleure offre rapprochée
// ---------------------------------------------------------------------------------------------

export interface PriorityCandidate {
  skuId: string;
  code: string;
  name: string;
  category: string | null;
  level: StockLevel;
  available: number;
  units30d: number;
  /** prix de vente retenu (moyenne 30 j constatée, sinon prix du SKU) */
  salePrice: number | null;
  daysOfCover: number | null;
}

/** CA des 30 prochains jours exposé à la rupture ≈ ventes 30 j × prix de vente ; null si le prix est inconnu. */
export function lostRevenue30d(c: Pick<PriorityCandidate, "units30d" | "salePrice">): number | null {
  if (c.salePrice === null || !(c.units30d > 0)) return null;
  return Math.round(c.units30d * c.salePrice * 100) / 100;
}

/**
 * Priorité : parmi les ruptures vendues sur 30 j, la plus coûteuse (CA perdu) ayant une offre
 * rapprochée ; à défaut la plus coûteuse sans offre ; sans rupture vendue, le SKU à risque ou faible
 * le plus vendu qui a une offre rapprochée. null s'il n'y a rien d'urgent.
 */
export function pickPriority<T extends PriorityCandidate>(skus: readonly T[], hasOffer: (skuId: string) => boolean): T | null {
  const cost = (c: T) => lostRevenue30d(c) ?? -1;
  const byCost = (a: T, b: T) => cost(b) - cost(a) || b.units30d - a.units30d || a.name.localeCompare(b.name, "fr");
  const outs = skus.filter((s) => s.level === "out_of_stock" && s.units30d > 0).sort(byCost);
  const withOffer = outs.find((s) => hasOffer(s.skuId));
  if (withOffer) return withOffer;
  if (outs[0]) return outs[0];
  const lows = skus.filter((s) => (s.level === "at_risk" || s.level === "low") && s.units30d > 0 && hasOffer(s.skuId)).sort(byCost);
  return lows[0] ?? null;
}

/** Meilleure offre rapprochée d'un SKU : le prix le plus bas parmi les offres au prix connu (comme le radar). */
export function bestOfferFor<T extends { sku: { id: string }; offer: { price: number | null } }>(items: readonly T[], skuId: string): T | null {
  return [...items].filter((i) => i.sku.id === skuId && i.offer.price !== null).sort((a, b) => (a.offer.price ?? 0) - (b.offer.price ?? 0))[0] ?? null;
}

/** Opportunités du radar : rentables ou estimées avec un bénéfice positif, dans l'ordre du radar. */
export function radarOpportunities<T extends { evaluation: { status: string; estimatedProfit: number | null } }>(items: readonly T[], limit = 3): T[] {
  return items.filter((i) => (i.evaluation.status === "profitable" || i.evaluation.status === "estimated") && (i.evaluation.estimatedProfit ?? 0) > 0).slice(0, limit);
}

// ---------------------------------------------------------------------------------------------
// À traiter
// ---------------------------------------------------------------------------------------------

export type TaskTone = "danger" | "warning" | "info" | "neutral";
export type TaskIcon = "packageX" | "packageMinus" | "fileWarning" | "link2Off" | "truck" | "boxes" | "bell" | "refresh" | "clipboard" | "tag" | "wallet" | "minus";

export interface Task {
  key: string;
  icon: TaskIcon;
  tone: TaskTone;
  title: string;
  detail: string | null;
  cta: string;
  href: string;
  rank: number;
}

export interface ImportJobLike {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  fileName: string | null;
  status: string;
  message: string | null;
  startedAt: string;
  counts: { read: number; created: number; updated: number; invalid: number; unrecognized: number };
}

export interface TaskInput {
  now: Date;
  outOfStock: number;
  atRisk: number;
  low: number;
  negativeStock: number;
  /** compteurs de requêtes : null = inconnu (requête en échec) → ligne « compteur indisponible », jamais 0 */
  toShip: number | null;
  pendingSales: number | null;
  unmappedListings: number | null;
  syncFailed24h: number | null;
  openAlerts: number | null;
  toReplenish: number | null;
  unknownCostWithSales: number;
  jobs: readonly ImportJobLike[] | null;
  accounts: readonly { key: string; name: string; status: string; lastError: string | null }[] | null;
  channels: readonly { key: string; name: string; state: string; detail: string | null }[];
}

const n = (v: number) => new Intl.NumberFormat("fr-FR").format(v);
const pl = (count: number, one: string, many: string) => `${n(count)} ${count > 1 ? many : one}`;

/** Rang des lignes « compteur indisponible » : après les tâches actionnables. */
const UNKNOWN_RANK = 6;

/**
 * Tâches actionnables, des plus graves aux moins graves ; chacune mène à sa résolution. Un
 * compteur inconnu (null) donne une ligne d'information « compteur indisponible », jamais « 0 ».
 */
export function buildTasks(i: TaskInput): Task[] {
  const tasks: Task[] = [];
  const unknown = (key: string, icon: TaskIcon, what: string, href: string) =>
    tasks.push({ key: `${key}-unknown`, icon, tone: "info", title: `${what} : compteur indisponible`, detail: "vérification impossible pour le moment", cta: "Voir", href, rank: UNKNOWN_RANK });
  // seul le DERNIER import de chaque fournisseur compte (un échec corrigé depuis n'est plus à traiter)
  const latest = new Map<string, ImportJobLike>();
  for (const j of i.jobs ?? []) {
    if (i.now.getTime() - new Date(j.startedAt).getTime() >= 14 * 86_400_000) continue;
    const k = j.supplierId ?? j.id;
    const cur = latest.get(k);
    if (!cur || cur.startedAt < j.startedAt) latest.set(k, j);
  }
  for (const j of latest.values()) {
    const who = j.supplierName ?? "fournisseur";
    const href = `/sourcing/imports/${j.id}`;
    if (j.status === "failed" || j.status === "quarantined") tasks.push({ key: `job-${j.id}`, icon: "fileWarning", tone: "danger", title: `Import ${j.status === "quarantined" ? "suspendu" : "échoué"} · ${who}`, detail: j.message ?? j.fileName, cta: "Rapport", href, rank: 0 });
    else if (j.status === "partial" && j.counts.invalid + j.counts.unrecognized > 0)
      tasks.push({ key: `job-${j.id}`, icon: "fileWarning", tone: "warning", title: `Import partiel · ${who}`, detail: `${pl(j.counts.invalid + j.counts.unrecognized, "ligne ignorée", "lignes ignorées")} sur ${n(j.counts.read)}`, cta: "Rapport", href, rank: 3 });
  }
  for (const a of i.accounts ?? []) if (a.status === "error") tasks.push({ key: `acc-${a.key}`, icon: "link2Off", tone: "danger", title: `Connexion ${a.name} en erreur`, detail: a.lastError, cta: "Corriger", href: `/suppliers/directory/${encodeURIComponent(a.key)}`, rank: 0 });
  for (const c of i.channels)
    if (c.state === "error" || c.state === "expired") tasks.push({ key: `ch-${c.key}`, icon: "link2Off", tone: "danger", title: c.state === "expired" ? `Connexion ${c.name} expirée` : `Connexion ${c.name} en erreur`, detail: c.detail, cta: "Reconnecter", href: "/settings/integrations", rank: 0 });
  if (i.outOfStock > 0) tasks.push({ key: "out", icon: "packageX", tone: "danger", title: pl(i.outOfStock, "produit en rupture", "produits en rupture"), detail: null, cta: "Voir", href: stockLevelHref("out_of_stock"), rank: 1 });
  if (i.negativeStock > 0) tasks.push({ key: "negative", icon: "minus", tone: "danger", title: pl(i.negativeStock, "stock négatif à corriger", "stocks négatifs à corriger"), detail: "Ventes déduites au-delà du stock connu", cta: "Corriger", href: "/stock?stock=negative", rank: 1 });
  if (i.syncFailed24h === null) unknown("sync", "refresh", "Synchronisations échouées", "/settings/sync");
  else if (i.syncFailed24h > 0) tasks.push({ key: "sync", icon: "refresh", tone: "danger", title: pl(i.syncFailed24h, "synchronisation échouée", "synchronisations échouées"), detail: "ces dernières 24 h", cta: "Voir", href: "/settings/sync", rank: 1 });
  if (i.toShip === null) unknown("ship", "truck", "Commandes à expédier", "/sales?status=paid");
  else if (i.toShip > 0) tasks.push({ key: "ship", icon: "truck", tone: "warning", title: pl(i.toShip, "commande à expédier", "commandes à expédier"), detail: null, cta: "Expédier", href: "/sales?status=paid", rank: 2 });
  if (i.toReplenish !== null && i.toReplenish > 0) tasks.push({ key: "replenish", icon: "clipboard", tone: "warning", title: pl(i.toReplenish, "produit à réapprovisionner", "produits à réapprovisionner"), detail: "d'après vos ventes et délais fournisseur", cta: "Voir", href: "/insights#recommandations", rank: 2 });
  if (i.atRisk > 0) tasks.push({ key: "at_risk", icon: "packageMinus", tone: "warning", title: pl(i.atRisk, "produit à risque de rupture", "produits à risque de rupture"), detail: "couverture inférieure au délai de réapprovisionnement", cta: "Voir", href: stockLevelHref("at_risk"), rank: 2 });
  if (i.low > 0) tasks.push({ key: "low", icon: "packageMinus", tone: "warning", title: pl(i.low, "produit en stock faible", "produits en stock faible"), detail: "sous le seuil de réapprovisionnement", cta: "Voir", href: stockLevelHref("low"), rank: 3 });
  if (i.openAlerts === null) unknown("alerts", "bell", "Alertes ouvertes", "/stock/alerts#evenements");
  else if (i.openAlerts > 0) tasks.push({ key: "alerts", icon: "bell", tone: "warning", title: pl(i.openAlerts, "alerte ouverte", "alertes ouvertes"), detail: null, cta: "Traiter", href: "/stock/alerts#evenements", rank: 3 });
  if (i.pendingSales === null) unknown("pending", "boxes", "Ventes non déduites", "/sales?inventory=pending");
  else if (i.pendingSales > 0) tasks.push({ key: "pending", icon: "boxes", tone: "neutral", title: pl(i.pendingSales, "vente non déduite du stock", "ventes non déduites du stock"), detail: "le stock affiché est surestimé", cta: "Vérifier", href: "/sales?inventory=pending", rank: 4 });
  if (i.unmappedListings === null) unknown("unmapped", "tag", "Annonces non associées", "/settings/integrations/mapping");
  else if (i.unmappedListings > 0) tasks.push({ key: "unmapped", icon: "tag", tone: "neutral", title: pl(i.unmappedListings, "annonce non associée", "annonces non associées"), detail: "leurs ventes ne sont pas déduites du stock", cta: "Associer", href: "/settings/integrations/mapping", rank: 4 });
  if (i.unknownCostWithSales > 0) tasks.push({ key: "unknown_cost", icon: "wallet", tone: "info", title: pl(i.unknownCostWithSales, "produit vendu sans coût d'achat", "produits vendus sans coût d'achat"), detail: "marge incalculable", cta: "Compléter", href: "/margins?unknown=1", rank: 5 });
  return tasks.sort((a, b) => a.rank - b.rank);
}

// ---------------------------------------------------------------------------------------------
// Bien démarrer
// ---------------------------------------------------------------------------------------------

export type SetupIcon = "plus" | "wallet" | "library" | "scan";
export interface SetupStep {
  key: "product" | "channel" | "supplier" | "costs";
  done: boolean;
  icon: SetupIcon;
  title: string;
  detail: string;
  href: string;
}

/**
 * « Fournisseur branché ? » : vrai dès qu'une source le prouve (comptes/sources pro, connexion
 * active, fournisseur enregistré). Faux seulement si toutes les sources sont connues et vides ;
 * null (étape masquée) si le hub des comptes ou le compteur des fournisseurs est inconnu.
 */
export function resolveHasSupplier(
  accounts: { totals: { account: number; public: number }; accounts: readonly { status: string }[] } | null,
  suppliersCount: number | null,
): boolean | null {
  if (suppliersCount !== null && suppliersCount > 0) return true;
  if (accounts && (accounts.totals.account + accounts.totals.public > 0 || accounts.accounts.some((a) => a.status === "connected"))) return true;
  if (accounts === null || suppliersCount === null) return null;
  return false;
}

/** Étapes réelles de configuration ; une étape dont l'état est inconnu (null) n'est pas affichée. */
export function setupSteps(input: { hasProducts: boolean; hasChannel: boolean | null; hasSupplier: boolean | null; hasCosts: boolean | null }): SetupStep[] {
  const steps: (SetupStep | null)[] = [
    { key: "product", done: input.hasProducts, icon: "plus", title: "Ajouter vos produits", detail: "Saisie, variantes ou import", href: "/stock/new" },
    input.hasChannel === null ? null : { key: "channel", done: input.hasChannel, icon: "wallet", title: "Connecter eBay", detail: "Ventes et stock synchronisés", href: "/settings/integrations" },
    input.hasSupplier === null ? null : { key: "supplier", done: input.hasSupplier, icon: "library", title: "Brancher un fournisseur", detail: "Compte pro, catalogue ou source publique", href: "/suppliers/directory" },
    input.hasCosts === null ? null : { key: "costs", done: input.hasCosts, icon: "scan", title: "Régler vos coûts", detail: "TVA, commission, transport : pour des marges complètes", href: "/radar/settings" },
  ];
  return steps.filter((s): s is SetupStep => s !== null);
}
