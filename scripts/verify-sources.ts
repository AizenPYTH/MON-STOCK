/**
 * Vérification HTTP des sources candidates du moteur de sourcing (catalogue data-only :
 * src/integrations/sourcing/catalog.ts). À exécuter depuis une machine AVEC accès réseau :
 *
 *   npm run sources:verify                                  (toutes les sources)
 *   npx tsx scripts/verify-sources.ts --key destockplus     (une seule source)
 *   npx tsx scripts/verify-sources.ts --out docs/sourcing-sources-verification.md
 *   npx tsx scripts/verify-sources.ts --no-preflight        (ne pas court-circuiter si le réseau semble bloqué)
 *
 * Pour chaque source, le script :
 *   1. fait un GET (après un HEAD) sur l'URL officielle : statut, URL finale, en-tête Server ;
 *   2. lit robots.txt et évalue les règles Allow/Disallow pour l'agent MonStockBot et `*`
 *      sur la page d'accueil et sur des chemins typiques de recherche / catalogue ;
 *   3. détecte des signaux de plateforme dans le HTML (Shopify, WooCommerce, JSON-LD Product,
 *      lien <link rel="alternate" type="application/rss+xml">) ;
 *   4. sonde SANS identifiants les points d'entrée publics documentés (/products.json?limit=1,
 *      /wp-json/wc/store/v1/products?per_page=1) uniquement si robots.txt les autorise ;
 *   5. ne note « prix visible sans connexion » QUE si un prix JSON-LD / Shopify / Woo a réellement été retourné ;
 *   6. écrit un rapport Markdown (tableau 12 colonnes + détail par source + comptage).
 *
 * Règles de politesse : 2 s minimum entre deux requêtes vers un même hôte, User-Agent honnête
 * (`MonStockBot/0.1 (+contact)`, configurable via SOURCING_USER_AGENT), délai d'attente 15 s,
 * 5 redirections maximum, AUCUNE nouvelle tentative : un 403/429 ou une page CAPTCHA/anti-bot est
 * consigné « Accès automatisé refusé / à vérifier manuellement ». Rien n'est contourné.
 *
 * Dépendances : Node ≥ 22 (fetch natif) + fast-xml-parser (validation d'un flux RSS détecté).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { XMLParser } from "fast-xml-parser";
import {
  CATALOG_TABLE_COLUMNS,
  catalogSourceByKey,
  catalogTableRow,
  labelAccountRequired,
  labelAutomationAllowed,
  labelPricePublic,
  labelYesNoUnknown,
  listCatalogSources,
  type CatalogSource,
} from "../src/integrations/sourcing/catalog";

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const USER_AGENT = process.env.SOURCING_USER_AGENT?.trim() || "MonStockBot/0.1 (+contact)";
/** jeton d'agent évalué dans robots.txt (partie avant le « / » du User-Agent) */
const BOT_TOKEN = (USER_AGENT.split("/")[0] ?? "MonStockBot").trim().toLowerCase();
const PER_HOST_DELAY_MS = 2_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_CHARS = 1_500_000;
const DEFAULT_OUT = "docs/sourcing-sources-verification.md";

const NETWORK_UNAVAILABLE = "réseau indisponible depuis cet environnement";
const ACCESS_REFUSED = "Accès automatisé refusé / à vérifier manuellement";

/** Chemins typiques de recherche / catalogue évalués dans robots.txt (en plus de « / » et du chemin de l'URL officielle). */
const TYPICAL_PATHS = [
  "/search",
  "/search?q=iphone",
  "/recherche",
  "/catalogsearch/result/?q=iphone",
  "/collections/all",
  "/products.json",
  "/shop/",
  "/wp-json/wc/store/v1/products",
  "/lots",
] as const;

const SHOPIFY_PROBE = "/products.json?limit=1";
const WOO_PROBE = "/wp-json/wc/store/v1/products?per_page=1";

const BLOCK_KEYWORDS = [
  "captcha",
  "access denied",
  "accès refusé",
  "attention required",
  "just a moment",
  "are you a robot",
  "are you human",
  "verify you are human",
  "pardon our interruption",
  "request blocked",
  "bot detection",
  "datadome",
  "perimeterx",
  "incapsula",
  "imperva",
  "cf-chl",
  "challenge-platform",
];

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface HttpResult {
  requestedUrl: string;
  finalUrl: string;
  method: "HEAD" | "GET";
  status: number | null;
  server: string | null;
  contentType: string | null;
  body: string;
  redirects: number;
  error: string | null;
  /** 403 émis par le proxy de sortie de cet environnement (pas par le site) */
  blockedByEnvironment: boolean;
  /** échec de connexion (DNS, refus, délai) */
  connectionFailed: boolean;
  durationMs: number;
}

type RobotsVerdict = "allow" | "disallow" | "no-rule";

