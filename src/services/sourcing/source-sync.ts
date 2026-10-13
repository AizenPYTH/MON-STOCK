import "server-only";
import { z } from "zod";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import type { SourceOverviewDTO } from "@/features/mobile-api/contract";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { FREQUENCY_LABEL, isScheduleDue, sourceDisplayStatus, SOURCE_STATUS_LABEL, type SyncFrequency } from "@/domain/sourcing/schedule";
import { ingestFeed, parseFeedConfig, type IngestMode } from "@/services/sourcing/feed-ingestion";
import { runSourceCrawl } from "@/services/sourcing/crawler/crawler-manager";
import { syncSupplierConnection } from "@/services/sourcing/supplier-connectors";
import { recordSourceOutcome } from "@/services/sourcing/source-health";
import { CATALOG_IMPORT_KIND } from "@/services/sourcing/catalog-import";
import { adapterKeyOf } from "@/services/sourcing/adapter-runtime";
import { parseCrawlConfig } from "@/services/sourcing/crawler/source-crawler";
import { getSourceAdapter } from "@/integrations/sourcing/registry";

const log = createLogger("SOURCE_SYNC");

/** Délai minimal entre deux synchronisations manuelles d'une même source (anti-abus). */
export const MANUAL_SYNC_COOLDOWN_MS = 2 * 60_000;

/**
 * public_web : page publique parcourue par le crawler (catalogue de l'adaptateur ou URLs configurées) ;
 * live_search : page publique interrogée EN DIRECT à chaque recherche (adaptateur sans catalogue,
 * ex. sitemap-jsonld) — rien à synchroniser ni à planifier.
 */
export type SourceKind = "file_import" | "public_web" | "live_search" | "remote_feed" | "connection" | "manual";

type SourceRow = {
  id: string;
  organization_id: string;
  supplier_id: string;
  name: string;
  source_type: string;
  base_url: string | null;
  country: string | null;
  config: Json;
  automated_access_confirmed: boolean;
  sync_frequency: SyncFrequency;
  status: string;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_error: string | null;
  next_run_at: string | null;
  consecutive_failures: number;
};

const SOURCE_COLUMNS = "id, organization_id, supplier_id, name, source_type, base_url, country, config, automated_access_confirmed, sync_frequency, status, last_sync_at, last_successful_sync_at, last_error, next_run_at, consecutive_failures";

function kindOf(s: Pick<SourceRow, "source_type" | "config">, hasUrlFeed: boolean, hasConnection: boolean): SourceKind {
  const kind = (s.config as { kind?: string } | null)?.kind;
  if (kind === CATALOG_IMPORT_KIND) return "file_import";
  if (s.source_type === "PUBLIC_WEB") return isCrawlable(s.config) ? "public_web" : "live_search";
  if (hasConnection) return "connection";
  if (hasUrlFeed) return "remote_feed";
  if (s.source_type === "MANUAL") return "manual";
  return "file_import";
}

/** Le crawler a-t-il quelque chose à parcourir (catalogue de l'adaptateur ou URLs configurées) ? */
function isCrawlable(config: Json): boolean {
  if (parseCrawlConfig(config).urls.length > 0) return true;
  const key = adapterKeyOf(config);
  const adapter = key ? getSourceAdapter(key) : null;
  return Boolean(adapter?.capabilities.catalog && adapter.fetchCatalog);
}

const LIVE_SEARCH_MESSAGE = "Source interrogée en direct à chaque recherche : ses offres se mettent à jour quand vous cherchez un produit, il n'y a rien à synchroniser.";

export const METHOD_LABEL: Record<SourceKind, string> = {
  file_import: "Import de fichier",
  public_web: "Page publique (robots.txt vérifié)",
  live_search: "Recherche en direct (page publique)",
  remote_feed: "Flux distant autorisé",
  connection: "API fournisseur (compte)",
  manual: "Saisie manuelle",
};

interface SyncOutcome {
  ok: boolean;
  status: "success" | "partial" | "failed" | "refused";
  message: string;
  runIds: string[];
}

