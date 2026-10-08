/**
 * QueryExpansion — à partir d'une requête analysée (ParsedQuery), produit une liste
 * COURTE, dédupliquée et priorisée de reformulations :
 *
 *   - identifier   : EAN / MPN seul (recherche exacte prioritaire) ;
 *   - exact        : forme canonique anglaise (« Apple iPhone 13 128GB Grade A ») et
 *                    française (« iPhone 13 128 Go Grade A ») ;
 *   - condition    : variante d'état (« refurbished » / « reconditionné ») quand un grade
 *                    ou un état est demandé ;
 *   - b2b_intent   : intention d'achat professionnel (« wholesale », « grossiste », « B2B »…) ;
 *   - liquidation  : déstockage / lots / surplus selon la catégorie.
 *
 * `useFor` indique l'usage : « adapter_search » (requête envoyée aux adaptateurs de sources
 * enregistrées) ou « discovery » (requête envoyée à une API de recherche web pour découvrir
 * de nouveaux fournisseurs). Pur et déterministe : aucune donnée n'est inventée, un champ
 * inconnu n'apparaît simplement pas dans la reformulation.
 */
import { normalizeText, type ProductCondition } from "@/domain/sourcing/normalizer";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";

export type ExpansionPurpose = "exact" | "condition" | "b2b_intent" | "liquidation" | "identifier";
export type ExpansionUse = "adapter_search" | "discovery";
export type ExpansionLanguage = "en" | "fr" | "neutral";

export interface ExpandedQuery {
  text: string;
  purpose: ExpansionPurpose;
  useFor: ExpansionUse;
  language: ExpansionLanguage;
  /** 1 = la plus prioritaire */
  priority: number;
}

export type ProductCategory = "smartphone" | "tablet" | "computer" | "audio" | "console" | "wearable" | "appliance" | "other";

export interface QueryExpansionOptions {
  /** nombre maximal de reformulations (défaut 6) */
  max?: number;
  /** nombre maximal de requêtes de découverte (b2b_intent + liquidation), défaut 3 */
  maxDiscovery?: number;
  /** désactive les requêtes de découverte */
  includeDiscovery?: boolean;
}

export const DEFAULT_MAX_EXPANSIONS = 6;
export const DEFAULT_MAX_DISCOVERY = 3;
/** places minimales réservées aux requêtes de découverte quand il y en a */
export const MIN_DISCOVERY_SLOTS = 2;

const CATEGORY_PATTERNS: Array<{ category: ProductCategory; re: RegExp }> = [
  { category: "tablet", re: /^(ipad|galaxy tab|surface pro|surface go)\b/ },
  { category: "computer", re: /^(macbook|imac|mac mini|surface laptop|surface book)\b/ },
  { category: "audio", re: /^(airpods|galaxy buds)\b/ },
  { category: "wearable", re: /^(apple watch|galaxy watch)\b/ },
  { category: "console", re: /^(playstation|nintendo switch|xbox)\b/ },
  { category: "smartphone", re: /^(iphone|galaxy (s|a|m|note|z|xcover)|pixel|redmi|poco|nord|reno|find|p\d|mate|nova|magic|\d{1,2}( |$))/ },
];

const BRAND_CATEGORY: Record<string, ProductCategory> = {
  dyson: "appliance",
  philips: "appliance",
  bosch: "appliance",
  jbl: "audio",
  bose: "audio",
  garmin: "wearable",
  lenovo: "computer",
  dell: "computer",
  hp: "computer",
  asus: "computer",
  acer: "computer",
};

/** Catégorie déduite du modèle (puis de la marque) reconnu par le normalizer ; « other » sinon. */
export function detectCategory(parsed: ParsedQuery): ProductCategory {
  const model = parsed.criteria.model;
  if (model) {
    for (const p of CATEGORY_PATTERNS) if (p.re.test(model)) return p.category;
  }
  const brand = parsed.criteria.brand;
  if (brand && BRAND_CATEGORY[brand]) return BRAND_CATEGORY[brand]!;
  return "other";
}

const COLOR_FR: Record<string, string> = {
  gray: "Gris",
  black: "Noir",
  white: "Blanc",
  midnight: "Minuit",
  starlight: "Lumière stellaire",
  blue: "Bleu",
  red: "Rouge",
  green: "Vert",
  silver: "Argent",
  gold: "Or",
  purple: "Violet",
  pink: "Rose",
  yellow: "Jaune",
  orange: "Orange",
  titanium: "Titane",
  brown: "Marron",
  beige: "Beige",
};

