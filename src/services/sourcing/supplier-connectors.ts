import "server-only";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { Json } from "@/db/database.types";
import type { SyncTrigger } from "@/db/types";
import { getConnectorDescriptor, NO_CONNECTOR_MESSAGE, SUPPLIER_CONNECTORS, type ConnectorDescriptor, type SupplierCredentials } from "@/integrations/suppliers/core";
import { PARTNER_FEED_STATUS } from "@/integrations/suppliers/partner-feed";
import type { AdapterRunContext } from "@/integrations/sourcing/core";
import { adapterConfigFromSource, HostScheduler, withProvenance } from "@/services/sourcing/adapter-runtime";
import { expireUnseenOffers, storeOffer, type StorageContext } from "@/services/sourcing/offer-storage";
import { finishSyncRun, recordSyncErrors, startSyncRun, type SyncErrorInput } from "@/services/sourcing/sync-runs";

const log = createLogger("SUPPLIER_CONNECTORS");

/**
 * Service des connexions fournisseurs (comptes / API) : connexions + secrets chiffrés
 * (service_role) + connecteurs dérivés des adaptateurs « compte ». Une synchronisation =
 * connexion → pages de catalogue (bornées) → OfferStorage → sync_runs.
 */
export const MAX_CONNECTION_CATALOG_PAGES = 20;
export const CONNECTION_MIN_DELAY_MS = 500;

export function listAvailableConnectors(): readonly ConnectorDescriptor[] {
  return SUPPLIER_CONNECTORS;
}

export function connectorsStatusMessage(): string {
  if (SUPPLIER_CONNECTORS.length === 0) return `${NO_CONNECTOR_MESSAGE} ${PARTNER_FEED_STATUS.message}`;
  return `${SUPPLIER_CONNECTORS.length} connecteur(s) disponible(s) : ${SUPPLIER_CONNECTORS.map((c) => c.label).join(", ")}. Implémentés d'après la documentation publique des API, vérifiés sur fixtures uniquement. ${PARTNER_FEED_STATUS.message}`;
}

/** Crée une connexion (insert serveur : la RLS interdit l'insertion côté utilisateur) et chiffre les identifiants. */
export async function createSupplierConnection(input: { organizationId: string; supplierId: string; sourceId?: string | null; connectorKey: string; credentials: SupplierCredentials; config?: Record<string, string> }): Promise<string> {
  const descriptor = getConnectorDescriptor(input.connectorKey);
  if (!descriptor) throw new AppError("NOT_IMPLEMENTED", NO_CONNECTOR_MESSAGE);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("supplier_connections")
    .insert({ organization_id: input.organizationId, supplier_id: input.supplierId, source_id: input.sourceId ?? null, connector_key: input.connectorKey, status: "pending", config: (input.config ?? {}) as unknown as NonNullable<Json> })
    .select("id")
    .single();
  if (error || !data) throw new AppError("INTERNAL", `Connexion non créée : ${error?.message ?? "inconnu"}`);
  await storeConnectionCredentials(data.id, input.credentials);
  return data.id;
}

export async function storeConnectionCredentials(connectionId: string, credentials: SupplierCredentials): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("supplier_connection_secrets").upsert({ connection_id: connectionId, credentials_enc: encryptSecret(JSON.stringify(credentials)), key_version: 1, updated_at: new Date().toISOString() });
  if (error) throw new AppError("INTERNAL", `Identifiants non enregistrés : ${error.message}`);
}

export async function loadConnectionCredentials(connectionId: string): Promise<SupplierCredentials | null> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("supplier_connection_secrets").select("credentials_enc").eq("connection_id", connectionId).maybeSingle();
  if (!data?.credentials_enc) return null;
  return JSON.parse(decryptSecret(data.credentials_enc)) as SupplierCredentials;
}

interface ConnectionRow {
  id: string;
  organization_id: string;
  supplier_id: string;
  source_id: string | null;
  connector_key: string;
  config: Json;
  supplier: { name: string; currency: string | null } | null;
}

