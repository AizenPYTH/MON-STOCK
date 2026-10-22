/**
 * ANALYSE « BONNE AFFAIRE » d'une offre fournisseur (module pur, partagé serveur / application).
 *
 * Question posée : cette offre vaut-elle la peine d'être achetée pour être revendue ?
 *
 * 1. Équivalence STRICTE : une offre n'est comparée qu'à des produits réellement équivalents
 *    (même marque, même modèle, même type de produit — téléphone, écran, batterie… —, même
 *    qualité de pièce — OLED / Incell / origine…, même capacité, même état, même grade).
 *    Les lots et les produits mal identifiés ne sont jamais comparés à l'unité.
 * 2. Prix de marché : médiane des annonces de la place de marché (eBay) pour ce produit ; à
 *    défaut, médiane des AUTRES fournisseurs (prix de gros, signalé comme tel).
 * 3. Prix de revente : vos ventes réelles (moyenne 30 j) si l'offre est rapprochée d'un de vos
 *    produits, sinon le prix de vente de ce produit, sinon le bas du marché (1er quartile des
 *    annonces eBay : prix auquel on vend vite). Jamais inventé.
 * 4. Coût total d'achat et marge nette : `computeUnitEconomics` (TVA, transport fournisseur,
 *    douane hors UE, commission, paiement, expédition, emballage, provision retours). Un coût
 *    inconnu n'est JAMAIS supposé nul : il est listé et la marge est marquée « provisoire ».
 * 5. Niveau : très intéressant / intéressant / moyen / non compétitif, ou « données
 *    insuffisantes » quand la comparaison n'est pas fiable. Une offre n'est une bonne affaire que
 *    si la comparaison porte sur un produit équivalent ET que la marge reste positive.
 */
import { normalizeProduct, normalizeText } from "@/domain/sourcing/normalizer";
import { escapeRe, KIND_WORDS, kindOfText, prepareKindText, wordsRegex, type ProductKind } from "@/domain/sourcing/product-kind";
import { computeUnitEconomics, freshnessOf, type RadarCostSettings, type SupplierOrigin } from "@/domain/sourcing/radar";

// ---------------------------------------------------------------------------------------------
// 1. Identification du produit (signature d'équivalence)

export type { ProductKind } from "@/domain/sourcing/product-kind";
export { detectKind } from "@/domain/sourcing/product-kind";

/** Qualités de pièce qui changent le prix : jamais mélangées entre elles. */
const QUALITY_WORDS: Array<{ key: string; words: string[] }> = [
  { key: "soft_oled", words: ["soft oled"] },
  { key: "hard_oled", words: ["hard oled"] },
  { key: "oled", words: ["oled", "amoled"] },
  { key: "incell", words: ["incell", "in-cell", "in cell"] },
  { key: "tft", words: ["tft"] },
  { key: "original", words: ["original", "origine", "originale", "oryginalny", "originalni", "genuine", "oem", "service pack", "pulled", "recupere", "refurbished original"] },
  { key: "compatible", words: ["compatible", "aftermarket", "zamiennik", "copy", "replacement", "remplacement", "repart", "prime", "reglages d origine"] },
  { key: "high_capacity", words: ["capacidad aumentada", "haute capacite", "high capacity", "grande capacite", "zvysena kapacita", "capacita maggiorata"] },
];

export interface ProductSignature {
  brand: string | null;
  model: string | null;
  storage: string | null;
  condition: "new" | "refurbished" | "used" | "unknown";
  grade: string | null;
  kind: ProductKind;
  /** qualités de pièce détectées (triées) */
  quality: string[];
  /** hors service, pour pièces, bloqué iCloud, « as is » : jamais comparé à un produit fonctionnel */
  damaged: boolean;
  /** annonce couvrant plusieurs modèles (sélecteur de variante) : prix affiché = variante la moins chère */
  multiModel: boolean;
  /** mots descriptifs restants (fonction de la pièce : « flash », « arrière », « nfc »…) */
  descriptors: string[];
  /** l'identification est-elle assez sûre pour comparer ? */
  identified: boolean;
}

