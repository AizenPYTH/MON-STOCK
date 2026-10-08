import "server-only";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import type { SourceType, TaxType } from "@/db/types";
import type { OrgContext } from "@/features/auth/dal";
import { parseQuery, type ParsedQuery } from "@/domain/sourcing/query-parser";
import { normalizeText } from "@/domain/sourcing/normalizer";
import type { RawOffer } from "@/domain/sourcing/types";
import type { AccessLevel, AdapterRunContext, AdapterSearchResult, AdapterSourceConfig, RetrievalMethod, SourceAdapter } from "@/integrations/sourcing/core";
import { getSourceAdapter } from "@/integrations/sourcing/registry";
import { checkRobotsForUrls, type RobotsCheck } from "@/services/sourcing/crawler/robots";
import { adapterConfigFromSource, adapterKeyOf, hostOf, HostScheduler, withProvenance } from "@/services/sourcing/adapter-runtime";
import { storeOffer, type StorageContext } from "@/services/sourcing/offer-storage";
import { loadConnectionCredentials } from "@/services/sourcing/supplier-connectors";
import { recordCompletedSyncRun } from "@/services/sourcing/sync-runs";
import type { LiveSearchSummary, LiveSourceReport, LiveSourceStatus } from "@/services/sourcing/live-search.types";

const log = createLogger("LIVE_SEARCH");

/**
 * Pipeline de recherche en direct : requête → sources connectées → récupération (adaptateurs)
 * → normalisation / validation / stockage (OfferStorage) → identifiants d'offres pour la
 * comparaison. Chaque source produit un rapport honnête (statut, requêtes effectuées, durée).
 *
 * Garde-fous : attestation d'accès automatisé + robots.txt pour les pages / JSON publics,
 * identifiants chiffrés pour les comptes, 1 requête à la fois par hôte, ≥ 2 s entre deux
 * requêtes vers un même hôte, budget de temps par source, cache 10 min par (source, requête).
 */
export const LIVE_SEARCH_SOURCE_TYPES: readonly SourceType[] = ["PUBLIC_WEB", "API", "JSON", "XML", "CSV", "SUPPLIER_ACCOUNT"];
export const LIVE_SEARCH_CACHE_TTL_MS = 10 * 60_000;
export const LIVE_SEARCH_DEFAULT_TIMEOUT_MS = 8_000;
export const LIVE_SEARCH_MAX_SOURCES = 10;
export const LIVE_SEARCH_PARALLELISM = 10;
export const LIVE_SEARCH_PUBLIC_MIN_DELAY_MS = 2_000;
export const LIVE_SEARCH_ACCOUNT_MIN_DELAY_MS = 500;
/** reformulations « adapter_search » envoyées au plus à chaque source (dans le même budget de temps) */
export const LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE = 2;
/** budget minimal restant pour tenter une reformulation supplémentaire */
export const LIVE_SEARCH_MIN_VARIANT_BUDGET_MS = 1_000;

export interface LiveSearchInput {
  rawQuery: string;
  parsed: ParsedQuery;
  /** reformulations à envoyer aux adaptateurs (expandQuery → « adapter_search »), dans l'ordre de priorité ; défaut : rawQuery */
  variants?: string[];
  skuId?: string | null;
  maxSources?: number;
  timeoutMs?: number;
}

export interface LiveSearchVariant {
  text: string;
  parsed: ParsedQuery;
}

/**
 * Reformulations réellement envoyées à chaque source : au plus LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE,
 * dédupliquées (texte normalisé), la requête brute à défaut. Pur.
 */
export function liveSearchVariants(input: Pick<LiveSearchInput, "rawQuery" | "parsed" | "variants">, max = LIVE_SEARCH_MAX_VARIANTS_PER_SOURCE): LiveSearchVariant[] {
  const out: LiveSearchVariant[] = [];
  const seen = new Set<string>();
  for (const text of [...(input.variants ?? []), ...(input.variants && input.variants.length > 0 ? [] : [input.rawQuery])]) {
    const t = text.replace(/\s+/g, " ").trim();
    const key = normalizeText(t);
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t, parsed: t === input.rawQuery.trim() ? input.parsed : parseQuery(t) });
    if (out.length >= Math.max(1, max)) break;
  }
  if (out.length === 0) out.push({ text: input.rawQuery, parsed: input.parsed });
  return out;
}