async function loadConnection(admin: AdminSupabaseClient, connectionId: string): Promise<ConnectionRow | null> {
  const { data } = await admin.from("supplier_connections").select("id, organization_id, supplier_id, source_id, connector_key, config, supplier:suppliers(name, currency)").eq("id", connectionId).maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

/** Source SUPPLIER_ACCOUNT portant les offres de la connexion (créée au premier besoin). */
export async function ensureConnectionSource(admin: AdminSupabaseClient, connection: ConnectionRow, descriptor: ConnectorDescriptor) {
  if (connection.source_id) {
    const { data } = await admin.from("supplier_sources").select("*").eq("id", connection.source_id).maybeSingle();
    if (data) return data;
  }
  const connConfig = connection.config && typeof connection.config === "object" && !Array.isArray(connection.config) ? (connection.config as Record<string, unknown>) : {};
  const { data, error } = await admin
    .from("supplier_sources")
    .insert({
      organization_id: connection.organization_id,
      supplier_id: connection.supplier_id,
      name: descriptor.label,
      source_type: "SUPPLIER_ACCOUNT",
      automated_access_confirmed: true,
      access_conditions: descriptor.accessConditions,
      status: "active",
      sync_frequency: "manual",
      default_currency: typeof connConfig.default_currency === "string" ? connConfig.default_currency : connection.supplier?.currency ?? null,
      config: { adapter: descriptor.key, ...connConfig } as unknown as NonNullable<Json>,
    })
    .select("*")
    .single();
  if (error || !data) throw new AppError("INTERNAL", `Source du compte fournisseur non créée : ${error?.message ?? "inconnu"}`);
  await admin.from("supplier_connections").update({ source_id: data.id }).eq("id", connection.id);
  return data;
}

function runContext(credentials: SupplierCredentials, options: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; resolver?: AdapterRunContext["resolver"]; timeoutMs?: number }): AdapterRunContext {
  const scheduler = new HostScheduler(CONNECTION_MIN_DELAY_MS, options.sleep);
  return { userAgent: serverEnv().SOURCING_USER_AGENT, credentials, fetchImpl: scheduler.wrapFetch(options.fetchImpl), sleep: options.sleep, resolver: options.resolver, minDelayMs: CONNECTION_MIN_DELAY_MS, timeoutMs: options.timeoutMs };
}

/** « Tester la connexion » : adapter.testConnection avec les identifiants déchiffrés ; met à jour le statut de la connexion. */
export async function testSupplierConnection(connectionId: string, options: { admin?: AdminSupabaseClient; fetchImpl?: typeof fetch; resolver?: AdapterRunContext["resolver"] } = {}): Promise<{ ok: boolean; message: string }> {
  const admin = options.admin ?? createAdminSupabaseClient();
  const connection = await loadConnection(admin, connectionId);
  if (!connection) return { ok: false, message: "Connexion introuvable." };
  const descriptor = getConnectorDescriptor(connection.connector_key);
  if (!descriptor) return { ok: false, message: `Connecteur « ${connection.connector_key} » indisponible.` };
  const credentials = await loadConnectionCredentials(connection.id);
  if (!credentials) return { ok: false, message: "Identifiants introuvables : reconnectez le compte." };
  const source = await ensureConnectionSource(admin, connection, descriptor);
  const config = adapterConfigFromSource(source);
  const result = await descriptor.adapter.testConnection(config, runContext(credentials, { fetchImpl: options.fetchImpl, resolver: options.resolver, timeoutMs: 20_000 }));
  await admin.from("supplier_connections").update({ status: result.ok ? "connected" : "error", connected_at: result.ok ? new Date().toISOString() : null, last_error: result.ok ? null : result.message }).eq("id", connection.id);
  return result;
}

export interface ConnectionSyncResult {
  connectionId: string;
  sourceId: string | null;
  runId: string | null;
  status: "success" | "partial" | "failed" | "refused";
  pages: number;
  found: number;
  stored: number;
  rejected: number;
  expired: number;
  message: string;
}

