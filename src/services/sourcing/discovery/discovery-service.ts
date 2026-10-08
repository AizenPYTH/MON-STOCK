import "server-only";
/**
 * DÉCOUVERTE DE SOURCES — trouve des fournisseurs B2B que l'organisation ne connaît pas encore.
 *
 *   ParsedQuery → expandQuery (useFor « discovery ») → API de recherche web officielle
 *   → tri des résultats (exclusions, indices B2B, un candidat par domaine)
 *   → dédoublonnage contre les fournisseurs / sources de l'organisation (domaine enregistrable)
 *   → sonde d'UNE page publique par candidat (robots.txt d'abord, anti-SSRF, jamais de contournement)
 *   → enregistrement de chaque NOUVEAU candidat : fournisseur + source PUBLIC_WEB
 *     « not_connected », automated_access_confirmed = FALSE, config.discovered = true.
 *
 * Garde-fous : aucune attestation des conditions d'utilisation n'est faite automatiquement.
 * La source est « Découverte — à valider » : la clé `config.adapter` n'est PAS renseignée
 * (seulement `suggested_adapter`), donc la recherche en direct ne l'interroge pas tant que
 * l'utilisateur ne l'a pas validée (attestation) dans l'interface.
 *
 * Le contrôle des droits (membre de l'organisation, rôle) incombe à l'appelant : ce service
 * utilise le client ADMIN et filtre TOUJOURS par organization_id.
 */
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/db/database.types";
import { serverEnv } from "@/lib/env";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { expandQuery } from "@/domain/sourcing/query-expansion";
import {
  ACCESS_LABEL,
  PRICE_VISIBILITY_LABEL,
  SUPPLIER_TYPE_LABEL,
  probeCandidate,
  registrableDomain,
  screenSearchResults,
  type AccessKind,
  type DetectedPlatform,
  type PriceVisibility,
  type ProbedCandidate,
  type RobotsVerdict,
  type SupplierType,
} from "@/services/sourcing/discovery/candidate-analyzer";
import { createWebSearchProvider, runDiscoverySearches, type DiscoverySearchRun, type WebSearchProvider } from "@/services/sourcing/discovery/web-search-providers";
import { createLogger } from "@/lib/logger";

const log = createLogger("SOURCING_DISCOVERY");

export const MAX_PROBED_CANDIDATES = 10;

export type DiscoveryCandidateStatus = "new" | "already_known" | "rejected" | "skipped";

export interface DiscoveryReportCandidate {
  domain: string;
  name: string;
  type: SupplierType;
  typeLabel: string;
  typeConfidence: number;
  platform: DetectedPlatform;
  access: AccessKind;
  accessLabel: string;
  priceVisibility: PriceVisibility;
  priceVisibilityLabel: string;
  robots: RobotsVerdict;
  suggestedAdapter: string | null;
  sampleUrl: string | null;
  query: string | null;
  status: DiscoveryCandidateStatus;
  reason: string;
  supplierId: string | null;
  sourceId: string | null;
}

export interface DiscoveryReport {
  enabled: boolean;
  provider: string | null;
  message: string;
  queries: Array<{ query: string; results: number; cached: boolean; error: string | null }>;
  candidates: DiscoveryReportCandidate[];
  counts: Record<DiscoveryCandidateStatus, number>;
  startedAt: string;
  finishedAt: string;
}

export interface DiscoveredSourceInput {
  candidate: ProbedCandidate;
  provider: string;
  discoveredAt: string;
}

/** Persistance (injectable pour les tests). */
export interface DiscoveryStore {
  /** domaines enregistrables déjà connus de l'organisation (fournisseurs et sources) */
  listKnownDomains(organizationId: string): Promise<Set<string>>;
  createDiscoveredSource(organizationId: string, input: DiscoveredSourceInput): Promise<{ supplierId: string; sourceId: string }>;
}

