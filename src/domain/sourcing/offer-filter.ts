/**
 * OfferValidator (résultats de recherche) — décide, pour chaque offre candidate, si elle
 * correspond VRAIMENT à la requête et si elle est exploitable. Chaque rejet et chaque
 * avertissement porte un code et une raison en français, affichables tels quels.
 *
 * Rejets : modèle / marque / stockage différents, grade inférieur, état différent (si
 * demandé explicitement), accessoire / pièce / appareil défectueux ou verrouillé détecté dans
 * le titre, offre expirée ou rejetée, anomalie de prix suspecte, donnée > 30 jours,
 * prix aberrant par rapport à la médiane du résultat.
 *
 * Avertissements (offre conservée) : grade / état / stockage / modèle non communiqués,
 * couleur différente, prix anormalement bas chez un fournisseur vérifié, etc.
 * Rien n'est supposé : une donnée inconnue n'est jamais traitée comme conforme sans le dire.
 */
import { CONDITION_LABEL_FR, normalizeText, type ProductCondition } from "@/domain/sourcing/normalizer";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { median } from "@/domain/sourcing/validation";

export interface FilterCriteria {
  brand: string | null;
  model: string | null;
  storage: string | null;
  color: string | null;
  grade: string | null;
  /** état EXPLICITEMENT demandé (« unknown » si non demandé ou seulement déduit d'un grade) */
  condition: ProductCondition;
  /**
   * Ce que la requête cherche : un appareil (défaut), une pièce détachée (« écran iPhone 13 »),
   * un accessoire (« coque iPhone 13 ») ou un lot. Une pièce cherchée n'est pas « hors sujet ».
   */
  itemKind?: ItemKind;
  /** mot de la requête désignant la pièce / l'accessoire cherché (« écran », « batterie ») */
  itemLabel?: string | null;
}

export type ItemKind = "device" | "spare_part" | "accessory" | "lot";

export interface CandidateAnomaly {
  code: string;
  severity: "blocking" | "warning";
  message?: string;
}

export interface CandidateOffer {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  /** vrai si le modèle a été déduit du texte libre (non reconnu par un motif) */
  modelInferred?: boolean;
  storage: string | null;
  color?: string | null;
  grade: string | null;
  condition: ProductCondition;
  /** prix unitaire comparable (même devise et même base pour tout le résultat), null si inconnu */
  price: number | null;
  status: "active" | "expired" | "suspicious" | "rejected";
  anomalies: CandidateAnomaly[];
  lastSeenAt: string | Date | null;
  expiresAt?: string | Date | null;
  /** fournisseur vérifié (source attestée / fournisseur connu de l'organisation) */
  supplierVerified: boolean;
}

export type FilterReasonCode =
  | "brand_mismatch"
  | "model_mismatch"
  | "model_unknown"
  | "storage_mismatch"
  | "storage_unknown"
  | "grade_lower"
  | "grade_unknown"
  | "grade_not_applicable"
  | "condition_mismatch"
  | "condition_unknown"
  | "color_mismatch"
  | "accessory"
  | "spare_part"
  | "defective"
  | "locked"
  | "empty_box"
  | "expired"
  | "status_rejected"
  | "suspicious"
  | "anomaly_warning"
  | "stale"
  | "last_seen_unknown"
  | "price_unknown"
  | "price_low_verified"
  | "price_low_unverified"
  | "price_high"
  | "confirmed_link";

export interface FilterReason {
  code: FilterReasonCode;
  message: string;
}

export interface KeptOffer<T> {
  offer: T;
  warnings: FilterReason[];
}

export interface RejectedOffer<T> {
  offer: T;
  reasons: FilterReason[];
  warnings: FilterReason[];
}

export interface OfferFilterResult<T> {
  kept: Array<KeptOffer<T>>;
  rejected: Array<RejectedOffer<T>>;
  /** médiane des prix utilisée pour détecter les prix aberrants (null si < MIN_PRICES_FOR_OUTLIER) */
  referenceMedian: number | null;
  /** nombre d'offres par code de rejet */
  rejectionCounts: Partial<Record<FilterReasonCode, number>>;
}

export interface OfferFilterOptions {
  now?: Date;
  /** au-delà : donnée trop ancienne (défaut 30 jours) */
  staleDays?: number;
  /** sous ce ratio de la médiane : prix anormalement bas (défaut 0,4) */
  lowPriceRatio?: number;
  /** au-dessus de ce ratio de la médiane : prix aberrant (défaut 2,5) */
  highPriceRatio?: number;
}