interface RobotsRule {
  allow: boolean;
  path: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

interface RobotsEvaluation {
  path: string;
  bot: RobotsVerdict;
  all: RobotsVerdict;
}

interface RobotsReport {
  url: string;
  status: number | null;
  /** fichier lu et analysé */
  parsed: boolean;
  /** 404 : pas de robots.txt → tout est permis par défaut */
  absent: boolean;
  groupsForBot: RobotsGroup[];
  groupsForAll: RobotsGroup[];
  evaluations: RobotsEvaluation[];
  note: string | null;
}

interface PlatformSignals {
  shopify: boolean;
  woocommerce: boolean;
  jsonLdProducts: number;
  /** premier prix JSON-LD trouvé (valeur + devise si présente) */
  jsonLdPrice: string | null;
  rssHref: string | null;
}

interface ProbeResult {
  name: string;
  url: string;
  status: number | null;
  ok: boolean;
  price: string | null;
  stock: string | null;
  note: string;
}

interface SourceReport {
  source: CatalogSource;
  networkUnavailable: boolean;
  blocked: boolean;
  blockedReason: string | null;
  homepage: HttpResult | null;
  robots: RobotsReport | null;
  signals: PlatformSignals | null;
  probes: ProbeResult[];
  /** prix réellement observé sans connexion (origine + valeur) */
  priceObserved: string | null;
  /** disponibilité réellement retournée par un endpoint public */
  stockObserved: string | null;
  rssValidated: { items: number } | null;
  notes: string[];
}

// -----------------------------------------------------------------------------
// HTTP poli : 1 requête / 2 s par hôte, délai 15 s, 5 redirections max, jamais de nouvelle tentative
// -----------------------------------------------------------------------------

const lastRequestAtByHost = new Map<string, number>();

async function waitForHost(host: string): Promise<void> {
  const last = lastRequestAtByHost.get(host);
  if (last !== undefined) {
    const elapsed = Date.now() - last;
    if (elapsed < PER_HOST_DELAY_MS) await sleep(PER_HOST_DELAY_MS - elapsed);
  }
  lastRequestAtByHost.set(host, Date.now());
}

function errorCode(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const code = (cause as { code?: unknown }).code;
      if (typeof code === "string") return code;
      const msg = (cause as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
    return err.name === "TimeoutError" || err.name === "AbortError" ? "TIMEOUT" : err.message;
  }
  return String(err);
}

const CONNECTION_FAILURE_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ECONNRESET", "TIMEOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);

function looksLikeEnvironmentBlock(status: number, headers: Headers, body: string): boolean {
  if (status !== 403) return false;
  if (headers.has("x-deny-reason")) return true;
  return /host not in allowlist|network egress|egress (proxy|blocked)/i.test(body.slice(0, 2_000));
}

async function politeFetch(url: string, method: "HEAD" | "GET"): Promise<HttpResult> {
  const started = Date.now();
  const result: HttpResult = {
    requestedUrl: url,
    finalUrl: url,
    method,
    status: null,
    server: null,
    contentType: null,
    body: "",
    redirects: 0,
    error: null,
    blockedByEnvironment: false,
    connectionFailed: false,
    durationMs: 0,
  };
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let host: string;
    try {
      host = new URL(current).host;
    } catch {
      result.error = `URL invalide : ${current}`;
      break;
    }
    await waitForHost(host);
    let response: Response;
    try {
      response = await fetch(current, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.5", "accept-language": "fr-FR,fr;q=0.9,en;q=0.5" },
      });
    } catch (err) {
      const code = errorCode(err);
      result.error = code;
      result.connectionFailed = CONNECTION_FAILURE_CODES.has(code);
      break;
    }
    result.finalUrl = current;
    result.status = response.status;
    result.server = response.headers.get("server");
    result.contentType = response.headers.get("content-type");
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      // consommer le corps pour libérer la connexion
      await response.arrayBuffer().catch(() => undefined);
      if (hop === MAX_REDIRECTS) {
        result.error = `plus de ${MAX_REDIRECTS} redirections`;
        break;
      }
      result.redirects += 1;
      current = new URL(location, current).toString();
      continue;
    }
    let body = "";
    try {
      body = method === "HEAD" ? "" : (await response.text()).slice(0, MAX_BODY_CHARS);
    } catch (err) {
      result.error = `lecture du corps : ${errorCode(err)}`;
    }
    result.body = body;
    result.blockedByEnvironment = looksLikeEnvironmentBlock(response.status, response.headers, body);
    break;
  }
  result.durationMs = Date.now() - started;
  return result;
}

// -----------------------------------------------------------------------------
// robots.txt
// -----------------------------------------------------------------------------

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow") current.rules.push({ allow: field === "allow", path: value });
  }
  return groups;
}

function robotsPatternToRegExp(pattern: string): RegExp {
  let re = "^";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "$") re += "$";
    else re += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(re);
}

function selectGroups(groups: RobotsGroup[], agentToken: string): RobotsGroup[] {
  const exact = groups.filter((g) => g.agents.some((a) => a !== "*" && (agentToken.startsWith(a) || a.startsWith(agentToken))));
  if (exact.length > 0) return exact;
  return groups.filter((g) => g.agents.includes("*"));
}