/** Exécute la synchronisation d'une source selon sa nature (crawl public, flux distant, API). */
async function runSourceOnce(admin: AdminSupabaseClient, source: SourceRow, kind: SourceKind, trigger: "manual" | "scheduled", createdBy: string | null): Promise<SyncOutcome> {
  if (kind === "public_web") {
    const r = await runSourceCrawl(source.id, { trigger, createdBy, admin });
    return { ok: r.status === "success" || r.status === "partial", status: r.status, message: r.message, runIds: r.runId ? [r.runId] : [] };
  }
  if (kind === "remote_feed") {
    const { data: feeds } = await admin.from("supplier_feeds").select("id, options, field_mapping").eq("source_id", source.id).not("url", "is", null).neq("status", "paused").limit(10);
    if (!feeds?.length) return { ok: false, status: "failed", message: "Aucun flux distant actif pour cette source.", runIds: [] };
    const results = [];
    for (const f of feeds) {
      const mode = ((parseFeedConfig(f).options as { mode?: IngestMode }).mode ?? "snapshot") as IngestMode;
      results.push(await ingestFeed(f.id, { trigger, createdBy, admin, mode }));
    }
    const failed = results.filter((r) => r.status === "failed");
    return { ok: failed.length === 0, status: failed.length === 0 ? (results.some((r) => r.status === "partial") ? "partial" : "success") : failed.length === results.length ? "failed" : "partial", message: results.map((r) => r.message).join(" "), runIds: results.flatMap((r) => (r.runId ? [r.runId] : [])) };
  }
  if (kind === "connection") {
    const { data: conns } = await admin.from("supplier_connections").select("id").eq("source_id", source.id).limit(5);
    if (!conns?.length) return { ok: false, status: "failed", message: "Aucune connexion fournisseur pour cette source.", runIds: [] };
    const r = await syncSupplierConnection(conns[0]!.id, { trigger, createdBy, admin });
    return { ok: r.status === "success" || r.status === "partial", status: r.status, message: r.message, runIds: r.runId ? [r.runId] : [] };
  }
  if (kind === "live_search") return { ok: false, status: "refused", message: LIVE_SEARCH_MESSAGE, runIds: [] };
  return { ok: false, status: "refused", message: kind === "file_import" ? "Source alimentée par fichier : importez la nouvelle liste du fournisseur (Sourcing → Importer)." : "Source manuelle : aucune synchronisation automatique.", runIds: [] };
}

async function sourceContext(admin: AdminSupabaseClient, ids: string[]): Promise<{ urlFeeds: Set<string>; connections: Set<string> }> {
  if (ids.length === 0) return { urlFeeds: new Set(), connections: new Set() };
  const [{ data: feeds }, { data: conns }] = await Promise.all([admin.from("supplier_feeds").select("source_id").in("source_id", ids).not("url", "is", null), admin.from("supplier_connections").select("source_id").in("source_id", ids)]);
  return { urlFeeds: new Set((feeds ?? []).map((f) => f.source_id)), connections: new Set((conns ?? []).flatMap((c) => (c.source_id ? [c.source_id] : []))) };
}