export const STALE_OFFER_DAYS = 30;
export const LOW_PRICE_RATIO = 0.4;
export const HIGH_PRICE_RATIO = 2.5;
/** nombre minimal de prix pour calculer une médiane de référence fiable */
export const MIN_PRICES_FOR_OUTLIER = 3;

/** Anomalies de validation qui rendent l'offre suspecte (rejet) ; les autres sont des avertissements. */
export const SUSPICIOUS_ANOMALY_CODES = new Set(["price_zero", "price_negative", "price_missing", "price_too_low", "price_too_high", "currency_unknown", "negative_stock"]);

/** Critères de filtrage à partir d'une requête analysée (l'état n'est retenu que s'il est explicite). */
export function criteriaFromParsedQuery(parsed: ParsedQuery, rawQuery?: string): FilterCriteria {
  const intent = rawQuery ? queryItemIntent(rawQuery) : { kind: "device" as const, label: null };
  return { ...parsed.criteria, itemKind: intent.kind, itemLabel: intent.label };
}

/** Intention de la requête : la détection « pièce / accessoire » des titres, appliquée à la requête elle-même. */
export function queryItemIntent(rawQuery: string): { kind: ItemKind; label: string | null } {
  const q = ` ${normalizeText(rawQuery)} `;
  if (/\blots?\b|\ben gros\b|\bwholesale\b|\bbulk\b|\bdestockage\b|\bpalettes?\b|\bretours?\b|\bsurplus\b/.test(q)) return { kind: "lot", label: null };
  for (const rule of TITLE_RULES) {
    if (rule.issue !== "spare_part" && rule.issue !== "accessory") continue;
    if (rule.re.test(q)) return { kind: rule.issue, label: rule.label };
  }
  return { kind: "device", label: null };
}

// ---------------------------------------------------------------------------
// Grades
// ---------------------------------------------------------------------------

/** Rang d'un grade (plus petit = meilleur) : A+ 0,5 · A 1 · B+ 1,5 · B 2 · C 3. « A/B » = le moins bon. */
export function gradeRank(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const parts = grade
    .toUpperCase()
    .replace(/\s+/g, "")
    .split("/")
    .map((p) => {
      const m = p.match(/^([ABC])(\+)?$/);
      if (!m) return null;
      const base = m[1] === "A" ? 1 : m[1] === "B" ? 2 : 3;
      return m[2] ? base - 0.5 : base;
    });
  if (parts.length === 0 || parts.some((p) => p === null)) return null;
  return Math.max(...(parts as number[]));
}

// ---------------------------------------------------------------------------
// Détection d'accessoires / pièces / appareils défectueux dans le titre
// ---------------------------------------------------------------------------

type TitleIssue = "accessory" | "spare_part" | "defective" | "locked" | "empty_box";

interface TitleRule {
  issue: TitleIssue;
  label: string;
  re: RegExp;
  /** true : signal fort partout dans le titre ; false : seulement avant la mention du produit */
  anywhere: boolean;
}

