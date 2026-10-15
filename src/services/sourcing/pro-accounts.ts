import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { ProAccountDTO, ProAccountsHubDTO, PublicSourceDTO } from "@/features/mobile-api/contract";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { domainOf, offerAccessOf, PRO_ACCOUNTS, type ProAccountStatus } from "@/domain/sourcing/pro-accounts";
import { accessRequestEmail, directoryKeyForSupplierName, SUPPLIER_DIRECTORY } from "@/services/sourcing/supplier-directory";
import { getConnectorDescriptor } from "@/integrations/suppliers/core";
import { createSupplierConnection, syncSupplierConnection, testSupplierConnection } from "@/services/sourcing/supplier-connectors";

/**
 * « Connectez vos comptes » : les fournisseurs professionnels à brancher en priorité (vos prix
 * HT, par grade), avec leur statut RÉEL dans l'organisation, puis les sources publiques déjà
 * incluses. Lecture sous la session de l'utilisateur (RLS) ; les identifiants API sont chiffrés
 * côté serveur et ne sont jamais renvoyés.
 */
const log = createLogger("PRO_ACCOUNTS");

interface SupplierRow {
  id: string;
  name: string;
  website: string | null;
}
interface SourceRow {
  id: string;
  supplier_id: string;
  source_type: string;
  status: string;
  config: unknown;
  last_successful_sync_at: string | null;
  last_error: string | null;
}
interface ConnectionRow {
  id: string;
  supplier_id: string;
  connector_key: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

/** Fiche de l'annuaire rattachée à un fournisseur de l'organisation : même domaine, sinon même nom. */
export function directoryKeyForSupplier(s: Pick<SupplierRow, "name" | "website">): string | null {
  const domain = domainOf(s.website);
  if (domain) {
    const hit = SUPPLIER_DIRECTORY.find((e) => {
      const d = domainOf(e.website);
      return d !== null && (d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`));
    });
    if (hit) return hit.key;
  }
  return directoryKeyForSupplierName(s.name);
}

/** Statut affiché : connecté seulement sur preuve (connexion testée ou offres réellement reçues). */
export function proStatusOf(input: { connection: Pick<ConnectionRow, "status"> | null; accountOffers: number }): ProAccountStatus {
  if (input.connection?.status === "connected" || input.accountOffers > 0) return "connected";
  if (input.connection?.status === "error" || input.connection?.status === "expired") return "error";
  if (input.connection?.status === "pending") return "pending";
  return "not_connected";
}

export async function proAccountsHub(ctx: OrgContext): Promise<ProAccountsHubDTO> {
  const orgId = ctx.organization.id;
  const [suppliersRes, sourcesRes, connectionsRes, offersRes] = await Promise.all([
    ctx.supabase.from("suppliers").select("id, name, website").eq("organization_id", orgId).eq("is_archived", false).limit(1000),
    ctx.supabase.from("supplier_sources").select("id, supplier_id, source_type, status, config, last_successful_sync_at, last_error").eq("organization_id", orgId).limit(1000),
    ctx.supabase.from("supplier_connections").select("id, supplier_id, connector_key, status, last_sync_at, last_error").eq("organization_id", orgId).neq("status", "disconnected").limit(200),
    // compte des offres actives par source (au plus 20 000 lignes lues, colonnes minimales)
    ctx.supabase.from("sourcing_offers").select("source_id").eq("organization_id", orgId).eq("status", "active").limit(20000),
  ]);
  for (const r of [suppliersRes, sourcesRes, connectionsRes, offersRes]) if (r.error) throw fromPostgrestError(r.error);

  const suppliers = (suppliersRes.data ?? []) as SupplierRow[];
  const sources = (sourcesRes.data ?? []) as SourceRow[];
  const connections = (connectionsRes.data ?? []) as ConnectionRow[];
  const offersBySource = new Map<string, number>();
  for (const o of (offersRes.data ?? []) as { source_id: string }[]) offersBySource.set(o.source_id, (offersBySource.get(o.source_id) ?? 0) + 1);

  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const supplierByKey = new Map<string, SupplierRow>();
  for (const s of suppliers) {
    const k = directoryKeyForSupplier(s);
    if (k && !supplierByKey.has(k)) supplierByKey.set(k, s);
  }

  const totals = { account: 0, public: 0, marketplace: 0 };
  const accountOffersBySupplier = new Map<string, { offers: number; lastSuccessAt: string | null; lastError: string | null }>();
  const publicSources: PublicSourceDTO[] = [];
  for (const src of sources) {
    const n = offersBySource.get(src.id) ?? 0;
    const access = offerAccessOf(src.source_type, src.config);
    totals[access] += n;
    if (access === "account") {
      const cur = accountOffersBySupplier.get(src.supplier_id) ?? { offers: 0, lastSuccessAt: null, lastError: null };
      cur.offers += n;
      if (src.last_successful_sync_at && (!cur.lastSuccessAt || src.last_successful_sync_at > cur.lastSuccessAt)) cur.lastSuccessAt = src.last_successful_sync_at;
      cur.lastError = cur.lastError ?? src.last_error;
      accountOffersBySupplier.set(src.supplier_id, cur);
    } else if (src.status === "active") {
      const sup = supplierById.get(src.supplier_id);
      publicSources.push({ sourceId: src.id, supplierName: sup?.name ?? "Fournisseur", domain: domainOf(sup?.website), country: null, offers: n, lastSuccessAt: src.last_successful_sync_at });
    }
  }
  publicSources.sort((a, b) => b.offers - a.offers || a.supplierName.localeCompare(b.supplierName));

  const org = { name: ctx.organization.name, country: ctx.organization.country };
  const accounts: ProAccountDTO[] = [];
  for (const spec of PRO_ACCOUNTS) {
    const entry = SUPPLIER_DIRECTORY.find((e) => e.key === spec.key);
    if (!entry) continue;
    const supplier = supplierByKey.get(spec.key) ?? null;
    const connection = (spec.connectorKey ? connections.find((c) => c.connector_key === spec.connectorKey && (!supplier || c.supplier_id === supplier.id)) : null) ?? null;
    const own = supplier ? accountOffersBySupplier.get(supplier.id) : undefined;
    const descriptor = spec.connectorKey ? getConnectorDescriptor(spec.connectorKey) : null;
    accounts.push({
      key: spec.key,
      name: entry.name,
      segment: entry.segment,
      country: entry.country,
      website: entry.website,
      domain: domainOf(entry.website),
      categories: entry.categories,
      benefit: spec.benefit,
      requirements: spec.requirements,
      caution: spec.caution ?? null,
      methods: spec.methods,
      signupUrl: spec.signupUrl,
      status: proStatusOf({ connection, accountOffers: own?.offers ?? 0 }),
      offers: own?.offers ?? 0,
      lastSyncAt: connection?.last_sync_at ?? own?.lastSuccessAt ?? null,
      lastError: connection?.last_error ?? own?.lastError ?? null,
      connectionId: connection?.id ?? null,
      supplierId: supplier?.id ?? connection?.supplier_id ?? null,
      connector: descriptor ? { key: descriptor.key, label: descriptor.label, fields: descriptor.credentialFields.map((f) => ({ name: f.name, label: f.label, secret: f.secret, placeholder: f.placeholder ?? null })) } : null,
      email: { fr: accessRequestEmail(entry, "fr", org), en: accessRequestEmail(entry, "en", org) },
    });
  }
  // comptes connectés d'abord, puis l'ordre de priorité
  const rank: Record<ProAccountStatus, number> = { connected: 0, pending: 1, error: 1, not_connected: 2 };
  accounts.sort((a, b) => rank[a.status] - rank[b.status]);
  return { accounts, publicSources, totals };
}

/** Fournisseur de l'organisation pour une fiche (créé s'il n'existe pas : même nom et site que l'annuaire). */
async function ensureSupplierFor(ctx: OrgContext, key: string): Promise<string> {
  const entry = SUPPLIER_DIRECTORY.find((e) => e.key === key);
  if (!entry) throw new AppError("NOT_FOUND", "Fournisseur inconnu.");
  const { data: rows, error } = await ctx.supabase.from("suppliers").select("id, name, website").eq("organization_id", ctx.organization.id).eq("is_archived", false).limit(1000);
  if (error) throw fromPostgrestError(error);
  const hit = ((rows ?? []) as SupplierRow[]).find((s) => directoryKeyForSupplier(s) === key);
  if (hit) return hit.id;
  const { data, error: insErr } = await ctx.supabase
    .from("suppliers")
    .insert({ organization_id: ctx.organization.id, name: entry.name, website: entry.website, country: entry.country && entry.country.length === 2 ? entry.country : null, ...(entry.currency ? { currency: entry.currency } : {}) })
    .select("id")
    .single();
  if (insErr || !data) throw insErr ? fromPostgrestError(insErr) : new AppError("INTERNAL", "Fournisseur non créé.");
  return data.id;
}

/**
 * Connexion d'un compte par l'API officielle (connecteurs MON STOCK) : identifiants chiffrés côté
 * serveur, puis test réel auprès du fournisseur. Rien n'est présenté comme connecté avant ce test.
 */
export async function connectProAccount(ctx: OrgContext, input: { key: string; credentials: Record<string, string> }): Promise<{ connectionId: string; ok: boolean; message: string }> {
  const spec = PRO_ACCOUNTS.find((s) => s.key === input.key);
  if (!spec?.connectorKey) throw new AppError("VALIDATION", "Ce fournisseur ne propose pas de connexion API dans MON STOCK : importez sa liste de stock ou ajoutez son flux.");
  const descriptor = getConnectorDescriptor(spec.connectorKey);
  if (!descriptor) throw new AppError("NOT_IMPLEMENTED", "Connecteur indisponible.");
  const credentials: Record<string, string> = {};
  for (const f of descriptor.credentialFields) {
    const v = (input.credentials[f.name] ?? "").trim();
    if (!v) throw new AppError("VALIDATION", `${f.label} : champ requis.`);
    credentials[f.name] = v.slice(0, 2000);
  }
  const supplierId = await ensureSupplierFor(ctx, spec.key);
  const connectionId = await createSupplierConnection({ organizationId: ctx.organization.id, supplierId, connectorKey: descriptor.key, credentials });
  log.info("pro account connected", { orgId: ctx.organization.id, key: spec.key, connectionId });
  const test = await testSupplierConnection(connectionId);
  return { connectionId, ok: test.ok, message: test.ok ? `${test.message} Lancez une synchronisation pour récupérer vos prix.` : test.message };
}

async function assertOrgConnection(ctx: OrgContext, connectionId: string): Promise<void> {
  const { data, error } = await ctx.supabase.from("supplier_connections").select("id").eq("organization_id", ctx.organization.id).eq("id", connectionId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw new AppError("NOT_FOUND", "Connexion introuvable.");
}

export async function syncProAccount(ctx: OrgContext, connectionId: string): Promise<{ status: string; message: string }> {
  await assertOrgConnection(ctx, connectionId);
  const r = await syncSupplierConnection(connectionId, { trigger: "manual", createdBy: ctx.user.id });
  return { status: r.status, message: r.message };
}

/** Déconnexion : identifiants supprimés, connexion marquée déconnectée ; les offres déjà reçues restent (historique). */
export async function disconnectProAccount(ctx: OrgContext, connectionId: string): Promise<{ message: string }> {
  await assertOrgConnection(ctx, connectionId);
  const admin = createAdminSupabaseClient();
  const { error: delErr } = await admin.from("supplier_connection_secrets").delete().eq("connection_id", connectionId);
  if (delErr) throw fromPostgrestError(delErr);
  const { error } = await admin.from("supplier_connections").update({ status: "disconnected", last_error: null }).eq("id", connectionId).eq("organization_id", ctx.organization.id);
  if (error) throw fromPostgrestError(error);
  log.info("pro account disconnected", { orgId: ctx.organization.id, connectionId });
  return { message: "Compte déconnecté : identifiants supprimés. Les offres déjà reçues restent dans l'historique." };
}
