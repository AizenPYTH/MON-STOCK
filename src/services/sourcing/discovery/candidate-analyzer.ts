/**
 * Analyse des résultats de recherche web pour la DÉCOUVERTE de fournisseurs.
 *
 * 1. Tri (pur) : exclusion explicite des marketplaces grand public, comparateurs, moteurs,
 *    réseaux sociaux et médias ; classement du type de fournisseur (grossiste, distributeur,
 *    reconditionneur, déstockage, broker, marketplace B2B) à partir du titre, de la
 *    description et de l'URL, avec une confiance ; rejet si aucun indice B2B.
 * 2. Sonde (une page publique par domaine) : robots.txt lu d'abord (interdiction → aucune
 *    requête, « robots.txt interdit ») ; puis UNE requête GET via fetchText (anti-SSRF) ;
 *    détection de plateforme (Shopify, WooCommerce, JSON-LD Product), de mur de connexion,
 *    de CAPTCHA / anti-bot (→ « Compte requis / protégé », jamais contourné) et de la
 *    visibilité des prix (« Prix après connexion »).
 *
 * Rien n'est inventé : un indice absent laisse le champ à null / « unknown ».
 */
import { fetchText, type FetchTextResult } from "@/services/sourcing/http";
import { evaluateRobots, parseRobotsTxt } from "@/services/sourcing/crawler/robots";
import { extractJsonLdBlocks } from "@/services/sourcing/crawler/parsers/jsonld-parser";
import type { WebSearchResult } from "@/services/sourcing/discovery/web-search-providers";

export type SupplierType = "wholesaler" | "distributor" | "refurbisher" | "liquidation" | "broker" | "b2b_marketplace" | "unknown";
export type DetectedPlatform = "shopify" | "woocommerce" | "jsonld" | "unknown";
/** « unknown » : page non sondée (robots.txt, erreur) — jamais présumée publique. */
export type AccessKind = "public" | "account" | "protected" | "unknown";
export type PriceVisibility = "public" | "after_login" | "unknown";
export type RobotsVerdict = "allowed" | "disallowed" | "missing" | "error" | "not_checked";

export const SUPPLIER_TYPE_LABEL: Record<SupplierType, string> = {
  wholesaler: "Grossiste",
  distributor: "Distributeur",
  refurbisher: "Reconditionneur",
  liquidation: "Déstockage / liquidation",
  broker: "Broker",
  b2b_marketplace: "Marketplace B2B",
  unknown: "Type inconnu",
};

export const ACCESS_LABEL: Record<AccessKind, string> = {
  public: "Accès public",
  account: "Compte requis",
  protected: "Compte requis / protégé",
  unknown: "Accès non vérifié",
};

export const PRICE_VISIBILITY_LABEL: Record<PriceVisibility, string> = {
  public: "Prix publics",
  after_login: "Prix après connexion",
  unknown: "Visibilité des prix inconnue",
};

// ---------------------------------------------------------------------------
// Domaines
// ---------------------------------------------------------------------------

/** Suffixes publics à deux niveaux les plus courants (liste volontairement courte, sans PSL complète). */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.za", "co.jp", "ne.jp", "or.jp", "co.kr", "co.in", "co.il",
  "com.br", "com.mx", "com.ar", "com.tr", "com.cn", "com.hk", "com.sg", "com.tw", "com.my", "com.ph", "com.vn", "com.ua", "com.pl", "com.es", "com.pt", "com.gr", "com.ro", "com.eg", "com.sa",
  "gouv.fr", "asso.fr", "com.fr", "nom.fr", "co.at", "or.at", "co.it",
]);

