/**
 * Équivalent en mémoire de la RPC `sourcing_prepare_catalog_import`
 * (supabase/migrations/20261023000210_sourcing_import_jobs_resumable.sql) pour les tests unitaires
 * des imports : fournisseur retrouvé par égalité insensible à la casse (jamais par motif), source
 * « Import de catalogue » et flux sans URL réutilisés. Le comportement SQL réel (transaction,
 * verrou, RLS) est couvert par tests/integration/sourcing-import-jobs.test.ts.
 */
import type { MemoryDb, RpcHandler } from "./memory-db";

type Row = Record<string, unknown>;

export const prepareCatalogImportRpc: RpcHandler = (args, db: MemoryDb) => {
  const org = args.p_organization_id as string;
  const tables = db.tables;
  const suppliers = (tables.suppliers ??= []);
  const sources = (tables.supplier_sources ??= []);
  const feeds = (tables.supplier_feeds ??= []);
  let supplier: Row | undefined;
  let created = false;
  if (args.p_supplier_id) {
    supplier = suppliers.find((s) => s.id === args.p_supplier_id && s.organization_id === org);
    if (!supplier) return { data: null, error: { code: "P0002", message: "Fournisseur introuvable dans cette organisation." } };
  } else {
    const name = String(args.p_supplier_name ?? "").trim();
    supplier = suppliers.find((s) => s.organization_id === org && String(s.name).trim().toLowerCase() === name.toLowerCase());
    if (!supplier) {
      supplier = { id: `sup-${suppliers.length + 1}-${Math.random().toString(16).slice(2, 10)}`, organization_id: org, name, currency: args.p_currency, country: args.p_country ?? null };
      suppliers.push(supplier);
      created = true;
    }
  }
  let source = sources.find((s) => s.organization_id === org && s.supplier_id === supplier!.id && s.source_type === args.p_source_type && (s.config as { kind?: string } | null)?.kind === "catalog_file_import");
  if (!source) {
    source = { id: `src-${sources.length + 1}-${Math.random().toString(16).slice(2, 10)}`, organization_id: org, supplier_id: supplier.id, name: `Import de catalogue — ${String(supplier.name)}`, source_type: args.p_source_type, default_currency: args.p_currency, default_tax_type: args.p_tax_type, country: args.p_country ?? null, automated_access_confirmed: true, sync_frequency: "manual", status: "not_connected", config: { kind: "catalog_file_import" } };
    sources.push(source);
  } else Object.assign(source, { default_currency: args.p_currency, default_tax_type: args.p_tax_type });
  let feed = feeds.find((f) => f.organization_id === org && f.source_id === source!.id && (f.url === null || f.url === undefined));
  const patch = { format: args.p_feed_format, field_mapping: args.p_field_mapping, options: args.p_options, sync_frequency: "manual" };
  if (!feed) {
    feed = { id: `feed-${feeds.length + 1}-${Math.random().toString(16).slice(2, 10)}`, organization_id: org, supplier_id: supplier.id, source_id: source.id, type: "catalog", url: null, status: "not_connected", last_successful_sync_at: null, last_record_count: null, ...patch };
    feeds.push(feed);
  } else Object.assign(feed, patch);
  return { data: [{ supplier_id: supplier.id, supplier_name: supplier.name, source_id: source.id, feed_id: feed.id, supplier_created: created }], error: null };
};