/** Règle la plus longue qui correspond ; à longueur égale, Allow l'emporte. Aucune règle → « no-rule » (autorisé). */
function evaluateRobots(groups: RobotsGroup[], path: string): RobotsVerdict {
  let best: { allow: boolean; length: number } | null = null;
  for (const group of groups) {
    for (const rule of group.rules) {
      if (rule.path === "") continue; // « Disallow: » vide = tout permis
      if (!robotsPatternToRegExp(rule.path).test(path)) continue;
      const length = rule.path.length;
      if (!best || length > best.length || (length === best.length && rule.allow && !best.allow)) best = { allow: rule.allow, length };
    }
  }
  if (!best) return "no-rule";
  return best.allow ? "allow" : "disallow";
}

function pathAllowed(robots: RobotsReport | null, path: string): boolean {
  if (!robots || !robots.parsed) return robots?.absent ?? false;
  return evaluateRobots(robots.groupsForBot, path) !== "disallow";
}

async function checkRobots(origin: string, pathsToEvaluate: string[]): Promise<RobotsReport> {
  const url = `${origin}/robots.txt`;
  const res = await politeFetch(url, "GET");
  const report: RobotsReport = { url, status: res.status, parsed: false, absent: false, groupsForBot: [], groupsForAll: [], evaluations: [], note: null };
  if (res.blockedByEnvironment) {
    report.note = NETWORK_UNAVAILABLE;
    return report;
  }
  if (res.error && res.status === null) {
    report.note = `robots.txt injoignable (${res.error})`;
    return report;
  }
  if (res.status === 404 || res.status === 410) {
    report.absent = true;
    report.note = "pas de robots.txt (404) : aucune restriction déclarée";
    report.evaluations = pathsToEvaluate.map((path) => ({ path, bot: "no-rule", all: "no-rule" }));
    return report;
  }
  if (res.status !== 200) {
    report.note = `robots.txt : HTTP ${res.status} → à vérifier manuellement (aucune sonde effectuée)`;
    return report;
  }
  if (res.contentType && /text\/html/i.test(res.contentType) && /<html/i.test(res.body.slice(0, 500))) {
    report.note = "robots.txt renvoie une page HTML (anti-bot ou réécriture) → à vérifier manuellement";
    return report;
  }
  const groups = parseRobots(res.body);
  report.parsed = true;
  report.groupsForBot = selectGroups(groups, BOT_TOKEN);
  report.groupsForAll = groups.filter((g) => g.agents.includes("*"));
  report.evaluations = pathsToEvaluate.map((path) => ({ path, bot: evaluateRobots(report.groupsForBot, path), all: evaluateRobots(report.groupsForAll, path) }));
  const botNamed = groups.some((g) => g.agents.some((a) => a !== "*" && a.startsWith(BOT_TOKEN)));
  report.note = botNamed ? `un groupe nomme explicitement ${BOT_TOKEN}` : `aucun groupe dédié à ${BOT_TOKEN} : règles « * » appliquées`;
  return report;
}

// -----------------------------------------------------------------------------
// Signaux de plateforme (HTML de la page d'accueil)
// -----------------------------------------------------------------------------

function walkJson(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkJson(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    visit(obj);
    for (const value of Object.values(obj)) walkJson(value, visit);
  }
}

function isProductType(type: unknown): boolean {
  if (typeof type === "string") return /(^|\/)Product$/.test(type) || type === "Product";
  if (Array.isArray(type)) return type.some(isProductType);
  return false;
}

function formatPrice(price: unknown, currency: unknown): string | null {
  if (typeof price !== "number" && typeof price !== "string") return null;
  const value = String(price).trim();
  if (!value || !/\d/.test(value)) return null;
  return typeof currency === "string" && currency ? `${value} ${currency}` : value;
}

function extractJsonLdPrice(product: Record<string, unknown>): string | null {
  const offers = product.offers;
  const candidates: unknown[] = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const offer of candidates) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as Record<string, unknown>;
    const price = formatPrice(o.price ?? o.lowPrice, o.priceCurrency);
    if (price) return price;
    const spec = o.priceSpecification;
    if (spec && typeof spec === "object") {
      const s = spec as Record<string, unknown>;
      const specPrice = formatPrice(s.price, s.priceCurrency);
      if (specPrice) return specPrice;
    }
  }
  return null;
}

function detectSignals(html: string): PlatformSignals {
  const signals: PlatformSignals = {
    shopify: /cdn\.shopify\.com|Shopify\.theme/.test(html),
    woocommerce: /wp-content\/plugins\/woocommerce|\/wp-json\/wc\/store/.test(html),
    jsonLdProducts: 0,
    jsonLdPrice: null,
    rssHref: null,
  };
  const scriptRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    walkJson(parsed, (obj) => {
      if (!isProductType(obj["@type"])) return;
      signals.jsonLdProducts += 1;
      if (!signals.jsonLdPrice) signals.jsonLdPrice = extractJsonLdPrice(obj);
    });
  }
  const linkRe = /<link\b[^>]*>/gi;
  let link: RegExpExecArray | null;
  while ((link = linkRe.exec(html)) !== null) {
    const tag = link[0];
    if (!/rel\s*=\s*["']?alternate["']?/i.test(tag) || !/type\s*=\s*["']application\/rss\+xml["']/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) {
      signals.rssHref = href;
      break;
    }
  }
  return signals;
}

