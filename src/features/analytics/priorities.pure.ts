/**
 * « À traiter aujourd'hui » (dashboard) et « Que dois-je faire maintenant ? » (insights) :
 * listes priorisées construites uniquement à partir de compteurs et de faits observés.
 */
import { plural } from "@/features/analytics/util.pure";
import { formatVelocity } from "@/domain/replenishment/replenishment";

/** Libellé d'un compteur opérationnel dont la requête a échoué : jamais affiché comme « 0 ». */
export const UNKNOWN_COUNT_SUFFIX = "compteur indisponible pour le moment";

/**
 * Compteurs des listes « À traiter ». `null` = compteur inconnu (requête en échec) : la ligne
 * correspondante devient une ligne d'information « compteur indisponible », jamais « 0 » (W-14).
 */
export interface TodoCounts {
  toReplenish: number;
  /** synchronisations échouées (24 h) + alertes ouvertes ; null si l'un des deux est inconnu */
  syncErrors: number | null;
  lowStock: number;
  unmappedListings: number | null;
  pendingSales: number | null;
  negativeStock: number;
}

export type TodoTone = "danger" | "warning" | "info";

export interface TodoItem {
  key: keyof TodoCounts;
  /** null = compteur inconnu : afficher « — », jamais 0 */
  count: number | null;
  label: string;
  href: string;
  tone: TodoTone;
}

/**
 * Seuls les compteurs > 0 produisent une ligne d'action ; ordre = gravité. Un compteur inconnu
 * produit une ligne d'information (après les actions) qui le dit, sans chiffre.
 */
export function buildTodoItems(c: TodoCounts): TodoItem[] {
  const items: TodoItem[] = [];
  const unknown: TodoItem[] = [];
  const unknownLine = (key: keyof TodoCounts, what: string, href: string): void => {
    unknown.push({ key, count: null, label: `${what} : ${UNKNOWN_COUNT_SUFFIX}`, href, tone: "info" });
  };
  if (c.toReplenish > 0) items.push({ key: "toReplenish", count: c.toReplenish, label: `${c.toReplenish} ${plural(c.toReplenish, "produit")} à réapprovisionner`, href: "/insights#recommandations", tone: "danger" });
  if (c.negativeStock > 0) items.push({ key: "negativeStock", count: c.negativeStock, label: `${c.negativeStock} ${plural(c.negativeStock, "stock négatif", "stocks négatifs")} à corriger`, href: "/stock?stock=negative", tone: "danger" });
  if (c.syncErrors === null) unknownLine("syncErrors", "Erreurs de synchronisation et alertes", "/stock/alerts#evenements");
  else if (c.syncErrors > 0) items.push({ key: "syncErrors", count: c.syncErrors, label: `${c.syncErrors} ${plural(c.syncErrors, "erreur")} de synchronisation ou ${plural(c.syncErrors, "alerte")} à traiter`, href: "/stock/alerts#evenements", tone: "danger" });
  if (c.lowStock > 0) items.push({ key: "lowStock", count: c.lowStock, label: `${c.lowStock} ${plural(c.lowStock, "produit")} en stock faible`, href: "/stock/alerts?level=low", tone: "warning" });
  if (c.unmappedListings === null) unknownLine("unmappedListings", "Annonces non associées", "/settings/integrations/mapping");
  else if (c.unmappedListings > 0) items.push({ key: "unmappedListings", count: c.unmappedListings, label: `${c.unmappedListings} ${plural(c.unmappedListings, "annonce non associée", "annonces non associées")} à un SKU`, href: "/settings/integrations/mapping", tone: "warning" });
  if (c.pendingSales === null) unknownLine("pendingSales", "Ventes non déduites", "/sales?inventory=pending");
  else if (c.pendingSales > 0) items.push({ key: "pendingSales", count: c.pendingSales, label: `${c.pendingSales} ${plural(c.pendingSales, "vente non déduite", "ventes non déduites")} du stock`, href: "/sales?inventory=pending", tone: "warning" });
  return [...items, ...unknown];
}