const w = (pattern: string) => new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`);

const TITLE_RULES: TitleRule[] = [
  { issue: "empty_box", label: "boîte vide", re: w("boite vide|empty box|box only|boite seule"), anywhere: true },
  { issue: "defective", label: "pour pièces", re: w("pour pieces|for parts|parts only|pieces detachees uniquement"), anywhere: true },
  { issue: "defective", label: "HS", re: w("hs|hors service|en panne|ne fonctionne pas|not working|defectueux|faulty|broken|casse"), anywhere: true },
  { issue: "locked", label: "verrouillage iCloud", re: w("icloud lock|icloud locked|icloud bloque|bloque icloud|verrouille icloud|activation lock|blacklist|blackliste|blacklisted"), anywhere: true },
  { issue: "locked", label: "bloqué", re: w("bloque|locked|verrouille"), anywhere: true },
  { issue: "accessory", label: "coque", re: w("coque|coques|etui|housse|case|cover|bumper|protection ecran|protege ecran|screen protector|verre trempe|tempered glass"), anywhere: true },
  { issue: "accessory", label: "compatible", re: w("compatible avec|compatible with|compatible"), anywhere: false },
  { issue: "spare_part", label: "écran", re: w("ecran|screen|display|lcd|oled de remplacement"), anywhere: false },
  { issue: "spare_part", label: "vitre", re: w("vitre|vitre arriere|back glass|glass"), anywhere: false },
  { issue: "spare_part", label: "batterie", re: w("batterie|battery"), anywhere: false },
  { issue: "spare_part", label: "nappe / connecteur", re: w("nappe|flex|connecteur|connector|camera arriere|back camera|chassis|housing"), anywhere: false },
  { issue: "accessory", label: "câble / chargeur", re: w("cable|cables|chargeur|charger|adaptateur|adapter|support voiture|car mount"), anywhere: false },
];

const PRODUCT_HEAD_TOKENS = ["iphone", "ipad", "galaxy", "pixel", "redmi", "poco", "macbook", "airpods", "playstation", "xbox", "switch", "surface", "oneplus", "xiaomi", "huawei", "honor", "oppo", "dyson"];

/** Position de la première mention du produit dans le titre normalisé (−1 si absente). */
function productMentionIndex(title: string, model: string | null): number {
  const candidates = new Set<string>(PRODUCT_HEAD_TOKENS);
  const head = model?.split(" ")[0];
  if (head && head.length >= 2) candidates.add(head);
  let best = -1;
  for (const tok of candidates) {
    const m = title.match(w(tok));
    if (m && m.index !== undefined && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

export interface TitleIssueMatch {
  issue: TitleIssue;
  label: string;
}

/**
 * Accessoire, pièce détachée, appareil défectueux / verrouillé ou boîte vide détecté dans un titre.
 * Les mots ambigus (« écran », « batterie »…) ne comptent que s'ils précèdent la mention du produit
 * (« Écran pour iPhone 13 ») ou si le titre ne mentionne pas le produit : « iPhone 13 batterie 89 % »
 * reste un téléphone.
 */
export function detectTitleIssue(rawTitle: string, model: string | null = null): TitleIssueMatch | null {
  const title = ` ${normalizeText(rawTitle)} `;
  const mention = productMentionIndex(title, model);
  for (const rule of TITLE_RULES) {
    const m = title.match(rule.re);
    if (!m || m.index === undefined) continue;
    if (rule.anywhere) return { issue: rule.issue, label: rule.label };
    if (mention === -1 || m.index < mention) return { issue: rule.issue, label: rule.label };
  }
  return null;
}

const TITLE_ISSUE_MESSAGE: Record<TitleIssue, (label: string) => string> = {
  accessory: (l) => `Accessoire détecté dans le titre (« ${l} ») : ce n'est pas le produit recherché`,
  spare_part: (l) => `Pièce détachée détectée dans le titre (« ${l} ») : ce n'est pas le produit recherché`,
  defective: (l) => `Appareil défectueux / vendu pour pièces (« ${l} »)`,
  locked: (l) => `Appareil verrouillé (« ${l} ») : inutilisable en l'état`,
  empty_box: () => "Boîte vide : aucun appareil inclus",
};

// ---------------------------------------------------------------------------
// Filtre
// ---------------------------------------------------------------------------

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? null : x;
}

function sameText(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

function displayModel(m: string): string {
  return m.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/^Iphone/, "iPhone").replace(/^Ipad/, "iPad");
}

function pct(n: number): string {
  return `${Math.round(n * 100)} %`;
}