export type LiveSearchContext = OrgContext | { organizationId: string; admin: AdminSupabaseClient; userId?: string | null };

/** Source candidate à la recherche en direct (chargée depuis la base, ou simulée dans les tests). */
export interface LiveSourceCandidate {
  sourceId: string;
  sourceName: string;
  supplierId: string;
  supplierName: string;
  sourceType: SourceType;
  adapter: SourceAdapter | null;
  adapterKey: string | null;
  config: AdapterSourceConfig;
  /** attestation d'accès automatisé (supplier_sources.automated_access_confirmed) */
  attested: boolean;
  /** connexion fournisseur (identifiants chiffrés) pour les adaptateurs « compte » */
  connectionId: string | null;
}

export interface LiveSearchableSource {
  sourceId: string;
  sourceName: string;
  supplierId: string;
  supplierName: string;
  sourceType: SourceType;
  adapterKey: string | null;
  adapterLabel: string | null;
  method: RetrievalMethod | null;
  access: AccessLevel | null;
  attested: boolean;
  attestationRequired: boolean;
  robotsAllowed: boolean | null;
  robotsCheckedAt: string | null;
  connectionId: string | null;
  verification: SourceAdapter["verification"] | null;
  /** vrai si une recherche en direct sera tentée sur cette source */
  searchable: boolean;
  /** statut attendu si non interrogeable (no_search / not_attested / account_required / robots_disallowed) */
  blockedBy: Exclude<LiveSourceStatus, "ok" | "cached" | "error" | "timeout" | "skipped"> | null;
  reason: string | null;
}

interface CacheEntry {
  at: number;
  report: LiveSourceReport;
  offerIds: string[];
}

export interface LiveSearchRuntime {
  userAgent: string;
  now: () => Date;
  fetchImpl?: typeof fetch;
  resolver?: AdapterRunContext["resolver"];
  sleep?: (ms: number) => Promise<void>;
  /** vérification robots.txt des URLs d'une source (null = non vérifiable → refus) */
  checkRobots: (candidate: LiveSourceCandidate, urls: string[]) => Promise<RobotsCheck>;
  loadCredentials: (connectionId: string) => Promise<Record<string, string> | null>;
  storeOffers: (candidate: LiveSourceCandidate, offers: RawOffer[], retrievedAt: Date) => Promise<{ offerIds: string[]; stored: number; rejected: number }>;
  recordRun: (candidate: LiveSourceCandidate, report: LiveSourceReport, startedAt: Date) => Promise<void>;
  /** mémorise les colonnes robots_* de la source */
  recordRobots?: (candidate: LiveSourceCandidate, robots: RobotsCheck) => Promise<void>;
  cache: Map<string, CacheEntry>;
  perSourceTimeoutMs: number;
  maxSources: number;
  parallelism: number;
  publicMinDelayMs: number;
  accountMinDelayMs: number;
}

const liveSearchCache = new Map<string, CacheEntry>();

/** Vide le cache (tests / administration). */
export function clearLiveSearchCache(): void {
  liveSearchCache.clear();
}

export function liveSearchCacheKey(sourceId: string, rawQuery: string): string {
  return `${sourceId}|${normalizeText(rawQuery)}`;
}

export function attestationRequired(method: RetrievalMethod): boolean {
  return method === "public_html" || method === "public_json";
}