/**
 * Organisation « vide » (aucun produit ni commande) : uniquement si les deux sont connus et nuls.
 * Un nombre de commandes inconnu (null) ne permet pas de conclure (W-14).
 */
export function isEmptyWorkspace(skus: number, ordersTotal: number | null): boolean {
  return skus === 0 && ordersTotal === 0;
}

export type InsightSeverity = "critical" | "warning" | "info";

export interface InsightItem {
  key: string;
  severity: InsightSeverity;
  title: string;
  detail: string | null;
  href: string;
  action: string;
}

export interface InsightSku {
  code: string;
  name: string;
  /** vitesse (unités / jour), null si inconnue */
  dailyVelocity: number | null;
  daysOfCover: number | null;
}

export interface InsightInput {
  outOfStock: InsightSku[];
  atRisk: InsightSku[];
  lowCount: number;
  /** compteurs opérationnels : null = inconnu (requête en échec), jamais traité comme 0 */
  syncFailed24h: number | null;
  openAlerts: number | null;
  unmappedListings: number | null;
  pendingSales: number | null;
  negativeStock: number;
  /** SKU vendus sur 30 j dont le coût est inconnu (marge incalculable) */
  unknownCostWithSales: number;
  deadStock: number;
  /** canaux dont les frais ne sont pas renseignés */
  channelsMissingFees: string[];
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
const MAX_PER_GROUP = 5;

function skuHref(code: string): string {
  return `/stock/${encodeURIComponent(code)}`;
}

/** Ligne d'information pour un compteur inconnu : dit que la vérification a échoué, sans chiffre. */
function unknownInsight(key: string, what: string, href: string, action: string): InsightItem {
  return { key: `${key}:unknown`, severity: "info", title: `${what} : ${UNKNOWN_COUNT_SUFFIX}`, detail: "La vérification a échoué : rechargez la page dans un instant.", href, action };
}

export function buildInsights(input: InsightInput): InsightItem[] {
  const items: InsightItem[] = [];

  const outOfStock = input.outOfStock.slice(0, MAX_PER_GROUP);
  for (const s of outOfStock) {
    items.push({
      key: `oos:${s.code}`,
      severity: "critical",
      title: `Rupture : ${s.name}`,
      detail: s.dailyVelocity !== null ? `${formatVelocity(s.dailyVelocity)} vente(s)/jour perdue(s) tant que le stock est à zéro.` : "Aucune vente récente enregistrée : vitesse inconnue (pas assez de données).",
      href: `/sourcing/catalog?sku=${encodeURIComponent(s.code)}`,
      action: "Trouver du stock",
    });
  }
  if (input.outOfStock.length > MAX_PER_GROUP) {
    const rest = input.outOfStock.length - MAX_PER_GROUP;
    items.push({ key: "oos:more", severity: "critical", title: `${rest} ${plural(rest, "autre produit", "autres produits")} en rupture`, detail: null, href: "/stock/alerts?level=out_of_stock", action: "Voir la liste" });
  }

  const atRisk = input.atRisk.slice(0, MAX_PER_GROUP);
  for (const s of atRisk) {
    const days = s.daysOfCover !== null && Number.isFinite(s.daysOfCover) ? Math.max(0, Math.round(s.daysOfCover)) : null;
    items.push({
      key: `risk:${s.code}`,
      severity: "critical",
      title: days !== null ? `Rupture estimée dans ${days} ${plural(days, "jour")} : ${s.name}` : `Risque de rupture : ${s.name}`,
      detail: s.dailyVelocity !== null ? `Au rythme de ${formatVelocity(s.dailyVelocity)} vente(s)/jour, le stock ne couvre pas le délai de réapprovisionnement.` : null,
      href: skuHref(s.code),
      action: "Voir la recommandation",
    });
  }
  if (input.atRisk.length > MAX_PER_GROUP) {
    const rest = input.atRisk.length - MAX_PER_GROUP;
    items.push({ key: "risk:more", severity: "critical", title: `${rest} ${plural(rest, "autre produit", "autres produits")} à risque de rupture`, detail: null, href: "/stock/alerts?level=at_risk", action: "Voir la liste" });
  }

  if (input.negativeStock > 0) {
    items.push({ key: "negative", severity: "critical", title: `${input.negativeStock} ${plural(input.negativeStock, "SKU")} en stock négatif`, detail: "Des ventes ont été déduites au-delà du stock connu : corrigez le stock physique.", href: "/stock?stock=negative", action: "Corriger" });
  }
  if (input.syncFailed24h === null) items.push(unknownInsight("sync", "Synchronisations échouées (24 h)", "/settings/sync", "Voir la synchronisation"));
  else if (input.syncFailed24h > 0) {
    items.push({ key: "sync", severity: "critical", title: `${input.syncFailed24h} ${plural(input.syncFailed24h, "synchronisation échouée", "synchronisations échouées")} ces dernières 24 h`, detail: "Vos ventes et annonces ne sont peut-être plus à jour.", href: "/settings/sync", action: "Voir la synchronisation" });
  }
  if (input.openAlerts === null) items.push(unknownInsight("alerts", "Alertes ouvertes", "/stock/alerts#evenements", "Voir les alertes"));
  else if (input.openAlerts > 0) {
    items.push({ key: "alerts", severity: "warning", title: `${input.openAlerts} ${plural(input.openAlerts, "alerte ouverte", "alertes ouvertes")}`, detail: null, href: "/stock/alerts#evenements", action: "Traiter les alertes" });
  }
  if (input.lowCount > 0) {
    items.push({ key: "low", severity: "warning", title: `${input.lowCount} ${plural(input.lowCount, "produit")} en stock faible`, detail: "Sous le seuil de réapprovisionnement ou couverture courte.", href: "/stock/alerts?level=low", action: "Voir les produits" });
  }
  if (input.pendingSales === null) items.push(unknownInsight("pending", "Ventes non déduites", "/sales?inventory=pending", "Vérifier"));
  else if (input.pendingSales > 0) {
    items.push({ key: "pending", severity: "warning", title: `${input.pendingSales} ${plural(input.pendingSales, "vente non déduite", "ventes non déduites")} du stock`, detail: "Commandes rattachées à un SKU après coup : le stock affiché est surestimé.", href: "/sales?inventory=pending", action: "Vérifier" });
  }
  if (input.unmappedListings === null) items.push(unknownInsight("unmapped", "Annonces non associées", "/settings/integrations/mapping", "Voir les annonces"));
  else if (input.unmappedListings > 0) {
    items.push({ key: "unmapped", severity: "warning", title: `${input.unmappedListings} ${plural(input.unmappedListings, "annonce non associée", "annonces non associées")} à un SKU`, detail: "Les ventes de ces annonces ne sont pas déduites du stock.", href: "/settings/integrations/mapping", action: "Associer" });
  }
  if (input.unknownCostWithSales > 0) {
    items.push({ key: "unknown_cost", severity: "warning", title: `${input.unknownCostWithSales} ${plural(input.unknownCostWithSales, "SKU vendu", "SKU vendus")} sans coût d'achat`, detail: "Impossible de calculer leur marge : renseignez le prix d'achat.", href: "/margins?unknown=1", action: "Compléter les coûts" });
  }
  if (input.channelsMissingFees.length > 0) {
    items.push({ key: "fees", severity: "info", title: `Frais non renseignés : ${input.channelsMissingFees.join(", ")}`, detail: "Les marges nettes restent partielles tant que commissions et frais de paiement sont inconnus.", href: "/settings/organization", action: "Renseigner les frais" });
  }
  if (input.deadStock > 0) {
    items.push({ key: "dead", severity: "info", title: `${input.deadStock} ${plural(input.deadStock, "SKU")} sans vente depuis 60 jours`, detail: "Du capital immobilisé : baisse de prix, mise en avant ou déstockage ?", href: "/stock?sort=oldest_sale&stock=in_stock", action: "Voir le stock dormant" });
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