const CONDITION_WORD: Record<Exclude<ProductCondition, "unknown">, { en: string; fr: string }> = {
  new: { en: "new", fr: "neuf" },
  refurbished: { en: "refurbished", fr: "reconditionné" },
  used: { en: "used", fr: "occasion" },
};

function storageEn(storage: string | null): string | null {
  return storage;
}

function storageFr(storage: string | null): string | null {
  if (!storage) return null;
  const m = storage.match(/^(\d+)(GB|TB)$/);
  if (!m) return storage;
  return `${m[1]} ${m[2] === "TB" ? "To" : "Go"}`;
}

function variantParts(variant: string | null, lang: "en" | "fr"): string[] {
  if (!variant) return [];
  const out: string[] = [];
  const ram = variant.match(/(\d+)(gb|tb) ram/);
  if (ram) out.push(lang === "fr" ? `${ram[1]} ${ram[2] === "tb" ? "To" : "Go"} RAM` : `${ram[1]}${ram[2]!.toUpperCase()} RAM`);
  if (/\bwifi\b/.test(variant)) out.push("Wi-Fi");
  if (/\bcellular\b/.test(variant)) out.push("Cellular");
  if (/\bdual sim\b/.test(variant)) out.push("Dual SIM");
  return out;
}

/** Affichage du modèle propre pour une requête (sans guillemets de taille d'écran). */
function modelLabel(parsed: ParsedQuery): string | null {
  const display = parsed.normalized.modelDisplay;
  if (!parsed.criteria.model || !display) return null;
  return display.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

function brandLabel(parsed: ParsedQuery, model: string | null): string | null {
  const brand = parsed.normalized.brandDisplay;
  if (!brand || !parsed.criteria.brand) return null;
  // évite « Apple Apple Watch »
  if (model && normalizeText(model).startsWith(normalizeText(brand))) return null;
  return brand;
}

function join(parts: Array<string | null | undefined | false>): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

interface DiscoveryTemplate {
  purpose: "b2b_intent" | "liquidation";
  language: ExpansionLanguage;
  build: (base: { en: string; fr: string }) => string;
}

/** Intentions B2B par catégorie (au plus 3, ordre = priorité). */
function discoveryTemplates(category: ProductCategory, secondHand: boolean): DiscoveryTemplate[] {
  if (category === "smartphone" || category === "tablet") {
    return secondHand
      ? [
          { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste reconditionné` },
          { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale refurbished B2B` },
          { purpose: "liquidation", language: "fr", build: (b) => `lot ${b.fr} déstockage` },
        ]
      : [
          { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste` },
          { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale B2B` },
          { purpose: "liquidation", language: "fr", build: (b) => `lot ${b.fr} déstockage` },
        ];
  }
  if (category === "computer") {
    return [
      { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste B2B` },
      { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale bulk` },
      { purpose: "liquidation", language: "en", build: (b) => `${b.en} surplus liquidation` },
    ];
  }
  if (category === "console" || category === "audio" || category === "wearable" || category === "appliance") {
    return [
      { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste` },
      { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale bulk` },
      { purpose: "liquidation", language: "fr", build: (b) => `${b.fr} déstockage lot` },
    ];
  }
  return [
    { purpose: "b2b_intent", language: "fr", build: (b) => `${b.fr} grossiste` },
    { purpose: "b2b_intent", language: "en", build: (b) => `${b.en} wholesale` },
  ];
}

/** Clé de déduplication : texte normalisé, mots triés (« lot iphone 13 » = « iphone 13 lot »). */
function dedupeKey(text: string): string {
  return normalizeText(text).split(" ").filter(Boolean).sort().join(" ");
}

/**
 * Reformulations de la requête. Retour vide pour une requête vide.
 * Ordre : requêtes « adapter_search » (identifiants, exactes, état) puis « discovery ».
 */
export function expandQuery(parsed: ParsedQuery, options: QueryExpansionOptions = {}): ExpandedQuery[] {
  if (parsed.kind === "empty") return [];
  const max = Math.max(1, Math.floor(options.max ?? DEFAULT_MAX_EXPANSIONS));
  const maxDiscovery = options.includeDiscovery === false ? 0 : Math.max(0, Math.floor(options.maxDiscovery ?? DEFAULT_MAX_DISCOVERY));

  type Draft = Omit<ExpandedQuery, "priority">;
  const adapter: Draft[] = [];
  const discovery: Draft[] = [];

  // --- identifiants
  if (parsed.ean) adapter.push({ text: parsed.ean, purpose: "identifier", useFor: "adapter_search", language: "neutral" });
  if (parsed.mpn) adapter.push({ text: parsed.mpn, purpose: "identifier", useFor: "adapter_search", language: "neutral" });

  const model = modelLabel(parsed);
  const brand = brandLabel(parsed, model);
  const { storage, grade, color } = parsed.criteria;
  const variantEn = variantParts(parsed.normalized.variant, "en");
  const variantFr = variantParts(parsed.normalized.variant, "fr");
  const gradeLabel = grade ? `Grade ${grade}` : null;
  // l'état demandé : explicite, ou déduit d'un grade (le normalizer documente la déduction)
  const condition: ProductCondition = parsed.criteria.condition !== "unknown" ? parsed.criteria.condition : parsed.normalized.condition;

  let discoveryBase: { en: string; fr: string } | null = null;

  if (model) {
    const colorEn = color ? parsed.normalized.colorDisplay : null;
    const colorFr = color ? COLOR_FR[color] ?? parsed.normalized.colorDisplay : null;
    const exactEn = join([brand, model, storageEn(storage), ...variantEn, colorEn, gradeLabel]);
    const exactFr = join([model, storageFr(storage), ...variantFr, colorFr, gradeLabel]);
    adapter.push({ text: exactEn, purpose: "exact", useFor: "adapter_search", language: "en" });
    adapter.push({ text: exactFr, purpose: "exact", useFor: "adapter_search", language: "fr" });

    if (condition !== "unknown") {
      const word = CONDITION_WORD[condition];
      adapter.push({ text: join([brand, model, storageEn(storage), word.en]), purpose: "condition", useFor: "adapter_search", language: "en" });
      adapter.push({ text: join([model, storageFr(storage), word.fr]), purpose: "condition", useFor: "adapter_search", language: "fr" });
    }
    // la découverte cible des fournisseurs : modèle sans stockage ni couleur (catalogues plus larges)
    discoveryBase = { en: join([brand, model]), fr: model };
  } else {
    const text = parsed.raw.replace(/\s+/g, " ").trim();
    const isIdentifierOnly = parsed.kind === "ean" || parsed.kind === "mpn";
    // texte libre non structuré : l'état éventuel est déjà dans le texte, pas de variante
    if (!isIdentifierOnly) adapter.push({ text, purpose: "exact", useFor: "adapter_search", language: "neutral" });
    discoveryBase = { en: text, fr: text };
  }

  if (discoveryBase && maxDiscovery > 0) {
    const secondHand = condition === "refurbished" || condition === "used" || grade !== null;
    for (const t of discoveryTemplates(detectCategory(parsed), secondHand)) {
      discovery.push({ text: t.build(discoveryBase).replace(/\s+/g, " ").trim(), purpose: t.purpose, useFor: "discovery", language: t.language });
    }
  }

  // --- déduplication (première occurrence conservée)
  const seen = new Set<string>();
  const uniq = (list: Draft[]) =>
    list.filter((d) => {
      if (!d.text) return false;
      const k = dedupeKey(d.text);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const adapterU = uniq(adapter);
  const discoveryU = uniq(discovery);

  // --- budget : les requêtes adaptateurs sont prioritaires, mais au moins
  // MIN_DISCOVERY_SLOTS places restent réservées à la découverte (si elle est demandée).
  const reserved = Math.min(MIN_DISCOVERY_SLOTS, discoveryU.length, maxDiscovery, max);
  const adapterBudget = Math.min(adapterU.length, max - reserved);
  const discoveryBudget = Math.min(discoveryU.length, maxDiscovery, max - adapterBudget);
  const picked = [...adapterU.slice(0, adapterBudget), ...discoveryU.slice(0, discoveryBudget)];
  return picked.map((d, i) => ({ ...d, priority: i + 1 }));
}

/** Filtre les reformulations pour un usage donné, dans l'ordre de priorité. */
export function queriesFor(expanded: ExpandedQuery[], use: ExpansionUse): string[] {
  return expanded.filter((q) => q.useFor === use).map((q) => q.text);
}