/** Synchronisation d'une connexion : identifiants → pages de catalogue bornées → OfferStorage → sync_runs. */
export async function syncSupplierConnection(connectionId: string, options: { trigger?: SyncTrigger; createdBy?: string | null; admin?: AdminSupabaseClient; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; resolver?: AdapterRunContext["resolver"]; maxPages?: number } = {}): Promise<ConnectionSyncResult> {
  const admin = options.admin ?? createAdminSupabaseClient();
  const base = { connectionId, sourceId: null, runId: null, pages: 0, found: 0, stored: 0, rejected: 0, expired: 0 };
  const connection = await loadConnection(admin, connectionId);
  if (!connection) return { ...base, status: "failed", message: "Connexion introuvable." };
  const descriptor = getConnectorDescriptor(connection.connector_key);
  if (!descriptor) return { ...base, status: "refused", message: `Connecteur « ${connection.connector_key} » indisponible : ${NO_CONNECTOR_MESSAGE}` };
  if (!descriptor.adapter.fetchCatalog) return { ...base, status: "refused", message: `Le connecteur « ${descriptor.label} » ne propose pas de parcours de catalogue.` };
  const credentials = await loadConnectionCredentials(connection.id);
  if (!credentials) return { ...base, status: "refused", message: "Identifiants introuvables : reconnectez le compte fournisseur." };
  const source = await ensureConnectionSource(admin, connection, descriptor);
  const { data: org } = await admin.from("organizations").select("default_currency").eq("id", connection.organization_id).maybeSingle();

  const run = await startSyncRun(admin, { organizationId: connection.organization_id, sourceKind: "supplier_connection", sourceRef: connection.id, provider: descriptor.key, trigger: options.trigger ?? "manual", createdBy: options.createdBy ?? null });
  const errors: SyncErrorInput[] = [];
  const config = adapterConfigFromSource(source);
  const ctx = runContext(credentials, { fetchImpl: options.fetchImpl, sleep: options.sleep, resolver: options.resolver });
  const storage: StorageContext = { supabase: admin, organizationId: connection.organization_id, organizationCurrency: org?.default_currency ?? "EUR", supplierId: connection.supplier_id, sourceId: source.id, sourceType: source.source_type, defaultCurrency: source.default_currency, defaultTaxType: source.default_tax_type, defaultCountry: source.country, createdBy: options.createdBy ?? null, now: run.startedAt };
  const maxPages = Math.min(options.maxPages ?? MAX_CONNECTION_CATALOG_PAGES, 200);
  let pages = 0;
  let found = 0;
  let stored = 0;
  let rejected = 0;
  let expired = 0;
  const requests: Json[] = [];
  try {
    let cursor: string | null = null;
    let truncated = false;
    for (;;) {
      if (pages >= maxPages) {
        truncated = true;
        errors.push({ code: "CATALOG_TRUNCATED", message: `Limite de ${maxPages} page(s) atteinte : le reste du catalogue sera lu à la prochaine synchronisation.`, entityType: "connection", entityRef: connection.id });
        break;
      }
      const page = await descriptor.adapter.fetchCatalog(config, cursor, ctx);
      pages++;
      for (const q of page.requests) {
        requests.push({ url: q.url, status: q.status, durationMs: q.durationMs, offers: q.offers, error: q.error });
        if (q.error) errors.push({ code: "PAGE_FAILED", message: q.error, entityType: "page", entityRef: q.url });
      }
      found += page.offers.length;
      const retrievedAt = new Date().toISOString();
      const requestUrl = page.requests.find((q) => q.offers > 0)?.url ?? page.requests[0]?.url ?? null;
      for (const offer of page.offers) {
        const traced = withProvenance(offer, { adapterKey: descriptor.key, method: page.method, retrievedAt, requestUrl, sourceUrl: offer.url ?? null });
        try {
          const r = await storeOffer(storage, traced);
          if (r.outcome === "stored") stored++;
          else {
            rejected++;
            errors.push({ code: "OFFER_REJECTED", message: r.validation.anomalies.map((a) => a.message).join(" ; "), entityType: "offer", entityRef: offer.externalOfferId });
          }
        } catch (e) {
          rejected++;
          errors.push({ code: "OFFER_STORE_FAILED", message: e instanceof Error ? e.message : String(e), entityType: "offer", entityRef: offer.externalOfferId });
        }
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    if (stored > 0 && !truncated) expired = await expireUnseenOffers(storage, run.startedAt);
    const pageErrors = errors.filter((e) => e.code === "PAGE_FAILED").length;
    const status: ConnectionSyncResult["status"] = found === 0 && pageErrors > 0 ? "failed" : errors.length > 0 ? "partial" : "success";
    const message = found === 0 && pageErrors === 0 ? "Le catalogue ne contient aucune offre lisible." : `${pages} page(s) lue(s), ${found} offre(s) trouvée(s), ${stored} enregistrée(s), ${rejected} rejetée(s), ${expired} expirée(s).`;
    await recordSyncErrors(admin, run, errors);
    await finishSyncRun(admin, run, { status, recordsProcessed: found, errorCount: errors.length, stats: { pages, found, stored, rejected, expired, truncated, requests: requests.slice(0, 100), adapter: descriptor.key } as unknown as NonNullable<Json>, errorSummary: status === "failed" ? message : null });
    await admin.from("supplier_connections").update({ status: status === "failed" ? "error" : "connected", last_sync_at: run.startedAt.toISOString(), last_error: status === "failed" ? message : null, connected_at: status === "failed" ? null : new Date().toISOString() }).eq("id", connection.id);
    await admin.from("supplier_sources").update({ status: status === "failed" ? "error" : "active", last_sync_at: run.startedAt.toISOString(), last_successful_sync_at: status !== "failed" ? new Date().toISOString() : source.last_successful_sync_at, last_error: status === "failed" ? message : null }).eq("id", source.id);
    return { connectionId, sourceId: source.id, runId: run.id, status, pages, found, stored, rejected, expired, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    log.error("connection sync failed", { connectionId, error: message });
    await recordSyncErrors(admin, run, [...errors, { code: "SYNC_FAILED", message }]);
    await finishSyncRun(admin, run, { status: "failed", recordsProcessed: found, errorCount: errors.length + 1, errorSummary: message });
    await admin.from("supplier_connections").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", connection.id);
    await admin.from("supplier_sources").update({ status: "error", last_sync_at: run.startedAt.toISOString(), last_error: message }).eq("id", source.id);
    return { connectionId, sourceId: source.id, runId: run.id, status: "failed", pages, found, stored, rejected, expired, message };
  }
}