export interface DiscoveryContext {
  organizationId: string;
  store?: DiscoveryStore;
  /** fournisseur de recherche injecté ; null = désactivé ; absent = lu depuis l'environnement */
  provider?: WebSearchProvider | null;
  env?: Record<string, string | undefined>;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  resolver?: (host: string) => Promise<Array<{ address: string }>>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  maxCandidates?: number;
  /** délai entre deux appels à l'API de recherche (défaut : limite du fournisseur) */
  searchIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Store Supabase (client ADMIN, toujours filtré par organization_id)
// ---------------------------------------------------------------------------

function domainsFrom(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (!v || typeof v !== "string") continue;
    const d = registrableDomain(v);
    if (d) out.push(d);
    // sous-domaines B2B dédiés (ex. pro.backmarket.fr) conservés tels quels
    try {
      const host = new URL(v.includes("://") ? v : `https://${v}`).hostname.replace(/^www\d*\./, "");
      if (d && host !== d) out.push(host);
    } catch {
      // valeur non URL : seul le domaine enregistrable est retenu
    }
  }
  return out;
}

export function createSupabaseDiscoveryStore(supabase: AdminSupabaseClient): DiscoveryStore {
  return {
    async listKnownDomains(organizationId) {
      const [suppliers, sources] = await Promise.all([
        supabase.from("suppliers").select("website").eq("organization_id", organizationId),
        supabase.from("supplier_sources").select("base_url, config").eq("organization_id", organizationId),
      ]);
      if (suppliers.error) throw new Error(`Lecture des fournisseurs impossible : ${suppliers.error.message}`);
      if (sources.error) throw new Error(`Lecture des sources impossible : ${sources.error.message}`);
      const values: Array<string | null> = [];
      for (const s of suppliers.data ?? []) values.push(s.website);
      for (const s of sources.data ?? []) {
        values.push(s.base_url);
        const cfg = (s.config ?? {}) as Record<string, unknown>;
        if (typeof cfg.sample_url === "string") values.push(cfg.sample_url);
        if (Array.isArray(cfg.urls)) for (const u of cfg.urls) if (typeof u === "string") values.push(u);
      }
      return new Set(domainsFrom(values));
    },

    async createDiscoveredSource(organizationId, { candidate: c, provider, discoveredAt }) {
      const { data: supplier, error: supplierError } = await supabase
        .from("suppliers")
        .insert({
          organization_id: organizationId,
          name: c.name.slice(0, 200) || c.domain,
          website: c.origin,
          notes: `Découvert automatiquement (${provider}) pour la recherche « ${c.query.slice(0, 120)} ». Fournisseur non vérifié — à valider.`,
        })
        .select("id")
        .single();
      if (supplierError || !supplier) throw new Error(`Fournisseur non créé : ${supplierError?.message ?? "inconnu"}`);

      const config = {
        discovered: true,
        discovered_at: discoveredAt,
        discovered_via: provider,
        discovery_query: c.query,
        supplier_type: c.supplierType,
        supplier_type_confidence: c.typeConfidence,
        supplier_type_signals: c.signals,
        platform: c.platform,
        suggested_adapter: c.suggestedAdapter,
        access: c.access,
        access_label: ACCESS_LABEL[c.access],
        price_visibility: c.priceVisibility,
        robots_allowed: c.robots === "allowed" || c.robots === "missing" ? true : c.robots === "disallowed" ? false : null,
        robots_status: c.robots,
        robots_detail: c.robotsDetail,
        sample_url: c.sampleUrl,
        probe_signals: c.probeSignals,
        probe_error: c.probeError,
        validation: "pending",
      } as unknown as NonNullable<Json>;

      const robotsChecked = c.robots === "allowed" || c.robots === "missing" || c.robots === "disallowed";
      const { data: source, error: sourceError } = await supabase
        .from("supplier_sources")
        .insert({
          organization_id: organizationId,
          supplier_id: supplier.id,
          name: `${c.name.slice(0, 160)} — découverte à valider`,
          source_type: "PUBLIC_WEB",
          base_url: c.origin,
          status: "not_connected",
          automated_access_confirmed: false,
          robots_checked_at: robotsChecked ? discoveredAt : null,
          robots_allowed: robotsChecked ? c.robots !== "disallowed" : null,
          crawl_delay_seconds: c.crawlDelaySeconds !== null ? Math.ceil(c.crawlDelaySeconds) : null,
          config,
        })
        .select("id")
        .single();
      if (sourceError || !source) {
        // pas de fournisseur orphelin
        await supabase.from("suppliers").delete().eq("organization_id", organizationId).eq("id", supplier.id);
        throw new Error(`Source non créée : ${sourceError?.message ?? "inconnu"}`);
      }
      return { supplierId: supplier.id, sourceId: source.id };
    },
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

function newReason(c: ProbedCandidate): string {
  const parts = [`${SUPPLIER_TYPE_LABEL[c.supplierType]} (confiance ${Math.round(c.typeConfidence * 100)} %)`];
  if (c.robots === "disallowed") parts.push("robots.txt interdit : aucune collecte automatique");
  else if (c.robots === "error") parts.push("robots.txt inaccessible : page non sondée");
  else if (!c.probed) parts.push(c.probeError ? `sonde impossible (${c.probeError})` : c.robotsDetail || "page non sondée");
  else {
    parts.push(ACCESS_LABEL[c.access]);
    parts.push(PRICE_VISIBILITY_LABEL[c.priceVisibility]);
    if (c.suggestedAdapter) parts.push(`adaptateur suggéré : ${c.suggestedAdapter}`);
  }
  parts.push("Découverte — à valider avant toute interrogation");
  return parts.join(" · ");
}

function reportFromCandidate(c: ProbedCandidate, status: DiscoveryCandidateStatus, reason: string, ids: { supplierId: string; sourceId: string } | null = null): DiscoveryReportCandidate {
  return {
    domain: c.domain,
    name: c.name,
    type: c.supplierType,
    typeLabel: SUPPLIER_TYPE_LABEL[c.supplierType],
    typeConfidence: c.typeConfidence,
    platform: c.platform,
    access: c.access,
    accessLabel: ACCESS_LABEL[c.access],
    priceVisibility: c.priceVisibility,
    priceVisibilityLabel: PRICE_VISIBILITY_LABEL[c.priceVisibility],
    robots: c.robots,
    suggestedAdapter: c.suggestedAdapter,
    sampleUrl: c.sampleUrl,
    query: c.query,
    status,
    reason,
    supplierId: ids?.supplierId ?? null,
    sourceId: ids?.sourceId ?? null,
  };
}

function unprobed(c: Omit<ProbedCandidate, "robots" | "robotsDetail" | "crawlDelaySeconds" | "probed" | "httpStatus" | "platform" | "access" | "priceVisibility" | "suggestedAdapter" | "probeSignals" | "probeError">): ProbedCandidate {
  return { ...c, robots: "not_checked", robotsDetail: "", crawlDelaySeconds: null, probed: false, httpStatus: null, platform: "unknown", access: "unknown", priceVisibility: "unknown", suggestedAdapter: null, probeSignals: [], probeError: null };
}

function countStatuses(list: DiscoveryReportCandidate[]): Record<DiscoveryCandidateStatus, number> {
  const counts: Record<DiscoveryCandidateStatus, number> = { new: 0, already_known: 0, rejected: 0, skipped: 0 };
  for (const c of list) counts[c.status]++;
  return counts;
}

export async function discoverSources(ctx: DiscoveryContext, parsedQuery: ParsedQuery): Promise<DiscoveryReport> {
  const now = ctx.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const finish = (partial: Omit<DiscoveryReport, "startedAt" | "finishedAt" | "counts">): DiscoveryReport => ({ ...partial, counts: countStatuses(partial.candidates), startedAt, finishedAt: now().toISOString() });

  // --- fournisseur de recherche
  let provider: WebSearchProvider | null;
  let message: string;
  const userAgent = ctx.userAgent ?? serverEnv().SOURCING_USER_AGENT;
  if (ctx.provider !== undefined) {
    provider = ctx.provider;
    message = provider ? `Découverte via ${provider.label}` : "Découverte désactivée : aucune API de recherche configurée";
  } else {
    const created = createWebSearchProvider(ctx.env ?? process.env, { fetchImpl: ctx.fetchImpl, resolver: ctx.resolver, userAgent });
    provider = created.provider;
    message = created.config.message;
  }
  if (!provider) return finish({ enabled: false, provider: null, message, queries: [], candidates: [] });

  // --- requêtes de découverte
  const queries = expandQuery(parsedQuery)
    .filter((q) => q.useFor === "discovery")
    .map((q) => q.text);
  if (queries.length === 0) return finish({ enabled: true, provider: provider.key, message: "Aucune requête de découverte pour cette recherche.", queries: [], candidates: [] });

  const runs: DiscoverySearchRun[] = await runDiscoverySearches(provider, queries, { now, sleep: ctx.sleep, ...(ctx.searchIntervalMs !== undefined ? { minIntervalMs: ctx.searchIntervalMs } : {}) });
  const queryReport = runs.map((r) => ({ query: r.query, results: r.results.length, cached: r.cached, error: r.error }));

  // --- tri
  const { candidates, rejected } = screenSearchResults(runs.flatMap((r) => r.results.map((x) => ({ ...x, query: r.query }))));
  const report: DiscoveryReportCandidate[] = [];
  for (const r of rejected) {
    if (!r.domain) continue;
    report.push({ domain: r.domain, name: r.domain, type: "unknown", typeLabel: SUPPLIER_TYPE_LABEL.unknown, typeConfidence: 0, platform: "unknown", access: "unknown", accessLabel: ACCESS_LABEL.unknown, priceVisibility: "unknown", priceVisibilityLabel: PRICE_VISIBILITY_LABEL.unknown, robots: "not_checked", suggestedAdapter: null, sampleUrl: r.url, query: r.query, status: "rejected", reason: r.reason, supplierId: null, sourceId: null });
  }

  // --- déjà connus (avant toute sonde : aucune requête inutile)
  const store = ctx.store ?? createSupabaseDiscoveryStore(createAdminSupabaseClient());
  const known = await store.listKnownDomains(ctx.organizationId);
  const fresh: typeof candidates = [];
  for (const c of candidates) {
    if (known.has(c.domain) || known.has(c.host.replace(/^www\d*\./, ""))) report.push(reportFromCandidate(unprobed(c), "already_known", "Fournisseur ou source déjà enregistré dans votre organisation"));
    else fresh.push(c);
  }

  // --- sonde + enregistrement (séquentiel, borné)
  const max = ctx.maxCandidates ?? MAX_PROBED_CANDIDATES;
  const discoveredAt = now().toISOString();
  for (const [i, c] of fresh.entries()) {
    if (i >= max) {
      report.push(reportFromCandidate(unprobed(c), "skipped", `Non analysé : limite de ${max} candidats par recherche`));
      continue;
    }
    const probed = await probeCandidate(c, { userAgent, fetchImpl: ctx.fetchImpl, resolver: ctx.resolver, sleep: ctx.sleep });
    try {
      const ids = await store.createDiscoveredSource(ctx.organizationId, { candidate: probed, provider: provider.key, discoveredAt });
      known.add(probed.domain);
      report.push(reportFromCandidate(probed, "new", newReason(probed), ids));
    } catch (e) {
      log.warn("discovered source not stored", { orgId: ctx.organizationId, domain: probed.domain, error: e instanceof Error ? e.message : String(e) });
      report.push(reportFromCandidate(probed, "skipped", `Non enregistré : ${e instanceof Error ? e.message : "erreur inconnue"}`));
    }
  }

  log.info("discovery done", { orgId: ctx.organizationId, provider: provider.key, queries: runs.length, new: report.filter((r) => r.status === "new").length });
  const failed = runs.filter((r) => r.error).length;
  const summary = failed === runs.length ? `Recherche web en échec : ${runs[0]?.error ?? "erreur inconnue"}` : `${message} — ${runs.length} requête(s)${failed ? `, ${failed} en échec` : ""}`;
  return finish({ enabled: true, provider: provider.key, message: summary, queries: queryReport, candidates: report });
}