/** « Synchroniser maintenant » (rédacteur) : source de l'organisation, verrou et délai anti-abus. */
export async function syncSourceNow(ctx: OrgContext, sourceId: string, admin: AdminSupabaseClient = createAdminSupabaseClient(), now: Date = new Date()): Promise<{ status: SyncOutcome["status"]; message: string; nextRunAt: string | null; consecutiveFailures: number }> {
  // lecture sous la session de l'utilisateur : la RLS garantit l'appartenance à l'organisation
  const { data, error } = await ctx.supabase.from("supplier_sources").select(SOURCE_COLUMNS).eq("organization_id", ctx.organization.id).eq("id", sourceId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw new AppError("NOT_FOUND", "Source introuvable dans cette organisation.");
  const source = data as unknown as SourceRow;
  if (source.status === "paused") throw new AppError("VALIDATION", "Source désactivée : réactivez-la avant de la synchroniser.");
  if (source.last_sync_at && now.getTime() - new Date(source.last_sync_at).getTime() < MANUAL_SYNC_COOLDOWN_MS) throw new AppError("RATE_LIMITED", "Synchronisation lancée il y a moins de 2 minutes : patientez un peu.");
  const { urlFeeds, connections } = await sourceContext(admin, [source.id]);
  const kind = kindOf(source, urlFeeds.has(source.id), connections.has(source.id));
  if (kind === "live_search") throw new AppError("VALIDATION", LIVE_SEARCH_MESSAGE);
  if (kind === "file_import" || kind === "manual") throw new AppError("VALIDATION", kind === "file_import" ? "Cette source est alimentée par fichier : importez la nouvelle liste du fournisseur." : "Source manuelle : rien à synchroniser.");
  let outcome: SyncOutcome;
  try {
    outcome = await runSourceOnce(admin, source, kind, "manual", ctx.user.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/déjà en cours/.test(message)) throw new AppError("CONFLICT", message);
    outcome = { ok: false, status: "failed", message, runIds: [] };
  }
  const health = await recordSourceOutcome(admin, { sourceId: source.id, organizationId: source.organization_id, sourceName: source.name, frequency: source.sync_frequency, previousFailures: source.consecutive_failures, ok: outcome.ok, error: outcome.ok ? null : outcome.message, now });
  return { status: outcome.status, message: outcome.message, ...health };
}

/** Cron : sources planifiées échues (reprise progressive après échec), une à la fois par hôte. */
export async function runScheduledSources(now: Date = new Date(), admin: AdminSupabaseClient = createAdminSupabaseClient(), limit = 40): Promise<{ sourceId: string; status: SyncOutcome["status"]; message: string }[]> {
  const { data } = await admin.from("supplier_sources").select(SOURCE_COLUMNS).neq("sync_frequency", "manual").neq("status", "paused").limit(500);
  const sources = ((data ?? []) as unknown as SourceRow[]).filter((s) => isScheduleDue(s, now));
  const { urlFeeds, connections } = await sourceContext(admin, sources.map((s) => s.id));
  const out: { sourceId: string; status: SyncOutcome["status"]; message: string }[] = [];
  // sources d'un même hôte traitées l'une après l'autre (politesse), ordre : la plus en retard d'abord
  sources.sort((a, b) => (a.next_run_at ?? a.last_sync_at ?? "").localeCompare(b.next_run_at ?? b.last_sync_at ?? ""));
  for (const source of sources.slice(0, limit)) {
    const kind = kindOf(source, urlFeeds.has(source.id), connections.has(source.id));
    if (kind === "file_import" || kind === "manual" || kind === "live_search") continue;
    if (kind === "public_web" && !source.automated_access_confirmed) continue;
    // catalogue public hebdomadaire : collecte par tranches avec reprise (weekly-collection), jamais d'une traite
    if (kind === "public_web" && source.sync_frequency === "weekly") continue;
    let outcome: SyncOutcome;
    try {
      outcome = await runSourceOnce(admin, source, kind, "scheduled", null);
    } catch (e) {
      outcome = { ok: false, status: "failed", message: e instanceof Error ? e.message : String(e), runIds: [] };
    }
    // une synchronisation déjà en cours n'est pas un échec de la source
    if (!outcome.ok && /déjà en cours/.test(outcome.message)) continue;
    await recordSourceOutcome(admin, { sourceId: source.id, organizationId: source.organization_id, sourceName: source.name, frequency: source.sync_frequency, previousFailures: source.consecutive_failures, ok: outcome.ok, error: outcome.ok ? null : outcome.message, now });
    out.push({ sourceId: source.id, status: outcome.status, message: outcome.message });
  }
  log.info("scheduled sources", { due: sources.length, ran: out.length });
  return out;
}

export const sourceScheduleSchema = z.object({
  sourceId: z.string().uuid(),
  frequency: z.enum(["manual", "hourly", "every_6_hours", "daily", "weekly"]).optional(),
  /** désactiver (pause) / réactiver la source */
  enabled: z.boolean().optional(),
});

/** Fréquence et activation d'une source (administrateur). Les sources par fichier restent manuelles. */
export async function setSourceSchedule(ctx: OrgContext, input: z.infer<typeof sourceScheduleSchema>, admin: AdminSupabaseClient = createAdminSupabaseClient(), now: Date = new Date()): Promise<SourceOverviewDTO> {
  const { data, error } = await ctx.supabase.from("supplier_sources").select(SOURCE_COLUMNS).eq("organization_id", ctx.organization.id).eq("id", input.sourceId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw new AppError("NOT_FOUND", "Source introuvable dans cette organisation.");
  const source = data as unknown as SourceRow;
  const { urlFeeds, connections } = await sourceContext(admin, [source.id]);
  const kind = kindOf(source, urlFeeds.has(source.id), connections.has(source.id));
  const patch: { sync_frequency?: SyncFrequency; next_run_at?: string | null; status?: "paused" | "active" | "not_connected" } = {};
  if (input.frequency) {
    if (input.frequency !== "manual" && (kind === "file_import" || kind === "manual")) throw new AppError("VALIDATION", "Une source alimentée par fichier ne se synchronise pas automatiquement : demandez au fournisseur un flux (URL CSV / XML) ou une API.");
    if (input.frequency !== "manual" && kind === "live_search") throw new AppError("VALIDATION", LIVE_SEARCH_MESSAGE);
    if (input.frequency !== "manual" && kind === "public_web" && !source.automated_access_confirmed) throw new AppError("VALIDATION", "Accès automatisé non attesté pour cette page publique.");
    patch.sync_frequency = input.frequency;
    patch.next_run_at = input.frequency === "manual" ? null : now.toISOString();
  }
  if (input.enabled !== undefined) patch.status = input.enabled ? (source.last_successful_sync_at ? "active" : "not_connected") : "paused";
  if (Object.keys(patch).length) {
    const { error: upErr } = await admin.from("supplier_sources").update(patch).eq("id", source.id).eq("organization_id", ctx.organization.id);
    if (upErr) throw fromPostgrestError(upErr);
  }
  const list = await listSourcesForOrg(ctx, admin);
  const updated = list.find((s) => s.id === source.id);
  if (!updated) throw new AppError("NOT_FOUND", "Source introuvable après mise à jour.");
  return updated;
}

/** Catalogue des sources de l'organisation avec statut affiché, nombre d'offres exploitables et dates. */
export async function listSourcesForOrg(ctx: OrgContext, admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<SourceOverviewDTO[]> {
  const orgId = ctx.organization.id;
  const { data, error } = await ctx.supabase.from("supplier_sources").select(`${SOURCE_COLUMNS}, supplier:suppliers(name, country)`).eq("organization_id", orgId).order("name").limit(300);
  if (error) throw fromPostgrestError(error);
  const sources = (data ?? []) as unknown as (SourceRow & { supplier: { name: string; country: string | null } | null })[];
  const ids = sources.map((s) => s.id);
  const { urlFeeds, connections } = await sourceContext(admin, ids);
  const counts = new Map<string, number>();
  if (ids.length) {
    // offres exploitables : actives (les expirées et suspectes ne comptent pas)
    const { data: offers } = await ctx.supabase.from("sourcing_offers").select("source_id").eq("organization_id", orgId).eq("status", "active").in("source_id", ids).limit(50_000);
    for (const o of offers ?? []) counts.set(o.source_id, (counts.get(o.source_id) ?? 0) + 1);
  }
  const running = new Set<string>();
  if (ids.length) {
    const { data: feeds } = await ctx.supabase.from("supplier_feeds").select("id, source_id").eq("organization_id", orgId).in("source_id", ids);
    const refToSource = new Map<string, string>(ids.map((id) => [id, id]));
    for (const f of feeds ?? []) refToSource.set(f.id, f.source_id);
    const { data: runs } = await ctx.supabase.from("sync_runs").select("source_ref").eq("organization_id", orgId).eq("status", "running").in("source_ref", [...refToSource.keys()]);
    for (const r of runs ?? []) if (r.source_ref && refToSource.has(r.source_ref)) running.add(refToSource.get(r.source_ref)!);
  }
  return sources.map((s) => {
    const kind = kindOf(s, urlFeeds.has(s.id), connections.has(s.id));
    const display = sourceDisplayStatus({ status: s.status, kind, running: running.has(s.id), lastSuccessfulSyncAt: s.last_successful_sync_at, consecutiveFailures: s.consecutive_failures, attested: s.automated_access_confirmed || kind === "connection" || kind === "remote_feed" });
    // live_search : rien à planifier ; l'action proposée est la recherche elle-même (aucun bouton ici)
    const schedulable = kind === "public_web" || kind === "remote_feed" || kind === "connection";
    return {
      id: s.id,
      name: s.name,
      supplierId: s.supplier_id,
      supplierName: s.supplier?.name ?? null,
      country: s.country ?? s.supplier?.country ?? null,
      kind,
      methodLabel: METHOD_LABEL[kind],
      status: display,
      statusLabel: SOURCE_STATUS_LABEL[display],
      activeOffers: counts.get(s.id) ?? 0,
      lastSyncAt: s.last_sync_at,
      lastSuccessfulSyncAt: s.last_successful_sync_at,
      nextRunAt: s.next_run_at,
      lastError: s.last_error,
      consecutiveFailures: s.consecutive_failures,
      frequency: s.sync_frequency,
      frequencyLabel: FREQUENCY_LABEL[s.sync_frequency],
      schedulable,
      canSyncNow: schedulable && s.status !== "paused",
      primaryAction: s.status === "paused" ? "enable" : kind === "file_import" || kind === "manual" ? "import_file" : schedulable ? "sync_now" : "configure",
    };
  });
}