/** Contrôles indépendants du reste du résultat (tout sauf la détection de prix aberrant). */
function checkOffer(criteria: FilterCriteria, o: CandidateOffer, now: Date, staleDays: number): { reasons: FilterReason[]; warnings: FilterReason[] } {
  const reasons: FilterReason[] = [];
  const warnings: FilterReason[] = [];

  // --- statut / fraîcheur
  const expiresAt = toDate(o.expiresAt);
  if (o.status === "expired" || (expiresAt && expiresAt.getTime() < now.getTime())) reasons.push({ code: "expired", message: "Offre expirée" });
  if (o.status === "rejected") reasons.push({ code: "status_rejected", message: "Offre rejetée par la validation des données" });
  const seen = toDate(o.lastSeenAt);
  if (!seen) warnings.push({ code: "last_seen_unknown", message: "Date de dernière vérification inconnue" });
  else {
    const days = (now.getTime() - seen.getTime()) / 86_400_000;
    if (days > staleDays) reasons.push({ code: "stale", message: `Donnée trop ancienne : vue il y a ${Math.floor(days)} jours (maximum ${staleDays} jours)` });
  }

  // --- anomalies de validation
  for (const a of o.anomalies) {
    const detail = a.message ?? a.code;
    if (a.severity === "blocking" || SUSPICIOUS_ANOMALY_CODES.has(a.code)) reasons.push({ code: "suspicious", message: `Anomalie suspecte : ${detail}` });
    else warnings.push({ code: "anomaly_warning", message: `À vérifier : ${detail}` });
  }
  if (o.status === "suspicious" && o.anomalies.length === 0) reasons.push({ code: "suspicious", message: "Offre marquée suspecte par la validation des données" });

  // --- titre : accessoire / pièce / défectueux / verrouillé
  const kind = criteria.itemKind ?? "device";
  const issue = detectTitleIssue(o.title, criteria.model ?? o.model);
  if (issue) {
    // Pièce / accessoire CHERCHÉ : pas un motif de rejet (une autre pièce que celle demandée l'est).
    const wanted = (issue.issue === "spare_part" || issue.issue === "accessory") && issue.issue === kind && (!criteria.itemLabel || issue.label === criteria.itemLabel);
    const otherPiece = (issue.issue === "spare_part" || issue.issue === "accessory") && (kind === "spare_part" || kind === "accessory") && !wanted;
    if (!wanted) reasons.push({ code: issue.issue, message: otherPiece ? `${issue.issue === "spare_part" ? "Pièce" : "Accessoire"} différent(e) de celle recherchée (« ${issue.label} »)` : TITLE_ISSUE_MESSAGE[issue.issue](issue.label) });
  } else if (kind === "spare_part" || kind === "accessory") {
    reasons.push({ code: kind, message: `Ce n'est pas ${kind === "spare_part" ? "la pièce" : "l'accessoire"} recherché(e) (« ${criteria.itemLabel ?? ""} »)` });
  }

  // --- identité produit (pour une pièce ou un accessoire, la marque est souvent celle du fabricant de la pièce)
  if (criteria.brand && o.brand && !sameText(criteria.brand, o.brand)) {
    if (kind === "device" || kind === "lot") reasons.push({ code: "brand_mismatch", message: `Marque différente : ${o.brand} au lieu de ${criteria.brand}` });
    else warnings.push({ code: "brand_mismatch", message: `Marque de la pièce : ${o.brand} (compatibilité ${criteria.brand} à vérifier)` });
  }
  if (criteria.model) {
    if (!o.model || o.modelInferred) warnings.push({ code: "model_unknown", message: "Modèle non identifié dans l'offre : correspondance à vérifier" });
    else if (!sameText(criteria.model, o.model)) reasons.push({ code: "model_mismatch", message: `Modèle différent : ${displayModel(o.model)} au lieu de ${displayModel(criteria.model)}` });
  }
  if (criteria.storage) {
    if (!o.storage) warnings.push({ code: "storage_unknown", message: "Stockage non communiqué" });
    else if (criteria.storage.toUpperCase() !== o.storage.toUpperCase()) reasons.push({ code: "storage_mismatch", message: `Stockage différent : ${o.storage} au lieu de ${criteria.storage}` });
  }
  if (criteria.color && o.color && !sameText(criteria.color, o.color)) warnings.push({ code: "color_mismatch", message: `Couleur différente : ${o.color} au lieu de ${criteria.color}` });

  // --- état
  if (criteria.condition !== "unknown") {
    if (o.condition === "unknown") warnings.push({ code: "condition_unknown", message: "État non communiqué" });
    else if (o.condition !== criteria.condition) reasons.push({ code: "condition_mismatch", message: `État différent : ${CONDITION_LABEL_FR[o.condition]} au lieu de ${CONDITION_LABEL_FR[criteria.condition]}` });
  }

  // --- grade
  if (criteria.grade) {
    const wanted = gradeRank(criteria.grade);
    const got = gradeRank(o.grade);
    if (o.condition === "new" && !o.grade) warnings.push({ code: "grade_not_applicable", message: "Produit neuf : grade non applicable" });
    else if (got === null || wanted === null) warnings.push({ code: "grade_unknown", message: o.grade ? `Grade non reconnu (« ${o.grade} »)` : "Grade non communiqué" });
    else if (got > wanted) reasons.push({ code: "grade_lower", message: `Grade inférieur : ${o.grade} au lieu de ${criteria.grade} minimum` });
  }

  if (o.price === null || !Number.isFinite(o.price) || o.price <= 0) warnings.push({ code: "price_unknown", message: "Prix non communiqué : offre non comparable" });

  return { reasons, warnings };
}