/** Domaine enregistrable : « shop.example.co.uk » → « example.co.uk ». null si l'hôte est invalide / une IP. */
export function registrableDomain(hostOrUrl: string): string | null {
  let host = hostOrUrl.trim().toLowerCase();
  if (!host) return null;
  if (host.includes("/") || host.includes(":")) {
    try {
      host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/\.$/, "").replace(/^www\d*\./, "");
  if (/^[\d.]+$/.test(host) || host.includes("[") || !host.includes(".")) return null;
  const labels = host.split(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join(".");
  return lastTwo;
}

/** Libellé principal du domaine enregistrable : « amazon.co.uk » → « amazon ». */
function domainLabel(domain: string): string {
  return domain.split(".")[0] ?? domain;
}

interface ExclusionRule {
  labels: string[];
  reason: string;
}

/**
 * Domaines exclus de la découverte (le libellé du domaine enregistrable, toutes extensions).
 * Ces sites ne sont pas des fournisseurs B2B à découvrir : grand public, comparateurs,
 * moteurs, réseaux sociaux, médias.
 */
export const EXCLUDED_DOMAIN_RULES: ExclusionRule[] = [
  { labels: ["amazon", "ebay", "backmarket", "cdiscount", "fnac", "darty", "boulanger", "rakuten", "aliexpress", "temu", "wish", "shein", "vinted", "leboncoin", "rueducommerce", "ldlc", "materiel", "carrefour", "auchan", "leclerc", "e-leclerc", "walmart", "bestbuy", "mediamarkt", "saturn", "currys", "argos", "otto", "zalando", "etsy", "allegro", "bol", "kaufland", "manomano", "veepee", "showroomprive", "ubaldi", "son-video", "electrodepot", "conforama", "but"], reason: "Marketplace / enseigne grand public" },
  { labels: ["idealo", "ledenicheur", "pricerunner", "kelkoo", "twenga", "pricespy", "geizhals", "billiger", "shopping", "lesnumeriques", "dealabs", "pricegrabber", "camelcamelcamel", "keepa", "touslesprix", "monsieurprix"], reason: "Comparateur de prix / bons plans" },
  { labels: ["google", "bing", "yahoo", "duckduckgo", "qwant", "ecosia", "brave", "baidu", "yandex"], reason: "Moteur de recherche" },
  { labels: ["facebook", "instagram", "youtube", "tiktok", "twitter", "x", "linkedin", "pinterest", "reddit", "snapchat", "telegram", "whatsapp", "quora", "threads", "discord"], reason: "Réseau social / plateforme de contenu" },
  { labels: ["wikipedia", "wikimedia", "01net", "frandroid", "numerama", "clubic", "lemonde", "lefigaro", "bfmtv", "zdnet", "macg", "igen", "iphonesoft", "journaldugeek", "cnet", "theverge", "gsmarena", "trustpilot", "avis-verifies", "pagesjaunes", "societe", "pappers", "infogreffe", "verif"], reason: "Média / annuaire / encyclopédie" },
  { labels: ["apple", "samsung", "xiaomi", "huawei", "sony", "microsoft", "lenovo", "dell", "hp", "oneplus", "oppo", "nintendo", "playstation", "xbox"], reason: "Site officiel de fabricant (grand public)" },
];

/** Sous-domaines B2B autorisés malgré l'exclusion du domaine (ex. Back Market Pro). */
const B2B_HOST_EXCEPTIONS: RegExp[] = [/^pro\.backmarket\.[a-z.]+$/];

export function exclusionReason(hostOrUrl: string): string | null {
  let host = hostOrUrl.toLowerCase();
  try {
    if (host.includes("/")) host = new URL(host).hostname;
  } catch {
    return "URL invalide";
  }
  host = host.replace(/^www\d*\./, "");
  if (B2B_HOST_EXCEPTIONS.some((re) => re.test(host))) return null;
  const domain = registrableDomain(host);
  if (!domain) return "Hôte invalide";
  const label = domainLabel(domain);
  // les domaines Google (google.fr, google.co.uk…) et Amazon (amazon.de, amazon.co.uk…) : toutes extensions
  for (const rule of EXCLUDED_DOMAIN_RULES) if (rule.labels.includes(label)) return rule.reason;
  if (/(^|\.)blogspot\.|(^|\.)wordpress\.com$|(^|\.)medium\.com$/.test(host)) return "Blog / plateforme de contenu";
  return null;
}

// ---------------------------------------------------------------------------
// Classification du type de fournisseur
// ---------------------------------------------------------------------------

const TYPE_KEYWORDS: Array<{ type: Exclude<SupplierType, "unknown">; words: string[] }> = [
  { type: "b2b_marketplace", words: ["marketplace b2b", "b2b marketplace", "place de marche b2b", "plateforme b2b", "b2b platform", "trading platform"] },
  { type: "liquidation", words: ["destockage", "liquidation", "surplus", "overstock", "stock lots", "lots", "lot de", "palette", "palettes", "pallets", "clearance", "fin de serie", "invendus", "returns pallets"] },
  { type: "broker", words: ["broker", "brokers", "courtier", "trader", "traders", "trading"] },
  { type: "refurbisher", words: ["reconditionneur", "refurbisher", "refurbishers", "reconditionnement", "refurbishment", "reconditionne", "reconditionnes", "refurbished"] },
  { type: "distributor", words: ["distributeur", "distributeurs", "distributor", "distributors", "distribution", "grossiste distributeur"] },
  { type: "wholesaler", words: ["grossiste", "grossistes", "wholesale", "wholesaler", "wholesalers", "vente en gros", "en gros", "achat en gros", "bulk"] },
];

/** Indices d'une clientèle professionnelle (sans type particulier). */
const B2B_SIGNALS = ["b2b", "professionnels", "professionnel", "pro uniquement", "reserve aux professionnels", "revendeur", "revendeurs", "resellers", "reseller", "tarifs pro", "moq", "minimum de commande", "minimum order", "tva intracommunautaire", "devis", "business"];

function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(?:^| )${word}(?: |$)`).test(text);
}

export interface SupplierClassification {
  type: SupplierType;
  /** 0–1 : nombre et poids des indices concordants */
  confidence: number;
  /** mots-clés trouvés (traçabilité) */
  signals: string[];
  b2bRelevant: boolean;
}

/** Type de fournisseur à partir du titre, de la description et de l'URL (mots-clés FR/EN). */
export function classifySupplierType(title: string, description: string | null, url: string): SupplierClassification {
  let path = url;
  try {
    const u = new URL(url);
    path = `${u.hostname} ${u.pathname}`;
  } catch {
    // URL brute
  }
  const text = ` ${normalizeForMatch(`${title} ${description ?? ""} ${path.replace(/[-_/.]/g, " ")}`)} `.trim();
  const scores = new Map<Exclude<SupplierType, "unknown">, string[]>();
  for (const { type, words } of TYPE_KEYWORDS) {
    const found = words.filter((w) => hasWord(text, w));
    if (found.length > 0) scores.set(type, found);
  }
  const b2b = B2B_SIGNALS.filter((w) => hasWord(text, w));

  let best: Exclude<SupplierType, "unknown"> | null = null;
  let bestCount = 0;
  // ordre de TYPE_KEYWORDS = priorité à égalité (marketplace B2B > déstockage > broker > reconditionneur > distributeur > grossiste)
  for (const { type } of TYPE_KEYWORDS) {
    const n = scores.get(type)?.length ?? 0;
    if (n > bestCount) {
      best = type;
      bestCount = n;
    }
  }
  const signals = [...new Set([...[...scores.values()].flat(), ...b2b])];
  if (!best) {
    return { type: "unknown", confidence: b2b.length > 0 ? Math.min(0.4, 0.2 + 0.1 * b2b.length) : 0, signals, b2bRelevant: b2b.length > 0 };
  }
  // « reconditionné » seul peut désigner une boutique grand public : confiance plus faible sans indice B2B
  const weakOnly = best === "refurbisher" && scores.get("refurbisher")!.every((w) => w === "reconditionne" || w === "reconditionnes" || w === "refurbished") && b2b.length === 0;
  const confidence = Math.min(0.95, Math.round((0.45 + 0.15 * (bestCount - 1) + 0.1 * Math.min(3, b2b.length) + (weakOnly ? -0.15 : 0)) * 100) / 100);
  return { type: best, confidence, signals, b2bRelevant: !weakOnly };
}

// ---------------------------------------------------------------------------
// Tri des résultats
// ---------------------------------------------------------------------------

export interface DiscoveryCandidate {
  domain: string;
  host: string;
  origin: string;
  name: string;
  sampleUrl: string;
  title: string;
  description: string | null;
  query: string;
  supplierType: SupplierType;
  typeConfidence: number;
  signals: string[];
}

export interface ScreenRejection {
  domain: string | null;
  url: string;
  title: string;
  query: string;
  reason: string;
}

/** Nom lisible tiré du domaine : « grossiste-phone.fr » → « Grossiste Phone ». */
export function nameFromDomain(domain: string): string {
  const label = domainLabel(domain);
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Nom du site à partir du titre de page (segment après « | » / « - » s'il ressemble au domaine), sinon depuis le domaine. */
export function candidateName(title: string, domain: string): string {
  const label = normalizeForMatch(domainLabel(domain)).replace(/ /g, "");
  const parts = title.split(/\s[|–—-]\s|\s·\s/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const n = normalizeForMatch(p).replace(/ /g, "");
    if (n && label && (n.includes(label) || label.includes(n)) && p.length <= 60) return p;
  }
  return nameFromDomain(domain);
}

/**
 * Trie les résultats (pur) : exclusions explicites, indices B2B, un candidat par domaine
 * enregistrable (le premier résultat le mieux classé est conservé).
 */
export function screenSearchResults(results: Array<WebSearchResult & { query: string }>): { candidates: DiscoveryCandidate[]; rejected: ScreenRejection[] } {
  const byDomain = new Map<string, DiscoveryCandidate>();
  const rejected: ScreenRejection[] = [];
  const rejectedDomains = new Set<string>();
  for (const r of results) {
    let u: URL;
    try {
      u = new URL(r.url);
    } catch {
      rejected.push({ domain: null, url: r.url, title: r.title, query: r.query, reason: "URL invalide" });
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    const host = u.hostname.toLowerCase();
    const domain = registrableDomain(host);
    if (!domain) {
      rejected.push({ domain: null, url: r.url, title: r.title, query: r.query, reason: "Hôte invalide" });
      continue;
    }
    const excluded = exclusionReason(host);
    const key = B2B_HOST_EXCEPTIONS.some((re) => re.test(host.replace(/^www\d*\./, ""))) ? host.replace(/^www\d*\./, "") : domain;
    if (excluded) {
      if (!rejectedDomains.has(key)) rejected.push({ domain: key, url: r.url, title: r.title, query: r.query, reason: `Exclu : ${excluded}` });
      rejectedDomains.add(key);
      continue;
    }
    const cls = classifySupplierType(r.title, r.description, r.url);
    const existing = byDomain.get(key);
    if (!cls.b2bRelevant) {
      if (!existing && !rejectedDomains.has(key)) {
        rejected.push({ domain: key, url: r.url, title: r.title, query: r.query, reason: "Aucun indice B2B (grossiste, distributeur, reconditionneur, déstockage, broker…)" });
        rejectedDomains.add(key);
      }
      continue;
    }
    if (rejectedDomains.has(key)) {
      // un résultat ultérieur du même domaine montre un indice B2B : le domaine est repêché
      rejectedDomains.delete(key);
      const idx = rejected.findIndex((x) => x.domain === key);
      if (idx >= 0) rejected.splice(idx, 1);
    }
    if (existing && existing.typeConfidence >= cls.confidence) continue;
    byDomain.set(key, {
      domain: key,
      host,
      origin: u.origin,
      name: candidateName(r.title, key),
      sampleUrl: u.toString(),
      title: r.title,
      description: r.description,
      query: r.query,
      supplierType: cls.type,
      typeConfidence: cls.confidence,
      signals: cls.signals,
    });
  }
  return { candidates: [...byDomain.values()], rejected };
}

// ---------------------------------------------------------------------------
// Analyse d'une page publique
// ---------------------------------------------------------------------------

export interface PageAnalysis {
  platform: DetectedPlatform;
  access: AccessKind;
  priceVisibility: PriceVisibility;
  jsonLdProduct: boolean;
  signals: string[];
}

/** Pages de défi anti-bot (interstitiels) : toujours « protégé ». */
const CHALLENGE_PATTERNS: Array<[RegExp, string]> = [
  [/cf-challenge|challenge-platform|cf_chl_|attention required! \| cloudflare|<title>\s*just a moment\.\.\./i, "défi Cloudflare"],
  [/captcha-delivery\.com|geo\.captcha-delivery|datadome/i, "DataDome"],
  [/px-captcha|perimeterx/i, "PerimeterX"],
  [/<title>[^<]*(?:captcha|are you a robot|vérification de sécurité|security check)[^<]*<\/title>/i, "page CAPTCHA"],
];

/** Widgets CAPTCHA : « protégé » seulement si la page n'a presque pas d'autre contenu (sinon simple formulaire). */
const CAPTCHA_WIDGET_PATTERNS: Array<[RegExp, string]> = [
  [/g-recaptcha|recaptcha\/api|grecaptcha/i, "reCAPTCHA"],
  [/hcaptcha\.com|h-captcha/i, "hCaptcha"],
  [/\bcaptcha\b/i, "CAPTCHA"],
];

/** En dessous : page considérée comme un simple écran de vérification. */
const THIN_PAGE_CHARS = 1_500;

const LOGIN_PRICE_PATTERNS: RegExp[] = [
  /connectez[- ]vous pour (?:voir|afficher|consulter|acc[ée]der aux) (?:les |nos )?(?:prix|tarifs)/i,
  /identifiez[- ]vous pour (?:voir|afficher) (?:les |nos )?(?:prix|tarifs)/i,
  /(?:prix|tarifs) (?:visibles|affich[ée]s|disponibles) (?:apr[èe]s|uniquement apr[èe]s) (?:connexion|inscription)/i,
  /(?:prix|tarifs) r[ée]serv[ée]s aux (?:professionnels|membres|clients)/i,
  /(?:log ?in|sign ?in|register) to (?:see|view) (?:the )?(?:prices|pricing)/i,
  /prices? (?:are )?(?:visible|available|shown) (?:only )?(?:after|upon) (?:login|log in|registration|sign ?in)/i,
  /create an account to (?:see|view) (?:prices|pricing)/i,
];

const LOGIN_WALL_PATTERNS: RegExp[] = [
  /acc[èe]s r[ée]serv[ée] aux (?:professionnels|membres|clients)/i,
  /(?:members|trade customers|registered (?:users|customers)) only/i,
  /veuillez vous connecter|please (?:log ?in|sign ?in) to (?:continue|access)/i,
];

function looksLikeShopifyProductsJson(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const products = (json as { products?: unknown }).products;
  return Array.isArray(products) && products.length > 0 && products.every((p) => p && typeof p === "object" && "handle" in p && Array.isArray((p as { variants?: unknown }).variants));
}

function looksLikeWooStoreJson(json: unknown): boolean {
  return Array.isArray(json) && json.length > 0 && json.every((p) => p && typeof p === "object" && "prices" in p && "permalink" in p);
}

function hasJsonLdProduct(html: string): { product: boolean; price: boolean } {
  let product = false;
  let price = false;
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    const types = Array.isArray(t) ? t : [t];
    if (types.some((x) => x === "Product" || x === "ProductGroup")) {
      product = true;
      const offers = obj.offers;
      const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
      for (const o of list) {
        if (o && typeof o === "object" && ("price" in o || "lowPrice" in o || "priceSpecification" in o)) price = true;
      }
    }
    for (const v of Object.values(obj)) if (v && typeof v === "object") visit(v, depth + 1);
  };
  for (const block of extractJsonLdBlocks(html)) visit(block, 0);
  return { product, price };
}

/** Analyse (pure) d'une réponse HTTP : plateforme, accès, visibilité des prix. */
export function analyzePage(res: Pick<FetchTextResult, "status" | "text" | "contentType">): PageAnalysis {
  const signals: string[] = [];
  const body = res.text.slice(0, 2 * 1024 * 1024);
  const isJson = (res.contentType ?? "").includes("json") || /^\s*[[{]/.test(body.slice(0, 10));

  const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const protectedResult = (label: string): PageAnalysis => {
    signals.push(`Protection détectée : ${label} (aucun contournement)`);
    return { platform: "unknown", access: "protected", priceVisibility: "unknown", jsonLdProduct: false, signals };
  };

  // --- protections : jamais contournées
  for (const [re, label] of CHALLENGE_PATTERNS) if (re.test(body)) return protectedResult(label);
  for (const [re, label] of CAPTCHA_WIDGET_PATTERNS) {
    if (!re.test(body)) continue;
    if (!isJson && text.length < THIN_PAGE_CHARS && !/application\/ld\+json/i.test(body)) return protectedResult(label);
    signals.push(`${label} présent sur la page (formulaire)`);
    break;
  }
  if (res.status === 401 || res.status === 407) {
    signals.push(`HTTP ${res.status} : authentification requise`);
    return { platform: "unknown", access: "account", priceVisibility: "unknown", jsonLdProduct: false, signals };
  }
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    signals.push(`HTTP ${res.status} : accès refusé ou limité (protection probable)`);
    return { platform: "unknown", access: "protected", priceVisibility: "unknown", jsonLdProduct: false, signals };
  }

  // --- plateforme
  let platform: DetectedPlatform = "unknown";
  let jsonPrices = false;
  if (isJson) {
    try {
      const json = JSON.parse(body) as unknown;
      if (looksLikeShopifyProductsJson(json)) {
        platform = "shopify";
        jsonPrices = true;
        signals.push("Format /products.json (Shopify)");
      } else if (looksLikeWooStoreJson(json)) {
        platform = "woocommerce";
        jsonPrices = true;
        signals.push("Format Store API (WooCommerce)");
      }
    } catch {
      // JSON invalide : rien n'est déduit
    }
  }
  if (platform === "unknown") {
    if (/cdn\.shopify\.com|window\.Shopify\b|Shopify\.theme|myshopify\.com/i.test(body)) {
      platform = "shopify";
      signals.push("Ressources cdn.shopify.com (Shopify)");
    } else if (/\/wp-json\/wc\/store|wp-content\/plugins\/woocommerce|class="[^"]*\bwoocommerce\b/i.test(body)) {
      platform = "woocommerce";
      signals.push("WooCommerce détecté (wp-json/wc/store ou extension)");
    }
  }
  const jsonLd = isJson ? { product: false, price: false } : hasJsonLdProduct(body);
  if (jsonLd.product) {
    signals.push("Données structurées JSON-LD Product présentes");
    if (platform === "unknown") platform = "jsonld";
  }

  // --- accès / visibilité des prix
  let access: AccessKind = "public";
  let priceVisibility: PriceVisibility = "unknown";
  if (LOGIN_PRICE_PATTERNS.some((re) => re.test(text))) {
    priceVisibility = "after_login";
    access = "account";
    signals.push("Prix affichés après connexion");
  } else if (LOGIN_WALL_PATTERNS.some((re) => re.test(text)) || (/type=["']?password/i.test(body) && !jsonLd.product && !/itemprop=["']?price/i.test(body))) {
    access = "account";
    signals.push("Page de connexion / accès réservé");
  } else if (jsonPrices || jsonLd.price || /itemprop=["']?price["']?|property=["'](?:og:price:amount|product:price:amount)["']/i.test(body)) {
    priceVisibility = "public";
  }
  if (!res.status || res.status >= 400) {
    signals.push(`HTTP ${res.status}`);
  }
  return { platform, access, priceVisibility, jsonLdProduct: jsonLd.product, signals };
}

/** Adaptateur suggéré (clé du registre) — uniquement pour un accès public. */
export function suggestAdapter(platform: DetectedPlatform, access: AccessKind): string | null {
  if (access !== "public") return null;
  if (platform === "shopify") return "shopify-storefront";
  if (platform === "woocommerce") return "woocommerce-store";
  if (platform === "jsonld") return "jsonld-public";
  return null;
}

// ---------------------------------------------------------------------------
// Sonde réseau (robots.txt puis une page)
// ---------------------------------------------------------------------------

export interface ProbeDeps {
  userAgent: string;
  fetchImpl?: typeof fetch;
  resolver?: (host: string) => Promise<Array<{ address: string }>>;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** délai maximal accepté pour respecter un Crawl-delay avant la requête de page (défaut 10 s) */
  maxCrawlDelayMs?: number;
}

export interface ProbedCandidate extends DiscoveryCandidate {
  robots: RobotsVerdict;
  robotsDetail: string;
  crawlDelaySeconds: number | null;
  probed: boolean;
  httpStatus: number | null;
  platform: DetectedPlatform;
  access: AccessKind;
  priceVisibility: PriceVisibility;
  suggestedAdapter: string | null;
  probeSignals: string[];
  probeError: string | null;
}

async function readRobots(origin: string, deps: ProbeDeps): Promise<{ verdict: "ok" | "missing" | "error"; text: string; detail: string }> {
  try {
    const res = await fetchText(`${origin}/robots.txt`, { userAgent: deps.userAgent, accept: "text/plain", timeoutMs: deps.timeoutMs ?? 8_000, maxBytes: 512 * 1024, fetchImpl: deps.fetchImpl, resolver: deps.resolver });
    if (res.status === 404 || res.status === 410) return { verdict: "missing", text: "", detail: "Aucun robots.txt : aucune restriction déclarée (les CGU restent à vérifier)." };
    if (!res.ok) return { verdict: "error", text: "", detail: `robots.txt inaccessible (HTTP ${res.status}) : page non sondée par prudence.` };
    return { verdict: "ok", text: res.text, detail: "robots.txt lu." };
  } catch (e) {
    return { verdict: "error", text: "", detail: `robots.txt inaccessible (${e instanceof Error ? e.message : "erreur réseau"}) : page non sondée par prudence.` };
  }
}

/**
 * Sonde une page publique du candidat : robots.txt d'abord (interdiction ou erreur → aucune
 * requête de page), puis une seule requête GET de l'URL trouvée par la recherche.
 */
export async function probeCandidate(candidate: DiscoveryCandidate, deps: ProbeDeps): Promise<ProbedCandidate> {
  const base: ProbedCandidate = {
    ...candidate,
    robots: "not_checked",
    robotsDetail: "",
    crawlDelaySeconds: null,
    probed: false,
    httpStatus: null,
    platform: "unknown",
    access: "unknown",
    priceVisibility: "unknown",
    suggestedAdapter: null,
    probeSignals: [],
    probeError: null,
  };

  const robots = await readRobots(candidate.origin, deps);
  if (robots.verdict === "error") return { ...base, robots: "error", robotsDetail: robots.detail };
  let crawlDelay: number | null = null;
  let robotsVerdict: RobotsVerdict = "missing";
  if (robots.verdict === "ok") {
    const u = new URL(candidate.sampleUrl);
    const decision = evaluateRobots(parseRobotsTxt(robots.text.slice(0, 512 * 1024)), deps.userAgent, u.pathname + u.search);
    crawlDelay = decision.crawlDelay;
    if (!decision.allowed) return { ...base, robots: "disallowed", robotsDetail: `robots.txt interdit${decision.rule ? ` (${decision.rule})` : ""} : aucune requête effectuée.`, crawlDelaySeconds: crawlDelay };
    robotsVerdict = "allowed";
  }

  if (crawlDelay !== null && crawlDelay > 0) {
    const waitMs = crawlDelay * 1000;
    const maxWait = deps.maxCrawlDelayMs ?? 10_000;
    if (waitMs > maxWait) {
      return { ...base, robots: robotsVerdict, robotsDetail: `Crawl-delay de ${crawlDelay} s demandé : sonde reportée (non effectuée).`, crawlDelaySeconds: crawlDelay };
    }
    await (deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(waitMs);
  }

  try {
    const res = await fetchText(candidate.sampleUrl, { userAgent: deps.userAgent, timeoutMs: deps.timeoutMs ?? 10_000, maxBytes: 3 * 1024 * 1024, fetchImpl: deps.fetchImpl, resolver: deps.resolver });
    const analysis = analyzePage(res);
    return {
      ...base,
      robots: robotsVerdict,
      robotsDetail: robots.detail,
      crawlDelaySeconds: crawlDelay,
      probed: true,
      httpStatus: res.status,
      platform: analysis.platform,
      access: analysis.access,
      priceVisibility: analysis.priceVisibility,
      suggestedAdapter: suggestAdapter(analysis.platform, analysis.access),
      probeSignals: analysis.signals,
    };
  } catch (e) {
    return { ...base, robots: robotsVerdict, robotsDetail: robots.detail, crawlDelaySeconds: crawlDelay, probeError: e instanceof Error ? e.message : "Erreur réseau." };
  }
}