function report(c: LiveSourceCandidate, status: LiveSourceStatus, message: string | null, extra: Partial<LiveSourceReport> = {}, now = new Date()): LiveSourceReport {
  return {
    sourceId: c.sourceId,
    sourceName: c.sourceName,
    supplierId: c.supplierId,
    supplierName: c.supplierName,
    adapterKey: c.adapterKey,
    method: c.adapter?.method ?? null,
    status,
    message,
    found: 0,
    stored: 0,
    rejected: 0,
    durationMs: 0,
    requests: [],
    queries: [],
    checkedAt: now.toISOString(),
    ...extra,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Décision préalable (sans requête réseau) : la source peut-elle être interrogée, et sinon pourquoi. */
export function preflight(c: LiveSourceCandidate): { ok: true } | { ok: false; status: LiveSearchableSource["blockedBy"] & LiveSourceStatus; message: string } {
  if (!c.adapter) return { ok: false, status: "no_search", message: "Aucun adaptateur associé à cette source : elle n'est pas interrogeable en direct (synchronisation de flux / crawl uniquement)." };
  if (!c.adapter.capabilities.search) return { ok: false, status: "no_search", message: `L'adaptateur « ${c.adapter.label} » ne propose pas de recherche en direct (catalogue synchronisé uniquement).` };
  if (c.adapter.access === "public" && attestationRequired(c.adapter.method) && !c.attested) return { ok: false, status: "not_attested", message: "Accès automatisé non attesté : confirmez que les conditions d'utilisation du site autorisent la lecture automatisée." };
  if (c.adapter.access === "account" && !c.connectionId) return { ok: false, status: "account_required", message: "Compte fournisseur requis : connectez vos identifiants pour interroger cette source." };
  return { ok: true };
}

async function querySource(c: LiveSourceCandidate, input: LiveSearchInput, rt: LiveSearchRuntime, scheduler: HostScheduler): Promise<LiveSourceReport> {
  const startedAt = rt.now();
  const t0 = Date.now();
  const pre = preflight(c);
  if (!pre.ok) return report(c, pre.status, pre.message, {}, startedAt);
  const adapter = c.adapter!;

  const key = liveSearchCacheKey(c.sourceId, input.rawQuery);
  const cached = rt.cache.get(key);
  if (cached && startedAt.getTime() - cached.at < LIVE_SEARCH_CACHE_TTL_MS) {
    return { ...cached.report, status: "cached", message: `Résultat récent réutilisé (interrogée il y a ${Math.round((startedAt.getTime() - cached.at) / 1000)} s).`, durationMs: 0, checkedAt: startedAt.toISOString() };
  }

  const variants = liveSearchVariants(input);
  let disallowedUrls: string[] = [];
  if (adapter.access === "public" && attestationRequired(adapter.method)) {
    const urls = Array.from(new Set(variants.flatMap((v) => adapter.urlsForQuery?.(c.config, v.parsed, v.text) ?? [])));
    if (urls.length === 0) return report(c, "no_search", "Aucune URL de recherche configurée pour cette source : recherche en direct impossible.", {}, startedAt);
    const robots = await rt.checkRobots(c, urls);
    if (rt.recordRobots) await rt.recordRobots(c, robots).catch((e: unknown) => log.warn("robots status not recorded", { sourceId: c.sourceId, error: e instanceof Error ? e.message : String(e) }));
    if (!robots.allowed) return report(c, "robots_disallowed", `robots.txt : ${robots.details}`, { durationMs: Date.now() - t0 }, startedAt);
    disallowedUrls = robots.disallowedUrls;
  }

  let credentials: Record<string, string> | undefined;
  if (adapter.access === "account") {
    const creds = await rt.loadCredentials(c.connectionId!);
    if (!creds || Object.keys(creds).length === 0) return report(c, "account_required", "Identifiants du compte fournisseur introuvables : reconnectez le compte.", {}, startedAt);
    credentials = creds;
  }

  const fetchImpl = scheduler.wrapFetch(rt.fetchImpl);
  // Reformulations successives dans UN SEUL budget de temps par source (perSourceTimeoutMs).
  const deadline = t0 + rt.perSourceTimeoutMs;
  const minVariantBudget = Math.min(LIVE_SEARCH_MIN_VARIANT_BUDGET_MS, rt.perSourceTimeoutMs / 4);
  const collected: Array<{ offer: RawOffer; requestUrl: string | null }> = [];
  const seenOfferIds = new Set<string>();
  const requests: AdapterSearchResult["requests"] = [];
  const errors: string[] = [];
  const sent: string[] = [];
  let method: RetrievalMethod = adapter.method;
  let truncated = false;
  let firstVariantFailed = false;
  for (const [i, v] of variants.entries()) {
    const remaining = deadline - Date.now();
    if (i > 0) {
      // pas d'insistance après un échec, ni hors budget
      if (firstVariantFailed) break;
      if (remaining < minVariantBudget) {
        truncated = true;
        break;
      }
    }
    sent.push(v.text);
    const ctx: AdapterRunContext = {
      userAgent: rt.userAgent,
      fetchImpl,
      resolver: rt.resolver,
      sleep: rt.sleep,
      credentials,
      minDelayMs: adapter.access === "public" ? rt.publicMinDelayMs : rt.accountMinDelayMs,
      timeoutMs: Math.max(1, remaining),
      disallowedUrls,
      now: rt.now,
    };
    let result: AdapterSearchResult | "timeout";
    try {
      result = await withTimeout(adapter.search(c.config, v.parsed, v.text, ctx), Math.max(1, remaining) + 500);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (i === 0) {
        const r = report(c, "error", message, { durationMs: Date.now() - t0, queries: sent }, startedAt);
        await rt.recordRun(c, r, startedAt);
        return r;
      }
      errors.push(`reformulation « ${v.text} » : ${message}`);
      break;
    }
    if (result === "timeout") {
      if (i === 0) {
        const r = report(c, "timeout", `Délai dépassé (${Math.round(rt.perSourceTimeoutMs / 1000)} s) : la source n'a pas répondu à temps.`, { durationMs: Date.now() - t0, queries: sent }, startedAt);
        await rt.recordRun(c, r, startedAt);
        return r;
      }
      truncated = true;
      errors.push(`reformulation « ${v.text} » interrompue : budget de ${Math.round(rt.perSourceTimeoutMs / 1000)} s atteint`);
      break;
    }
    method = result.method;
    requests.push(...result.requests);
    truncated = truncated || result.truncated;
    if (result.error) {
      errors.push(result.error);
      if (i === 0 && result.offers.length === 0) firstVariantFailed = true;
    }
    const requestUrl = result.requests.find((q) => q.offers > 0)?.url ?? result.requests[0]?.url ?? null;
    for (const o of result.offers) {
      if (seenOfferIds.has(o.externalOfferId)) continue;
      seenOfferIds.add(o.externalOfferId);
      collected.push({ offer: o, requestUrl });
    }
  }
  if (firstVariantFailed && collected.length === 0) {
    const r = report(c, "error", errors.join(" · "), { durationMs: Date.now() - t0, requests, queries: sent }, startedAt);
    await rt.recordRun(c, r, startedAt);
    return r;
  }

  const retrievedAt = rt.now();
  const traced = collected.map(({ offer: o, requestUrl }) => withProvenance(o, { adapterKey: adapter.key, method, retrievedAt: retrievedAt.toISOString(), requestUrl, sourceUrl: o.url ?? null }));
  let stored = 0;
  let rejected = 0;
  let offerIds: string[] = [];
  let storeError: string | null = null;
  try {
    const s = await rt.storeOffers(c, traced, retrievedAt);
    stored = s.stored;
    rejected = s.rejected;
    offerIds = s.offerIds;
  } catch (e) {
    storeError = e instanceof Error ? e.message : String(e);
  }
  const messageParts = [`${collected.length} offre(s) trouvée(s), ${stored} enregistrée(s), ${rejected} rejetée(s)`];
  if (sent.length > 1) messageParts.push(`${sent.length} reformulations`);
  if (truncated) messageParts.push("résultat partiel (limite de pages ou de temps atteinte)");
  for (const err of errors) messageParts.push(err);
  if (storeError) messageParts.push(`enregistrement : ${storeError}`);
  const r = report(c, storeError && stored === 0 ? "error" : "ok", `${messageParts.join(" · ")}.`, { found: collected.length, stored, rejected, durationMs: Date.now() - t0, requests, queries: sent }, startedAt);
  await rt.recordRun(c, r, startedAt);
  rt.cache.set(key, { at: retrievedAt.getTime(), report: r, offerIds });
  return r;
}

/** Orchestration pure (injectable) : utilisée par runLiveSearch et par les tests avec des adaptateurs simulés. */
export async function executeLiveSearch(candidates: LiveSourceCandidate[], input: LiveSearchInput, rt: LiveSearchRuntime): Promise<LiveSearchSummary> {
  const startedAt = rt.now();
  const scheduler = new HostScheduler(rt.publicMinDelayMs, rt.sleep);
  const reports: LiveSourceReport[] = new Array(candidates.length);
  const offerIds = new Set<string>();
  const maxSources = Math.max(0, input.maxSources ?? rt.maxSources);

  const queue = candidates.map((c, index) => ({ c, index }));
  const runOne = async ({ c, index }: { c: LiveSourceCandidate; index: number }) => {
    const pre = preflight(c);
    if (!pre.ok) {
      reports[index] = report(c, pre.status, pre.message, {}, rt.now());
      return;
    }
    if (index >= maxSources) {
      reports[index] = report(c, "skipped", `Hors budget : au plus ${maxSources} source(s) interrogée(s) par recherche.`, {}, rt.now());
      return;
    }
    try {
      reports[index] = await querySource(c, input, rt, scheduler);
    } catch (e) {
      reports[index] = report(c, "error", e instanceof Error ? e.message : String(e), {}, rt.now());
    }
    const entry = rt.cache.get(liveSearchCacheKey(c.sourceId, input.rawQuery));
    if (entry && (reports[index]!.status === "ok" || reports[index]!.status === "cached")) for (const id of entry.offerIds) offerIds.add(id);
  };
  // Hôtes différents en parallèle (borné) ; le planificateur sérialise les requêtes d'un même hôte.
  const workers = Array.from({ length: Math.max(1, Math.min(rt.parallelism, queue.length)) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await runOne(next);
    }
  });
  await Promise.all(workers);

  const finishedAt = rt.now();
  const queried = reports.filter((r) => r.status === "ok" || r.status === "error" || r.status === "timeout").length;
  return {
    query: input.rawQuery,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    sources: reports,
    queried,
    found: reports.reduce((a, r) => a + r.found, 0),
    stored: reports.reduce((a, r) => a + r.stored, 0),
    offerIds: Array.from(offerIds),
  };
}

// ---------------------------------------------------------------------------
// Chargement des sources depuis la base
// ---------------------------------------------------------------------------
function resolveContext(ctx: LiveSearchContext): { organizationId: string; admin: AdminSupabaseClient; userId: string | null } {
  if ("organization" in ctx) return { organizationId: ctx.organization.id, admin: createAdminSupabaseClient(), userId: ctx.user.id };
  return { organizationId: ctx.organizationId, admin: ctx.admin, userId: ctx.userId ?? null };
}

interface LoadedSource {
  candidate: LiveSourceCandidate;
  organizationCurrency: string;
  defaultCurrency: string | null;
  defaultTaxType: TaxType;
  defaultCountry: string | null;
  robotsAllowed: boolean | null;
  robotsCheckedAt: string | null;
}

/** Crée (si absente) la source SUPPLIER_ACCOUNT qui porte les offres d'une connexion fournisseur. */
async function ensureConnectionSource(admin: AdminSupabaseClient, organizationId: string, connection: { id: string; supplier_id: string; source_id: string | null; connector_key: string }, adapterLabel: string): Promise<string | null> {
  if (connection.source_id) return connection.source_id;
  const { data, error } = await admin
    .from("supplier_sources")
    .insert({ organization_id: organizationId, supplier_id: connection.supplier_id, name: adapterLabel, source_type: "SUPPLIER_ACCOUNT", automated_access_confirmed: true, access_conditions: "Compte fournisseur connecté par le vendeur (API officielle, identifiants chiffrés).", status: "active", sync_frequency: "manual", config: { adapter: connection.connector_key } as unknown as NonNullable<Json> })
    .select("id")
    .single();
  if (error || !data) {
    log.warn("connection source not created", { connectionId: connection.id, error: error?.message });
    return null;
  }
  await admin.from("supplier_connections").update({ source_id: data.id }).eq("id", connection.id);
  return data.id;
}

async function loadCandidates(admin: AdminSupabaseClient, organizationId: string): Promise<LoadedSource[]> {
  const [{ data: org }, { data: sources }, { data: connections }] = await Promise.all([
    admin.from("organizations").select("default_currency").eq("id", organizationId).maybeSingle(),
    admin.from("supplier_sources").select("*, supplier:suppliers(id, name, is_archived)").eq("organization_id", organizationId).neq("status", "paused").in("source_type", [...LIVE_SEARCH_SOURCE_TYPES]).order("created_at").limit(100),
    admin.from("supplier_connections").select("id, supplier_id, source_id, connector_key, status").eq("organization_id", organizationId).neq("status", "disconnected").limit(50),
  ]);
  const organizationCurrency = org?.default_currency ?? "EUR";
  const bySource = new Map((sources ?? []).map((s) => [s.id, s] as const));
  const connectionBySource = new Map<string, { id: string; connector_key: string }>();
  const out: LoadedSource[] = [];

  for (const conn of connections ?? []) {
    const adapter = getSourceAdapter(conn.connector_key);
    if (!adapter || adapter.access !== "account") continue;
    let sourceId = conn.source_id && bySource.has(conn.source_id) ? conn.source_id : null;
    if (!sourceId) {
      sourceId = await ensureConnectionSource(admin, organizationId, { ...conn, source_id: conn.source_id && bySource.has(conn.source_id) ? conn.source_id : null }, adapter.label);
      if (!sourceId) continue;
      if (!bySource.has(sourceId)) {
        const { data: created } = await admin.from("supplier_sources").select("*, supplier:suppliers(id, name, is_archived)").eq("id", sourceId).maybeSingle();
        if (created) bySource.set(created.id, created);
      }
    }
    connectionBySource.set(sourceId, { id: conn.id, connector_key: conn.connector_key });
  }

  for (const s of bySource.values()) {
    if (s.supplier?.is_archived) continue;
    // source découverte non validée : jamais interrogée (elle figure dans « Découvertes — à valider »)
    if (isUnvalidatedDiscovered(s.config, s.automated_access_confirmed)) continue;
    const connection = connectionBySource.get(s.id) ?? null;
    const adapterKey = connection?.connector_key ?? adapterKeyOf(s.config);
    const adapter = getSourceAdapter(adapterKey);
    out.push({
      candidate: {
        sourceId: s.id,
        sourceName: s.name,
        supplierId: s.supplier_id,
        supplierName: s.supplier?.name ?? "Fournisseur",
        sourceType: s.source_type,
        adapter,
        adapterKey: adapter ? adapter.key : adapterKey,
        config: adapterConfigFromSource({ base_url: s.base_url, config: s.config, default_currency: s.default_currency, default_tax_type: s.default_tax_type, country: s.country }),
        attested: s.automated_access_confirmed,
        connectionId: connection?.id ?? null,
      },
      organizationCurrency,
      defaultCurrency: s.default_currency,
      defaultTaxType: s.default_tax_type,
      defaultCountry: s.country,
      robotsAllowed: s.robots_allowed,
      robotsCheckedAt: s.robots_checked_at,
    });
  }
  return out;
}

/** Source découverte automatiquement et pas encore validée (attestation) par l'utilisateur. */
export function isUnvalidatedDiscovered(config: Json | null | undefined, attested: boolean): boolean {
  const c = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  return c.discovered === true && !attested;
}

/** Sources de l'organisation et leur interrogeabilité en direct (pour l'interface). */
export async function listLiveSearchableSources(ctx: LiveSearchContext): Promise<LiveSearchableSource[]> {
  const { admin, organizationId } = resolveContext(ctx);
  const loaded = await loadCandidates(admin, organizationId);
  return loaded.map(({ candidate: c, robotsAllowed, robotsCheckedAt }) => {
    const pre = preflight(c);
    const robotsBlocked = pre.ok && c.adapter?.access === "public" && attestationRequired(c.adapter.method) && robotsAllowed === false;
    const blockedBy: LiveSearchableSource["blockedBy"] = !pre.ok ? pre.status : robotsBlocked ? "robots_disallowed" : null;
    return {
      sourceId: c.sourceId,
      sourceName: c.sourceName,
      supplierId: c.supplierId,
      supplierName: c.supplierName,
      sourceType: c.sourceType,
      adapterKey: c.adapterKey,
      adapterLabel: c.adapter?.label ?? null,
      method: c.adapter?.method ?? null,
      access: c.adapter?.access ?? null,
      attested: c.attested,
      attestationRequired: c.adapter ? c.adapter.access === "public" && attestationRequired(c.adapter.method) : false,
      robotsAllowed,
      robotsCheckedAt,
      connectionId: c.connectionId,
      verification: c.adapter?.verification ?? null,
      searchable: pre.ok && !robotsBlocked,
      blockedBy,
      reason: !pre.ok ? pre.message : robotsBlocked ? "robots.txt interdit les URLs de recherche (dernière vérification)." : null,
    };
  });
}

export async function runLiveSearch(ctx: LiveSearchContext, input: LiveSearchInput, overrides: Partial<Pick<LiveSearchRuntime, "fetchImpl" | "resolver" | "sleep" | "now" | "cache">> = {}): Promise<LiveSearchSummary> {
  const { admin, organizationId, userId } = resolveContext(ctx);
  const userAgent = serverEnv().SOURCING_USER_AGENT;
  const now = overrides.now ?? (() => new Date());
  const loaded = await loadCandidates(admin, organizationId);
  const bySourceId = new Map(loaded.map((l) => [l.candidate.sourceId, l] as const));
  const fetchImpl = overrides.fetchImpl ?? fetch;

  const runtime: LiveSearchRuntime = {
    userAgent,
    now,
    fetchImpl,
    resolver: overrides.resolver,
    sleep: overrides.sleep,
    cache: overrides.cache ?? liveSearchCache,
    perSourceTimeoutMs: input.timeoutMs ?? LIVE_SEARCH_DEFAULT_TIMEOUT_MS,
    maxSources: input.maxSources ?? LIVE_SEARCH_MAX_SOURCES,
    parallelism: LIVE_SEARCH_PARALLELISM,
    publicMinDelayMs: LIVE_SEARCH_PUBLIC_MIN_DELAY_MS,
    accountMinDelayMs: LIVE_SEARCH_ACCOUNT_MIN_DELAY_MS,
    checkRobots: (c, urls) => checkRobotsForUrls(c.config.baseUrl ?? urls[0]!, urls, userAgent, fetchImpl),
    recordRobots: async (c, robots) => {
      await admin.from("supplier_sources").update({ robots_checked_at: now().toISOString(), robots_allowed: robots.allowed, ...(robots.crawlDelay !== null ? { crawl_delay_seconds: Math.ceil(robots.crawlDelay) } : {}) }).eq("id", c.sourceId);
    },
    loadCredentials: (connectionId) => loadConnectionCredentials(connectionId),
    storeOffers: async (c, offers, retrievedAt) => {
      const l = bySourceId.get(c.sourceId);
      const storage: StorageContext = {
        supabase: admin,
        organizationId,
        organizationCurrency: l?.organizationCurrency ?? "EUR",
        supplierId: c.supplierId,
        sourceId: c.sourceId,
        sourceType: c.sourceType,
        defaultCurrency: l?.defaultCurrency ?? c.config.defaultCurrency,
        defaultTaxType: l?.defaultTaxType ?? c.config.defaultTaxType,
        defaultCountry: l?.defaultCountry ?? c.config.defaultCountry,
        createdBy: userId,
        now: retrievedAt,
      };
      const offerIds: string[] = [];
      let stored = 0;
      let rejected = 0;
      for (const offer of offers) {
        try {
          const r = await storeOffer(storage, offer);
          if (r.outcome === "stored" && r.offerId) {
            stored++;
            offerIds.push(r.offerId);
          } else rejected++;
        } catch (e) {
          rejected++;
          log.warn("live offer not stored", { sourceId: c.sourceId, externalOfferId: offer.externalOfferId, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (stored > 0) await admin.from("supplier_sources").update({ status: "active", last_sync_at: retrievedAt.toISOString(), last_successful_sync_at: now().toISOString(), last_error: null }).eq("id", c.sourceId);
      return { offerIds, stored, rejected };
    },
    recordRun: async (c, r, startedAt) => {
      const status = r.status === "ok" ? (r.rejected > 0 || r.requests.some((q) => q.error) ? "partial" : "success") : "failed";
      await recordCompletedSyncRun(admin, {
        organizationId,
        sourceKind: c.connectionId ? "supplier_connection" : "supplier_source",
        sourceRef: c.connectionId ?? c.sourceId,
        provider: c.adapterKey ?? "live_search",
        trigger: "manual",
        status,
        startedAt,
        finishedAt: now(),
        recordsProcessed: r.found,
        errorCount: r.status === "ok" ? r.rejected + r.requests.filter((q) => q.error).length : 1,
        stats: { kind: "live_search", query: input.rawQuery, skuId: input.skuId ?? null, status: r.status, found: r.found, stored: r.stored, rejected: r.rejected, requests: r.requests, method: r.method, adapter: r.adapterKey } as unknown as NonNullable<Json>,
        errorSummary: r.status === "ok" ? null : r.message,
        createdBy: userId,
      });
      if (r.status !== "ok" && r.status !== "cached") await admin.from("supplier_sources").update({ last_sync_at: startedAt.toISOString(), last_error: r.message }).eq("id", c.sourceId);
      if (c.connectionId) await admin.from("supplier_connections").update({ last_sync_at: startedAt.toISOString(), last_error: r.status === "ok" ? null : r.message, ...(r.status === "ok" ? { status: "connected" } : {}) }).eq("id", c.connectionId);
    },
  };

  const summary = await executeLiveSearch(
    loaded.map((l) => l.candidate),
    input,
    runtime,
  );
  log.info("live search finished", { organizationId, query: input.rawQuery, queried: summary.queried, found: summary.found, stored: summary.stored, durationMs: summary.durationMs });
  return summary;
}

export { hostOf };
