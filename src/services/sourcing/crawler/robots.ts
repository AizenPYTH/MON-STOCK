/**
 * robots.txt : récupération et interprétation pour notre User-Agent.
 * Règles : groupe le plus spécifique (token de notre UA, sinon *), motif le plus long
 * l'emporte, Allow prioritaire à longueur égale, support de * et $.
 * Une interdiction est respectée sans exception.
 */
export interface RobotsGroup {
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay: number | null;
}

export interface RobotsRules {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export interface RobotsDecision {
  allowed: boolean;
  crawlDelay: number | null;
  matchedAgent: string | null;
  rule: string | null;
}

export function parseRobotsTxt(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === "allow") current.allow.push(value);
    else if (key === "disallow") current.disallow.push(value);
    else if (key === "crawl-delay") {
      const n = Number(value.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return { groups, sitemaps };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Token produit de notre User-Agent : « MonStockBot/0.1 (+https://…) » → « monstockbot ». */
export function userAgentToken(userAgent: string): string {
  return (userAgent.split(/[\s/]/)[0] ?? userAgent).toLowerCase();
}

export function selectGroup(rules: RobotsRules, userAgent: string): RobotsGroup | null {
  const token = userAgentToken(userAgent);
  let best: RobotsGroup | null = null;
  let bestLen = -1;
  for (const g of rules.groups) {
    for (const a of g.agents) {
      if (a !== "*" && token.startsWith(a) && a.length > bestLen) {
        best = g;
        bestLen = a.length;
      }
    }
  }
  if (best) return best;
  return rules.groups.find((g) => g.agents.includes("*")) ?? null;
}

export function evaluateRobots(rules: RobotsRules, userAgent: string, path: string): RobotsDecision {
  const group = selectGroup(rules, userAgent);
  if (!group) return { allowed: true, crawlDelay: null, matchedAgent: null, rule: null };
  const p = path.startsWith("/") ? path : `/${path}`;
  let bestLen = -1;
  let allowed = true;
  let rule: string | null = null;
  const consider = (patterns: string[], isAllow: boolean) => {
    for (const pat of patterns) {
      if (pat === "") continue;
      if (!patternToRegex(pat).test(p)) continue;
      const len = pat.length;
      if (len > bestLen || (len === bestLen && isAllow)) {
        bestLen = len;
        allowed = isAllow;
        rule = `${isAllow ? "Allow" : "Disallow"}: ${pat}`;
      }
    }
  };
  consider(group.disallow, false);
  consider(group.allow, true);
  return { allowed, crawlDelay: group.crawlDelay, matchedAgent: group.agents[0] ?? null, rule };
}

export interface RobotsFetchResult {
  status: "ok" | "missing" | "error";
  rules: RobotsRules;
  httpStatus: number | null;
  error: string | null;
}

export async function fetchRobots(baseUrl: string, userAgent: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<RobotsFetchResult> {
  const empty: RobotsRules = { groups: [], sitemaps: [] };
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return { status: "error", rules: empty, httpStatus: null, error: "URL de base invalide." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, { headers: { "User-Agent": userAgent, Accept: "text/plain" }, redirect: "follow", signal: controller.signal });
    if (res.status === 404 || res.status === 410) return { status: "missing", rules: empty, httpStatus: res.status, error: null };
    if (!res.ok) return { status: "error", rules: empty, httpStatus: res.status, error: `robots.txt inaccessible (HTTP ${res.status}).` };
    const text = await res.text();
    return { status: "ok", rules: parseRobotsTxt(text.slice(0, 512 * 1024)), httpStatus: res.status, error: null };
  } catch (e) {
    return { status: "error", rules: empty, httpStatus: null, error: e instanceof Error ? e.message : "Erreur réseau." };
  } finally {
    clearTimeout(timer);
  }
}

export interface RobotsCheck {
  /** vrai uniquement si toutes les URLs sont autorisées (ou robots.txt absent) */
  allowed: boolean;
  robotsStatus: RobotsFetchResult["status"];
  crawlDelay: number | null;
  disallowedUrls: string[];
  details: string;
}

export async function checkRobotsForUrls(baseUrl: string, urls: string[], userAgent: string, fetchImpl: typeof fetch = fetch): Promise<RobotsCheck> {
  const fetched = await fetchRobots(baseUrl, userAgent, fetchImpl);
  if (fetched.status === "error") {
    // Impossible de vérifier : on refuse par prudence (jamais de crawl à l'aveugle).
    return { allowed: false, robotsStatus: "error", crawlDelay: null, disallowedUrls: urls, details: fetched.error ?? "robots.txt inaccessible." };
  }
  if (fetched.status === "missing") {
    return { allowed: true, robotsStatus: "missing", crawlDelay: null, disallowedUrls: [], details: "Aucun robots.txt : aucune restriction déclarée (les CGU du site restent à vérifier)." };
  }
  const disallowed: string[] = [];
  let crawlDelay: number | null = null;
  for (const u of urls) {
    let path = "/";
    try {
      const parsed = new URL(u);
      path = parsed.pathname + parsed.search;
    } catch {
      disallowed.push(u);
      continue;
    }
    const d = evaluateRobots(fetched.rules, userAgent, path);
    if (d.crawlDelay !== null) crawlDelay = d.crawlDelay;
    if (!d.allowed) disallowed.push(u);
  }
  const group = selectGroup(fetched.rules, userAgent);
  const agent = group?.agents[0] ?? "*";
  return {
    allowed: disallowed.length === 0,
    robotsStatus: "ok",
    crawlDelay,
    disallowedUrls: disallowed,
    details: disallowed.length === 0 ? `robots.txt lu (groupe « ${agent} ») : toutes les URLs sont autorisées${crawlDelay !== null ? `, délai demandé ${crawlDelay} s` : ""}.` : `robots.txt (groupe « ${agent} ») interdit ${disallowed.length} URL(s) : le crawl est refusé.`,
  };
}