/**
 * Sépare les offres conservées des offres rejetées. Les prix aberrants sont évalués par rapport
 * à la médiane des offres ayant passé tous les autres contrôles (au moins 3 prix connus).
 */
export function filterOffers<T extends CandidateOffer>(criteria: FilterCriteria, offers: T[], options: OfferFilterOptions = {}): OfferFilterResult<T> {
  const now = options.now ?? new Date();
  const staleDays = options.staleDays ?? STALE_OFFER_DAYS;
  const lowRatio = options.lowPriceRatio ?? LOW_PRICE_RATIO;
  const highRatio = options.highPriceRatio ?? HIGH_PRICE_RATIO;

  const checked = offers.map((offer) => ({ offer, ...checkOffer(criteria, offer, now, staleDays) }));
  const referencePrices = checked.filter((c) => c.reasons.length === 0 && c.offer.price !== null && Number.isFinite(c.offer.price) && c.offer.price > 0).map((c) => c.offer.price as number);
  const referenceMedian = referencePrices.length >= MIN_PRICES_FOR_OUTLIER ? median(referencePrices) : null;

  if (referenceMedian !== null && referenceMedian > 0) {
    for (const c of checked) {
      const p = c.offer.price;
      if (p === null || !Number.isFinite(p) || p <= 0) continue;
      const ratio = p / referenceMedian;
      if (ratio < lowRatio) {
        if (c.offer.supplierVerified) c.warnings.push({ code: "price_low_verified", message: `Prix anormalement bas, à vérifier : ${pct(ratio)} de la médiane du résultat` });
        else c.reasons.push({ code: "price_low_unverified", message: `Prix anormalement bas (${pct(ratio)} de la médiane du résultat) chez un fournisseur non vérifié` });
      } else if (ratio > highRatio) {
        c.reasons.push({ code: "price_high", message: `Prix anormalement élevé : ${pct(ratio)} de la médiane du résultat` });
      }
    }
  }

  const kept: Array<KeptOffer<T>> = [];
  const rejected: Array<RejectedOffer<T>> = [];
  const rejectionCounts: Partial<Record<FilterReasonCode, number>> = {};
  for (const c of checked) {
    if (c.reasons.length === 0) kept.push({ offer: c.offer, warnings: c.warnings });
    else {
      rejected.push({ offer: c.offer, reasons: c.reasons, warnings: c.warnings });
      for (const code of new Set(c.reasons.map((r) => r.code))) rejectionCounts[code] = (rejectionCounts[code] ?? 0) + 1;
    }
  }
  return { kept, rejected, referenceMedian, rejectionCounts };
}

export const FILTER_REASON_LABEL: Record<FilterReasonCode, string> = {
  brand_mismatch: "Marque différente",
  model_mismatch: "Modèle différent",
  model_unknown: "Modèle non identifié",
  storage_mismatch: "Stockage différent",
  storage_unknown: "Stockage non communiqué",
  grade_lower: "Grade inférieur",
  grade_unknown: "Grade non communiqué",
  grade_not_applicable: "Neuf (pas de grade)",
  condition_mismatch: "État différent",
  condition_unknown: "État non communiqué",
  color_mismatch: "Couleur différente",
  accessory: "Accessoire",
  spare_part: "Pièce détachée",
  defective: "Défectueux / pour pièces",
  locked: "Appareil verrouillé",
  empty_box: "Boîte vide",
  expired: "Offre expirée",
  status_rejected: "Offre rejetée",
  suspicious: "Anomalie suspecte",
  anomaly_warning: "Anomalie à vérifier",
  stale: "Donnée trop ancienne",
  last_seen_unknown: "Date de vérification inconnue",
  price_unknown: "Prix non communiqué",
  price_low_verified: "Prix anormalement bas, à vérifier",
  price_low_unverified: "Prix anormalement bas (fournisseur non vérifié)",
  price_high: "Prix anormalement élevé",
  confirmed_link: "Associée manuellement au SKU",
};