const QUALITY_RES = QUALITY_WORDS.map(({ key, words }) => ({ key, re: wordsRegex(words) }));

function qualityOfNormalized(t: string): string[] {
  const found = new Set<string>();
  for (const { key, re } of QUALITY_RES) if (re.test(t)) found.add(key);
  // « soft/hard oled » impliquent « oled » : on ne garde que le plus précis
  if (found.has("soft_oled") || found.has("hard_oled")) found.delete("oled");
  return [...found].sort();
}

export function detectQuality(title: string): string[] {
  return qualityOfNormalized(` ${normalizeText(title)} `);
}

/**
 * Pièces au nom générique (une « nappe » peut être celle du flash ou de l'écouteur, une caméra
 * avant ou arrière) : il faut en plus que les mots descriptifs se recouvrent largement.
 */
const LOOSE_KINDS = new Set<ProductKind>(["flex", "camera", "speaker", "button", "adhesive", "case", "charger_cable", "tool", "sim_tray", "board", "keyboard", "charging_port", "frame", "other_part"]);
export const DESCRIPTOR_OVERLAP_MIN = 0.5;

const FILLER = new Set([
  "para", "pour", "for", "per", "pro", "max", "mini", "plus", "de", "du", "des", "la", "le", "les", "el", "los", "las", "di", "del", "con", "avec", "with", "and", "et", "y", "e", "en", "in", "na", "do", "pre", "z", "w", "the", "a", "an", "un", "une", "+",
  "noir", "black", "negro", "nero", "cerny", "blanc", "white", "blanco", "bianco", "bily", "bleu", "blue", "azul", "rouge", "red", "rojo", "vert", "green", "verde", "rose", "pink", "gold", "or", "dore", "silver", "argent", "plata", "gris", "grey", "gray", "purple", "violet", "midnight", "starlight", "graphite", "sierra",
  "apple", "samsung", "xiaomi", "huawei", "google", "oneplus", "oppo", "iphone", "ipad", "galaxy", "pixel", "redmi",
  "neuf", "new", "nuevo", "nuovo", "novy", "oem", "original", "originale", "compatible", "qualite", "quality", "premium", "piece", "pieza", "part", "replacement", "remplacement", "repuesto", "nahradni", "ricambio",
]);

function descriptorsOf(title: string, sig: { model: string | null; kind: ProductKind }): string[] {
  const words = normalizeText(title).split(/[\s/]+/);
  const modelWords = new Set((sig.model ?? "").split(/\s+/));
  const kindWords = new Set((KIND_WORDS.find((k) => k.kind === sig.kind)?.words ?? []).flatMap((w) => normalizeText(w).split(" ")));
  const out = new Set<string>();
  for (const w of words) {
    if (w.length < 2 || /^\d+([.,]\d+)?$/.test(w) || /^\d+(gb|go|tb|mah)$/.test(w)) continue;
    if (FILLER.has(w) || modelWords.has(w) || kindWords.has(w)) continue;
    out.add(w);
  }
  return [...out].sort();
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sb = new Set(b);
  const inter = a.filter((w) => sb.has(w)).length;
  return inter / (a.length + b.length - inter);
}

/** Produit hors service, pour pièces, bloqué ou vendu « en l'état » (FR, EN, ES, IT, CS, PL, DE). */
const wholeWordsRegex = (words: string[]) => new RegExp(`(^|[^a-z0-9])(${words.map((w) => escapeRe(normalizeText(w))).join("|")})(?![a-z0-9])`);
const DAMAGED_RE = wholeWordsRegex([
  "hors service", "hs", "pour pieces", "pour piece", "pour pc", "a reparer", "en panne", "ne fonctionne pas", "ne s allume pas", "defectueux", "defectueuse", "defaut", "casse", "cassee", "casses", "fissure", "fissuree", "fele", "felee",
  "for parts", "for spares", "spares", "not working", "faulty", "broken", "cracked", "damaged", "as is", "asis", "untested", "non teste", "icloud", "bloque", "bloquee", "locked", "sim lock", "blacklist", "blacklisted",
  "para piezas", "averiado", "averia", "roto", "rota", "no funciona", "per ricambi", "difettoso", "rotto", "guasto", "nefunkcni", "na dily", "poskozeny", "uszkodzony", "na czesci", "defekt", "kaputt",
]);