function extractTitle(html: string): string | null {
  return /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function detectBlockedPage(res: HttpResult): string | null {
  if (res.status === 403 || res.status === 429) return `HTTP ${res.status}`;
  const title = (extractTitle(res.body) ?? "").toLowerCase();
  const head = res.body.slice(0, 20_000).toLowerCase();
  for (const kw of BLOCK_KEYWORDS) {
    if (title.includes(kw)) return `titre de page « ${title.slice(0, 80)} »`;
    if (head.includes(kw)) return `mot-clé anti-bot « ${kw} » dans la page`;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Sondes publiques (sans identifiants, uniquement si robots.txt l'autorise)
// -----------------------------------------------------------------------------

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function probeShopify(origin: string): Promise<ProbeResult> {
  const url = `${origin}${SHOPIFY_PROBE}`;
  const res = await politeFetch(url, "GET");
  const probe: ProbeResult = { name: "Shopify products.json", url, status: res.status, ok: false, price: null, stock: null, note: "" };
  if (res.blockedByEnvironment) return { ...probe, note: NETWORK_UNAVAILABLE };
  if (res.status !== 200) return { ...probe, note: res.error ? `erreur : ${res.error}` : `HTTP ${res.status} : endpoint non exposé ou refusé` };
  const data = parseJsonSafe(res.body) as { products?: unknown } | undefined;
  const products = Array.isArray(data?.products) ? (data.products as Array<Record<string, unknown>>) : null;
  if (!products) return { ...probe, note: "réponse non JSON (probablement une page HTML)" };
  const first = products[0];
  if (!first) return { ...probe, ok: true, note: "JSON valide, 0 produit retourné" };
  const variants = Array.isArray(first.variants) ? (first.variants as Array<Record<string, unknown>>) : [];
  const variant = variants[0];
  const price = variant ? formatPrice(variant.price, null) : null;
  const available = variant && typeof variant.available === "boolean" ? (variant.available ? "disponible" : "indisponible") : null;
  return { ...probe, ok: true, price, stock: available, note: price ? "prix de variante retourné sans connexion" : "produit retourné sans prix" };
}

async function probeWoo(origin: string): Promise<ProbeResult> {
  const url = `${origin}${WOO_PROBE}`;
  const res = await politeFetch(url, "GET");
  const probe: ProbeResult = { name: "WooCommerce Store API", url, status: res.status, ok: false, price: null, stock: null, note: "" };
  if (res.blockedByEnvironment) return { ...probe, note: NETWORK_UNAVAILABLE };
  if (res.status !== 200) return { ...probe, note: res.error ? `erreur : ${res.error}` : `HTTP ${res.status} : endpoint non exposé ou refusé` };
  const data = parseJsonSafe(res.body);
  if (!Array.isArray(data)) return { ...probe, note: "réponse non JSON (probablement une page HTML)" };
  const first = data[0] as Record<string, unknown> | undefined;
  if (!first) return { ...probe, ok: true, note: "JSON valide, 0 produit retourné" };
  const prices = first.prices && typeof first.prices === "object" ? (first.prices as Record<string, unknown>) : null;
  let price: string | null = null;
  if (prices) {
    const minor = typeof prices.currency_minor_unit === "number" ? prices.currency_minor_unit : 2;
    const raw = typeof prices.price === "string" || typeof prices.price === "number" ? Number(prices.price) : NaN;
    if (Number.isFinite(raw)) price = `${(raw / 10 ** minor).toFixed(minor)} ${typeof prices.currency_code === "string" ? prices.currency_code : ""}`.trim();
  }
  const stock = typeof first.is_in_stock === "boolean" ? (first.is_in_stock ? "en stock" : "rupture") : null;
  return { ...probe, ok: true, price, stock, note: price ? "prix Store API retourné sans connexion" : "produit retourné sans prix" };
}

async function probeRss(href: string): Promise<{ probe: ProbeResult; items: number | null }> {
  const res = await politeFetch(href, "GET");
  const probe: ProbeResult = { name: "Flux RSS déclaré", url: href, status: res.status, ok: false, price: null, stock: null, note: "" };
  if (res.blockedByEnvironment) return { probe: { ...probe, note: NETWORK_UNAVAILABLE }, items: null };
  if (res.status !== 200) return { probe: { ...probe, note: res.error ? `erreur : ${res.error}` : `HTTP ${res.status}` }, items: null };
  const parser = new XMLParser({ ignoreAttributes: true });
  let xml: unknown;
  try {
    xml = parser.parse(res.body);
  } catch (err) {
    return { probe: { ...probe, note: `XML invalide : ${errorCode(err)}` }, items: null };
  }
  const root = (xml ?? {}) as Record<string, unknown>;
  const rss = root.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const feed = root.feed as Record<string, unknown> | undefined;
  const entries = channel?.item ?? feed?.entry;
  const items = Array.isArray(entries) ? entries.length : entries ? 1 : 0;
  return { probe: { ...probe, ok: true, note: `flux ${rss ? "RSS" : feed ? "Atom" : "XML"} valide, ${items} élément(s)` }, items };
}

// -----------------------------------------------------------------------------
// Vérification d'une source
// -----------------------------------------------------------------------------

async function verifySource(source: CatalogSource): Promise<SourceReport> {
  const report: SourceReport = {
    source,
    networkUnavailable: false,
    blocked: false,
    blockedReason: null,
    homepage: null,
    robots: null,
    signals: null,
    probes: [],
    priceObserved: null,
    stockObserved: null,
    rssValidated: null,
    notes: [],
  };

  // 1. HEAD (statut, URL finale, Server) puis GET (HTML). Le HEAD n'est pas déterminant : certains sites le refusent.
  const head = await politeFetch(source.url, "HEAD");
  if (head.blockedByEnvironment) {
    report.networkUnavailable = true;
    report.homepage = head;
    report.notes.push(`HEAD ${source.url} → 403 du proxy de sortie (${NETWORK_UNAVAILABLE})`);
    return report;
  }
  report.notes.push(`HEAD → ${head.status ?? `échec (${head.error})`}${head.redirects ? `, ${head.redirects} redirection(s)` : ""}`);
  const page = await politeFetch(source.url, "GET");
  report.homepage = page;
  if (page.blockedByEnvironment) {
    report.networkUnavailable = true;
    report.notes.push(`GET ${source.url} → 403 du proxy de sortie (${NETWORK_UNAVAILABLE})`);
    return report;
  }
  if (page.status === null) {
    report.notes.push(`GET ${source.url} → échec : ${page.error}`);
    return report;
  }
  const blockedReason = detectBlockedPage(page);
  if (blockedReason) {
    report.blocked = true;
    report.blockedReason = blockedReason;
    report.notes.push(`${ACCESS_REFUSED} (${blockedReason}) — aucune nouvelle tentative, aucune sonde`);
    return report;
  }

  // 2. robots.txt (sur l'origine finale, après redirections)
  const finalUrl = new URL(page.finalUrl);
  const origin = finalUrl.origin;
  const ownPath = finalUrl.pathname + finalUrl.search;
  const pathsToEvaluate = Array.from(new Set(["/", ...(ownPath !== "/" ? [ownPath] : []), ...TYPICAL_PATHS]));
  report.robots = await checkRobots(origin, pathsToEvaluate);
  if (report.robots.note === NETWORK_UNAVAILABLE) {
    report.networkUnavailable = true;
    return report;
  }
  const homeVerdict = report.robots.evaluations.find((e) => e.path === "/")?.bot ?? "no-rule";
  if (report.robots.parsed && homeVerdict === "disallow") report.notes.push(`robots.txt interdit « / » à ${BOT_TOKEN} : aucune sonde effectuée`);

  // 3. Signaux de plateforme
  const signals = detectSignals(page.body);
  report.signals = signals;
  if (signals.jsonLdPrice) report.priceObserved = `JSON-LD : ${signals.jsonLdPrice}`;

  // 4. Sondes publiques, uniquement si robots.txt autorise le chemin (robots absent = autorisé ; robots illisible = pas de sonde)
  const canProbe = report.robots.parsed || report.robots.absent;
  if (canProbe && homeVerdict !== "disallow") {
    if (signals.shopify && pathAllowed(report.robots, "/products.json")) {
      const probe = await probeShopify(origin);
      report.probes.push(probe);
      if (probe.price && !report.priceObserved) report.priceObserved = `Shopify : ${probe.price}`;
      if (probe.stock) report.stockObserved = `Shopify : ${probe.stock}`;
    } else if (signals.shopify) {
      report.notes.push("Shopify détecté mais /products.json interdit par robots.txt : sonde non effectuée");
    }
    if (signals.woocommerce && pathAllowed(report.robots, "/wp-json/wc/store/v1/products")) {
      const probe = await probeWoo(origin);
      report.probes.push(probe);
      if (probe.price && !report.priceObserved) report.priceObserved = `WooCommerce : ${probe.price}`;
      if (probe.stock) report.stockObserved = `WooCommerce : ${probe.stock}`;
    } else if (signals.woocommerce) {
      report.notes.push("WooCommerce détecté mais Store API interdite par robots.txt : sonde non effectuée");
    }
    if (signals.rssHref) {
      let rssUrl: URL | null = null;
      try {
        rssUrl = new URL(signals.rssHref, page.finalUrl);
      } catch {
        rssUrl = null;
      }
      if (rssUrl && rssUrl.host === finalUrl.host && pathAllowed(report.robots, rssUrl.pathname + rssUrl.search)) {
        const { probe, items } = await probeRss(rssUrl.toString());
        report.probes.push(probe);
        if (probe.ok && items !== null) report.rssValidated = { items };
      } else if (rssUrl) {
        report.notes.push(`flux RSS déclaré (${rssUrl.toString()}) non sondé (hôte différent ou interdit par robots.txt)`);
      }
    }
  }
  return report;
}

// -----------------------------------------------------------------------------
// Rapport Markdown
// -----------------------------------------------------------------------------

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function tableLine(cells: readonly string[]): string {
  return `| ${cells.map(cell).join(" | ")} |`;
}

function platformLabel(signals: PlatformSignals | null): string {
  if (!signals) return "";
  const parts: string[] = [];
  if (signals.shopify) parts.push("Shopify");
  if (signals.woocommerce) parts.push("WooCommerce");
  if (signals.jsonLdProducts > 0) parts.push(`JSON-LD Product ×${signals.jsonLdProducts}`);
  if (signals.rssHref) parts.push("RSS déclaré");
  return parts.join(", ");
}

function observedRow(r: SourceReport): string[] {
  const s = r.source;
  const fromCatalog = (label: string): string => `${label} (catalogue)`;
  const base = [s.name, s.url, s.category.join(", "), s.country];
  const accountCol = fromCatalog(labelAccountRequired(s.accountRequired));
  const apiCol = fromCatalog(labelYesNoUnknown(s.api));
  const methodCol = `\`${s.integrationMethod}\``;

  if (r.networkUnavailable) {
    return [...base, NETWORK_UNAVAILABLE, accountCol, apiCol, NETWORK_UNAVAILABLE, NETWORK_UNAVAILABLE, NETWORK_UNAVAILABLE, methodCol, NETWORK_UNAVAILABLE];
  }
  if (r.blocked) {
    return [...base, ACCESS_REFUSED, accountCol, apiCol, ACCESS_REFUSED, ACCESS_REFUSED, ACCESS_REFUSED, methodCol, `${ACCESS_REFUSED} (${r.blockedReason})`];
  }
  if (!r.homepage || r.homepage.status === null) {
    const err = `Injoignable (${r.homepage?.error ?? "erreur inconnue"})`;
    return [...base, err, accountCol, apiCol, err, err, err, methodCol, err];
  }

  const priceCol = r.priceObserved ? `Oui — ${r.priceObserved}` : `Non observé · catalogue : ${labelPricePublic(s.pricePublic)}`;
  const feedCol = r.rssValidated ? `RSS valide (${r.rssValidated.items} élément(s)) · catalogue : ${labelYesNoUnknown(s.feed)}` : fromCatalog(labelYesNoUnknown(s.feed));
  const stockCol = r.stockObserved ? `Oui — ${r.stockObserved}` : `Non observé · catalogue : ${labelYesNoUnknown(s.stockVisible)}`;

  let robotsCol: string;
  const robots = r.robots;
  if (!robots || (!robots.parsed && !robots.absent)) robotsCol = `robots.txt illisible (${robots?.note ?? "non lu"})`;
  else if (robots.absent) robotsCol = "robots.txt absent";
  else {
    const disallowed = robots.evaluations.filter((e) => e.bot === "disallow").map((e) => e.path);
    robotsCol = disallowed.length === 0 ? "robots.txt : aucun chemin testé interdit" : `robots.txt interdit : ${disallowed.join(", ")}`;
  }
  const automationCol = `${robotsCol} · CGU : ${labelAutomationAllowed(s.automationAllowed)}`;
  const platform = platformLabel(r.signals);
  const statusCol = `Joignable (HTTP ${r.homepage.status}${r.homepage.redirects ? `, ${r.homepage.redirects} redir.` : ""}${platform ? `, ${platform}` : ""})`;
  return [...base, priceCol, accountCol, apiCol, feedCol, stockCol, automationCol, methodCol, statusCol];
}

function detailSection(r: SourceReport): string {
  const s = r.source;
  const lines: string[] = [`### ${s.name} (\`${s.key}\`)`, "", `- URL officielle : ${s.url} (fiche ${s.docSection} de docs/sourcing-sources.md)`];
  if (r.homepage) {
    const h = r.homepage;
    lines.push(`- Page d'accueil (${h.method}) : statut ${h.status ?? "—"}, URL finale ${h.finalUrl}, redirections ${h.redirects}, Server « ${h.server ?? "—"} », durée ${h.durationMs} ms${h.error ? `, erreur ${h.error}` : ""}`);
  }
  if (r.networkUnavailable) {
    lines.push(`- Résultat : **${NETWORK_UNAVAILABLE}** — vérification non exécutée, à relancer avec \`npm run sources:verify\` depuis une machine connectée.`);
  } else if (r.blocked) {
    lines.push(`- Résultat : **${ACCESS_REFUSED}** (${r.blockedReason}). Aucune nouvelle tentative.`);
  }
  if (r.robots) {
    const rb = r.robots;
    lines.push(`- robots.txt : ${rb.url} → statut ${rb.status ?? "—"}${rb.note ? ` ; ${rb.note}` : ""}`);
    if (rb.parsed) {
      const fmt = (groups: RobotsGroup[]): string => {
        const rules = groups.flatMap((g) => g.rules).map((rule) => `${rule.allow ? "Allow" : "Disallow"}: ${rule.path || "(vide)"}`);
        return rules.length === 0 ? "aucune règle" : rules.slice(0, 25).join(" ; ") + (rules.length > 25 ? ` ; … (${rules.length} règles)` : "");
      };
      lines.push(`  - règles appliquées à ${BOT_TOKEN} : ${fmt(rb.groupsForBot)}`);
      lines.push(`  - règles « * » : ${fmt(rb.groupsForAll)}`);
    }
    if (rb.evaluations.length > 0) {
      lines.push("", "  | Chemin | MonStockBot | * |", "  |---|---|---|");
      for (const e of rb.evaluations) lines.push(`  | \`${e.path}\` | ${e.bot} | ${e.all} |`);
      lines.push("");
    }
  }
  if (r.signals) {
    const sg = r.signals;
    lines.push(`- Signaux : Shopify ${sg.shopify ? "oui" : "non"} ; WooCommerce ${sg.woocommerce ? "oui" : "non"} ; JSON-LD Product ${sg.jsonLdProducts}${sg.jsonLdPrice ? ` (prix ${sg.jsonLdPrice})` : ""} ; RSS ${sg.rssHref ?? "non"}`);
  }
  for (const p of r.probes) lines.push(`- Sonde ${p.name} : ${p.url} → statut ${p.status ?? "—"}, ${p.note}${p.price ? ` ; prix ${p.price}` : ""}${p.stock ? ` ; disponibilité ${p.stock}` : ""}`);
  if (r.priceObserved) lines.push(`- **Prix visible sans connexion : oui** (${r.priceObserved})`);
  else if (!r.networkUnavailable && !r.blocked) lines.push("- Prix visible sans connexion : non observé (aucun prix JSON-LD / Shopify / Woo retourné)");
  for (const n of r.notes) lines.push(`- Note : ${n}`);
  lines.push(`- Fiche (catalogue, extraits officiels du 2026-10-07) : ${s.verification.notes}`);
  if (s.termsNote) lines.push(`- CGU (catalogue) : ${s.termsNote}`);
  return lines.join("\n");
}

function buildMarkdown(reports: SourceReport[], startedAt: Date, allNetworkUnavailable: boolean): string {
  const counts = {
    total: reports.length,
    reachable: reports.filter((r) => !r.networkUnavailable && !r.blocked && r.homepage?.status !== null && r.homepage !== null).length,
    blocked: reports.filter((r) => r.blocked).length,
    network: reports.filter((r) => r.networkUnavailable).length,
    unreachable: reports.filter((r) => !r.networkUnavailable && !r.blocked && (!r.homepage || r.homepage.status === null)).length,
    price: reports.filter((r) => r.priceObserved).length,
    stock: reports.filter((r) => r.stockObserved).length,
    shopify: reports.filter((r) => r.signals?.shopify).length,
    woo: reports.filter((r) => r.signals?.woocommerce).length,
    jsonld: reports.filter((r) => (r.signals?.jsonLdProducts ?? 0) > 0).length,
    rss: reports.filter((r) => r.rssValidated).length,
    robotsDisallowHome: reports.filter((r) => r.robots?.parsed && r.robots.evaluations.some((e) => e.path === "/" && e.bot === "disallow")).length,
    robotsDisallowAny: reports.filter((r) => r.robots?.parsed && r.robots.evaluations.some((e) => e.bot === "disallow")).length,
  };

  const out: string[] = ["# Vérification HTTP des sources d'approvisionnement — MON STOCK", ""];
  if (allNetworkUnavailable) {
    out.push(
      "> ⚠️ **VÉRIFICATION NON EXÉCUTÉE : réseau indisponible depuis cet environnement.**",
      ">",
      "> Toutes les requêtes sortantes ont été refusées par le proxy de sortie de l'environnement d'exécution",
      "> (réponse `403` « Host not in allowlist » avant d'atteindre le site). Aucune page, aucun `robots.txt` et",
      "> aucun point d'entrée public n'a pu être consulté : **aucune ligne ci-dessous ne constitue une observation**.",
      "> Les colonnes marquées « (catalogue) » reprennent uniquement les fiches issues des extraits officiels du 2026-10-07.",
      ">",
      "> **À faire** : relancer `npm run sources:verify` depuis une machine disposant d'un accès réseau, puis",
      "> relire le rapport avant toute décision d'intégration.",
      "",
    );
  } else if (counts.network > 0) {
    out.push(`> ⚠️ ${counts.network} source(s) n'ont pas pu être vérifiées (${NETWORK_UNAVAILABLE}). Relancer \`npm run sources:verify\` depuis une machine connectée.`, "");
  }
  out.push(
    `- Exécuté le : ${startedAt.toISOString()}`,
    `- User-Agent : \`${USER_AGENT}\` (jeton robots.txt : \`${BOT_TOKEN}\`)`,
    `- Politesse : ${PER_HOST_DELAY_MS / 1000} s minimum entre deux requêtes par hôte, délai d'attente ${TIMEOUT_MS / 1000} s, ${MAX_REDIRECTS} redirections max, aucune nouvelle tentative, aucun identifiant, aucun contournement.`,
    `- Sondes publiques : \`${SHOPIFY_PROBE}\` (si Shopify détecté) et \`${WOO_PROBE}\` (si WooCommerce détecté), uniquement lorsque robots.txt autorise le chemin.`,
    "- « Prix visible sans connexion » n'est noté **Oui** que si un prix JSON-LD / Shopify / WooCommerce a réellement été retourné.",
    "- Source des colonnes « (catalogue) » : `src/integrations/sourcing/catalog.ts` (non observable par une sonde HTTP : compte, API, méthode d'intégration).",
    "",
    "## Tableau de vérification",
    "",
    tableLine(CATALOG_TABLE_COLUMNS),
    `|${CATALOG_TABLE_COLUMNS.map(() => "---").join("|")}|`,
  );
  for (const r of reports) out.push(tableLine(observedRow(r)));
  out.push("", "## Détail par source", "");
  for (const r of reports) out.push(detailSection(r), "");
  out.push(
    "## Comptage",
    "",
    `- Sources vérifiées : ${counts.total}`,
    `- Joignables (page d'accueil lue) : ${counts.reachable}`,
    `- Accès automatisé refusé (403/429/anti-bot) : ${counts.blocked}`,
    `- Injoignables (DNS, délai, erreur de connexion) : ${counts.unreachable}`,
    `- Réseau indisponible depuis cet environnement : ${counts.network}`,
    `- Prix observé sans connexion (JSON-LD / Shopify / Woo) : ${counts.price}`,
    `- Disponibilité observée sans connexion : ${counts.stock}`,
    `- Signaux : Shopify ${counts.shopify} · WooCommerce ${counts.woo} · JSON-LD Product ${counts.jsonld} · flux RSS valide ${counts.rss}`,
    `- robots.txt interdisant « / » à ${BOT_TOKEN} : ${counts.robotsDisallowHome} · interdisant au moins un chemin testé : ${counts.robotsDisallowAny}`,
    "",
    "## Tableau de référence (catalogue, extraits officiels du 2026-10-07)",
    "",
    tableLine(CATALOG_TABLE_COLUMNS),
    `|${CATALOG_TABLE_COLUMNS.map(() => "---").join("|")}|`,
  );
  for (const r of reports) out.push(tableLine(catalogTableRow(r.source)));
  out.push("");
  return out.join("\n");
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function usage(): never {
  console.error("Usage : npx tsx scripts/verify-sources.ts [--key <key>] [--out <fichier.md>] [--no-preflight]");
  console.error(`Clés disponibles : ${listCatalogSources()
    .map((s) => s.key)
    .join(", ")}`);
  process.exit(2);
}

/** Deux hôtes distincts sondés en HEAD : si tous échouent (proxy de sortie / connexion), le réseau est considéré indisponible. */
async function preflight(sources: readonly CatalogSource[]): Promise<{ unavailable: boolean; details: string[] }> {
  const hosts = new Set<string>();
  const picked: CatalogSource[] = [];
  for (const s of sources) {
    const host = new URL(s.url).host;
    if (hosts.has(host)) continue;
    hosts.add(host);
    picked.push(s);
    if (picked.length === 2) break;
  }
  const details: string[] = [];
  let failures = 0;
  for (const s of picked) {
    const res = await politeFetch(s.url, "HEAD");
    const failed = res.blockedByEnvironment || res.connectionFailed;
    if (failed) failures += 1;
    details.push(`${s.url} → ${res.status ?? `échec (${res.error})`}${res.blockedByEnvironment ? " (403 du proxy de sortie)" : ""}`);
  }
  return { unavailable: picked.length > 0 && failures === picked.length, details };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? null) : null;
  };
  if (args.includes("--help") || args.includes("-h")) usage();
  const key = get("--key");
  const outPath = resolve(get("--out") ?? DEFAULT_OUT);
  const noPreflight = args.includes("--no-preflight");

  let sources: readonly CatalogSource[] = listCatalogSources();
  if (key) {
    const one = catalogSourceByKey(key);
    if (!one) {
      console.error(`Clé inconnue : ${key}`);
      usage();
    }
    sources = [one];
  }

  const startedAt = new Date();
  console.log(`MON STOCK — vérification de ${sources.length} source(s), User-Agent « ${USER_AGENT} », ${PER_HOST_DELAY_MS / 1000} s/hôte, délai ${TIMEOUT_MS / 1000} s`);

  let networkUnavailable = false;
  if (!noPreflight) {
    const pre = await preflight(sources);
    for (const d of pre.details) console.log(`  préflight : ${d}`);
    networkUnavailable = pre.unavailable;
    if (networkUnavailable) console.log(`  → ${NETWORK_UNAVAILABLE} : aucune requête supplémentaire, rapport marqué « non exécuté »`);
  }

  const reports: SourceReport[] = [];
  for (const [index, source] of sources.entries()) {
    const prefix = `[${index + 1}/${sources.length}] ${source.name}`;
    if (networkUnavailable) {
      reports.push({
        source,
        networkUnavailable: true,
        blocked: false,
        blockedReason: null,
        homepage: null,
        robots: null,
        signals: null,
        probes: [],
        priceObserved: null,
        stockObserved: null,
        rssValidated: null,
        notes: ["préflight : " + NETWORK_UNAVAILABLE + " (aucune requête envoyée à cette source)"],
      });
      console.log(`${prefix} → ${NETWORK_UNAVAILABLE}`);
      continue;
    }
    const report = await verifySource(source);
    reports.push(report);
    const row = observedRow(report);
    console.log(`${prefix} → ${row[11]} | prix : ${row[4]}`);
  }

  const allUnavailable = reports.length > 0 && reports.every((r) => r.networkUnavailable);
  const markdown = buildMarkdown(reports, startedAt, allUnavailable);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown, "utf8");
  console.log(`Rapport écrit : ${outPath}`);
  if (allUnavailable) console.log(`⚠️  ${NETWORK_UNAVAILABLE} — vérification NON exécutée, à relancer avec « npm run sources:verify » depuis une machine connectée.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