/** Générations d'iPhone citées dans le titre (« iPhone X XS XR 11 12 13… » = annonce multi-modèles). */
export function iphoneGenerations(normalizedTitle: string): string[] {
  if (!/(^|[^a-z0-9])iphone/.test(normalizedTitle)) return [];
  const after = normalizedTitle.slice(normalizedTitle.search(/(^|[^a-z0-9])iphone/));
  const found = new Set<string>();
  for (const m of after.matchAll(/(?:^|[^a-z0-9])(x|xs|xr|se|[4-9]|1[0-9])(?=$|[^a-z0-9])/g)) found.add(m[1]!);
  return [...found];
}

export interface OfferIdentity {
  title: string;
  brand?: string | null;
  model?: string | null;
  storage?: string | null;
  condition?: string | null;
  grade?: string | null;
}

export function productSignature(o: OfferIdentity): ProductSignature {
  // Marque et modèle déjà normalisés à l'enregistrement : on évite de renormaliser le titre.
  const stored = Boolean(o.brand && o.model);
  const n = stored ? null : normalizeProduct(o.title, { brand: o.brand ?? null, model: o.model ?? null, storage: o.storage ?? null, grade: o.grade ?? null, condition: o.condition ?? null });
  const brand = o.brand ?? n?.brand ?? null;
  const model = o.model ?? n?.model ?? null;
  const condRaw = o.condition && o.condition !== "unknown" ? o.condition : (n?.condition ?? o.condition ?? "unknown");
  const condition = condRaw === "new" || condRaw === "refurbished" || condRaw === "used" ? condRaw : "unknown";
  // état de batterie (« 90 % battery ») et mémoire vive (« 8GB RAM ») retirés : caractéristiques d'appareil
  const t = prepareKindText(o.title);
  const storage = (o.storage ?? n?.storage)?.toLowerCase() ?? null;
  // une capacité (128 Go…) ne qualifie qu'un appareil ou une carte mère ; « vitre arrière fissurée » = appareil abîmé
  const kind = kindOfText(t, storage);
  // grades mixtes (« A/B », « A+/A ») : un assortiment, jamais équivalent au grade simple
  const mixed = /(^|[^a-z0-9])([a-d][+]?)\s?\/\s?([a-d][+]?)(\s?\/\s?[a-d][+]?)*(?![a-z0-9])/i.exec(o.title.replace(/\d+\s?(gb|go|tb)\s?\//gi, " "));
  const grade = mixed ? `mix:${mixed[0].trim().toLowerCase().replace(/\s/g, "")}` : ((o.grade ?? n?.grade)?.toLowerCase() ?? null);
  const modelKey = model ? model.toLowerCase() : null;
  return {
    brand: brand ? brand.toLowerCase() : null,
    model: modelKey,
    storage,
    condition,
    grade,
    kind,
    quality: kind === "device" ? [] : qualityOfNormalized(t),
    damaged: DAMAGED_RE.test(t),
    multiModel: iphoneGenerations(t).length >= 2,
    descriptors: LOOSE_KINDS.has(kind) ? descriptorsOf(o.title, { model: modelKey, kind }) : [],
    identified: Boolean(brand && model) && kind !== "lot" && iphoneGenerations(t).length < 2,
  };
}

/**
 * Deux offres portent-elles sur un produit RÉELLEMENT équivalent ? Règles strictes : dans le
 * doute, non (une fausse « bonne affaire » coûte plus cher qu'une affaire manquée).
 */
export function isEquivalent(a: ProductSignature, b: ProductSignature): boolean {
  if (!a.identified || !b.identified) return false;
  if (a.brand !== b.brand || a.model !== b.model || a.kind !== b.kind) return false;
  if (a.damaged || b.damaged) return false;
  if (a.kind === "lot") return false;
  if (a.quality.join(",") !== b.quality.join(",")) return false;
  if (a.kind === "device") {
    // un appareil : capacité, état et grade doivent être connus et identiques
    if (!a.storage || a.storage !== b.storage) return false;
    if (a.condition === "unknown" || a.condition !== b.condition) return false;
    if ((a.condition !== "new" || b.condition !== "new") && (a.grade ?? "") !== (b.grade ?? "")) return false;
    return true;
  }
  // une pièce : neuve (ou état non précisé, l'usage des grossistes de pièces) contre neuve ;
  // une pièce d'occasion / reconditionnée seulement contre le même état ET le même grade
  const fresh = (c: ProductSignature["condition"]) => c === "new" || c === "unknown";
  if (fresh(a.condition) !== fresh(b.condition)) return false;
  if (!fresh(a.condition) && (a.condition !== b.condition || (a.grade ?? "") !== (b.grade ?? ""))) return false;
  if ((a.storage ?? "") !== (b.storage ?? "")) return false;
  if (LOOSE_KINDS.has(a.kind) && overlap(a.descriptors, b.descriptors) < DESCRIPTOR_OVERLAP_MIN) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// 2. Analyse

export type DealLevel = "very_good" | "good" | "average" | "not_competitive" | "insufficient_data";

export const DEAL_LEVEL_LABEL: Record<DealLevel, string> = {
  very_good: "Très intéressant",
  good: "Intéressant",
  average: "Moyen",
  not_competitive: "Non compétitif",
  insufficient_data: "Données insuffisantes",
};

export interface DealOfferInput {
  offerId: string;
  supplierId: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  storage?: string | null;
  condition?: string | null;
  grade?: string | null;
  /** prix converti dans la devise de l'organisation */
  price: number | null;
  originalCurrency: string | null;
  orgCurrency: string;
  taxType: "ht" | "ttc" | "unknown";
  /** frais de port fournisseur dans la devise de l'organisation (null = inconnu) */
  shippingCost: number | null;
  moq: number | null;
  supplierCountry: string | null;
  stockStatus: "in_stock" | "low" | "out_of_stock" | "unknown";
  availableQuantity: number | null;
  lastSeenAt: string | null;
  /** l'offre provient-elle d'une place de marché (eBay) plutôt que d'un fournisseur */
  marketplace: boolean;
  /** prix observé publiquement (pas une API ni un flux du fournisseur) */
  publicPrice: boolean;
  /** signature déjà calculée (évite de renormaliser le titre) */
  signature?: ProductSignature;
}

export interface DealComparable {
  offerId: string;
  supplierId: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  storage?: string | null;
  condition?: string | null;
  grade?: string | null;
  price: number | null;
  marketplace: boolean;
  stockStatus?: string | null;
  signature?: ProductSignature;
}

export interface DealOwnProduct {
  avgSalePrice30d: number | null;
  salePrice: number | null;
}

export interface DealAnalysis {
  level: DealLevel;
  /** comparaison sur un produit équivalent possible */
  comparable: boolean;
  supplierPrice: number | null;
  marketPrice: number | null;
  marketBasis: "marketplace" | "suppliers" | null;
  /** nombre d'offres équivalentes ayant servi au prix de marché */
  marketCount: number;
  /** % sous (positif) ou au-dessus (négatif) du prix de marché, sur le coût total */
  discountPercent: number | null;
  totalCost: number | null;
  resalePrice: number | null;
  resaleBasis: "own_sales" | "own_price" | "marketplace_low" | null;
  margin: number | null;
  marginPercent: number | null;
  /** la marge ne déduit que les coûts connus : certains coûts manquent */
  provisional: boolean;
  missingCosts: string[];
  /** données incertaines à vérifier avant d'acheter */
  uncertainties: string[];
  /** score de rentabilité 0–100 (null si non comparable) */
  score: number | null;
  /** explication courte */
  summary: string;
}

const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function quantile(values: number[], q: number): number | null {
  const s = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return r2(s[lo]! + (s[hi]! - s[lo]!) * (pos - lo));
}

export const MIN_MARKETPLACE_COMPARABLES = 3;
export const MIN_SUPPLIER_COMPARABLES = 2;

/** Écarte les prix aberrants (moins de 30 % ou plus de 3× la médiane) avant de calculer le marché. */
function trimOutliers(values: number[]): number[] {
  const med = quantile(values, 0.5);
  if (med === null) return [];
  return values.filter((v) => v >= med * 0.3 && v <= med * 3);
}

export function analyzeDeal(offer: DealOfferInput, comparables: DealComparable[], settings: RadarCostSettings, own: DealOwnProduct | null = null, now: Date = new Date()): DealAnalysis {
  const sig = offer.signature ?? productSignature(offer);
  const uncertainties: string[] = [];
  const base: DealAnalysis = { level: "insufficient_data", comparable: false, supplierPrice: offer.price, marketPrice: null, marketBasis: null, marketCount: 0, discountPercent: null, totalCost: null, resalePrice: null, resaleBasis: null, margin: null, marginPercent: null, provisional: false, missingCosts: [], uncertainties, score: null, summary: "" };

  // --- données incertaines (toujours signalées)
  if (offer.taxType === "unknown") uncertainties.push("Prix HT ou TTC non précisé par le fournisseur.");
  if (offer.stockStatus === "unknown" && offer.availableQuantity === null) uncertainties.push("Stock non communiqué.");
  if (offer.stockStatus === "out_of_stock" || offer.availableQuantity === 0) uncertainties.push("En rupture chez le fournisseur.");
  if (sig.condition === "used" || sig.condition === "refurbished") uncertainties.push(sig.grade ? `Produit d'occasion / reconditionné (grade ${sig.grade.toUpperCase()}) : état à vérifier.` : "Produit d'occasion / reconditionné sans grade précisé.");
  if (sig.kind === "lot") uncertainties.push("Prix de lot : non comparable à un prix unitaire.");
  if (sig.multiModel) uncertainties.push("Annonce multi-modèles : le prix affiché est celui de la variante la moins chère.");
  if (sig.damaged) uncertainties.push("Produit hors service, pour pièces, bloqué ou vendu en l'état : jamais comparé à un produit fonctionnel.");
  if (offer.originalCurrency && offer.originalCurrency.toUpperCase() !== offer.orgCurrency.toUpperCase()) uncertainties.push(`Prix converti depuis ${offer.originalCurrency.toUpperCase()} (taux BCE) : frais de change possibles.`);
  const { freshness, ageDays } = freshnessOf(offer.lastSeenAt, now);
  if (freshness === "stale") uncertainties.push(`Prix relevé il y a ${ageDays} jours : à revérifier.`);
  if (offer.marketplace) uncertainties.push("Annonce de place de marché (vendeur particulier ou professionnel) : garantie et facture à vérifier.");

  if (offer.price === null || offer.price <= 0) return { ...base, summary: "Prix fournisseur absent." };
  if (!sig.identified) {
    return { ...base, summary: sig.kind === "lot" ? "Lot : pas de comparaison à l'unité possible." : sig.multiModel ? "Annonce multi-modèles : pas de comparaison fiable." : "Produit pas assez identifié (marque ou modèle) pour une comparaison fiable." };
  }

  // --- prix de marché : annonces équivalentes de la place de marché, sinon autres fournisseurs
  const equivalents = comparables.filter((c) => c.offerId !== offer.offerId && c.price !== null && c.price > 0 && isEquivalent(sig, c.signature ?? productSignature(c)));
  const marketPrices = trimOutliers(equivalents.filter((c) => c.marketplace).map((c) => c.price as number));
  const supplierPrices = trimOutliers(equivalents.filter((c) => !c.marketplace && c.supplierId !== offer.supplierId).map((c) => c.price as number));
  let marketPrice: number | null = null;
  let marketBasis: DealAnalysis["marketBasis"] = null;
  let marketCount = 0;
  if (marketPrices.length >= MIN_MARKETPLACE_COMPARABLES) {
    marketPrice = quantile(marketPrices, 0.5);
    marketBasis = "marketplace";
    marketCount = marketPrices.length;
  } else if (supplierPrices.length >= MIN_SUPPLIER_COMPARABLES) {
    marketPrice = quantile(supplierPrices, 0.5);
    marketBasis = "suppliers";
    marketCount = supplierPrices.length;
    uncertainties.push(`Prix de marché estimé sur ${supplierPrices.length} autres fournisseurs (prix de gros), sans annonce de revente comparable.`);
  }

  // --- prix de revente : vos ventes, votre prix, sinon le bas du marché de revente
  let resalePrice: number | null = null;
  let resaleBasis: DealAnalysis["resaleBasis"] = null;
  if (own?.avgSalePrice30d) {
    resalePrice = own.avgSalePrice30d;
    resaleBasis = "own_sales";
  } else if (own?.salePrice) {
    resalePrice = own.salePrice;
    resaleBasis = "own_price";
  } else if (marketPrices.length >= MIN_MARKETPLACE_COMPARABLES) {
    resalePrice = quantile(marketPrices, 0.25);
    resaleBasis = "marketplace_low";
  }

  const country = offer.supplierCountry?.toUpperCase() ?? null;
  const origin: SupplierOrigin = country ? (EU.has(country) ? "eu" : "non_eu") : "unknown";
  const eco = computeUnitEconomics(
    { salePrice: resalePrice, saleLabel: "Prix de revente estimé", purchasePrice: offer.price, purchaseTaxType: offer.taxType, supplierShipping: offer.shippingCost, moq: offer.moq, supplierOrigin: origin, originLabel: country },
    settings,
  );
  const totalCost = eco.landedCost ?? (eco.missing.includes("prix de vente") ? landedOnly(offer, settings, origin, country) : null);
  const missingCosts = eco.missing.filter((m) => m !== "prix de vente");
  for (const c of eco.cautions) uncertainties.push(c);
  // écart au marché : coût total rendu face aux prix de revente constatés ; face aux autres
  // fournisseurs, prix contre prix (mêmes conditions de gros)
  const compared = marketBasis === "suppliers" ? offer.price : totalCost;
  const discountPercent = marketPrice && compared !== null ? r2(((marketPrice - compared) / marketPrice) * 100) : null;

  if (marketPrice === null || resalePrice === null || eco.estimatedProfit === null) {
    const why = marketPrice === null ? `pas assez d'offres équivalentes (${equivalents.length} trouvée${equivalents.length > 1 ? "s" : ""})` : "pas de prix de revente fiable (aucune vente ni annonce de revente comparable)";
    return { ...base, comparable: marketPrice !== null, marketPrice, marketBasis, marketCount, discountPercent, totalCost, resalePrice, resaleBasis, missingCosts, summary: `Comparaison impossible : ${why}.` };
  }

  const margin = eco.estimatedProfit;
  const marginPercent = eco.marginPercent;
  const provisional = missingCosts.length > 0;
  const reliable = offer.stockStatus !== "out_of_stock" && offer.availableQuantity !== 0 && freshness !== "stale" && freshness !== "unknown";

  let level: DealLevel;
  if (margin <= 0 || (discountPercent !== null && discountPercent <= 0)) level = "not_competitive";
  else if ((marginPercent ?? 0) >= 20 && (discountPercent ?? 0) >= 20 && reliable && offer.taxType !== "unknown") level = "very_good";
  else if ((marginPercent ?? 0) >= 10 && (discountPercent ?? 0) >= 8) level = "good";
  else level = "average";
  // coûts manquants : la marge « après les coûts » n'est pas établie → au mieux « moyen »
  if (provisional && (level === "very_good" || level === "good")) level = "average";
  if (!reliable && level === "very_good") level = "good";

  // --- score de rentabilité : marge 35, écart au marché 25, fiabilité 20, disponibilité 20
  let score = 0;
  score += Math.min(35, Math.max(0, marginPercent ?? 0) * (35 / 40));
  score += Math.min(25, Math.max(0, discountPercent ?? 0) * (25 / 40));
  score += (freshness === "fresh" ? 8 : freshness === "recent" ? 5 : 0) + (offer.taxType !== "unknown" ? 4 : 0) + (offer.stockStatus !== "unknown" || offer.availableQuantity !== null ? 4 : 0) + (offer.publicPrice ? 2 : 4) - (provisional ? 4 : 0);
  score += offer.availableQuantity !== null && offer.availableQuantity > 0 ? 20 : offer.stockStatus === "in_stock" ? 18 : offer.stockStatus === "low" ? 12 : offer.stockStatus === "unknown" ? 6 : 0;
  if (marketBasis === "suppliers") score -= 5;
  score = Math.round(Math.max(0, Math.min(100, score)));

  const summary =
    level === "not_competitive"
      ? discountPercent !== null && discountPercent <= 0
        ? `${marketBasis === "suppliers" ? "Prix" : "Coût total"} ${Math.abs(discountPercent)} % au-dessus du marché.`
        : "Marge nulle ou négative après les coûts."
      : `${discountPercent !== null ? `${discountPercent} % sous le marché` : "Sous le marché"}, marge ${margin.toFixed(2)} (${marginPercent} %)${provisional ? " — provisoire, coûts à compléter" : ""}.`;

  return { level, comparable: true, supplierPrice: offer.price, marketPrice, marketBasis, marketCount, discountPercent, totalCost, resalePrice, resaleBasis, margin, marginPercent, provisional, missingCosts, uncertainties, score, summary };
}

/** Coût rendu seul (sans prix de revente) : même règles que computeUnitEconomics, sans la partie vente. */
function landedOnly(offer: DealOfferInput, settings: RadarCostSettings, origin: SupplierOrigin, country: string | null): number | null {
  const eco = computeUnitEconomics({ salePrice: 1, saleLabel: "", purchasePrice: offer.price, purchaseTaxType: offer.taxType, supplierShipping: offer.shippingCost, moq: offer.moq, supplierOrigin: origin, originLabel: country }, settings);
  return eco.landedCost;
}

/** Clé de regroupement des comparables (marque, modèle, type) : seuls ceux-là peuvent être équivalents. */
export function comparableBucket(sig: ProductSignature): string | null {
  return sig.identified ? `${sig.brand}|${sig.model}|${sig.kind}` : null;
}

const LEVEL_ORDER: Record<DealLevel, number> = { very_good: 0, good: 1, average: 2, not_competitive: 3, insufficient_data: 4 };

/** Tri « meilleures affaires » : niveau, puis score, puis marge. Pur. */
export function compareDeals(a: { deal: DealAnalysis | null }, b: { deal: DealAnalysis | null }): number {
  const la = a.deal ? LEVEL_ORDER[a.deal.level] : 5;
  const lb = b.deal ? LEVEL_ORDER[b.deal.level] : 5;
  return la - lb || (b.deal?.score ?? -1) - (a.deal?.score ?? -1) || (b.deal?.margin ?? -Infinity) - (a.deal?.margin ?? -Infinity);
}
